# Temart — многоклиниковая CRM для стоматологий

CRM для сети стоматологических клиник: календарь записей, карточки приёмов,
пациенты, врачи и их график, личные кабинеты. Каждая клиника — изолированное
пространство. Backend — REST API на Go + PostgreSQL, фронтенд — React (Vite),
который в продакшене раздаётся тем же сервером.

## Роли и вход

- **Администратор платформы (superadmin)** — владелец всей системы. Отдельный
  вход (`Вход для администратора платформы`). Управляет клиниками, создаёт их
  владельцев, видит сводную статистику по всем клиникам. Не привязан к клинике.
  Дополнительно может: заводить других администраторов платформы (вкладка
  «Администраторы платформы»), менять собственный пароль, смотреть и сбрасывать
  учётные записи любой клиники (кнопка «Учётки») и открывать данные клиники
  **только на просмотр** (кнопка «Открыть» — режим поддержки).
- **Владелец клиники (owner)** — полный доступ в рамках своей клиники: сотрудники,
  врачи, пациенты, записи, отчёты, архив.
- **Менеджер (admin)** — то же, что владелец, кроме управления учётными записями.
- **Врач (doctor)** — видит только своих пациентов и приёмы, свой личный кабинет.

**Вход в клинику:** сначала выбираете свою клинику → затем email + пароль
(учётная запись выдаётся владельцем/платформой). Данные клиник полностью
изолированы, email уникален в пределах клиники.

## Стек

- **Backend:** Go 1.26, chi, pgx, **sqlc**, golang-migrate, JWT (httpOnly cookie), bcrypt, slog.
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, FullCalendar, TanStack Query, axios.
- **Инфра:** Docker Compose (PostgreSQL 16 + backend, раздающий SPA), миграции при старте.

## Быстрый старт (Docker)

```bash
cp .env.example .env    # поменяйте SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / JWT_SECRET
docker-compose up --build
```

При первом старте применяются миграции и создаётся администратор платформы из
`SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (по умолчанию `admin@temart.local` /
`changeme123`). Приложение целиком (SPA + API) доступно на `http://localhost:8080`.

Дальше:
1. Откройте `http://localhost:8080`, нажмите **«Вход для администратора платформы»**,
   войдите кредами superadmin.
2. Создайте клинику и её владельца.
3. Выйдите, выберите клинику и войдите владельцем — управляйте врачами, пациентами и записями.

## Локальная разработка

БД в Docker, backend и frontend — локально:

```bash
docker-compose up -d postgres         # БД на localhost:5433
make run                              # go run ./cmd/server (DATABASE_URL из .env)

cd web && npm install && npm run dev  # http://localhost:5173 (/api → :8080)
```

> Для локальной разработки контейнер `backend` держите остановленным
> (`docker-compose stop backend`) — иначе конфликт по порту 8080.

## Структура

```
cmd/server        — точка входа
internal/config   — конфиг из env
internal/db       — pgx pool, миграции (embed), bootstrap superadmin, sqlc-код
internal/auth     — JWT (+ clinic_id в claims) + bcrypt
internal/middleware — авторизация (cookie), контекст клиники, CORS, логирование
internal/service  — бизнес-логика (проверка пересечений записей)
internal/handlers — HTTP-обработчики (клиника + платформа), роутер, раздача SPA
web/              — фронтенд (React + Vite)
```

## API (основное)

```
GET  /api/clinics                              список активных клиник (для выбора при входе)
POST /api/auth/login                           вход в клинику {clinic_id, email, password}
POST /api/auth/platform/login                  вход администратора платформы {email, password}
POST /api/auth/logout | refresh    GET /api/me

# Платформа (только superadmin)
GET/POST/PUT/DELETE /api/platform/clinics[/:id]
POST /api/platform/clinics/:id/owner           добавить владельца клинике
GET  /api/platform/clinics/:id/users           учётные записи клиники
POST /api/platform/clinics/:id/users/:uid/password   сбросить пароль сотруднику
DELETE /api/platform/clinics/:id/users/:uid    удалить учётную запись клиники
GET/POST/PUT/DELETE /api/platform/admins[/:id] администраторы платформы
POST /api/platform/password                    сменить свой пароль
GET  /api/platform/stats

# Клиника (scoped по clinic_id из токена)
GET/POST/PUT/DELETE /api/appointments[/:id]    (?from&to | ?date, ?doctor_id)
GET/POST/PUT/DELETE /api/patients[/:id]         GET /api/patients/:id/appointments|records
GET/POST/PUT/DELETE /api/doctors[/:id]          GET/PUT /api/doctors/:id/schedule
GET/POST/PUT/DELETE /api/users[/:id]            (только владелец клиники)
GET /api/dashboard   GET /api/admin/stats
```

Ответы — JSON; ошибки в формате `{"error": "сообщение"}`.

## Разработка БД

SQL живёт в `internal/db/queries`, типобезопасный Go генерируется через sqlc:

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
make sqlc          # перегенерировать internal/db/sqlc
make migrate-create name=add_something   # новая пара миграций
```

## Режим поддержки

Администратор платформы может открыть данные конкретной клиники, не зная её
пароля: в панели платформы — кнопка **«Открыть»** у клиники. Экраны клиники
(календарь, записи, пациенты, врачи) открываются **только для чтения**: сверху
висит предупреждающая полоса, кнопки изменения скрыты, а сервер отклоняет любой
не-GET запрос в этом режиме (403). Клиника передаётся заголовком
`X-Support-Clinic-Id`, который принимается только у роли `superadmin`. Выход —
кнопка «Вернуться к платформе».

## Замечания

- Данные каждой клиники изолированы: все запросы фильтруются по `clinic_id` из токена.
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` создают **первого** администратора
  платформы при первом старте пустой базы; дальше правка `.env` ничего не меняет —
  администраторы и пароли управляются из панели платформы.
- Все времена хранятся в UTC (`TIMESTAMPTZ`), фронтенд показывает в локальном поясе; даты — в формате ДД.ММ.ГГГГ.
- Один врач не может иметь две пересекающиеся записи — проверка на сервере (HTTP 409).
- Удаление пациента/врача каскадно удаляет связанные приёмы (в UI есть предупреждение).
- В проде задайте сильный `JWT_SECRET` и `COOKIE_SECURE=true` (HTTPS).
