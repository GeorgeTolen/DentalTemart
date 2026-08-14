-- Рабочий день клиники стал 9:00–18:00 вместо 8:00–20:00. Приёмы, назначенные
-- на 8 утра, сдвигаем на час вперёд — иначе они остались бы вне сетки
-- календаря и выпали бы из вида.
--
-- Время хранится в UTC, а «8 утра» — это местное время клиники (Казахстан,
-- UTC+5), поэтому час извлекаем в поясе Asia/Almaty.
UPDATE appointments
SET start_time = start_time + interval '1 hour',
    end_time   = end_time   + interval '1 hour',
    updated_at = now()
WHERE EXTRACT(HOUR FROM (start_time AT TIME ZONE 'Asia/Almaty')) = 8;
