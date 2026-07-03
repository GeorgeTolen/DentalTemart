-- name: ListClinics :many
-- All clinics with quick aggregate counts, for the platform admin panel.
SELECT c.*,
       (SELECT count(*) FROM users u    WHERE u.clinic_id = c.id AND u.role = 'owner')::bigint AS owner_count,
       (SELECT count(*) FROM patients p WHERE p.clinic_id = c.id)::bigint AS patient_count,
       (SELECT count(*) FROM doctors d  WHERE d.clinic_id = c.id)::bigint AS doctor_count
FROM clinics c
ORDER BY c.created_at DESC;

-- name: ListActiveClinics :many
-- Public list used by the login clinic picker (only non-sensitive fields).
SELECT id, name, slug FROM clinics WHERE is_active = true ORDER BY name;

-- name: GetClinic :one
SELECT * FROM clinics WHERE id = $1;

-- name: GetClinicBySlug :one
SELECT * FROM clinics WHERE lower(slug) = lower($1);

-- name: CreateClinic :one
INSERT INTO clinics (name, slug, address, phone, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateClinic :one
UPDATE clinics SET name = $2, slug = $3, address = $4, phone = $5, is_active = $6
WHERE id = $1
RETURNING *;

-- name: DeleteClinic :exec
DELETE FROM clinics WHERE id = $1;
