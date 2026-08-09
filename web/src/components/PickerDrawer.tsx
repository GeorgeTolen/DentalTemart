import { useEffect, useState, type ReactNode } from "react";
import { Input } from "./ui";
import { useT } from "../lib/i18n";

/**
 * Боковая шторка выбора из списка.
 *
 * Заменяет длинные `<select>` с сотнями пациентов: список открывается слева
 * поверх модалки, вверху - поиск, элементы можно рисовать как угодно (аватар,
 * телефон, специализация).
 */
export function PickerDrawer({
  title,
  placeholder,
  search,
  onSearch,
  loading,
  isEmpty,
  emptyLabel,
  footer,
  onClose,
  children,
}: {
  title: string;
  placeholder: string;
  search: string;
  onSearch: (v: string) => void;
  loading?: boolean;
  // Пустоту считает вызывающий: children - это уже готовая разметка, в которой
  // кроме строк списка бывают подсказки, и по ней «пусто» не определить.
  isEmpty: boolean;
  emptyLabel?: string;
  // Например, «+ Новый пациент» - действие под списком.
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  // Esc закрывает шторку, не закрывая модалку под ней.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={onClose}>
      <div
        className="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-600"
            aria-label={t("Закрыть")}
          >
            ×
          </button>
        </div>

        <div className="border-b border-slate-100 p-3">
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-4 text-sm text-slate-400">{t("Поиск…")}</p>
          ) : isEmpty ? (
            <p className="px-2 py-4 text-sm text-slate-400">
              {emptyLabel ? t(emptyLabel) : t("Ничего не найдено")}
            </p>
          ) : (
            <div className="space-y-1">{children}</div>
          )}
        </div>

        {footer && <div className="border-t border-slate-100 p-3">{footer}</div>}
      </div>
      <div className="flex-1 bg-ink/30" />
    </div>
  );
}

/** Строка списка в шторке: аватар/маркер слева, название и подпись справа. */
export function PickerRow({
  onClick,
  media,
  title,
  subtitle,
  selected,
}: {
  onClick: () => void;
  media?: ReactNode;
  title: string;
  subtitle?: string;
  selected?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
        selected ? "bg-brand-bg" : "hover:bg-slate-50"
      }`}
    >
      {media}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-slate-400">{subtitle}</span>
        )}
      </span>
    </button>
  );
}

/**
 * Поле-кнопка, открывающее шторку. Выглядит как input, но показывает выбранное
 * значение и подсказку «выбрать», если ничего не выбрано.
 */
export function PickerField({
  value,
  placeholder,
  onClick,
}: {
  value: string;
  placeholder: string;
  onClick: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm outline-none transition hover:border-brand focus:border-brand"
    >
      <span className={value ? "text-ink" : "text-slate-400"}>
        {value || placeholder}
      </span>
      <span className="ml-2 shrink-0 text-xs text-slate-400">{t("выбрать")} ▸</span>
    </button>
  );
}

/** Debounce для серверного поиска: без него запрос уходит на каждый символ. */
export function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
