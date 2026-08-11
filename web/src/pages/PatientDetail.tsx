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
import {
  formatDate,
  formatDateTime,
  age,
  ageCategory,
  localInputToISO,
  validateBirthDate,
  validateAppointmentDate,
  minBirthDateInput,
  todayInput,
  maxAppointmentInput,
  defaultAppointmentStart,
  addMinutesToLocalInput,
} from "../lib/datetime";
import { Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "../components/ui";
import { DateInput, DateTimeInput } from "../components/DateInputs";
import { AgeCategoryBadge } from "../components/AgeCategoryBadge";
import { parseIIN } from "../lib/iin";
import ScheduleFollowUpModal from "../components/ScheduleFollowUpModal";
import AppointmentBillModal from "../components/AppointmentBillModal";
import { Avatar, AvatarUpload } from "../components/Avatar";
import { PaperclipIcon } from "../components/icons";
import { SortToggle, sortList, type SortOrder } from "../components/SortToggle";
import { formatMoney } from "../lib/money";
import type {
  Appointment,
  AppointmentStatus,
  Gender,
  Patient,
  PatientRecord,
  PatientRecordType,
} from "../lib/types";
import { STATUS_LABELS, RECORD_TYPE_LABELS, GENDER_LABELS } from "../lib/types";
import {
  usePatientRecords,
  useSavePatientRecord,
  useDeletePatientRecord,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useT, dateLocale, yearsText } from "../lib/i18n";

export default function PatientDetail() {
  const { t, lang } = useT();
  const { readOnly } = useAuth();
  const { id } = useParams();
  const patientId = id ? Number(id) : null;
  const { data: patient, isLoading } = usePatient(patientId);
  const { data: history = [] } = usePatientAppointments(patientId);
  const [editingPatient, setEditingPatient] = useState(false);
  const [newAppt, setNewAppt] = useState(false);

  if (isLoading) return <div className="text-slate-400">{t("Загрузка…")}</div>;
  if (!patient) return <div className="text-slate-400">{t("Пациент не найден")}</div>;

  const lastVisit = history.find((a) => a.status === "completed");
  const nextVisit = [...history].reverse().find((a) => a.status === "scheduled");
  const category = ageCategory(patient.birth_date);
  // Данные карточки (включая фото) меняет только клиника, которая её завела.
  const canEditPatient = !readOnly && patient.is_own;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/patients" className="text-sm text-brand hover:underline">
          ← {t("К списку пациентов")}
        </Link>
        {!readOnly && (
          <div className="flex gap-2">
            {/* Карточка общая для платформы, но правит её только та клиника,
                которая её завела - остальным сервер ответит 403. */}
            {patient.is_own && (
              <Button variant="secondary" onClick={() => setEditingPatient(true)}>
                {t("Редактировать")}
              </Button>
            )}
            <Button onClick={() => setNewAppt(true)}>
              + {t("Новая запись")}
            </Button>
          </div>
        )}
      </div>

      {/* Карточка пациента */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          {canEditPatient ? (
            <AvatarUpload
              kind="patients"
              id={patient.id}
              name={patient.full_name}
              url={patient.avatar_url}
            />
          ) : (
            <Avatar name={patient.full_name} url={patient.avatar_url} size="lg" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{patient.full_name}</h1>
              {category && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    category === "Детский"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t(category)}
                </span>
              )}
              {!patient.is_own && patient.clinic_name && (
                <span
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500"
                  title={t("Карточку завела другая клиника платформы")}
                >
                  {patient.clinic_name}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-500">
              {patient.iin && <span>{t("ИИН")}: {patient.iin}</span>}
              {patient.gender && <span>{t("Пол")}: {t(GENDER_LABELS[patient.gender])}</span>}
              {patient.phone && <span>{t("Телефон")}: {patient.phone}</span>}
              {patient.birth_date && (
                <span>
                  {t("Дата рождения")}: {formatDate(patient.birth_date)}
                  {age(patient.birth_date) !== null && (
                    <span className="text-slate-400">
                      {" "}
                      ({yearsText(lang, age(patient.birth_date)!)})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Ближайшая и последняя записи */}
      {(lastVisit || nextVisit) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {nextVisit && (
            <div className="rounded-2xl border border-brand/20 bg-brand-bg p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-brand">{t("Ближайшая запись")}</div>
              <div className="mt-1 font-semibold text-ink">{formatDateTime(nextVisit.start_time)}</div>
              <div className="text-sm text-slate-500">{nextVisit.doctor_name}</div>
            </div>
          )}
          {lastVisit && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-green-600">{t("Последний приём")}</div>
              <div className="mt-1 font-semibold text-ink">{formatDateTime(lastVisit.start_time)}</div>
              <div className="text-sm text-slate-500">{lastVisit.doctor_name}</div>
              {lastVisit.diagnosis && <div className="mt-1 text-sm text-slate-600">{lastVisit.diagnosis}</div>}
            </div>
          )}
        </div>
      )}

      {/* История приёмов */}
      <TreatmentHistorySection history={history} />

      {/* Медкарта: описание пациента и снимки */}
      {patientId && <PatientRecordsSection patient={patient} />}

      {editingPatient && (
        <PatientEditModal patient={patient} onClose={() => setEditingPatient(false)} />
      )}
      {newAppt && patientId && (
        <NewAppointmentModal patientId={patientId} patientName={patient.full_name} onClose={() => setNewAppt(false)} />
      )}
    </div>
  );
}

const HISTORY_FILTERS: { key: AppointmentStatus | "all"; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "scheduled", label: "Запланированные" },
  { key: "completed", label: "Завершённые" },
  { key: "cancelled", label: "Отменённые" },
];

// Сколько приёмов видно в свёрнутой истории: первые в выбранном порядке,
// остальное - по кнопке «Показать всю историю».
const HISTORY_PREVIEW_COUNT = 3;

function TreatmentHistorySection({ history }: { history: Appointment[] }) {
  const { t } = useT();
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Свежие приёмы сверху - в карточке чаще смотрят последнее лечение.
  const [sort, setSort] = useState<SortOrder>("new");

  // Выбор одной даты сразу даёт период в один день: вторая граница
  // подставляется той же датой (и поправляется, если диапазон перевёрнут).
  function changeFrom(v: string) {
    setDateFrom(v);
    if (v && (!dateTo || dateTo < v)) setDateTo(v);
  }
  function changeTo(v: string) {
    setDateTo(v);
    if (v && (!dateFrom || v < dateFrom)) setDateFrom(v);
  }

  // Сортируем до обрезки, иначе свёрнутая история показывала бы три приёма из
  // порядка сервера, а не из выбранного пользователем.
  const filtered = sortList(
    history.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      const day = a.start_time.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    }),
    sort,
    (a) => a.start_time
  );

  const visible = showAll ? filtered : filtered.slice(0, HISTORY_PREVIEW_COUNT);
  const hiddenCount = filtered.length - visible.length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">{t("Медицинская карта пациента")}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <SortToggle value={sort} onChange={setSort} />
          <Field label={t("С даты")}>
            <DateInput value={dateFrom} onChange={changeFrom} />
          </Field>
          <Field label={t("По дату")}>
            <DateInput value={dateTo} onChange={changeTo} />
          </Field>
          {(dateFrom || dateTo) && (
            <Button variant="secondary" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              {t("Сбросить")}
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {HISTORY_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              statusFilter === f.key ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          {history.length === 0 ? t("Приёмов пока нет") : t("Ничего не найдено по заданным фильтрам")}
        </div>
      ) : (
        <>
          <div className="relative space-y-0">
            {/* Вертикальная линия хронологии */}
            <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />
            <div className="space-y-3 pl-12">
              {visible.map((a, i) => (
                <HistoryCard key={a.id} appointment={a} index={i} />
              ))}
            </div>
          </div>
          {hiddenCount > 0 && (
            <div className="mt-3 pl-12">
              <Button variant="secondary" onClick={() => setShowAll(true)}>
                {t("Показать всю историю (ещё {n})", { n: hiddenCount })}
              </Button>
            </div>
          )}
          {showAll && filtered.length > HISTORY_PREVIEW_COUNT && (
            <div className="mt-3 pl-12">
              <Button variant="secondary" onClick={() => setShowAll(false)}>
                {t("Свернуть - показать только {n} последних", { n: HISTORY_PREVIEW_COUNT })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistoryCard({ appointment: a }: { appointment: Appointment; index: number }) {
  const { t, lang } = useT();
  const { user, readOnly } = useAuth();
  const canBill = user?.role === "owner" || user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [schedulingFollowUp, setSchedulingFollowUp] = useState(false);
  const [billing, setBilling] = useState(false);
  const saveAppt = useSaveAppointment();
  const date = new Date(a.start_time);

  const dotColor: Record<AppointmentStatus, string> = {
    completed: "bg-green-500",
    scheduled: "bg-brand",
    cancelled: "bg-slate-400",
    no_show: "bg-orange-400",
  };

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
      // Сразу считаем стоимость - пока приём свежий в памяти.
      if (canBill) setBilling(true);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

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
                {formatDate(a.start_time)}
              </span>
              <span className="text-sm text-slate-400">
                {date.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" })}
              </span>
              <StatusBadge status={a.status} />
              {!a.is_own && a.clinic_name && (
                <span
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                  title={t("Приём в другой клинике платформы")}
                >
                  {a.clinic_name}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {t("Врач")}: {a.doctor_name}
              {a.diagnosis && <span className="ml-3 text-slate-600">· {a.diagnosis}</span>}
            </div>
          </div>
          {a.total != null && a.total > 0 && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-green-700">
              {formatMoney(a.total)}
            </span>
          )}
          <span className="text-slate-300 text-xs shrink-0">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Detail label={t("Врач")} value={a.doctor_name} />
              <Detail label={t("Начало")} value={date.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" })} />
              <Detail label={t("Окончание")} value={new Date(a.end_time).toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" })} />
              <Detail label={t("Статус")} value={t(STATUS_LABELS[a.status])} />
            </div>
            {a.diagnosis && (
              <div>
                <div className="text-xs text-slate-400">{t("Диагноз")}</div>
                <div className="mt-0.5 font-medium text-ink">{a.diagnosis}</div>
              </div>
            )}
            {a.description && (
              <div>
                <div className="text-xs text-slate-400">{t("Описание приёма")}</div>
                <div className="mt-0.5 whitespace-pre-wrap text-slate-600">{a.description}</div>
              </div>
            )}
            {a.next_visit_date && (
              <div className="rounded-xl bg-brand-bg px-3 py-2 text-brand text-sm">
                {t("Следующий приём назначен на")}: <strong>{formatDate(a.next_visit_date)}</strong>
              </div>
            )}
            {/* Чужой приём можно только читать: менять его вправе лишь та
                клиника, которая его провела. */}
            {!readOnly && a.is_own && (
              <div className="flex flex-wrap gap-2">
                {a.status !== "completed" && (
                  <Button onClick={markCompleted} disabled={saveAppt.isPending}>
                    {saveAppt.isPending ? t("Сохранение…") : t("Отметить завершённым")}
                  </Button>
                )}
                {canBill && (
                  <Button variant="secondary" onClick={() => setBilling(true)}>
                    {t("Услуги и стоимость")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSchedulingFollowUp(true)}>
                  {a.next_visit_date ? t("Изменить след. приём") : t("Следующий приём")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {schedulingFollowUp && (
        <ScheduleFollowUpModal appointment={a} onClose={() => setSchedulingFollowUp(false)} />
      )}
      {billing && (
        <AppointmentBillModal appointment={a} onClose={() => setBilling(false)} />
      )}
    </div>
  );
}

// Снимки разложены по видам внутри одной вкладки: рентген и 3D - это одно и
// то же по смыслу («картинка к карте»), различается только формат файла.
const SCAN_TYPES: PatientRecordType[] = ["xray", "scan3d"];

function PatientRecordsSection({ patient }: { patient: Patient }) {
  const { t } = useT();
  const { readOnly } = useAuth();
  const [tab, setTab] = useState<"description" | "scans">("description");
  // Свежие снимки сверху: к последним обращаются чаще, чем к архивным.
  const [sort, setSort] = useState<SortOrder>("new");
  // Тип снимка, который сейчас добавляют; null - окно закрыто.
  const [adding, setAdding] = useState<PatientRecordType | null>(null);
  const { data: records = [], isLoading } = usePatientRecords(patient.id);
  const deleteRecord = useDeletePatientRecord();

  async function onDelete(recordId: number) {
    if (!confirm(t("Удалить запись?"))) return;
    try {
      await deleteRecord.mutateAsync({ patientId: patient.id, recordId });
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  // Записи «Аллергия» больше не заводятся - вместо них общее описание. Уже
  // существующие показываем под описанием, чтобы ничего не потерялось.
  const legacyAllergies = records.filter((r) => r.type === "allergy");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">{t("Медицинские записи")}</h2>
      </div>
      <div className="mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit">
        {([
          { key: "description", label: "Описание" },
          { key: "scans", label: "Снимки" },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === item.key ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {/* Порядок нужен только снимкам: описание - один текст, сортировать нечего. */}
      {tab === "scans" && (
        <div className="mb-3">
          <SortToggle value={sort} onChange={setSort} />
        </div>
      )}

      {tab === "description" ? (
        <>
          <PatientDescription patient={patient} />
          {legacyAllergies.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="text-xs text-slate-400">
                {t("Ранее добавленные записи «Аллергия»")}
              </div>
              {legacyAllergies.map((r) => (
                <RecordCard key={r.id} record={r} onDelete={onDelete} />
              ))}
            </div>
          )}
        </>
      ) : isLoading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          {t("Загрузка…")}
        </div>
      ) : (
        <div className="space-y-6">
          {SCAN_TYPES.map((type) => {
            const group = sortList(
              records.filter((r) => r.type === type),
              sort,
              (r) => r.created_at
            );
            return (
              <div key={type}>
                <h3 className="mb-2 text-sm font-semibold text-slate-500">
                  {t(RECORD_TYPE_LABELS[type])}
                </h3>
                {group.length === 0 ? (
                  <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
                    {t("Снимков пока нет")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.map((r) => (
                      <RecordCard key={r.id} record={r} onDelete={onDelete} />
                    ))}
                  </div>
                )}
                {/* Кнопка добавления своя у каждого вида: тип снимка не
                    приходится выбирать вручную. */}
                {!readOnly && (
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onClick={() => setAdding(type)}
                  >
                    + {t("Добавить снимок")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddRecordModal
          patientId={patient.id}
          type={adding}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

// Общее описание пациента: аллергии, хронические болезни, особенности.
// Хранится в поле notes карточки, поэтому править его может только клиника,
// которая карточку завела (остальным сервер ответит 403).
function PatientDescription({ patient }: { patient: Patient }) {
  const { t } = useT();
  const { readOnly } = useAuth();
  const save = useSavePatient();
  const [text, setText] = useState(patient.notes ?? "");
  // Обычное состояние - чтение: поле ввода появляется только по «Изменить» и
  // после сохранения снова сворачивается в текст.
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const canEdit = !readOnly && patient.is_own;

  async function submit() {
    setError("");
    try {
      // Сервер перезаписывает карточку целиком - передаём остальные поля как есть.
      await save.mutateAsync({
        id: patient.id,
        full_name: patient.full_name,
        phone: patient.phone,
        iin: patient.iin,
        gender: patient.gender,
        birth_date: patient.birth_date,
        notes: text,
      });
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function cancel() {
    setText(patient.notes ?? "");
    setError("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {text ? (
          <p className="whitespace-pre-wrap text-sm text-slate-600">{text}</p>
        ) : (
          <p className="text-center text-sm text-slate-400">{t("Описание не заполнено")}</p>
        )}
        {canEdit && (
          <Button variant="secondary" className="mt-4" onClick={() => setEditing(true)}>
            {t("Изменить")}
          </Button>
        )}
        {!patient.is_own && (
          <p className="mt-3 text-xs text-slate-400">
            {t("Описание может редактировать только клиника, которая завела карточку.")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {/* rows, а не className: Textarea подставляет свои классы, и переданный
          className затёр бы оформление поля целиком. */}
      <Textarea
        value={text}
        rows={8}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("Аллергии, хронические болезни, особенности лечения…")}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? t("Сохранение…") : t("Сохранить")}
        </Button>
        <Button variant="secondary" onClick={cancel} disabled={save.isPending}>
          {t("Отмена")}
        </Button>
        {error && <span className="text-sm text-red-600">{t(error)}</span>}
      </div>
    </div>
  );
}

function RecordCard({
  record: r,
  onDelete,
}: {
  record: PatientRecord;
  onDelete: (id: number) => void;
}) {
  const { t } = useT();
  const { readOnly } = useAuth();
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {r.title && <div className="font-semibold text-ink">{r.title}</div>}
          {r.note && <div className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{r.note}</div>}
          <div className="mt-2 text-xs text-slate-400">
            {formatDateTime(r.created_at)}{r.created_by_name && ` · ${r.created_by_name}`}
            {!r.is_own && r.clinic_name && (
              <span
                className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-slate-500"
                title={t("Запись сделала другая клиника платформы")}
              >
                {r.clinic_name}
              </span>
            )}
          </div>
          {r.file_url && (
            <a
              href={r.file_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm text-brand hover:underline"
            >
              <PaperclipIcon className="mr-1 inline h-4 w-4 align-text-bottom" />
              {r.file_name || t("Открыть файл")}
            </a>
          )}
        </div>
        {/* Удалять можно только записи своей клиники - медкарта общая,
            но хозяин у каждой записи один. */}
        {!readOnly && r.is_own && (
          <button
            onClick={() => onDelete(r.id)}
            className="shrink-0 text-sm text-red-500 hover:underline"
          >
            {t("Удалить")}
          </button>
        )}
      </div>
    </div>
  );
}

function AddRecordModal({
  patientId,
  type,
  onClose,
}: {
  patientId: number;
  // Тип задаётся кнопкой, из которой открыли окно, - выбирать его не нужно.
  type: PatientRecordType;
  onClose: () => void;
}) {
  const { t } = useT();
  const save = useSavePatientRecord();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    if (!title.trim() && !note.trim() && !file) {
      setError("Заполните заголовок, заметку или прикрепите файл");
      return;
    }
    try {
      await save.mutateAsync({ patientId, type, title, note, file });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={`${t("Добавить снимок")} · ${t(RECORD_TYPE_LABELS[type])}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("Отмена")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("Сохранение…") : t("Сохранить")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("Заголовок")}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("Напр.: Снимок зуба 16")} /></Field>
        <Field label={t("Заметка")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Описание, заключение...")} /></Field>
        <Field label={t("Файл (изображение или 3D-модель)")}>
          <input
            type="file"
            accept={type === "scan3d" ? "image/*,.stl,.obj,.glb,.gltf" : "image/*"}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-bg file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-brand-dark"
          />
        </Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>}
      </div>
    </Modal>
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

function PatientEditModal({ patient, onClose }: { patient: { id: number; full_name: string; phone: string; birth_date: string | null; notes: string; iin: string; gender: Gender }; onClose: () => void }) {
  const { t } = useT();
  const save = useSavePatient();
  const [name, setName] = useState(patient.full_name);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [iin, setIin] = useState(patient.iin ?? "");
  const [gender, setGender] = useState<Gender>(patient.gender ?? "");
  const [birthDate, setBirthDate] = useState(patient.birth_date?.split("T")[0] ?? "");
  const [error, setError] = useState("");

  // ИИН кодирует дату рождения и пол - при вводе 12 цифр заполняем пустые поля.
  function onIinChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 12);
    setIin(next);
    const info = parseIIN(next);
    if (!info) return;
    if (!birthDate) setBirthDate(info.birthDate);
    if (!gender) setGender(info.gender);
  }

  async function submit() {
    if (!name.trim()) { setError("Введите ФИО"); return; }
    if (iin && iin.length !== 12) { setError("ИИН должен состоять из 12 цифр"); return; }
    const birthErr = validateBirthDate(birthDate);
    if (birthErr) { setError(birthErr); return; }
    try {
      await save.mutateAsync({
        id: patient.id,
        full_name: name,
        phone,
        iin,
        gender,
        birth_date: birthDate,
        notes: patient.notes ?? "",
      });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Modal
      title={t("Редактировать пациента")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("Отмена")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("Сохранение…") : t("Сохранить")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("ФИО *")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("ИИН (12 цифр)")}>
            <Input
              value={iin}
              inputMode="numeric"
              maxLength={12}
              onChange={(e) => onIinChange(e.target.value)}
            />
          </Field>
          <Field label={t("Пол")}>
            <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="">{t("- не указан -")}</option>
              <option value="male">{t(GENDER_LABELS.male)}</option>
              <option value="female">{t(GENDER_LABELS.female)}</option>
            </Select>
          </Field>
        </div>
        <Field label={t("Телефон")}><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" /></Field>
        <Field label={t("Дата рождения")}>
          <div className="flex items-center gap-2">
            <DateInput value={birthDate} min={minBirthDateInput()} max={todayInput()} onChange={setBirthDate} />
            <AgeCategoryBadge birthDate={birthDate} />
          </div>
        </Field>
        {/* Описание пациента правится во вкладке «Описание» медкарты - здесь
            только паспортные поля, notes уходит на сервер без изменений. */}
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>}
      </div>
    </Modal>
  );
}

function NewAppointmentModal({ patientId, patientName, onClose }: { patientId: number; patientName: string; onClose: () => void }) {
  const { t } = useT();
  const { data: doctors = [] } = useDoctors();
  const activeDoctors = doctors.filter((d) => d.is_active);
  const save = useSaveAppointment();

  const [doctorId, setDoctorId] = useState<number | "">(activeDoctors[0]?.id ?? "");
  // По умолчанию - ближайшее время сегодня, приём 30 минут.
  const [start, setStart] = useState(() => defaultAppointmentStart());
  const [end, setEnd] = useState(() => addMinutesToLocalInput(defaultAppointmentStart(), 30));
  const [diagnosis, setDiagnosis] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");
  const [error, setError] = useState("");

  async function submit() {
    if (!doctorId) { setError("Выберите врача"); return; }
    if (!start || !end) { setError("Укажите время начала и окончания"); return; }
    const dateErr = validateAppointmentDate(start);
    if (dateErr) { setError(dateErr); return; }
    try {
      await save.mutateAsync({
        patient_id: patientId,
        doctor_id: doctorId as number,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
        status,
        diagnosis,
        description,
        next_visit_date: "",
      });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
  }

  return (
    <Modal
      title={t("Новая запись")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("Отмена")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("Сохранение…") : t("Создать запись")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-bg px-4 py-2 text-sm">
          {t("Пациент")}: <strong>{patientName}</strong>
        </div>
        <Field label={t("Врач")}>
          <Select value={String(doctorId)} onChange={(e) => setDoctorId(Number(e.target.value))}>
            <option value="">{t("- выберите врача -")}</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}{d.specialization && ` · ${d.specialization}`}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Начало")}><DateTimeInput value={start} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setStart} /></Field>
          <Field label={t("Окончание")}><DateTimeInput value={end} maxDate={maxAppointmentInput().slice(0, 10)} onChange={setEnd} /></Field>
        </div>
        <Field label={t("Статус")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
            {(Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{t(v)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("Диагноз")}><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={t("Необязательно")} /></Field>
        <Field label={t("Описание")}><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Необязательно")} /></Field>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>}
      </div>
    </Modal>
  );
}
