// Package telegram — минимальный клиент Bot API на стандартной библиотеке:
// long polling за /start <token> и отправка сообщений. Публичный URL для
// вебхука не нужен.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// StartHandler обрабатывает «/start <payload>» и возвращает текст ответа.
type StartHandler func(ctx context.Context, payload string, chatID int64) string

// Bot — Telegram-бот.
type Bot struct {
	token    string
	client   *http.Client
	username string
	// OnStart вызывается на каждое /start с непустым аргументом.
	OnStart StartHandler
}

// New builds a Bot; username заполняется в Start через getMe.
func New(token string) *Bot {
	return &Bot{token: token, client: &http.Client{Timeout: 45 * time.Second}}
}

// Username — @имя бота без «@» (пусто до успешного getMe).
func (b *Bot) Username() string { return b.username }

// DeepLink — ссылка, по которой клиент открывает бота с payload.
func (b *Bot) DeepLink(payload string) string {
	if b == nil || b.username == "" {
		return ""
	}
	return "https://t.me/" + b.username + "?start=" + url.QueryEscape(payload)
}

type apiResponse struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

func (b *Bot) call(ctx context.Context, method string, params any, out any) error {
	body, err := json.Marshal(params)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.telegram.org/bot"+b.token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	var ar apiResponse
	if err := json.Unmarshal(data, &ar); err != nil {
		return fmt.Errorf("telegram: bad response: %w", err)
	}
	if !ar.OK {
		return fmt.Errorf("telegram: %s", ar.Description)
	}
	if out != nil {
		return json.Unmarshal(ar.Result, out)
	}
	return nil
}

// SendChat отправляет текст в чат.
func (b *Bot) SendChat(ctx context.Context, chatID int64, text string) error {
	return b.call(ctx, "sendMessage", map[string]any{
		"chat_id":                  chatID,
		"text":                     text,
		"disable_web_page_preview": true,
	}, nil)
}

type update struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
}

// Start делает getMe и крутит long polling до отмены ctx. Ошибки сети не
// останавливают бота — пауза и новая попытка.
func (b *Bot) Start(ctx context.Context) error {
	var me struct {
		Username string `json:"username"`
	}
	if err := b.call(ctx, "getMe", map[string]any{}, &me); err != nil {
		return err
	}
	b.username = me.Username
	slog.Info("telegram bot started", "username", me.Username)

	go b.poll(ctx)
	return nil
}

func (b *Bot) poll(ctx context.Context) {
	var offset int64
	backoff := time.Second
	for ctx.Err() == nil {
		var updates []update
		err := b.call(ctx, "getUpdates", map[string]any{
			"offset":          offset,
			"timeout":         30,
			"allowed_updates": []string{"message"},
		}, &updates)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			slog.Warn("telegram: getUpdates", "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
		for _, u := range updates {
			offset = u.UpdateID + 1
			b.handle(ctx, u)
		}
	}
}

func (b *Bot) handle(ctx context.Context, u update) {
	if u.Message == nil {
		return
	}
	text := strings.TrimSpace(u.Message.Text)
	if !strings.HasPrefix(text, "/start") {
		return
	}
	payload := strings.TrimSpace(strings.TrimPrefix(text, "/start"))
	chatID := u.Message.Chat.ID
	reply := "Откройте ссылку «Получать уведомления в Telegram» на странице записи, чтобы привязать чат."
	if payload != "" && b.OnStart != nil {
		hctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		reply = b.OnStart(hctx, payload, chatID)
		cancel()
	}
	if reply == "" {
		return
	}
	sctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := b.SendChat(sctx, chatID, reply); err != nil {
		slog.Warn("telegram: reply", "chat", strconv.FormatInt(chatID, 10), "err", err)
	}
}

// ErrDisabled возвращается, когда бот не настроен.
var ErrDisabled = errors.New("telegram bot is disabled")
