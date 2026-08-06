import { useAdminStats, useDashboard } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABELS } from "../lib/types";
import PasswordChangeForm from "../components/PasswordChangeForm";

/**
 * Личный кабинет владельца и менеджера: своя учётная запись, смена пароля и
 * короткая сводка по клинике на сегодня. У врача свой кабинет (DoctorCabinet) —
 * он завязан на профиль врача, которого у владельца нет.
 */
export default function OwnerCabinet() {
  const { user } = useAuth();
  const { data: dashboard } = useDashboard();
  const { data: stats } = useAdminStats();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Личный кабинет</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Учётная запись
        </div>
        <div className="mt-1 text-lg font-semibold text-ink">{user?.full_name}</div>
        <div className="text-sm text-slate-500">{user?.email}</div>
        <div className="mt-1 text-sm text-slate-400">
          {user ? ROLE_LABELS[user.role] : ""}
          {user?.clinic_name && ` · ${user.clinic_name}`}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Приёмов сегодня" value={dashboard?.today_count ?? 0} />
        <SummaryCard label="Приёмов за неделю" value={dashboard?.week_count ?? 0} />
        <SummaryCard label="Пациентов" value={stats?.total_patients ?? 0} />
        <SummaryCard label="Врачей" value={stats?.total_doctors ?? 0} />
      </div>

      <PasswordChangeForm />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-sm text-slate-400">{label}</div>
    </div>
  );
}
