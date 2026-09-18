package handlers

import (
	"context"
	"errors"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/booking"
	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/notify"
)

// ---------------------------------------------------------------------------
// Публичная страница онлайн-записи: /book/{slug}. Без авторизации, поэтому
// клиника берётся из slug в пути, а не из токена, и всё защищено лимитами.
// ---------------------------------------------------------------------------

// kzPhoneRe — казахстанский номер после normalizePhone.
var kzPhoneRe = regexp.MustCompile(`^\+7\d{10}$`)

// Лимиты публичных эндпоинтов.
const (
	limitVerifyPerIP    = 10 // в час
	limitVerifyPerPhone = 3  // за 10 минут
	limitBookPerIP      = 20 // в час
	limitSlotsPerIP     = 120
)

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func tooMany() error {
	return httpx.NewError(http.StatusTooManyRequests, "слишком много запросов, попробуйте позже")
}

// loadPublicClinic находит клинику по slug и проверяет, что онлайн-запись у
// неё открыта.
func (h *Handlers) loadPublicClinic(ctx context.Context, slug string) (sqlc.Clinic, error) {
	c, err := h.q.GetClinicBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Clinic{}, httpx.NewError(http.StatusNotFound, "клиника не найдена")
		}
		return sqlc.Clinic{}, err
	}
	if !c.IsActive || clinicFrozen(c.AccessExpiresAt) || !c.OnlineBooking {
		return sqlc.Clinic{}, httpx.NewError(http.StatusForbidden, "онлайн-запись временно недоступна")
	}
	return c, nil
}

// whatsappConnected — может ли клиника слать сообщения. Для заглушки noop
// считаем «да»: код всё равно «отправляется» в лог.
func (h *Handlers) whatsappConnected(ctx context.Context, clinicID int64) bool {
	if h.sessions == nil {
		return true
	}
	st, err := h.sessions.Status(ctx, clinicID)
	if err != nil {
		return false
	}
	return st.Connected || st.Provider == "noop"
}

type publicDoctorDTO struct {
	ID             int64   `json:"id"`
	FullName       string  `json:"full_name"`
	Specialization string  `json:"specialization"`
	AvatarURL      *string `json:"avatar_url"`
}

type publicClinicDTO struct {
	Name              string            `json:"name"`
	Slug              string            `json:"slug"`
	Address           string            `json:"address"`
	Phone             string            `json:"phone"`
	MapURL            string            `json:"map_url"`
	Doctors           []publicDoctorDTO `json:"doctors"`
	WorkdayStart      int               `json:"workday_start"`
	WorkdayEnd        int               `json:"workday_end"`
	SlotMinutes       int               `json:"slot_minutes"`
	HorizonDays       int               `json:"horizon_days"`
	WhatsAppConnected bool              `json:"whatsapp_connected"`
	TelegramBot       string            `json:"telegram_bot"`
}

// PublicClinic — данные клиники для страницы записи.
func (h *Handlers) PublicClinic(w http.ResponseWriter, r *http.Request) {
	c, err := h.loadPublicClinic(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	doctors, err := h.q.ListActiveDoctorsPublic(r.Context(), c.ID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	dto := publicClinicDTO{
		Name:              c.Name,
		Slug:              c.Slug,
		Address:           textVal(c.Address),
		Phone:             textVal(c.Phone),
		MapURL:            textVal(c.MapUrl),
		Doctors:           make([]publicDoctorDTO, 0, len(doctors)),
		WorkdayStart:      booking.WorkdayStart,
		WorkdayEnd:        booking.WorkdayEnd,
		SlotMinutes:       booking.SlotMinutes,
		HorizonDays:       booking.HorizonDays,
		WhatsAppConnected: h.whatsappConnected(r.Context(), c.ID),
	}
	if h.tg != nil {
		dto.TelegramBot = h.tg.Username()
	}
	for _, d := range doctors {
		var avatar *string
		if d.AvatarPath.Valid && d.AvatarPath.String != "" {
			u := "/api/public/clinics/" + c.Slug + "/doctors/" + itoa(d.ID) + "/avatar"
			avatar = &u
		}
		dto.Doctors = append(dto.Doctors, publicDoctorDTO{
			ID:             d.ID,
			FullName:       d.FullName,
			Specialization: textVal(d.Specialization),
			AvatarURL:      avatar,
		})
	}
	httpx.JSON(w, http.StatusOK, dto)
}

// PublicDoctorAvatar отдаёт фото врача для страницы записи.
func (h *Handlers) PublicDoctorAvatar(w http.ResponseWriter, r *http.Request) {
	c, err := h.loadPublicClinic(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: id, ClinicID: c.ID})
	if err != nil || !d.IsActive {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "врач не найден"))
		return
	}
	serveAvatar(w, r, d.AvatarPath)
}

type publicSlotDTO struct {
	Start     time.Time `json:"start"`
	End       time.Time `json:"end"`
	DoctorIDs []int64   `json:"doctor_ids"`
}

