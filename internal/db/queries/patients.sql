-- name: ListPatients :many
-- Matches when the search term is a prefix of any word in the name (so "к"
-- finds "Криштиано Роналдо" via the first word, "р" finds it via the second
-- word) or a prefix of the phone number — not an arbitrary substring anywhere.
SELECT * FROM patients
WHERE
    sqlc.narg('search')::text IS NULL
    OR (' ' || full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR phone ILIKE sqlc.narg('search')::text || '%'
ORDER BY full_name
LIMIT 200;

-- name: GetPatient :one
SELECT * FROM patients WHERE id = $1;

-- name: CreatePatient :one
INSERT INTO patients (full_name, phone, birth_date, notes)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdatePatient :one
UPDATE patients
SET full_name = $2, phone = $3, birth_date = $4, notes = $5
WHERE id = $1
RETURNING *;

-- name: DeletePatient :exec
DELETE FROM patients WHERE id = $1;

-- name: ListPatientsForDoctor :many
-- Same prefix-word search as ListPatients, but restricted to patients that
-- have at least one appointment with the given doctor.
SELECT DISTINCT p.* FROM patients p
JOIN appointments a ON a.patient_id = p.id
WHERE a.doctor_id = sqlc.arg('doctor_id')
  AND (
    sqlc.narg('search')::text IS NULL
    OR (' ' || p.full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR p.phone ILIKE sqlc.narg('search')::text || '%'
  )
ORDER BY p.full_name
LIMIT 200;

-- name: PatientBelongsToDoctor :one
SELECT EXISTS(
    SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2
) AS belongs;
