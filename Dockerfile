# --- frontend build stage ---
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- backend build stage ---
FROM golang:1.26-alpine AS build
WORKDIR /src

# Cache deps first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

# --- run stage ---
FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
RUN mkdir -p /app/uploads && chown -R app:app /app
COPY --from=build /out/server /usr/local/bin/server
# Built SPA served by the Go server (single origin).
COPY --from=web /web/dist /app/web
ENV WEB_DIR=/app/web
USER app
EXPOSE 8080
ENTRYPOINT ["server"]
