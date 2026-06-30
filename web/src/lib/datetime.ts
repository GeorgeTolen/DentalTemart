// All times come from the API as RFC3339 UTC strings. The browser's Date
// renders them in the user's local timezone automatically. Dates are shown in
// the DD.MM.YYYY format used in Russia.

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
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
