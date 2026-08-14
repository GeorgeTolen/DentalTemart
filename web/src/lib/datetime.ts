// All times come from the API as RFC3339 UTC strings. The browser's Date
// renders them in the user's local timezone automatically. Dates are shown in
// the DD.MM.YYYY format used in Russia.

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "-";
  // Date-only values (YYYY-MM-DD, e.g. birth_date / next_visit_date) must be
  // rendered from their literal parts, not via new Date(), which would shift
  // them by the local timezone offset (an off-by-one-day bug west of UTC).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// ageCategory splits patients into детский (<18) / взрослый (18+) groups.
export function ageCategory(birthDate: string | null): "Детский" | "Взрослый" | null {
  const years = age(birthDate);
  if (years === null) return null;
  return years < 18 ? "Детский" : "Взрослый";
}

// Working hours of the clinic day used for default appointment times.
export const WORKDAY_START = 9;
export const WORKDAY_END = 18;

// defaultAppointmentStart returns a "YYYY-MM-DDTHH:MM" value for a new
// appointment: today, rounded up to the next half-hour, clamped to the
// 09:00–18:00 working window (past 18:00 → next day 09:00).
export function defaultAppointmentStart(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  if (m === 0) {
    // already on the hour
  } else if (m <= 30) {
    d.setMinutes(30);
  } else {
    d.setMinutes(0);
    d.setHours(d.getHours() + 1);
  }
  if (d.getHours() < WORKDAY_START) {
    d.setHours(WORKDAY_START, 0, 0, 0);
  } else if (d.getHours() >= WORKDAY_END) {
    d.setDate(d.getDate() + 1);
    d.setHours(WORKDAY_START, 0, 0, 0);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// addMinutesToLocalInput shifts a "YYYY-MM-DDTHH:MM" value by the given number
// of minutes, returning the same format.
export function addMinutesToLocalInput(value: string, minutes: number): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  d.setMinutes(d.getMinutes() + minutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// yearsLabel returns the correct Russian plural of "год" for the given age.
export function yearsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "года";
  return "лет";
}

// age returns the full-year age for a YYYY-MM-DD birth date, accounting for
// whether this year's birthday has already passed. Returns null when invalid.
export function age(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let years = now.getFullYear() - y;
  const beforeBirthday =
    now.getMonth() + 1 < mo ||
    (now.getMonth() + 1 === mo && now.getDate() < d);
  if (beforeBirthday) years -= 1;
  return years >= 0 ? years : null;
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

// Convert a local <input type="datetime-local"> value into an RFC3339 UTC
// string for the API.
export function localInputToISO(value: string): string {
  return new Date(value).toISOString();
}

// Convert an RFC3339 string into the value expected by <input
// type="datetime-local"> (local time, no timezone suffix).
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const MAX_AGE_YEARS = 125;

// The oldest acceptable birth date (today minus MAX_AGE_YEARS), as a
// YYYY-MM-DD string for use as an <input type="date"> min attribute.
export function minBirthDateInput(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MAX_AGE_YEARS);
  return d.toISOString().slice(0, 10);
}

// Today, as a YYYY-MM-DD string for use as an <input type="date"> max attribute.
export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

// One year from now, as a value usable as an <input type="datetime-local"> max attribute.
export function maxAppointmentInput(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return isoToLocalInput(d.toISOString());
}

// Validates a <input type="date"> birth date value. Returns an error message
// or null when valid (an empty value is considered valid/optional).
export function validateBirthDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return "Дата рождения не может быть в будущем";
  }
  const minDate = new Date(now);
  minDate.setFullYear(now.getFullYear() - MAX_AGE_YEARS);
  if (date.getTime() < minDate.getTime()) {
    return "Возраст не может превышать 125 лет";
  }
  return null;
}

// Validates a <input type="datetime-local"> or <input type="date"> appointment
// date value: it cannot be more than a year in the future.
export function validateAppointmentDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  if (date.getTime() > maxDate.getTime()) {
    return "Запись нельзя создать более чем на 1 год вперёд";
  }
  return null;
}
