package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

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
		out = append(out, toDoctorDTO(d))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// CreateDoctor adds a new doctor to the caller's clinic.
func (h *Handlers) CreateDoctor(w http.ResponseWriter, r *http.Request) {
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
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateLinkedUser(r, req.userID(), clinicID); err != nil {
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
		UserID:         req.userID(),
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, toDoctorDTO(d))
}

// UpdateDoctor edits an existing doctor within the caller's clinic.
func (h *Handlers) UpdateDoctor(w http.ResponseWriter, r *http.Request) {
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
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateLinkedUser(r, req.userID(), clinicID); err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.UpdateDoctor(r.Context(), sqlc.UpdateDoctorParams{
		ID:             id,
		FullName:       req.FullName,
		Specialization: pgtype.Text{String: req.Specialization, Valid: true},
		Phone:          pgtype.Text{String: req.Phone, Valid: true},
		Color:          req.color(),
		IsActive:       req.active(),
		UserID:         req.userID(),
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
	httpx.JSON(w, http.StatusOK, toDoctorDTO(d))
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
	httpx.JSON(w, http.StatusOK, toDoctorDTO(d))
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
	if err := h.q.DeleteDoctor(r.Context(), sqlc.DeleteDoctorParams{ID: id, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
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
