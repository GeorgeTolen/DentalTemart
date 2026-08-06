import { useState } from "react";
import {
  useDashboard,
  useMyDoctorProfile,
  useSaveDoctorProfile,
  useSchedule,
  type DoctorProfilePayload,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  formatTime,
  formatDate,
  age,
  yearsLabel,
  minBirthDateInput,
  todayInput,
  validateBirthDate,
} from "../lib/datetime";
import { Button, Field, Input, Modal, StatusBadge, Textarea } from "../components/ui";
import { DateInput } from "../components/DateInputs";
import { Avatar, AvatarUpload } from "../components/Avatar";
import PasswordChangeForm from "../components/PasswordChangeForm";
import type { Appointment, Doctor } from "../lib/types";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

export default function DoctorCabinet() {
  const { user, readOnly } = useAuth();
  const { data: doctor, isLoading, error } = useMyDoctorProfile();
  const { data: schedule = [] } = useSchedule(doctor?.id ?? null);
  const { data: dashboard } = useDashboard();
  const [editing, setEditing] = useState(false);

  const today = dashboard?.today_appointments ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Мой кабинет</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Учётная запись
        </div>
        <div className="mt-1 font-semibold text-ink">{user?.full_name}</div>
        <div className="text-sm text-slate-500">{user?.email}</div>
        {user?.clinic_name && (
          <div className="mt-1 text-sm text-slate-400">Клиника: {user.clinic_name}</div>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Загрузка…
        </div>
      ) : error || !doctor ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Профиль врача ещё не привязан к вашему аккаунту. Обратитесь к владельцу
          клиники.
        </div>
      ) : (
        <>
          <DoctorProfileCard
            doctor={doctor}
            editable={!readOnly}
            onEdit={() => setEditing(true)}
          />

          {/* Быстрая статистика */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-3xl font-bold text-brand">
                {dashboard?.today_count ?? 0}
              </div>
              <div className="mt-0.5 text-sm text-slate-400">Приёмов сегодня</div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="text-3xl font-bold text-ink">
                {dashboard?.week_count ?? 0}
              </div>
              <div className="mt-0.5 text-sm text-slate-400">Приёмов за неделю</div>
            </div>
          </div>

          {/* Приёмы на сегодня */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Приёмы на сегодня</h2>
            {today.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow-sm">
                На сегодня приёмов нет
              </div>
            ) : (
              <div className="space-y-2">
                {today.map((a) => (
                  <TodayRow key={a.id} appointment={a} />
                ))}
              </div>
            )}
          </div>

          {/* График работы */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">Мой график</h2>
            {schedule.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
                График не задан
              </div>
            ) : (
              <div className="space-y-2">
                {schedule.map((s) => (
                  <div
                    key={s.weekday}
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
                  >
                    <span className="text-sm font-medium text-ink">
                      {WEEKDAY_LABELS[s.weekday]}
                    </span>
                    <span className="text-sm text-slate-500">
                      {s.start_time} - {s.end_time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {editing && (
            <DoctorProfileModal doctor={doctor} onClose={() => setEditing(false)} />
          )}
        </>
      )}

      {/* Пароль врач меняет сам — даже если профиль врача ещё не привязан. */}
      {!readOnly && <PasswordChangeForm />}
    </div>
  );
}

/**
 * Карточка врача. Используется и в кабинете самого врача, и (в режиме только
 * чтения) на странице «Врачи», чтобы профиль везде выглядел одинаково.
 */
export function DoctorProfileCard({
  doctor,
  editable,
  onEdit,
}: {
  doctor: Doctor;
  editable: boolean;
  onEdit?: () => void;
}) {
  const years = age(doctor.birth_date);
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        {editable ? (
          <AvatarUpload
            kind="doctors"
            id={doctor.id}
            name={doctor.full_name}
            url={doctor.avatar_url}
            color={doctor.color}
          />
        ) : (
          <Avatar
            name={doctor.full_name}
            url={doctor.avatar_url}
            size="lg"
            color={doctor.color}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: doctor.color }}
            />
            <span className="text-xl font-bold text-ink">{doctor.full_name}</span>
            {!doctor.is_active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                неактивен
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            {doctor.specialization || "Направление не указано"}
          </div>
          <div className="text-sm text-slate-400">{doctor.phone}</div>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <ProfileField
              label="Стаж работы"
              value={
                doctor.experience_years > 0
                  ? `${doctor.experience_years} ${yearsLabel(doctor.experience_years)}`
                  : ""
              }
            />
            <ProfileField
              label="Возраст"
              value={
                years != null && doctor.birth_date
                  ? `${years} ${yearsLabel(years)} · ${formatDate(doctor.birth_date)}`
                  : ""
              }
            />
            <ProfileField label="Образование" value={doctor.education} wide />
            <ProfileField label="Опыт работы" value={doctor.bio} wide />
            <ProfileField label="Способности и навыки" value={doctor.skills} wide />
          </dl>
        </div>
        {editable && onEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Редактировать профиль
          </Button>
        )}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
        {value || <span className="text-slate-300">не указано</span>}
      </dd>
    </div>
  );
}

export function DoctorProfileModal({
  doctor,
  onClose,
}: {
  doctor: Doctor;
  onClose: () => void;
}) {
  const save = useSaveDoctorProfile();
  const [specialization, setSpecialization] = useState(doctor.specialization);
  const [phone, setPhone] = useState(doctor.phone);
  const [birthDate, setBirthDate] = useState(doctor.birth_date ?? "");
  const [experience, setExperience] = useState(String(doctor.experience_years));
  const [education, setEducation] = useState(doctor.education);
  const [bio, setBio] = useState(doctor.bio);
  const [skills, setSkills] = useState(doctor.skills);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const years = Number(experience) || 0;
    if (years < 0 || years > 80) return setError("Стаж должен быть от 0 до 80 лет");
    const birthErr = validateBirthDate(birthDate);
    if (birthErr) return setError(birthErr);

    const profile: DoctorProfilePayload = {
      specialization: specialization.trim(),
      phone: phone.trim(),
      birth_date: birthDate,
      experience_years: years,
      education: education.trim(),
      bio: bio.trim(),
      skills: skills.trim(),
    };
    try {
      await save.mutateAsync({ doctorId: doctor.id, profile });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title="Мой профиль"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-400">
          ФИО, цвет в календаре и график работы задаёт владелец клиники.
        </p>
        <Field label="Направление">
          <Input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            placeholder="Терапевт-стоматолог, ортодонт…"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Телефон">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" />
          </Field>
          <Field label="Стаж работы, лет">
            <Input
              inputMode="numeric"
              value={experience}
              onChange={(e) => setExperience(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </Field>
        </div>
        <Field label="Дата рождения">
          <DateInput
            value={birthDate}
            min={minBirthDateInput()}
            max={todayInput()}
            onChange={setBirthDate}
          />
        </Field>
        <Field label="Образование">
          <Textarea
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            placeholder="Вуз, год выпуска, курсы повышения квалификации"
          />
        </Field>
        <Field label="Опыт работы">
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Где и кем работали, чем занимались"
          />
        </Field>
        <Field label="Способности и навыки">
          <Textarea
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Методики, оборудование, направления, которыми владеете"
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

function TodayRow({ appointment: a }: { appointment: Appointment }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="font-semibold tabular-nums text-brand">
        {formatTime(a.start_time)} - {formatTime(a.end_time)}
      </span>
      <span className="font-medium text-ink">{a.patient_name}</span>
      {a.patient_phone && (
        <span className="text-sm text-slate-400">{a.patient_phone}</span>
      )}
      <span className="ml-auto">
        <StatusBadge status={a.status} />
      </span>
    </div>
  );
}
