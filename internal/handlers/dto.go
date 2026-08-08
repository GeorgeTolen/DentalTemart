package handlers

import (
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
)

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

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
	UserID         *int64 `json:"user_id"`
	// UserEmail is the login of the linked account (empty when not linked).
	UserEmail string `json:"user_email"`
	// Профиль, который врач ведёт сам.
	BirthDate       *string `json:"birth_date"`
	ExperienceYears int32   `json:"experience_years"`
	Bio             string  `json:"bio"`
	Skills          string  `json:"skills"`
	Education       string  `json:"education"`
	AvatarURL       *string `json:"avatar_url"`
	// Средняя оценка посещений (1–10) и число оценок. Заполняются в списке
	// врачей и в /doctors/me; в ответах мутаций остаются нулевыми — фронт
	// перечитывает список.
	RatingAvg   float64 `json:"rating_avg"`
	RatingCount int64   `json:"rating_count"`
}

func toDoctorDTO(d sqlc.Doctor) doctorDTO {
	var userID *int64
	if d.UserID.Valid {
		userID = &d.UserID.Int64
	}
	return doctorDTO{
		ID:              d.ID,
		FullName:        d.FullName,
		Specialization:  textVal(d.Specialization),
		Phone:           textVal(d.Phone),
		Color:           d.Color,
		IsActive:        d.IsActive,
		UserID:          userID,
		BirthDate:       dateStr(d.BirthDate),
		ExperienceYears: d.ExperienceYears,
		Bio:             textVal(d.Bio),
		Skills:          textVal(d.Skills),
		Education:       textVal(d.Education),
		AvatarURL:       avatarURL("doctors", d.ID, d.AvatarPath),
	}
}

func fromDoctorListRow(d sqlc.ListDoctorsRow) doctorDTO {
	dto := toDoctorDTO(sqlc.Doctor{
		ID: d.ID, FullName: d.FullName, Specialization: d.Specialization,
		Phone: d.Phone, Color: d.Color, IsActive: d.IsActive, UserID: d.UserID,
		BirthDate: d.BirthDate, ExperienceYears: d.ExperienceYears, Bio: d.Bio,
		Skills: d.Skills, Education: d.Education, AvatarPath: d.AvatarPath,
	})
	dto.UserEmail = d.UserEmail
	dto.RatingAvg = d.RatingAvg
	dto.RatingCount = d.RatingCount
	return dto
}

// --- Patient ---

type patientDTO struct {
	ID        int64   `json:"id"`
	FullName  string  `json:"full_name"`
	Phone     string  `json:"phone"`
	BirthDate *string `json:"birth_date"`
	Notes     string  `json:"notes"`
	IIN       string  `json:"iin"`
	Gender    string  `json:"gender"` // male | female | ""
	// Карточки пациентов общие для платформы: ClinicName — клиника, которая
	// завела карточку, IsOwn — она же и есть клиника читателя (только ей можно
	// удалить пациента).
	ClinicName string  `json:"clinic_name"`
	IsOwn      bool    `json:"is_own"`
	AvatarURL  *string `json:"avatar_url"`
}

func toPatientDTO(p sqlc.Patient) patientDTO {
	return patientDTO{
		ID:        p.ID,
		FullName:  p.FullName,
		Phone:     textVal(p.Phone),
		BirthDate: dateStr(p.BirthDate),
		Notes:     textVal(p.Notes),
		IIN:       textVal(p.Iin),
		Gender:    textVal(p.Gender),
		AvatarURL: avatarURL("patients", p.ID, p.AvatarPath),
	}
}

// patientJoin captures a patient row joined with its owning clinic, so the
// list/get/dedupe queries share one conversion.
type patientJoin struct {
	Patient    sqlc.Patient
	ClinicID   int64
	ClinicName pgtype.Text
}

func (j patientJoin) dto(viewerClinicID int64) patientDTO {
	dto := toPatientDTO(j.Patient)
	dto.ClinicName = textVal(j.ClinicName)
	dto.IsOwn = j.ClinicID == viewerClinicID
	return dto
}

// The four patient queries return structurally identical rows; sqlc generates a
// distinct type for each, so each gets a one-line adapter.

func fromPatientListRow(r sqlc.ListPatientsRow) patientJoin {
	return patientJoin{
		Patient: sqlc.Patient{
			ID: r.ID, FullName: r.FullName, Phone: r.Phone, BirthDate: r.BirthDate,
			Notes: r.Notes, ClinicID: r.ClinicID, Iin: r.Iin, Gender: r.Gender,
			AvatarPath: r.AvatarPath,
		},
		ClinicID: r.ClinicID, ClinicName: r.ClinicName,
	}
}

func fromPatientGetRow(r sqlc.GetPatientRow) patientJoin {
	return patientJoin{
		Patient: sqlc.Patient{
			ID: r.ID, FullName: r.FullName, Phone: r.Phone, BirthDate: r.BirthDate,
			Notes: r.Notes, ClinicID: r.ClinicID, Iin: r.Iin, Gender: r.Gender,
			AvatarPath: r.AvatarPath,
		},
		ClinicID: r.ClinicID, ClinicName: r.ClinicName,
	}
}

func fromPatientIINRow(r sqlc.GetPatientByIINRow) patientJoin {
	return patientJoin{
		Patient: sqlc.Patient{
			ID: r.ID, FullName: r.FullName, Phone: r.Phone, BirthDate: r.BirthDate,
			Notes: r.Notes, ClinicID: r.ClinicID, Iin: r.Iin, Gender: r.Gender,
			AvatarPath: r.AvatarPath,
		},
		ClinicID: r.ClinicID, ClinicName: r.ClinicName,
	}
}

