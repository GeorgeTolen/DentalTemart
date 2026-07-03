package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"

	"temart/internal/httpx"
)

// uniqueViolation is the PostgreSQL SQLSTATE for a unique-constraint violation.
const uniqueViolation = "23505"

// isUniqueViolation reports whether err is a Postgres unique-constraint error.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == uniqueViolation
}

// conflict maps a unique-violation to a friendly 409 with the given message so
// the UI shows a clear message instead of a raw 500. Other errors pass through.
func conflict(err error, message string) error {
	if isUniqueViolation(err) {
		return httpx.NewError(http.StatusConflict, message)
	}
	return err
}

// emailConflict is conflict specialised for the duplicate-email case.
func emailConflict(err error) error {
	return conflict(err, "пользователь с таким email уже существует")
}
