package booking

import (
	"testing"
	"time"
)

func mustLoc(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Almaty")
	if err != nil {
		t.Skip("no tzdata")
	}
	return loc
}

func starts(slots []Slot, loc *time.Location) []string {
	out := make([]string, 0, len(slots))
	for _, s := range slots {
		out = append(out, s.Start.In(loc).Format("15:04"))
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestFreeSlotsDefaultHours(t *testing.T) {
	loc := mustLoc(t)
	day := time.Date(2026, 9, 21, 0, 0, 0, 0, loc) // понедельник
	now := day.Add(-24 * time.Hour)
	slots := FreeSlots(day, []Doctor{{ID: 1}}, nil, now)
	want := []string{"09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"}
	if got := starts(slots, loc); !equal(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	if len(slots[0].DoctorIDs) != 1 || slots[0].DoctorIDs[0] != 1 {
		t.Fatalf("doctor ids: %v", slots[0].DoctorIDs)
	}
}

func TestFreeSlotsScheduleWindowsAndDayOff(t *testing.T) {
	loc := mustLoc(t)
	monday := time.Date(2026, 9, 21, 0, 0, 0, 0, loc)
	sunday := time.Date(2026, 9, 20, 0, 0, 0, 0, loc)
	d := Doctor{ID: 1, HasSchedule: true, Windows: map[int][]Window{
		1: {{StartMin: 10 * 60, EndMin: 13*60 + 30}}, // пн 10:00–13:30 → 10, 11, 12
	}}
	now := sunday.Add(-24 * time.Hour)
	if got := starts(FreeSlots(monday, []Doctor{d}, nil, now), loc); !equal(got, []string{"10:00", "11:00", "12:00"}) {
		t.Fatalf("monday: %v", got)
	}
	if got := FreeSlots(sunday, []Doctor{d}, nil, now); len(got) != 0 {
		t.Fatalf("sunday should be a day off, got %v", starts(got, loc))
	}
}

func TestFreeSlotsBusyAndLeadTime(t *testing.T) {
	loc := mustLoc(t)
	day := time.Date(2026, 9, 21, 0, 0, 0, 0, loc)
	// Получасовая запись из CRM 11:30–12:00 занимает и слот 11:00, и 12:00? Нет:
	// 11:00–12:00 пересекается, 12:00–13:00 — нет.
	busy := []Busy{{DoctorID: 1, Start: day.Add(11*time.Hour + 30*time.Minute), End: day.Add(12 * time.Hour)}}
	now := day.Add(9*time.Hour + 10*time.Minute) // 09:10 → раньше 10:10 нельзя
	got := starts(FreeSlots(day, []Doctor{{ID: 1}}, busy, now), loc)
	want := []string{"12:00", "13:00", "14:00", "15:00", "16:00", "17:00"}
	if !equal(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestFreeSlotsMergesDoctors(t *testing.T) {
	loc := mustLoc(t)
	day := time.Date(2026, 9, 21, 0, 0, 0, 0, loc)
	now := day.Add(-time.Hour)
	busy := []Busy{{DoctorID: 2, Start: day.Add(9 * time.Hour), End: day.Add(10 * time.Hour)}}
	slots := FreeSlots(day, []Doctor{{ID: 2}, {ID: 1}}, busy, now)
	if len(slots[0].DoctorIDs) != 1 || slots[0].DoctorIDs[0] != 1 {
		t.Fatalf("09:00 should be free only for doctor 1: %v", slots[0].DoctorIDs)
	}
	if len(slots[1].DoctorIDs) != 2 || slots[1].DoctorIDs[0] != 1 || slots[1].DoctorIDs[1] != 2 {
		t.Fatalf("10:00 should be free for both, sorted: %v", slots[1].DoctorIDs)
	}
}

func TestParseClock(t *testing.T) {
	if m, ok := ParseClock("09:30"); !ok || m != 570 {
		t.Fatalf("09:30 → %d %v", m, ok)
	}
	if _, ok := ParseClock("25:00"); ok {
		t.Fatal("25:00 must fail")
	}
}
