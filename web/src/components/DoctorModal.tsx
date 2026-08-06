import { useMemo, useState } from "react";
import {
  useDoctors,
  useSaveDoctor,
  useSaveSchedule,
  useSchedule,
  useUnlinkedDoctorUsers,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Doctor, ScheduleEntry } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "./ui";

// Один модал на всё: профиль врача, его аккаунт (логин+пароль сразу при
// создании), уникальный цвет в календаре и график работы.

// Palette of calendar colours. A colour already taken by another doctor of the
// clinic disappears from the picker (and the server enforces uniqueness too).
export const PRESET_COLORS = [
  "#2563EB", "#16A34A", "#DB2777", "#EA580C", "#7C3AED", "#0891B2",
  "#DC2626", "#CA8A04", "#65A30D", "#0D9488", "#4F46E5", "#F472B6",
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

export default function DoctorModal({
  doctor,
  onClose,
}: {
  doctor: Doctor | null;
  onClose: () => void;
}) {
  const save = useSaveDoctor();
  const saveSchedule = useSaveSchedule();
  const { data: doctors = [] } = useDoctors();
  const { data: scheduleData } = useSchedule(doctor?.id ?? null);
  const { data: unlinkedUsers = [] } = useUnlinkedDoctorUsers(doctor?.id);

  // Colours already used by OTHER doctors are hidden from the picker.
  const availableColors = useMemo(() => {
    const used = new Set(
      doctors.filter((d) => d.id !== doctor?.id).map((d) => d.color)
    );
    const free = PRESET_COLORS.filter(
      (c) => !used.has(c) || c === doctor?.color
    );
    return free.length > 0 ? free : PRESET_COLORS;
  }, [doctors, doctor]);

  const [name, setName] = useState(doctor?.full_name ?? "");
  const [spec, setSpec] = useState(doctor?.specialization ?? "");
  const [phone, setPhone] = useState(doctor?.phone ?? "");
  const [color, setColor] = useState(doctor?.color ?? availableColors[0]);
  const [active, setActive] = useState(doctor?.is_active ?? true);
  // Account: existing link, or created right here.
  const [linkUserId, setLinkUserId] = useState<number | "">(doctor?.user_id ?? "");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [entries, setEntries] = useState<Record<number, ScheduleEntry>>({});
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [error, setError] = useState("");

  if (scheduleData && !scheduleLoaded) {
    const map: Record<number, ScheduleEntry> = {};
    for (const e of scheduleData) map[e.weekday] = e;
    setEntries(map);
    setScheduleLoaded(true);
  }

  const hasLinkedAccount = !!doctor?.user_id;

  function toggleDay(weekday: number, on: boolean) {
    setEntries((prev) => {
      const next = { ...prev };
      if (on) next[weekday] = { weekday, start_time: "09:00", end_time: "18:00" };
      else delete next[weekday];
      return next;
    });
  }

  function setTimeField(weekday: number, field: "start_time" | "end_time", v: string) {
    setEntries((prev) => ({ ...prev, [weekday]: { ...prev[weekday], [field]: v } }));
  }

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Введите ФИО");
    // Creating an account (new doctor, or attaching one to an unlinked doctor).
    const creatingAccount = !hasLinkedAccount && linkUserId === "" && accountEmail.trim() !== "";
    if (creatingAccount || password || passwordConfirm) {
      if (creatingAccount && !password) return setError("Введите пароль для аккаунта врача");
      if (password.length > 0 && password.length < 6)
        return setError("Пароль должен быть не короче 6 символов");
      if (password !== passwordConfirm)
        return setError("Пароли не совпадают");
    }
    try {
      const saved = await save.mutateAsync({
        id: doctor?.id,
        full_name: name.trim(),
        specialization: spec.trim(),
        phone: phone.trim(),
        color,
        is_active: active,
        user_id: linkUserId === "" ? null : linkUserId,
        account_email: creatingAccount ? accountEmail.trim() : "",
        // Send a password only when creating a login or resetting the linked
        // account's password - never a leftover value while linking an account.
        account_password: creatingAccount || hasLinkedAccount ? password : "",
      });
      // Only PUT the schedule once it has actually loaded for an existing doctor
      // (otherwise the initial empty {} would wipe the saved working hours), or
      // when a new doctor has some days set.
      const canSaveSchedule = doctor
        ? scheduleLoaded
        : Object.keys(entries).length > 0;
      if (canSaveSchedule) {
        await saveSchedule.mutateAsync({ doctorId: saved.id, entries: Object.values(entries) });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const busy = save.isPending || saveSchedule.isPending;

  return (
    <Modal
      title={doctor ? "Редактировать врача" : "Новый врач"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО *">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Должность / специализация">
            <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Терапевт, хирург…" />
          </Field>
          <Field label="Телефон">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" />
          </Field>
        </div>

        <Field label="Цвет в календаре (уникальный для каждого врача)">
          <div className="flex flex-wrap gap-2">
            {availableColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          Активен (отображается при выборе врача)
        </label>

        {/* Аккаунт врача */}
        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-600">Аккаунт врача (личный кабинет)</p>
          {hasLinkedAccount ? (
            <>
              <div className="rounded-xl bg-white px-3 py-2 text-sm">
                Логин: <strong className="text-ink">{doctor?.user_email || "-"}</strong>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Новый пароль (не меняется, если пусто)">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Field label="Подтверждение пароля">
                  <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Email (логин)">
                <Input
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder="doctor@clinic.kz"
                  disabled={linkUserId !== ""}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Пароль (минимум 6 символов)">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={linkUserId !== ""} />
                </Field>
                <Field label="Подтверждение пароля">
                  <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} disabled={linkUserId !== ""} />
                </Field>
              </div>
              {unlinkedUsers.length > 0 && (
                <Field label="…или привяжите существующий аккаунт">
                  <Select
                    value={String(linkUserId)}
                    onChange={(e) => setLinkUserId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">- создать новый (поля выше) -</option>
                    {unlinkedUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} · {u.email}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}
        </div>

        {/* График работы */}
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-sm font-medium text-slate-600">График работы</p>
          <div className="space-y-2">
            {WEEKDAYS.map((d) => {
              const entry = entries[d.value];
              return (
                <div key={d.value} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <label className="flex w-36 cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!entry} onChange={(e) => toggleDay(d.value, e.target.checked)} className="h-4 w-4" />
                    {d.label}
                  </label>
                  {entry ? (
                    <div className="flex items-center gap-2">
                      <input type="time" value={entry.start_time} onChange={(e) => setTimeField(d.value, "start_time", e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                      <span className="text-slate-400">-</span>
                      <input type="time" value={entry.end_time} onChange={(e) => setTimeField(d.value, "end_time", e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                    </div>
                  ) : (
                    <span className="text-sm text-slate-300">выходной</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}
