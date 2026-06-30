import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  usePatient,
  usePatientAppointments,
  useSavePatient,
  useSaveAppointment,
  useDoctors,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { formatDate, formatDateTime, localInputToISO } from "../lib/datetime";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "../components/ui";
import type { Appointment, AppointmentStatus } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";

export default function PatientDetail() {
  const { id } = useParams();
  const patientId = id ? Number(id) : null;
  const { data: patient, isLoading } = usePatient(patientId);
  const { data: history = [] } = usePatientAppointments(patientId);
  const [editingPatient, setEditingPatient] = useState(false);
  const [newAppt, setNewAppt] = useState(false);

  if (isLoading) return <div className="text-slate-400">Загрузка…</div>;
  if (!patient) return <div className="text-slate-400">Пациент не найден</div>;

  const completed = history.filter((a) => a.status === "completed").length;
  const scheduled = history.filter((a) => a.status === "scheduled").length;
  const lastVisit = history.find((a) => a.status === "completed");
  const nextVisit = [...history].reverse().find((a) => a.status === "scheduled");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/patients" className="text-sm text-brand hover:underline">
          ← К списку пациентов
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditingPatient(true)}>
            Редактировать
          </Button>
          <Button onClick={() => setNewAppt(true)}>
            + Новая запись
          </Button>
        </div>
      </div>

      {/* Карточка пациента */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-bg text-2xl font-bold text-brand">
            {patient.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-ink">{patient.full_name}</h1>
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-500">
              {patient.phone && <span>📞 {patient.phone}</span>}
              {patient.birth_date && (
                <span>
                  🎂 {formatDate(patient.birth_date)}
                  {" "}
                  <span className="text-slate-400">
                    ({new Date().getFullYear() - new Date(patient.birth_date).getFullYear()} лет)
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {patient.notes && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-500">Заметки: </span>
            {patient.notes}
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Всего приёмов" value={history.length} color="text-ink" />
        <StatCard label="Завершено" value={completed} color="text-green-600" />
        <StatCard label="Запланировано" value={scheduled} color="text-brand" />
        <StatCard label="Не пришёл" value={history.filter((a) => a.status === "no_show").length} color="text-orange-500" />
      </div>

      {/* Ближайшая и последняя записи */}
      {(lastVisit || nextVisit) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {nextVisit && (
            <div className="rounded-2xl border border-brand/20 bg-brand-bg p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-brand">Ближайшая запись</div>
              <div className="mt-1 font-semibold text-ink">{formatDateTime(nextVisit.start_time)}</div>
              <div className="text-sm text-slate-500">{nextVisit.doctor_name}</div>
            </div>
          )}
          {lastVisit && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-green-600">Последний приём</div>
              <div className="mt-1 font-semibold text-ink">{formatDateTime(lastVisit.start_time)}</div>
              <div className="text-sm text-slate-500">{lastVisit.doctor_name}</div>
              {lastVisit.diagnosis && <div className="mt-1 text-sm text-slate-600">{lastVisit.diagnosis}</div>}
            </div>
          )}
        </div>
      )}

      {/* История приёмов */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">История лечения</h2>
        {history.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
            Приёмов пока нет
          </div>
        ) : (
          <div className="relative space-y-0">
            {/* Вертикальная линия хронологии */}
            <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />
            <div className="space-y-3 pl-12">
              {history.map((a, i) => (
                <HistoryCard key={a.id} appointment={a} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>

      {editingPatient && (
        <PatientEditModal patient={patient} onClose={() => setEditingPatient(false)} />
      )}
      {newAppt && patientId && (
        <NewAppointmentModal patientId={patientId} patientName={patient.full_name} onClose={() => setNewAppt(false)} />
      )}
    </div>
  );
}

function HistoryCard({ appointment: a }: { appointment: Appointment; index: number }) {
  const [open, setOpen] = useState(false);
  const date = new Date(a.start_time);

  const dotColor: Record<AppointmentStatus, string> = {
    completed: "bg-green-500",
    scheduled: "bg-brand",
    cancelled: "bg-slate-400",
    no_show: "bg-orange-400",
  };

  return (
    <div className="relative">
      {/* Точка на линии */}
      <div className={`absolute -left-[2.15rem] top-4 h-3 w-3 rounded-full border-2 border-white ${dotColor[a.status]}`} />

      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">
                {date.toLocaleDateString("ru", { day: "2-digit", month: "long", year: "numeric" })}
              </span>
              <span className="text-sm text-slate-400">
                {date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <StatusBadge status={a.status} />
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              Врач: {a.doctor_name}
              {a.diagnosis && <span className="ml-3 text-slate-600">· {a.diagnosis}</span>}
            </div>
          </div>
          <span className="text-slate-300 text-xs shrink-0">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Detail label="Врач" value={a.doctor_name} />
              <Detail label="Начало" value={date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
              <Detail label="Окончание" value={new Date(a.end_time).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} />
              <Detail label="Статус" value={STATUS_LABELS[a.status]} />
            </div>
            {a.diagnosis && (
              <div>
                <div className="text-xs text-slate-400">Диагноз</div>
                <div className="mt-0.5 font-medium text-ink">{a.diagnosis}</div>
              </div>
            )}
            {a.description && (
              <div>
                <div className="text-xs text-slate-400">Описание приёма</div>
                <div className="mt-0.5 whitespace-pre-wrap text-slate-600">{a.description}</div>
              </div>
            )}
            {a.next_visit_date && (
              <div className="rounded-xl bg-brand-bg px-3 py-2 text-brand text-sm">
                Следующий приём назначен на: <strong>{formatDate(a.next_visit_date)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}

function PatientEditModal({ patient, onClose }: { patient: { id: number; full_name: string; phone: string; birth_date: string | null; notes: string }; onClose: () => void }) {
  const save = useSavePatient();
  const [name, setName] = useState(patient.full_name);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [birthDate, setBirthDate] = useState(patient.birth_date?.split("T")[0] ?? "");
  const [notes, setNotes] = useState(patient.notes ?? "");
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) { setError("Введите ФИО"); return; }
    try {
      await save.mutateAsync({ id: patient.id, full_name: name, phone, birth_date: birthDate, notes });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Modal
      title="Редактировать пациента"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО *"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" /></Field>
        <Field label="Дата рождения"><Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></Field>
        <Field label="Заметки"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}

function NewAppointmentModal({ patientId, patientName, onClose }: { patientId: number; patientName: string; onClose: () => void }) {
  const { data: doctors = [] } = useDoctors();
  const activeDoctors = doctors.filter((d) => d.is_active);
  const save = useSaveAppointment();

  const [doctorId, setDoctorId] = useState<number | "">(activeDoctors[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");
  const [nextVisit, setNextVisit] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время начала и окончания"); return; }
    try {
      await save.mutateAsync({
        patient_id: patientId,
        doctor_id: doctorId as number,
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

  return (
    <Modal
      title="Новая запись"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Создать запись"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-bg px-4 py-2 text-sm">
          Пациент: <strong>{patientName}</strong>
        </div>
        <Field label="Врач">
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            <option value="">— выберите врача —</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}{d.specialization && ` · ${d.specialization}`}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Окончание"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Диагноз"><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Необязательно" /></Field>
        <Field label="Описание"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" /></Field>
        <Field label="Следующий приём"><Input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}
