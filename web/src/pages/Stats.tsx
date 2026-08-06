import { useAdminStats, useRevenueStats } from "../api/hooks";
import { formatMoney, monthLabel } from "../lib/money";

/**
 * Статистика клиники: сначала деньги (за этим сюда и заходят), затем количества
 * пациентов, врачей и записей по статусам.
 */
export default function Stats() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Статистика</h1>
      <Finance />
      <Counters />
    </div>
  );
}

// --- Финансы ---

function Finance() {
  const { data: stats, isLoading } = useRevenueStats();

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;
  if (!stats) return <p className="text-sm text-slate-400">Нет данных</p>;

  const cards = [
    { label: "Сегодня", bucket: stats.today },
    { label: "Этот месяц", bucket: stats.month },
    { label: "Этот год", bucket: stats.year },
    { label: "За всё время", bucket: stats.all_time },
  ];
  // Масштаб столбиков - от лучшего месяца, иначе разница между месяцами не видна.
  const maxMonth = Math.max(1, ...stats.by_month.map((m) => m.revenue));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-400">{c.label}</div>
            <div className="mt-1 text-2xl font-bold text-ink">
              {formatMoney(c.bucket.revenue)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {c.bucket.services_count} услуг · {c.bucket.appointments_count} приёмов
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Заработок по месяцам</h2>
        {stats.by_month.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
            Пока нет пробитых услуг
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            {stats.by_month.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-slate-500">
                  {monthLabel(m.month)}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(m.revenue / maxMonth) * 100}%` }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
                  {formatMoney(m.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueBreakdown
          title="Услуги за год"
          emptyLabel="Услуги ещё не пробивались"
          rows={stats.by_service}
          countLabel="раз"
        />
        <RevenueBreakdown
          title="Врачи за год"
          emptyLabel="Нет данных по врачам"
          rows={stats.by_doctor}
          countLabel="услуг"
        />
      </div>
    </div>
  );
}

function RevenueBreakdown({
  title,
  emptyLabel,
  rows,
  countLabel,
}: {
  title: string;
  emptyLabel: string;
  rows: { name: string; revenue: number; services_count: number }[];
  countLabel: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
          {emptyLabel}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="px-5 py-3 font-medium text-ink">{r.name || "-"}</td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {r.services_count} {countLabel}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">
                    {formatMoney(r.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Количества ---

function Counters() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;
  if (!stats) return null;

  const statCards = [
    { label: "Пациентов", value: stats.total_patients, color: "bg-blue-50 text-blue-700" },
    { label: "Врачей", value: stats.total_doctors, color: "bg-purple-50 text-purple-700" },
    { label: "Пользователей", value: stats.total_users, color: "bg-indigo-50 text-indigo-700" },
  ];

  const apptCards = [
    { label: "Запланировано", value: stats.scheduled_count, color: "bg-brand-light text-brand-dark" },
    { label: "Завершено", value: stats.completed_count, color: "bg-green-100 text-green-700" },
    { label: "Отменено", value: stats.cancelled_count, color: "bg-slate-100 text-slate-600" },
    { label: "Не пришли", value: stats.no_show_count, color: "bg-orange-100 text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Общее</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statCards.map((c) => (
            <div key={c.label} className={`rounded-2xl p-5 ${c.color}`}>
              <div className="text-3xl font-bold">{c.value}</div>
              <div className="mt-1 text-sm font-medium opacity-80">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Записи по статусам
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {apptCards.map((c) => (
            <div key={c.label} className={`rounded-2xl p-5 ${c.color}`}>
              <div className="text-3xl font-bold">{c.value}</div>
              <div className="mt-1 text-sm font-medium opacity-80">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-ink">{stats.archived_count}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              Записей в архиве (завершённые + отменённые)
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">Архив</span>
        </div>
      </div>
    </div>
  );
}
