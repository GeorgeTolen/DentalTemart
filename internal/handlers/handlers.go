// Package handlers contains the HTTP handlers for the Temart API.
package handlers

import (
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5/pgxpool"

	"temart/internal/auth"
	"temart/internal/config"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
	"temart/internal/service"
)

// Handlers bundles all dependencies shared across HTTP handlers.
type Handlers struct {
	pool     *pgxpool.Pool
	q        *sqlc.Queries
	tokens   *auth.Manager
	appts    *service.AppointmentService
	validate *validator.Validate
	cfg      *config.Config
}

// New builds the Handlers value.
func New(pool *pgxpool.Pool, tokens *auth.Manager, cfg *config.Config) *Handlers {
	q := sqlc.New(pool)
	return &Handlers{
		pool:     pool,
		q:        q,
		tokens:   tokens,
		appts:    service.NewAppointmentService(q),
		validate: validator.New(validator.WithRequiredStructEnabled()),
		cfg:      cfg,
	}
}

// validateStruct runs validator and returns a 400 httpx.Error on failure.
func (h *Handlers) validateStruct(v any) error {
	if err := h.validate.Struct(v); err != nil {
		return httpx.NewError(http.StatusBadRequest, "проверьте корректность заполнения полей")
	}
	return nil
}

// setAuthCookies issues fresh access/refresh cookies for the user.
func (h *Handlers) setAuthCookies(w http.ResponseWriter, userID int64, role string) error {
	access, err := h.tokens.IssueAccess(userID, role)
	if err != nil {
		return err
	}
	refresh, err := h.tokens.IssueRefresh(userID, role)
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
