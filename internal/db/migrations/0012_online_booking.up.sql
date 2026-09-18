-- Онлайн-запись клиентов: заявка живёт в appointments со статусом 'pending',
-- клинике для страницы записи нужны ссылка 2GIS и выключатель, а уведомления
-- клиентам уходят через очередь (outbox) — чтобы недоступный WhatsApp не ронял
-- само действие в CRM.

ALTER TABLE clinics ADD COLUMN map_url TEXT;
ALTER TABLE clinics ADD COLUMN online_booking BOOLEAN NOT NULL DEFAULT true;
-- Реквизиты Green API на случай перехода с собственного шлюза: у Green API
-- один инстанс = один номер, поэтому они принадлежат клинике.
ALTER TABLE clinics ADD COLUMN greenapi_instance TEXT;
ALTER TABLE clinics ADD COLUMN greenapi_token TEXT;

ALTER TABLE appointments
    ADD COLUMN source TEXT NOT NULL DEFAULT 'crm',      -- crm | online
    ADD COLUMN notify_phone TEXT,                        -- номер WhatsApp клиента
    ADD COLUMN notify_telegram_chat_id BIGINT,           -- привязанный чат Telegram
    ADD COLUMN public_token TEXT;                        -- секрет статусной страницы

ALTER TABLE appointments
    ADD CONSTRAINT appointments_source_check CHECK (source IN ('crm', 'online'));

CREATE UNIQUE INDEX idx_appointments_public_token
    ON appointments (public_token) WHERE public_token IS NOT NULL;
CREATE INDEX idx_appointments_pending
    ON appointments (clinic_id, start_time) WHERE status = 'pending';

CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    clinic_id       BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    appointment_id  BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
    channel         TEXT NOT NULL,                        -- whatsapp | telegram
    recipient       TEXT NOT NULL,                        -- +7… или chat id
    text            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',       -- queued | sending | sent | failed
    error           TEXT,
    attempts        INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);

CREATE INDEX idx_notifications_queue
    ON notifications (next_attempt_at) WHERE status IN ('queued', 'sending');
CREATE INDEX idx_notifications_appointment ON notifications (appointment_id);
