// Package auth handles password hashing and JWT issuing/verification.
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Token types embedded in the JWT "typ" claim.
const (
	TokenAccess  = "access"
	TokenRefresh = "refresh"
)

// ErrInvalidToken is returned when a token fails verification.
var ErrInvalidToken = errors.New("invalid token")

// Claims is the JWT payload used by Temart. ClinicID is 0 for the platform
// superadmin (who is not attached to any clinic) and the clinic's id otherwise.
type Claims struct {
	Role     string `json:"role"`
	ClinicID int64  `json:"clinic_id"`
	Typ      string `json:"typ"`
	jwt.RegisteredClaims
}

// Manager issues and verifies tokens using a single HMAC secret.
type Manager struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewManager builds a token Manager.
func NewManager(secret string, accessTTL, refreshTTL time.Duration) *Manager {
	return &Manager{secret: []byte(secret), accessTTL: accessTTL, refreshTTL: refreshTTL}
}

// AccessTTL/RefreshTTL expose configured lifetimes (used to set cookie max-age).
func (m *Manager) AccessTTL() time.Duration  { return m.accessTTL }
func (m *Manager) RefreshTTL() time.Duration { return m.refreshTTL }

// Issue creates a signed token for the given user.
func (m *Manager) Issue(userID, clinicID int64, role, typ string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		Role:     role,
		ClinicID: clinicID,
		Typ:      typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// IssueAccess and IssueRefresh are convenience wrappers.
func (m *Manager) IssueAccess(userID, clinicID int64, role string) (string, error) {
	return m.Issue(userID, clinicID, role, TokenAccess, m.accessTTL)
}
func (m *Manager) IssueRefresh(userID, clinicID int64, role string) (string, error) {
	return m.Issue(userID, clinicID, role, TokenRefresh, m.refreshTTL)
}

// Verify parses and validates a token, returning its claims.
func (m *Manager) Verify(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// HashPassword returns a bcrypt hash of the plaintext password.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// CheckPassword reports whether password matches the stored bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
