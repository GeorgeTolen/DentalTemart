package handlers_test

// Сквозной тест онлайн-записи на встроенном PostgreSQL (бинарники качаются
// один раз в ~/.embedded-postgres-go). Пропускается с `go test -short`.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/auth"
	"temart/internal/booking"
	"temart/internal/config"
	"temart/internal/db"
	"temart/internal/db/sqlc"
	"temart/internal/handlers"
	"temart/internal/middleware"
	"temart/internal/notify"
)

const pgPort = 54329

type env struct {
	t      *testing.T
	srv    *httptest.Server
	q      *sqlc.Queries
	cookie *http.Cookie
	slug   string
}

func startEnv(t *testing.T) *env {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test: skipped in -short mode")
	}
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Port(pgPort).
		Database("temart_test").
		Logger(io.Discard))
	if err := pg.Start(); err != nil {
		t.Skipf("embedded postgres unavailable: %v", err)
	}
	t.Cleanup(func() { _ = pg.Stop() })

	url := fmt.Sprintf("postgres://postgres:postgres@localhost:%d/temart_test?sslmode=disable", pgPort)
	if err := db.RunMigrations(url); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	q := sqlc.New(pool)

	clinic, err := q.CreateClinic(ctx, sqlc.CreateClinicParams{
		Name: "Демо", Slug: "demo",
		Address:  pgtype.Text{String: "ул. Абая 1", Valid: true},
		Phone:    pgtype.Text{String: "+77001112233", Valid: true},
		IsActive: true,
	})
	if err != nil {
		t.Fatalf("clinic: %v", err)
	}
	if _, err := q.UpdateClinicBookingSettings(ctx, sqlc.UpdateClinicBookingSettingsParams{
		ID: clinic.ID, MapUrl: pgtype.Text{String: "https://2gis.kz/demo", Valid: true}, OnlineBooking: true,
	}); err != nil {
		t.Fatalf("settings: %v", err)
	}
	for _, name := range []string{"Врач Один", "Врач Два"} {
		if _, err := q.CreateDoctor(ctx, sqlc.CreateDoctorParams{
			ClinicID: clinic.ID, FullName: name, IsActive: true,
			Color: "#" + fmt.Sprintf("%06x", len(name)*4000),
		}); err != nil {
			t.Fatalf("doctor: %v", err)
		}
	}
	owner, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		ClinicID: pgtype.Int8{Int64: clinic.ID, Valid: true},
		FullName: "Владелец", Email: "owner@demo.kz", PasswordHash: "x", Role: "owner",
	})
	if err != nil {
		t.Fatalf("owner: %v", err)
	}

	cfg := &config.Config{
		JWTSecret: "test", AccessTTL: time.Hour, RefreshTTL: time.Hour,
		PublicBaseURL: "http://localhost:5173", MessengerProvider: "noop", BookingDebugCode: true,
	}
	tokens := auth.NewManager(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
	h := handlers.New(pool, tokens, cfg, handlers.Deps{
		Messenger: notify.Noop{}, Enqueuer: notify.NewEnqueuer(cfg.PublicBaseURL),
	})
	srv := httptest.NewServer(h.Router())
	t.Cleanup(srv.Close)

	access, err := tokens.IssueAccess(owner.ID, clinic.ID, 0, "owner")
	if err != nil {
		t.Fatalf("token: %v", err)
	}
	return &env{
		t: t, srv: srv, q: q, slug: "demo",
		cookie: &http.Cookie{Name: middleware.AccessCookie, Value: access},
	}
}

