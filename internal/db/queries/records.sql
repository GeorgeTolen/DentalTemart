-- name: ListPatientRecords :many
SELECT r.id, r.patient_id, r.type, r.title, r.note, r.file_path, r.file_name,
       r.created_by, r.created_at, COALESCE(u.full_name, '') AS created_by_name
FROM patient_records r
LEFT JOIN users u ON u.id = r.created_by
WHERE r.patient_id = $1
  AND (sqlc.narg('type')::text IS NULL OR r.type = sqlc.narg('type')::text)
ORDER BY r.created_at DESC;

-- name: GetPatientRecord :one
SELECT * FROM patient_records WHERE id = $1;

-- name: CreatePatientRecord :one
INSERT INTO patient_records (patient_id, type, title, note, file_path, file_name, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: DeletePatientRecord :exec
DELETE FROM patient_records WHERE id = $1;
