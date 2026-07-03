-- name: ListPatients :many
-- Matches when the search term is a prefix of any word in the name, a prefix
-- of the phone number, or a prefix of the IIN. Scoped to a single clinic.
SELECT * FROM patients
WHERE clinic_id = sqlc.arg('clinic_id')
  AND (
    sqlc.narg('search')::text IS NULL
    OR (' ' || full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR phone ILIKE sqlc.narg('search')::text || '%'
    OR iin LIKE sqlc.narg('search')::text || '%'
  )
ORDER BY full_name
LIMIT 200;

-- name: GetPatient :one
SELECT * FROM patients WHERE id = $1 AND clinic_id = $2;

-- name: GetPatientByIIN :one
-- Used to de-duplicate patients by ИИН: creating a patient with an existing
-- ИИН returns the existing record instead of inserting a duplicate.
SELECT * FROM patients WHERE clinic_id = $1 AND iin = $2;

-- name: CreatePatient :one
INSERT INTO patients (clinic_id, full_name, phone, birth_date, notes, iin, gender)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePatient :one
UPDATE patients
SET full_name = $2, phone = $3, birth_date = $4, notes = $5, iin = $6, gender = $7
WHERE id = $1 AND clinic_id = $8
RETURNING *;

-- name: DeletePatient :exec
DELETE FROM patients WHERE id = $1 AND clinic_id = $2;

-- name: ListPatientsForDoctor :many
-- Same prefix-word search, restricted to patients that have at least one
-- appointment with the given doctor (within the clinic).
SELECT DISTINCT p.* FROM patients p
JOIN appointments a ON a.patient_id = p.id
WHERE a.doctor_id = sqlc.arg('doctor_id')
  AND p.clinic_id = sqlc.arg('clinic_id')
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
