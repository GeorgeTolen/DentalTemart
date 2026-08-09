import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { kk } from "../locales/kk";
import { en } from "../locales/en";
import { yearsLabel } from "./datetime";

// Лёгкий самописный i18n: ключом служит русская строка интерфейса, словари
// kk/en переводят её. Нет перевода - показываем русский текст (ничего не
// ломается, просто остаётся непереведённый кусок). Плейсхолдеры вида {name}
// подставляются через params.

export type Lang = "ru" | "kk" | "en";

const STORAGE_KEY = "temart_lang";

const dicts: Record<Exclude<Lang, "ru">, Record<string, string>> = { kk, en };

export function translate(
  lang: Lang,
  s: string,
  params?: Record<string, string | number>
): string {
  let out = lang === "ru" ? s : dicts[lang][s] ?? s;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (s: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>({
  lang: "ru",
  setLang: () => {},
  t: (s) => s,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "kk" || saved === "en" ? saved : "ru";
  });

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  const t = (s: string, params?: Record<string, string | number>) =>
    translate(lang, s, params);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

// useT - основной хук: const { t, lang } = useT(). Компоненты, использующие
// t, обязаны брать его отсюда - так они перерисуются при смене языка.
export function useT() {
  return useContext(Ctx);
}

// Локаль для toLocaleDateString/toLocaleTimeString и календаря.
export function dateLocale(lang: Lang): string {
  if (lang === "kk") return "kk-KZ";
  if (lang === "en") return "en-GB";
  return "ru";
}

// «5 лет / 5 years / 5 жыл» - русские склонения не ложатся в словарь, поэтому
// числовые подписи собираются хелперами.
export function yearsText(lang: Lang, n: number): string {
  if (lang === "kk") return `${n} жыл`;
  if (lang === "en") return n === 1 ? "1 year" : `${n} years`;
  return `${n} ${yearsLabel(n)}`;
}

export function ratingsText(lang: Lang, n: number): string {
  if (lang === "kk") return `${n} баға`;
  if (lang === "en") return n === 1 ? "1 rating" : `${n} ratings`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} оценка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${n} оценки`;
  return `${n} оценок`;
}
