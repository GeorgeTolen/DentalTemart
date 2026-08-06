import { useState } from "react";
import { Link } from "react-router-dom";
import { usePatients, useSavePatient } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Gender, Patient } from "../lib/types";
import { GENDER_LABELS } from "../lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { DateInput } from "../components/DateInputs";
import { formatDate, validateBirthDate, minBirthDateInput, todayInput, ageCategory } from "../lib/datetime";

export default function Patients() {
  const { readOnly } = useAuth();
  const [search, setSearch] = useState("");
  const { data: patients = [], isLoading } = usePatients(search);
  const [editing, setEditing] = useState<Patient | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Пациенты</h1>
        {!readOnly && (
          <Button onClick={() => setEditing("new")}>Новый пациент</Button>
        )}
      </div>

      <div className="max-w-md">
        <Input
          placeholder="Поиск по ФИО или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">ФИО</th>
              <th className="px-5 py-3 font-medium">ИИН</th>
              <th className="px-5 py-3 font-medium">Телефон</th>
              <th className="px-5 py-3 font-medium">Дата рождения</th>
              <th className="px-5 py-3 font-medium">Категория</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-5 py-3 font-medium">
                  <Link to={`/patients/${p.id}`} className="hover:text-brand">
                    {p.full_name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-slate-600">{p.iin || "—"}</td>
                <td className="px-5 py-3 text-slate-600">{p.phone || "—"}</td>
                <td className="px-5 py-3 text-slate-600">
                  {formatDate(p.birth_date)}
                </td>
                <td className="px-5 py-3">
                  {ageCategory(p.birth_date) ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ageCategory(p.birth_date) === "Детский"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {ageCategory(p.birth_date)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {!readOnly && (
                    <button
                      onClick={() => setEditing(p)}
                      className="text-brand hover:underline"
                    >
                      Изменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && patients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Пациенты не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PatientForm
          patient={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PatientForm({
  patient,
  onClose,
}: {
  patient: Patient | null;
  onClose: () => void;
}) {
  const save = useSavePatient();
  const [fullName, setFullName] = useState(patient?.full_name ?? "");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [iin, setIin] = useState(patient?.iin ?? "");
  const [gender, setGender] = useState<Gender>(patient?.gender ?? "");
  const [birthDate, setBirthDate] = useState(patient?.birth_date ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [error, setError] = useState("");

  async function onSubmit() {
    setError("");
    if (!fullName.trim()) return setError("Введите ФИО");
    if (iin && iin.length !== 12) return setError("ИИН должен состоять из 12 цифр");
    const birthErr = validateBirthDate(birthDate ?? "");
    if (birthErr) return setError(birthErr);
    try {
      await save.mutateAsync({
        id: patient?.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        iin,
        gender,
        birth_date: birthDate || null,
        notes,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      title={patient ? "Изменить пациента" : "Новый пациент"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={save.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="ИИН (12 цифр)">
            <Input
              value={iin}
              inputMode="numeric"
              maxLength={12}
              onChange={(e) => setIin(e.target.value.replace(/\D/g, "").slice(0, 12))}
            />
          </Field>
          <Field label="Пол">
            <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="">— не указан —</option>
              <option value="male">{GENDER_LABELS.male}</option>
              <option value="female">{GENDER_LABELS.female}</option>
            </Select>
          </Field>
        </div>
        <Field label="Телефон">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Дата рождения">
          <DateInput
            value={birthDate ?? ""}
            min={minBirthDateInput()}
            max={todayInput()}
            onChange={setBirthDate}
          />
        </Field>
        <Field label="Заметки">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
