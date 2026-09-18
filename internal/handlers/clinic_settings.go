package handlers

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

// ---------------------------------------------------------------------------
// Настройки собственной клиники: ссылка на онлайн-запись, 2GIS, выключатель.
// Смотреть могут все сотрудники (ссылку удобно копировать с ресепшена),
// менять — владелец.
// ---------------------------------------------------------------------------

type clinicSettingsDTO struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Address       string `json:"address"`
	Phone         string `json:"phone"`
	MapURL        string `json:"map_url"`
	OnlineBooking bool   `json:"online_booking"`
	// BookingURL — публичная ссылка, которой клиника делится с клиентами.
	BookingURL string `json:"booking_url"`
	// Реквизиты Green API (только когда провайдер greenapi). Токен наружу не
	// отдаём, только факт его наличия.
	GreenAPIInstance  string `json:"greenapi_instance"`
	HasGreenAPIToken  bool   `json:"has_greenapi_token"`
	MessengerProvider string `json:"messenger_provider"`
}

func (h *Handlers) clinicSettingsDTO(c sqlc.Clinic) clinicSettingsDTO {
	return clinicSettingsDTO{
		Name:              c.Name,
		Slug:              c.Slug,
		Address:           textVal(c.Address),
		Phone:             textVal(c.Phone),
		MapURL:            textVal(c.MapUrl),
		OnlineBooking:     c.OnlineBooking,
		BookingURL:        h.cfg.PublicBaseURL + "/book/" + c.Slug,
		GreenAPIInstance:  textVal(c.GreenapiInstance),
		HasGreenAPIToken:  c.GreenapiToken.Valid && c.GreenapiToken.String != "",
		MessengerProvider: h.cfg.MessengerProvider,
	}
}

// GetClinicSettings returns the caller's clinic settings.
func (h *Handlers) GetClinicSettings(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	c, err := h.q.GetClinic(r.Context(), clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, h.clinicSettingsDTO(c))
}

type clinicSettingsRequest struct {
	MapURL        string `json:"map_url"`
	OnlineBooking *bool  `json:"online_booking"`
	// Реквизиты Green API; пустой токен означает «не менять».
	GreenAPIInstance *string `json:"greenapi_instance"`
	GreenAPIToken    string  `json:"greenapi_token"`
}

// UpdateClinicSettings edits booking settings of the caller's clinic (owner).
func (h *Handlers) UpdateClinicSettings(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req clinicSettingsRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	mapURL := strings.TrimSpace(req.MapURL)
	if mapURL != "" {
		u, err := url.Parse(mapURL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "ссылка 2GIS должна начинаться с https://"))
			return
		}
	}
	current, err := h.q.GetClinic(r.Context(), clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	online := current.OnlineBooking
	if req.OnlineBooking != nil {
		online = *req.OnlineBooking
	}
	c, err := h.q.UpdateClinicBookingSettings(r.Context(), sqlc.UpdateClinicBookingSettingsParams{
		ID:            clinicID,
		MapUrl:        pgtype.Text{String: mapURL, Valid: mapURL != ""},
		OnlineBooking: online,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if req.GreenAPIInstance != nil || req.GreenAPIToken != "" {
		instance := textVal(current.GreenapiInstance)
		if req.GreenAPIInstance != nil {
			instance = strings.TrimSpace(*req.GreenAPIInstance)
		}
		token := textVal(current.GreenapiToken)
		if req.GreenAPIToken != "" {
			token = strings.TrimSpace(req.GreenAPIToken)
		}
		if c, err = h.q.UpdateClinicGreenAPI(r.Context(), sqlc.UpdateClinicGreenAPIParams{
			ID:               clinicID,
			GreenapiInstance: pgtype.Text{String: instance, Valid: instance != ""},
			GreenapiToken:    pgtype.Text{String: token, Valid: token != ""},
		}); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	h.logEvent(r.Context(), clinicID, eventClinicSettings, "Изменил настройки онлайн-записи")
	httpx.JSON(w, http.StatusOK, h.clinicSettingsDTO(c))
}
