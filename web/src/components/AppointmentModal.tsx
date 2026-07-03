import { useMemo, useState } from "react";
import {
  useDeleteAppointment,
  usePatients,
  useSaveAppointment,
  useSavePatient,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, AppointmentStatus, Doctor } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";
import {
  formatDateTime,
  isoToLocalInput,
  localInputToISO,
  maxAppointmentInput,
  validateAppointmentDate,
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
import { DateInput, DateTimeInput } from "./DateInputs";

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

// --- editable appointment (new or not-yet-completed) ---

function EditCard({
  doctors,
  existing,
  initialStart,
  initialEnd,
  onClose,
}: Props) {
  const { data: patients = [] } = usePatients("");
  const saveAppt = useSaveAppointment();
  const savePatient = useSavePatient();

  const activeDoctors = useMemo(
    () => doctors.filter((d) => d.is_active || d.id === existing?.doctor_id),
    [doctors, existing]
  );

  const [patientId, setPatientId] = useState<number | "new" | "">(
    existing?.patient_id ?? ""
  );
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [doctorId, setDoctorId] = useState<number | "">(
    existing?.doctor_id ?? activeDoctors[0]?.id ?? ""
  );
  const [start, setStart] = useState(
    existing ? isoToLocalInput(existing.start_time) : initialStart ?? ""
  );
  const [end, setEnd] = useState(
    existing ? isoToLocalInput(existing.end_time) : initialEnd ?? ""
  );
  const [status, setStatus] = useState<AppointmentStatus>(
    existing?.status ?? "scheduled"
  );
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [nextVisit, setNextVisit] = useState(existing?.next_visit_date ?? "");
  const [error, setError] = useState("");

  const busy = saveAppt.isPending || savePatient.isPending;

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
        const created = await savePatient.mutateAsync({
          full_name: newPatientName.trim(),
          phone: newPatientPhone.trim(),
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
            <Button variant="danger" onClick={onCancel} className="mr-auto">
              Отменить
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Пациент">
          <Select
            value={patientId === "new" ? "new" : String(patientId)}
            onChange={(e) => {
              const v = e.target.value;
              setPatientId(v === "new" ? "new" : v === "" ? "" : Number(v));
            }}
          >
            <option value="">— выберите —</option>
            <option value="new">+ Новый пациент</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.phone && `· ${p.phone}`}
              </option>
            ))}
          </Select>
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
          <Select
            value={String(doctorId)}
            onChange={(e) => setDoctorId(Number(e.target.value))}
          >
            <option value="">— выберите —</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {d.specialization && ` · ${d.specialization}`}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Начало">
            <DateTimeInput
              value={start}
              maxDate={maxAppointmentInput().slice(0, 10)}
              onChange={setStart}
            />
          </Field>
          <Field label="Окончание">
            <DateTimeInput
              value={end}
              maxDate={maxAppointmentInput().slice(0, 10)}
              onChange={setEnd}
            />
          </Field>
        </div>

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

        <Field label="Диагноз">
          <Input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
          />
        </Field>

        <Field label="Описание приёма">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label="Дата следующего приёма">
          <DateInput value={nextVisit ?? ""} onChange={setNextVisit} />
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