type publicSlotsDTO struct {
	Date  string          `json:"date"`
	Slots []publicSlotDTO `json:"slots"`
}

// PublicSlots — свободные слоты клиники на день (?date=YYYY-MM-DD&doctor_id=).
func (h *Handlers) PublicSlots(w http.ResponseWriter, r *http.Request) {
	if !h.limiter.Allow("slots:ip:"+clientIP(r), limitSlotsPerIP, time.Minute) {
		httpx.Fail(w, tooMany())
		return
	}
	c, err := h.loadPublicClinic(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	day, err := h.booking.ParseDay(r.URL.Query().Get("date"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var doctorID int64
	if raw := r.URL.Query().Get("doctor_id"); raw != "" && raw != "0" {
		if doctorID, err = idParamFromString(raw); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	slots, err := h.booking.Slots(r.Context(), c.ID, day, doctorID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := publicSlotsDTO{Date: day.Format(dateLayout), Slots: make([]publicSlotDTO, 0, len(slots))}
	for _, s := range slots {
		out.Slots = append(out.Slots, publicSlotDTO{Start: s.Start, End: s.End, DoctorIDs: s.DoctorIDs})
	}
	httpx.JSON(w, http.StatusOK, out)
}

type verifyRequest struct {
	Phone string `json:"phone"`
	// Website — поле-ловушка для ботов: люди его не видят и не заполняют.
	Website string `json:"website"`
}

type verifyResponse struct {
	OK     bool   `json:"ok"`
	TTLSec int    `json:"ttl_sec"`
	Phone  string `json:"phone"`
	// DebugCode отдаётся только при BOOKING_DEBUG_CODE=true (разработка).
	DebugCode string `json:"debug_code,omitempty"`
}

// PublicVerify отправляет клиенту код подтверждения номера в WhatsApp с
// номера клиники.
func (h *Handlers) PublicVerify(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.limiter.Allow("verify:ip:"+ip, limitVerifyPerIP, time.Hour) {
		httpx.Fail(w, tooMany())
		return
	}
	c, err := h.loadPublicClinic(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req verifyRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if req.Website != "" {
		// Бот заполнил ловушку — отвечаем как обычно, но ничего не делаем.
		httpx.JSON(w, http.StatusOK, verifyResponse{OK: true, TTLSec: int(booking.CodeTTL.Seconds())})
		return
	}
	phone := normalizePhone(req.Phone)
	if !kzPhoneRe.MatchString(phone) {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите казахстанский номер в формате +7 777 123 45 67"))
		return
	}
	if !h.limiter.Allow("verify:phone:"+phone, limitVerifyPerPhone, 10*time.Minute) {
		httpx.Fail(w, tooMany())
		return
	}
	code, err := h.verifier.Issue(c.ID, phone)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	sctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := h.messenger.Send(sctx, c.ID, phone, notify.CodeText(code)); err != nil {
		switch {
		case errors.Is(err, notify.ErrNotConnected):
			httpx.Fail(w, httpx.NewError(http.StatusServiceUnavailable, "клиника ещё не подключила WhatsApp, позвоните по телефону клиники"))
		case errors.Is(err, notify.ErrPermanent):
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "этот номер не зарегистрирован в WhatsApp"))
		default:
			httpx.Fail(w, httpx.NewError(http.StatusServiceUnavailable, "не удалось отправить код, попробуйте позже"))
		}
		return
	}
	resp := verifyResponse{OK: true, TTLSec: int(booking.CodeTTL.Seconds()), Phone: phone}
	if h.cfg.BookingDebugCode {
		resp.DebugCode = code
	}
	httpx.JSON(w, http.StatusOK, resp)
}

type bookRequest struct {
	Phone     string `json:"phone"`
	Code      string `json:"code"`
	Name      string `json:"name"`
	DoctorID  int64  `json:"doctor_id"`
	StartTime string `json:"start_time"`
	Website   string `json:"website"`
}

type bookResponse struct {
	ID           int64     `json:"id"`
	PublicToken  string    `json:"public_token"`
	Status       string    `json:"status"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	DoctorName   string    `json:"doctor_name"`
	StatusURL    string    `json:"status_url"`
	TelegramLink string    `json:"telegram_link"`
}

// PublicBook создаёт заявку после проверки кода.
func (h *Handlers) PublicBook(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !h.limiter.Allow("book:ip:"+ip, limitBookPerIP, time.Hour) {
		httpx.Fail(w, tooMany())
		return
	}
	c, err := h.loadPublicClinic(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	var req bookRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Fail(w, err)
		return
	}
	if req.Website != "" {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "проверьте корректность заполнения полей"))
		return
	}
	phone := normalizePhone(req.Phone)
	if !kzPhoneRe.MatchString(phone) {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите казахстанский номер"))
		return
	}
	name := normalizeName(req.Name)
	if n := utf8.RuneCountInString(name); n < 2 || n > 80 {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "укажите имя (от 2 до 80 символов)"))
		return
	}
	start, err := time.Parse(time.RFC3339, req.StartTime)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "некорректное время начала"))
		return
	}
	code := strings.TrimSpace(req.Code)
	if err := h.verifier.Check(c.ID, phone, code); err != nil {
		httpx.Fail(w, err)
		return
	}
	row, err := h.booking.Book(r.Context(), booking.BookInput{
		ClinicID: c.ID,
		DoctorID: req.DoctorID,
		Start:    start.UTC(),
		Name:     name,
		Phone:    phone,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	h.logEventAs(r.Context(), c.ID, 0, onlineActor, eventBookingRequest,
		"Заявка: "+row.PatientName+", "+row.StartTime.In(booking.Location()).Format("02.01.2006 15:04")+", врач "+row.DoctorName)
	httpx.JSON(w, http.StatusCreated, h.bookResponse(row))
}

func (h *Handlers) bookResponse(row sqlc.GetAppointmentByPublicTokenRow) bookResponse {
	resp := bookResponse{
		ID:          row.ID,
		PublicToken: row.PublicToken.String,
		Status:      row.Status,
		StartTime:   row.StartTime,
		EndTime:     row.EndTime,
		DoctorName:  row.DoctorName,
		StatusURL:   h.enq.StatusURL(row.ClinicSlug, row.PublicToken.String),
	}
	if h.tg != nil && !row.NotifyTelegramChatID.Valid {
		resp.TelegramLink = h.tg.DeepLink(row.PublicToken.String)
	}
	return resp
}

type bookingStatusDTO struct {
	Status         string    `json:"status"`
	StartTime      time.Time `json:"start_time"`
	EndTime        time.Time `json:"end_time"`
	DoctorName     string    `json:"doctor_name"`
	PatientName    string    `json:"patient_name"`
	TelegramLinked bool      `json:"telegram_linked"`
	TelegramLink   string    `json:"telegram_link"`
	Clinic         struct {
		Name    string `json:"name"`
		Address string `json:"address"`
		Phone   string `json:"phone"`
		MapURL  string `json:"map_url"`
	} `json:"clinic"`
}

// PublicBookingStatus — статус заявки по секретному токену.
func (h *Handlers) PublicBookingStatus(w http.ResponseWriter, r *http.Request) {
	if !h.limiter.Allow("status:ip:"+clientIP(r), limitSlotsPerIP, time.Minute) {
		httpx.Fail(w, tooMany())
		return
	}
	slug := chi.URLParam(r, "slug")
	token := chi.URLParam(r, "token")
	if len(token) < 16 || len(token) > 64 {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "заявка не найдена"))
		return
	}
	row, err := h.q.GetAppointmentByPublicToken(r.Context(), pgtype.Text{String: token, Valid: true})
	if err != nil || !strings.EqualFold(row.ClinicSlug, slug) {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "заявка не найдена"))
		return
	}
	var dto bookingStatusDTO
	dto.Status = row.Status
	dto.StartTime = row.StartTime
	dto.EndTime = row.EndTime
	dto.DoctorName = row.DoctorName
	dto.PatientName = row.PatientName
	dto.TelegramLinked = row.NotifyTelegramChatID.Valid
	if h.tg != nil && !dto.TelegramLinked {
		dto.TelegramLink = h.tg.DeepLink(token)
	}
	dto.Clinic.Name = row.ClinicName
	dto.Clinic.Address = textVal(row.ClinicAddress)
	dto.Clinic.Phone = textVal(row.ClinicPhone)
	dto.Clinic.MapURL = textVal(row.ClinicMapUrl)
	httpx.JSON(w, http.StatusOK, dto)
}

// TelegramStart — обработчик «/start <token>» бота: привязывает чат к заявке
// и отвечает подтверждением. Возвращает текст ответа клиенту.
func (h *Handlers) TelegramStart(ctx context.Context, token string, chatID int64) string {
	appt, err := h.q.BindTelegramChat(ctx, sqlc.BindTelegramChatParams{
		PublicToken:          pgtype.Text{String: token, Valid: true},
		NotifyTelegramChatID: pgtype.Int8{Int64: chatID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "Ссылка устарела или неверна. Откройте её заново со страницы записи."
		}
		return "Не удалось привязать чат, попробуйте позже."
	}
	row, err := h.q.GetAppointmentByPublicToken(ctx, appt.PublicToken)
	if err != nil {
		return "Готово! Уведомления о записи будут приходить сюда."
	}
	return notify.Render(notify.KindTelegramLinked, notify.View{ClinicName: row.ClinicName}) +
		"\n\nЗапись: " + row.StartTime.In(booking.Location()).Format("02.01.2006 в 15:04") +
		", врач " + row.DoctorName + " (" + statusLabel(row.Status) + ")."
}

func statusLabel(status string) string {
	switch status {
	case "pending":
		return "ожидает подтверждения"
	case "scheduled":
		return "подтверждена"
	case "cancelled":
		return "отменена"
	case "completed":
		return "завершена"
	}
	return status
}
