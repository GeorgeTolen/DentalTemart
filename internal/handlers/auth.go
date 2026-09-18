package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
	// ClinicID уточняет вход, когда один и тот же email с одним паролем заведён
	// в нескольких клиниках: nil — ещё не выбирали, 0 — панель платформы.
	ClinicID *int64 `json:"clinic_id"`
}

// loginChoice — одна из клиник, куда подходят введённые email и пароль.
// Показывается только самому владельцу учёток, поэтому названия не утекают.
type loginChoice struct {
	ClinicID   int64  `json:"clinic_id"`
	ClinicName string `json:"clinic_name"`
}

// loginChoicesResponse отдаётся вместо сессии, когда подходящих учёток
// несколько и надо выбрать клинику.
type loginChoicesResponse struct {
	Choose []loginChoice `json:"choose"`
}

// userDTO is the compact user shape used by the clinic user-management panel.
type userDTO struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	ClinicID *int64 `json:"clinic_id"`
}

// meDTO is the authenticated-session shape: it also carries the clinic so the
// frontend can show the clinic name and route by role.
type meDTO struct {
	ID         int64  `json:"id"`
	FullName   string `json:"full_name"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	ClinicID   *int64 `json:"clinic_id"`
	ClinicName string `json:"clinic_name"`
	ClinicSlug string `json:"clinic_slug"`
	// ClinicFrozen — срок доступа клиники истёк: интерфейс показывает экран
	// «пробный период истёк», рабочие эндпоинты отвечают 403.
	ClinicFrozen bool `json:"clinic_frozen"`
}

func (h *Handlers) meFromUser(r *http.Request, u sqlc.User) meDTO {
	dto := meDTO{ID: u.ID, FullName: u.FullName, Email: u.Email, Role: u.Role}
	if u.ClinicID.Valid {
		id := u.ClinicID.Int64
		dto.ClinicID = &id
		if c, err := h.q.GetClinic(r.Context(), id); err == nil {
			dto.ClinicName = c.Name
			dto.ClinicSlug = c.Slug
			dto.ClinicFrozen = clinicFrozen(c.AccessExpiresAt)
		}
	}
	return dto
}

// platformChoiceName — подпись панели платформы в списке выбора при входе.
const platformChoiceName = "Панель платформы"

// Login authenticates by email + password alone: клинику заранее не выбирают.
// Учётку ищем во всех клиниках и среди администраторов платформы; подходит
// та, у которой сошёлся пароль. Если таких несколько (человек заведён в двух
// клиниках с одним паролем) — отдаём список только его клиник и ждём выбор
// в следующем запросе с clinic_id.
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

	candidates, err := h.q.ListUsersByEmail(r.Context(), req.Email)
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	type match struct {
		user     sqlc.User
		clinicID int64 // 0 — панель платформы
		name     string
	}
	var matches []match
	inactive := false
	for _, u := range candidates {
		if !auth.CheckPassword(u.PasswordHash, req.Password) {
			continue
		}
		if !u.ClinicID.Valid {
			// Учётка без клиники — только администратор платформы.
			if u.Role != "superadmin" {
				continue
			}
			if req.ClinicID != nil && *req.ClinicID != 0 {
				continue
			}
			matches = append(matches, match{user: u, clinicID: 0, name: platformChoiceName})
			continue
		}
		cid := u.ClinicID.Int64
		if req.ClinicID != nil && *req.ClinicID != cid {
			continue
		}
		clinic, err := h.q.GetClinic(r.Context(), cid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			httpx.Fail(w, err)
			return
		}
		if !clinic.IsActive {
			inactive = true
			continue
		}
		matches = append(matches, match{user: u, clinicID: cid, name: clinic.Name})
	}

	switch {
	case len(matches) == 0 && inactive:
		// Пароль верный, но клинику отключили — честнее сказать это, чем
		// «неверный пароль».
		httpx.Fail(w, httpx.NewError(http.StatusForbidden, "клиника временно недоступна"))
		return
	case len(matches) == 0:
		// Одно сообщение и для «нет такого email», и для «не тот пароль»:
		// иначе по ответу можно перебирать, какие адреса заведены в системе.
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "неверный email или пароль"))
		return
	case len(matches) > 1:
		resp := loginChoicesResponse{Choose: make([]loginChoice, 0, len(matches))}
		for _, m := range matches {
			resp.Choose = append(resp.Choose, loginChoice{ClinicID: m.clinicID, ClinicName: m.name})
		}
		httpx.JSON(w, http.StatusOK, resp)
		return
	}

	m := matches[0]
	if err := h.setAuthCookies(w, m.user.ID, m.clinicID, m.user.TokenVersion, m.user.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, h.meFromUser(r, m.user))
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
	// Re-check the account still exists and (for clinic users) the clinic is
	// still active, so deactivating a clinic or deleting a user cuts off session
	// renewal instead of letting it slide indefinitely.
	user, err := h.q.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
		return
	}
	// A password change bumps token_version, so an old refresh token (e.g. from
	// a fired employee) can no longer renew the session.
	if user.TokenVersion != claims.Ver {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "сессия недействительна"))
		return
	}
	if user.ClinicID.Valid {
		clinic, err := h.q.GetClinic(r.Context(), user.ClinicID.Int64)
		if err != nil || !clinic.IsActive {
			httpx.Fail(w, httpx.NewError(http.StatusForbidden, "клиника недоступна"))
			return
		}
	}
	if err := h.setAuthCookies(w, userID, claims.ClinicID, user.TokenVersion, user.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ChangeMyPassword lets any signed-in user change their own password after
// confirming the current one. Раньше это умел только администратор платформы;
// врачу и владельцу клиники приходилось просить кого-то сбросить пароль за них.
//
// Смена пароля бампает token_version и убивает все прежние сессии — поэтому
// текущей сразу выдаём свежие куки, иначе человек выкидывался бы на логин.
func (h *Handlers) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "требуется авторизация"))
		return
	}
	var req changePasswordRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.CurrentPassword) {
		httpx.Fail(w, httpx.NewError(http.StatusUnauthorized, "текущий пароль неверен"))
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: userID, PasswordHash: hash}); err != nil {
		httpx.Fail(w, err)
		return
	}
	fresh, err := h.q.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var clinicID int64
	if fresh.ClinicID.Valid {
		clinicID = fresh.ClinicID.Int64
	}
	if err := h.setAuthCookies(w, userID, clinicID, fresh.TokenVersion, fresh.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Me returns the currently authenticated user (with clinic info).
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
	httpx.JSON(w, http.StatusOK, h.meFromUser(r, user))
}
