DROP INDEX IF EXISTS idx_appointments_patient;
COMMENT ON COLUMN patients.clinic_id IS NULL;
DROP TABLE IF EXISTS appointment_services;
DROP TABLE IF EXISTS services;
