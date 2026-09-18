package notify

import (
	"context"
	"log/slog"
)

// Noop ничего не отправляет, только пишет сообщение в лог. Провайдер для
// разработки и для стенда без WhatsApp.
type Noop struct{}

// Send логирует сообщение и считает его доставленным.
func (Noop) Send(_ context.Context, clinicID int64, phone, text string) error {
	slog.Info("noop message", "clinic_id", clinicID, "phone", phone, "text", text)
	return nil
}

// Status всегда «не подключено»: привязывать нечего.
func (Noop) Status(_ context.Context, _ int64) (GatewayStatus, error) {
	return GatewayStatus{Provider: "noop"}, nil
}

// Start у заглушки ничего не делает.
func (Noop) Start(_ context.Context, _ int64) (GatewayStatus, error) {
	return GatewayStatus{Provider: "noop"}, nil
}

// Logout у заглушки ничего не делает.
func (Noop) Logout(_ context.Context, _ int64) error { return nil }
