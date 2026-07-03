import { useState, useMemo } from "react";
import {
  useAppointments,
  useDoctors,
  useSaveAppointment,
  usePatients,
  useSavePatient,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, AppointmentStatus, Doctor } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";
import { isoToLocalInput, localInputToISO, formatDate } from "../lib/datetime";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "../components/ui";
import { DateInput, DateTimeInput } from "../components/DateInputs";
import ScheduleFollowUpModal from "../components/ScheduleFollowUpModal";
import { useAuth } from "../auth/AuthContext";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const { data: doctors = [] } = useDoctors();

  const [dateFrom, setDateFrom] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [doctorFilter, setDoctorFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [editing, setEditing] = useState<Appointment | null>(null);

  const from = useMemo(() => new Date(dateFrom).toISOString(), [dateFrom]);
  const to = useMemo(() => {
    const d = new Date(dateTo);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [dateTo]);

  const { data: appointments = [], isLoading } = useAppointments(from, to, doctorFilter);
  const saveApptTop = useSaveAppointment();

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Записи</h1>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">С</span>
          <DateInput className="w-40" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">По</span>
          <DateInput className="w-40" value={dateTo} onChange={setDateTo} />
        </div>
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
              onEdit={() => setEditing(a)}
              onCancel={() => cancel(a)}
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
    </div>
  );
}

function AppointmentRow({
  appointment: a,
  isAdmin,
  onEdit,
  onCancel,
}: {
  appointment: Appointment;
  isAdmin: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const saveAppt = useSaveAppointment();

  const startDate = new Date(a.start_time);
  const endDate = new Date(a.end_time);

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
          <StatusBadge status={a.status} />
          <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 text-sm">
            <Info label="Пациент" value={a.patient_name} />
            <Info label="Телефон" value={a.patient_phone || "—"} />
            <Info label="Врач" value={a.doctor_name} />
            <Info label="Дата" value={formatDate(a.start_time)} />
            <Info label="Начало" value={startDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
            <Info label="Окончание" value={endDate.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
            {a.diagnosis && <Info label="Диагноз" value={a.diagnosis} wide />}
            {a.description && <Info label="Описание" value={a.description} wide />}
            {a.next_visit_date && <Info label="Следующий приём" value={formatDate(a.next_visit_date)} wide />}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="py-1 px-3 text-xs" onClick={onEdit}>
              Редактировать
            </Button>
            {a.status !== "completed" && (
              <Button className="py-1 px-3 text-xs" onClick={markCompleted} disabled={saveAppt.isPending}>
                {saveAppt.isPending ? "Сохранение…" : "Завершить"}
              </Button>
            )}
            <Button variant="secondary" className="py-1 px-3 text-xs" onClick={() => setSchedulingFollowUp(true)}>
              Следующий приём
            </Button>
            {isAdmin && a.status !== "cancelled" && (
              <Button variant="danger" className="py-1 px-3 text-xs" onClick={onCancel}>
                Отменить
              </Button>
            )}
          </div>
        </div>
      )}
      {schedulingFollowUp && (
        <ScheduleFollowUpModal appointment={a} onClose={() => setSchedulingFollowUp(false)} />
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
  const { data: patients = [] } = usePatients("");

  const [doctorId, setDoctorId] = useState(appointment.doctor_id);
  const [start, setStart] = useState(isoToLocalInput(appointment.start_time));
  const [end, setEnd] = useState(isoToLocalInput(appointment.end_time));
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status);
  const [diagnosis, setDiagnosis] = useState(appointment.diagnosis ?? "");
  const [description, setDescription] = useState(appointment.description ?? "");
  const [nextVisit, setNextVisit] = useState(appointment.next_visit_date ?? "");
  const [patientId, setPatientId] = useState<number | "new">(appointment.patient_id);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      let resolvedPatientId = patientId;
      if (patientId === "new") {
        if (!newPatientName.trim()) { setError("Введите ФИО нового пациента"); return; }
        const created = await savePatient.mutateAsync({
          full_name: newPatientName.trim(),
          phone: newPatientPhone.trim(),
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
            <Select
              value={patientId === "new" ? "new" : String(patientId)}
              onChange={(e) => setPatientId(e.target.value === "new" ? "new" : Number(e.target.value))}
            >
              <option value="new">+ Новый пациент</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}{p.phone && ` · ${p.phone}`}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="text-sm text-slate-500">Пациент: <strong className="text-ink">{appointment.patient_name}</strong></div>
        )}

        {patientId === "new" && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-brand-bg p-3">
            <Field label="ФИО"><Input value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} /></Field>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><DateTimeInput value={start} onChange={setStart} /></Field>
          <Field label="Окончание"><DateTimeInput value={end} onChange={setEnd} /></Field>
        </div>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Диагноз"><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></Field>
        <Field label="Описание приёма"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Следующий приём"><DateInput value={nextVisit} onChange={setNextVisit} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}
