import { useState } from "react";
import { useEvents } from "../api/hooks";
import { formatDateTime } from "../lib/datetime";
import type { ClinicEvent } from "../lib/types";
import { Button } from "../components/ui";
import { SortToggle, type SortOrder } from "../components/SortToggle";
import { useT } from "../lib/i18n";

// Как показывать тип действия: цвет по «тяжести», чтобы удаления бросались
// в глаза при беглом просмотре.
const ACTION_STYLES: { prefix: string; label: string; className: string }[] = [
  { prefix: "delete", label: "Удаление", className: "bg-red-100 text-red-700" },
  { prefix: "cancel", label: "Отмена", className: "bg-orange-100 text-orange-700" },
  { prefix: "create", label: "Создание", className: "bg-green-100 text-green-700" },
  { prefix: "update", label: "Изменение", className: "bg-brand-light text-brand-dark" },
  { prefix: "services", label: "Услуги", className: "bg-indigo-100 text-indigo-700" },
];

function actionBadge(action: string) {
  const kind = action.split(".")[1] ?? "";
  return (
    ACTION_STYLES.find((s) => s.prefix === kind) ?? {
      label: kind || action,
      className: "bg-slate-100 text-slate-600",
    }
  );
}

/**
 * Журнал действий клиники - отвечает на вопрос «кто это сделал»: кто перенёс
 * запись, кто удалил пациента, кто поднял цену.
 *
 * Листается курсором: события пишутся непрерывно, и при пагинации по смещению
 * уже показанные строки уезжали бы вниз и дублировались.
 */
export default function Events() {
  const { t } = useT();
  const [cursor, setCursor] = useState(0);
  // Порядок задаёт сервер: журнал листается курсором, и развернуть его на
  // клиенте значило бы перевернуть только загруженный кусок.
  const [sort, setSort] = useState<SortOrder>("new");
  // Накопленные страницы: «Показать ещё» добавляет снизу, а не заменяет экран.
  const [loaded, setLoaded] = useState<ClinicEvent[]>([]);
  const { data, isLoading } = useEvents(cursor, sort);

  // Первая страница живёт в data, остальные - в loaded.
  const items = cursor === 0 ? (data?.items ?? []) : [...loaded, ...(data?.items ?? [])];
  const nextCursor = data?.next_cursor ?? 0;

  function showMore() {
    setLoaded(items);
    setCursor(nextCursor);
  }

  // Смена порядка начинает журнал заново - иначе к новому порядку приклеились
  // бы страницы, набранные в старом.
  function changeSort(v: SortOrder) {
    setSort(v);
    setLoaded([]);
    setCursor(0);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("События")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t("Что происходило в клинике: записи, пациенты, врачи, прайс и учётные записи.")}
        </p>
      </div>

      <SortToggle value={sort} onChange={changeSort} />

      {isLoading && items.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Загрузка…")}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          {t("Событий пока нет")}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("Когда")}</th>
                  <th className="px-4 py-3 font-medium">{t("Кто")}</th>
                  <th className="px-4 py-3 font-medium">{t("Действие")}</th>
                  <th className="px-4 py-3 font-medium">{t("Что произошло")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((e) => {
                  const badge = actionBadge(e.action);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDateTime(e.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{e.user_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {t(badge.label)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {nextCursor > 0 && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={showMore} disabled={isLoading}>
                {isLoading ? t("Загрузка…") : t("Показать ещё")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
