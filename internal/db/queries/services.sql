-- Прайс услуг и оказанные услуги приёма. Всё строго внутри клиники: деньги —
-- единственное, что общая база пациентов не делает публичным.

-- name: ListServices :many
-- Весь прайс клиники; неактивные тоже, чтобы владелец видел их в справочнике.
SELECT * FROM services WHERE clinic_id = $1 ORDER BY is_active DESC, name;

-- name: GetService :one
SELECT * FROM services WHERE id = $1 AND clinic_id = $2;

-- name: CreateService :one
INSERT INTO services (clinic_id, name, price, is_active)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateService :one
UPDATE services SET name = $2, price = $3, is_active = $4
WHERE id = $1 AND clinic_id = $5
RETURNING *;

-- name: DeleteService :exec
DELETE FROM services WHERE id = $1 AND clinic_id = $2;

-- name: SeedClinicServices :exec
-- Базовый прайс новой клиники — чтобы кассой можно было пользоваться сразу.
INSERT INTO services (clinic_id, name, price)
SELECT $1, s.name, s.price
FROM (VALUES
    ('Удаление зуба',   20000::bigint),
    ('Лечение кариеса', 10000::bigint),
    ('Пломба',          10000::bigint)
) AS s(name, price)
ON CONFLICT DO NOTHING;

-- --- Услуги, оказанные в приёме ---------------------------------------------

-- name: ListAppointmentServices :many
SELECT s.*, d.full_name AS doctor_name
FROM appointment_services s
LEFT JOIN doctors d ON d.id = s.doctor_id
WHERE s.appointment_id = $1 AND s.clinic_id = $2
ORDER BY s.id;

-- name: DeleteAppointmentServices :exec
DELETE FROM appointment_services WHERE appointment_id = $1 AND clinic_id = $2;

-- name: CreateAppointmentService :one
INSERT INTO appointment_services (
    appointment_id, clinic_id, service_id, doctor_id, name, price, quantity
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- --- Статистика выручки ------------------------------------------------------

-- name: SumRevenueInRange :one
-- Начислено за период: сумма позиций приёмов, кроме отменённых.
SELECT
    COALESCE(SUM(s.price * s.quantity), 0)::bigint AS revenue,
    COALESCE(SUM(s.quantity), 0)::bigint           AS services_count,
    count(DISTINCT s.appointment_id)::bigint       AS appointments_count
FROM appointment_services s
JOIN appointments a ON a.id = s.appointment_id
WHERE s.clinic_id = sqlc.arg('clinic_id')
  AND a.status <> 'cancelled'
  AND a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to');

-- name: RevenueByMonth :many
-- Помесячно за период — для графика «заработок по месяцам».
SELECT
    to_char(date_trunc('month', a.start_time), 'YYYY-MM')  AS month,
    COALESCE(SUM(s.price * s.quantity), 0)::bigint         AS revenue,
    COALESCE(SUM(s.quantity), 0)::bigint                   AS services_count
FROM appointment_services s
JOIN appointments a ON a.id = s.appointment_id
WHERE s.clinic_id = sqlc.arg('clinic_id')
  AND a.status <> 'cancelled'
  AND a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to')
GROUP BY 1
ORDER BY 1;

-- name: RevenueByService :many
-- Какие услуги приносят деньги. Группируем по названию-снимку: услуга могла
-- быть переименована или удалена из прайса, а выручка по ней осталась.
SELECT
    s.name                                          AS name,
    COALESCE(SUM(s.quantity), 0)::bigint            AS services_count,
    COALESCE(SUM(s.price * s.quantity), 0)::bigint  AS revenue
FROM appointment_services s
JOIN appointments a ON a.id = s.appointment_id
WHERE s.clinic_id = sqlc.arg('clinic_id')
  AND a.status <> 'cancelled'
  AND a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to')
GROUP BY s.name
ORDER BY revenue DESC
LIMIT 20;

-- name: RevenueByDoctor :many
-- Выработка врачей. Исполнитель берётся из позиции, а если он не указан — из
-- врача приёма, иначе выработка «потерялась бы».
SELECT
    COALESCE(dp.full_name, da.full_name, '')        AS doctor_name,
    COALESCE(SUM(s.quantity), 0)::bigint            AS services_count,
    COALESCE(SUM(s.price * s.quantity), 0)::bigint  AS revenue
FROM appointment_services s
JOIN appointments a ON a.id = s.appointment_id
LEFT JOIN doctors dp ON dp.id = s.doctor_id
LEFT JOIN doctors da ON da.id = a.doctor_id
WHERE s.clinic_id = sqlc.arg('clinic_id')
  AND a.status <> 'cancelled'
  AND a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to')
GROUP BY 1
ORDER BY revenue DESC
LIMIT 20;

-- name: SumPlatformRevenue :one
-- Сводно по всем клиникам — для панели платформы.
SELECT COALESCE(SUM(s.price * s.quantity), 0)::bigint
FROM appointment_services s
JOIN appointments a ON a.id = s.appointment_id
WHERE a.status <> 'cancelled';
