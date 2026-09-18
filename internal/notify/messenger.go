// Package notify доставляет сообщения клиентам: очередь (outbox) в базе,
// фоновый воркер и провайдеры WhatsApp за одним интерфейсом, чтобы свой шлюз
// на Baileys можно было заменить на Green API сменой переменной окружения.
package notify

import (
	"context"
	"errors"
	"fmt"

	"temart/internal/config"
	"temart/internal/db/sqlc"
)

// Messenger отправляет текст на номер WhatsApp от имени клиники: у каждой
// клиники свой привязанный номер (сессия), поэтому clinicID обязателен.
type Messenger interface {
	Send(ctx context.Context, clinicID int64, phone, text string) error
}

// GatewayStatus — состояние WhatsApp-сессии клиники.
type GatewayStatus struct {
	Provider  string `json:"provider"`
	Connected bool   `json:"connected"`
	// QR — data URL с QR-кодом для привязки; пуст, когда сессия подключена
	// или ещё не запущена.
	QR string `json:"qr,omitempty"`
	// Me — привязанный номер (когда подключено).
	Me string `json:"me,omitempty"`
	// Error — последняя ошибка сессии, если есть.
	Error string `json:"error,omitempty"`
}

// SessionManager умеет привязывать и отвязывать номер клиники. Реализуют
// провайдеры, у которых есть QR-привязка (наш шлюз).
type SessionManager interface {
	Status(ctx context.Context, clinicID int64) (GatewayStatus, error)
	Start(ctx context.Context, clinicID int64) (GatewayStatus, error)
	Logout(ctx context.Context, clinicID int64) error
}

// ErrPermanent помечает ошибку, после которой повторять отправку бессмысленно
// (номера нет в WhatsApp). Воркер сразу ставит failed.
var ErrPermanent = errors.New("permanent delivery error")

// ErrNotConnected — у клиники не подключён WhatsApp. Воркер оставляет
// сообщение в очереди: владелец может привязать номер через пару минут.
var ErrNotConnected = errors.New("whatsapp клиники не подключён")

// Permanent оборачивает ошибку как окончательную.
func Permanent(msg string) error {
	return fmt.Errorf("%w: %s", ErrPermanent, msg)
}

// NewFromConfig собирает провайдера по настройкам. q нужен провайдерам,
// которые читают реквизиты клиники из базы (Green API).
func NewFromConfig(cfg *config.Config, q *sqlc.Queries) (Messenger, error) {
	switch cfg.MessengerProvider {
	case "noop":
		return Noop{}, nil
	case "baileys":
		return NewBaileys(cfg.WAGatewayURL, cfg.WAGatewayToken), nil
	case "greenapi":
		return NewGreenAPI(q), nil
	}
	return nil, fmt.Errorf("unknown messenger provider %q", cfg.MessengerProvider)
}
