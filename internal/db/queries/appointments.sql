-- Пациенты общие для платформы, поэтому приём и карточка пациента могут
-- принадлежать разным клиникам — join по patient_id без сверки clinic_id.
-- Врач же всегда из клиники приёма.
--
-- total везде отдаётся уже со скидкой приёма: сумма чека умножается на
-- (100 - discount_percent) и делится через ROUND (half-up, совпадает с
-- Math.round на фронте). Важно: SUM(bigint) в Postgres — это numeric, поэтому
-- деление здесь точное, а не целочисленное; округляет именно ROUND.

-- name: ListAppointmentsInRange :many
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color,
    ROUND((SELECT COALESCE(SUM(s.price * s.quantity), 0)
       FROM appointment_services s WHERE s.appointment_id = a.id)
      * (100 - a.discount_percent) / 100.0)::bigint AS total
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
WHERE a.clinic_id = sqlc.arg('clinic_id')
  AND a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to')
  AND (sqlc.narg('doctor_id')::bigint IS NULL OR a.doctor_id = sqlc.narg('doctor_id')::bigint)
ORDER BY a.start_time;

-- name: ListAppointmentsByPatient :many
-- Вся история пациента по всем клиникам платформы. Суммы — только по приёмам
-- клиники-читателя: деньги чужой клиники не показываем.
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color,
    cl.name     AS clinic_name,
    (a.clinic_id = sqlc.arg('viewer_clinic_id')) AS is_own,
    CASE WHEN a.clinic_id = sqlc.arg('viewer_clinic_id') THEN (
        ROUND((SELECT COALESCE(SUM(s.price * s.quantity), 0)
            FROM appointment_services s WHERE s.appointment_id = a.id)
         * (100 - a.discount_percent) / 100.0)
    ) ELSE 0 END::bigint AS total
FROM appointments a
JOIN patients p  ON p.id = a.patient_id
JOIN doctors  d  ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
LEFT JOIN clinics cl ON cl.id = a.clinic_id
WHERE a.patient_id = sqlc.arg('patient_id')
ORDER BY a.start_time DESC;

-- name: GetAppointment :one
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color,
    ROUND((SELECT COALESCE(SUM(s.price * s.quantity), 0)
       FROM appointment_services s WHERE s.appointment_id = a.id)
      * (100 - a.discount_percent) / 100.0)::bigint AS total
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
WHERE a.id = $1 AND a.clinic_id = $2;

-- name: CountOverlappingAppointments :one
SELECT count(*) FROM appointments
WHERE clinic_id = sqlc.arg('clinic_id')
  AND doctor_id = sqlc.arg('doctor_id')
  AND status <> 'cancelled'
  AND id <> sqlc.arg('exclude_id')
  AND tstzrange(start_time, end_time) && tstzrange(sqlc.arg('start_time'), sqlc.arg('end_time'));

-- name: CreateAppointment :one
INSERT INTO appointments (
    clinic_id, patient_id, doctor_id, start_time, end_time, status,
    diagnosis, description, next_visit_date, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CreateOnlineAppointment :one
-- Заявка с публичной страницы записи: статус pending, автора-пользователя нет.
INSERT INTO appointments (
    clinic_id, patient_id, doctor_id, start_time, end_time, status,
    source, notify_phone, public_token
) VALUES ($1, $2, $3, $4, $5, 'pending', 'online', $6, $7)
RETURNING *;

-- name: SetAppointmentStatus :one
UPDATE appointments
SET status = $2, updated_at = now()
WHERE id = $1 AND clinic_id = $3
RETURNING *;

-- name: GetAppointmentByPublicToken :one
-- Статусная страница клиента: по секретному токену, без авторизации.
SELECT
    a.*,
    p.full_name AS patient_name,
    d.full_name AS doctor_name,
    c.name      AS clinic_name,
    c.slug      AS clinic_slug,
    c.address   AS clinic_address,
    c.phone     AS clinic_phone,
    c.map_url   AS clinic_map_url
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id
JOIN clinics  c ON c.id = a.clinic_id
WHERE a.public_token = $1;

-- name: BindTelegramChat :one
UPDATE appointments
SET notify_telegram_chat_id = $2, updated_at = now()
WHERE public_token = $1
RETURNING *;

-- name: CountPendingAppointments :one
SELECT count(*) FROM appointments WHERE clinic_id = $1 AND status = 'pending';

-- name: LockDoctorForBooking :exec
-- Сериализует параллельные онлайн-заявки к одному врачу внутри транзакции:
-- проверка пересечений и вставка идут под этим замком.
SELECT pg_advisory_xact_lock(sqlc.arg('doctor_id')::bigint);

-- name: UpdateAppointment :one
UPDATE appointments
SET patient_id = $2,
    doctor_id = $3,
    start_time = $4,
    end_time = $5,
    status = $6,
    diagnosis = $7,
    description = $8,
    next_visit_date = $9,
    updated_at = now()
WHERE id = $1 AND clinic_id = $10
RETURNING *;

-- name: SetAppointmentDiscount :exec
UPDATE appointments
SET discount_percent = $2, updated_at = now()
WHERE id = $1 AND clinic_id = $3;

-- name: SetAppointmentRating :exec
-- Оценка посещения 1–10; повторный вызов перезаписывает её.
UPDATE appointments
SET rating = $2, updated_at = now()
WHERE id = $1 AND clinic_id = $3;

-- name: DeleteAppointment :exec
DELETE FROM appointments WHERE id = $1 AND clinic_id = $2;

-- name: CountAppointmentsInRange :one
SELECT count(*) FROM appointments
WHERE clinic_id = sqlc.arg('clinic_id')
  AND start_time >= sqlc.arg('from') AND start_time < sqlc.arg('to')
  AND status <> 'cancelled'
  AND (sqlc.narg('doctor_id')::bigint IS NULL OR doctor_id = sqlc.narg('doctor_id')::bigint);

-- name: DeleteArchivedAppointments :exec
DELETE FROM appointments WHERE clinic_id = $1 AND status IN ('completed', 'cancelled');

-- name: CountArchivedAppointments :one
SELECT count(*) FROM appointments WHERE clinic_id = $1 AND status IN ('completed', 'cancelled');

-- name: ListAppointmentsByStatus :many
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color,
    ROUND((SELECT COALESCE(SUM(s.price * s.quantity), 0)
       FROM appointment_services s WHERE s.appointment_id = a.id)
      * (100 - a.discount_percent) / 100.0)::bigint AS total
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id AND d.clinic_id = a.clinic_id
WHERE a.clinic_id = sqlc.arg('clinic_id') AND a.status = sqlc.arg('status')
-- sort=old — сначала самые ранние приёмы; иначе (new) — самые свежие. Порядок
-- задаётся до LIMIT, иначе «сначала старые» показывал бы старые только внутри
-- последних 500 записей.
ORDER BY
    CASE WHEN sqlc.arg('sort')::text = 'old' THEN a.start_time END ASC,
    a.start_time DESC
LIMIT 500;
