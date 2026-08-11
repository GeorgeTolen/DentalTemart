-- Пациенты — общие для всей платформы: карточку, заведённую одной клиникой,
-- видят и могут дополнять остальные. patients.clinic_id — это клиника, которая
-- завела карточку; она же единственная, кому разрешено её удалить.

-- name: ListPatients :many
-- Matches when the search term is a prefix of any word in the name, a prefix
-- of the phone number, or a prefix of the IIN. Ищет по всей платформе.
-- Постранично: база общая и растёт, выгружать её целиком нельзя.
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE (
    sqlc.narg('search')::text IS NULL
    OR (' ' || p.full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR p.phone ILIKE sqlc.narg('search')::text || '%'
    OR p.iin LIKE sqlc.narg('search')::text || '%'
  )
-- sort: name (по алфавиту), new (сначала новые карточки), old (сначала старые).
-- Неподходящие ветки CASE дают NULL и не влияют на порядок, поэтому запрос
-- остаётся одним и сортировка не размножает копии запроса.
ORDER BY
    CASE WHEN sqlc.arg('sort')::text = 'new' THEN p.created_at END DESC,
    CASE WHEN sqlc.arg('sort')::text = 'old' THEN p.created_at END ASC,
    p.full_name
LIMIT sqlc.arg('page_size') OFFSET sqlc.arg('page_offset');

-- name: CountPatients :one
-- Тот же фильтр, что и в ListPatients — для счётчика страниц.
SELECT count(*) FROM patients p
WHERE (
    sqlc.narg('search')::text IS NULL
    OR (' ' || p.full_name) ILIKE '% ' || sqlc.narg('search')::text || '%'
    OR p.phone ILIKE sqlc.narg('search')::text || '%'
    OR p.iin LIKE sqlc.narg('search')::text || '%'
  );

-- name: GetPatient :one
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE p.id = $1;

-- name: GetPatientByIIN :one
-- Дедупликация по ИИН в масштабах платформы: одна и та же карточка не должна
-- заводиться в каждой клинике заново.
SELECT p.*, c.name AS clinic_name FROM patients p
LEFT JOIN clinics c ON c.id = p.clinic_id
WHERE p.iin = $1;

-- name: CreatePatient :one
INSERT INTO patients (clinic_id, full_name, phone, birth_date, notes, iin, gender)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePatient :one
UPDATE patients
SET full_name = $2, phone = $3, birth_date = $4, notes = $5, iin = $6, gender = $7
WHERE id = $1
RETURNING *;

-- name: UpdatePatientAvatar :one
-- Карточка общая для платформы, поэтому аватарку может обновить любая клиника.
UPDATE patients SET avatar_path = $2 WHERE id = $1 RETURNING *;

-- name: DeletePatient :exec
-- Только клиника, заведшая карточку: удаление каскадом уносит приёмы всех клиник.
DELETE FROM patients WHERE id = $1 AND clinic_id = $2;

