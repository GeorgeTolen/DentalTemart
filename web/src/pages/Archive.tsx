import { useState } from "react";
import {
  useAdminStats,
  useArchivedAppointments,
  useArchivedCount,
  useDeleteArchivedAppointments,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { formatDate, formatDateTime } from "../lib/datetime";
import { Button } from "../components/ui";

type ArchiveTab = "completed" | "cancelled";

const ARCHIVE_TABS: { key: ArchiveTab; label: string }[] = [
  { key: "completed", label: "Завершённые" },
  { key: "cancelled", label: "Отменённые" },
];

// Завершённые и отменённые приёмы + массовая очистка архива.
export default function Archive() {
  const [tab, setTab] = useState<ArchiveTab>("completed");
  const { data: appointments = [], isLoading } = useArchivedAppointments(tab);
  const { data: countData } = useArchivedCount();
  const deleteArchived = useDeleteArchivedAppointments();
  const { refetch: refetchStats } = useAdminStats();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `Удалить все завершённые и отменённые записи (${countData?.count ?? 0} шт.)? Это действие нельзя отменить.`
      )
    )
      return;
    try {
      await deleteArchived.mutateAsync();
      setDone(true);
      refetchStats();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Архив</h1>

      <div className="flex w-fit gap-1 rounded-2xl bg-slate-100 p-1">
        {ARCHIVE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t.key ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : appointments.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          {tab === "completed" ? "Завершённых записей нет" : "Отменённых записей нет"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Пациент</th>
                <th className="px-4 py-3 text-left font-medium">Врач</th>
                <th className="px-4 py-3 text-left font-medium">Дата и время</th>
                <th className="px-4 py-3 text-left font-medium">Диагноз</th>
                <th className="px-4 py-3 text-left font-medium">Описание</th>
                <th className="px-4 py-3 text-left font-medium">Следующий приём</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{a.patient_name}</td>
                  <td className="px-4 py-3 text-slate-500">{a.doctor_name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(a.start_time)}</td>
                  <td className="px-4 py-3 text-slate-500">{a.diagnosis || "-"}</td>
                  <td
                    className="max-w-xs truncate px-4 py-3 text-slate-500"
                    title={a.description}
                  >
                    {a.description || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {a.next_visit_date ? formatDate(a.next_visit_date) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold">Очистка архива</h3>
        <p className="text-sm text-slate-600">
          Удаляет все записи со статусом «Завершён» и «Отменён» без ограничений (обе
          вкладки выше). Это действие необратимо.
        </p>

        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          Записей для удаления: <strong className="text-lg">{countData?.count ?? 0}</strong>
        </div>

        {done && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
            Архив успешно очищен.
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={deleteArchived.isPending || (countData?.count ?? 0) === 0}
        >
          {deleteArchived.isPending ? "Удаление…" : `Удалить ${countData?.count ?? 0} записей`}
        </Button>
      </div>
    </div>
  );
}
