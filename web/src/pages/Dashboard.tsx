import { useState } from "react";
import { useDashboard } from "../api/hooks";
import { formatTime, formatDate } from "../lib/datetime";
import { StatusBadge } from "../components/ui";
import type { Appointment } from "../lib/types";

export default function Dashboard() {
  const { data } = useDashboard();
  const [expanded, setExpanded] = useState<number | null>(null);

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
            <AppointmentCard
              key={a.id}
              appointment={a}
              expanded={expanded === a.id}
              onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
            />
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

function AppointmentCard({
  appointment: a,
  expanded,
  onToggle,
}: {
  appointment: Appointment;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      {/* Основная строка */}
      <button
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-slate-50 transition"
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: a.doctor_color }}
        />
        <span className="font-semibold tabular-nums text-brand">
          {formatTime(a.start_time)} — {formatTime(a.end_time)}
        </span>
        <span className="font-medium">{a.patient_name}</span>
        <span className="text-sm text-slate-500">{a.doctor_name}</span>
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge status={a.status} />
          <span className="text-slate-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* Подробности */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Detail label="Пациент" value={a.patient_name} />
          <Detail label="Телефон" value={a.patient_phone || "—"} />
          <Detail label="Врач" value={a.doctor_name} />
          <Detail label="Начало" value={formatTime(a.start_time)} />
          <Detail label="Окончание" value={formatTime(a.end_time)} />
          <Detail label="Статус" value={<StatusBadge status={a.status} />} />
          {a.diagnosis && <Detail label="Диагноз" value={a.diagnosis} wide />}
          {a.description && <Detail label="Описание" value={a.description} wide />}
          {a.next_visit_date && (
            <Detail label="Следующий приём" value={formatDate(a.next_visit_date)} wide />
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="text-xs text-slate-400">{label}</span>
      <div className="mt-0.5 text-sm font-medium text-ink">{value}</div>
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
