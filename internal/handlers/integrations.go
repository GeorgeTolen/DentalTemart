package handlers

import (
	"context"
	"net/http"
	"time"

	"temart/internal/httpx"
	"temart/internal/notify"
)

// ---------------------------------------------------------------------------
// Интеграции клиники: WhatsApp-номер (привязка по QR через наш шлюз) и
// Telegram-бот. Привязывает и отвязывает владелец; суперадмин видит статус.
// ---------------------------------------------------------------------------

func (h *Handlers) sessionStatus(ctx context.Context, clinicID int64) (notify.GatewayStatus, error) {
	if h.sessions == nil {
		return notify.GatewayStatus{Provider: h.cfg.MessengerProvider}, nil
	}
	sctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	st, err := h.sessions.Status(sctx, clinicID)
	if err != nil {
		// Шлюз недоступен — не 500, а честный статус с ошибкой.
		return notify.GatewayStatus{Provider: h.cfg.MessengerProvider, Error: "шлюз WhatsApp недоступен"}, nil
	}
	return st, nil
}

// WhatsAppStatus — состояние WhatsApp своей клиники (владелец).
func (h *Handlers) WhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	st, err := h.sessionStatus(r.Context(), clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

// WhatsAppStart запускает сессию клиники; в ответе обычно QR для привязки.
func (h *Handlers) WhatsAppStart(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if h.sessions == nil || h.cfg.MessengerProvider != "baileys" {
		httpx.Fail(w, httpx.NewError(http.StatusServiceUnavailable, "привязка по QR недоступна для текущего провайдера"))
		return
	}
	sctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	st, err := h.sessions.Start(sctx, clinicID)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusServiceUnavailable, "шлюз WhatsApp недоступен, попробуйте позже"))
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

// WhatsAppLogout отвязывает номер клиники.
func (h *Handlers) WhatsAppLogout(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if h.sessions == nil {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	sctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.sessions.Logout(sctx, clinicID); err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusServiceUnavailable, "шлюз WhatsApp недоступен, попробуйте позже"))
		return
	}
	h.logEvent(r.Context(), clinicID, eventClinicSettings, "Отвязал WhatsApp-номер клиники")
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type telegramStatusDTO struct {
	Enabled     bool   `json:"enabled"`
	BotUsername string `json:"bot_username"`
}

// TelegramStatus — включён ли Telegram-бот платформы.
func (h *Handlers) TelegramStatus(w http.ResponseWriter, r *http.Request) {
	if _, err := h.clinicID(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	dto := telegramStatusDTO{}
	if h.tg != nil {
		dto.Enabled = h.tg.Username() != ""
		dto.BotUsername = h.tg.Username()
	}
	httpx.JSON(w, http.StatusOK, dto)
}

// PlatformClinicWhatsApp — статус WhatsApp клиники для панели платформы (без QR).
func (h *Handlers) PlatformClinicWhatsApp(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	st, err := h.sessionStatus(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	st.QR = ""
	httpx.JSON(w, http.StatusOK, st)
}
