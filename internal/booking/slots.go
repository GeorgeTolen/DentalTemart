package booking

import (
	"sort"
	"time"
)

// Window — рабочее окно врача в минутах от полуночи локального дня.
type Window struct {
	StartMin int
	EndMin   int
}

// Doctor — врач с рабочими окнами по дням недели (ISO: 1=пн … 7=вс).
// HasSchedule=false означает «расписания нет» — работает по умолчанию каждый
// день WorkdayStart–WorkdayEnd; с расписанием день без окон — выходной.
type Doctor struct {
	ID          int64
	Windows     map[int][]Window
	HasSchedule bool
}

// Busy — занятый интервал врача (любая не отменённая запись).
type Busy struct {
	DoctorID   int64
	Start, End time.Time
}

// Slot — свободный час и врачи, у которых он свободен.
type Slot struct {
	Start     time.Time
	End       time.Time
	DoctorIDs []int64
}

// isoWeekday: Go считает воскресенье нулём, расписание — семёркой.
func isoWeekday(t time.Time) int {
	wd := int(t.Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

// FreeSlots считает свободные слоты на день. day — полночь дня в часовом
// поясе клиники; now — «сейчас», раньше now+MinLead записаться нельзя.
func FreeSlots(day time.Time, doctors []Doctor, busy []Busy, now time.Time) []Slot {
	byStart := map[time.Time][]int64{}
	earliest := now.Add(MinLead)
	slotLen := time.Duration(SlotMinutes) * time.Minute

	for _, d := range doctors {
		for _, w := range windowsFor(d, isoWeekday(day)) {
			for m := w.StartMin; m+SlotMinutes <= w.EndMin; m += SlotMinutes {
				start := day.Add(time.Duration(m) * time.Minute)
				end := start.Add(slotLen)
				if start.Before(earliest) {
					continue
				}
				if overlapsBusy(d.ID, start, end, busy) {
					continue
				}
				key := start.UTC()
				byStart[key] = append(byStart[key], d.ID)
			}
		}
	}

	out := make([]Slot, 0, len(byStart))
	for start, ids := range byStart {
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		out = append(out, Slot{Start: start, End: start.Add(slotLen), DoctorIDs: ids})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out
}

func windowsFor(d Doctor, weekday int) []Window {
	if !d.HasSchedule {
		return []Window{{StartMin: WorkdayStart * 60, EndMin: WorkdayEnd * 60}}
	}
	return d.Windows[weekday]
}

func overlapsBusy(doctorID int64, start, end time.Time, busy []Busy) bool {
	for _, b := range busy {
		if b.DoctorID != doctorID {
			continue
		}
		if b.Start.Before(end) && b.End.After(start) {
			return true
		}
	}
	return false
}

// ParseClock разбирает "HH:MM" в минуты от полуночи.
func ParseClock(s string) (int, bool) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return 0, false
	}
	return t.Hour()*60 + t.Minute(), true
}
