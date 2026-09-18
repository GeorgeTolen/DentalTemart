package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/notify"
	"temart/internal/service"
)

// ---------------------------------------------------------------------------
// Заявки с онлайн-записи в CRM: список, подтвердить, перенести, отклонить.
// Всё — для владельца и менеджера.
// ---------------------------------------------------------------------------

type bookingRequestsResponse struct {
	Items []appointmentDTO `json:"items"`
	Count int              `json:"count"`
}

// ListBookingRequests returns pending online booking requests.
func (h *Handlers) ListBookingRequests(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListAppointmentsByStatus(r.Context(), sqlc.ListAppointmentsByStatusParams{
		ClinicID: clinicID,
		Status:   service.StatusPending,
		Sort:     sortParam(r, "old", "new"),
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp := bookingRequestsResponse{Items: make([]appointmentDTO, 0, len(rows))}
	for _, a := range rows {
		resp.Items = append(resp.Items, fromStatusRow(a))
	}
	resp.Count = len(resp.Items)
	httpx.JSON(w, http.StatusOK, resp)
}

// loadPendingRequest возвращает заявку клиники со статусом pending.
func (h *Handlers) loadPendingRequest(r *http.Request) (sqlc.GetAppointmentRow, int64, error) {
	if err := h.requireManager(r.Context()); err != nil {
		return sqlc.GetAppointmentRow{}, 0, err
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		return sqlc.GetAppointmentRow{}, 0, err
	}
	id, err := idParam(r)
	if err != nil {
		return sqlc.GetAppointmentRow{}, 0, err
	}
	row, err := h.q.GetAppointment(r.Context(), sqlc.GetAppointmentParams{ID: id, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.GetAppointmentRow{}, 0, httpx.NewError(http.StatusNotFound, "заявка не найдена")
		}
		return sqlc.GetAppointmentRow{}, 0, err
	}
	if row.Status != service.StatusPending {
		return sqlc.GetAppointmentRow{}, 0, httpx.NewError(http.StatusConflict, "заявка уже обработана")
	}
	return row, clinicID, nil
}

// notifyAppointment ставит в очередь сообщение клиенту по записи. Записи из
// CRM без публичного токена уведомлять некого — тихо пропускаем.
func (h *Handlers) notifyAppointment(r *http.Request, q *sqlc.Queries, a sqlc.Appointment, kind notify.Kind) error {
	if !a.PublicToken.Valid || a.PublicToken.String == "" {
		return nil
	}
	row, err := q.GetAppointmentByPublicToken(r.Context(), a.PublicToken)
	if err != nil {
		return err
	}
	return h.enq.Enqueue(r.Context(), q, row, kind)
}

// setStatusAndNotify меняет статус и кладёт уведомление в одной транзакции.
func (h *Handlers) setStatusAndNotify(r *http.Request, id, clinicID int64, status string, kind notify.Kind) (sqlc.Appointment, error) {
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		return sqlc.Appointment{}, err
	}
	defer tx.Rollback(r.Context())
	qtx := h.q.WithTx(tx)

	appt, err := qtx.SetAppointmentStatus(r.Context(), sqlc.SetAppointmentStatusParams{
		ID: id, Status: status, ClinicID: clinicID,
	})
	if err != nil {
		return sqlc.Appointment{}, err
	}
	if err := h.notifyAppointment(r, qtx, appt, kind); err != nil {
		return sqlc.Appointment{}, err
	}
	return appt, tx.Commit(r.Context())
}

// ApproveBookingRequest подтверждает заявку: pending → scheduled.
func (h *Handlers) ApproveBookingRequest(w http.ResponseWriter, r *http.Request) {
	row, clinicID, err := h.loadPendingRequest(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	appt, err := h.setStatusAndNotify(r, row.ID, clinicID, service.StatusScheduled, notify.KindApproved)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventBookingApprove, "Подтвердил заявку "+h.appointmentLabel(r, appt.ID, clinicID))
	h.respondAppointment(w, r, http.StatusOK, appt.ID, clinicID)
}

type rejectRequest struct {
	Reason string `json:"reason"`
}

// RejectBookingRequest отклоняет заявку: pending → cancelled.
func (h *Handlers) RejectBookingRequest(w http.ResponseWriter, r *http.Request) {
	row, clinicID, err := h.loadPendingRequest(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req rejectRequest
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &req); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	appt, err := h.setStatusAndNotify(r, row.ID, clinicID, service.StatusCancelled, notify.KindRejected)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	msg := "Отклонил заявку " + h.appointmentLabel(r, appt.ID, clinicID)
	if req.Reason != "" {
		msg += " (" + req.Reason + ")"
	}
	h.logEvent(r.Context(), clinicID, eventBookingReject, msg)
	h.respondAppointment(w, r, http.StatusOK, appt.ID, clinicID)
}

type rescheduleRequest struct {
	DoctorID  int64  `json:"doctor_id" validate:"required"`
	StartTime string `json:"start_time" validate:"required"`
	EndTime   string `json:"end_time" validate:"required"`
}

// RescheduleBookingRequest переносит заявку на другое время/врача и сразу
// подтверждает её.
func (h *Handlers) RescheduleBookingRequest(w http.ResponseWriter, r *http.Request) {
	row, clinicID, err := h.loadPendingRequest(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req rescheduleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	start, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "некорректное время начала (ожидается RFC3339)"))
		return
	}
	end, err := time.Parse(time.RFC3339, req.EndTime)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "некорректное время окончания (ожидается RFC3339)"))
		return
	}
	if err := validateAppointmentStart(start.UTC()); err != nil {
		httpx.Fail(w, err)
		return
	}
	appt, err := h.appts.Update(r.Context(), row.ID, service.AppointmentInput{
		ClinicID:      clinicID,
		PatientID:     row.PatientID,
		DoctorID:      req.DoctorID,
		StartTime:     start.UTC(),
		EndTime:       end.UTC(),
		Status:        service.StatusScheduled,
		Diagnosis:     textVal(row.Diagnosis),
		Description:   textVal(row.Description),
		NextVisitDate: row.NextVisitDate,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	// Перенос уже сохранён; уведомление — отдельным шагом, его сбой не должен
	// отменять перенос.
	if err := h.notifyAppointment(r, h.q, appt, notify.KindRescheduled); err != nil {
		slog.Error("enqueue reschedule notification", "appointment", appt.ID, "err", err)
	}
	h.logEvent(r.Context(), clinicID, eventBookingReschedule, "Перенёс и подтвердил заявку "+h.appointmentLabel(r, appt.ID, clinicID))
	h.respondAppointment(w, r, http.StatusOK, appt.ID, clinicID)
}
