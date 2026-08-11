import { useT } from "../lib/i18n";

// Порядок списка: сначала новые, сначала старые или по алфавиту. Значения
// уходят на сервер как ?sort=, поэтому совпадают с ожидаемыми им строками.
export type SortOrder = "new" | "old" | "name";

/**
 * Переключатель порядка списка. «По имени» показывается только там, где
 * алфавитный порядок осмыслен (пациенты, врачи, услуги, сотрудники).
 */
export function SortToggle({
  value,
  onChange,
  withName = false,
}: {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
  withName?: boolean;
}) {
  const { t } = useT();
  const options: { key: SortOrder; label: string }[] = [
    ...(withName ? [{ key: "name" as const, label: "По имени" }] : []),
    { key: "new", label: "Сначала новые" },
    { key: "old", label: "Сначала старые" },
  ];
  return (
    <div className="flex w-fit gap-1 rounded-2xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium transition ${
            value === o.key
              ? "bg-white text-ink shadow-sm"
              : "text-slate-500 hover:text-ink"
          }`}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * Сортирует уже загруженный список. recency — ключ новизны (дата или id),
 * name — необязательный ключ для алфавитного порядка; без него вариант «по
 * имени» оставляет порядок, в котором список пришёл с сервера.
 */
export function sortList<T>(
  items: T[],
  order: SortOrder,
  recency: (item: T) => string | number,
  name?: (item: T) => string
): T[] {
  if (order === "name") {
    if (!name) return items;
    return [...items].sort((a, b) => name(a).localeCompare(name(b), "ru"));
  }
  const asc = [...items].sort((a, b) => {
    const ka = recency(a);
    const kb = recency(b);
    if (ka === kb) return 0;
    return ka > kb ? 1 : -1;
  });
  return order === "new" ? asc.reverse() : asc;
}
