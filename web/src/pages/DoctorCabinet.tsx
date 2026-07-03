import { useDashboard, useMyDoctorProfile, useSchedule } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { formatTime } from "../lib/datetime";
import { StatusBadge } from "../components/ui";
import type { Appointment } from "../lib/types";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

export default function DoctorCabinet() {
  const { user } = useAuth();
  const { data: doctor, isLoading, error } = useMyDoctorProfile();
  const { data: schedule = [] } = useSchedule(doctor?.id ?? null);
  const { data: dashboard } = useDashboard();

  const today = dashboard?.today_appointments ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Мой кабинет</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Учётная запись
        </div>
        <div className="mt-1 font-semibold text-ink">{user?.full_name}</div>
        <div className="text-sm text-slate-500">{user?.email}</div>
        {user?.clinic_name && (
          <div className="mt-1 text-sm text-slate-400">Клиника: {user.clinic_name}</div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Загрузка…
        </div>
      ) : error || !doctor ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Профиль врача ещё не привязан к вашему аккаунту. Обратитесь к владельцу
          клиники.
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span
                className="mt-1 h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: doctor.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold text-ink">{doctor.full_name}</div>
                <div className="text-sm text-slate-500">
                  {doctor.specialization || "—"}
                </div>
                <div className="text-sm text-slate-400">{doctor.phone}</div>
                {!doctor.is_active && (
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    неактивен
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Быстрая статистика */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-3xl font-bold text-brand">
                {dashboard?.today_count ?? 0}
              </div>
              <div className="mt-0.5 text-sm text-slate-400">Приёмов сегодня</div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-3xl font-bold text-ink">
                {dashboard?.week_count ?? 0}
              </div>
              <div className="mt-0.5 text-sm text-slate-400">Приёмов за неделю</div>
            </div>
          </div>

          {/* Приёмы на сегодня */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Приёмы на сегодня</h2>
            {today.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
                На сегодня приёмов нет
              </div>
            ) : (
              <div className="space-y-2">
                {today.map((a) => (
                  <TodayRow key={a.id} appointment={a} />
                ))}
              </div>
            )}
          </div>

          {/* График работы */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Мой график</h2>
            {schedule.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
                График не задан
              </div>
            ) : (
              <div className="space-y-2">
                {schedule.map((s) => (
                  <div
                    key={s.weekday}
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
                  >
                    <span className="text-sm font-medium text-ink">
                      {WEEKDAY_LABELS[s.weekday]}
                    </span>
                    <span className="text-sm text-slate-500">
                      {s.start_time} - {s.end_time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TodayRow({ appointment: a }: { appointment: Appointment }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="font-semibold tabular-nums text-brand">
        {formatTime(a.start_time)} - {formatTime(a.end_time)}
      </span>
      <span className="font-medium text-ink">{a.patient_name}</span>
      {a.patient_phone && (
        <span className="text-sm text-slate-400">{a.patient_phone}</span>
      )}
      <span className="ml-auto">
        <StatusBadge status={a.status} />
      </span>
    </div>
  );
}
