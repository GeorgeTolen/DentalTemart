package handlers

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

type patientRequest struct {
	FullName  string `json:"full_name" validate:"required"`
	Phone     string `json:"phone"`
	BirthDate string `json:"birth_date"`
	Notes     string `json:"notes"`
}

// ListPatients returns patients, optionally filtered by a name/phone search.
// A "doctor" role user only sees patients who have an appointment with them.
func (h *Handlers) ListPatients(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	var arg pgtype.Text
	if search != "" {
		arg = pgtype.Text{String: search, Valid: true}
	}

	var patients []sqlc.Patient
	var err error
	if scope, scoped := h.doctorScope(r.Context()); scoped {
		patients, err = h.q.ListPatientsForDoctor(r.Context(), sqlc.ListPatientsForDoctorParams{
			DoctorID: scope.Int64,
			Search:   arg,
		})
	} else {
		patients, err = h.q.ListPatients(r.Context(), arg)
	}
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]patientDTO, 0, len(patients))
	for _, p := range patients {
		out = append(out, toPatientDTO(p))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// GetPatient returns a single patient. A "doctor" role user gets 404 for
// patients they have no appointment with.
func (h *Handlers) GetPatient(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, toPatientDTO(p))
}

// GetPatientAppointments returns the full appointment history of a patient.
func (h *Handlers) GetPatientAppointments(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListAppointmentsByPatient(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]appointmentDTO, 0, len(rows))
	for _, a := range rows {
		out = append(out, fromPatientRow(a))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// CreatePatient adds a new patient.
func (h *Handlers) CreatePatient(w http.ResponseWriter, r *http.Request) {
	var req patientRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	birth, err := parseDate(req.BirthDate)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := validateBirthDate(birth); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.CreatePatient(r.Context(), sqlc.CreatePatientParams{
		FullName:  req.FullName,
		Phone:     pgtype.Text{String: req.Phone, Valid: true},
		BirthDate: birth,
		Notes:     pgtype.Text{String: req.Notes, Valid: true},
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, toPatientDTO(p))
}

// DeletePatient removes a patient record.
func (h *Handlers) DeletePatient(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeletePatient(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// UpdatePatient edits an existing patient.
func (h *Handlers) UpdatePatient(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	var req patientRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.validateStruct(req); err != nil {
		httpx.Fail(w, err)
		return
	}
	birth, err := parseDate(req.BirthDate)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := validateBirthDate(birth); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.UpdatePatient(r.Context(), sqlc.UpdatePatientParams{
		ID:        id,
		FullName:  req.FullName,
		Phone:     pgtype.Text{String: req.Phone, Valid: true},
		BirthDate: birth,
		Notes:     pgtype.Text{String: req.Notes, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, toPatientDTO(p))
}
