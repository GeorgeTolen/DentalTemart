// Рисованные SVG-иконки вместо системных эмодзи: эмодзи выглядят по-разному на
// каждой платформе и выбиваются из стиля, свои SVG - одинаковые везде.

/** Календарик с отрывным листом и сердечком - для главного пункта меню. */
export function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      {/* корпус */}
      <rect x="3.2" y="5" width="17.6" height="15.5" rx="3" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      {/* шапка */}
      <path d="M3.2 9.6h17.6V8a3 3 0 0 0-3-3H6.2a3 3 0 0 0-3 3v1.6Z" fill="currentColor" opacity="0.9" />
      {/* колечки */}
      <line x1="8" y1="3.2" x2="8" y2="6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16" y1="3.2" x2="16" y2="6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* сердечко на листе */}
      <path
        d="M12 17.6c-2-1.35-3.2-2.5-3.2-3.75 0-.95.75-1.65 1.65-1.65.6 0 1.15.3 1.55.85.4-.55.95-.85 1.55-.85.9 0 1.65.7 1.65 1.65 0 1.25-1.2 2.4-3.2 3.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Часики со стрелками - шапка времени в карточке записи. */
export function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Песочные часы - экран истёкшего пробного периода. */
export function HourglassIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M7 3.5h10M7 20.5h10M8 3.5v3.2c0 2 1.6 3.3 4 5.3 2.4-2 4-3.3 4-5.3V3.5M8 20.5v-3.2c0-2 1.6-3.3 4-5.3 2.4 2 4 3.3 4 5.3v3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.6 6.2h4.8L12 8.6 9.6 6.2Z" fill="currentColor" />
      <path d="M12 15.5l2.2 2.6H9.8L12 15.5Z" fill="currentColor" />
    </svg>
  );
}

/** Скрепка - файл, приложенный к медицинской записи. */
export function PaperclipIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M20 11.3 12.6 18.7a5 5 0 0 1-7.1-7.1l7.8-7.8a3.4 3.4 0 0 1 4.8 4.8l-7.8 7.8a1.8 1.8 0 0 1-2.5-2.5l7-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
