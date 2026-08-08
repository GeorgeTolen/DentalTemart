import { useState, useMemo } from "react";
import {
  useAppointments,
  useDeleteAppointment,
  useDoctors,
  useSaveAppointment,
  useSavePatient,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, AppointmentStatus, Doctor } from "../lib/types";
import { STATUS_LABELS, GENDER_LABELS } from "../lib/types";
import { ageCategory, isoToLocalInput, localInputToISO, formatDate } from "../lib/datetime";
import { parseIIN } from "../lib/iin";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "../components/ui";
import ScheduleFollowUpModal from "../components/ScheduleFollowUpModal";
import AppointmentBillModal from "../components/AppointmentBillModal";
import AppointmentModal, { PatientPicker } from "../components/AppointmentModal";
import { PickerField } from "../components/PickerDrawer";
import TimePickerDrawer, { DateField } from "../components/TimePickerDrawer";
import { formatMoney } from "../lib/money";
import { useAuth } from "../auth/AuthContext";

// Локальная дата "YYYY-MM-DD" без UTC-сдвига (toISOString уехал бы на день
// назад вечером в часовых поясах восточнее Гринвича).
function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTH_LABELS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

export default function AppointmentsPage() {
  const { user, readOnly } = useAuth();
  const isAdmin = (user?.role === "owner" || user?.role === "admin") && !readOnly;

  const { data: doctors = [] } = useDoctors();

  // Вместо фильтра «с - по» - месяц и лента его дней: клик по числу показывает
  // записи этого дня. По умолчанию - сегодня. В режиме «Диапазон» два клика
  // задают отрезок: первый - начало, второй - конец.
  const today = new Date();
  const [monthDate, setMonthDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState(localDateStr(today));
  // Конец диапазона; пустая строка - выбран один день.
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [doctorFilter, setDoctorFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

  function pickDay(value: string) {
    if (rangeMode && selectedDay && !rangeEnd && value !== selectedDay) {
      // Второй клик: замыкаем диапазон (клики в любом порядке).
      if (value < selectedDay) {
        setRangeEnd(selectedDay);
        setSelectedDay(value);
      } else {
        setRangeEnd(value);
      }
      return;
    }
    setSelectedDay(value);
    setRangeEnd("");
  }

  function toggleRangeMode() {
    setRangeMode((v) => !v);
    setRangeEnd("");
  }

  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  ).getDate();
  const todayStr = localDateStr(today);

  function shiftMonth(delta: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1);
    setMonthDate(next);
    // При смене месяца выбираем «сегодня», если оно в этом месяце, иначе 1-е.
    const sameMonth =
      next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth();
    setSelectedDay(sameMonth ? todayStr : localDateStr(next));
    setRangeEnd("");
  }

  function dayStr(day: number): string {
    return localDateStr(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  function isWeekend(day: number): boolean {
    const wd = new Date(monthDate.getFullYear(), monthDate.getMonth(), day).getDay();
    return wd === 0 || wd === 6;
  }

  const from = useMemo(() => new Date(selectedDay + "T00:00:00").toISOString(), [selectedDay]);
  const to = useMemo(() => {
    const d = new Date((rangeEnd || selectedDay) + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [selectedDay, rangeEnd]);

  const { data: appointments = [], isLoading } = useAppointments(from, to, doctorFilter);
  const saveApptTop = useSaveAppointment();
  const deleteAppt = useDeleteAppointment();

  const filtered = statusFilter
    ? appointments.filter((a) => a.status === statusFilter)
    : appointments;

  async function cancel(a: Appointment) {
    if (!confirm(`Отменить запись пациента ${a.patient_name}?`)) return;
    try {
      await saveApptTop.mutateAsync({
        id: a.id,
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        start_time: a.start_time,
        end_time: a.end_time,
        status: "cancelled",
        diagnosis: a.diagnosis,
        description: a.description,
        next_visit_date: a.next_visit_date ?? "",
      });
    } catch (e) { alert(errorMessage(e)); }
  }

  // Отмена оставляет запись в календаре серой; удаление стирает её полностью
  // вместе с пробитыми услугами - поэтому предупреждаем отдельно.
  async function remove(a: Appointment) {
    if (
      !confirm(
        `Удалить запись пациента ${a.patient_name} от ${formatDate(a.start_time)} безвозвратно?\n\n` +
          `Она исчезнет из календаря и истории пациента вместе с пробитыми услугами. ` +
          `Чтобы просто пометить приём несостоявшимся, используйте «Отменить».`
      )
    )
      return;
    try {
      await deleteAppt.mutateAsync(a.id);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Записи</h1>
        {!readOnly && (
          <Button onClick={() => setCreating(true)}>Новая запись</Button>
        )}
      </div>

      {/* Месяц и лента его дней: быстрее, чем два поля дат. Кнопка «Диапазон»
          включает выбор отрезка двумя кликами. */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={toggleRangeMode}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              rangeMode
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Диапазон
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
            <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-ink">
              {MONTH_LABELS[monthDate.getMonth()]} {monthDate.getFullYear()}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
              aria-label="Следующий месяц"
            >
              →
            </button>
          </div>
          {/* Симметричная заглушка, чтобы месяц оставался по центру. */}
          <span className="w-[4.5rem]" />
        </div>
        {rangeMode && (
          <p className="text-center text-xs text-slate-400">
            {rangeEnd
              ? "Диапазон выбран. Клик по дню начнёт новый."
              : selectedDay
                ? "Теперь выберите последний день диапазона"
                : "Выберите первый день диапазона"}
          </p>
        )}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const value = dayStr(day);
            const isEdge = value === selectedDay || value === rangeEnd;
            const inRange =
              rangeEnd !== "" && value > selectedDay && value < rangeEnd;
            const isToday = value === todayStr;
            return (
              <button
                key={day}
                onClick={() => pickDay(value)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all duration-300 ${
                  isEdge
                    ? "scale-110 bg-brand text-white shadow-md"
                    : inRange
                      ? "bg-brand-light text-brand-dark"
                      : isToday
                        ? "bg-brand-light text-brand-dark"
                        : isWeekend(day)
                          ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <select
          value={doctorFilter ?? ""}
          onChange={(e) => setDoctorFilter(e.target.value ? Number(e.target.value) : null)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">Все врачи</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.full_name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">Все статусы</option>
          {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="ml-auto self-center text-sm text-slate-400">
          {filtered.length} записей
        </span>
      </div>

      {/* Список */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Записей не найдено
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <AppointmentRow
              key={a.id}
              appointment={a}
              isAdmin={isAdmin}
              readOnly={readOnly}
              onEdit={() => setEditing(a)}
              onCancel={() => cancel(a)}
              onDelete={() => remove(a)}
            />
          ))}
        </div>
      )}

      {editing && (
        <AppointmentEditModal
          appointment={editing}
          doctors={doctors}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && (
        <AppointmentModal
          doctors={doctors}
          existing={null}
          initialStart={`${selectedDay}T10:00`}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function AppointmentRow({
  appointment: a,
  isAdmin,
  readOnly,
  onEdit,
  onCancel,
  onDelete,
}: {
  appointment: Appointment;
  isAdmin: boolean;
  // Режим поддержки: карточку можно раскрыть и прочитать, но не менять.
  readOnly: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [billing, setBilling] = useState(false);
  const saveAppt = useSaveAppointment();

  const startDate = new Date(a.start_time);
  const endDate = new Date(a.end_time);

  // Завершение приёма сразу ведёт к расчёту стоимости: услуги проще пробить,
  // пока пациент ещё в кресле, чем вспоминать их вечером.
  async function markCompleted() {
    try {
      await saveAppt.mutateAsync({
        id: a.id,
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        start_time: a.start_time,
        end_time: a.end_time,
        status: "completed",
        diagnosis: a.diagnosis,
        description: a.description,
        next_visit_date: a.next_visit_date ?? "",
      });
      // Врачу деньги не показываем - окно расчёта только для владельца и менеджера.
      if (isAdmin) setBilling(true);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: a.doctor_color }} />
        <span className="text-sm text-slate-500 tabular-nums w-24 shrink-0">
          {formatDate(a.start_time)}
        </span>
        <span className="font-semibold tabular-nums text-brand w-28 shrink-0">
          {startDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {endDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="font-medium">{a.patient_name}</span>
        <span className="text-sm text-slate-400">{a.doctor_name}</span>
        <span className="ml-auto flex items-center gap-2">
          {a.total != null && a.total > 0 && (
            <span className="text-sm font-semibold tabular-nums text-green-700">
              {formatMoney(a.total)}
            </span>
          )}
          <StatusBadge status={a.status} />
          <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 text-sm">
            <Info label="Пациент" value={a.patient_name} />
            <Info label="Телефон" value={a.patient_phone || "-"} />
            <Info label="Врач" value={a.doctor_name} />
            <Info label="Дата" value={formatDate(a.start_time)} />
            <Info label="Начало" value={startDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
            <Info label="Окончание" value={endDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
            {a.diagnosis && <Info label="Диагноз" value={a.diagnosis} wide />}
            {a.description && <Info label="Описание" value={a.description} wide />}
            {a.next_visit_date && <Info label="Следующий приём" value={formatDate(a.next_visit_date)} wide />}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" className="py-1 px-3 text-xs" onClick={onEdit}>
                Редактировать
              </Button>
              {a.status !== "completed" && (
                <Button className="py-1 px-3 text-xs" onClick={markCompleted} disabled={saveAppt.isPending}>
                  {saveAppt.isPending ? "Сохранение…" : "Завершить"}
                </Button>
              )}
              {isAdmin && (
                <Button variant="secondary" className="py-1 px-3 text-xs" onClick={() => setBilling(true)}>
                  Услуги и стоимость
                </Button>
              )}
              <Button variant="secondary" className="py-1 px-3 text-xs" onClick={() => setSchedulingFollowUp(true)}>
                {a.next_visit_date ? "Изменить след. приём" : "Следующий приём"}
              </Button>
              {isAdmin && a.status !== "cancelled" && (
                <Button variant="secondary" className="py-1 px-3 text-xs" onClick={onCancel}>
                  Отменить
                </Button>
              )}
              {/* Отменённая запись остаётся в календаре серой. Удаление стирает
                  её насовсем - вместе с пробитыми услугами. */}
              {isAdmin && (
                <Button variant="danger" className="py-1 px-3 text-xs" onClick={onDelete}>
                  Удалить
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {schedulingFollowUp && (
        <ScheduleFollowUpModal appointment={a} onClose={() => setSchedulingFollowUp(false)} />
      )}
      {billing && (
        <AppointmentBillModal appointment={a} onClose={() => setBilling(false)} />
      )}
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : ""}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}

function AppointmentEditModal({
  appointment,
  doctors,
  onClose,
}: {
  appointment: Appointment;
  doctors: Doctor[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const save = useSaveAppointment();
  const savePatient = useSavePatient();

  const [doctorId, setDoctorId] = useState(appointment.doctor_id);
  const [start, setStart] = useState(isoToLocalInput(appointment.start_time));
  const [end, setEnd] = useState(isoToLocalInput(appointment.end_time));
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status);
  const [diagnosis, setDiagnosis] = useState(appointment.diagnosis ?? "");
  const [description, setDescription] = useState(appointment.description ?? "");
  const [nextVisit, setNextVisit] = useState(appointment.next_visit_date ?? "");
  const [patientId, setPatientId] = useState<number | "new">(appointment.patient_id);
  // Имя выбранного пациента храним рядом: база листается страницами, найти его
  // в загруженном куске списка уже нельзя.
  const [patientName, setPatientName] = useState(appointment.patient_name);
  const [pickingPatient, setPickingPatient] = useState(false);
  const [pickingTime, setPickingTime] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientIin, setNewPatientIin] = useState("");
  const [error, setError] = useState("");
  // В мини-форме нет полей даты рождения и пола - берём их из ИИН.
  const newPatientInfo = parseIIN(newPatientIin);

  async function submit() {
    setError("");
    try {
      let resolvedPatientId = patientId;
      if (patientId === "new") {
        if (!newPatientName.trim()) { setError("Введите ФИО нового пациента"); return; }
        if (newPatientIin && newPatientIin.length !== 12) { setError("ИИН должен состоять из 12 цифр"); return; }
        const created = await savePatient.mutateAsync({
          full_name: newPatientName.trim(),
          phone: newPatientPhone.trim(),
          iin: newPatientIin,
          ...(newPatientInfo
            ? { birth_date: newPatientInfo.birthDate, gender: newPatientInfo.gender }
            : {}),
        });
        resolvedPatientId = created.id;
      }
      await save.mutateAsync({
        id: appointment.id,
        patient_id: resolvedPatientId as number,
        doctor_id: doctorId,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
        status,
        diagnosis,
        description,
        next_visit_date: nextVisit,
      });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  const busy = save.isPending || savePatient.isPending;

  return (
    <Modal
      title="Редактировать запись"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {isAdmin ? (
          <Field label="Пациент">
            <PickerField
              value={patientId === "new" ? "Новый пациент" : patientName}
              placeholder="Выберите пациента"
              onClick={() => setPickingPatient(true)}
            />
          </Field>
        ) : (
          <div className="text-sm text-slate-500">Пациент: <strong className="text-ink">{appointment.patient_name}</strong></div>
        )}

        {patientId === "new" && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-brand-bg p-3">
            <Field label="ФИО"><Input value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} /></Field>
            <Field label="ИИН (12 цифр)">
              <Input
                value={newPatientIin}
                inputMode="numeric"
                maxLength={12}
                onChange={(e) => setNewPatientIin(e.target.value.replace(/\D/g, "").slice(0, 12))}
              />
              {newPatientInfo && (
                <p className="mt-1 text-xs text-slate-400">
                  Дата рождения: {formatDate(newPatientInfo.birthDate)} ·{" "}
                  {ageCategory(newPatientInfo.birthDate)} ·{" "}
                  {GENDER_LABELS[newPatientInfo.gender]}
                </p>
              )}
            </Field>
            <Field label="Телефон"><Input value={newPatientPhone} onChange={(e) => setNewPatientPhone(e.target.value)} placeholder="+7…" /></Field>
          </div>
        )}

        <Field label="Врач">
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            {doctors.filter((d) => d.is_active || d.id === doctorId).map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Дата и время">
          <PickerField
            value={
              start
                ? `${new Date(start).toLocaleDateString("ru", { day: "numeric", month: "long" })}, ${start.slice(11, 16)} – ${end.slice(11, 16)}`
                : ""
            }
            placeholder="Выбрать дату и время"
            onClick={() => setPickingTime(true)}
          />
        </Field>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Диагноз">
          <Input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="(желательно)"
          />
        </Field>
        <Field label="Описание приёма">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="(не обязательно)"
          />
        </Field>
        <Field label="Следующий приём">
          <DateField
            value={nextVisit}
            onChange={setNextVisit}
            drawerTitle="Дата следующего приёма"
          />
        </Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>

      {pickingPatient && (
        <PatientPicker
          onPick={(p) => {
            setPatientId(p.id);
            setPatientName(p.phone ? `${p.full_name} · ${p.phone}` : p.full_name);
            setPickingPatient(false);
          }}
          onNew={() => {
            setPatientId("new");
            setPatientName("");
            setPickingPatient(false);
          }}
          onClose={() => setPickingPatient(false)}
        />
      )}
      {pickingTime && (
        <TimePickerDrawer
          value={{ start, end }}
          onApply={(range) => {
            setStart(range.start);
            setEnd(range.end);
            setPickingTime(false);
          }}
          onClose={() => setPickingTime(false)}
        />
      )}
    </Modal>
  );
}
