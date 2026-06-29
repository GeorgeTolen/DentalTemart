package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/httpx"
)

// idParam parses the {id} URL path parameter as an int64.
func idParam(r *http.Request) (int64, error) {
	raw := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, httpx.NewError(http.StatusBadRequest, "некорректный идентификатор")
	}
	return id, nil
}

// parseDateParam parses an optional date string ("2006-01-02") into a *time.Time
// (UTC midnight). Returns nil when empty.
func parseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.ParseInLocation(dateLayout, s, time.UTC)
	if err != nil {
		return nil, httpx.NewError(http.StatusBadRequest, "некорректная дата, ожидается YYYY-MM-DD")
	}
	return &t, nil
}

// optionalDoctorID reads the optional doctor_id query parameter into pgtype.Int8.
func optionalDoctorID(r *http.Request) (pgtype.Int8, error) {
	raw := r.URL.Query().Get("doctor_id")
	if raw == "" {
		return pgtype.Int8{}, nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return pgtype.Int8{}, httpx.NewError(http.StatusBadRequest, "некорректный doctor_id")
	}
	return pgtype.Int8{Int64: id, Valid: true}, nil
}
