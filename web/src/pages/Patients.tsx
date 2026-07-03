import { useState } from "react";
import { Link } from "react-router-dom";
import { usePatients, useSavePatient } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Patient } from "../lib/types";
import { Button, Field, Input, Modal, Textarea } from "../components/ui";
import { DateInput } from "../components/DateInputs";
import { formatDate, validateBirthDate, minBirthDateInput, todayInput } from "../lib/datetime";

export default function Patients() {
  const [search, setSearch] = useState("");
  const { data: patients = [], isLoading } = usePatients(search);
  const [editing, setEditing] = useState<Patient | "new" | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Пациенты</h1>
        <Button onClick={() => setEditing("new")}>Новый пациент</Button>
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
              <th className="px-5 py-3 font-medium">Телефон</th>
              <th className="px-5 py-3 font-medium">Дата рождения</th>
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
                <td className="px-5 py-3 text-slate-600">{p.phone || "—"}</td>
                <td className="px-5 py-3 text-slate-600">
                  {formatDate(p.birth_date)}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-brand hover:underline"
                  >
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && patients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
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
  const [birthDate, setBirthDate] = useState(patient?.birth_date ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [error, setError] = useState("");

  async function onSubmit() {
    setError("");
    if (!fullName.trim()) return setError("Введите ФИО");
    const birthErr = validateBirthDate(birthDate ?? "");
    if (birthErr) return setError(birthErr);
    try {
      await save.mutateAsync({
        id: patient?.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
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
