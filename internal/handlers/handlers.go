// Package handlers contains the HTTP handlers for the Temart API.
package handlers

import (
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5/pgxpool"

	"temart/internal/auth"
	"temart/internal/booking"
	"temart/internal/config"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
	"temart/internal/notify"
	"temart/internal/notify/telegram"
	"temart/internal/ratelimit"
	"temart/internal/service"
)

// Deps — внешние зависимости хендлеров, которые собирает main: провайдер
// WhatsApp, очередь уведомлений и (необязательно) Telegram-бот.
type Deps struct {
	Messenger notify.Messenger
	Enqueuer  *notify.Enqueuer
	// Telegram может быть nil — тогда канал выключен.
	Telegram *telegram.Bot
}

// Handlers bundles all dependencies shared across HTTP handlers.
type Handlers struct {
	pool     *pgxpool.Pool
	q        *sqlc.Queries
	tokens   *auth.Manager
	appts    *service.AppointmentService
	validate *validator.Validate
	cfg      *config.Config

	messenger notify.Messenger
	// sessions — тот же провайдер, если он умеет привязывать номера по QR.
	sessions notify.SessionManager
	enq      *notify.Enqueuer
	tg       *telegram.Bot
	booking  *booking.Service
	verifier *booking.Verifier
	limiter  *ratelimit.Limiter
}

// New builds the Handlers value.
func New(pool *pgxpool.Pool, tokens *auth.Manager, cfg *config.Config, deps Deps) *Handlers {
	q := sqlc.New(pool)
	appts := service.NewAppointmentService(q)
	if deps.Messenger == nil {
		deps.Messenger = notify.Noop{}
	}
	if deps.Enqueuer == nil {
		deps.Enqueuer = notify.NewEnqueuer(cfg.PublicBaseURL)
	}
	sessions, _ := deps.Messenger.(notify.SessionManager)
	return &Handlers{
		pool:      pool,
		q:         q,
		tokens:    tokens,
		appts:     appts,
		validate:  validator.New(validator.WithRequiredStructEnabled()),
		cfg:       cfg,
		messenger: deps.Messenger,
		sessions:  sessions,
		enq:       deps.Enqueuer,
		tg:        deps.Telegram,
		booking:   booking.New(pool, q, appts, deps.Enqueuer),
		verifier:  booking.NewVerifier(),
		limiter:   ratelimit.New(),
	}
}

// validateStruct runs validator and returns a 400 httpx.Error on failure.
func (h *Handlers) validateStruct(v any) error {
	if err := h.validate.Struct(v); err != nil {
		return httpx.NewError(http.StatusBadRequest, "проверьте корректность заполнения полей")
	}
	return nil
}

// setAuthCookies issues fresh access/refresh cookies for the user. clinicID is
// 0 for the platform superadmin. ver is the user's current token_version.
func (h *Handlers) setAuthCookies(w http.ResponseWriter, userID, clinicID int64, ver int32, role string) error {
	access, err := h.tokens.IssueAccess(userID, clinicID, ver, role)
	if err != nil {
		return err
	}
	refresh, err := h.tokens.IssueRefresh(userID, clinicID, ver, role)
	if err != nil {
		return err
	}
	h.writeCookie(w, middleware.AccessCookie, access, h.tokens.AccessTTL())
	h.writeCookie(w, middleware.RefreshCookie, refresh, h.tokens.RefreshTTL())
	return nil
}

func (h *Handlers) writeCookie(w http.ResponseWriter, name, value string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handlers) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}
