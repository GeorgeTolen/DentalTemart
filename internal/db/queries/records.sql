-- name: ListPatientRecords :many
-- Медкарта пациента общая для платформы: снимки и аллергии, заведённые одной
-- клиникой, видит и лечащий врач другой. Название клиники показываем, чтобы
-- было понятно, кто запись сделал; удалять и править можно только свои.
SELECT r.id, r.clinic_id, r.patient_id, r.type, r.title, r.note, r.file_path, r.file_name,
       r.created_by, r.created_at, COALESCE(u.full_name, '') AS created_by_name,
       COALESCE(c.name, '') AS clinic_name,
       (r.clinic_id = sqlc.arg('viewer_clinic_id')) AS is_own
FROM patient_records r
LEFT JOIN users u ON u.id = r.created_by
LEFT JOIN clinics c ON c.id = r.clinic_id
WHERE r.patient_id = sqlc.arg('patient_id')
  AND (sqlc.narg('type')::text IS NULL OR r.type = sqlc.narg('type')::text)
ORDER BY r.created_at DESC;

-- name: GetPatientRecord :one
-- Файл отдаём любой клинике платформы (медкарта общая).
SELECT * FROM patient_records WHERE id = $1;

-- name: CreatePatientRecord :one
INSERT INTO patient_records (clinic_id, patient_id, type, title, note, file_path, file_name, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: DeletePatientRecord :exec
DELETE FROM patient_records WHERE id = $1 AND clinic_id = $2;
