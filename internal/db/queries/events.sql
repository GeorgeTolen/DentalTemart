-- name: CreateEvent :exec
INSERT INTO events (clinic_id, user_id, user_name, action, message)
VALUES ($1, $2, $3, $4, $5);

-- name: ListEvents :many
-- Курсор по id, а не OFFSET: события пишутся непрерывно, и при листании
-- по смещению уже показанные строки уезжали бы вниз и дублировались.
-- cursor = 0 — первая страница. При sort=old листаем вперёд по возрастанию id,
-- при sort=new (по умолчанию) — назад по убыванию.
SELECT * FROM events
WHERE clinic_id = sqlc.arg('clinic_id')
  AND (
    sqlc.arg('cursor')::bigint = 0
    OR (sqlc.arg('sort')::text = 'old' AND id > sqlc.arg('cursor')::bigint)
    OR (sqlc.arg('sort')::text <> 'old' AND id < sqlc.arg('cursor')::bigint)
  )
ORDER BY
    CASE WHEN sqlc.arg('sort')::text = 'old' THEN id END ASC,
    id DESC
LIMIT sqlc.arg('page_size');
