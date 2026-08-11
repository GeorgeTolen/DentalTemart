#!/bin/sh
# Резервная копия Temart: база + загруженные файлы (снимки, аватарки).
#
# Запускается по расписанию (cron, см. deploy/README.md) и вручную:
#   /opt/temart/backup.sh
#
# Кладёт в /opt/temart/backups два файла на запуск:
#   db-2026-08-11-0300.dump      — pg_dump в формате custom (восстанавливается pg_restore)
#   uploads-2026-08-11-0300.tgz  — файлы медкарты
# и удаляет копии старше KEEP_DAYS дней.
#
# ВАЖНО: копии лежат на том же сервере. Это спасает от ошибочного удаления
# данных, но не от потери самого сервера — храните копию ещё и вне его.
set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/temart}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }

cd "$PROJECT_DIR" || fail "нет каталога $PROJECT_DIR"
[ -f .env ] || fail "нет файла .env рядом с docker-compose"

# Читаем креды построчно: `. ./.env` спотыкается о пароли со спецсимволами.
env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2- ; }
DB_USER=$(env_value POSTGRES_USER)
DB_NAME=$(env_value POSTGRES_DB)
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || fail "в .env нет POSTGRES_USER/POSTGRES_DB"

mkdir -p "$BACKUP_DIR"
STAMP=$(date '+%Y-%m-%d-%H%M')

# --- 1. База -----------------------------------------------------------------
PG_CID=$(docker compose ps -q postgres || true)
[ -n "$PG_CID" ] || fail "контейнер postgres не запущен"

TMP_DUMP="$BACKUP_DIR/.db-$STAMP.part"
# Пишем во временный файл: оборванный дамп не должен выглядеть как готовая копия.
if docker exec "$PG_CID" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$TMP_DUMP"; then
	mv "$TMP_DUMP" "$BACKUP_DIR/db-$STAMP.dump"
	log "база: db-$STAMP.dump ($(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1))"
else
	rm -f "$TMP_DUMP"
	fail "pg_dump не отработал"
fi

# --- 2. Файлы медкарты -------------------------------------------------------
# Том монтируем в одноразовый alpine: бэкап не зависит от того, жив ли backend.
UPLOADS_VOL=$(docker volume ls -q | grep -E '(^|_)uploads$' | head -1 || true)
if [ -n "$UPLOADS_VOL" ]; then
	docker run --rm \
		-v "$UPLOADS_VOL":/data:ro \
		-v "$BACKUP_DIR":/backup \
		alpine:3.20 \
		tar czf "/backup/.uploads-$STAMP.part" -C /data . \
		|| fail "не удалось упаковать файлы из тома $UPLOADS_VOL"
	mv "$BACKUP_DIR/.uploads-$STAMP.part" "$BACKUP_DIR/uploads-$STAMP.tgz"
	log "файлы: uploads-$STAMP.tgz ($(du -h "$BACKUP_DIR/uploads-$STAMP.tgz" | cut -f1))"
else
	log "том с файлами не найден — пропускаю (копия базы всё равно сделана)"
fi

# --- 3. Ротация --------------------------------------------------------------
# Только после успешной записи новой копии: иначе неудачный запуск подчистил бы
# историю, не оставив ничего взамен.
find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tgz' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name '.*.part' -mtime +1 -delete

log "готово; храним $KEEP_DAYS дней, сейчас копий: $(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' | wc -l), занято $(du -sh "$BACKUP_DIR" | cut -f1)"
