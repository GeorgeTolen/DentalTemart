-- Журнал действий клиники: кто и что сделал.
--
-- user_name — снимок ФИО на момент действия: уволенного сотрудника удаляют, а
-- запись в журнале должна остаться читаемой (поэтому ON DELETE SET NULL у ссылки).
CREATE TABLE events (
    id         BIGSERIAL PRIMARY KEY,
    clinic_id  BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user_name  TEXT NOT NULL,
    action     TEXT NOT NULL, -- appointment.create | patient.update | ...
    message    TEXT NOT NULL, -- человекочитаемо, готово к показу
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Листаем курсором по id (свежие сверху), поэтому индекс именно такой.
CREATE INDEX idx_events_clinic ON events (clinic_id, id DESC);
