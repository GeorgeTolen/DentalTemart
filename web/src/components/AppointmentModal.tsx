import { useMemo, useState } from "react";
import {
  useDeleteAppointment,
  usePatients,
  useSaveAppointment,
  useSavePatient,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, AppointmentStatus, Doctor, Patient } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";
import {
  formatDateTime,
  isoToLocalInput,
  localInputToISO,
  validateAppointmentDate,
  defaultAppointmentStart,
  addMinutesToLocalInput,
} from "../lib/datetime";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "./ui";
import { DateInput } from "./DateInputs";
import { PickerDrawer, PickerField, PickerRow, useDebounced } from "./PickerDrawer";
import TimePickerDrawer from "./TimePickerDrawer";
import { Avatar } from "./Avatar";
import AppointmentBillModal from "./AppointmentBillModal";
import { useAuth } from "../auth/AuthContext";

interface Props {
  doctors: Doctor[];
  existing: Appointment | null;
  // For a brand-new appointment created from a calendar slot.
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
}

const STATUSES: AppointmentStatus[] = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
];

export default function AppointmentModal(props: Props) {
  // A completed appointment can no longer be edited — instead the card turns
  // into a "schedule the follow-up visit" form.
  if (props.existing?.status === "completed") {
    return <CompletedCard {...props} existing={props.existing} />;
  }
  return <EditCard {...props} />;
}

// Приём по умолчанию длится час: так его чаще всего и планируют, а сдвинуть
// окончание можно вручную.
const DEFAULT_DURATION_MIN = 60;

/** Строка для поля-кнопки выбора пациента. */
function patientLabel(p: Patient): string {
  return p.phone ? `${p.full_name} · ${p.phone}` : p.full_name;
}

// --- editable appointment (new or not-yet-completed) ---

