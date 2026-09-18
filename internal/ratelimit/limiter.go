// Package ratelimit — простой лимитер «не больше N событий за окно» в памяти
// процесса. Для публичной страницы записи: один экземпляр сервера, точность
// до секунды не нужна.
package ratelimit

import (
	"sync"
	"time"
)

// Limiter считает события по строковому ключу скользящим окном.
type Limiter struct {
	mu     sync.Mutex
	events map[string][]time.Time
	now    func() time.Time
}

// New builds a Limiter and starts a janitor that forgets stale keys.
func New() *Limiter {
	l := &Limiter{events: map[string][]time.Time{}, now: time.Now}
	go l.janitor()
	return l
}

// Allow регистрирует событие по ключу и сообщает, уложилось ли оно в лимит
// limit за окно window. Отказанное событие не засчитывается.
func (l *Limiter) Allow(key string, limit int, window time.Duration) bool {
	now := l.now()
	cutoff := now.Add(-window)

	l.mu.Lock()
	defer l.mu.Unlock()

	ts := l.events[key]
	kept := ts[:0]
	for _, t := range ts {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= limit {
		l.events[key] = kept
		return false
	}
	l.events[key] = append(kept, now)
	return true
}

// janitor раз в минуту выкидывает ключи, по которым час не было событий.
func (l *Limiter) janitor() {
	for {
		time.Sleep(time.Minute)
		cutoff := l.now().Add(-time.Hour)
		l.mu.Lock()
		for k, ts := range l.events {
			if len(ts) == 0 || !ts[len(ts)-1].After(cutoff) {
				delete(l.events, k)
			}
		}
		l.mu.Unlock()
	}
}
