package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

// clinicDTO is the platform-panel view of a clinic, with quick aggregate counts.
type clinicDTO struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Address      string `json:"address"`
	Phone        string `json:"phone"`
	IsActive     bool   `json:"is_active"`
	OwnerCount   int64  `json:"owner_count"`
	PatientCount int64  `json:"patient_count"`
	DoctorCount  int64  `json:"doctor_count"`
}

func toClinicDTO(c sqlc.Clinic) clinicDTO {
	return clinicDTO{
		ID:       c.ID,
		Name:     c.Name,
		Slug:     c.Slug,
		Address:  textVal(c.Address),
		Phone:    textVal(c.Phone),
		IsActive: c.IsActive,
	}
}

// publicClinicDTO is the minimal, unauthenticated view for the login picker.
type publicClinicDTO struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// ListPublicClinics returns active clinics for the login clinic picker. Public
// (no auth): only non-sensitive fields are exposed.
func (h *Handlers) ListPublicClinics(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListActiveClinics(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]publicClinicDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, publicClinicDTO{ID: c.ID, Name: c.Name, Slug: c.Slug})
	}
	httpx.JSON(w, http.StatusOK, out)
}

// ListClinics returns all clinics with counts (platform admin only).
func (h *Handlers) ListClinics(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListClinics(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]clinicDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, clinicDTO{
			ID:           c.ID,
			Name:         c.Name,
			Slug:         c.Slug,
			Address:      textVal(c.Address),
			Phone:        textVal(c.Phone),
			IsActive:     c.IsActive,
			OwnerCount:   c.OwnerCount,
			PatientCount: c.PatientCount,
			DoctorCount:  c.DoctorCount,
		})
	}
	httpx.JSON(w, http.StatusOK, out)
}

type createClinicRequest struct {
	Name     string `json:"name" validate:"required"`
	Slug     string `json:"slug"`
	Address  string `json:"address"`
	Phone    string `json:"phone"`
	IsActive *bool  `json:"is_active"`
	// Optional first owner, created together with the clinic.
	OwnerName     string `json:"owner_name"`
	OwnerEmail    string `json:"owner_email"`
	OwnerPassword string `json:"owner_password"`
}

func (req createClinicRequest) active() bool {
	return req.IsActive == nil || *req.IsActive
}

// CreateClinic creates a clinic and, optionally, its first owner account in one
// transaction (platform admin only).
func (h *Handlers) CreateClinic(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	var req createClinicRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	slug := slugify(req.Slug)
	if slug == "" {
		slug = slugify(req.Name)
	}
	if slug == "" {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите идентификатор клиники латиницей (slug)"))
		return
	}

	// Validate the optional owner before opening the transaction.
	createOwner := req.OwnerEmail != ""
	if createOwner {
		if len(req.OwnerPassword) < 6 {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "пароль владельца должен быть не короче 6 символов"))
			return
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.q.WithTx(tx)

	clinic, err := qtx.CreateClinic(r.Context(), sqlc.CreateClinicParams{
		Name:     req.Name,
		Slug:     slug,
		Address:  pgtype.Text{String: req.Address, Valid: req.Address != ""},
		Phone:    pgtype.Text{String: req.Phone, Valid: req.Phone != ""},
		IsActive: req.active(),
	})
	if err != nil {
		httpx.Fail(w, conflict(err, "клиника с таким идентификатором уже существует"))
		return
	}

	// Базовый прайс, чтобы кассой можно было пользоваться с первого дня.
	if err := qtx.SeedClinicServices(r.Context(), clinic.ID); err != nil {
		httpx.Fail(w, err)
		return
	}

	if createOwner {
		hash, err := auth.HashPassword(req.OwnerPassword)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		name := req.OwnerName
		if name == "" {
			name = "Владелец"
		}
		if _, err := qtx.CreateUser(r.Context(), sqlc.CreateUserParams{
			ClinicID:     pgtype.Int8{Int64: clinic.ID, Valid: true},
			FullName:     name,
			Email:        req.OwnerEmail,
			PasswordHash: hash,
			Role:         "owner",
		}); err != nil {
			httpx.Fail(w, emailConflict(err))
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, toClinicDTO(clinic))
}

type updateClinicRequest struct {
	Name     string `json:"name" validate:"required"`
	Slug     string `json:"slug"`
	Address  string `json:"address"`
	Phone    string `json:"phone"`
	IsActive *bool  `json:"is_active"`
}

func (req updateClinicRequest) active() bool {
	return req.IsActive == nil || *req.IsActive
}

// UpdateClinic edits a clinic (platform admin only).
func (h *Handlers) UpdateClinic(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req updateClinicRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	slug := slugify(req.Slug)
	if slug == "" {
		slug = slugify(req.Name)
	}
	if slug == "" {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите идентификатор клиники латиницей (slug)"))
		return
	}
	clinic, err := h.q.UpdateClinic(r.Context(), sqlc.UpdateClinicParams{
		ID:       id,
		Name:     req.Name,
		Slug:     slug,
		Address:  pgtype.Text{String: req.Address, Valid: req.Address != ""},
		Phone:    pgtype.Text{String: req.Phone, Valid: req.Phone != ""},
		IsActive: req.active(),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "клиника не найдена"))
			return
		}
		httpx.Fail(w, conflict(err, "клиника с таким идентификатором уже существует"))
		return
	}
	httpx.JSON(w, http.StatusOK, toClinicDTO(clinic))
}

