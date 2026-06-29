package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

type doctorRequest struct {
	FullName       string `json:"full_name" validate:"required"`
	Specialization string `json:"specialization"`
	Phone          string `json:"phone"`
	Color          string `json:"color"`
	IsActive       *bool  `json:"is_active"`
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
