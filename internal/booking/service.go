package booking

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/notify"
	"temart/internal/service"
)

// Service — онлайн-запись поверх базы и правил записей.
type Service struct {
	pool  *pgxpool.Pool
	q     *sqlc.Queries
	appts *service.AppointmentService
	enq   *notify.Enqueuer
	now   func() time.Time
}

// New builds the Service.
func New(pool *pgxpool.Pool, q *sqlc.Queries, appts *service.AppointmentService, enq *notify.Enqueuer) *Service {
	return &Service{pool: pool, q: q, appts: appts, enq: enq, now: time.Now}
}

// DayRange — границы дня записи в поясе клиники: сегодня … сегодня+HorizonDays.
func (s *Service) DayRange() (first, last time.Time) {
	loc := Location()
	n := s.now().In(loc)
	first = time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	return first, first.AddDate(0, 0, HorizonDays)
}

// ParseDay разбирает YYYY-MM-DD как полночь в поясе клиники и проверяет, что
// день открыт для записи.
func (s *Service) ParseDay(raw string) (time.Time, error) {
	day, err := time.ParseInLocation("2006-01-02", raw, Location())
	if err != nil {
		return time.Time{}, httpx.NewError(http.StatusBadRequest, "некорректная дата, ожидается YYYY-MM-DD")
	}
	first, last := s.DayRange()
	if day.Before(first) || day.After(last) {
		return time.Time{}, httpx.NewError(http.StatusBadRequest, "на эту дату запись не открыта")
	}
	return day, nil
}

// dayContext — врачи, их окна и занятость на день; из него считаются слоты и
// выбирается «любой свободный врач».
type dayContext struct {
	doctors []Doctor
	busy    []Busy
	// load — сколько не отменённых записей у врача в этот день.
	load map[int64]int
}

func (s *Service) loadDay(ctx context.Context, clinicID int64, day time.Time) (dayContext, error) {
	rows, err := s.q.ListActiveDoctorsPublic(ctx, clinicID)
	if err != nil {
		return dayContext{}, err
	}
	schedules, err := s.q.ListDoctorSchedulesByClinic(ctx, clinicID)
	if err != nil {
		return dayContext{}, err
	}
	windows := map[int64]map[int][]Window{}
	for _, sc := range schedules {
		start, ok1 := ParseClock(sc.StartTime)
		end, ok2 := ParseClock(sc.EndTime)
		if !ok1 || !ok2 || end <= start {
			continue
		}
		if windows[sc.DoctorID] == nil {
			windows[sc.DoctorID] = map[int][]Window{}
		}
		wd := int(sc.Weekday)
		windows[sc.DoctorID][wd] = append(windows[sc.DoctorID][wd], Window{StartMin: start, EndMin: end})
	}
	dc := dayContext{load: map[int64]int{}}
	for _, r := range rows {
		w, has := windows[r.ID]
		dc.doctors = append(dc.doctors, Doctor{ID: r.ID, Windows: w, HasSchedule: has})
	}

	appts, err := s.q.ListAppointmentsInRange(ctx, sqlc.ListAppointmentsInRangeParams{
		ClinicID: clinicID,
		From:     day.UTC(),
		To:       day.AddDate(0, 0, 1).UTC(),
	})
	if err != nil {
		return dayContext{}, err
	}
	for _, a := range appts {
		if a.Status == service.StatusCancelled {
			continue
		}
		dc.busy = append(dc.busy, Busy{DoctorID: a.DoctorID, Start: a.StartTime, End: a.EndTime})
		dc.load[a.DoctorID]++
	}
	return dc, nil
}

// Slots — свободные слоты клиники на день; doctorID > 0 оставляет только
// слоты этого врача.
func (s *Service) Slots(ctx context.Context, clinicID int64, day time.Time, doctorID int64) ([]Slot, error) {
	dc, err := s.loadDay(ctx, clinicID, day)
	if err != nil {
		return nil, err
	}
	slots := FreeSlots(day, dc.doctors, dc.busy, s.now())
	if doctorID <= 0 {
		return slots, nil
	}
	out := slots[:0]
	for _, sl := range slots {
		for _, id := range sl.DoctorIDs {
			if id == doctorID {
				out = append(out, Slot{Start: sl.Start, End: sl.End, DoctorIDs: []int64{id}})
				break
			}
		}
	}
	return out, nil
}

