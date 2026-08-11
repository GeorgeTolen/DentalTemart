package handlers

import "testing"

func TestNormalizeName(t *testing.T) {
	cases := map[string]string{
		"толен олжас":      "Толен Олжас",
		"тОлеН ОлЖас":      "Толен Олжас",
		"ТОЛЕН ОЛЖАС":      "Толен Олжас",
		"  толен   олжас ": "Толен Олжас",
		"абдул-азиз серik": "Абдул-Азиз Серik",
		"әсем өтеген":      "Әсем Өтеген",
		"john smith":       "John Smith",
		"   ":              "",
		"":                 "",
	}
	for in, want := range cases {
		if got := normalizeName(in); got != want {
			t.Errorf("normalizeName(%q) = %q, ожидалось %q", in, got, want)
		}
	}
}

func TestNormalizePhone(t *testing.T) {
	cases := map[string]string{
		"87779109965":       "+77779109965",
		"77779109965":       "+77779109965",
		"+77779109965":      "+77779109965",
		"7779109965":        "+77779109965",
		"8 (777) 910-99-65": "+77779109965",
		"":                  "",
		// Не казахстанский номер оставляем как ввели.
		"+1 202 555 0143": "+1 202 555 0143",
	}
	for in, want := range cases {
		if got := normalizePhone(in); got != want {
			t.Errorf("normalizePhone(%q) = %q, ожидалось %q", in, got, want)
		}
	}
}
