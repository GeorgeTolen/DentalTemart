package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"

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

// patientsPageSize is how many patients one page of the list holds. Список
// общий для платформы и растёт, поэтому отдаём его страницами.
const patientsPageSize = 10

type patientsResponse struct {
	Items []patientDTO `json:"items"`
	Total int64        `json:"total"`
}

// ListPatients returns a page of patients, optionally filtered by a
// name/phone/IIN search. The patient directory is shared platform-wide — a card
// created by one clinic is visible to (and searchable by) all the others.
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
	offset := int32(0)
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if v, cerr := strconv.ParseInt(raw, 10, 32); cerr == nil && v > 0 {
			offset = int32(v)
		}
	}

	rows, err := h.q.ListPatients(r.Context(), sqlc.ListPatientsParams{
		Search:     arg,
		Sort:       sortParam(r, "name", "new", "old"),
		PageSize:   patientsPageSize,
		PageOffset: offset,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	total, err := h.q.CountPatients(r.Context(), arg)
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	resp := patientsResponse{Items: make([]patientDTO, 0, len(rows)), Total: total}
	for _, p := range rows {
		resp.Items = append(resp.Items, fromPatientListRow(p).dto(clinicID))
	}
	httpx.JSON(w, http.StatusOK, resp)
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
	p, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, fromPatientGetRow(p).dto(clinicID))
}

// GetPatientAppointments returns the full appointment history of a patient
// across every clinic of the platform. Amounts are filled in only for the
// caller's own appointments — the history is shared, the money is not.
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
	rows, err := h.q.ListAppointmentsByPatient(r.Context(), sqlc.ListAppointmentsByPatientParams{
		PatientID:      id,
		ViewerClinicID: clinicID,
	})
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

	// ИИН-дедупликация в масштабах платформы: если пациент с таким ИИН уже есть
	// в общей базе — не создаём дубликат, а возвращаем существующего (он
	// «подставляется»), даже если карточку заводила другая клиника.
	if req.IIN != "" {
		existing, err := h.q.GetPatientByIIN(r.Context(), optText(req.IIN))
		if err == nil {
			httpx.JSON(w, http.StatusOK, fromPatientIINRow(existing).dto(clinicID))
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
	dto := toPatientDTO(p)
	dto.IsOwn = true
	h.logEvent(r.Context(), clinicID, eventPatientCreate, "Добавил пациента: "+p.FullName)
	httpx.JSON(w, http.StatusCreated, dto)
}

// requireOwnPatient returns the patient and a 403 unless the caller's clinic is
// the one that created the card. База пациентов общая — читают все, но правит
// карточку только заведшая её клиника, иначе клиники затирали бы данные
// друг друга.
func (h *Handlers) requireOwnPatient(r *http.Request, id, clinicID int64) (sqlc.GetPatientRow, error) {
	p, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.GetPatientRow{}, httpx.NewError(http.StatusNotFound, "пациент не найден")
		}
		return sqlc.GetPatientRow{}, err
	}
	if p.ClinicID != clinicID {
		return sqlc.GetPatientRow{}, httpx.NewError(http.StatusForbidden,
			"карточку пациента может изменять только клиника, которая её завела")
	}
	return p, nil
}

// DeletePatient removes a patient together with their appointments and records
// (cascade) — including those of other clinics, which is why only the clinic
// that created the card may delete it. The confirmation warning lives in the UI.
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
	p, err := h.requireOwnPatient(r, id, clinicID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeletePatient(r.Context(), sqlc.DeletePatientParams{ID: id, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEvent(r.Context(), clinicID, eventPatientDelete, "Удалил пациента: "+p.FullName)
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
	if _, err := h.requireOwnPatient(r, id, clinicID); err != nil {
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
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
			return
		}
		httpx.Fail(w, conflict(err, "пациент с таким ИИН уже существует"))
		return
	}
	dto := toPatientDTO(p)
	dto.IsOwn = p.ClinicID == clinicID
	h.logEvent(r.Context(), clinicID, eventPatientUpdate, "Изменил карточку пациента: "+p.FullName)
	httpx.JSON(w, http.StatusOK, dto)
}
