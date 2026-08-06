package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

// ---------------------------------------------------------------------------
// Прайс услуг клиники.
//
// Цены — целое число тенге. Прайс свой у каждой клиники; ведут его владелец и
// менеджер, врач его не видит (деньги врачу не показываем).
// ---------------------------------------------------------------------------

type serviceRequest struct {
	Name        string `json:"name" validate:"required"`
	Price       int64  `json:"price"`
	IsActive    *bool  `json:"is_active"`
	Description string `json:"description"`
}

func (req serviceRequest) active() bool {
	return req.IsActive == nil || *req.IsActive
}

func (req serviceRequest) validate() error {
	if strings.TrimSpace(req.Name) == "" {
		return httpx.NewError(http.StatusBadRequest, "укажите название услуги")
	}
	if req.Price < 0 {
		return httpx.NewError(http.StatusBadRequest, "цена не может быть отрицательной")
	}
	return nil
}

// ListServices returns the clinic's price list.
func (h *Handlers) ListServices(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListServices(r.Context(), clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]serviceDTO, 0, len(rows))
	for _, s := range rows {
		out = append(out, toServiceDTO(s))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// CreateService adds a service to the clinic's price list.
func (h *Handlers) CreateService(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req serviceRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := req.validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	s, err := h.q.CreateService(r.Context(), sqlc.CreateServiceParams{
		ClinicID:    clinicID,
		Name:        strings.TrimSpace(req.Name),
		Price:       req.Price,
		IsActive:    req.active(),
		Description: optText(strings.TrimSpace(req.Description)),
	})
	if err != nil {
		httpx.Fail(w, conflict(err, "услуга с таким названием уже есть в прайсе"))
		return
	}
	h.logEvent(r.Context(), clinicID, eventServiceCreate, "Добавил услугу в прайс: "+s.Name)
	httpx.JSON(w, http.StatusCreated, toServiceDTO(s))
}

// UpdateService edits a service. Прошлые приёмы не меняются: в них сохранён
// снимок названия и цены.
func (h *Handlers) UpdateService(w http.ResponseWriter, r *http.Request) {
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
	var req serviceRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := req.validate(); err != nil {
		httpx.Fail(w, err)
		return
	}
	s, err := h.q.UpdateService(r.Context(), sqlc.UpdateServiceParams{
		ID:          id,
		Name:        strings.TrimSpace(req.Name),
		Price:       req.Price,
		IsActive:    req.active(),
		Description: optText(strings.TrimSpace(req.Description)),
		ClinicID:    clinicID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "услуга не найдена"))
			return
		}
		httpx.Fail(w, conflict(err, "услуга с таким названием уже есть в прайсе"))
		return
	}
	h.logEvent(r.Context(), clinicID, eventServiceUpdate, "Изменил услугу в прайсе: "+s.Name)
	httpx.JSON(w, http.StatusOK, toServiceDTO(s))
}

// DeleteService removes a service from the price list. Позиции уже закрытых
// приёмов остаются: у них снимок названия и цены, а ссылка обнуляется.
func (h *Handlers) DeleteService(w http.ResponseWriter, r *http.Request) {
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
	// Название берём до удаления — иначе в журнале останется голый id.
	name := "#" + itoa(id)
	if s, gerr := h.q.GetService(r.Context(), sqlc.GetServiceParams{ID: id, ClinicID: clinicID}); gerr == nil {
		name = s.Name
	}
	if err := h.q.DeleteService(r.Context(), sqlc.DeleteServiceParams{ID: id, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventServiceDelete, "Удалил услугу из прайса: "+name)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------------------
// Услуги приёма (чек) и расчёт стоимости.
// ---------------------------------------------------------------------------

type appointmentServicesResponse struct {
	Items []appointmentServiceDTO `json:"items"`
	Total int64                   `json:"total"`
}

// ListAppointmentServices returns the appointment's services and their total.
func (h *Handlers) ListAppointmentServices(w http.ResponseWriter, r *http.Request) {
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
	rows, err := h.q.ListAppointmentServices(r.Context(), sqlc.ListAppointmentServicesParams{
		AppointmentID: id,
		ClinicID:      clinicID,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	resp := appointmentServicesResponse{Items: make([]appointmentServiceDTO, 0, len(rows))}
	for _, row := range rows {
		item := toAppointmentServiceDTO(row)
		resp.Total += item.Sum
		resp.Items = append(resp.Items, item)
	}
	httpx.JSON(w, http.StatusOK, resp)
}

type appointmentServiceItem struct {
	// ServiceID — позиция из прайса; 0 означает разовую услугу «руками».
	ServiceID int64  `json:"service_id"`
	Name      string `json:"name"`
	Price     int64  `json:"price"`
	Quantity  int32  `json:"quantity"`
	DoctorID  int64  `json:"doctor_id"`
}

type putAppointmentServicesRequest struct {
	Items []appointmentServiceItem `json:"items"`
}

// PutAppointmentServices replaces the appointment's whole service list in one
// transaction — проще и надёжнее, чем чинить расхождения при поштучном
// добавлении и удалении из UI.
func (h *Handlers) PutAppointmentServices(w http.ResponseWriter, r *http.Request) {
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
	// Приём должен существовать и быть своим: иначе можно было бы пробить услуги
	// в чужой приём.
	appt, err := h.q.GetAppointment(r.Context(), sqlc.GetAppointmentParams{ID: id, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "запись не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}

	var req putAppointmentServicesRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	for i, item := range req.Items {
		if strings.TrimSpace(item.Name) == "" {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "у услуги должно быть название"))
			return
		}
		if item.Price < 0 {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "цена не может быть отрицательной"))
			return
		}
		if item.Quantity < 1 {
			req.Items[i].Quantity = 1
		}
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.q.WithTx(tx)

	if err := qtx.DeleteAppointmentServices(r.Context(), sqlc.DeleteAppointmentServicesParams{
		AppointmentID: id,
		ClinicID:      clinicID,
	}); err != nil {
		httpx.Fail(w, err)
		return
	}

	var total int64
	for _, item := range req.Items {
		// Исполнитель по умолчанию — врач приёма: без него выработка не считается.
		doctorID := item.DoctorID
		if doctorID == 0 {
			doctorID = appt.DoctorID
		}
		if _, err := qtx.CreateAppointmentService(r.Context(), sqlc.CreateAppointmentServiceParams{
			AppointmentID: id,
			ClinicID:      clinicID,
			ServiceID:     pgtype.Int8{Int64: item.ServiceID, Valid: item.ServiceID != 0},
			DoctorID:      pgtype.Int8{Int64: doctorID, Valid: doctorID != 0},
			Name:          strings.TrimSpace(item.Name),
			Price:         item.Price,
			Quantity:      item.Quantity,
		}); err != nil {
			httpx.Fail(w, err)
			return
		}
		total += item.Price * int64(item.Quantity)
	}

	if err := tx.Commit(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventAppointmentBill,
		"Пробил услуги ("+itoa(int64(len(req.Items)))+" поз., "+itoa(total)+" ₸) в записи "+h.appointmentLabel(r, id, clinicID))
	httpx.JSON(w, http.StatusOK, map[string]int64{"total": total})
}