// BookInput — заявка клиента. DoctorID = 0 означает «любой свободный врач».
type BookInput struct {
	ClinicID int64
	DoctorID int64
	Start    time.Time
	Name     string
	Phone    string
}

// Book создаёт заявку (запись со статусом pending) и ставит в очередь
// сообщение «заявка принята». Возвращает запись с данными клиники.
func (s *Service) Book(ctx context.Context, in BookInput) (sqlc.GetAppointmentByPublicTokenRow, error) {
	var empty sqlc.GetAppointmentByPublicTokenRow

	loc := Location()
	local := in.Start.In(loc)
	day := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	first, last := s.DayRange()
	if day.Before(first) || day.After(last) {
		return empty, httpx.NewError(http.StatusBadRequest, "на эту дату запись не открыта")
	}

	dc, err := s.loadDay(ctx, in.ClinicID, day)
	if err != nil {
		return empty, err
	}
	var slot *Slot
	for _, sl := range FreeSlots(day, dc.doctors, dc.busy, s.now()) {
		if sl.Start.Equal(in.Start) {
			s := sl
			slot = &s
			break
		}
	}
	if slot == nil {
		return empty, httpx.NewError(http.StatusConflict, "это время уже занято, выберите другое")
	}

	doctorID := in.DoctorID
	if doctorID > 0 {
		found := false
		for _, id := range slot.DoctorIDs {
			if id == doctorID {
				found = true
				break
			}
		}
		if !found {
			return empty, httpx.NewError(http.StatusConflict, "у этого врача время уже занято")
		}
	} else {
		// Любой врач: берём наименее загруженного в этот день, при равенстве —
		// с меньшим id (список уже отсортирован).
		for _, id := range slot.DoctorIDs {
			if doctorID == 0 || dc.load[id] < dc.load[doctorID] {
				doctorID = id
			}
		}
	}

	token, err := newToken()
	if err != nil {
		return empty, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return empty, err
	}
	defer tx.Rollback(ctx)
	qtx := s.q.WithTx(tx)

	if err := qtx.LockDoctorForBooking(ctx, doctorID); err != nil {
		return empty, err
	}

	patient, err := qtx.GetPatientByPhone(ctx, sqlc.GetPatientByPhoneParams{
		ClinicID: in.ClinicID,
		Phone:    pgtype.Text{String: in.Phone, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		patient, err = qtx.CreatePatient(ctx, sqlc.CreatePatientParams{
			ClinicID: in.ClinicID,
			FullName: in.Name,
			Phone:    pgtype.Text{String: in.Phone, Valid: true},
			Notes:    pgtype.Text{String: "Создан через онлайн-запись", Valid: true},
			Iin:      pgtype.Text{String: "", Valid: true},
		})
	}
	if err != nil {
		return empty, err
	}

	appt, err := s.appts.CreateOnline(ctx, qtx, service.AppointmentInput{
		ClinicID:  in.ClinicID,
		PatientID: patient.ID,
		DoctorID:  doctorID,
		StartTime: slot.Start.UTC(),
		EndTime:   slot.End.UTC(),
	}, in.Phone, token)
	if err != nil {
		return empty, err
	}

	row, err := qtx.GetAppointmentByPublicToken(ctx, appt.PublicToken)
	if err != nil {
		return empty, err
	}
	if err := s.enq.Enqueue(ctx, qtx, row, notify.KindReceived); err != nil {
		return empty, err
	}
	if err := tx.Commit(ctx); err != nil {
		return empty, err
	}
	return row, nil
}

// newToken — 24 случайных байта в base64url (32 символа): подходит и для
// ссылки, и для параметра /start в Telegram.
func newToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