// --- Patient record (рентген / аллергия / 3D снимок) ---

type patientRecordDTO struct {
	ID            int64   `json:"id"`
	PatientID     int64   `json:"patient_id"`
	Type          string  `json:"type"`
	Title         string  `json:"title"`
	Note          string  `json:"note"`
	FileURL       *string `json:"file_url"`
	FileName      string  `json:"file_name"`
	CreatedByName string  `json:"created_by_name"`
	CreatedAt     string  `json:"created_at"`
	// Медкарта общая для платформы: ClinicName — кто сделал запись, IsOwn — своя
	// ли она (удалять можно только свои).
	ClinicName string `json:"clinic_name"`
	IsOwn      bool   `json:"is_own"`
}

func toPatientRecordDTO(r sqlc.ListPatientRecordsRow) patientRecordDTO {
	var fileURL *string
	if r.FilePath.Valid && r.FilePath.String != "" {
		u := "/api/patients/" + itoa(r.PatientID) + "/records/" + itoa(r.ID) + "/file"
		fileURL = &u
	}
	return patientRecordDTO{
		ID:            r.ID,
		PatientID:     r.PatientID,
		Type:          r.Type,
		Title:         textVal(r.Title),
		Note:          textVal(r.Note),
		FileURL:       fileURL,
		FileName:      textVal(r.FileName),
		CreatedByName: r.CreatedByName,
		CreatedAt:     r.CreatedAt.Format(time.RFC3339),
		ClinicName:    r.ClinicName,
		IsOwn:         r.IsOwn,
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
	// Total — стоимость оказанных услуг в тенге, уже со скидкой. nil означает
	// «не ваша клиника»: история пациента общая, а деньги — нет.
	Total           *int64 `json:"total"`
	DiscountPercent int32  `json:"discount_percent"`
	// Rating — оценка посещения 1–10, nil пока приём не оценён.
	Rating *int32 `json:"rating"`
	// ClinicName заполняется только в общей истории пациента, чтобы было видно,
	// в какой клинике был приём. IsOwn — приём клиники читателя.
	ClinicName string `json:"clinic_name"`
	IsOwn      bool   `json:"is_own"`
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
	DoctorName      string
	DoctorColor     string
	Total           int64
	DiscountPercent int16
	Rating          pgtype.Int2
	ClinicName      pgtype.Text
	IsOwn           bool
}

func (j appointmentJoin) dto() appointmentDTO {
	dto := appointmentDTO{
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
		ClinicName:    textVal(j.ClinicName),
		IsOwn:         j.IsOwn,
	}
	if j.IsOwn {
		total := j.Total
		dto.Total = &total
		dto.DiscountPercent = int32(j.DiscountPercent)
	}
	if j.Rating.Valid {
		rating := int32(j.Rating.Int16)
		dto.Rating = &rating
	}
	return dto
}

func fromRangeRow(r sqlc.ListAppointmentsInRangeRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
		Total: r.Total, DiscountPercent: r.DiscountPercent, Rating: r.Rating, IsOwn: true,
	}.dto()
}

func fromPatientRow(r sqlc.ListAppointmentsByPatientRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
		Total: r.Total, DiscountPercent: r.DiscountPercent, Rating: r.Rating,
		ClinicName: r.ClinicName, IsOwn: r.IsOwn,
	}.dto()
}

func fromStatusRow(r sqlc.ListAppointmentsByStatusRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
		Total: r.Total, DiscountPercent: r.DiscountPercent, Rating: r.Rating, IsOwn: true,
	}.dto()
}

func fromGetRow(r sqlc.GetAppointmentRow) appointmentDTO {
	return appointmentJoin{
		ID: r.ID, PatientID: r.PatientID, DoctorID: r.DoctorID,
		StartTime: r.StartTime, EndTime: r.EndTime, Status: r.Status,
		Diagnosis: r.Diagnosis, Description: r.Description, NextVisitDate: r.NextVisitDate,
		PatientName: r.PatientName, PatientPhone: r.PatientPhone,
		DoctorName: r.DoctorName, DoctorColor: r.DoctorColor,
		Total: r.Total, DiscountPercent: r.DiscountPercent, Rating: r.Rating, IsOwn: true,
	}.dto()
}

// --- Услуга ---

type serviceDTO struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Price       int64  `json:"price"` // тенге
	IsActive    bool   `json:"is_active"`
	Description string `json:"description"`
}

func toServiceDTO(s sqlc.Service) serviceDTO {
	return serviceDTO{
		ID: s.ID, Name: s.Name, Price: s.Price, IsActive: s.IsActive,
		Description: textVal(s.Description),
	}
}

// appointmentServiceDTO — позиция в чеке приёма.
type appointmentServiceDTO struct {
	ID         int64  `json:"id"`
	ServiceID  *int64 `json:"service_id"`
	Name       string `json:"name"`
	Price      int64  `json:"price"`
	Quantity   int32  `json:"quantity"`
	DoctorID   *int64 `json:"doctor_id"`
	DoctorName string `json:"doctor_name"`
	Sum        int64  `json:"sum"`
}

func toAppointmentServiceDTO(r sqlc.ListAppointmentServicesRow) appointmentServiceDTO {
	dto := appointmentServiceDTO{
		ID:         r.ID,
		Name:       r.Name,
		Price:      r.Price,
		Quantity:   r.Quantity,
		DoctorName: textVal(r.DoctorName),
		Sum:        r.Price * int64(r.Quantity),
	}
	if r.ServiceID.Valid {
		dto.ServiceID = &r.ServiceID.Int64
	}
	if r.DoctorID.Valid {
		dto.DoctorID = &r.DoctorID.Int64
	}
	return dto
}