func (e *env) do(method, path string, body any, authed bool) (int, map[string]any) {
	e.t.Helper()
	var payload io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		payload = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, e.srv.URL+path, payload)
	req.Header.Set("Content-Type", "application/json")
	if authed {
		req.AddCookie(e.cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// tomorrow — ближайший день, на который точно есть все 9 слотов (lead time не
// мешает), в формате YYYY-MM-DD по поясу клиники.
func tomorrow() string {
	return time.Now().In(booking.Location()).AddDate(0, 0, 1).Format("2006-01-02")
}

func (e *env) code(phone string) string {
	e.t.Helper()
	status, out := e.do("POST", "/api/public/clinics/"+e.slug+"/verify", map[string]string{"phone": phone}, false)
	if status != 200 {
		e.t.Fatalf("verify %s: status %d %v", phone, status, out)
	}
	c, _ := out["debug_code"].(string)
	if c == "" {
		e.t.Fatalf("no debug code in %v", out)
	}
	return c
}

func TestOnlineBookingFlow(t *testing.T) {
	e := startEnv(t)
	base := "/api/public/clinics/" + e.slug

	// Клиника видна без авторизации, чужие данные не отдаются.
	status, clinic := e.do("GET", base, nil, false)
	if status != 200 || clinic["name"] != "Демо" {
		t.Fatalf("public clinic: %d %v", status, clinic)
	}
	if n := len(clinic["doctors"].([]any)); n != 2 {
		t.Fatalf("doctors: %d", n)
	}
	if status, _ := e.do("GET", "/api/public/clinics/nope", nil, false); status != 404 {
		t.Fatalf("unknown slug: %d", status)
	}

	// Слоты на завтра: 9 часовых, каждый свободен у обоих врачей.
	day := tomorrow()
	status, slots := e.do("GET", base+"/slots?date="+day, nil, false)
	if status != 200 {
		t.Fatalf("slots: %d %v", status, slots)
	}
	list := slots["slots"].([]any)
	if len(list) != 9 {
		t.Fatalf("expected 9 slots, got %d", len(list))
	}
	first := list[0].(map[string]any)
	firstStart := first["start"].(string)
	if ids := first["doctor_ids"].([]any); len(ids) != 2 {
		t.Fatalf("doctor ids: %v", ids)
	}

	// Ошибочный номер и неверный код отклоняются.
	if status, _ := e.do("POST", base+"/verify", map[string]string{"phone": "12345"}, false); status != 400 {
		t.Fatalf("bad phone: %d", status)
	}
	phone := "+77011234567"
	code := e.code(phone)
	if status, out := e.do("POST", base+"/book", map[string]any{
		"phone": phone, "code": "0000", "name": "Айгерим", "doctor_id": 0, "start_time": firstStart,
	}, false); status != 400 {
		t.Fatalf("wrong code should be 400: %d %v", status, out)
	}

	// Запись «к любому врачу».
	status, booked := e.do("POST", base+"/book", map[string]any{
		"phone": phone, "code": code, "name": "айгерим сатпаева", "doctor_id": 0, "start_time": firstStart,
	}, false)
	if status != 201 {
		t.Fatalf("book: %d %v", status, booked)
	}
	if booked["status"] != "pending" {
		t.Fatalf("status: %v", booked["status"])
	}
	token := booked["public_token"].(string)
	if booked["status_url"] != "http://localhost:5173/book/demo/status/"+token {
		t.Fatalf("status url: %v", booked["status_url"])
	}

	// Слот теперь свободен только у второго врача.
	_, slots = e.do("GET", base+"/slots?date="+day, nil, false)
	first = slots["slots"].([]any)[0].(map[string]any)
	if ids := first["doctor_ids"].([]any); len(ids) != 1 {
		t.Fatalf("after booking doctor ids: %v", ids)
	}

	// Пациент создан с нормализованным именем и телефоном.
	p, err := e.q.GetPatientByPhone(context.Background(), sqlc.GetPatientByPhoneParams{
		ClinicID: 1, Phone: pgtype.Text{String: phone, Valid: true},
	})
	if err != nil || p.FullName != "Айгерим Сатпаева" {
		t.Fatalf("patient: %v %v", p.FullName, err)
	}

	// Уведомление «заявка принята» в очереди; воркер с noop доставляет его.
	// Воркер тикает раз в 3 секунды - ждём с запасом.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	go notify.NewWorker(e.q, notify.Noop{}, nil).Run(ctx)
	waitSent := func(want int) {
		t.Helper()
		deadline := time.Now().Add(8 * time.Second)
		for time.Now().Before(deadline) {
			rows, _ := e.q.ListNotificationsByAppointment(context.Background(),
				pgtype.Int8{Int64: int64(booked["id"].(float64)), Valid: true})
			sent := 0
			for _, r := range rows {
				if r.Status == "sent" {
					sent++
				}
			}
			if sent >= want {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatalf("expected %d sent notifications", want)
	}
	waitSent(1)

	// CRM: заявка в списке, врач бы её не увидел (requireManager).
	status, reqs := e.do("GET", "/api/appointments/requests", nil, true)
	if status != 200 || reqs["count"] != float64(1) {
		t.Fatalf("requests: %d %v", status, reqs)
	}
	if status, _ := e.do("GET", "/api/appointments/requests", nil, false); status != 401 {
		t.Fatalf("unauthenticated requests: %d", status)
	}

	// Подтверждение: статус scheduled, клиенту ушло «подтверждена».
	id := int64(booked["id"].(float64))
	status, approved := e.do("POST", fmt.Sprintf("/api/appointments/%d/approve", id), nil, true)
	if status != 200 || approved["status"] != "scheduled" {
		t.Fatalf("approve: %d %v", status, approved)
	}
	waitSent(2)
	cancel()
	rows, _ := e.q.ListNotificationsByAppointment(context.Background(), pgtype.Int8{Int64: id, Valid: true})
	last := rows[len(rows)-1].Text
	for _, want := range []string{"Демо: запись подтверждена", "Врач Один", "ул. Абая 1", "https://2gis.kz/demo", "+77001112233"} {
		if !bytes.Contains([]byte(last), []byte(want)) {
			t.Fatalf("approved text lacks %q:\n%s", want, last)
		}
	}
	// Повторное подтверждение - 409.
	if status, _ := e.do("POST", fmt.Sprintf("/api/appointments/%d/approve", id), nil, true); status != 409 {
		t.Fatalf("double approve: %d", status)
	}

	// Статусная страница клиента.
	status, st := e.do("GET", base+"/bookings/"+token, nil, false)
	if status != 200 || st["status"] != "scheduled" {
		t.Fatalf("booking status: %d %v", status, st)
	}
	if status, _ := e.do("GET", base+"/bookings/nope-nope-nope-nope", nil, false); status != 404 {
		t.Fatalf("bad token: %d", status)
	}

	// Лимит на код: три за десять минут, четвёртый - 429.
	other := "+77019876543"
	for i := 0; i < 3; i++ {
		e.code(other)
	}
	if status, _ := e.do("POST", base+"/verify", map[string]string{"phone": other}, false); status != 429 {
		t.Fatalf("rate limit: %d", status)
	}
}

func TestOnlineBookingRace(t *testing.T) {
	e := startEnv(t)
	base := "/api/public/clinics/" + e.slug
	day := tomorrow()
	_, slots := e.do("GET", base+"/slots?date="+day, nil, false)
	list := slots["slots"].([]any)
	// Второй слот дня; врач 1 - чтобы обе заявки боролись за одного врача.
	start := list[1].(map[string]any)["start"].(string)

	phones := []string{"+77021111111", "+77022222222", "+77023333333"}
	codes := make([]string, len(phones))
	for i, p := range phones {
		codes[i] = e.code(p)
	}

	var wg sync.WaitGroup
	results := make([]int, len(phones))
	for i := range phones {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], _ = e.do("POST", base+"/book", map[string]any{
				"phone": phones[i], "code": codes[i], "name": "Клиент", "doctor_id": 1, "start_time": start,
			}, false)
		}(i)
	}
	wg.Wait()
	created, conflicts := 0, 0
	for _, s := range results {
		switch s {
		case 201:
			created++
		case 409:
			conflicts++
		}
	}
	if created != 1 || conflicts != 2 {
		t.Fatalf("race: statuses %v", results)
	}

	// Заявку можно отклонить, и слот снова свободен.
	status, reqs := e.do("GET", "/api/appointments/requests", nil, true)
	if status != 200 {
		t.Fatalf("requests: %d", status)
	}
	item := reqs["items"].([]any)[0].(map[string]any)
	id := int64(item["id"].(float64))
	if status, out := e.do("POST", fmt.Sprintf("/api/appointments/%d/reject", id), map[string]string{"reason": "нет врача"}, true); status != 200 || out["status"] != "cancelled" {
		t.Fatalf("reject: %d %v", status, out)
	}
	_, slots = e.do("GET", base+"/slots?date="+day+"&doctor_id=1", nil, false)
	if len(slots["slots"].([]any)) != 9 {
		t.Fatalf("slot not freed after reject: %d", len(slots["slots"].([]any)))
	}
}
