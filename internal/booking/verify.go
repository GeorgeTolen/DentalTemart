package booking

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"math/big"
	"net/http"
	"strconv"
	"sync"
	"time"

	"temart/internal/httpx"
)

// Verifier хранит коды подтверждения номера в памяти процесса. Перезапуск
// сервера просто обнуляет выданные коды — клиент запросит новый.
type Verifier struct {
	mu    sync.Mutex
	codes map[string]codeEntry
	now   func() time.Time
}

type codeEntry struct {
	hash     string
	expires  time.Time
	attempts int
}

// NewVerifier builds a Verifier and starts its janitor.
func NewVerifier() *Verifier {
	v := &Verifier{codes: map[string]codeEntry{}, now: time.Now}
	go v.janitor()
	return v
}

func key(clinicID int64, phone string) string {
	return strconv.FormatInt(clinicID, 10) + ":" + phone
}

func hashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// Issue генерирует новый 4-значный код для номера (старый перестаёт
// действовать) и возвращает его — вызывающий отправляет его клиенту.
func (v *Verifier) Issue(clinicID int64, phone string) (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(9000))
	if err != nil {
		return "", err
	}
	code := strconv.FormatInt(1000+n.Int64(), 10)
	v.mu.Lock()
	v.codes[key(clinicID, phone)] = codeEntry{hash: hashCode(code), expires: v.now().Add(CodeTTL)}
	v.mu.Unlock()
	return code, nil
}

// Check сверяет код. Верный код одноразовый: после успеха он стирается.
func (v *Verifier) Check(clinicID int64, phone, code string) error {
	k := key(clinicID, phone)
	v.mu.Lock()
	defer v.mu.Unlock()

	e, ok := v.codes[k]
	if !ok || v.now().After(e.expires) {
		delete(v.codes, k)
		return httpx.NewError(http.StatusBadRequest, "код устарел, запросите новый")
	}
	if subtle.ConstantTimeCompare([]byte(e.hash), []byte(hashCode(code))) != 1 {
		e.attempts++
		if e.attempts >= CodeMaxAttempts {
			delete(v.codes, k)
			return httpx.NewError(http.StatusTooManyRequests, "слишком много попыток, запросите новый код")
		}
		v.codes[k] = e
		return httpx.NewError(http.StatusBadRequest, "неверный код")
	}
	delete(v.codes, k)
	return nil
}

func (v *Verifier) janitor() {
	for {
		time.Sleep(time.Minute)
		now := v.now()
		v.mu.Lock()
		for k, e := range v.codes {
			if now.After(e.expires) {
				delete(v.codes, k)
			}
		}
		v.mu.Unlock()
	}
}
