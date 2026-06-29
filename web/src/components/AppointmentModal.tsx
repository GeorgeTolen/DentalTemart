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
import { isoToLocalInput, localInputToISO } from "../lib/datetime";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

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

export default function AppointmentModal({
  doctors,
  existing,
  initialStart,
  initialEnd,
  onClose,
}: Props) {
  const { data: patients = [] } = usePatients("");
  const saveAppt = useSaveAppointment();
  const deleteAppt = useDeleteAppointment();
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

  async function onDelete() {
    if (!existing) return;
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
      title={existing ? "Карточка приёма" : "Новая запись"}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Удалить
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
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Окончание">
            <Input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
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
          <Input
            type="date"
            value={nextVisit ?? ""}
            onChange={(e) => setNextVisit(e.target.value)}
          />
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
