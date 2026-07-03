-- Multi-tenancy: every clinic (стоматология) is an isolated workspace.
--
-- Данные каждой клиники полностью изолированы. Пользователь сначала выбирает
-- свою клинику, затем входит по email+паролю в рамках этой клиники.
-- Отдельная роль «superadmin» — администратор платформы (владелец всей системы),
-- не привязан ни к одной клинике (clinic_id IS NULL), управляет клиниками и их
-- владельцами.

-- Клиники (арендаторы / tenants).
CREATE TABLE clinics (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,          -- короткий идентификатор для выбора клиники
    address    TEXT,
    phone      TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_clinics_slug ON clinics (lower(slug));

-- Привязка к клинике для всех данных, относящихся к конкретной клинике.
-- У superadmin (платформа) clinic_id IS NULL. У остальных — обязателен.
ALTER TABLE users           ADD COLUMN clinic_id BIGINT REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE doctors         ADD COLUMN clinic_id BIGINT REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE patients        ADD COLUMN clinic_id BIGINT REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE appointments    ADD COLUMN clinic_id BIGINT REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE patient_records ADD COLUMN clinic_id BIGINT REFERENCES clinics(id) ON DELETE CASCADE;

-- Перенос уже существующих данных в клинику по умолчанию «Temart».
DO $$
DECLARE
    cid BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM users)
       OR EXISTS (SELECT 1 FROM patients)
       OR EXISTS (SELECT 1 FROM doctors) THEN
        INSERT INTO clinics (name, slug) VALUES ('Temart', 'temart') RETURNING id INTO cid;
        UPDATE users           SET clinic_id = cid WHERE clinic_id IS NULL;
        UPDATE doctors         SET clinic_id = cid WHERE clinic_id IS NULL;
        UPDATE patients        SET clinic_id = cid WHERE clinic_id IS NULL;
        UPDATE appointments    SET clinic_id = cid WHERE clinic_id IS NULL;
        UPDATE patient_records SET clinic_id = cid WHERE clinic_id IS NULL;
    END IF;
END $$;

-- clinic_id обязателен для всех данных клиники (кроме users, где NULL = superadmin).
ALTER TABLE doctors         ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patients        ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE appointments    ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE patient_records ALTER COLUMN clinic_id SET NOT NULL;

CREATE INDEX idx_users_clinic           ON users (clinic_id);
CREATE INDEX idx_doctors_clinic         ON doctors (clinic_id);
CREATE INDEX idx_patients_clinic        ON patients (clinic_id);
CREATE INDEX idx_appointments_clinic    ON appointments (clinic_id, start_time);
CREATE INDEX idx_patient_records_clinic ON patient_records (clinic_id);

-- Email уникален в рамках клиники; для superadmin (clinic_id IS NULL) — глобально.
-- Раньше ограничение было чувствительно к регистру, теперь — нет; поэтому сначала
-- убеждаемся, что нет дубликатов email без учёта регистра (иначе миграция упала бы
-- на CREATE UNIQUE INDEX и осталась бы «грязной»).
DO $$
DECLARE dup TEXT;
BEGIN
    SELECT string_agg(DISTINCT lower(email), ', ') INTO dup FROM users
    WHERE (clinic_id, lower(email)) IN (
        SELECT clinic_id, lower(email) FROM users GROUP BY clinic_id, lower(email) HAVING count(*) > 1
    );
    IF dup IS NOT NULL THEN
        RAISE EXCEPTION 'Дубликаты email (без учёта регистра) в одной клинике: %. Устраните их и повторите миграцию.', dup;
    END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX idx_users_clinic_email
    ON users (clinic_id, lower(email)) WHERE clinic_id IS NOT NULL;
CREATE UNIQUE INDEX idx_users_superadmin_email
    ON users (lower(email)) WHERE clinic_id IS NULL;

-- Исправление багов удаления: раньше пациента/врача нельзя было удалить, если у
-- них были приёмы (ON DELETE RESTRICT), а пользователя — если он создавал приёмы.
-- Теперь удаление каскадно/безопасно.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_created_by_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
