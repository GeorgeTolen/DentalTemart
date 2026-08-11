package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

type doctorRequest struct {
	FullName       string `json:"full_name" validate:"required"`
	Specialization string `json:"specialization"`
	Phone          string `json:"phone"`
	Color          string `json:"color"`
	IsActive       *bool  `json:"is_active"`
	UserID         *int64 `json:"user_id"`
	// AccountEmail+AccountPassword create (or attach) a login for the doctor in
	// the same request, so the admin sets everything up in one window.
	AccountEmail    string `json:"account_email" validate:"omitempty,email"`
	AccountPassword string `json:"account_password" validate:"omitempty,min=6"`
}

// normalize приводит ФИО и телефон к единому виду до валидации.
func (req *doctorRequest) normalize() {
	req.FullName = normalizeName(req.FullName)
	req.Phone = normalizePhone(req.Phone)
}

func (req doctorRequest) color() string {
	if req.Color == "" {
		return "#3B82F6"
	}
	return req.Color
}

func (req doctorRequest) active() bool {
	return req.IsActive == nil || *req.IsActive
}

func (req doctorRequest) userID() pgtype.Int8 {
	if req.UserID == nil || *req.UserID <= 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *req.UserID, Valid: true}
}

// validateLinkedUser rejects linking a doctor profile to a user that is not a
// doctor-role account of the caller's clinic (prevents cross-clinic linkage).
func (h *Handlers) validateLinkedUser(r *http.Request, uid pgtype.Int8, clinicID int64) error {
	if !uid.Valid {
		return nil
	}
	ok, err := h.q.DoctorUserInClinic(r.Context(), sqlc.DoctorUserInClinicParams{
		ID:       uid.Int64,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	})
	if err != nil {
		return err
	}
	if !ok {
		return httpx.NewError(http.StatusBadRequest, "выбранный аккаунт недоступен для привязки")
	}
	return nil
}

// checkDoctorColor rejects a calendar colour already used by another doctor of
// the clinic — colours are unique so doctors are distinguishable at a glance.
func (h *Handlers) checkDoctorColor(r *http.Request, clinicID int64, color string, excludeID int64) error {
	taken, err := h.q.DoctorColorTaken(r.Context(), sqlc.DoctorColorTakenParams{
		ClinicID: clinicID,
		Color:    color,
		ID:       excludeID,
	})
	if err != nil {
		return err
	}
	if taken {
		return httpx.NewError(http.StatusConflict, "этот цвет уже занят другим врачом, выберите другой")
	}
	return nil
}

