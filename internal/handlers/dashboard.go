package handlers

import (
	"net/http"
	"time"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

type adminStatsDTO struct {
	TotalPatients    int64 `json:"total_patients"`
	TotalDoctors     int64 `json:"total_doctors"`
	TotalUsers       int64 `json:"total_users"`
	ScheduledCount   int64 `json:"scheduled_count"`
	CompletedCount   int64 `json:"completed_count"`
	CancelledCount   int64 `json:"cancelled_count"`
	NoShowCount      int64 `json:"no_show_count"`
	ArchivedCount    int64 `json:"archived_count"`
}

// AdminStats returns aggregate statistics for the admin panel.
func (h *Handlers) AdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var stats adminStatsDTO

	row := h.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM patients)::bigint,
			(SELECT count(*) FROM doctors WHERE is_active = true)::bigint,
			(SELECT count(*) FROM users)::bigint,
			(SELECT count(*) FROM appointments WHERE status = 'scheduled')::bigint,
			(SELECT count(*) FROM appointments WHERE status = 'completed')::bigint,
			(SELECT count(*) FROM appointments WHERE status = 'cancelled')::bigint,
			(SELECT count(*) FROM appointments WHERE status = 'no_show')::bigint,
			(SELECT count(*) FROM appointments WHERE status IN ('completed','cancelled'))::bigint
	`)
	if err := row.Scan(
		&stats.TotalPatients,
		&stats.TotalDoctors,
		&stats.TotalUsers,
		&stats.ScheduledCount,
		&stats.CompletedCount,
		&stats.CancelledCount,
		&stats.NoShowCount,
		&stats.ArchivedCount,
	); err != nil {
		httpx.Fail(w, err)
		return
	}

	httpx.JSON(w, http.StatusOK, stats)
}

type dashboardDTO struct {
	TodayCount        int64            `json:"today_count"`
	WeekCount         int64            `json:"week_count"`
	TodayAppointments []appointmentDTO `json:"today_appointments"`
}

// Dashboard returns today's appointments plus simple daily/weekly counts.
func (h *Handlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().UTC()
	dayStart := now.Truncate(24 * time.Hour)
	dayEnd := dayStart.Add(24 * time.Hour)
	weekEnd := dayStart.Add(7 * 24 * time.Hour)

	todayRows, err := h.q.ListAppointmentsInRange(ctx, sqlc.ListAppointmentsInRangeParams{
		From: dayStart,
		To:   dayEnd,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	today := make([]appointmentDTO, 0, len(todayRows))
	for _, a := range todayRows {
		today = append(today, fromRangeRow(a))
	}

	todayCount, err := h.q.CountAppointmentsInRange(ctx, sqlc.CountAppointmentsInRangeParams{From: dayStart, To: dayEnd})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	weekCount, err := h.q.CountAppointmentsInRange(ctx, sqlc.CountAppointmentsInRangeParams{From: dayStart, To: weekEnd})
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	httpx.JSON(w, http.StatusOK, dashboardDTO{
		TodayCount:        todayCount,
		WeekCount:         weekCount,
		TodayAppointments: today,
	})
}
