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
	return idParamFromString(chi.URLParam(r, "id"))
}

// idParamFromString parses an arbitrary string as a positive int64 identifier.
func idParamFromString(raw string) (int64, error) {
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

// sortParam reads the ?sort= list order. Допустимые значения перечисляет
// вызывающий; первое из них — значение по умолчанию, оно же ответ на мусор в
// параметре (сортировка не тот случай, где стоит ронять запрос ошибкой).
func sortParam(r *http.Request, allowed ...string) string {
	raw := r.URL.Query().Get("sort")
	for _, a := range allowed {
		if raw == a {
			return raw
		}
	}
	return allowed[0]
}

// maxAge is the oldest plausible age for a birth date.
const maxAge = 125

// validateBirthDate rejects birth dates in the future or implying an age over
// maxAge years.
func validateBirthDate(t *time.Time) error {
	if t == nil {
		return nil
	}
	now := time.Now().UTC()
	if t.After(now) {
		return httpx.NewError(http.StatusBadRequest, "дата рождения не может быть в будущем")
	}
	if t.Before(now.AddDate(-maxAge, 0, 0)) {
		return httpx.NewError(http.StatusBadRequest, "возраст не может превышать 125 лет")
	}
	return nil
}

// validateAppointmentStart rejects appointments scheduled more than a year out.
func validateAppointmentStart(t time.Time) error {
	if t.After(time.Now().UTC().AddDate(1, 0, 0)) {
		return httpx.NewError(http.StatusBadRequest, "запись нельзя создать более чем на 1 год вперёд")
	}
	return nil
}
