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

-- name: ListSuperadmins :many
-- Platform administrators, for the platform panel's "Администраторы" section.
SELECT id, clinic_id, full_name, email, role, created_at
FROM users WHERE clinic_id IS NULL AND role = 'superadmin' ORDER BY created_at;

-- name: UpdateSuperadmin :one
-- Only name/email; the password goes through UpdateUserPassword.
UPDATE users SET full_name = $2, email = $3
WHERE id = $1 AND clinic_id IS NULL AND role = 'superadmin'
RETURNING id, clinic_id, full_name, email, role, created_at;

-- name: DeleteSuperadmin :exec
DELETE FROM users WHERE id = $1 AND clinic_id IS NULL AND role = 'superadmin';

-- name: CreateUser :one
INSERT INTO users (clinic_id, full_name, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetClinicUser :one
-- A single clinic user, scoped to their clinic (used by the platform panel to
-- reset a clinic account's password without leaving the clinic boundary).
SELECT id, clinic_id, full_name, email, role, created_at
FROM users WHERE id = $1 AND clinic_id = $2;

-- name: ListUsersByClinic :many
SELECT id, clinic_id, full_name, email, role, created_at
FROM users WHERE clinic_id = $1 ORDER BY created_at DESC;

-- name: UpdateUser :one
UPDATE users SET full_name = $2, email = $3, role = $4
WHERE id = $1 AND clinic_id = $5
RETURNING id, clinic_id, full_name, email, password_hash, role, created_at;

-- name: CountClinicOwners :one
-- Guards against removing a clinic's last owner (nobody could administer it).
SELECT count(*) FROM users WHERE clinic_id = $1 AND role = 'owner';

-- name: DeleteClinicUser :exec
DELETE FROM users WHERE id = $1 AND clinic_id = $2;

-- name: UpdateUserPassword :exec
-- Bumping token_version invalidates the user's existing access/refresh tokens.
UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1;
