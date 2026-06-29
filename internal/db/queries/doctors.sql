-- name: ListDoctors :many
SELECT * FROM doctors ORDER BY full_name;

-- name: ListActiveDoctors :many
SELECT * FROM doctors WHERE is_active = true ORDER BY full_name;

-- name: GetDoctor :one
SELECT * FROM doctors WHERE id = $1;

-- name: CreateDoctor :one
INSERT INTO doctors (full_name, specialization, phone, color, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateDoctor :one
UPDATE doctors
SET full_name = $2, specialization = $3, phone = $4, color = $5, is_active = $6
WHERE id = $1
RETURNING *;

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
