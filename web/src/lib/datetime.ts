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
