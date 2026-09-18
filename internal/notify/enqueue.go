package notify

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
)

// Каналы уведомлений (notifications.channel).
const (
	ChannelWhatsApp = "whatsapp"
	ChannelTelegram = "telegram"
)

// Enqueuer кладёт уведомления в очередь. Вызывается внутри транзакции
// действия (через tx-bound Queries), чтобы уведомление о несостоявшемся
// изменении не ушло.
type Enqueuer struct {
	publicBaseURL string
}

// NewEnqueuer builds an Enqueuer. publicBaseURL — адрес сайта без слэша.
func NewEnqueuer(publicBaseURL string) *Enqueuer {
	return &Enqueuer{publicBaseURL: publicBaseURL}
}

// StatusURL — ссылка на статусную страницу клиента.
func (e *Enqueuer) StatusURL(clinicSlug, token string) string {
	if token == "" {
		return ""
	}
	return e.publicBaseURL + "/book/" + clinicSlug + "/status/" + token
}

// Enqueue рендерит сообщение и ставит в очередь по каждому каналу, который у
// заявки есть: WhatsApp — если указан номер, Telegram — если привязан чат.
func (e *Enqueuer) Enqueue(ctx context.Context, q *sqlc.Queries, a sqlc.GetAppointmentByPublicTokenRow, kind Kind) error {
	text := Render(kind, View{
		ClinicName:    a.ClinicName,
		ClinicAddress: a.ClinicAddress.String,
		ClinicPhone:   a.ClinicPhone.String,
		ClinicMapURL:  a.ClinicMapUrl.String,
		DoctorName:    a.DoctorName,
		Start:         a.StartTime,
		StatusURL:     e.StatusURL(a.ClinicSlug, a.PublicToken.String),
	})
	apptID := pgtype.Int8{Int64: a.ID, Valid: true}
	if a.NotifyPhone.Valid && a.NotifyPhone.String != "" && kind != KindTelegramLinked {
		if _, err := q.CreateNotification(ctx, sqlc.CreateNotificationParams{
			ClinicID:      a.ClinicID,
			AppointmentID: apptID,
			Channel:       ChannelWhatsApp,
			Recipient:     a.NotifyPhone.String,
			Text:          text,
		}); err != nil {
			return err
		}
	}
	if a.NotifyTelegramChatID.Valid {
		if _, err := q.CreateNotification(ctx, sqlc.CreateNotificationParams{
			ClinicID:      a.ClinicID,
			AppointmentID: apptID,
			Channel:       ChannelTelegram,
			Recipient:     strconv.FormatInt(a.NotifyTelegramChatID.Int64, 10),
			Text:          text,
		}); err != nil {
			return err
		}
	}
	return nil
}
