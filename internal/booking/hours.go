// Package booking — онлайн-запись клиентов: свободные слоты, заявка, код
// подтверждения номера.
package booking

import (
	"time"

	"temart/internal/notify"
)

// Правила онлайн-записи. Часы совпадают с рабочим днём в календаре CRM
// (web/src/lib/datetime.ts).
const (
	// WorkdayStart/End — рабочий день по умолчанию (часы, локальное время),
	// когда у врача нет собственного расписания.
	WorkdayStart = 9
	WorkdayEnd   = 18
	// SlotMinutes — длительность одного приёма при онлайн-записи.
	SlotMinutes = 60
	// HorizonDays — на сколько дней вперёд открыта запись (сегодня + N).
	HorizonDays = 14
	// MinLead — раньше чем через столько от «сейчас» записаться нельзя.
	MinLead = time.Hour

	// CodeTTL — сколько живёт код подтверждения.
	CodeTTL = 5 * time.Minute
	// CodeMaxAttempts — сколько раз можно ошибиться в коде.
	CodeMaxAttempts = 5
)

// Location — часовой пояс клиник.
func Location() *time.Location { return notify.Location() }
