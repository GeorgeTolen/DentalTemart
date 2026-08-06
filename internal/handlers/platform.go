package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

// ---------------------------------------------------------------------------
// Платформенные администраторы (superadmin)
//
// Раньше суперадмин был ровно один и создавался только при первом старте из
// SUPERADMIN_* (см. db.BootstrapSuperadmin). Здесь платформа управляет своими
// администраторами сама: добавить коллегу, завести тестовую учётку, сменить
// собственный пароль — без доступа к серверу и SQL.
// ---------------------------------------------------------------------------

// platformAdminDTO is the platform-admin view (no clinic, no password hash).
type platformAdminDTO struct {
	ID        int64  `json:"id"`
	FullName  string `json:"full_name"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
	// IsSelf marks the caller's own row so the UI can label it and hide "удалить".
	IsSelf bool `json:"is_self"`
}

// ListPlatformAdmins returns all platform administrators.
func (h *Handlers) ListPlatformAdmins(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListSuperadmins(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	self, _ := middleware.UserID(r.Context())
	out := make([]platformAdminDTO, 0, len(rows))
	for _, u := range rows {
		out = append(out, platformAdminDTO{
			ID:        u.ID,
			FullName:  u.FullName,
			Email:     u.Email,
			CreatedAt: u.CreatedAt.Format(time.RFC3339),
			IsSelf:    u.ID == self,
		})
	}
	httpx.JSON(w, http.StatusOK, out)
}

type createPlatformAdminRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

// CreatePlatformAdmin adds another platform administrator (e.g. a test account).
func (h *Handlers) CreatePlatformAdmin(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	var req createPlatformAdminRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.CreateUser(r.Context(), sqlc.CreateUserParams{
		ClinicID:     pgtype.Int8{}, // NULL — платформенный уровень
		FullName:     req.FullName,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         "superadmin",
	})
	if err != nil {
		httpx.Fail(w, conflict(err, "администратор платформы с таким email уже существует"))
		return
	}
	httpx.JSON(w, http.StatusCreated, platformAdminDTO{
		ID:        user.ID,
		FullName:  user.FullName,
		Email:     user.Email,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
	})
}

type updatePlatformAdminRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	// Password is optional: blank keeps the current one.
	Password string `json:"password" validate:"omitempty,min=6"`
}

// UpdatePlatformAdmin edits another administrator's name, email and password.
func (h *Handlers) UpdatePlatformAdmin(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req updatePlatformAdminRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.UpdateSuperadmin(r.Context(), sqlc.UpdateSuperadminParams{
		ID:       id,
		FullName: req.FullName,
		Email:    req.Email,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "администратор не найден"))
			return
		}
		httpx.Fail(w, conflict(err, "администратор платформы с таким email уже существует"))
		return
	}
	if req.Password != "" {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		// Bumps token_version, so that administrator's open sessions are cut off.
		if err := h.q.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: id, PasswordHash: hash}); err != nil {
			httpx.Fail(w, err)
			return
		}
		// Changing your own password through this endpoint would invalidate the
		// current session too — refresh the cookies so the caller stays signed in.
		if self, ok := middleware.UserID(r.Context()); ok && self == id {
			fresh, err := h.q.GetUserByID(r.Context(), id)
			if err != nil {
				httpx.Fail(w, err)
				return
			}
			if err := h.setAuthCookies(w, id, 0, fresh.TokenVersion, fresh.Role); err != nil {
				httpx.Fail(w, err)
				return
			}
		}
	}
	self, _ := middleware.UserID(r.Context())
	httpx.JSON(w, http.StatusOK, platformAdminDTO{
		ID:        user.ID,
		FullName:  user.FullName,
		Email:     user.Email,
		CreatedAt: user.CreatedAt.Format(time.RFC3339),
		IsSelf:    user.ID == self,
	})
}

// DeletePlatformAdmin removes another administrator. You cannot delete your own
// account, and the platform must always keep at least one administrator —
// otherwise nobody could sign in and manage the clinics.
func (h *Handlers) DeletePlatformAdmin(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if self, ok := middleware.UserID(r.Context()); ok && self == id {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "нельзя удалить собственный аккаунт"))
		return
	}
	count, err := h.q.CountSuperadmins(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if count <= 1 {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "должен остаться хотя бы один администратор платформы"))
		return
	}
	if err := h.q.DeleteSuperadmin(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=6"`
}

// ChangeOwnPassword lets the signed-in administrator change their own password,
// confirming the current one first. New cookies are issued because the password
// change bumps token_version and would otherwise end the session.
func (h *Handlers) ChangeOwnPassword(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
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
	if err := h.setAuthCookies(w, userID, 0, fresh.TokenVersion, fresh.Role); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------------------
// Учётные записи клиник глазами платформы
//
// Типовая задача поддержки: владелец клиники забыл пароль и войти уже не может,
// поэтому сбросить его изнутри клиники некому.
// ---------------------------------------------------------------------------

// ListClinicUsers returns the staff accounts of a given clinic.
func (h *Handlers) ListClinicUsers(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.existingClinicID(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	users, err := h.q.ListUsersByClinic(r.Context(), pgtype.Int8{Int64: clinicID, Valid: true})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]userDTO, 0, len(users))
	for _, u := range users {
		out = append(out, userDTO{
			ID:       u.ID,
			FullName: u.FullName,
			Email:    u.Email,
			Role:     u.Role,
			ClinicID: clinicIDPtr(u.ClinicID),
		})
	}
	httpx.JSON(w, http.StatusOK, out)
}

type resetClinicUserPasswordRequest struct {
	Password string `json:"password" validate:"required,min=6"`
}

// ResetClinicUserPassword sets a new password for a clinic account. Their open
// sessions are cut off (token_version is bumped), so a leaked session cannot
// outlive the reset.
func (h *Handlers) ResetClinicUserPassword(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.existingClinicID(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	userID, err := idParamFromString(chi.URLParam(r, "userId"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	// Scoped lookup: an id from another clinic must not be reachable here.
	if _, err := h.q.GetClinicUser(r.Context(), sqlc.GetClinicUserParams{
		ID:       userID,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пользователь не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	var req resetClinicUserPasswordRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: userID, PasswordHash: hash}); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteClinicUserByPlatform removes a clinic staff account from the platform
// panel — useful when the clinic has no working owner login left.
func (h *Handlers) DeleteClinicUserByPlatform(w http.ResponseWriter, r *http.Request) {
	if err := h.requireSuperadmin(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.existingClinicID(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	userID, err := idParamFromString(chi.URLParam(r, "userId"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.GetClinicUser(r.Context(), sqlc.GetClinicUserParams{
		ID:       userID,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пользователь не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	// A clinic without an owner cannot be administered by anyone: keep the last one.
	if user.Role == "owner" {
		owners, err := h.q.CountClinicOwners(r.Context(), pgtype.Int8{Int64: clinicID, Valid: true})
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if owners <= 1 {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "в клинике должен остаться хотя бы один владелец"))
			return
		}
	}
	if err := h.q.DeleteClinicUser(r.Context(), sqlc.DeleteClinicUserParams{
		ID:       userID,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	}); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// existingClinicID reads the {id} path parameter and verifies the clinic exists,
// so the platform endpoints answer 404 instead of silently returning nothing.
func (h *Handlers) existingClinicID(r *http.Request) (int64, error) {
	id, err := idParam(r)
	if err != nil {
		return 0, err
	}
	if _, err := h.q.GetClinic(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, httpx.NewError(http.StatusNotFound, "клиника не найдена")
		}
		return 0, err
	}
	return id, nil
}