// DeleteClinic removes a clinic and cascades all of its data (platform admin).
func (h *Handlers) DeleteClinic(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeleteClinic(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type addOwnerRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

// AddClinicOwner creates an additional owner account for an existing clinic
// (platform admin only). This is how the superadmin hands a clinic to its owner.
func (h *Handlers) AddClinicOwner(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if _, err := h.q.GetClinic(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "клиника не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	var req addOwnerRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.CreateUser(r.Context(), sqlc.CreateUserParams{
		ClinicID:     pgtype.Int8{Int64: id, Valid: true},
		FullName:     req.FullName,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         "owner",
	})
	if err != nil {
		httpx.Fail(w, emailConflict(err))
		return
	}
	uid := id
	httpx.JSON(w, http.StatusCreated, userDTO{
		ID:       user.ID,
		FullName: user.FullName,
		Email:    user.Email,
		Role:     user.Role,
		ClinicID: &uid,
	})
}

type platformStatsDTO struct {
	TotalClinics      int64 `json:"total_clinics"`
	ActiveClinics     int64 `json:"active_clinics"`
	TotalUsers        int64 `json:"total_users"`
	TotalPatients     int64 `json:"total_patients"`
	TotalDoctors      int64 `json:"total_doctors"`
	TotalAppointments int64 `json:"total_appointments"`
	// Выручка всех клиник вместе, тенге.
	TotalRevenue int64 `json:"total_revenue"`
}

// PlatformStats returns global cross-clinic statistics (platform admin only).
func (h *Handlers) PlatformStats(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	var s platformStatsDTO
	row := h.pool.QueryRow(r.Context(), `
		SELECT
			(SELECT count(*) FROM clinics)::bigint,
			(SELECT count(*) FROM clinics WHERE is_active = true)::bigint,
			(SELECT count(*) FROM users WHERE clinic_id IS NOT NULL)::bigint,
			(SELECT count(*) FROM patients)::bigint,
			(SELECT count(*) FROM doctors)::bigint,
			(SELECT count(*) FROM appointments)::bigint
	`)
	if err := row.Scan(&s.TotalClinics, &s.ActiveClinics, &s.TotalUsers, &s.TotalPatients, &s.TotalDoctors, &s.TotalAppointments); err != nil {
		httpx.Fail(w, err)
		return
	}
	revenue, err := h.q.SumPlatformRevenue(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.TotalRevenue = revenue
	httpx.JSON(w, http.StatusOK, s)
}

// slugify converts a clinic name (Latin or Cyrillic) into a url-safe short id.
func slugify(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if repl, ok := translit[r]; ok {
			b.WriteString(repl)
			prevDash = false
			continue
		}
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_':
			if !prevDash && b.Len() > 0 {
				b.WriteByte('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// translit maps Cyrillic letters to a Latin approximation for slugs.
var translit = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e", 'ё': "e",
	'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k", 'л': "l", 'м': "m",
	'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "h", 'ц': "c", 'ч': "ch", 'ш': "sh", 'щ': "sch", 'ъ': "",
	'ы': "y", 'ь': "", 'э': "e", 'ю': "yu", 'я': "ya",
}
