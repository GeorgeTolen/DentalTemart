-- Услуги и расчёт стоимости приёма + общая база пациентов.
--
-- 1) Прайс услуг у каждой клиники свой (`services`).
-- 2) В приёме фиксируются оказанные услуги (`appointment_services`) — со
--    снимком названия и цены на момент приёма, чтобы поднятие прайса задним
--    числом не переписывало прошлую выручку.
-- 3) Пациенты становятся общими для всей платформы: `patients.clinic_id`
--    больше не «владелец» карточки, а «клиника, которая её завела».

-- Прайс клиники. Цена — целое число тенге (дробных тиынов в прайсе не бывает,
-- а целое избавляет от неточностей чисел с плавающей точкой).
CREATE TABLE services (
    id         BIGSERIAL PRIMARY KEY,
    clinic_id  BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    price      BIGINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT services_price_non_negative CHECK (price >= 0)
);

CREATE UNIQUE INDEX idx_services_clinic_name ON services (clinic_id, lower(name));

-- Оказанные услуги конкретного приёма.
-- service_id — только ссылка «откуда взяли»: услугу можно удалить из прайса, и
-- позиция в уже закрытом приёме от этого не должна испортиться (ON DELETE SET NULL).
-- doctor_id — исполнитель: из него считается выработка врача.
CREATE TABLE appointment_services (
    id             BIGSERIAL PRIMARY KEY,
    appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    clinic_id      BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    service_id     BIGINT REFERENCES services(id) ON DELETE SET NULL,
    doctor_id      BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,   -- снимок названия на момент приёма
    price          BIGINT NOT NULL, -- снимок цены за единицу, тенге
    quantity       INT NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT appointment_services_price_non_negative CHECK (price >= 0),
    CONSTRAINT appointment_services_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_appointment_services_appointment ON appointment_services (appointment_id);
CREATE INDEX idx_appointment_services_clinic ON appointment_services (clinic_id, created_at);

-- Базовый прайс каждой существующей клинике. Новым клиникам он заводится при
-- создании (см. CreateClinic).
INSERT INTO services (clinic_id, name, price)
SELECT c.id, s.name, s.price
FROM clinics c
CROSS JOIN (VALUES
    ('Удаление зуба',   20000::bigint),
    ('Лечение кариеса', 10000::bigint),
    ('Пломба',          10000::bigint)
) AS s(name, price)
ON CONFLICT DO NOTHING;

-- --- Общая база пациентов ---------------------------------------------------
-- Карточка пациента и его медицинская история видны всем клиникам платформы;
-- деньги (услуги и суммы) остаются приватными — они привязаны к clinic_id.
-- Столбец patients.clinic_id сохраняем: теперь это «клиника, которая завела
-- карточку». Она же — единственная, кому разрешено удалить пациента.
COMMENT ON COLUMN patients.clinic_id IS 'клиника, заведшая карточку; сама карточка общая для платформы';

-- Приём мог быть создан в одной клинике, а карточка пациента заведена в другой,
-- поэтому индекс на связку «пациент + время» полезнее старого клиникового.
CREATE INDEX idx_appointments_patient ON appointments (patient_id, start_time DESC);
