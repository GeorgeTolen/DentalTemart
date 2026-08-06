package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

type createUserRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
	Role     string `json:"role" validate:"required"`
}

type updateUserRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
	Role     string `json:"role" validate:"required"`
	// Password is optional: when blank, the existing password is kept.
	Password string `json:"password" validate:"omitempty,min=6"`
}

// validClinicRoles are the roles a clinic owner may assign. "superadmin" is a
// platform-level role and can never be created from inside a clinic.
var validClinicRoles = map[string]bool{
	"owner":  true,
	"admin":  true,
	"doctor": true,
}

func clinicIDPtr(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	id := v.Int64
	return &id
}

// ListUsers returns the clinic's users (excluding password hashes). Only the
// clinic owner manages user accounts.
func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
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

// CreateUser registers a new user inside the owner's clinic.
func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req createUserRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if !validClinicRoles[req.Role] {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимая роль"))
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.CreateUser(r.Context(), sqlc.CreateUserParams{
		ClinicID:     pgtype.Int8{Int64: clinicID, Valid: true},
		FullName:     req.FullName,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
	})
	if err != nil {
		httpx.Fail(w, emailConflict(err))
		return
	}
	h.logEvent(r.Context(), clinicID, eventUserCreate, "Создал учётную запись: "+user.FullName+" ("+user.Email+")")
	httpx.JSON(w, http.StatusCreated, userDTO{
		ID:       user.ID,
		FullName: user.FullName,
		Email:    user.Email,
		Role:     user.Role,
		ClinicID: clinicIDPtr(user.ClinicID),
	})
}

// UpdateUser edits a clinic user's name, email, role and (optionally) password.
func (h *Handlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
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
	var req updateUserRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if !validClinicRoles[req.Role] {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимая роль"))
		return
	}
	user, err := h.q.UpdateUser(r.Context(), sqlc.UpdateUserParams{
		ID:       id,
		FullName: req.FullName,
		Email:    req.Email,
		Role:     req.Role,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пользователь не найден"))
			return
		}
		httpx.Fail(w, emailConflict(err))
		return
	}
	if req.Password != "" {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := h.q.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: id, PasswordHash: hash}); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	h.logEvent(r.Context(), clinicID, eventUserUpdate, "Изменил учётную запись: "+user.FullName+" ("+user.Email+")")
	httpx.JSON(w, http.StatusOK, userDTO{
		ID:       user.ID,
		FullName: user.FullName,
		Email:    user.Email,
		Role:     user.Role,
		ClinicID: clinicIDPtr(user.ClinicID),
	})
}

// DeleteUser removes a clinic user. An owner cannot delete their own account.
func (h *Handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
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
	if uid, ok := middleware.UserID(r.Context()); ok && uid == id {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "нельзя удалить собственный аккаунт"))
		return
	}
	name := "#" + itoa(id)
	if u, gerr := h.q.GetClinicUser(r.Context(), sqlc.GetClinicUserParams{
		ID:       id,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	}); gerr == nil {
		name = u.FullName + " (" + u.Email + ")"
	}
	if err := h.q.DeleteClinicUser(r.Context(), sqlc.DeleteClinicUserParams{
		ID:       id,
		ClinicID: pgtype.Int8{Int64: clinicID, Valid: true},
	}); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventUserDelete, "Удалил учётную запись: "+name)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
