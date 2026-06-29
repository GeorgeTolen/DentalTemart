package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"temart/internal/auth"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type userDTO struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

// Login authenticates by email+password and sets httpOnly auth cookies.
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}

	user, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "неверный email или пароль"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "неверный email или пароль"))
		return
	}

	if err := h.setAuthCookies(w, user.ID, user.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, userDTO{ID: user.ID, FullName: user.FullName, Email: user.Email, Role: user.Role})
}

// Logout clears the auth cookies.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearCookie(w, middleware.AccessCookie)
	h.clearCookie(w, middleware.RefreshCookie)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Refresh issues new tokens from a valid refresh cookie.
func (h *Handlers) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(middleware.RefreshCookie)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
		return
	}
	claims, err := h.tokens.Verify(cookie.Value)
	if err != nil || claims.Typ != auth.TokenRefresh {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
		return
	}
	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
		return
	}
	if err := h.setAuthCookies(w, userID, claims.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Me returns the currently authenticated user.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
		return
	}
	user, err := h.q.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, userDTO{ID: user.ID, FullName: user.FullName, Email: user.Email, Role: user.Role})
}
