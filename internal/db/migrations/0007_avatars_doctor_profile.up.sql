-- Аватарки пациентов и врачей + расширенный профиль врача.

-- Путь к файлу аватарки на диске (в том же каталоге uploads, что и снимки).
-- NULL — аватарки нет, интерфейс показывает инициал.
ALTER TABLE patients ADD COLUMN avatar_path TEXT;
ALTER TABLE doctors  ADD COLUMN avatar_path TEXT;

-- Профиль врача, который он ведёт сам в личном кабинете.
-- specialization уже есть и означает направление; здесь — остальное.
ALTER TABLE doctors
    ADD COLUMN birth_date       DATE,
    ADD COLUMN experience_years INT NOT NULL DEFAULT 0,
    ADD COLUMN bio              TEXT, -- опыт работы: где и кем работал
    ADD COLUMN skills           TEXT, -- способности и владение методиками
    ADD COLUMN education        TEXT;

ALTER TABLE doctors
    ADD CONSTRAINT doctors_experience_years_sane
    CHECK (experience_years >= 0 AND experience_years <= 80);