// ListDoctors returns all doctors of the caller's clinic.
func (h *Handlers) ListDoctors(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	doctors, err := h.q.ListDoctors(r.Context(), clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]doctorDTO, 0, len(doctors))
	for _, d := range doctors {
		out = append(out, fromDoctorListRow(d))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// CreateDoctor adds a new doctor to the caller's clinic.
func (h *Handlers) CreateDoctor(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req doctorRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	req.normalize()
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkDoctorColor(r, clinicID, req.color(), 0); err != nil {
		httpx.Fail(w, err)
		return
	}

	// One-window flow: the admin can create the doctor's login together with
	// the profile. Otherwise an existing unlinked account can be selected.
	userID := req.userID()
	if req.AccountEmail != "" {
		if req.AccountPassword == "" {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите пароль для аккаунта врача (минимум 6 символов)"))
			return
		}
		hash, err := auth.HashPassword(req.AccountPassword)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		tx, err := h.pool.Begin(r.Context())
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		defer tx.Rollback(r.Context())
		qtx := h.q.WithTx(tx)

		u, err := qtx.CreateUser(r.Context(), sqlc.CreateUserParams{
			ClinicID:     pgtype.Int8{Int64: clinicID, Valid: true},
			FullName:     req.FullName,
			Email:        req.AccountEmail,
			PasswordHash: hash,
			Role:         "doctor",
		})
		if err != nil {
			httpx.Fail(w, emailConflict(err))
			return
		}
		d, err := qtx.CreateDoctor(r.Context(), sqlc.CreateDoctorParams{
			ClinicID:       clinicID,
			FullName:       req.FullName,
			Specialization: pgtype.Text{String: req.Specialization, Valid: true},
			Phone:          pgtype.Text{String: req.Phone, Valid: true},
			Color:          req.color(),
			IsActive:       req.active(),
			UserID:         pgtype.Int8{Int64: u.ID, Valid: true},
		})
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			httpx.Fail(w, err)
			return
		}
		dto := toDoctorDTO(d)
		dto.UserEmail = u.Email
		httpx.JSON(w, http.StatusCreated, dto)
		return
	}

	if err := h.validateLinkedUser(r, userID, clinicID); err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.CreateDoctor(r.Context(), sqlc.CreateDoctorParams{
		ClinicID:       clinicID,
		FullName:       req.FullName,
		Specialization: pgtype.Text{String: req.Specialization, Valid: true},
		Phone:          pgtype.Text{String: req.Phone, Valid: true},
		Color:          req.color(),
		IsActive:       req.active(),
		UserID:         userID,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventDoctorCreate, "Добавил врача: "+d.FullName)
	httpx.JSON(w, http.StatusCreated, toDoctorDTO(d))
}

// UpdateDoctor edits an existing doctor within the caller's clinic.
func (h *Handlers) UpdateDoctor(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req doctorRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	req.normalize()
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	existing, err := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: id, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "врач не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	// Uniqueness is enforced when the colour CHANGES; a doctor keeping their
	// current colour is never blocked (legacy data may contain duplicates).
	if req.color() != existing.Color {
		if err := h.checkDoctorColor(r, clinicID, req.color(), id); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	userID := req.userID()
	if err := h.validateLinkedUser(r, userID, clinicID); err != nil {
		httpx.Fail(w, err)
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.q.WithTx(tx)

	newEmail := ""
	if req.AccountEmail != "" && !existing.UserID.Valid && !userID.Valid {
		// Attach a brand-new login to a doctor that had none.
		if req.AccountPassword == "" {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите пароль для аккаунта врача (минимум 6 символов)"))
			return
		}
		hash, err := auth.HashPassword(req.AccountPassword)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		u, err := qtx.CreateUser(r.Context(), sqlc.CreateUserParams{
			ClinicID:     pgtype.Int8{Int64: clinicID, Valid: true},
			FullName:     req.FullName,
			Email:        req.AccountEmail,
			PasswordHash: hash,
			Role:         "doctor",
		})
		if err != nil {
			httpx.Fail(w, emailConflict(err))
			return
		}
		userID = pgtype.Int8{Int64: u.ID, Valid: true}
		newEmail = u.Email
	} else if req.AccountPassword != "" {
		// Reset the password of the already-linked account. If no user_id was
		// sent, keep the current link (don't unlink as a side effect of reset).
		target := userID
		if !target.Valid {
			target = existing.UserID
			userID = existing.UserID
		}
		if target.Valid {
			hash, err := auth.HashPassword(req.AccountPassword)
			if err != nil {
				httpx.Fail(w, err)
				return
			}
			if err := qtx.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: target.Int64, PasswordHash: hash}); err != nil {
				httpx.Fail(w, err)
				return
			}
		}
	}

	d, err := qtx.UpdateDoctor(r.Context(), sqlc.UpdateDoctorParams{
		ID:             id,
		FullName:       req.FullName,
		Specialization: pgtype.Text{String: req.Specialization, Valid: true},
		Phone:          pgtype.Text{String: req.Phone, Valid: true},
		Color:          req.color(),
		IsActive:       req.active(),
		UserID:         userID,
		ClinicID:       clinicID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "врач не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	dto := toDoctorDTO(d)
	dto.UserEmail = newEmail
	httpx.JSON(w, http.StatusOK, dto)
}

// GetMyDoctorProfile returns the doctor profile linked to the logged-in user
// (for the doctor's personal cabinet).
func (h *Handlers) GetMyDoctorProfile(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
		return
	}
	d, err := h.q.GetDoctorByUserID(r.Context(), sqlc.GetDoctorByUserIDParams{
		UserID:   pgtype.Int8{Int64: userID, Valid: true},
		ClinicID: clinicID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "профиль врача не привязан к этому аккаунту"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	dto := toDoctorDTO(d)
	// Рейтинг в общем виде считается только в списке врачей; для кабинета
	// добираем его отдельным запросом.
	if rate, err := h.q.GetDoctorRating(r.Context(), d.ID); err == nil {
		dto.RatingAvg = rate.RatingAvg
		dto.RatingCount = rate.RatingCount
	}
	httpx.JSON(w, http.StatusOK, dto)
}

type doctorProfileRequest struct {
	Specialization  string `json:"specialization"`
	Phone           string `json:"phone"`
	BirthDate       string `json:"birth_date"`
	ExperienceYears int32  `json:"experience_years"`
	Bio             string `json:"bio"`
	Skills          string `json:"skills"`
	Education       string `json:"education"`
}

// UpdateDoctorProfile edits the doctor's own profile card: направление, стаж,
// опыт, навыки, образование, дата рождения. Врач правит свой профиль сам; ФИО,
// цвет в календаре, активность и привязку к учётной записи по-прежнему меняет
// только владелец — иначе врач мог бы «спрятаться» из расписания.
func (h *Handlers) UpdateDoctorProfile(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	doctor, err := h.resolveProfileTarget(r, clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req doctorProfileRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	req.Phone = normalizePhone(req.Phone)
	if req.ExperienceYears < 0 || req.ExperienceYears > 80 {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "стаж должен быть от 0 до 80 лет"))
		return
	}
	birth, err := parseDate(req.BirthDate)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := validateBirthDate(birth); err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.UpdateDoctorProfile(r.Context(), sqlc.UpdateDoctorProfileParams{
		ID:              doctor.ID,
		ClinicID:        clinicID,
		Specialization:  optText(req.Specialization),
		Phone:           optText(req.Phone),
		BirthDate:       birth,
		ExperienceYears: req.ExperienceYears,
		Bio:             optText(req.Bio),
		Skills:          optText(req.Skills),
		Education:       optText(req.Education),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "врач не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventDoctorUpdate, "Изменил профиль врача: "+d.FullName)
	httpx.JSON(w, http.StatusOK, toDoctorDTO(d))
}

// resolveProfileTarget returns the doctor whose profile is being edited: for the
// "doctor" role it is always their own profile (the {id} in the URL is ignored,
// so a doctor cannot edit a colleague), for a manager it is the requested one.
func (h *Handlers) resolveProfileTarget(r *http.Request, clinicID int64) (sqlc.Doctor, error) {
	if middleware.Role(r.Context()) == "doctor" {
		userID, ok := middleware.UserID(r.Context())
		if !ok {
			return sqlc.Doctor{}, httpx.NewError(http.StatusUnauthorized, "требуется авторизация")
		}
		d, err := h.q.GetDoctorByUserID(r.Context(), sqlc.GetDoctorByUserIDParams{
			UserID:   pgtype.Int8{Int64: userID, Valid: true},
			ClinicID: clinicID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return sqlc.Doctor{}, httpx.NewError(http.StatusNotFound, "профиль врача не привязан к этому аккаунту")
			}
			return sqlc.Doctor{}, err
		}
		return d, nil
	}
	if err := h.requireManager(r.Context()); err != nil {
		return sqlc.Doctor{}, err
	}
	id, err := idParam(r)
	if err != nil {
		return sqlc.Doctor{}, err
	}
	d, err := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: id, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Doctor{}, httpx.NewError(http.StatusNotFound, "врач не найден")
		}
		return sqlc.Doctor{}, err
	}
	return d, nil
}

// ListUnlinkedDoctorUsers returns clinic users with the doctor role that are not
// yet linked to a doctor profile (used to populate the "link account" selector).
// The optional exclude_doctor_id query param keeps a doctor's current link
// selectable while editing.
func (h *Handlers) ListUnlinkedDoctorUsers(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var excludeID int64
	if raw := r.URL.Query().Get("exclude_doctor_id"); raw != "" {
		id, err := idParamFromString(raw)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		excludeID = id
	}
	rows, err := h.q.ListUnlinkedDoctorUsers(r.Context(), sqlc.ListUnlinkedDoctorUsersParams{
		ClinicID:        pgtype.Int8{Int64: clinicID, Valid: true},
		ExcludeDoctorID: excludeID,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

// DeleteDoctor removes a doctor and everything cascading from them (their
// appointments and schedule). This is why the "can't delete" error is gone.
func (h *Handlers) DeleteDoctor(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	name := "#" + itoa(id)
	if d, gerr := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: id, ClinicID: clinicID}); gerr == nil {
		name = d.FullName
	}
	if err := h.q.DeleteDoctor(r.Context(), sqlc.DeleteDoctorParams{ID: id, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventDoctorDelete, "Удалил врача: "+name)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Schedule ---

type scheduleEntry struct {
	Weekday   int16  `json:"weekday" validate:"required,min=1,max=7"`
	StartTime string `json:"start_time" validate:"required"`
	EndTime   string `json:"end_time" validate:"required"`
}

type scheduleDTO struct {
	Weekday   int16  `json:"weekday"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

// requireDoctorInClinic returns a 404 if the doctor is not in the caller's clinic.
func (h *Handlers) requireDoctorInClinic(r *http.Request, doctorID, clinicID int64) error {
	_, err := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: doctorID, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NewError(http.StatusNotFound, "врач не найден")
		}
		return err
	}
	return nil
}

// GetSchedule returns a doctor's weekly working hours.
func (h *Handlers) GetSchedule(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListDoctorSchedules(r.Context(), sqlc.ListDoctorSchedulesParams{DoctorID: id, ClinicID: clinicID})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]scheduleDTO, 0, len(rows))
	for _, s := range rows {
		out = append(out, scheduleDTO{Weekday: s.Weekday, StartTime: s.StartTime, EndTime: s.EndTime})
	}
	httpx.JSON(w, http.StatusOK, out)
}

// PutSchedule replaces a doctor's whole weekly schedule transactionally.
func (h *Handlers) PutSchedule(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.requireDoctorInClinic(r, id, clinicID); err != nil {
		httpx.Fail(w, err)
		return
	}
	var req []scheduleEntry
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	for _, e := range req {
		if err := h.validateStruct(e); err != nil {
			httpx.Fail(w, err)
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

	if err := qtx.DeleteDoctorSchedules(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	for _, e := range req {
		if _, err := qtx.CreateDoctorSchedule(r.Context(), sqlc.CreateDoctorScheduleParams{
			DoctorID:  id,
			Weekday:   e.Weekday,
			StartTime: e.StartTime,
			EndTime:   e.EndTime,
		}); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.GetSchedule(w, r)
}
