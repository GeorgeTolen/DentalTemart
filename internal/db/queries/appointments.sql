-- name: ListAppointmentsInRange :many
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id
WHERE a.start_time >= sqlc.arg('from')
  AND a.start_time <  sqlc.arg('to')
  AND (sqlc.narg('doctor_id')::bigint IS NULL OR a.doctor_id = sqlc.narg('doctor_id')::bigint)
ORDER BY a.start_time;

-- name: ListAppointmentsByPatient :many
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id
WHERE a.patient_id = $1
ORDER BY a.start_time DESC;

-- name: GetAppointment :one
SELECT
    a.*,
    p.full_name AS patient_name,
    p.phone     AS patient_phone,
    d.full_name AS doctor_name,
    d.color     AS doctor_color
FROM appointments a
JOIN patients p ON p.id = a.patient_id
JOIN doctors  d ON d.id = a.doctor_id
WHERE a.id = $1;

-- name: CountOverlappingAppointments :one
SELECT count(*) FROM appointments
WHERE doctor_id = sqlc.arg('doctor_id')
  AND status <> 'cancelled'
  AND id <> sqlc.arg('exclude_id')
  AND tstzrange(start_time, end_time) && tstzrange(sqlc.arg('start_time'), sqlc.arg('end_time'));

-- name: CreateAppointment :one
INSERT INTO appointments (
    patient_id, doctor_id, start_time, end_time, status,
    diagnosis, description, next_visit_date, created_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

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
WHERE id = $1
RETURNING *;

-- name: DeleteAppointment :exec
DELETE FROM appointments WHERE id = $1;

-- name: CountAppointmentsInRange :one
SELECT count(*) FROM appointments
WHERE start_time >= sqlc.arg('from') AND start_time < sqlc.arg('to')
  AND status <> 'cancelled';

-- name: DeleteArchivedAppointments :exec
DELETE FROM appointments WHERE status IN ('completed', 'cancelled');

-- name: CountArchivedAppointments :one
SELECT count(*) FROM appointments WHERE status IN ('completed', 'cancelled');
