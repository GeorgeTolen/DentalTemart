-- name: ListDoctors :many
-- Includes the linked account's login (email) so the admin panel can show it,
-- plus the doctor's average visit rating (1–10, from completed appointments;
-- appointments of a doctor are always in the doctor's clinic by construction).
SELECT d.*, COALESCE(u.email, '') AS user_email,
    (SELECT COALESCE(ROUND(AVG(a.rating)::numeric, 1), 0)::float8
       FROM appointments a
      WHERE a.doctor_id = d.id AND a.rating IS NOT NULL
        AND a.status <> 'cancelled')           AS rating_avg,
    (SELECT count(*)
       FROM appointments a
      WHERE a.doctor_id = d.id AND a.rating IS NOT NULL
        AND a.status <> 'cancelled')::bigint   AS rating_count
FROM doctors d
LEFT JOIN users u ON u.id = d.user_id
WHERE d.clinic_id = $1
ORDER BY d.full_name;

-- name: GetDoctorRating :one
-- Средняя оценка врача для его личного кабинета (/doctors/me).
SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float8 AS rating_avg,
       count(rating)::bigint                               AS rating_count
FROM appointments
WHERE doctor_id = $1 AND rating IS NOT NULL AND status <> 'cancelled';

-- name: DoctorColorTaken :one
-- Whether another doctor of the clinic already uses this calendar colour
-- (colours are unique per clinic so doctors are distinguishable at a glance).
SELECT EXISTS(
    SELECT 1 FROM doctors WHERE clinic_id = $1 AND color = $2 AND id <> $3
) AS taken;

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
-- Административные поля. Профильные (стаж, опыт, навыки) врач ведёт сам —
-- см. UpdateDoctorProfile, чтобы правки владельца и врача не затирали друг друга.
UPDATE doctors
SET full_name = $2, specialization = $3, phone = $4, color = $5, is_active = $6, user_id = $7
WHERE id = $1 AND clinic_id = $8
RETURNING *;

-- name: UpdateDoctorProfile :one
-- Профиль врача: его он редактирует в личном кабинете (владелец — тоже, из
-- карточки врача). Цвет, активность и привязку к учётке здесь не трогаем.
UPDATE doctors
SET specialization   = $2,
    phone            = $3,
    birth_date       = $4,
    experience_years = $5,
    bio              = $6,
    skills           = $7,
    education        = $8
WHERE id = $1 AND clinic_id = $9
RETURNING *;

-- name: UpdateDoctorAvatar :one
UPDATE doctors SET avatar_path = $2 WHERE id = $1 AND clinic_id = $3 RETURNING *;

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