function EditCard({
  doctors,
  existing,
  initialStart,
  initialEnd,
  onClose,
}: Props) {
  const { user, readOnly } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "admin";
  const saveAppt = useSaveAppointment();
  const savePatient = useSavePatient();

  const activeDoctors = useMemo(
    () => doctors.filter((d) => d.is_active || d.id === existing?.doctor_id),
    [doctors, existing]
  );

  const [patientId, setPatientId] = useState<number | "new" | "">(
    existing?.patient_id ?? ""
  );
  // Подпись выбранного пациента: список теперь листается страницами, и найти в
  // нём выбранного, чтобы показать имя, уже нельзя — храним рядом.
  const [patientName, setPatientName] = useState(existing?.patient_name ?? "");
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientIin, setNewPatientIin] = useState("");
  const [doctorId, setDoctorId] = useState<number | "">(
    existing?.doctor_id ?? activeDoctors[0]?.id ?? ""
  );
  const [pickingPatient, setPickingPatient] = useState(false);
  const [pickingDoctor, setPickingDoctor] = useState(false);
  const [pickingTime, setPickingTime] = useState(false);
  // Новая запись по умолчанию начинается сегодня, в ближайшее рабочее время
  // (8:00–20:00), длится час. Правится через шторку с календарём.
  const [start, setStart] = useState(
    existing
      ? isoToLocalInput(existing.start_time)
      : initialStart ?? defaultAppointmentStart()
  );
  const [end, setEnd] = useState(
    existing
      ? isoToLocalInput(existing.end_time)
      : initialEnd ??
          addMinutesToLocalInput(
            initialStart ?? defaultAppointmentStart(),
            DEFAULT_DURATION_MIN
          )
  );
  const [status, setStatus] = useState<AppointmentStatus>(
    existing?.status ?? "scheduled"
  );
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [nextVisit, setNextVisit] = useState(existing?.next_visit_date ?? "");
  const [error, setError] = useState("");
  const [billing, setBilling] = useState(false);

  const busy = saveAppt.isPending || savePatient.isPending;
  const selectedDoctor = activeDoctors.find((d) => d.id === doctorId);

  // «12 августа, 10:00 – 11:00» для шапки карточки.
  const timeLabel = start
    ? `${new Date(start).toLocaleDateString("ru", { day: "numeric", month: "long" })}, ${start.slice(11, 16)} – ${end.slice(11, 16)}`
    : "";

  // «Завершить» прямо из карточки: администратору сразу открывается расчёт
  // стоимости, врачу — просто закрытие (деньги ему не показываем).
  async function complete() {
    if (!existing) return;
    setError("");
    try {
      await saveAppt.mutateAsync({
        id: existing.id,
        patient_id: existing.patient_id,
        doctor_id: existing.doctor_id,
        start_time: existing.start_time,
        end_time: existing.end_time,
        status: "completed",
        diagnosis,
        description,
        next_visit_date: existing.next_visit_date ?? "",
      });
      if (isManager) setBilling(true);
      else onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onSubmit() {
    setError("");
    if (!doctorId) return setError("Выберите врача");
    if (!start || !end) return setError("Укажите время начала и окончания");
    const dateErr = validateAppointmentDate(start);
    if (dateErr) return setError(dateErr);

    try {
      let resolvedPatientId = patientId;
      if (patientId === "new") {
        if (!newPatientName.trim())
          return setError("Введите ФИО нового пациента");
        if (newPatientIin && newPatientIin.length !== 12)
          return setError("ИИН должен состоять из 12 цифр");
        // Если ИИН уже есть в базе — сервер вернёт существующего пациента.
        const created = await savePatient.mutateAsync({
          full_name: newPatientName.trim(),
          phone: newPatientPhone.trim(),
          iin: newPatientIin,
        });
        resolvedPatientId = created.id;
      }
      if (!resolvedPatientId || resolvedPatientId === "new")
        return setError("Выберите пациента");

      await saveAppt.mutateAsync({
        id: existing?.id,
        patient_id: resolvedPatientId as number,
        doctor_id: doctorId as number,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
        status,
        diagnosis,
        description,
        next_visit_date: nextVisit,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onCancel() {
    if (!existing) return;
    if (!confirm("Отменить запись?")) return;
    try {
      await saveAppt.mutateAsync({
        id: existing.id,
        patient_id: existing.patient_id,
        doctor_id: existing.doctor_id,
        start_time: existing.start_time,
        end_time: existing.end_time,
        status: "cancelled",
        diagnosis: existing.diagnosis,
        description: existing.description,
        next_visit_date: existing.next_visit_date ?? "",
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      title={existing ? "Карточка приёма" : "Новая запись"}
      onClose={onClose}
      footer={
        <>
          {existing && existing.status !== "cancelled" && (
            <Button variant="secondary" onClick={onCancel} className="mr-auto">
              Отменить запись
            </Button>
          )}
          {existing && existing.status !== "cancelled" && !readOnly && (
            <Button variant="success" onClick={complete} disabled={busy}>
              Завершить
            </Button>
          )}
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Шапка: время приёма и статус — самое главное, всегда сверху. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-bg px-3 py-2.5">
          <button
            type="button"
            onClick={() => setPickingTime(true)}
            title="Изменить дату и время"
            className="text-sm font-semibold text-brand-dark hover:underline"
          >
            🕐 {timeLabel || "Выбрать дату и время"}
          </button>
          <span className="ml-auto">
            <StatusBadge status={status} />
          </span>
        </div>

        <Field label="Пациент">
          <PickerField
            value={patientId === "new" ? "Новый пациент" : patientName}
            placeholder="Выберите пациента"
            onClick={() => setPickingPatient(true)}
          />
        </Field>

        {patientId === "new" && (
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-brand-bg p-3 sm:grid-cols-2">
            <Field label="ФИО пациента">
              <Input
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                placeholder="Иванов Иван"
              />
            </Field>
            <Field label="ИИН (12 цифр)">
              <Input
                value={newPatientIin}
                inputMode="numeric"
                maxLength={12}
                onChange={(e) =>
                  setNewPatientIin(e.target.value.replace(/\D/g, "").slice(0, 12))
                }
                placeholder="Если уже есть — подставится пациент"
              />
            </Field>
            <Field label="Телефон">
              <Input
                value={newPatientPhone}
                onChange={(e) => setNewPatientPhone(e.target.value)}
                placeholder="+7…"
              />
            </Field>
          </div>
        )}

        <Field label="Врач">
          <PickerField
            value={
              selectedDoctor
                ? selectedDoctor.specialization
                  ? `${selectedDoctor.full_name} · ${selectedDoctor.specialization}`
                  : selectedDoctor.full_name
                : ""
            }
            placeholder="Выберите врача"
            onClick={() => setPickingDoctor(true)}
          />
        </Field>

        {/* Статус выбирается только у существующей записи: новая всегда
            «Запланирован», лишний селект при создании только путает. */}
        {existing && (
          <Field label="Статус">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        )}

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

        {/* Дата следующего приёма заполняется позже, при работе с записью. */}
        {existing && (
          <Field label="Дата следующего приёма">
            <DateInput value={nextVisit ?? ""} onChange={setNextVisit} />
          </Field>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {pickingPatient && (
        <PatientPicker
          onPick={(p) => {
            setPatientId(p.id);
            setPatientName(patientLabel(p));
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

      {pickingDoctor && (
        <DoctorPicker
          doctors={activeDoctors}
          selectedId={typeof doctorId === "number" ? doctorId : null}
          onPick={(d) => {
            setDoctorId(d.id);
            setPickingDoctor(false);
          }}
          onClose={() => setPickingDoctor(false)}
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

      {billing && existing && (
        <AppointmentBillModal
          appointment={existing}
          onClose={() => {
            setBilling(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

// --- шторки выбора ---

/**
 * Выбор пациента: серверный поиск по общей базе с debounce. Показываем первую
 * страницу результатов — если нужного нет, уточняют запрос.
 */
export function PatientPicker({
  onPick,
  onNew,
  onClose,
}: {
  onPick: (p: Patient) => void;
  onNew?: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const search = useDebounced(input);
  const { data, isFetching } = usePatients(search);
  const patients = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <PickerDrawer
      title="Пациент"
      placeholder="ФИО, телефон или ИИН…"
      search={input}
      onSearch={setInput}
      loading={isFetching && patients.length === 0}
      isEmpty={patients.length === 0}
      emptyLabel="Пациент не найден"
      onClose={onClose}
      footer={
        onNew && (
          <Button variant="secondary" className="w-full" onClick={onNew}>
            + Новый пациент
          </Button>
        )
      }
    >
      {patients.map((p) => (
        <PickerRow
          key={p.id}
          onClick={() => onPick(p)}
          media={<Avatar name={p.full_name} url={p.avatar_url} size="sm" />}
          title={p.full_name}
          subtitle={[p.phone, p.iin].filter(Boolean).join(" · ")}
        />
      ))}
      {total > patients.length && (
        <p className="px-3 py-2 text-xs text-slate-400">
          Показаны первые {patients.length} из {total} — уточните поиск.
        </p>
      )}
    </PickerDrawer>
  );
}

/** Выбор врача: список короткий, поэтому фильтруем локально. */
function DoctorPicker({
  doctors,
  selectedId,
  onPick,
  onClose,
}: {
  doctors: Doctor[];
  selectedId: number | null;
  onPick: (d: Doctor) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? doctors.filter(
        (d) =>
          d.full_name.toLowerCase().includes(q) ||
          d.specialization.toLowerCase().includes(q)
      )
    : doctors;

  return (
    <PickerDrawer
      title="Врач"
      placeholder="ФИО или направление…"
      search={search}
      onSearch={setSearch}
      isEmpty={filtered.length === 0}
      emptyLabel="Врач не найден"
      onClose={onClose}
    >
      {filtered.map((d) => (
        <PickerRow
          key={d.id}
          onClick={() => onPick(d)}
          selected={d.id === selectedId}
          media={
            <Avatar name={d.full_name} url={d.avatar_url} size="sm" color={d.color} />
          }
          title={d.full_name}
          subtitle={d.specialization}
        />
      ))}
    </PickerDrawer>
  );
}

// --- completed appointment: read-only details + schedule the next visit ---

function CompletedCard({
  doctors,
  existing,
  onClose,
}: Props & { existing: Appointment }) {
  const saveAppt = useSaveAppointment();
  const deleteAppt = useDeleteAppointment();

  const activeDoctors = useMemo(
    () => doctors.filter((d) => d.is_active || d.id === existing.doctor_id),
    [doctors, existing]
  );

  // Default the follow-up to the same time-of-day and duration as this visit.
  const originalTime = isoToLocalInput(existing.start_time).slice(11, 16); // "HH:MM"
  const durationMs =
    new Date(existing.end_time).getTime() -
    new Date(existing.start_time).getTime();

  const [nextDate, setNextDate] = useState(existing.next_visit_date ?? "");
  const [nextTime, setNextTime] = useState(originalTime);
  const [nextDoctorId, setNextDoctorId] = useState<number>(existing.doctor_id);
  const [nextNote, setNextNote] = useState("");
  const [error, setError] = useState("");

  const busy = saveAppt.isPending;

  async function scheduleFollowUp() {
    setError("");
    if (!nextDate) return setError("Укажите дату следующего приёма");
    try {
      const startLocal = `${nextDate}T${nextTime || "09:00"}`;
      const startISO = localInputToISO(startLocal);
      const endISO = new Date(
        new Date(startLocal).getTime() + (durationMs > 0 ? durationMs : 30 * 60000)
      ).toISOString();

      // Create the follow-up appointment ("падает на тот день").
      await saveAppt.mutateAsync({
        patient_id: existing.patient_id,
        doctor_id: nextDoctorId,
        start_time: startISO,
        end_time: endISO,
        status: "scheduled",
        diagnosis: "",
        description: nextNote,
        next_visit_date: "",
      });

      // Record the next-visit date on the completed appointment too.
      await saveAppt.mutateAsync({
        id: existing.id,
        patient_id: existing.patient_id,
        doctor_id: existing.doctor_id,
        start_time: existing.start_time,
        end_time: existing.end_time,
        status: existing.status,
        diagnosis: existing.diagnosis,
        description: existing.description,
        next_visit_date: nextDate,
      });

      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onDelete() {
    if (!confirm("Удалить запись?")) return;
    try {
      await deleteAppt.mutateAsync(existing.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      title="Карточка приёма"
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onDelete} className="mr-auto">
            Удалить
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
          <Button onClick={scheduleFollowUp} disabled={busy}>
            {busy ? "Сохранение…" : "Записать на след. приём"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Read-only summary of the completed visit. */}
        <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{existing.patient_name}</span>
            <StatusBadge status={existing.status} />
          </div>
          <Row label="Врач" value={existing.doctor_name} />
          <Row label="Время" value={formatDateTime(existing.start_time)} />
          <Row label="Диагноз" value={existing.diagnosis || "—"} />
          {existing.description && (
            <div>
              <div className="text-slate-400">Описание</div>
              <div className="whitespace-pre-wrap">{existing.description}</div>
            </div>
          )}
          <p className="pt-1 text-xs text-slate-400">
            Приём завершён — данные приёма изменить нельзя. Можно записать
            пациента на следующий приём.
          </p>
        </div>

        {/* Follow-up scheduler. */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Следующий приём</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Дата">
              <DateInput value={nextDate} onChange={setNextDate} />
            </Field>
            <Field label="Время">
              <Input
                type="time"
                value={nextTime}
                onChange={(e) => setNextTime(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Врач (по умолчанию — тот же)">
            <Select
              value={String(nextDoctorId)}
              onChange={(e) => setNextDoctorId(Number(e.target.value))}
            >
              {activeDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                  {d.specialization && ` · ${d.specialization}`}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Заметка к следующему приёму">
            <Textarea
              value={nextNote}
              onChange={(e) => setNextNote(e.target.value)}
              placeholder="Напр.: в след. раз поменять обезболивающее"
            />
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
