-- name: CreateEvent :exec
INSERT INTO events (clinic_id, user_id, user_name, action, message)
VALUES ($1, $2, $3, $4, $5);

-- name: ListEvents :many
-- Курсор по id, а не OFFSET: события пишутся непрерывно, и при листании
-- по смещению уже показанные строки уезжали бы вниз и дублировались.
-- before = 0 — первая страница.
SELECT * FROM events
WHERE clinic_id = sqlc.arg('clinic_id')
  AND (sqlc.arg('before')::bigint = 0 OR id < sqlc.arg('before')::bigint)
ORDER BY id DESC
LIMIT sqlc.arg('page_size');
