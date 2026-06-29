-- Пользователи системы
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'owner', -- owner | admin | doctor
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Врачи
CREATE TABLE doctors (
    id             BIGSERIAL PRIMARY KEY,
    full_name      TEXT NOT NULL,
    specialization TEXT,
    phone          TEXT,
    color          TEXT NOT NULL DEFAULT '#3B82F6', -- цвет в календаре
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Рабочие часы врачей
CREATE TABLE doctor_schedules (
    id         BIGSERIAL PRIMARY KEY,
    doctor_id  BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    weekday    SMALLINT NOT NULL,   -- 1=пн ... 7=вс
    start_time TEXT NOT NULL,       -- 'HH:MM' (локальное время клиники)
    end_time   TEXT NOT NULL        -- 'HH:MM'
);

CREATE INDEX idx_doctor_schedules_doctor ON doctor_schedules(doctor_id);

-- Пациенты
CREATE TABLE patients (
    id         BIGSERIAL PRIMARY KEY,
    full_name  TEXT NOT NULL,
    phone      TEXT,
    birth_date DATE,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Записи / приёмы
CREATE TABLE appointments (
    id              BIGSERIAL PRIMARY KEY,
    patient_id      BIGINT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|completed|cancelled|no_show
    diagnosis       TEXT,
    description     TEXT,
    next_visit_date DATE,
    created_by      BIGINT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_start  ON appointments(start_time);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id, start_time);
