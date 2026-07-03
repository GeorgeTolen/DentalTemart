// Package service holds business logic that is more than a thin DB wrapper —
// most importantly the rule that one doctor cannot have two overlapping
// appointments at the same time.
package service

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

// StatusCancelled is excluded from overlap checks.
const StatusCancelled = "cancelled"

// AppointmentService implements appointment business rules over the DB queries.
type AppointmentService struct {
	q *sqlc.Queries
}

// NewAppointmentService builds an AppointmentService.
func NewAppointmentService(q *sqlc.Queries) *AppointmentService {
	return &AppointmentService{q: q}
}

// AppointmentInput is the normalised set of fields used to create or update an
// appointment. Times are in UTC.
type AppointmentInput struct {
	ClinicID      int64
	PatientID     int64
	DoctorID      int64
	StartTime     time.Time
	EndTime       time.Time
	Status        string
	Diagnosis     string
	Description   string
	NextVisitDate *time.Time
}

// ensureNoOverlap returns a 409 error if the doctor already has an appointment
// overlapping [start, end). excludeID skips a specific appointment (used on
// update). Cancelled appointments never conflict.
func (s *AppointmentService) ensureNoOverlap(ctx context.Context, in AppointmentInput, excludeID int64) error {
	if in.Status == StatusCancelled {
		return nil
	}
	count, err := s.q.CountOverlappingAppointments(ctx, sqlc.CountOverlappingAppointmentsParams{
		ClinicID:  in.ClinicID,
		DoctorID:  in.DoctorID,
		ExcludeID: excludeID,
		StartTime: in.StartTime,
		EndTime:   in.EndTime,
	})
	if err != nil {
		return err
	}
	if count > 0 {
		return httpx.NewError(http.StatusConflict, "у врача уже есть запись на это время")
	}
	return nil
}

// ensureRefsInClinic verifies that the referenced patient and doctor both
// belong to the appointment's clinic. Without this, a clinic user could attach
// another clinic's patient/doctor to an appointment and read their data back.
func (s *AppointmentService) ensureRefsInClinic(ctx context.Context, in AppointmentInput) error {
	if _, err := s.q.GetPatient(ctx, sqlc.GetPatientParams{ID: in.PatientID, ClinicID: in.ClinicID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NewError(http.StatusBadRequest, "пациент не найден в вашей клинике")
		}
		return err
	}
	if _, err := s.q.GetDoctor(ctx, sqlc.GetDoctorParams{ID: in.DoctorID, ClinicID: in.ClinicID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NewError(http.StatusBadRequest, "врач не найден в вашей клинике")
		}
		return err
	}
	return nil
}

// Create validates and inserts a new appointment.
func (s *AppointmentService) Create(ctx context.Context, in AppointmentInput, createdBy int64) (sqlc.Appointment, error) {
	if !in.EndTime.After(in.StartTime) {
		return sqlc.Appointment{}, httpx.NewError(http.StatusBadRequest, "время окончания должно быть позже начала")
	}
	if err := s.ensureRefsInClinic(ctx, in); err != nil {
		return sqlc.Appointment{}, err
	}
	if err := s.ensureNoOverlap(ctx, in, 0); err != nil {
		return sqlc.Appointment{}, err
	}
	return s.q.CreateAppointment(ctx, sqlc.CreateAppointmentParams{
		ClinicID:      in.ClinicID,
		PatientID:     in.PatientID,
		DoctorID:      in.DoctorID,
		StartTime:     in.StartTime,
		EndTime:       in.EndTime,
		Status:        in.Status,
		Diagnosis:     text(in.Diagnosis),
		Description:   text(in.Description),
		NextVisitDate: in.NextVisitDate,
		CreatedBy:     pgtype.Int8{Int64: createdBy, Valid: createdBy != 0},
	})
}

// Update validates and updates an existing appointment.
func (s *AppointmentService) Update(ctx context.Context, id int64, in AppointmentInput) (sqlc.Appointment, error) {
	if !in.EndTime.After(in.StartTime) {
		return sqlc.Appointment{}, httpx.NewError(http.StatusBadRequest, "время окончания должно быть позже начала")
	}
	if err := s.ensureRefsInClinic(ctx, in); err != nil {
		return sqlc.Appointment{}, err
	}
	if err := s.ensureNoOverlap(ctx, in, id); err != nil {
		return sqlc.Appointment{}, err
	}
	return s.q.UpdateAppointment(ctx, sqlc.UpdateAppointmentParams{
		ID:            id,
		PatientID:     in.PatientID,
		DoctorID:      in.DoctorID,
		StartTime:     in.StartTime,
		EndTime:       in.EndTime,
		Status:        in.Status,
		Diagnosis:     text(in.Diagnosis),
		Description:   text(in.Description),
		NextVisitDate: in.NextVisitDate,
		ClinicID:      in.ClinicID,
	})
}

// text wraps a Go string into a pgtype.Text, treating "" as a non-NULL empty
// string (we keep it simple: empty means empty, not NULL).
func text(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}
