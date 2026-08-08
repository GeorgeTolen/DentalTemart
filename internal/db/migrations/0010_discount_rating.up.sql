-- Скидка на чек приёма и оценка посещения (1–10). Обе величины 1:1 с приёмом:
-- одна скидка на чек, одна оценка на визит. Итог со скидкой не храним —
-- деньги, как и раньше, всегда выводятся из appointment_services.
ALTER TABLE appointments
    ADD COLUMN discount_percent SMALLINT NOT NULL DEFAULT 0
        CHECK (discount_percent BETWEEN 0 AND 100),
    ADD COLUMN rating SMALLINT
        CHECK (rating BETWEEN 1 AND 10);
