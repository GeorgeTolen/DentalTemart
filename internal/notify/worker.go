package notify

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
)

// TelegramSender отправляет текст в чат Telegram. Реализует telegram.Bot.
type TelegramSender interface {
	SendChat(ctx context.Context, chatID int64, text string) error
}

const (
	workerTick  = 3 * time.Second
	workerBatch = 20
	maxAttempts = 8
	baseBackoff = 30 * time.Second
	maxBackoff  = 30 * time.Minute
	sendTimeout = 30 * time.Second
)

// Worker вычитывает очередь и отправляет сообщения. Ошибки доставки не
// теряются: строка возвращается в очередь с растущей задержкой, а после
// maxAttempts помечается failed.
type Worker struct {
	q  *sqlc.Queries
	wa Messenger
	tg TelegramSender // nil — канал выключен
}

// NewWorker builds a Worker. tg может быть nil.
func NewWorker(q *sqlc.Queries, wa Messenger, tg TelegramSender) *Worker {
	return &Worker{q: q, wa: wa, tg: tg}
}

// Run блокируется до отмены ctx.
func (w *Worker) Run(ctx context.Context) {
	if err := w.q.RequeueStaleSending(ctx); err != nil {
		slog.Error("notify: requeue stale", "err", err)
	}
	ticker := time.NewTicker(workerTick)
	defer ticker.Stop()
	for {
		w.drain(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// drain обрабатывает очередь, пока в ней есть готовые к отправке строки.
func (w *Worker) drain(ctx context.Context) {
	for {
		rows, err := w.q.ClaimNotifications(ctx, workerBatch)
		if err != nil {
			if ctx.Err() == nil {
				slog.Error("notify: claim", "err", err)
			}
			return
		}
		if len(rows) == 0 {
			return
		}
		for _, n := range rows {
			if ctx.Err() != nil {
				return
			}
			w.deliver(ctx, n)
		}
		if len(rows) < workerBatch {
			return
		}
	}
}

func (w *Worker) deliver(ctx context.Context, n sqlc.Notification) {
	sctx, cancel := context.WithTimeout(ctx, sendTimeout)
	defer cancel()

	var err error
	switch n.Channel {
	case ChannelWhatsApp:
		err = w.wa.Send(sctx, n.ClinicID, n.Recipient, n.Text)
	case ChannelTelegram:
		if w.tg == nil {
			err = Permanent("telegram выключен")
			break
		}
		chatID, perr := strconv.ParseInt(n.Recipient, 10, 64)
		if perr != nil {
			err = Permanent("некорректный chat id")
			break
		}
		err = w.tg.SendChat(sctx, chatID, n.Text)
	default:
		err = Permanent("неизвестный канал " + n.Channel)
	}

	// Отдельный контекст: отметку в базе надо сделать даже при остановке.
	mctx, mcancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer mcancel()

	if err == nil {
		if merr := w.q.MarkNotificationSent(mctx, n.ID); merr != nil {
			slog.Error("notify: mark sent", "id", n.ID, "err", merr)
		}
		return
	}
	if errors.Is(err, ErrPermanent) {
		slog.Warn("notify: failed permanently", "id", n.ID, "channel", n.Channel, "err", err)
		if merr := w.q.MarkNotificationFailed(mctx, sqlc.MarkNotificationFailedParams{
			ID: n.ID, Error: pgtype.Text{String: errText(err), Valid: true},
		}); merr != nil {
			slog.Error("notify: mark failed", "id", n.ID, "err", merr)
		}
		return
	}
	// Клиника не подключила WhatsApp — ждём подольше и не расходуем попытки
	// так быстро: даём владельцу время привязать номер.
	backoff := backoffFor(n.Attempts)
	if errors.Is(err, ErrNotConnected) {
		backoff = 2 * time.Minute
	}
	slog.Warn("notify: retry", "id", n.ID, "channel", n.Channel, "attempt", n.Attempts+1, "backoff", backoff, "err", err)
	if merr := w.q.MarkNotificationRetry(mctx, sqlc.MarkNotificationRetryParams{
		ID:             n.ID,
		Error:          errText(err),
		MaxAttempts:    maxAttempts,
		BackoffSeconds: int32(backoff / time.Second),
	}); merr != nil {
		slog.Error("notify: mark retry", "id", n.ID, "err", merr)
	}
}

// backoffFor — экспоненциальная задержка: 30с, 1м, 2м, 4м … до maxBackoff.
func backoffFor(attempts int32) time.Duration {
	d := baseBackoff
	for i := int32(0); i < attempts && d < maxBackoff; i++ {
		d *= 2
	}
	if d > maxBackoff {
		d = maxBackoff
	}
	return d
}

func errText(err error) string {
	s := err.Error()
	if len(s) > 500 {
		s = s[:500]
	}
	return s
}
