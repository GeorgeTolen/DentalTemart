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

// ListDoctors returns all doctors.
func (h *Handlers) ListDoctors(w http.ResponseWriter, r *http.Request) {
	doctors, err := h.q.ListDoctors(r.Context())
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

// CreateDoctor adds a new doctor.
func (h *Handlers) CreateDoctor(w http.ResponseWriter, r *http.Request) {
	var req doctorRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.CreateDoctor(r.Context(), sqlc.CreateDoctorParams{
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

// UpdateDoctor edits an existing doctor.
func (h *Handlers) UpdateDoctor(w http.ResponseWriter, r *http.Request) {
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
	d, err := h.q.UpdateDoctor(r.Context(), sqlc.UpdateDoctorParams{
		ID:             id,
		FullName:       req.FullName,
		Specialization: pgtype.Text{String: req.Specialization, Valid: true},
		Phone:          pgtype.Text{String: req.Phone, Valid: true},
		Color:          req.color(),
		IsActive:       req.active(),
		UserID:         req.userID(),
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
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
		return
	}
	d, err := h.q.GetDoctorByUserID(r.Context(), pgtype.Int8{Int64: userID, Valid: true})
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

// ListUnlinkedDoctorUsers returns system users with the doctor role that are
// not yet linked to a doctor profile (used to populate the admin's "link
// account" selector). The optional exclude_doctor_id query param keeps a
// doctor's current link selectable while editing.
func (h *Handlers) ListUnlinkedDoctorUsers(w http.ResponseWriter, r *http.Request) {
	var excludeID int64
	if raw := r.URL.Query().Get("exclude_doctor_id"); raw != "" {
		id, err := idParamFromString(raw)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		excludeID = id
	}
	rows, err := h.q.ListUnlinkedDoctorUsers(r.Context(), excludeID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

// DeleteDoctor removes a doctor (blocked by FK if they have appointments).
func (h *Handlers) DeleteDoctor(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeleteDoctor(r.Context(), id); err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusConflict, "нельзя удалить врача с записями; сделайте его неактивным"))
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

// GetSchedule returns a doctor's weekly working hours.
func (h *Handlers) GetSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListDoctorSchedules(r.Context(), id)
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
	id, err := idParam(r)
	if err != nil {
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
