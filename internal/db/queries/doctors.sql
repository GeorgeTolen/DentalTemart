-- name: ListDoctors :many
SELECT * FROM doctors WHERE clinic_id = $1 ORDER BY full_name;

-- name: GetDoctor :one
SELECT * FROM doctors WHERE id = $1 AND clinic_id = $2;

-- name: GetDoctorByUserID :one
-- Clinic-scoped so a user can only ever resolve to a doctor profile in their
-- own clinic (prevents cross-clinic linkage from leaking a foreign profile).
SELECT * FROM doctors WHERE user_id = $1 AND clinic_id = $2;

-- name: DoctorUserInClinic :one
-- Whether the given user is a doctor-role account belonging to the clinic. Used
-- to validate the user_id a doctor profile is linked to.
SELECT EXISTS(
    SELECT 1 FROM users WHERE id = $1 AND clinic_id = $2 AND role = 'doctor'
) AS ok;

-- name: CreateDoctor :one
INSERT INTO doctors (clinic_id, full_name, specialization, phone, color, is_active, user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateDoctor :one
UPDATE doctors
SET full_name = $2, specialization = $3, phone = $4, color = $5, is_active = $6, user_id = $7
WHERE id = $1 AND clinic_id = $8
RETURNING *;

-- name: ListUnlinkedDoctorUsers :many
-- Clinic users with the "doctor" role not yet linked to a doctor profile
-- (or linked to the given doctor, so editing keeps showing its own link).
SELECT u.id, u.full_name, u.email
FROM users u
WHERE u.clinic_id = sqlc.arg('clinic_id')
  AND u.role = 'doctor'
  AND NOT EXISTS (
    SELECT 1 FROM doctors d WHERE d.user_id = u.id AND d.id != sqlc.arg('exclude_doctor_id')::bigint
  )
ORDER BY u.full_name;

-- name: DeleteDoctor :exec
DELETE FROM doctors WHERE id = $1 AND clinic_id = $2;

-- name: ListDoctorSchedules :many
SELECT s.* FROM doctor_schedules s
JOIN doctors d ON d.id = s.doctor_id
WHERE s.doctor_id = $1 AND d.clinic_id = $2
ORDER BY s.weekday, s.start_time;

-- name: DeleteDoctorSchedules :exec
DELETE FROM doctor_schedules WHERE doctor_id = $1;

-- name: CreateDoctorSchedule :one
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time)
VALUES ($1, $2, $3, $4)
RETURNING *;
