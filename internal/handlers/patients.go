package handlers

import (
	"errors"
	"net/http"
	"regexp"

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
	IIN       string `json:"iin"`
	Gender    string `json:"gender"` // male | female | ""
}

// iinRe matches a Kazakhstani ИИН: exactly 12 digits.
var iinRe = regexp.MustCompile(`^\d{12}$`)

var validGenders = map[string]bool{"": true, "male": true, "female": true}

// validateProfile checks the IIN/gender fields shared by create and update.
func (req patientRequest) validateProfile() error {
	if req.IIN != "" && !iinRe.MatchString(req.IIN) {
		return httpx.NewError(http.StatusBadRequest, "ИИН должен состоять из 12 цифр")
	}
	if !validGenders[req.Gender] {
		return httpx.NewError(http.StatusBadRequest, "недопустимое значение пола")
	}
	return nil
}

func optText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

// ListPatients returns the clinic's patients, optionally filtered by a
// name/phone search. A "doctor" role user only sees patients who have an
// appointment with them.
func (h *Handlers) ListPatients(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	search := r.URL.Query().Get("search")
	var arg pgtype.Text
	if search != "" {
		arg = pgtype.Text{String: search, Valid: true}
	}

	var patients []sqlc.Patient
	if scope, scoped := h.doctorScope(r.Context()); scoped {
		patients, err = h.q.ListPatientsForDoctor(r.Context(), sqlc.ListPatientsForDoctorParams{
			DoctorID: scope.Int64,
			ClinicID: clinicID,
			Search:   arg,
		})
	} else {
		patients, err = h.q.ListPatients(r.Context(), sqlc.ListPatientsParams{ClinicID: clinicID, Search: arg})
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
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.GetPatient(r.Context(), sqlc.GetPatientParams{ID: id, ClinicID: clinicID})
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
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	rows, err := h.q.ListAppointmentsByPatient(r.Context(), sqlc.ListAppointmentsByPatientParams{PatientID: id, ClinicID: clinicID})
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

// CreatePatient adds a new patient to the caller's clinic.
func (h *Handlers) CreatePatient(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
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
	if err := req.validateProfile(); err != nil {
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

	// ИИН-дедупликация: если пациент с таким ИИН уже есть в клинике — не
	// создаём дубликат, а возвращаем существующего (он «подставляется»).
	if req.IIN != "" {
		existing, err := h.q.GetPatientByIIN(r.Context(), sqlc.GetPatientByIINParams{
			ClinicID: clinicID,
			Iin:      optText(req.IIN),
		})
		if err == nil {
			// A doctor-role user must only see patients they treat: don't leak
			// another doctor's patient PII through the dedupe response. Return a
			// bare 409 that discloses nothing about the record.
			if scope, scoped := h.doctorScope(r.Context()); scoped {
				belongs, berr := h.q.PatientBelongsToDoctor(r.Context(), sqlc.PatientBelongsToDoctorParams{
					PatientID: existing.ID,
					DoctorID:  scope.Int64,
				})
				if berr != nil {
					httpx.Fail(w, berr)
					return
				}
				if !belongs {
					httpx.Fail(w, httpx.NewError(http.StatusConflict, "пациент с таким ИИН уже существует"))
					return
				}
			}
			httpx.JSON(w, http.StatusOK, toPatientDTO(existing))
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, err)
			return
		}
	}

	p, err := h.q.CreatePatient(r.Context(), sqlc.CreatePatientParams{
		ClinicID:  clinicID,
		FullName:  req.FullName,
		Phone:     pgtype.Text{String: req.Phone, Valid: true},
		BirthDate: birth,
		Notes:     pgtype.Text{String: req.Notes, Valid: true},
		Iin:       optText(req.IIN),
		Gender:    optText(req.Gender),
	})
	if err != nil {
		httpx.Fail(w, conflict(err, "пациент с таким ИИН уже существует"))
		return
	}
	httpx.JSON(w, http.StatusCreated, toPatientDTO(p))
}

// DeletePatient removes a patient together with their appointments and records
// (cascade). The confirmation warning lives in the UI.
func (h *Handlers) DeletePatient(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeletePatient(r.Context(), sqlc.DeletePatientParams{ID: id, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// UpdatePatient edits an existing patient.
func (h *Handlers) UpdatePatient(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
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
	if err := req.validateProfile(); err != nil {
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
		Iin:       optText(req.IIN),
		Gender:    optText(req.Gender),
		ClinicID:  clinicID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
			return
		}
		httpx.Fail(w, conflict(err, "пациент с таким ИИН уже существует"))
		return
	}
	httpx.JSON(w, http.StatusOK, toPatientDTO(p))
}
