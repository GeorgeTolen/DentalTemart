// Разбор казахстанского ИИН: первые 6 цифр — дата рождения (ГГММДД), 7-я
// кодирует век и пол (1/2 — 1800-е, 3/4 — 1900-е, 5/6 — 2000-е; нечётная —
// мужчина, чётная — женщина). Контрольную цифру не проверяем: цель — удобное
// автозаполнение редактируемых полей, а не валидация документа.

export interface IinInfo {
  birthDate: string; // "YYYY-MM-DD"
  gender: "male" | "female";
}

// parseIIN returns the birth date and gender encoded in a 12-digit IIN, or
// null when the IIN is malformed (wrong length, unknown century digit,
// impossible or future date). Never throws.
export function parseIIN(iin: string): IinInfo | null {
  if (!/^\d{12}$/.test(iin)) return null;

  const centuryDigit = Number(iin[6]);
  if (centuryDigit < 1 || centuryDigit > 6) return null;
  const century = 1800 + Math.floor((centuryDigit - 1) / 2) * 100;
  const gender = centuryDigit % 2 === 1 ? "male" : "female";

  const year = century + Number(iin.slice(0, 2));
  const month = Number(iin.slice(2, 4));
  const day = Number(iin.slice(4, 6));

  // Реальная календарная дата: JS Date молча переносит 30.02 на март,
  // поэтому сверяем компоненты после round-trip.
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  if (d.getTime() > Date.now()) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return { birthDate: `${year}-${pad(month)}-${pad(day)}`, gender };
}
