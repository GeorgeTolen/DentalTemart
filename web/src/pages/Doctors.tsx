import { useState } from "react";
import { useDeleteDoctor, useDoctors } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Doctor } from "../lib/types";
import { Button } from "../components/ui";
import DoctorModal from "../components/DoctorModal";
import { useAuth } from "../auth/AuthContext";

export default function Doctors() {
  const { user, readOnly } = useAuth();
  const canManage = user?.role !== "doctor" && !readOnly;
  const { data: doctors = [] } = useDoctors();
  const del = useDeleteDoctor();
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);

  async function onDelete(d: Doctor) {
    if (
      !confirm(
        `Удалить врача «${d.full_name}»?\n\nВместе с ним будут удалены его приёмы и график работы. ` +
          `Чтобы просто скрыть врача из списков, снимите отметку «Активен».`
      )
    )
      return;
    try {
      await del.mutateAsync(d.id);
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Врачи</h1>
        {canManage && <Button onClick={() => setEditing("new")}>Новый врач</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => (
          <div key={d.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{d.full_name}</div>
                <div className="text-sm text-slate-500">
                  {d.specialization || "—"}
                </div>
                <div className="text-sm text-slate-400">{d.phone}</div>
                {canManage && d.user_email && (
                  <div className="mt-1 truncate text-xs text-slate-400">
                    Логин: {d.user_email}
                  </div>
                )}
                {!d.is_active && (
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    неактивен
                  </span>
                )}
              </div>
            </div>
            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <button
                  onClick={() => setEditing(d)}
                  className="text-brand hover:underline"
                >
                  Изменить
                </button>
                <button
                  onClick={() => onDelete(d)}
                  className="text-red-500 hover:underline"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        ))}
        {doctors.length === 0 && (
          <div className="col-span-full rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
            Врачей пока нет
          </div>
        )}
      </div>

      {editing && (
        <DoctorModal
          doctor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
