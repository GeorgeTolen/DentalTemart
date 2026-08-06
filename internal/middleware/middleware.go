// Package middleware contains HTTP middleware: request authentication, logging.
package middleware

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"log/slog"

	"temart/internal/auth"
	"temart/internal/httpx"
)

// AccessCookie is the name of the httpOnly cookie holding the access JWT.
const AccessCookie = "temart_access"

// RefreshCookie holds the refresh JWT.
const RefreshCookie = "temart_refresh"

type ctxKey int

const (
	userIDKey ctxKey = iota
	roleKey
	clinicIDKey
	supportKey
)

// SupportClinicHeader carries the clinic the platform superadmin is currently
// looking at ("режим поддержки"). It is honoured only for the superadmin role.
const SupportClinicHeader = "X-Support-Clinic-Id"

// Authenticator returns middleware that requires a valid access token cookie.
func Authenticator(tm *auth.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(AccessCookie)
			if err != nil {
				httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
				return
			}
			claims, err := tm.Verify(cookie.Value)
			if err != nil || claims.Typ != auth.TokenAccess {
				httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
				return
			}
			userID, err := strconv.ParseInt(claims.Subject, 10, 64)
			if err != nil {
				httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, roleKey, claims.Role)
			ctx = context.WithValue(ctx, clinicIDKey, claims.ClinicID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SupportScope gives the platform superadmin read-only access to one clinic's
// data, so they can help a clinic without asking for its password. The clinic is
// named by the SupportClinicHeader and the scope is honoured only for the
// superadmin role — for everyone else the header is ignored and the clinic still
// comes from their own token. Writes are refused: support looks, never edits.
func SupportScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := r.Header.Get(SupportClinicHeader)
		if raw == "" || Role(r.Context()) != "superadmin" {
			next.ServeHTTP(w, r)
			return
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "некорректный идентификатор клиники"))
			return
		}
		if r.Method != http.MethodGet {
			httpx.Fail(w, httpx.NewError(http.StatusForbidden, "режим поддержки доступен только для просмотра"))
			return
		}
		ctx := context.WithValue(r.Context(), clinicIDKey, id)
		ctx = context.WithValue(ctx, supportKey, true)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// SupportMode reports whether the request is a superadmin viewing a clinic.
func SupportMode(ctx context.Context) bool {
	on, _ := ctx.Value(supportKey).(bool)
	return on
}

// UserID returns the authenticated user's ID from the request context.
func UserID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(userIDKey).(int64)
	return id, ok
}

// Role returns the authenticated user's role from the request context.
func Role(ctx context.Context) string {
	role, _ := ctx.Value(roleKey).(string)
	return role
}

// ClinicID returns the authenticated user's clinic id and whether they belong to
// a clinic. The platform superadmin has no clinic, so ok is false for them.
func ClinicID(ctx context.Context) (int64, bool) {
	id, _ := ctx.Value(clinicIDKey).(int64)
	return id, id > 0
}

// Logger logs each request with method, path, status and duration.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"dur_ms", time.Since(start).Milliseconds(),
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
