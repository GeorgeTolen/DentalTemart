import { useDashboard } from "../api/hooks";
import { formatTime } from "../lib/datetime";
import { StatusBadge } from "../components/ui";

export default function Dashboard() {
  const { data } = useDashboard();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat label="Записей сегодня" value={data?.today_count ?? 0} />
        <Stat label="Записей за неделю" value={data?.week_count ?? 0} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Приёмы на сегодня</h2>
        <div className="space-y-2">
          {(data?.today_appointments ?? []).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: a.doctor_color }}
              />
              <span className="font-semibold tabular-nums">
                {formatTime(a.start_time)}
              </span>
              <span className="font-medium">{a.patient_name}</span>
              <span className="text-sm text-slate-500">{a.doctor_name}</span>
              <span className="ml-auto">
                <StatusBadge status={a.status} />
              </span>
            </div>
          ))}
          {data && data.today_appointments.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
              На сегодня записей нет
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-1 text-4xl font-bold text-brand">{value}</div>
    </div>
  );
}
