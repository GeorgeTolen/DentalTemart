package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Baileys — клиент нашего шлюза wa-gateway (см. каталог wa-gateway/). Шлюз
// держит по одной WhatsApp-сессии на клинику; идентификатор сессии — id
// клиники.
type Baileys struct {
	base   string
	token  string
	client *http.Client
}

// NewBaileys builds a client for the gateway at base (без завершающего слэша).
func NewBaileys(base, token string) *Baileys {
	return &Baileys{
		base:   base,
		token:  token,
		client: &http.Client{Timeout: 20 * time.Second},
	}
}

type gatewayStatus struct {
	Connected bool   `json:"connected"`
	QR        string `json:"qr"`
	Me        string `json:"me"`
	Error     string `json:"error"`
}

type gatewayError struct {
	Error string `json:"error"`
}

func (b *Baileys) sessionURL(clinicID int64, suffix string) string {
	return b.base + "/sessions/" + strconv.FormatInt(clinicID, 10) + suffix
}

func (b *Baileys) do(ctx context.Context, method, url string, body any) (int, []byte, error) {
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		payload = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, payload)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("X-Gateway-Token", b.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := b.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, nil, err
	}
	return resp.StatusCode, data, nil
}

// Send отправляет текст через сессию клиники.
func (b *Baileys) Send(ctx context.Context, clinicID int64, phone, text string) error {
	code, data, err := b.do(ctx, http.MethodPost, b.sessionURL(clinicID, "/send"), map[string]string{
		"phone": phone,
		"text":  text,
	})
	if err != nil {
		return fmt.Errorf("wa-gateway: %w", err)
	}
	if code == http.StatusOK {
		return nil
	}
	var ge gatewayError
	_ = json.Unmarshal(data, &ge)
	switch {
	case code == http.StatusNotFound && ge.Error == "not_on_whatsapp":
		return Permanent("номер не зарегистрирован в WhatsApp")
	case code == http.StatusServiceUnavailable:
		return ErrNotConnected
	case code == http.StatusBadRequest:
		return Permanent("wa-gateway отклонил сообщение: " + ge.Error)
	}
	return fmt.Errorf("wa-gateway: status %d: %s", code, ge.Error)
}

func (b *Baileys) parseStatus(code int, data []byte) (GatewayStatus, error) {
	if code == http.StatusNotFound {
		// Сессия ещё не создавалась.
		return GatewayStatus{Provider: "baileys"}, nil
	}
	if code != http.StatusOK {
		var ge gatewayError
		_ = json.Unmarshal(data, &ge)
		return GatewayStatus{}, fmt.Errorf("wa-gateway: status %d: %s", code, ge.Error)
	}
	var gs gatewayStatus
	if err := json.Unmarshal(data, &gs); err != nil {
		return GatewayStatus{}, err
	}
	return GatewayStatus{
		Provider:  "baileys",
		Connected: gs.Connected,
		QR:        gs.QR,
		Me:        gs.Me,
		Error:     gs.Error,
	}, nil
}

// Status возвращает состояние сессии клиники.
func (b *Baileys) Status(ctx context.Context, clinicID int64) (GatewayStatus, error) {
	code, data, err := b.do(ctx, http.MethodGet, b.sessionURL(clinicID, "/status"), nil)
	if err != nil {
		return GatewayStatus{}, fmt.Errorf("wa-gateway: %w", err)
	}
	return b.parseStatus(code, data)
}

// Start создаёт сессию (или возвращает существующую) и отдаёт её состояние —
// обычно с QR, который владелец сканирует телефоном.
func (b *Baileys) Start(ctx context.Context, clinicID int64) (GatewayStatus, error) {
	code, data, err := b.do(ctx, http.MethodPost, b.sessionURL(clinicID, "/start"), nil)
	if err != nil {
		return GatewayStatus{}, fmt.Errorf("wa-gateway: %w", err)
	}
	return b.parseStatus(code, data)
}

// Logout отвязывает номер клиники и удаляет сессию.
func (b *Baileys) Logout(ctx context.Context, clinicID int64) error {
	code, data, err := b.do(ctx, http.MethodPost, b.sessionURL(clinicID, "/logout"), nil)
	if err != nil {
		return fmt.Errorf("wa-gateway: %w", err)
	}
	if code == http.StatusOK || code == http.StatusNotFound {
		return nil
	}
	var ge gatewayError
	_ = json.Unmarshal(data, &ge)
	return errors.New("wa-gateway: " + ge.Error)
}
