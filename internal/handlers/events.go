package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

// ---------------------------------------------------------------------------
// Журнал действий клиники.
//
// Отвечает на вопрос «кто это сделал»: кто перенёс запись, кто удалил пациента,
// кто поднял цену в прайсе. Пишется после успешного действия — неудавшаяся
// попытка событием не считается.
// ---------------------------------------------------------------------------

// Действия журнала. Строки уходят в API, поэтому меняются только вместе с UI.
const (
	eventAppointmentCreate = "appointment.create"
	eventAppointmentUpdate = "appointment.update"
	eventAppointmentCancel = "appointment.cancel"
	eventAppointmentDelete = "appointment.delete"
	eventAppointmentBill   = "appointment.services"
	eventPatientCreate     = "patient.create"
	eventPatientUpdate     = "patient.update"
	eventPatientDelete     = "patient.delete"
	eventDoctorCreate      = "doctor.create"
	eventDoctorUpdate      = "doctor.update"
	eventDoctorDelete      = "doctor.delete"
	eventServiceCreate     = "service.create"
	eventServiceUpdate     = "service.update"
	eventServiceDelete     = "service.delete"
	eventUserCreate        = "user.create"
	eventUserUpdate        = "user.update"
	eventUserDelete        = "user.delete"
)

// eventsPageSize is how many entries one "показать ещё" adds.
const eventsPageSize = 50

// logEvent records an action in the clinic's journal. Best-effort by design:
// журнал не должен ронять само действие, поэтому ошибки только логируются.
// Вызывать после успеха операции.
func (h *Handlers) logEvent(ctx context.Context, clinicID int64, action, message string) {
	userID, _ := middleware.UserID(ctx)

	name := ""
	if userID > 0 {
		if u, err := h.q.GetUserByID(ctx, userID); err == nil {
			name = u.FullName
		}
	}
	if name == "" {
		name = "-"
	}

	if err := h.q.CreateEvent(ctx, sqlc.CreateEventParams{
		ClinicID: clinicID,
		UserID:   pgtype.Int8{Int64: userID, Valid: userID > 0},
		UserName: name,
		Action:   action,
		Message:  message,
	}); err != nil {
		slog.Error("write event", "action", action, "err", err)
	}
}

type eventDTO struct {
	ID        int64  `json:"id"`
	UserName  string `json:"user_name"`
	Action    string `json:"action"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

type eventsResponse struct {
	Items []eventDTO `json:"items"`
	// NextBefore — курсор для следующей страницы; 0 означает «больше нечего».
	NextBefore int64 `json:"next_before"`
}

// ListEvents returns the clinic's action journal, newest first. Пагинация
// курсором: ?before=<id последней показанной записи>.
func (h *Handlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var before int64
	if raw := r.URL.Query().Get("before"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
			before = v
		}
	}

	rows, err := h.q.ListEvents(r.Context(), sqlc.ListEventsParams{
		ClinicID: clinicID,
		Before:   before,
		PageSize: eventsPageSize,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	resp := eventsResponse{Items: make([]eventDTO, 0, len(rows))}
	for _, e := range rows {
		resp.Items = append(resp.Items, eventDTO{
			ID:        e.ID,
			UserName:  e.UserName,
			Action:    e.Action,
			Message:   e.Message,
			CreatedAt: e.CreatedAt.Format(time.RFC3339),
		})
	}
	// Курсор отдаём только когда страница полная — иначе это был последний экран.
	if len(rows) == eventsPageSize {
		resp.NextBefore = rows[len(rows)-1].ID
	}
	httpx.JSON(w, http.StatusOK, resp)
}
