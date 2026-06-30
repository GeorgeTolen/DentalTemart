DROP TABLE IF EXISTS patient_records;
DROP INDEX IF EXISTS idx_doctors_user_id;
ALTER TABLE doctors DROP COLUMN IF EXISTS user_id;
