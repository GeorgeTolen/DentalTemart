package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"temart/internal/db/sqlc"
)

// GreenAPI — платный провайдер на будущее. У Green API один инстанс = один
// номер, поэтому реквизиты берутся из карточки клиники (greenapi_instance,
// greenapi_token); клиника без реквизитов считается не подключённой.
type GreenAPI struct {
	q      *sqlc.Queries
	client *http.Client
}

// NewGreenAPI builds the provider.
func NewGreenAPI(q *sqlc.Queries) *GreenAPI {
	return &GreenAPI{q: q, client: &http.Client{Timeout: 20 * time.Second}}
}

func (g *GreenAPI) creds(ctx context.Context, clinicID int64) (string, string, error) {
	c, err := g.q.GetClinic(ctx, clinicID)
	if err != nil {
		return "", "", err
	}
	if !c.GreenapiInstance.Valid || c.GreenapiInstance.String == "" ||
		!c.GreenapiToken.Valid || c.GreenapiToken.String == "" {
		return "", "", ErrNotConnected
	}
	return c.GreenapiInstance.String, c.GreenapiToken.String, nil
}

// Send отправляет текст через инстанс клиники.
func (g *GreenAPI) Send(ctx context.Context, clinicID int64, phone, text string) error {
	instance, token, err := g.creds(ctx, clinicID)
	if err != nil {
		return err
	}
	digits := strings.TrimPrefix(phone, "+")
	body, _ := json.Marshal(map[string]string{
		"chatId":  digits + "@c.us",
		"message": text,
	})
	url := "https://api.green-api.com/waInstance" + instance + "/sendMessage/" + token
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("greenapi: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode == http.StatusOK {
		return nil
	}
	if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnauthorized ||
		resp.StatusCode == http.StatusForbidden {
		return Permanent(fmt.Sprintf("greenapi: status %d: %s", resp.StatusCode, string(data)))
	}
	return fmt.Errorf("greenapi: status %d: %s", resp.StatusCode, string(data))
}

// Status у Green API: подключено, если у клиники есть реквизиты. QR-привязка
// делается в кабинете Green API, а не у нас.
func (g *GreenAPI) Status(ctx context.Context, clinicID int64) (GatewayStatus, error) {
	_, _, err := g.creds(ctx, clinicID)
	if err == ErrNotConnected {
		return GatewayStatus{Provider: "greenapi"}, nil
	}
	if err != nil {
		return GatewayStatus{}, err
	}
	return GatewayStatus{Provider: "greenapi", Connected: true}, nil
}

// Start у Green API не нужен: реквизиты вводятся в настройках клиники.
func (g *GreenAPI) Start(ctx context.Context, clinicID int64) (GatewayStatus, error) {
	return g.Status(ctx, clinicID)
}

// Logout стирает реквизиты клиники.
func (g *GreenAPI) Logout(ctx context.Context, clinicID int64) error {
	_, err := g.q.UpdateClinicGreenAPI(ctx, sqlc.UpdateClinicGreenAPIParams{ID: clinicID})
	return err
}
