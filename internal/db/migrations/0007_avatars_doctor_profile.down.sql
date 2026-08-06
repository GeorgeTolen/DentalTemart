ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_experience_years_sane;
ALTER TABLE doctors
    DROP COLUMN IF EXISTS education,
    DROP COLUMN IF EXISTS skills,
    DROP COLUMN IF EXISTS bio,
    DROP COLUMN IF EXISTS experience_years,
    DROP COLUMN IF EXISTS birth_date;
ALTER TABLE doctors  DROP COLUMN IF EXISTS avatar_path;
ALTER TABLE patients DROP COLUMN IF EXISTS avatar_path;
