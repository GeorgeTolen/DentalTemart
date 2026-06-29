import { useState, useMemo, useEffect } from "react";
import {
  useAdminStats,
  useArchivedCount,
  useDeleteArchivedAppointments,
  useDeletePatient,
  useDeleteUser,
  useDoctors,
  usePatients,
  useSaveAppointment,
  useSavePatient,
  useSaveUser,
  useUsers,
  useDeleteAppointment,
  useSaveDoctor,
  useDeleteDoctor,
  useAppointments,
  useSchedule,
  useSaveSchedule,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, Doctor, Patient, Role, ScheduleEntry, User } from "../lib/types";
import { STATUS_LABELS } from "../lib/types";
import { localInputToISO, isoToLocalInput } from "../lib/datetime";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "../components/ui";

// ---------- helpers ----------

const TABS = ["Флоу", "Управление", "Статистика", "Архив"] as const;
type Tab = (typeof TABS)[number];

const ROLES: Role[] = ["owner", "admin", "doctor"];
const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  doctor: "Врач",
};

function todayRange() {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(now.getMonth() - 1);
  const to = new Date(now);
  to.setMonth(now.getMonth() + 3);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

// ========== ADMIN FLOW (stepper) ==========

type FlowStep = 1 | 2 | 3 | 4 | 5;

interface FlowState {
  patient: Patient | null;
  appointment: Appointment | null;
}

function AdminFlow() {
  const [step, setStep] = useState<FlowStep>(1);
  const [flow, setFlow] = useState<FlowState>({ patient: null, appointment: null });
  const [error, setError] = useState("");

  function reset() {
    setStep(1);
    setFlow({ patient: null, appointment: null });
    setError("");
  }

  return (
    <div className="space-y-6">
      {/* Stepper header */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {([1, 2, 3, 4, 5] as FlowStep[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                s === step
                  ? "bg-brand text-white"
                  : s < step
                  ? "bg-green-500 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            <span className={`whitespace-nowrap text-sm ${s === step ? "font-semibold text-ink" : "text-slate-400"}`}>
              {["Регистрация пациента", "Назначение записи", "Проведение процедуры", "Закрытие записи", "Новая запись"][s - 1]}
            </span>
            {s < 5 && <div className="h-px w-6 shrink-0 bg-slate-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {step === 1 && (
        <FlowStep1
          onNext={(p) => { setFlow((f) => ({ ...f, patient: p })); setStep(2); setError(""); }}
          setError={setError}
        />
      )}
      {step === 2 && flow.patient && (
        <FlowStep2
          patient={flow.patient}
          onNext={(a) => { setFlow((f) => ({ ...f, appointment: a })); setStep(3); setError(""); }}
          onBack={() => setStep(1)}
          setError={setError}
        />
      )}
      {step === 3 && flow.appointment && (
        <FlowStep3
          appointment={flow.appointment}
          onNext={(a) => { setFlow((f) => ({ ...f, appointment: a })); setStep(4); setError(""); }}
          onBack={() => setStep(2)}
          setError={setError}
        />
      )}
      {step === 4 && flow.appointment && (
        <FlowStep4
          appointment={flow.appointment}
          onNext={(a) => { setFlow((f) => ({ ...f, appointment: a })); setStep(5); setError(""); }}
          onBack={() => setStep(3)}
          setError={setError}
        />
      )}
      {step === 5 && flow.appointment && (
        <FlowStep5
          appointment={flow.appointment}
          onFinish={reset}
          setError={setError}
        />
      )}
    </div>
  );
}

// Step 1: Register / find patient
function FlowStep1({ onNext, setError }: { onNext: (p: Patient) => void; setError: (e: string) => void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "new">("search");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const { data: patients = [], isFetching } = usePatients(search);
  const savePatient = useSavePatient();

  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  async function createPatient() {
    if (!name.trim()) { setError("Введите ФИО пациента"); return; }
    try {
      const p = await savePatient.mutateAsync({ full_name: name.trim(), phone, birth_date: birthDate, notes });
      setError("");
      onNext(p);
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Шаг 1: Регистрация пациента</h3>
      <div className="flex gap-3">
        <Button variant={mode === "search" ? "primary" : "secondary"} onClick={() => setMode("search")}>Найти существующего</Button>
        <Button variant={mode === "new" ? "primary" : "secondary"} onClick={() => setMode("new")}>Создать нового</Button>
      </div>

      {mode === "search" ? (
        <div className="space-y-3">
          <Field label="Поиск по имени или телефону">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Начните вводить имя или телефон..."
              autoFocus
            />
          </Field>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {!input && (
              <p className="text-sm text-slate-400 px-2">Введите имя или телефон для поиска</p>
            )}
            {input && isFetching && (
              <p className="text-sm text-slate-400 px-2">Поиск...</p>
            )}
            {input && !isFetching && patients.map((p) => (
              <button
                key={p.id}
                onClick={() => onNext(p)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm hover:bg-brand-bg hover:border-brand transition"
              >
                <span className="font-medium">{p.full_name}</span>
                {p.phone && <span className="ml-2 text-slate-400">{p.phone}</span>}
              </button>
            ))}
            {input && !isFetching && patients.length === 0 && (
              <p className="text-sm text-slate-400 px-2">Пациент не найден</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ФИО *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" /></Field>
            <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." /></Field>
            <Field label="Дата рождения"><Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></Field>
            <Field label="Заметки"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <Button onClick={createPatient} disabled={savePatient.isPending}>
            {savePatient.isPending ? "Сохранение…" : "Зарегистрировать и продолжить"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Step 2: Schedule appointment
function FlowStep2({ patient, onNext, onBack, setError }: {
  patient: Patient; onNext: (a: Appointment) => void; onBack: () => void; setError: (e: string) => void;
}) {
  const { data: doctors = [] } = useDoctors();
  const activeDoctors = doctors.filter((d) => d.is_active);
  const saveAppt = useSaveAppointment();

  const [doctorId, setDoctorId] = useState<number | "">(activeDoctors[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  async function schedule() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время начала и окончания"); return; }
    try {
      const a = await saveAppt.mutateAsync({
        patient_id: patient.id,
        doctor_id: doctorId as number,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
        status: "scheduled",
        diagnosis: "",
        description: "",
        next_visit_date: "",
      });
      setError("");
      onNext(a);
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Шаг 2: Назначение записи</h3>
      <div className="rounded-xl bg-brand-bg px-4 py-2 text-sm">
        Пациент: <strong>{patient.full_name}</strong>
      </div>
      <div className="space-y-3">
        <Field label="Врач">
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            <option value="">— выберите —</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}{d.specialization && ` · ${d.specialization}`}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Окончание"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Назад</Button>
        <Button onClick={schedule} disabled={saveAppt.isPending}>{saveAppt.isPending ? "Сохранение…" : "Назначить запись"}</Button>
      </div>
    </div>
  );
}

// Step 3: Conduct procedure (fill diagnosis/description)
function FlowStep3({ appointment, onNext, onBack, setError }: {
  appointment: Appointment; onNext: (a: Appointment) => void; onBack: () => void; setError: (e: string) => void;
}) {
  const saveAppt = useSaveAppointment();
  const [diagnosis, setDiagnosis] = useState(appointment.diagnosis ?? "");
  const [description, setDescription] = useState(appointment.description ?? "");

  async function save() {
    try {
      const a = await saveAppt.mutateAsync({
        id: appointment.id,
        patient_id: appointment.patient_id,
        doctor_id: appointment.doctor_id,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
        diagnosis,
        description,
        next_visit_date: appointment.next_visit_date ?? "",
      });
      setError("");
      onNext(a);
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Шаг 3: Проведение процедуры</h3>
      <div className="rounded-xl bg-brand-bg px-4 py-2 text-sm space-y-1">
        <div>Пациент: <strong>{appointment.patient_name}</strong></div>
        <div>Врач: <strong>{appointment.doctor_name}</strong></div>
        <div>Время: <strong>{new Date(appointment.start_time).toLocaleString("ru")}</strong></div>
      </div>
      <Field label="Диагноз">
        <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Введите диагноз" />
      </Field>
      <Field label="Описание приёма">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание проведённых процедур..." />
      </Field>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Назад</Button>
        <Button onClick={save} disabled={saveAppt.isPending}>{saveAppt.isPending ? "Сохранение…" : "Сохранить и продолжить"}</Button>
      </div>
    </div>
  );
}

// Step 4: Close appointment (set completed)
function FlowStep4({ appointment, onNext, onBack, setError }: {
  appointment: Appointment; onNext: (a: Appointment) => void; onBack: () => void; setError: (e: string) => void;
}) {
  const saveAppt = useSaveAppointment();

  async function complete() {
    try {
      const a = await saveAppt.mutateAsync({
        id: appointment.id,
        patient_id: appointment.patient_id,
        doctor_id: appointment.doctor_id,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: "completed",
        diagnosis: appointment.diagnosis ?? "",
        description: appointment.description ?? "",
        next_visit_date: appointment.next_visit_date ?? "",
      });
      setError("");
      onNext(a);
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Шаг 4: Закрытие записи</h3>
      <div className="rounded-xl bg-slate-50 px-4 py-4 space-y-2 text-sm">
        <div>Пациент: <strong>{appointment.patient_name}</strong></div>
        <div>Врач: <strong>{appointment.doctor_name}</strong></div>
        <div>Время: <strong>{new Date(appointment.start_time).toLocaleString("ru")}</strong></div>
        {appointment.diagnosis && <div>Диагноз: <strong>{appointment.diagnosis}</strong></div>}
        {appointment.description && <div>Описание: <span className="text-slate-600">{appointment.description}</span></div>}
      </div>
      <p className="text-sm text-slate-600">Подтвердите закрытие записи — статус изменится на «Завершён».</p>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Назад</Button>
        <Button onClick={complete} disabled={saveAppt.isPending}>
          {saveAppt.isPending ? "Сохранение…" : "Завершить приём"}
        </Button>
      </div>
    </div>
  );
}

// Step 5: Schedule next appointment
function FlowStep5({ appointment, onFinish, setError }: {
  appointment: Appointment; onFinish: () => void; setError: (e: string) => void;
}) {
  const { data: doctors = [] } = useDoctors();
  const activeDoctors = doctors.filter((d) => d.is_active);
  const saveAppt = useSaveAppointment();

  const [schedule, setSchedule] = useState(false);
  const [doctorId, setDoctorId] = useState<number | "">(appointment.doctor_id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  async function createNext() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время"); return; }
    try {
      await saveAppt.mutateAsync({
        patient_id: appointment.patient_id,
        doctor_id: doctorId as number,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
        status: "scheduled",
        diagnosis: "",
        description: "",
        next_visit_date: "",
      });
      setError("");
      onFinish();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-semibold">Шаг 5: Назначить новую запись</h3>
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
        Приём завершён. Пациент: <strong>{appointment.patient_name}</strong>
      </div>
      <div className="flex gap-3">
        <Button variant={schedule ? "primary" : "secondary"} onClick={() => setSchedule(true)}>Назначить следующий приём</Button>
        <Button variant="ghost" onClick={onFinish}>Завершить без записи</Button>
      </div>
      {schedule && (
        <div className="space-y-3">
          <Field label="Врач">
            <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
              <option value="">— выберите —</option>
              {activeDoctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Окончание"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <Button onClick={createNext} disabled={saveAppt.isPending}>
            {saveAppt.isPending ? "Сохранение…" : "Создать запись и завершить"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ========== MANAGEMENT ==========

type ManageTab = "users" | "patients" | "doctors" | "appointments";

function AdminManagement() {
  const [tab, setTab] = useState<ManageTab>("users");

  const manageLinks: { key: ManageTab; label: string }[] = [
    { key: "users", label: "Пользователи" },
    { key: "patients", label: "Пациенты" },
    { key: "doctors", label: "Врачи" },
    { key: "appointments", label: "Записи" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        {manageLinks.map((l) => (
          <button
            key={l.key}
            onClick={() => setTab(l.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              tab === l.key ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersPanel />}
      {tab === "patients" && <PatientsPanel />}
      {tab === "doctors" && <DoctorsPanel />}
      {tab === "appointments" && <AppointmentsPanel />}
    </div>
  );
}

// --- Users panel ---

function UsersPanel() {
  const { data: users = [], isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const [editing, setEditing] = useState<User | null | "new">(null);
  const [error, setError] = useState("");

  async function del(u: User) {
    if (!confirm(`Удалить пользователя ${u.full_name}?`)) return;
    try { await deleteUser.mutateAsync(u.id); }
    catch (e) { setError(errorMessage(e)); }
  }

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;

  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>+ Добавить</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ФИО</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Роль</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand-dark">
                    {ROLE_LABELS[u.role as Role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" className="py-1 px-2 text-xs" onClick={() => setEditing(u)}>Изменить</Button>
                    <Button variant="danger" className="py-1 px-2 text-xs" onClick={() => del(u)}>Удалить</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && (
        <UserModal user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const saveUser = useSaveUser();
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>((user?.role as Role) ?? "admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Введите ФИО"); return; }
    if (!email.trim()) { setError("Введите email"); return; }
    if (!user && !password) { setError("Введите пароль"); return; }
    try {
      await saveUser.mutateAsync({ id: user?.id, full_name: name, email, role, password: password || undefined });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Modal
      title={user ? "Редактировать пользователя" : "Новый пользователь"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saveUser.isPending}>{saveUser.isPending ? "Сохранение…" : "Сохранить"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        <Field label={user ? "Новый пароль (оставьте пустым чтобы не менять)" : "Пароль *"}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}

// --- Patients panel ---

function PatientsPanel() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const { data: patients = [], isLoading, isFetching } = usePatients(search);
  const deletePatient = useDeletePatient();
  const [editing, setEditing] = useState<Patient | null | "new">(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  async function del(p: Patient) {
    if (!confirm(`Удалить пациента ${p.full_name}?`)) return;
    try { await deletePatient.mutateAsync(p.id); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="flex gap-3">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Поиск по имени или телефону..." className="flex-1" />
        <Button onClick={() => setEditing("new")}>+ Добавить</Button>
      </div>
      {isLoading || isFetching ? <p className="text-sm text-slate-400">Поиск…</p> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ФИО</th>
                <th className="px-4 py-3 text-left font-medium">Телефон</th>
                <th className="px-4 py-3 text-left font-medium">Дата рождения</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{p.birth_date ? new Date(p.birth_date).toLocaleDateString("ru") : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" className="py-1 px-2 text-xs" onClick={() => setEditing(p)}>Изменить</Button>
                      <Button variant="danger" className="py-1 px-2 text-xs" onClick={() => del(p)}>Удалить</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && (
        <PatientModal patient={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PatientModal({ patient, onClose }: { patient: Patient | null; onClose: () => void }) {
  const save = useSavePatient();
  const [name, setName] = useState(patient?.full_name ?? "");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [birthDate, setBirthDate] = useState(patient?.birth_date?.split("T")[0] ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) { setError("Введите ФИО"); return; }
    try {
      await save.mutateAsync({ id: patient?.id, full_name: name, phone, birth_date: birthDate, notes });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Modal
      title={patient ? "Редактировать пациента" : "Новый пациент"}
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
        <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." /></Field>
        <Field label="Дата рождения"><Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></Field>
        <Field label="Заметки"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}

// --- Doctors panel ---

function DoctorsPanel() {
  const { data: doctors = [], isLoading } = useDoctors();
  const deleteDoctor = useDeleteDoctor();
  const [editing, setEditing] = useState<Doctor | null | "new">(null);
  const [error, setError] = useState("");

  async function del(d: Doctor) {
    if (!confirm(`Удалить врача ${d.full_name}?`)) return;
    try { await deleteDoctor.mutateAsync(d.id); }
    catch (e) { setError(errorMessage(e)); }
  }

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;

  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>+ Добавить</Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ФИО</th>
              <th className="px-4 py-3 text-left font-medium">Специализация</th>
              <th className="px-4 py-3 text-left font-medium">Телефон</th>
              <th className="px-4 py-3 text-left font-medium">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {doctors.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{d.full_name}</td>
                <td className="px-4 py-3 text-slate-500">{d.specialization || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{d.phone || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {d.is_active ? "Активен" : "Неактивен"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" className="py-1 px-2 text-xs" onClick={() => setEditing(d)}>Изменить</Button>
                    <Button variant="danger" className="py-1 px-2 text-xs" onClick={() => del(d)}>Удалить</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && (
        <DoctorModal doctor={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

const PRESET_COLORS = ["#2563EB", "#16A34A", "#DB2777", "#EA580C", "#7C3AED", "#0891B2"];

const WEEKDAYS = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 7, label: "Воскресенье" },
];

function DoctorModal({ doctor, onClose }: { doctor: Doctor | null; onClose: () => void }) {
  const save = useSaveDoctor();
  const saveSchedule = useSaveSchedule();
  const { data: scheduleData } = useSchedule(doctor?.id ?? null);

  const [name, setName] = useState(doctor?.full_name ?? "");
  const [spec, setSpec] = useState(doctor?.specialization ?? "");
  const [phone, setPhone] = useState(doctor?.phone ?? "");
  const [color, setColor] = useState(doctor?.color ?? PRESET_COLORS[0]);
  const [active, setActive] = useState(doctor?.is_active ?? true);
  const [entries, setEntries] = useState<Record<number, ScheduleEntry>>({});
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [error, setError] = useState("");

  if (scheduleData && !scheduleLoaded) {
    const map: Record<number, ScheduleEntry> = {};
    for (const e of scheduleData) map[e.weekday] = e;
    setEntries(map);
    setScheduleLoaded(true);
  }

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
    if (!name.trim()) { setError("Введите ФИО"); return; }
    try {
      const saved = await save.mutateAsync({ id: doctor?.id, full_name: name, specialization: spec, phone, color, is_active: active });
      if (Object.keys(entries).length > 0) {
        await saveSchedule.mutateAsync({ doctorId: saved.id, entries: Object.values(entries) });
      }
      onClose();
    } catch (e) { setError(errorMessage(e)); }
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
        <Field label="Специализация">
          <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="Терапевт, хирург…" />
        </Field>
        <Field label="Телефон">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" />
        </Field>
        <Field label="Цвет в календаре">
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition ${color === c ? "ring-2 ring-offset-2 ring-ink" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          Активен (отображается при выборе врача)
        </label>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-sm font-medium text-slate-600">График работы</p>
          <div className="space-y-2">
            {WEEKDAYS.map((d) => {
              const entry = entries[d.value];
              return (
                <div key={d.value} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <label className="flex w-36 items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!entry} onChange={(e) => toggleDay(d.value, e.target.checked)} className="h-4 w-4" />
                    {d.label}
                  </label>
                  {entry ? (
                    <div className="flex items-center gap-2">
                      <input type="time" value={entry.start_time} onChange={(e) => setTimeField(d.value, "start_time", e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                      <span className="text-slate-400">—</span>
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

// --- Appointments panel ---

function AppointmentsPanel() {
  const range = useMemo(() => todayRange(), []);
  const { data: appointments = [], isLoading } = useAppointments(range.from, range.to, null);
  const deleteAppt = useDeleteAppointment();
  const { data: doctors = [] } = useDoctors();
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [error, setError] = useState("");

  async function del(a: Appointment) {
    if (!confirm(`Удалить запись пациента ${a.patient_name}?`)) return;
    try { await deleteAppt.mutateAsync(a.id); }
    catch (e) { setError(errorMessage(e)); }
  }

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;

  return (
    <div className="space-y-3">
      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <p className="text-xs text-slate-400">Записи за последний месяц и ближайшие 3 месяца</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Пациент</th>
              <th className="px-4 py-3 text-left font-medium">Врач</th>
              <th className="px-4 py-3 text-left font-medium">Время</th>
              <th className="px-4 py-3 text-left font-medium">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {appointments.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{a.patient_name}</td>
                <td className="px-4 py-3 text-slate-500">{a.doctor_name}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(a.start_time).toLocaleString("ru", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" className="py-1 px-2 text-xs" onClick={() => setEditing(a)}>Изменить</Button>
                    <Button variant="danger" className="py-1 px-2 text-xs" onClick={() => del(a)}>Удалить</Button>
                  </div>
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Записей нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <AppointmentEditModal appointment={editing} doctors={doctors} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function AppointmentEditModal({ appointment, doctors, onClose }: { appointment: Appointment; doctors: Doctor[]; onClose: () => void }) {
  const save = useSaveAppointment();
  const [doctorId, setDoctorId] = useState(appointment.doctor_id);
  const [start, setStart] = useState(isoToLocalInput(appointment.start_time));
  const [end, setEnd] = useState(isoToLocalInput(appointment.end_time));
  const [status, setStatus] = useState(appointment.status);
  const [diagnosis, setDiagnosis] = useState(appointment.diagnosis ?? "");
  const [description, setDescription] = useState(appointment.description ?? "");
  const [nextVisit, setNextVisit] = useState(appointment.next_visit_date ?? "");
  const [error, setError] = useState("");

  async function submit() {
    try {
      await save.mutateAsync({
        id: appointment.id,
        patient_id: appointment.patient_id,
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

  return (
    <Modal
      title="Редактировать запись"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-500">Пациент: <strong className="text-ink">{appointment.patient_name}</strong></div>
        <Field label="Врач">
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            {doctors.filter((d) => d.is_active || d.id === doctorId).map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Окончание"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Статус">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Диагноз"><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></Field>
        <Field label="Описание"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Следующий приём"><Input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Modal>
  );
}

// ========== STATISTICS ==========

function AdminStatistics() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) return <p className="text-sm text-slate-400">Загрузка…</p>;
  if (!stats) return null;

  const statCards = [
    { label: "Пациентов", value: stats.total_patients, color: "bg-blue-50 text-blue-700" },
    { label: "Врачей", value: stats.total_doctors, color: "bg-purple-50 text-purple-700" },
    { label: "Пользователей", value: stats.total_users, color: "bg-indigo-50 text-indigo-700" },
  ];

  const apptCards = [
    { label: "Запланировано", value: stats.scheduled_count, color: "bg-brand-light text-brand-dark" },
    { label: "Завершено", value: stats.completed_count, color: "bg-green-100 text-green-700" },
    { label: "Отменено", value: stats.cancelled_count, color: "bg-slate-100 text-slate-600" },
    { label: "Не пришли", value: stats.no_show_count, color: "bg-orange-100 text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Общее</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {statCards.map((c) => (
            <div key={c.label} className={`rounded-2xl p-5 ${c.color}`}>
              <div className="text-3xl font-bold">{c.value}</div>
              <div className="mt-1 text-sm font-medium opacity-80">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Записи по статусам</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {apptCards.map((c) => (
            <div key={c.label} className={`rounded-2xl p-5 ${c.color}`}>
              <div className="text-3xl font-bold">{c.value}</div>
              <div className="mt-1 text-sm font-medium opacity-80">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-ink">{stats.archived_count}</div>
            <div className="text-sm text-slate-500 mt-0.5">Записей в архиве (завершённые + отменённые)</div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">Архив</span>
        </div>
      </div>
    </div>
  );
}

// ========== ARCHIVE ==========

function AdminArchive() {
  const { data, isLoading, refetch } = useArchivedCount();
  const deleteArchived = useDeleteArchivedAppointments();
  const { refetch: refetchStats } = useAdminStats();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleDelete() {
    if (!confirm(`Удалить все завершённые и отменённые записи (${data?.count ?? 0} шт.)? Это действие нельзя отменить.`)) return;
    try {
      await deleteArchived.mutateAsync();
      setDone(true);
      refetch();
      refetchStats();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-lg font-semibold">Очистка архива</h3>
        <p className="text-sm text-slate-600">
          Удаляет все записи со статусом «Завершён» и «Отменён» без ограничений.
          Это действие необратимо.
        </p>

        {isLoading ? (
          <p className="text-sm text-slate-400">Загрузка…</p>
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            Записей для удаления: <strong className="text-lg">{data?.count ?? 0}</strong>
          </div>
        )}

        {done && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
            Архив успешно очищен.
          </div>
        )}

        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={deleteArchived.isPending || (data?.count ?? 0) === 0}
        >
          {deleteArchived.isPending ? "Удаление…" : `Удалить ${data?.count ?? 0} записей`}
        </Button>
      </div>
    </div>
  );
}

// ========== MAIN PAGE ==========

export default function Admin() {
  const [tab, setTab] = useState<Tab>("Флоу");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Панель администратора</h1>
      </div>

      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
              tab === t ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Флоу" && <AdminFlow />}
      {tab === "Управление" && <AdminManagement />}
      {tab === "Статистика" && <AdminStatistics />}
      {tab === "Архив" && <AdminArchive />}
    </div>
  );
}
