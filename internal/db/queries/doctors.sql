-- name: ListDoctors :many
SELECT * FROM doctors ORDER BY full_name;

-- name: ListActiveDoctors :many
SELECT * FROM doctors WHERE is_active = true ORDER BY full_name;

-- name: GetDoctor :one
SELECT * FROM doctors WHERE id = $1;

-- name: GetDoctorByUserID :one
SELECT * FROM doctors WHERE user_id = $1;

-- name: CreateDoctor :one
INSERT INTO doctors (full_name, specialization, phone, color, is_active, user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateDoctor :one
UPDATE doctors
SET full_name = $2, specialization = $3, phone = $4, color = $5, is_active = $6, user_id = $7
WHERE id = $1
RETURNING *;

-- name: ListUnlinkedDoctorUsers :many
-- System users with the "doctor" role that are not yet linked to a doctor profile
-- (or are linked to the given doctor, so editing keeps showing its own link).
SELECT u.id, u.full_name, u.email
FROM users u
WHERE u.role = 'doctor'
  AND NOT EXISTS (
    SELECT 1 FROM doctors d WHERE d.user_id = u.id AND d.id != sqlc.arg('exclude_doctor_id')::bigint
  )
ORDER BY u.full_name;

-- name: DeleteDoctor :exec
DELETE FROM doctors WHERE id = $1;

-- name: ListDoctorSchedules :many
SELECT * FROM doctor_schedules WHERE doctor_id = $1 ORDER BY weekday, start_time;

-- name: DeleteDoctorSchedules :exec
DELETE FROM doctor_schedules WHERE doctor_id = $1;

-- name: CreateDoctorSchedule :one
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time)
VALUES ($1, $2, $3, $4)
RETURNING *;
