package handlers

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/httpx"
	"temart/internal/middleware"
)

// unlinkedDoctorSentinel is used as a doctor_id filter when a "doctor" role
// user has no linked doctor profile yet, so queries scoped to it return zero
// rows instead of accidentally seeing everything.
const unlinkedDoctorSentinel = -1

// doctorScope reports whether the current request must be scoped to a single
// doctor's own patients/appointments, and if so, which doctor ID to scope to.
// Only the "doctor" role is scoped; owner/admin see everything.
func (h *Handlers) doctorScope(ctx context.Context) (doctorID pgtype.Int8, scoped bool) {
	if middleware.Role(ctx) != "doctor" {
		return pgtype.Int8{}, false
	}
	userID, ok := middleware.UserID(ctx)
	if !ok {
		return pgtype.Int8{Int64: unlinkedDoctorSentinel, Valid: true}, true
	}
	d, err := h.q.GetDoctorByUserID(ctx, pgtype.Int8{Int64: userID, Valid: true})
	if err != nil {
		return pgtype.Int8{Int64: unlinkedDoctorSentinel, Valid: true}, true
	}
	return pgtype.Int8{Int64: d.ID, Valid: true}, true
}

// checkPatientAccess returns a 404 error if the current request is scoped to
// a doctor who has no appointment with the given patient. Owner/admin always
// pass. Returning 404 (rather than 403) avoids confirming the patient exists.
func (h *Handlers) checkPatientAccess(ctx context.Context, patientID int64) error {
	scope, scoped := h.doctorScope(ctx)
	if !scoped {
		return nil
	}
	belongs, err := h.q.PatientBelongsToDoctor(ctx, patientID, scope.Int64)
	if err != nil {
		return err
	}
	if !belongs {
		return httpx.NewError(http.StatusNotFound, "пациент не найден")
	}
	return nil
}

// requireOwner returns a 403 error unless the current request is from the
// "owner" role. Used to gate system user account management, which the
// "admin" (manager) role doesn't get even though it shares most of the
// owner's other permissions.
func (h *Handlers) requireOwner(ctx context.Context) error {
	if middleware.Role(ctx) != "owner" {
		return httpx.NewError(http.StatusForbidden, "недостаточно прав")
	}
	return nil
}
