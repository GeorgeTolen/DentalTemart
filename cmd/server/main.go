// Command server is the Temart API entrypoint. It connects to PostgreSQL,
// applies migrations, optionally bootstraps the owner account and serves the
// REST API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Образ alpine без tzdata: часовой пояс клиник (Asia/Almaty) берём из
	// встроенной базы Go.
	_ "time/tzdata"

	"temart/internal/auth"
	"temart/internal/config"
	"temart/internal/db"
	"temart/internal/db/sqlc"
	"temart/internal/handlers"
	"temart/internal/notify"
	"temart/internal/notify/telegram"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("server stopped with error", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
		return err
	}
	slog.Info("migrations applied")

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	q := sqlc.New(pool)
	if err := db.BootstrapSuperadmin(ctx, q, cfg.SuperadminName, cfg.SuperadminEmail, cfg.SuperadminPassword); err != nil {
		return err
	}

	// Уведомления клиентам: провайдер WhatsApp, Telegram-бот и воркер очереди.
	messenger, err := notify.NewFromConfig(cfg, q)
	if err != nil {
		return err
	}
	slog.Info("messenger", "provider", cfg.MessengerProvider)

	var bot *telegram.Bot
	if cfg.TelegramBotToken != "" {
		bot = telegram.New(cfg.TelegramBotToken)
	}

	tokens := auth.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
	h := handlers.New(pool, tokens, cfg, handlers.Deps{
		Messenger: messenger,
		Enqueuer:  notify.NewEnqueuer(cfg.PublicBaseURL),
		Telegram:  bot,
	})

	var tgSender notify.TelegramSender
	if bot != nil {
		bot.OnStart = h.TelegramStart
		if err := bot.Start(ctx); err != nil {
			// Бот не должен блокировать запуск CRM: без него просто нет канала.
			slog.Error("telegram bot failed to start", "err", err)
		} else {
			tgSender = bot
		}
	}
	go notify.NewWorker(q, messenger, tgSender).Run(ctx)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           h.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		slog.Info("shutting down")
		cancel()
		shutdownCtx, scancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer scancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	slog.Info("listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
