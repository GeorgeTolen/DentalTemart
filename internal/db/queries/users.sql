-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: CountUsers :one
SELECT count(*) FROM users;

-- name: CreateUser :one
INSERT INTO users (full_name, email, password_hash, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListUsers :many
SELECT id, full_name, email, role, created_at FROM users ORDER BY created_at DESC;

-- name: UpdateUser :one
UPDATE users SET full_name = $2, email = $3, role = $4 WHERE id = $1
RETURNING id, full_name, email, password_hash, role, created_at;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2 WHERE id = $1;
