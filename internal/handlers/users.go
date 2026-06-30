package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
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

var validRoles = map[string]bool{
	"owner": true,
	"admin": true,
	"doctor": true,
}

// ListUsers returns all system users (excluding password hashes). Only the
// owner role manages user accounts.
func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	users, err := h.q.ListUsers(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, users)
}

// CreateUser registers a new system user.
func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
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
	if !validRoles[req.Role] {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимая роль"))
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	user, err := h.q.CreateUser(r.Context(), sqlc.CreateUserParams{
		FullName:     req.FullName,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, userDTO{
		ID:       user.ID,
		FullName: user.FullName,
		Email:    user.Email,
		Role:     user.Role,
	})
}

// UpdateUser edits an existing user's name, email, and role.
func (h *Handlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
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
	if !validRoles[req.Role] {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимая роль"))
		return
	}
	user, err := h.q.UpdateUser(r.Context(), sqlc.UpdateUserParams{
		ID:       id,
		FullName: req.FullName,
		Email:    req.Email,
		Role:     req.Role,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пользователь не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	if req.Password != "" {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if err := h.q.UpdateUserPassword(r.Context(), id, hash); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	httpx.JSON(w, http.StatusOK, userDTO{
		ID:       user.ID,
		FullName: user.FullName,
		Email:    user.Email,
		Role:     user.Role,
	})
}

// DeleteUser removes a user.
func (h *Handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := h.requireOwner(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeleteUser(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
