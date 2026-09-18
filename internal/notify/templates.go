package notify

import (
	"strings"
	"time"
)

// Kind — какое событие сообщаем клиенту.
type Kind string

const (
	// KindReceived — заявка принята и ждёт подтверждения клиники.
	KindReceived Kind = "received"
	// KindApproved — клиника подтвердила запись.
	KindApproved Kind = "approved"
	// KindRescheduled — клиника перенесла и подтвердила запись.
	KindRescheduled Kind = "rescheduled"
	// KindRejected — клиника отклонила заявку.
	KindRejected Kind = "rejected"
	// KindTelegramLinked — клиент привязал Telegram.
	KindTelegramLinked Kind = "telegram_linked"
)

// View — всё, что нужно шаблону.
type View struct {
	ClinicName    string
	ClinicAddress string
	ClinicPhone   string
	ClinicMapURL  string
	DoctorName    string
	Start         time.Time
	StatusURL     string
}

// ClinicLocation — часовой пояс, в котором клиентам показывается время.
// Все клиники платформы в Казахстане.
const ClinicLocation = "Asia/Almaty"

var location = func() *time.Location {
	loc, err := time.LoadLocation(ClinicLocation)
	if err != nil {
		return time.FixedZone("ALMT", 5*3600)
	}
	return loc
}()

// Location returns the clinic time zone.
func Location() *time.Location { return location }

func (v View) date() string  { return v.Start.In(location).Format("02.01.2006") }
func (v View) clock() string { return v.Start.In(location).Format("15:04") }

// CodeText — сообщение с кодом подтверждения номера.
func CodeText(code string) string {
	return "Temart: ваш код подтверждения " + code + ". Действует 5 минут. Никому его не сообщайте."
}

// Render собирает текст сообщения. Пустые строки (нет адреса, нет ссылки 2GIS)
// выкидываются, чтобы клиент не видел «Адрес:» без адреса.
func Render(kind Kind, v View) string {
	var lines []string
	switch kind {
	case KindReceived:
		lines = []string{
			v.ClinicName + ": заявка принята ✅",
			v.date() + " в " + v.clock() + ", врач " + v.DoctorName + ".",
			"Мы подтвердим запись и пришлём сообщение.",
			opt("Статус заявки: ", v.StatusURL),
		}
	case KindApproved:
		lines = []string{
			v.ClinicName + ": запись подтверждена ✅",
			v.date() + " в " + v.clock(),
			"Врач: " + v.DoctorName,
			opt("Адрес: ", v.ClinicAddress),
			opt("Как добраться (2GIS): ", v.ClinicMapURL),
			opt("Телефон клиники: ", v.ClinicPhone),
		}
	case KindRescheduled:
		lines = []string{
			v.ClinicName + ": время приёма изменено 🔁",
			"Новое время: " + v.date() + " в " + v.clock(),
			"Врач: " + v.DoctorName,
			opt("Адрес: ", v.ClinicAddress),
			opt("2GIS: ", v.ClinicMapURL),
			opt("Телефон клиники: ", v.ClinicPhone),
		}
	case KindRejected:
		lines = []string{
			v.ClinicName + ": к сожалению, записать вас на " + v.date() + " в " + v.clock() + " не получилось ❌",
			opt("Позвоните нам, чтобы подобрать другое время: ", v.ClinicPhone),
		}
	case KindTelegramLinked:
		lines = []string{
			"Готово! Уведомления о вашей записи в " + v.ClinicName + " будут приходить сюда.",
		}
	}
	out := lines[:0]
	for _, l := range lines {
		if l != "" {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}

func opt(label, value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return label + value
}
