package db

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/db/sqlc"
)

// BootstrapSuperadmin creates the initial platform superadmin (администратор
// платформы) from the provided credentials, but only when no superadmin exists
// yet. It is a no-op afterwards, so it is safe to run on every start.
//
// The superadmin is not attached to any clinic (clinic_id IS NULL). Clinic
// owners and staff are created later through the platform / clinic panels.
func BootstrapSuperadmin(ctx context.Context, q *sqlc.Queries, name, email, password string) error {
	if email == "" || password == "" {
		return nil // bootstrap not configured
	}

	count, err := q.CountSuperadmins(ctx)
	if err != nil {
		return fmt.Errorf("count superadmins: %w", err)
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash superadmin password: %w", err)
	}
	if name == "" {
		name = "Администратор платформы"
	}
	if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		ClinicID:     pgtype.Int8{}, // NULL — platform-level, no clinic
		FullName:     name,
		Email:        email,
		PasswordHash: hash,
		Role:         "superadmin",
	}); err != nil {
		return fmt.Errorf("create superadmin: %w", err)
	}
	slog.Info("bootstrap superadmin created", "email", email)
	return nil
}
