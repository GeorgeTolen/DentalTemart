package handlers

import (
	"net/http"
	"time"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

// ---------------------------------------------------------------------------
// Финансы клиники: сколько заработано за день / месяц / год, какие услуги и
// какие врачи приносят деньги. Видят владелец и менеджер; врачу деньги не
// показываем.
//
// «Заработано» = сумма позиций приёмов, кроме отменённых. Приёмы считаются по
// времени начала, поэтому цифры совпадают с расписанием, а не с моментом, когда
// администратор пробил услуги.
// ---------------------------------------------------------------------------

type revenueBucketDTO struct {
	Revenue           int64 `json:"revenue"`
	ServicesCount     int64 `json:"services_count"`
	AppointmentsCount int64 `json:"appointments_count"`
}

type revenueByMonthDTO struct {
	Month         string `json:"month"` // YYYY-MM
	Revenue       int64  `json:"revenue"`
	ServicesCount int64  `json:"services_count"`
}

type revenueByNameDTO struct {
	Name          string `json:"name"`
	Revenue       int64  `json:"revenue"`
	ServicesCount int64  `json:"services_count"`
}

type revenueStatsDTO struct {
	Today     revenueBucketDTO    `json:"today"`
	Month     revenueBucketDTO    `json:"month"`
	Year      revenueBucketDTO    `json:"year"`
	AllTime   revenueBucketDTO    `json:"all_time"`
	ByMonth   []revenueByMonthDTO `json:"by_month"`
	ByService []revenueByNameDTO  `json:"by_service"`
	ByDoctor  []revenueByNameDTO  `json:"by_doctor"`
}

// RevenueStats returns the clinic's earnings summary.
func (h *Handlers) RevenueStats(w http.ResponseWriter, r *http.Request) {
	if err := h.requireManager(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	// Границы считаем в UTC — так же, как хранятся времена приёмов.
	now := time.Now().UTC()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	// Верхняя граница с запасом: будущие записи услуг не имеют, но пусть период
	// будет замкнутым, а не «до сейчас».
	future := now.AddDate(10, 0, 0)
	// Дно «за всё время»: с запасом до появления любых записей.
	epoch := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)

	sum := func(from, to time.Time) (revenueBucketDTO, error) {
		row, err := h.q.SumRevenueInRange(r.Context(), sqlc.SumRevenueInRangeParams{
			ClinicID: clinicID,
			From:     from,
			To:       to,
		})
		if err != nil {
			return revenueBucketDTO{}, err
		}
		return revenueBucketDTO{
			Revenue:           row.Revenue,
			ServicesCount:     row.ServicesCount,
			AppointmentsCount: row.AppointmentsCount,
		}, nil
	}

	var stats revenueStatsDTO
	if stats.Today, err = sum(dayStart, dayStart.AddDate(0, 0, 1)); err != nil {
		httpx.Fail(w, err)
		return
	}
	if stats.Month, err = sum(monthStart, monthStart.AddDate(0, 1, 0)); err != nil {
		httpx.Fail(w, err)
		return
	}
	if stats.Year, err = sum(yearStart, yearStart.AddDate(1, 0, 0)); err != nil {
		httpx.Fail(w, err)
		return
	}
	if stats.AllTime, err = sum(epoch, future); err != nil {
		httpx.Fail(w, err)
		return
	}

	// График за последние 12 месяцев, включая текущий.
	chartFrom := monthStart.AddDate(0, -11, 0)
	months, err := h.q.RevenueByMonth(r.Context(), sqlc.RevenueByMonthParams{
		ClinicID: clinicID,
		From:     chartFrom,
		To:       monthStart.AddDate(0, 1, 0),
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	stats.ByMonth = make([]revenueByMonthDTO, 0, len(months))
	for _, m := range months {
		stats.ByMonth = append(stats.ByMonth, revenueByMonthDTO{
			Month:         m.Month,
			Revenue:       m.Revenue,
			ServicesCount: m.ServicesCount,
		})
	}

	// Разрезы по услугам и врачам — за текущий год.
	services, err := h.q.RevenueByService(r.Context(), sqlc.RevenueByServiceParams{
		ClinicID: clinicID,
		From:     yearStart,
		To:       future,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	stats.ByService = make([]revenueByNameDTO, 0, len(services))
	for _, s := range services {
		stats.ByService = append(stats.ByService, revenueByNameDTO{
			Name:          s.Name,
			Revenue:       s.Revenue,
			ServicesCount: s.ServicesCount,
		})
	}

	doctors, err := h.q.RevenueByDoctor(r.Context(), sqlc.RevenueByDoctorParams{
		ClinicID: clinicID,
		From:     yearStart,
		To:       future,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	stats.ByDoctor = make([]revenueByNameDTO, 0, len(doctors))
	for _, d := range doctors {
		stats.ByDoctor = append(stats.ByDoctor, revenueByNameDTO{
			Name:          d.DoctorName,
			Revenue:       d.Revenue,
			ServicesCount: d.ServicesCount,
		})
	}

	httpx.JSON(w, http.StatusOK, stats)
}
