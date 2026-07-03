-- Revert appointment FK behaviour to the original RESTRICT / no-action.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_doctor_id_fkey
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_created_by_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id);

DROP INDEX IF EXISTS idx_users_superadmin_email;
DROP INDEX IF EXISTS idx_users_clinic_email;
-- Restoring the original global UNIQUE(email) is only possible when emails are
-- globally unique; in a real multi-tenant dataset the same email may exist in
-- several clinics, so add the constraint only when it won't collide.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users GROUP BY email HAVING count(*) > 1) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
    ELSE
        RAISE NOTICE 'users_email_key не восстановлен: email не уникален между клиниками.';
    END IF;
END $$;

DROP INDEX IF EXISTS idx_patient_records_clinic;
DROP INDEX IF EXISTS idx_appointments_clinic;
DROP INDEX IF EXISTS idx_patients_clinic;
DROP INDEX IF EXISTS idx_doctors_clinic;
DROP INDEX IF EXISTS idx_users_clinic;

ALTER TABLE patient_records DROP COLUMN IF EXISTS clinic_id;
ALTER TABLE appointments    DROP COLUMN IF EXISTS clinic_id;
ALTER TABLE patients        DROP COLUMN IF EXISTS clinic_id;
ALTER TABLE doctors         DROP COLUMN IF EXISTS clinic_id;
ALTER TABLE users           DROP COLUMN IF EXISTS clinic_id;

DROP TABLE IF EXISTS clinics;
