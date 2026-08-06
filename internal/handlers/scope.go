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

// frozenMessage is what a clinic user sees when the paid/trial access expires.
const frozenMessage = "Ваш пробный период истёк. Хотите продлить? Напишите нам в WhatsApp: +7 777 910 99 65 или на почту tolenn.olzhas@gmail.com"

// RequireClinicAccess blocks clinic users whose clinic access has expired
// (пробный период кончился, оплата не поступила). Вход и /me остаются
// доступными — фронт показывает экран «пробный период истёк»; все рабочие
// эндпоинты отвечают 403. Суперадмина (в т.ч. режим поддержки) не трогаем.
func (h *Handlers) RequireClinicAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if middleware.Role(r.Context()) == "superadmin" {
			next.ServeHTTP(w, r)
			return
		}
		clinicID, ok := middleware.ClinicID(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		clinic, err := h.q.GetClinic(r.Context(), clinicID)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		if clinicFrozen(clinic.AccessExpiresAt) {
			httpx.Fail(w, httpx.NewError(http.StatusForbidden, frozenMessage))
			return
		}
		next.ServeHTTP(w, r)
	})
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
// by the caller. The patient directory is shared across the platform, so any
// clinic user — including a doctor — may open any existing card: врач должен
// видеть историю пациента, даже если тот лечился у коллеги или в другой клинике.
// Изменять карточку при этом может только заведшая её клиника
// (см. requireOwnPatient).
func (h *Handlers) checkPatientAccess(ctx context.Context, patientID int64) error {
	if _, ok := middleware.ClinicID(ctx); !ok {
		return httpx.NewError(http.StatusForbidden, "нет доступа к данным клиники")
	}
	if _, err := h.q.GetPatient(ctx, patientID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NewError(http.StatusNotFound, "пациент не найден")
		}
		return err
	}
	return nil
}
