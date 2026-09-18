-- Очередь уведомлений клиентам (outbox). Строка кладётся в той же транзакции,
-- что и действие (заявка создана / подтверждена / отклонена), а отправляет её
-- фоновый воркер: недоступный WhatsApp не должен ронять работу в CRM.

-- name: CreateNotification :one
INSERT INTO notifications (clinic_id, appointment_id, channel, recipient, text)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ClaimNotifications :many
-- Забираем пачку к отправке. SKIP LOCKED — на случай двух воркеров.
UPDATE notifications
SET status = 'sending'
WHERE id IN (
    SELECT id FROM notifications
    WHERE status = 'queued' AND next_attempt_at <= now()
    ORDER BY id
    LIMIT sqlc.arg('batch')::int
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: MarkNotificationSent :exec
UPDATE notifications
SET status = 'sent', sent_at = now(), error = NULL
WHERE id = $1;

-- name: MarkNotificationRetry :exec
-- Неудачная попытка: либо ставим обратно в очередь с задержкой, либо, когда
-- попытки кончились, помечаем failed.
UPDATE notifications
SET attempts = attempts + 1,
    error = sqlc.arg('error')::text,
    status = CASE WHEN attempts + 1 >= sqlc.arg('max_attempts')::int THEN 'failed' ELSE 'queued' END,
    next_attempt_at = now() + (sqlc.arg('backoff_seconds')::int * interval '1 second')
WHERE id = sqlc.arg('id');

-- name: MarkNotificationFailed :exec
-- Окончательная ошибка (номера нет в WhatsApp) — ретраи бессмысленны.
UPDATE notifications
SET attempts = attempts + 1, error = $2, status = 'failed'
WHERE id = $1;

-- name: RequeueStaleSending :exec
-- Воркер упал посреди отправки: строки, зависшие в sending, возвращаем в очередь.
UPDATE notifications
SET status = 'queued'
WHERE status = 'sending' AND next_attempt_at < now() - interval '5 minutes';

-- name: ListNotificationsByAppointment :many
SELECT * FROM notifications
WHERE appointment_id = $1
ORDER BY id;
