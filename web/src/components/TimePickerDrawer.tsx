import { useState } from "react";
import { Button, Input } from "./ui";

// Значение шторки — локальные datetime-local строки "YYYY-MM-DDTHH:MM",
// как у прежних DateTimeInput, чтобы остальной код не менялся.
export interface TimeRange {
  start: string;
  end: string;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

// Чипы времени: рабочий день клиники 08:00–19:30 с шагом полчаса.
const TIME_CHIPS: string[] = [];
for (let h = 8; h < 20; h++) {
  TIME_CHIPS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_CHIPS.push(`${String(h).padStart(2, "0")}:30`);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// addHour("10:30") -> "11:30", упираясь в конец суток.
function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${pad(Math.min(h + 1, 23))}:${pad(m)}`;
}

/**
 * Шторка выбора времени приёма: календарь месяца → время начала → время
 * окончания (само подставляется +1 час, но правится) → «ОК».
 *
 * Полей datetime-local в форме больше нет — дату с клавиатуры набирать
 * неудобно, а тут всё выбирается двумя-тремя касаниями.
 */
export default function TimePickerDrawer({
  value,
  onApply,
  onClose,
}: {
  value: TimeRange;
  onApply: (range: TimeRange) => void;
  onClose: () => void;
}) {
  const initial = value.start ? new Date(value.start) : new Date();
  const [monthDate, setMonthDate] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1)
  );
  const [day, setDay] = useState(value.start ? value.start.slice(0, 10) : "");
  // Шаг: сначала дата, потом время.
  const [step, setStep] = useState<"date" | "time">(value.start ? "time" : "date");
  const [startTime, setStartTime] = useState(value.start ? value.start.slice(11, 16) : "");
  const [endTime, setEndTime] = useState(value.end ? value.end.slice(11, 16) : "");
  // Пока окончание не трогали, оно едет за началом (+1 час).
  const [endTouched, setEndTouched] = useState(false);
  const [error, setError] = useState("");

  const todayStr = dateStr(new Date());

  function pickDay(value: string) {
    setDay(value);
    setStep("time");
  }

  function pickStart(t: string) {
    setStartTime(t);
    if (!endTouched) setEndTime(addHour(t));
  }

  function pickEnd(t: string) {
    setEndTouched(true);
    setEndTime(t);
  }

  function apply() {
    setError("");
    if (!day) return setError("Выберите день");
    if (!startTime) return setError("Укажите время начала");
    const end = endTime || addHour(startTime);
    if (end <= startTime) return setError("Окончание должно быть позже начала");
    onApply({ start: `${day}T${startTime}`, end: `${day}T${end}` });
  }

  // --- календарь месяца ---
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay(): 0=Вс; сетка начинается с понедельника.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

  const dayLabel = day
    ? `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-ink">
            {step === "date" ? "Дата приёма" : "Время приёма"}
          </h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-600"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === "date" ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={() => setMonthDate(new Date(year, month - 1, 1))}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
                  aria-label="Предыдущий месяц"
                >
                  ←
                </button>
                <span className="text-sm font-semibold capitalize text-ink">
                  {MONTHS[month]} {year}
                </span>
                <button
                  onClick={() => setMonthDate(new Date(year, month + 1, 1))}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
                  aria-label="Следующий месяц"
                >
                  →
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w, i) => (
                  <span
                    key={w}
                    className={`py-1 text-xs font-medium ${
                      i >= 5 ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {w}
                  </span>
                ))}
                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const value = `${year}-${pad(month + 1)}-${pad(d)}`;
                  const isPast = value < todayStr;
                  const isToday = value === todayStr;
                  const weekend = ((new Date(year, month, d).getDay() + 6) % 7) >= 5;
                  return (
                    <button
                      key={d}
                      onClick={() => pickDay(value)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                        value === day
                          ? "bg-brand font-semibold text-white"
                          : isToday
                            ? "bg-brand-light font-semibold text-brand-dark"
                            : isPast
                              ? "text-slate-300 hover:bg-slate-100"
                              : weekend
                                ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <button
                onClick={() => setStep("date")}
                className="text-sm text-brand hover:underline"
              >
                ← {dayLabel}
              </button>

              <TimeSection
                label="Начало"
                value={startTime}
                onPick={pickStart}
              />
              <TimeSection
                label={endTouched ? "Окончание" : "Окончание (+1 час)"}
                value={endTime}
                onPick={pickEnd}
              />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3">
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          {step === "time" && (
            <Button className="w-full" onClick={apply}>
              ОК
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 bg-ink/30" />
    </div>
  );
}

/** Выбор одного времени: ручное поле + чипы с шагом 30 минут. */
function TimeSection({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (t: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <div className="w-28">
          <Input
            type="time"
            value={value}
            onChange={(e) => e.target.value && onPick(e.target.value)}
          />
        </div>
      </div>
      <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
        {TIME_CHIPS.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className={`rounded-lg px-1 py-1.5 text-xs font-medium tabular-nums transition ${
              value === t
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
