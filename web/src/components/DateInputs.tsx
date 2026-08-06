import { useEffect, useState } from "react";
import { fieldClass } from "./ui";
import { CalendarIcon } from "./icons";

// Locale-independent date & time inputs that ALWAYS show day-month-year
// (ДД.ММ.ГГГГ). Native <input type="date"> renders in the browser's locale
// (often month-first), which a page cannot override - so we use masked text
// fields, keeping a native calendar popup behind a transparent overlay.
//
// The public value/onChange formats match the native inputs they replace, so
// these are drop-in replacements:
//   DateInput      value = "YYYY-MM-DD"        (like <input type="date">)
//   DateTimeInput  value = "YYYY-MM-DDTHH:MM"  (like <input type="datetime-local">)

// --- helpers ---

function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8); // DDMMYYYY
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

function displayToIso(text: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!m) return "";
  const day = +m[1];
  const mon = +m[2];
  const year = +m[3];
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || year < 1) return "";
  const dt = new Date(year, mon - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== mon - 1 || dt.getDate() !== day) {
    return "";
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4); // HHMM
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function validTime(text: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text);
}

// --- DateInput ---

interface DateInputProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  min?: string; // "YYYY-MM-DD" for the calendar popup range
  max?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  autoFocus,
  placeholder = "дд.мм.гггг",
  className = "",
}: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));

  // Sync from the outside only when the value genuinely diverges (e.g. the form
  // was reset or opened with an existing date), never mid-typing.
  useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(raw: string) {
    const masked = maskDate(raw);
    setText(masked);
    onChange(displayToIso(masked));
  }

  return (
    <div className={`relative ${className}`}>
      <input
        className={`${fieldClass} pr-10`}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {/* Transparent native date input over the calendar icon: clicking it opens
          the browser's calendar popup (a visual month grid - no locale text). */}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setText(isoToDisplay(e.target.value));
          onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
        <CalendarIcon className="h-4 w-4" />
      </span>
    </div>
  );
}

// --- TimeInput (masked HH:MM, 24h) ---

interface TimeInputProps {
  value: string; // "HH:MM" or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimeInput({ value, onChange, disabled, className = "" }: TimeInputProps) {
  const [text, setText] = useState(() => value);

  useEffect(() => {
    const current = validTime(text) ? text : "";
    if (current !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(raw: string) {
    const masked = maskTime(raw);
    setText(masked);
    onChange(validTime(masked) ? masked : "");
  }

  return (
    <input
      className={`${fieldClass} ${className}`}
      value={text}
      onChange={(e) => handleText(e.target.value)}
      placeholder="чч:мм"
      inputMode="numeric"
      disabled={disabled}
    />
  );
}

// --- DateTimeInput (date + time -> "YYYY-MM-DDTHH:MM") ---

function splitDateTime(value: string): [string, string] {
  const i = value.indexOf("T");
  if (i === -1) return [value, ""];
  return [value.slice(0, i), value.slice(i + 1, i + 6)];
}

function combine(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

interface DateTimeInputProps {
  value: string; // "YYYY-MM-DDTHH:MM" or ""
  onChange: (value: string) => void;
  maxDate?: string; // "YYYY-MM-DD" for the calendar popup range
  disabled?: boolean;
  className?: string;
}

export function DateTimeInput({
  value,
  onChange,
  maxDate,
  disabled,
  className = "",
}: DateTimeInputProps) {
  const [date, setDate] = useState(() => splitDateTime(value)[0]);
  const [time, setTime] = useState(() => splitDateTime(value)[1]);

  // Resync from an external value only when it diverges from our parts.
  useEffect(() => {
    if (combine(date, time) !== value) {
      const [d, t] = splitDateTime(value);
      setDate(d);
      setTime(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setD(d: string) {
    setDate(d);
    onChange(combine(d, time));
  }
  function setT(t: string) {
    setTime(t);
    onChange(combine(date, t));
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <DateInput value={date} onChange={setD} max={maxDate} disabled={disabled} className="flex-1" />
      <TimeInput value={time} onChange={setT} disabled={disabled} className="w-24 shrink-0" />
    </div>
  );
}
