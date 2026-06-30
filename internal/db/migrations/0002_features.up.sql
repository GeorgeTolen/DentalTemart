-- Привязка врача к учётной записи пользователя (для личного кабинета врача).
ALTER TABLE doctors ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_doctors_user_id ON doctors(user_id) WHERE user_id IS NOT NULL;

-- Медицинские записи пациента: рентген, аллергии, 3D снимки.
CREATE TABLE patient_records (
    id         BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    type       TEXT NOT NULL, -- xray | allergy | scan3d
    title      TEXT,
    note       TEXT,
    file_path  TEXT,
    file_name  TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_records_patient ON patient_records(patient_id, type);
