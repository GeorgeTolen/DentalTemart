// Package config loads service configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration for the server.
type Config struct {
	DatabaseURL string
	Port        string
	CORSOrigins []string
	// WebDir, when set, is a directory of built frontend assets (web/dist) that
	// the server serves with SPA fallback. Empty in development (Vite serves it).
	WebDir string

	JWTSecret    string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	CookieSecure bool

	// Platform superadmin (администратор платформы). Bootstrapped on first start
	// when no superadmin exists. This is the account that manages every clinic.
	SuperadminName     string
	SuperadminEmail    string
	SuperadminPassword string
}

// Load reads configuration from the environment, optionally seeding it from a
// .env file if one is present. Missing required values produce an error.
func Load() (*Config, error) {
	// Best-effort: a .env file is convenient in development but not required.
	_ = godotenv.Load()

	cfg := &Config{
		DatabaseURL:        get("DATABASE_URL", "postgres://temart:temart@localhost:5432/temart?sslmode=disable"),
		Port:               get("PORT", "8080"),
		CORSOrigins:        splitAndTrim(get("CORS_ORIGIN", "http://localhost:5173")),
		WebDir:             get("WEB_DIR", ""),
		JWTSecret:          get("JWT_SECRET", ""),
		CookieSecure:       get("COOKIE_SECURE", "false") == "true",
		SuperadminName:     get("SUPERADMIN_NAME", get("OWNER_NAME", "")),
		SuperadminEmail:    get("SUPERADMIN_EMAIL", get("OWNER_EMAIL", "")),
		SuperadminPassword: get("SUPERADMIN_PASSWORD", get("OWNER_PASSWORD", "")),
	}

	var err error
	if cfg.AccessTTL, err = time.ParseDuration(get("ACCESS_TTL", "15m")); err != nil {
		return nil, fmt.Errorf("invalid ACCESS_TTL: %w", err)
	}
	// Refresh lives a year by default: the frontend silently refreshes expired
	// access tokens, so users sign in once and the session stays active.
	if cfg.RefreshTTL, err = time.ParseDuration(get("REFRESH_TTL", "8760h")); err != nil {
		return nil, fmt.Errorf("invalid REFRESH_TTL: %w", err)
	}

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}

func get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := trimSpace(s[start:i])
			if part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}
