// Package httpx provides small helpers for writing JSON responses and a single
// consistent error format: {"error": "message"}.
package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// Error is a domain error carrying an HTTP status code and a user-facing message.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

// NewError builds an *Error.
func NewError(status int, message string) *Error {
	return &Error{Status: status, Message: message}
}

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// Fail writes an error response. If err is an *Error its status/message are used;
// otherwise a generic 500 is returned and the real error is logged.
func Fail(w http.ResponseWriter, err error) {
	var de *Error
	if errors.As(err, &de) {
		JSON(w, de.Status, map[string]string{"error": de.Message})
		return
	}
	slog.Error("internal error", "err", err)
	JSON(w, http.StatusInternalServerError, map[string]string{"error": "внутренняя ошибка сервера"})
}

// Decode reads and decodes a JSON request body into dst, rejecting unknown fields.
func Decode(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return NewError(http.StatusBadRequest, "некорректный JSON в теле запроса")
	}
	return nil
}
