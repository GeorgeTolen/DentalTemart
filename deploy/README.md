# Деплой Temart в продакшен (VPS + Docker + HTTPS + CI/CD)

Продукт = Go-бэкенд (внутри — собранный фронтенд) + PostgreSQL + Caddy (авто-HTTPS).
Всё поднимается на **одном VPS** через `docker compose`. Образ собирается в GitHub
Actions и деплоится на сервер по SSH при каждом пуше в `main`.

> ⚠️ Виртуальный (shared) хостинг «Эконом» НЕ подходит — там нельзя запускать
> Docker/Go/PostgreSQL. Нужен **VPS / облачный сервер** (hoster.kz → «Облако» или
> «Серверы»). Минимум: **1 ГБ RAM**, комфортно — 2 ГБ, Ubuntu 22.04/24.04.

---

## 1. Купить сервер и настроить домен

1. Возьмите самый маленький **VPS** (1–2 ГБ RAM, Ubuntu). Запишите его **IP** и
   root-доступ по SSH.
2. В панели домена `temart.kz` создайте DNS-записи на IP сервера:
   - `A  @    <IP сервера>`
   - `A  www  <IP сервера>`
   Подождите, пока записи разъедутся (обычно минуты, иногда до пары часов).

## 2. Первичная настройка сервера (один раз)

Зайдите на сервер (`ssh root@<IP>`) и выполните:

```bash
# Docker + compose
curl -fsSL https://get.docker.com | sh

# Каталог проекта
mkdir -p /opt/temart && cd /opt/temart

# Скопируйте сюда два файла из репозитория (deploy/):
#   docker-compose.prod.yml  и  Caddyfile
# (через scp с локальной машины или nano/wget). Пример через nano:
nano docker-compose.prod.yml   # вставить содержимое
nano Caddyfile                 # вставить содержимое

# .env с секретами (из .env.prod.example), сгенерируйте пароли:
openssl rand -base64 48   # для JWT_SECRET
openssl rand -base64 24   # для паролей
nano .env                 # заполнить POSTGRES_PASSWORD, JWT_SECRET, SUPERADMIN_* и т.д.
```

Откройте firewall на 80/443 (если включён ufw):

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 3. Первый запуск (вручную)

Образ приватный в GHCR — залогиньтесь и поднимите стек:

```bash
# Токен: GitHub → Settings → Developer settings → Personal access tokens →
#        classic, scope read:packages
echo "<ВАШ_ТОКЕН>" | docker login ghcr.io -u georgetolen --password-stdin

cd /opt/temart
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker compose -f docker-compose.prod.yml logs -f caddy   # увидеть выдачу TLS-сертификата
```

Через ~1 минуту откройте **https://temart.kz** → «Вход для администратора
платформы» с `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` из `.env`.

> Совет: чтобы не логиниться в GHCR вручную, можно сделать пакет-образ публичным:
> GitHub → репозиторий → Packages → dentaltemart → Package settings → Change
> visibility → Public. Тогда `docker login` на сервере не нужен.

## 4. CI/CD: авто-деплой при пуше в `main`

Workflow уже в репозитории: `.github/workflows/deploy.yml`. Он собирает образ,
пушит в GHCR и заходит по SSH на сервер, чтобы обновить стек.

Добавьте **секреты** в GitHub (репозиторий → Settings → Secrets and variables →
Actions → New repository secret):

| Секрет         | Значение                                                        |
|----------------|-----------------------------------------------------------------|
| `VPS_HOST`     | IP сервера                                                       |
| `VPS_USER`     | `root` (или ваш пользователь)                                    |
| `VPS_SSH_KEY`  | приватный SSH-ключ (см. ниже)                                    |
| `VPS_PORT`     | (необязательно) SSH-порт, если не 22                             |

SSH-ключ для деплоя (на локальной машине):

```bash
ssh-keygen -t ed25519 -f temart_deploy -N ""
ssh-copy-id -i temart_deploy.pub root@<IP>   # или вручную добавьте .pub в ~/.ssh/authorized_keys на сервере
# Содержимое приватного ключа temart_deploy положите в секрет VPS_SSH_KEY.
```

`GITHUB_TOKEN` для доступа к GHCR подставляется автоматически — отдельно
настраивать не нужно.

Готово: теперь любой `git push` в `main` пересобирает образ и обновляет сервер.
Миграции БД применяются автоматически при старте бэкенда.

## Эксплуатация

```bash
cd /opt/temart
docker compose -f docker-compose.prod.yml logs -f backend   # логи
docker compose -f docker-compose.prod.yml ps                # статус

# Бэкап базы (положите в cron):
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U temart temart | gzip > backup-$(date +%F).sql.gz

# Восстановление:
gunzip -c backup-YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U temart -d temart
```

Данные (БД, загруженные файлы, TLS-сертификаты) живут в docker volume и
переживают перезапуски/обновления.
