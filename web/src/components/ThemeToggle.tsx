import { useEffect, useState } from "react";

const STORAGE_KEY = "temart:theme";

// applyTheme вешает/снимает класс dark на <html> — на него завязаны все
// .dark-переопределения в index.css.
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

// initTheme вызывается из main.tsx до первого рендера, чтобы страница не
// мигала светлым при загрузке в тёмной теме.
export function initTheme() {
  applyTheme(localStorage.getItem(STORAGE_KEY) === "dark");
}

/**
 * Переключатель темы: милое солнце ↔ месяц со звёздочкой. Живёт рядом с
 * логотипом; выбор запоминается в localStorage.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    applyTheme(dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      title={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-100 dark:hover:bg-slate-700 ${className}`}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

/** Солнышко с круглыми лучиками и румянцем. */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      {/* лучи */}
      <g stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="2.2" x2="12" y2="4.6" />
        <line x1="12" y1="19.4" x2="12" y2="21.8" />
        <line x1="2.2" y1="12" x2="4.6" y2="12" />
        <line x1="19.4" y1="12" x2="21.8" y2="12" />
        <line x1="5" y1="5" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19" y2="19" />
        <line x1="19" y1="5" x2="17.3" y2="6.7" />
        <line x1="6.7" y1="17.3" x2="5" y2="19" />
      </g>
      {/* диск */}
      <circle cx="12" cy="12" r="4.6" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.2" />
      {/* личико: глазки и улыбка */}
      <circle cx="10.4" cy="11.2" r="0.55" fill="#92400E" />
      <circle cx="13.6" cy="11.2" r="0.55" fill="#92400E" />
      <path
        d="M10.3 13.2c.5.7 1.1 1 1.7 1s1.2-.3 1.7-1"
        stroke="#92400E"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Месяц со звёздочкой и сонной улыбкой. */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        fill="#FDE68A"
        stroke="#D97706"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* сонный глаз и улыбка */}
      <path d="M11.2 12.6c.5.3 1 .3 1.5 0" stroke="#92400E" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M11.6 15.4c.7.5 1.6.5 2.3 0" stroke="#92400E" strokeWidth="0.9" strokeLinecap="round" />
      {/* звёздочка */}
      <path
        d="M17.5 4.5l.55 1.45L19.5 6.5l-1.45.55L17.5 8.5l-.55-1.45L15.5 6.5l1.45-.55Z"
        fill="#FCD34D"
        stroke="#D97706"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
