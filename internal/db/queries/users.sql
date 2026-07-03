-- name: GetClinicUserByEmail :one
-- Login within a specific clinic: email is unique per clinic.
SELECT * FROM users WHERE clinic_id = $1 AND lower(email) = lower($2);

-- name: GetSuperadminByEmail :one
-- Platform admin login: superadmins are not attached to any clinic.
SELECT * FROM users WHERE clinic_id IS NULL AND role = 'superadmin' AND lower(email) = lower($1);

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: CountSuperadmins :one
SELECT count(*) FROM users WHERE role = 'superadmin';

-- name: CreateUser :one
INSERT INTO users (clinic_id, full_name, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListUsersByClinic :many
SELECT id, clinic_id, full_name, email, role, created_at
FROM users WHERE clinic_id = $1 ORDER BY created_at DESC;

-- name: UpdateUser :one
UPDATE users SET full_name = $2, email = $3, role = $4
WHERE id = $1 AND clinic_id = $5
RETURNING id, clinic_id, full_name, email, password_hash, role, created_at;

-- name: DeleteClinicUser :exec
DELETE FROM users WHERE id = $1 AND clinic_id = $2;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;
