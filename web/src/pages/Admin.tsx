import { useState, useEffect } from "react";
import {
  useDoctors,
  usePatients,
  useSaveAppointment,
  useSavePatient,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, Gender, Patient } from "../lib/types";
import { GENDER_LABELS } from "../lib/types";
import {
  localInputToISO,
  formatDateTime,
  validateBirthDate,
  validateAppointmentDate,
  minBirthDateInput,
  todayInput,
  maxAppointmentInput,
  defaultAppointmentStart,
  addMinutesToLocalInput,
} from "../lib/datetime";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { DateInput, DateTimeInput } from "../components/DateInputs";
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
  const [iin, setIin] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const { data: page, isFetching } = usePatients(search);
  const patients = page?.items ?? [];
  const savePatient = useSavePatient();
  // True while the debounce timer hasn't fired yet for the current input, so
  // the stale results for the previous search term aren't shown.
  const searchPending = search !== input;

  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  async function createPatient() {
    if (!name.trim()) { setError("Введите ФИО пациента"); return; }
    if (iin && iin.length !== 12) { setError("ИИН должен состоять из 12 цифр"); return; }
    const birthErr = validateBirthDate(birthDate);
    if (birthErr) { setError(birthErr); return; }
    try {
      // Если пациент с таким ИИН уже есть - сервер вернёт его, дубликата не будет.
      const p = await savePatient.mutateAsync({ full_name: name.trim(), phone, iin, gender, birth_date: birthDate, notes });
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
            {input && (searchPending || isFetching) && (
              <p className="text-sm text-slate-400 px-2">Поиск...</p>
            )}
            {input && !searchPending && !isFetching && patients.map((p) => (
              <button
                key={p.id}
                onClick={() => onNext(p)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm hover:bg-brand-bg hover:border-brand transition"
              >
                <span className="font-medium">{p.full_name}</span>
                {p.phone && <span className="ml-2 text-slate-400">{p.phone}</span>}
              </button>
            ))}
            {input && !searchPending && !isFetching && patients.length === 0 && (
              <p className="text-sm text-slate-400 px-2">Пациент не найден</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ФИО *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" /></Field>
            <Field label="ИИН (12 цифр)">
              <Input
                value={iin}
                inputMode="numeric"
                maxLength={12}
                onChange={(e) => setIin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="Если ИИН уже есть в базе - подставится тот пациент"
              />
            </Field>
            <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." /></Field>
            <Field label="Пол">
              <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="">- не указан -</option>
                <option value="male">{GENDER_LABELS.male}</option>
                <option value="female">{GENDER_LABELS.female}</option>
              </Select>
            </Field>
            <Field label="Дата рождения">
              <DateInput value={birthDate} min={minBirthDateInput()} max={todayInput()} onChange={setBirthDate} />
            </Field>
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
  // По умолчанию - ближайшее время сегодня (рабочий день 8:00–20:00), приём 30 мин.
  const [start, setStart] = useState(() => defaultAppointmentStart());
  const [end, setEnd] = useState(() => addMinutesToLocalInput(defaultAppointmentStart(), 30));

  async function schedule() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время начала и окончания"); return; }
    const dateErr = validateAppointmentDate(start);
    if (dateErr) { setError(dateErr); return; }
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
            <option value="">- выберите -</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}{d.specialization && ` · ${d.specialization}`}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><DateTimeInput value={start} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setStart} /></Field>
          <Field label="Окончание"><DateTimeInput value={end} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setEnd} /></Field>
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
        <div>Время: <strong>{formatDateTime(appointment.start_time)}</strong></div>
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
        <div>Время: <strong>{formatDateTime(appointment.start_time)}</strong></div>
        {appointment.diagnosis && <div>Диагноз: <strong>{appointment.diagnosis}</strong></div>}
        {appointment.description && <div>Описание: <span className="text-slate-600">{appointment.description}</span></div>}
      </div>
      <p className="text-sm text-slate-600">Подтвердите закрытие записи - статус изменится на «Завершён».</p>
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
  const [start, setStart] = useState(() => defaultAppointmentStart());
  const [end, setEnd] = useState(() => addMinutesToLocalInput(defaultAppointmentStart(), 30));

  async function createNext() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время"); return; }
    const dateErr = validateAppointmentDate(start);
    if (dateErr) { setError(dateErr); return; }
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
              <option value="">- выберите -</option>
              {activeDoctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало"><DateTimeInput value={start} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setStart} /></Field>
            <Field label="Окончание"><DateTimeInput value={end} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setEnd} /></Field>
          </div>
          <Button onClick={createNext} disabled={saveAppt.isPending}>
            {saveAppt.isPending ? "Сохранение…" : "Создать запись и завершить"}
          </Button>
        </div>
      )}
    </div>
  );
}


// ========== MAIN PAGE ==========

// Пошаговый сценарий приёма: регистрация пациента → запись → процедура →
// закрытие → следующая запись. Остальное управление живёт отдельными
// страницами в разделе «Управление» бокового меню.
export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Создать запись</h1>
        <p className="mt-1 text-sm text-slate-400">
          Пошаговый сценарий: от регистрации пациента до следующего приёма.
        </p>
      </div>
      <AdminFlow />
    </div>
  );
}
