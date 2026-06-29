package db

import (
	"context"
	"fmt"
	"log/slog"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
)

// BootstrapOwner creates the initial owner account from the provided
// credentials, but only when the users table is empty. It is a no-op once any
// user exists, so it is safe to run on every start.
func BootstrapOwner(ctx context.Context, q *sqlc.Queries, name, email, password string) error {
	if email == "" || password == "" {
		return nil // bootstrap not configured
	}

	count, err := q.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash owner password: %w", err)
	}
	if name == "" {
		name = "Владелец"
	}
	if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		FullName:     name,
		Email:        email,
		PasswordHash: hash,
		Role:         "owner",
	}); err != nil {
		return fmt.Errorf("create owner: %w", err)
	}
	slog.Info("bootstrap owner created", "email", email)
	return nil
}
