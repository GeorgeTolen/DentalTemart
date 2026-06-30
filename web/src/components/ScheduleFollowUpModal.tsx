import { useState } from "react";
import { useDoctors, useSaveAppointment } from "../api/hooks";
import { errorMessage } from "../api/client";
import { localInputToISO, maxAppointmentInput, validateAppointmentDate } from "../lib/datetime";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { Appointment } from "../lib/types";

// Quick "schedule the next visit" modal, reused from the Dashboard, the
// Appointments page, and the patient's treatment history.
export default function ScheduleFollowUpModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const { data: doctors = [] } = useDoctors();
  const activeDoctors = doctors.filter((d) => d.is_active || d.id === appointment.doctor_id);
  const save = useSaveAppointment();

  const durationMs =
    new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime();
  const originalTime = new Date(appointment.start_time);
  const pad = (n: number) => String(n).padStart(2, "0");

  const [doctorId, setDoctorId] = useState(appointment.doctor_id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(`${pad(originalTime.getHours())}:${pad(originalTime.getMinutes())}`);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!date) { setError("Укажите дату"); return; }
    const dateErr = validateAppointmentDate(date);
    if (dateErr) { setError(dateErr); return; }
    try {
      const startLocal = `${date}T${time || "09:00"}`;
      const startISO = localInputToISO(startLocal);
      const endISO = new Date(
        new Date(startLocal).getTime() + (durationMs > 0 ? durationMs : 30 * 60000)
      ).toISOString();
      await save.mutateAsync({
        patient_id: appointment.patient_id,
        doctor_id: doctorId,
        start_time: startISO,
        end_time: endISO,
        status: "scheduled",
        diagnosis: "",
        description: "",
        next_visit_date: "",
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title="Записать на следующий приём"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Записать"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-bg px-4 py-2 text-sm">
          Пациент: <strong>{appointment.patient_name}</strong>
        </div>
        <Field label="Врач">
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}{d.specialization && ` · ${d.specialization}`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата">
            <Input
              type="date"
              value={date}
              max={maxAppointmentInput().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Время">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}
