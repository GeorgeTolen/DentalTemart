-- ИИН (12-значный идентификатор) и пол пациента.
ALTER TABLE patients ADD COLUMN iin TEXT;
ALTER TABLE patients ADD COLUMN gender TEXT; -- male | female | NULL

-- ИИН уникален в пределах клиники (пустые значения не ограничиваются), чтобы
-- при повторном добавлении пациента с тем же ИИН подставлялся существующий.
CREATE UNIQUE INDEX idx_patients_clinic_iin
    ON patients (clinic_id, iin) WHERE iin IS NOT NULL AND iin <> '';
