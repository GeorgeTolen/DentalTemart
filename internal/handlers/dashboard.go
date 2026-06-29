package handlers

import (
	"net/http"
	"time"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
)

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
