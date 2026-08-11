package handlers

import (
	"strings"
	"unicode"
)

// ---------------------------------------------------------------------------
// Приведение вводимых данных к единому виду.
//
// В регистратуре печатают быстро и по-разному: «толен олжас», «тОлеН ОлЖас»,
// «8777…», «+7 777…». В базе всё это должно лежать одинаково, иначе списки
// выглядят неряшливо, а телефоны не сравнить между собой. Нормализуем на
// сервере: так правило одно для всех форм и не зависит от того, откуда пришёл
// запрос.
// ---------------------------------------------------------------------------

// normalizeName приводит ФИО к виду «Толен Олжас»: каждое слово с заглавной
// буквы, остальные строчные, лишние пробелы схлопнуты. Работает по рунам —
// с кириллицей и казахскими буквами (Ә, Ө, Ұ) strings.Title не справляется.
// Части через дефис («Абдул-Азиз») капитализируются каждая.
func normalizeName(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		parts := strings.Split(w, "-")
		for j, p := range parts {
			parts[j] = capitalizeFirst(p)
		}
		words[i] = strings.Join(parts, "-")
	}
	return strings.Join(words, " ")
}

// capitalizeFirst делает первую руну заглавной, остальные строчными.
func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	runes := []rune(strings.ToLower(s))
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// normalizePhone приводит казахстанский номер к виду +77779109965:
// 87779109965, 77779109965, 7 (777) 910-99-65 дают один и тот же результат.
// Номер, не похожий на казахстанский (другой длины или с иным кодом страны),
// возвращается как есть — лучше сохранить как ввели, чем испортить.
func normalizePhone(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var digits strings.Builder
	for _, r := range s {
		if unicode.IsDigit(r) {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	switch {
	case len(d) == 11 && (d[0] == '8' || d[0] == '7'):
		// Ведущая 8 — городская привычка набора, на письме это код 7.
		return "+7" + d[1:]
	case len(d) == 10:
		// Номер без кода страны: 7779109965.
		return "+7" + d
	}
	return s
}
