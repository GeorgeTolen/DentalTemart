package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
	"temart/internal/service"
)

var validStatuses = map[string]bool{
	"scheduled": true,
	"completed": true,
	"cancelled": true,
	"no_show":   true,
}

type appointmentRequest struct {
	PatientID     int64  `json:"patient_id" validate:"required"`
	DoctorID      int64  `json:"doctor_id" validate:"required"`
	StartTime     string `json:"start_time" validate:"required"`
	EndTime       string `json:"end_time" validate:"required"`
	Status        string `json:"status"`
	Diagnosis     string `json:"diagnosis"`
	Description   string `json:"description"`
	NextVisitDate string `json:"next_visit_date"`
}

// toInput parses and validates the request into a service.AppointmentInput.
func (req appointmentRequest) toInput() (service.AppointmentInput, error) {
	start, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		return service.AppointmentInput{}, httpx.NewError(http.StatusBadRequest, "некорректное время начала (ожидается RFC3339)")
	}
	end, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		return service.AppointmentInput{}, httpx.NewError(http.StatusBadRequest, "некорректное время окончания (ожидается RFC3339)")
	}
	status := req.Status
	if status == "" {
		status = "scheduled"
	}
	if !validStatuses[status] {
		return service.AppointmentInput{}, httpx.NewError(http.StatusBadRequest, "недопустимый статус")
	}
	next, err := parseDate(req.NextVisitDate)
	if err != nil {
		return service.AppointmentInput{}, err
	}
	return service.AppointmentInput{
		PatientID:     req.PatientID,
		DoctorID:      req.DoctorID,
		StartTime:     start.UTC(),
		EndTime:       end.UTC(),
		Status:        status,
		Diagnosis:     req.Diagnosis,
		Description:   req.Description,
		NextVisitDate: next,
	}, nil
}

// ListAppointments returns appointments in a time range, optionally filtered by
// doctor. Range is given either by from/to (RFC3339 or YYYY-MM-DD) or by a
// single date= day; defaults to today.
func (h *Handlers) ListAppointments(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseRange(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	doctorID, err := optionalDoctorID(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListAppointmentsInRange(r.Context(), sqlc.ListAppointmentsInRangeParams{
		From:     from,
		To:       to,
		DoctorID: doctorID,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]appointmentDTO, 0, len(rows))
	for _, a := range rows {
		out = append(out, fromRangeRow(a))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// GetAppointment returns a single appointment with patient/doctor details.
func (h *Handlers) GetAppointment(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	row, err := h.q.GetAppointment(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "запись не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, fromGetRow(row))
}

// CreateAppointment creates a new appointment (with overlap protection).
func (h *Handlers) CreateAppointment(w http.ResponseWriter, r *http.Request) {
	var req appointmentRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	in, err := req.toInput()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	userID, _ := middleware.UserID(r.Context())
	appt, err := h.appts.Create(r.Context(), in, userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.respondAppointment(w, r, http.StatusCreated, appt.ID)
}

// UpdateAppointment edits an appointment (with overlap protection).
func (h *Handlers) UpdateAppointment(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req appointmentRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	in, err := req.toInput()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	appt, err := h.appts.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "запись не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	h.respondAppointment(w, r, http.StatusOK, appt.ID)
}

// DeleteAppointment removes an appointment.
func (h *Handlers) DeleteAppointment(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeleteAppointment(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// respondAppointment re-fetches the joined row so the response includes
// patient/doctor names and colour.
func (h *Handlers) respondAppointment(w http.ResponseWriter, r *http.Request, status int, id int64) {
	row, err := h.q.GetAppointment(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, status, fromGetRow(row))
}

// parseRange resolves the requested time window. Times are normalised to UTC.
func parseRange(r *http.Request) (time.Time, time.Time, error) {
	q := r.URL.Query()
	fromRaw, toRaw, dateRaw := q.Get("from"), q.Get("to"), q.Get("date")

	if fromRaw != "" && toRaw != "" {
		from, err := parseFlexibleTime(fromRaw)
		if err != nil {
			return time.Time{}, time.Time{}, httpx.NewError(http.StatusBadRequest, "некорректный параметр from")
		}
		to, err := parseFlexibleTime(toRaw)
		if err != nil {
			return time.Time{}, time.Time{}, httpx.NewError(http.StatusBadRequest, "некорректный параметр to")
		}
		return from, to, nil
	}

	day := time.Now().UTC().Truncate(24 * time.Hour)
	if dateRaw != "" {
		d, err := parseDate(dateRaw)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		day = *d
	}
	return day, day.Add(24 * time.Hour), nil
}

// parseFlexibleTime accepts RFC3339 or a plain YYYY-MM-DD date (UTC midnight).
func parseFlexibleTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	t, err := time.ParseInLocation(dateLayout, s, time.UTC)
	if err != nil {
		return time.Time{}, err
	}
	return t, nil
}
