# Temart — CRM для стоматологической клиники

Минималистичная CRM: календарь записей, карточки приёмов, пациенты, врачи и их
график. Backend — REST API на Go + PostgreSQL, фронтенд — React (Vite). Архитектура
рассчитана на последующую упаковку веб-фронта в Android-приложение через Capacitor.

## Стек

- **Backend:** Go 1.26, chi, pgx, **sqlc**, golang-migrate, JWT (httpOnly cookie), bcrypt, slog.
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, FullCalendar, TanStack Query, axios.
- **Инфра:** Docker Compose (PostgreSQL 16 + backend), миграции применяются при старте.

## Быстрый старт

### 1. Backend + база данных

```bash
cp .env.example .env        # при желании поменяйте OWNER_EMAIL / OWNER_PASSWORD / JWT_SECRET
docker-compose up --build
```

При первом старте применяются миграции и создаётся владелец из переменных
`OWNER_EMAIL` / `OWNER_PASSWORD` (по умолчанию `owner@temart.local` / `changeme123`).
API доступен на `http://localhost:8080`, проверка живости — `GET /healthz`.

### 2. Frontend

```bash
cd web
npm install
npm run dev        # http://localhost:5173 (запросы /api проксируются на :8080)
```

Откройте `http://localhost:5173`, войдите кредами владельца.

## Локальная разработка backend (`make run`)

Запускайте локально только сам Go-сервер, а БД держите в Docker. Поднимите
**только** Postgres (он публикуется на хост-порт **5433**, чтобы не конфликтовать
с нативным PostgreSQL на 5432), затем запустите сервер:

```bash
docker-compose up -d postgres   # БД на localhost:5433
make run                        # go run ./cmd/server, читает DATABASE_URL из .env
```

> Не запускайте одновременно `make run` и контейнер `backend` — оба слушают
> порт 8080. Для локальной разработки контейнер `backend` должен быть остановлен
> (`docker-compose stop backend`).

## Структура

```
cmd/server        — точка входа
internal/config   — конфиг из env
internal/db       — pgx pool, миграции (embed), bootstrap владельца, sqlc-код
internal/auth     — JWT + bcrypt
internal/middleware — авторизация (cookie), CORS, логирование
internal/service  — бизнес-логика (проверка пересечений записей)
internal/handlers — HTTP-обработчики и роутер
web/              — фронтенд (React + Vite)
```

## API (основное)

```
POST /api/auth/login | logout | refresh        GET /api/me
GET/POST/PUT/DELETE   /api/appointments[/:id]   (?from&to | ?date, ?doctor_id)
GET/POST/PUT          /api/patients[/:id]        GET /api/patients/:id/appointments
GET/POST/PUT/DELETE   /api/doctors[/:id]         GET/PUT /api/doctors/:id/schedule
GET /api/dashboard
```

Ответы — JSON; ошибки в формате `{"error": "сообщение"}`.

## Разработка БД

SQL живёт в `internal/db/queries`, типобезопасный Go генерируется через sqlc:

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
make sqlc          # перегенерировать internal/db/sqlc
make migrate-create name=add_something   # новая пара миграций
```

## Замечания

- Все времена хранятся в UTC (`TIMESTAMPTZ`), фронтенд показывает в локальном поясе.
- Один врач не может иметь две пересекающиеся записи — проверка на сервере (HTTP 409).
- Реализован MVP (§9 ТЗ). График врачей хранится, слоты по графику / напоминания / роли — следующий этап.
- В проде задайте сильный `JWT_SECRET` и `COOKIE_SECURE=true` (HTTPS).
