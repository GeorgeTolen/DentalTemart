-- Пациенты — общие для всей платформы: карточку, заведённую одной клиникой,
-- видят и могут дополнять остальные. patients.clinic_id — это клиника, которая
-- завела карточку; она же единственная, кому разрешено её удалить.

-- name: ListPatients :many
-- Matches when the search term is a prefix of any word in the name, a prefix
-- of the phone number, or a prefix of the IIN. Ищет по всей платформе.
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE (
    sqlc.narg('search')::text IS NULL
    OR (' ' || p.full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR p.phone ILIKE sqlc.narg('search')::text || '%'
    OR p.iin LIKE sqlc.narg('search')::text || '%'
  )
ORDER BY p.full_name
LIMIT 200;

-- name: GetPatient :one
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE p.id = $1;

-- name: GetPatientByIIN :one
-- Дедупликация по ИИН в масштабах платформы: одна и та же карточка не должна
-- заводиться в каждой клинике заново.
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE p.iin = $1;

-- name: CreatePatient :one
INSERT INTO patients (clinic_id, full_name, phone, birth_date, notes, iin, gender)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePatient :one
UPDATE patients
SET full_name = $2, phone = $3, birth_date = $4, notes = $5, iin = $6, gender = $7
WHERE id = $1
RETURNING *;

-- name: UpdatePatientAvatar :one
-- Карточка общая для платформы, поэтому аватарку может обновить любая клиника.
UPDATE patients SET avatar_path = $2 WHERE id = $1 RETURNING *;

-- name: DeletePatient :exec
-- Только клиника, заведшая карточку: удаление каскадом уносит приёмы всех клиник.
DELETE FROM patients WHERE id = $1 AND clinic_id = $2;

-- name: ListPatientsForDoctor :many
-- Same prefix-word search, restricted to patients that have at least one
-- appointment with the given doctor.
SELECT DISTINCT p.*, c.name AS clinic_name FROM patients p
JOIN appointments a ON a.patient_id = p.id
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE a.doctor_id = sqlc.arg('doctor_id')
  AND (
    sqlc.narg('search')::text IS NULL
    OR (' ' || p.full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR p.phone ILIKE sqlc.narg('search')::text || '%'
    OR p.iin LIKE sqlc.narg('search')::text || '%'
  )
ORDER BY p.full_name
LIMIT 200;

-- name: PatientBelongsToDoctor :one
SELECT EXISTS(
    SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2
) AS belongs;
