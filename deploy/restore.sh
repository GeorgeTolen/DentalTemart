#!/bin/sh
# Восстановление Temart из резервной копии.
#
#   /opt/temart/restore.sh /opt/temart/backups/db-2026-08-11-0300.dump
#   /opt/temart/restore.sh .../db-...dump .../uploads-...tgz   # вместе с файлами
#
# Заменяет ТЕКУЩИЕ данные содержимым копии. Работает только с подтверждением:
#   CONFIRM=yes /opt/temart/restore.sh <дамп>
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/temart}"
DUMP="${1:-}"
UPLOADS="${2:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }

[ -n "$DUMP" ] || fail "укажите файл дампа: restore.sh /opt/temart/backups/db-….dump [uploads-….tgz]"
[ -f "$DUMP" ] || fail "файл не найден: $DUMP"

if [ "${CONFIRM:-}" != "yes" ]; then
	echo "Это заменит текущую базу клиники данными из копии."
	echo "Если вы уверены, повторите так:"
	echo "  CONFIRM=yes $0 $DUMP${UPLOADS:+ $UPLOADS}"
	exit 1
fi

cd "$PROJECT_DIR" || fail "нет каталога $PROJECT_DIR"
[ -f .env ] || fail "нет файла .env рядом с docker-compose"

env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2- ; }
DB_USER=$(env_value POSTGRES_USER)
DB_NAME=$(env_value POSTGRES_DB)
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || fail "в .env нет POSTGRES_USER/POSTGRES_DB"

PG_CID=$(docker compose ps -q postgres || true)
[ -n "$PG_CID" ] || fail "контейнер postgres не запущен"

# Бэкенд останавливаем: он держит соединения и мог бы писать в базу прямо во
# время восстановления.
log "останавливаю backend"
docker compose stop backend >/dev/null

log "восстанавливаю базу из $(basename "$DUMP")"
# --clean --if-exists: pg_restore сам удалит существующие таблицы перед заливкой.
# Ошибки прав на расширения не должны останавливать восстановление данных.
docker exec -i "$PG_CID" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$DUMP" \
	|| log "pg_restore завершился с замечаниями — проверьте вывод выше"

if [ -n "$UPLOADS" ]; then
	[ -f "$UPLOADS" ] || fail "файл не найден: $UPLOADS"
	UPLOADS_VOL=$(docker volume ls -q | grep -E '(^|_)uploads$' | head -1 || true)
	[ -n "$UPLOADS_VOL" ] || fail "том с файлами не найден"
	log "распаковываю файлы медкарты в том $UPLOADS_VOL"
	docker run --rm \
		-v "$UPLOADS_VOL":/data \
		-v "$(cd "$(dirname "$UPLOADS")" && pwd)":/src:ro \
		alpine:3.20 \
		sh -c "rm -rf /data/* && tar xzf /src/$(basename "$UPLOADS") -C /data"
fi

log "поднимаю backend"
docker compose up -d backend >/dev/null
log "готово — проверьте вход и данные в интерфейсе"
