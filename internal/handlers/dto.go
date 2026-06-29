package handlers

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
)

const dateLayout = "2006-01-02"

// --- helpers to flatten pgtype/null values for clean JSON ---

func textVal(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

func dateStr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(dateLayout)
	return &s
}

// --- Doctor ---

type doctorDTO struct {
	ID             int64  `json:"id"`
	FullName       string `json:"full_name"`
	Specialization string `json:"specialization"`
	Phone          string `json:"phone"`
	Color          string `json:"color"`
	IsActive       bool   `json:"is_active"`
}

func toDoctorDTO(d sqlc.Doctor) doctorDTO {
	return doctorDTO{
		ID:             d.ID,
		FullName:       d.FullName,
		Specialization: textVal(d.Specialization),
		Phone:          textVal(d.Phone),
		Color:          d.Color,
		IsActive:       d.IsActive,
	}
}

// --- Patient ---

type patientDTO struct {
	ID        int64   `json:"id"`
	FullName  string  `json:"full_name"`
	Phone     string  `json:"phone"`
	BirthDate *string `json:"birth_date"`
	Notes     string  `json:"notes"`
}

func toPatientDTO(p sqlc.Patient) patientDTO {
	return patientDTO{
		ID:        p.ID,
		FullName:  p.FullName,
		Phone:     textVal(p.Phone),
		BirthDate: dateStr(p.BirthDate),
		Notes:     textVal(p.Notes),
	}
}

// --- Appointment ---

type appointmentDTO struct {
	ID            int64     `json:"id"`
	PatientID     int64     `json:"patient_id"`
	PatientName   string    `json:"patient_name"`
	PatientPhone  string    `json:"patient_phone"`
	DoctorID      int64     `json:"doctor_id"`
	DoctorName    string    `json:"doctor_name"`
	DoctorColor   string    `json:"doctor_color"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	Status        string    `json:"status"`
	Diagnosis     string    `json:"diagnosis"`
	Description   string    `json:"description"`
	NextVisitDate *string   `json:"next_visit_date"`
}

// appointmentJoin captures the fields shared by all joined appointment rows so
// one conversion function serves the range/patient/get queries.
type appointmentJoin struct {
	ID            int64
	PatientID     int64
	DoctorID      int64
	StartTime     time.Time
	EndTime       time.Time
	Status        string
	Diagnosis     pgtype.Text
	Description   pgtype.Text
	NextVisitDate *time.Time
	PatientName   string
	PatientPhone  pgtype.Text
	DoctorName    string
	DoctorColor   string
}

func (j appointmentJoin) dto() appointmentDTO {
	return appointmentDTO{
		ID:            j.ID,
		PatientID:     j.PatientID,
		PatientName:   j.PatientName,
		PatientPhone:  textVal(j.PatientPhone),
		DoctorID:      j.DoctorID,
		DoctorName:    j.DoctorName,
		DoctorColor:   j.DoctorColor,
		StartTime:     j.StartTime,
		EndTime:       j.EndTime,
		Status:        j.Status,
		Diagnosis:     textVal(j.Diagnosis),
		Description:   textVal(j.Description),
		NextVisitDate: dateStr(j.NextVisitDate),
	}
}

func fromRangeRow(r sqlc.ListAppointmentsInRangeRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
	}.dto()
}

func fromPatientRow(r sqlc.ListAppointmentsByPatientRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
	}.dto()
}

func fromGetRow(r sqlc.GetAppointmentRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
	}.dto()
}
