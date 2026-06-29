-- name: ListPatients :many
SELECT * FROM patients
WHERE
    sqlc.narg('search')::text IS NULL
    OR full_name ILIKE '%' || sqlc.narg('search')::text || '%'
    OR phone ILIKE '%' || sqlc.narg('search')::text || '%'
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
