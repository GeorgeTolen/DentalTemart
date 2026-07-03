package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

// unlinkedDoctorSentinel is used as a doctor_id filter when a "doctor" role
// user has no linked doctor profile yet, so queries scoped to it return zero
// rows instead of accidentally seeing everything.
const unlinkedDoctorSentinel = -1

// clinicID returns the caller's clinic id. All clinic-scoped handlers require
// it. The platform superadmin has no clinic (and must use the platform
// endpoints instead), so they get a 403 here.
func (h *Handlers) clinicID(ctx context.Context) (int64, error) {
	id, ok := middleware.ClinicID(ctx)
	if !ok {
		return 0, httpx.NewError(http.StatusForbidden, "нет доступа к данным клиники")
	}
	return id, nil
}

// requireSuperadmin returns a 403 unless the caller is the platform superadmin.
func (h *Handlers) requireSuperadmin(ctx context.Context) error {
	if middleware.Role(ctx) != "superadmin" {
		return httpx.NewError(http.StatusForbidden, "требуются права администратора платформы")
	}
	return nil
}

// requireOwner returns a 403 unless the caller is the clinic owner. Used to gate
// clinic user-account management, which the "admin" (manager) role doesn't get.
func (h *Handlers) requireOwner(ctx context.Context) error {
	if middleware.Role(ctx) != "owner" {
		return httpx.NewError(http.StatusForbidden, "недостаточно прав")
	}
	return nil
}

// requireManager returns a 403 unless the caller is a clinic owner or manager.
// Doctors must not manage clinic-wide resources (doctors, other accounts).
func (h *Handlers) requireManager(ctx context.Context) error {
	role := middleware.Role(ctx)
	if role != "owner" && role != "admin" {
		return httpx.NewError(http.StatusForbidden, "недостаточно прав")
	}
	return nil
}

// doctorScope reports whether the current request must be scoped to a single
// doctor's own patients/appointments, and if so, which doctor ID to scope to.
// Only the "doctor" role is scoped; owner/admin see the whole clinic.
func (h *Handlers) doctorScope(ctx context.Context) (doctorID pgtype.Int8, scoped bool) {
	if middleware.Role(ctx) != "doctor" {
		return pgtype.Int8{}, false
	}
	userID, ok := middleware.UserID(ctx)
	clinicID, cok := middleware.ClinicID(ctx)
	if !ok || !cok {
		return pgtype.Int8{Int64: unlinkedDoctorSentinel, Valid: true}, true
	}
	d, err := h.q.GetDoctorByUserID(ctx, sqlc.GetDoctorByUserIDParams{
		UserID:   pgtype.Int8{Int64: userID, Valid: true},
		ClinicID: clinicID,
	})
	if err != nil {
		return pgtype.Int8{Int64: unlinkedDoctorSentinel, Valid: true}, true
	}
	return pgtype.Int8{Int64: d.ID, Valid: true}, true
}

// checkPatientAccess returns a 404 error if the given patient is not reachable
// by the caller: the patient must belong to the caller's clinic (all roles),
// and a "doctor" role user must additionally have an appointment with them.
// Returning 404 (rather than 403) avoids confirming the patient exists.
func (h *Handlers) checkPatientAccess(ctx context.Context, patientID int64) error {
	clinicID, ok := middleware.ClinicID(ctx)
	if !ok {
		return httpx.NewError(http.StatusForbidden, "нет доступа к данным клиники")
	}
	if _, err := h.q.GetPatient(ctx, sqlc.GetPatientParams{ID: patientID, ClinicID: clinicID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NewError(http.StatusNotFound, "пациент не найден")
		}
		return err
	}

	scope, scoped := h.doctorScope(ctx)
	if !scoped {
		return nil
	}
	belongs, err := h.q.PatientBelongsToDoctor(ctx, sqlc.PatientBelongsToDoctorParams{
		PatientID: patientID,
		DoctorID:  scope.Int64,
	})
	if err != nil {
		return err
	}
	if !belongs {
		return httpx.NewError(http.StatusNotFound, "пациент не найден")
	}
	return nil
}
