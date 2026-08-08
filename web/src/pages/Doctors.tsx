import { useState } from "react";
import { useDeleteDoctor, useDoctors } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Doctor } from "../lib/types";
import { Button, Modal } from "../components/ui";
import DoctorModal from "../components/DoctorModal";
import { Avatar } from "../components/Avatar";
import { DoctorProfileCard, DoctorProfileModal, ratingsLabel } from "./DoctorCabinet";
import { yearsLabel } from "../lib/datetime";
import { useAuth } from "../auth/AuthContext";

export default function Doctors() {
  const { user, readOnly } = useAuth();
  const canManage = user?.role !== "doctor" && !readOnly;
  const { data: allDoctors = [] } = useDoctors();
  // Врач смотрит на коллег - себя в этом списке видеть незачем, его профиль
  // живёт в личном кабинете.
  const doctors =
    user?.role === "doctor"
      ? allDoctors.filter((d) => d.user_id !== user.id)
      : allDoctors;
  const del = useDeleteDoctor();
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);
  const [viewing, setViewing] = useState<Doctor | null>(null);
  const [editingProfile, setEditingProfile] = useState<Doctor | null>(null);

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
          <div key={d.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
            {/* Клик по фото или имени открывает карточку врача - отдельная
                кнопка «Профиль» для этого не нужна. */}
            <button
              onClick={() => setViewing(d)}
              className="flex w-full flex-1 items-start gap-3 text-left"
              title="Открыть профиль врача"
            >
              <Avatar
                name={d.full_name}
                url={d.avatar_url}
                size="md"
                color={d.color}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold hover:text-brand">{d.full_name}</div>
                <div className="text-sm text-slate-500">
                  {d.specialization || "-"}
                </div>
                <div className="text-sm text-slate-400">{d.phone}</div>
                {d.experience_years > 0 && (
                  <div className="text-sm text-slate-400">
                    Стаж: {d.experience_years} {yearsLabel(d.experience_years)}
                  </div>
                )}
                {d.rating_count > 0 && (
                  <div className="text-sm font-medium text-amber-500">
                    ★ {d.rating_avg.toFixed(1)}{" "}
                    <span className="font-normal text-slate-400">
                      · {ratingsLabel(d.rating_count)}
                    </span>
                  </div>
                )}
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
            </button>
            {/* mt-auto прижимает кнопки к низу: карточки в ряду одной высоты,
                и «Изменить/Удалить» не прыгают от объёма профиля соседа. */}
            <div className="mt-auto flex flex-wrap gap-3 pt-4 text-sm">
              {canManage && (
                <>
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
                </>
              )}
            </div>
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
      {viewing && (
        <Modal
          title={viewing.full_name}
          onClose={() => setViewing(null)}
          footer={<Button onClick={() => setViewing(null)}>Закрыть</Button>}
        >
          {/* Владелец и менеджер могут дополнить профиль врача за него -
              например, пока врач не завёл себе учётную запись. */}
          <DoctorProfileCard
            doctor={viewing}
            editable={canManage}
            onEdit={() => setEditingProfile(viewing)}
          />
        </Modal>
      )}
      {editingProfile && (
        <DoctorProfileModal
          doctor={editingProfile}
          onClose={() => setEditingProfile(null)}
        />
      )}
    </div>
  );
}
