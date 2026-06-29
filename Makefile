.PHONY: run build sqlc tidy vet compose-up compose-down web-dev web-build migrate-create

# Run the API locally (expects a reachable Postgres via DATABASE_URL / .env).
run:
	go run ./cmd/server

# Compile the server binary.
build:
	go build -o bin/server ./cmd/server

# Regenerate typed DB code from SQL.
sqlc:
	sqlc generate

tidy:
	go mod tidy

vet:
	go vet ./...

# Bring up Postgres + backend.
compose-up:
	docker-compose up --build

compose-down:
	docker-compose down

# Frontend.
web-dev:
	cd web && npm install && npm run dev

web-build:
	cd web && npm install && npm run build

# Create a new migration pair: make migrate-create name=add_something
migrate-create:
	@test -n "$(name)" || (echo "usage: make migrate-create name=<name>" && exit 1)
	@ts=$$(date +%Y%m%d%H%M%S); \
	touch internal/db/migrations/$${ts}_$(name).up.sql internal/db/migrations/$${ts}_$(name).down.sql; \
	echo "created internal/db/migrations/$${ts}_$(name).{up,down}.sql"
