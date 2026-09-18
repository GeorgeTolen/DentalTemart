DROP TABLE IF EXISTS notifications;

DROP INDEX IF EXISTS idx_appointments_pending;
DROP INDEX IF EXISTS idx_appointments_public_token;

ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS appointments_source_check,
    DROP COLUMN source,
    DROP COLUMN notify_phone,
    DROP COLUMN notify_telegram_chat_id,
    DROP COLUMN public_token;

ALTER TABLE clinics
    DROP COLUMN map_url,
    DROP COLUMN online_booking,
    DROP COLUMN greenapi_instance,
    DROP COLUMN greenapi_token;
