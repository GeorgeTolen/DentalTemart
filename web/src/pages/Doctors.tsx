import { useState } from "react";
import {
  useDeleteDoctor,
  useDoctors,
  useSaveDoctor,
  useSchedule,
  useSaveSchedule,
  useUnlinkedDoctorUsers,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Doctor, ScheduleEntry } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

const PRESET_COLORS = [
  "#2563EB",
  "#16A34A",
  "#DB2777",
  "#EA580C",
  "#7C3AED",
  "#0891B2",
];

const WEEKDAYS = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 7, label: "Воскресенье" },
];

export default function Doctors() {
  const { user } = useAuth();
  const canManage = user?.role !== "doctor";
  const { data: doctors = [] } = useDoctors();
  const del = useDeleteDoctor();
  const [editing, setEditing] = useState<Doctor | "new" | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Doctor | null>(null);

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
                  onClick={() => setScheduleFor(d)}
                  className="text-brand hover:underline"
                >
                  График
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
        <DoctorForm
          doctor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {scheduleFor && (
        <ScheduleEditor
          doctor={scheduleFor}
          onClose={() => setScheduleFor(null)}
        />
      )}
    </div>
  );
}

function DoctorForm({
  doctor,
  onClose,
}: {
  doctor: Doctor | null;
  onClose: () => void;
}) {
  const save = useSaveDoctor();
  const { data: unlinkedUsers = [] } = useUnlinkedDoctorUsers(doctor?.id);
  const [fullName, setFullName] = useState(doctor?.full_name ?? "");
  const [specialization, setSpecialization] = useState(
    doctor?.specialization ?? ""
  );
  const [phone, setPhone] = useState(doctor?.phone ?? "");
  const [color, setColor] = useState(doctor?.color ?? PRESET_COLORS[0]);
  const [isActive, setIsActive] = useState(doctor?.is_active ?? true);
  const [userId, setUserId] = useState<number | "">(doctor?.user_id ?? "");
  const [error, setError] = useState("");

  async function onSubmit() {
    setError("");
    if (!fullName.trim()) return setError("Введите ФИО");
    try {
      await save.mutateAsync({
        id: doctor?.id,
        full_name: fullName.trim(),
        specialization: specialization.trim(),
        phone: phone.trim(),
        color,
        is_active: isActive,
        user_id: userId === "" ? null : userId,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      title={doctor ? "Изменить врача" : "Новый врач"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={save.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Специализация">
          <Input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="Терапевт, хирург…"
          />
        </Field>
        <Field label="Телефон">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Цвет в календаре">
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ${
                  color === c ? "ring-2 ring-offset-2 ring-ink" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          Активен (отображается при выборе врача)
        </label>
        <Field label="Привязанный аккаунт (для личного кабинета врача)">
          <Select
            value={String(userId)}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— не привязан —</option>
            {unlinkedUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>
            ))}
          </Select>
        </Field>
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ScheduleEditor({
  doctor,
  onClose,
}: {
  doctor: Doctor;
  onClose: () => void;
}) {
  const { data } = useSchedule(doctor.id);
  const save = useSaveSchedule();
  // Local working copy keyed by weekday.
  const [entries, setEntries] = useState<Record<number, ScheduleEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  if (data && !loaded) {
    const map: Record<number, ScheduleEntry> = {};
    for (const e of data) map[e.weekday] = e;
    setEntries(map);
    setLoaded(true);
  }

  function toggle(weekday: number, on: boolean) {
    setEntries((prev) => {
      const next = { ...prev };
      if (on)
        next[weekday] = { weekday, start_time: "09:00", end_time: "18:00" };
      else delete next[weekday];
      return next;
    });
  }

  function setField(weekday: number, field: "start_time" | "end_time", v: string) {
    setEntries((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], [field]: v },
    }));
  }

  async function onSubmit() {
    setError("");
    try {
      await save.mutateAsync({
        doctorId: doctor.id,
        entries: Object.values(entries),
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      title={`График — ${doctor.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={save.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {WEEKDAYS.map((d) => {
          const entry = entries[d.value];
          return (
            <div
              key={d.value}
              className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2"
            >
              <label className="flex w-40 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!entry}
                  onChange={(e) => toggle(d.value, e.target.checked)}
                  className="h-4 w-4"
                />
                {d.label}
              </label>
              {entry ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={entry.start_time}
                    onChange={(e) =>
                      setField(d.value, "start_time", e.target.value)
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="time"
                    value={entry.end_time}
                    onChange={(e) =>
                      setField(d.value, "end_time", e.target.value)
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-300">выходной</span>
              )}
            </div>
          );
        })}
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
