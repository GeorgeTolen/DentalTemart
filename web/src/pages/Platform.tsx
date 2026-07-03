import { useState } from "react";
import {
  useAddClinicOwner,
  useClinics,
  useDeleteClinic,
  usePlatformStats,
  useSaveClinic,
  type ClinicPayload,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Clinic } from "../lib/types";
import { Button, Field, Input, Modal } from "../components/ui";

export default function Platform() {
  const { user, logout } = useAuth();
  const { data: stats } = usePlatformStats();
  const { data: clinics = [], isLoading } = useClinics();
  const [editing, setEditing] = useState<Clinic | "new" | null>(null);
  const [addingOwner, setAddingOwner] = useState<Clinic | null>(null);
  const del = useDeleteClinic();
  const [error, setError] = useState("");

  async function onDelete(c: Clinic) {
    if (
      !confirm(
        `Удалить клинику «${c.name}»?\n\nБудут безвозвратно удалены ВСЕ её данные: ` +
          `${c.patient_count} пациент(ов), ${c.doctor_count} врач(ей), все записи и учётные записи. ` +
          `Это действие нельзя отменить.`
      )
    )
      return;
    try {
      await del.mutateAsync(c.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const statCards = [
    { label: "Клиник", value: stats?.total_clinics ?? 0 },
    { label: "Активных", value: stats?.active_clinics ?? 0 },
    { label: "Сотрудников", value: stats?.total_users ?? 0 },
    { label: "Пациентов", value: stats?.total_patients ?? 0 },
    { label: "Врачей", value: stats?.total_doctors ?? 0 },
    { label: "Приёмов", value: stats?.total_appointments ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-brand">Temart</span>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
            Платформа
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-ink">{user?.full_name}</div>
            <div className="text-xs text-slate-400">{user?.email}</div>
          </div>
          <button
            onClick={() => logout()}
            className="text-sm text-slate-500 hover:text-brand"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="text-2xl font-bold text-ink">{c.value}</div>
              <div className="mt-0.5 text-xs text-slate-400">{c.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">Клиники</h1>
          <Button onClick={() => setEditing("new")}>+ Новая клиника</Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Загрузка…</p>
        ) : clinics.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
            Клиник пока нет. Создайте первую клинику и её владельца.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Клиника</th>
                  <th className="px-4 py-3 font-medium">Идентификатор</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Владельцы</th>
                  <th className="px-4 py-3 font-medium">Пациенты</th>
                  <th className="px-4 py-3 font-medium">Врачи</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clinics.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{c.name}</div>
                      {c.address && (
                        <div className="text-xs text-slate-400">{c.address}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {c.slug}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {c.is_active ? "Активна" : "Отключена"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.owner_count}</td>
                    <td className="px-4 py-3 text-slate-600">{c.patient_count}</td>
                    <td className="px-4 py-3 text-slate-600">{c.doctor_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => setAddingOwner(c)}
                        >
                          + Владелец
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => setEditing(c)}
                        >
                          Изменить
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          onClick={() => onDelete(c)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editing && (
        <ClinicModal
          clinic={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {addingOwner && (
        <AddOwnerModal clinic={addingOwner} onClose={() => setAddingOwner(null)} />
      )}
    </div>
  );
}

function ClinicModal({
  clinic,
  onClose,
}: {
  clinic: Clinic | null;
  onClose: () => void;
}) {
  const save = useSaveClinic();
  const [name, setName] = useState(clinic?.name ?? "");
  const [slug, setSlug] = useState(clinic?.slug ?? "");
  const [address, setAddress] = useState(clinic?.address ?? "");
  const [phone, setPhone] = useState(clinic?.phone ?? "");
  const [isActive, setIsActive] = useState(clinic?.is_active ?? true);
  // Only used when creating a new clinic — its first owner.
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Введите название клиники");
    if (ownerEmail && ownerPassword.length < 6)
      return setError("Пароль владельца должен быть не короче 6 символов");
    const payload: ClinicPayload = {
      id: clinic?.id,
      name: name.trim(),
      slug: slug.trim(),
      address: address.trim(),
      phone: phone.trim(),
      is_active: isActive,
    };
    if (!clinic && ownerEmail.trim()) {
      payload.owner_name = ownerName.trim();
      payload.owner_email = ownerEmail.trim();
      payload.owner_password = ownerPassword;
    }
    try {
      await save.mutateAsync(payload);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={clinic ? "Редактировать клинику" : "Новая клиника"}
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
        <Field label="Название *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Temart"
          />
        </Field>
        <Field label="Идентификатор (slug, латиницей — оставьте пустым для авто)">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="temart"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Адрес">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Телефон">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7…" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          Активна (доступна для входа)
        </label>

        {!clinic && (
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-600">
              Владелец клиники (необязательно — можно добавить позже)
            </p>
            <Field label="ФИО владельца">
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Иванов Иван"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@clinic.local"
                />
              </Field>
              <Field label="Пароль (мин. 6)">
                <Input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddOwnerModal({
  clinic,
  onClose,
}: {
  clinic: Clinic;
  onClose: () => void;
}) {
  const add = useAddClinicOwner();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!fullName.trim()) return setError("Введите ФИО");
    if (password.length < 6) return setError("Пароль должен быть не короче 6 символов");
    try {
      await add.mutateAsync({
        clinicId: clinic.id,
        full_name: fullName.trim(),
        email: email.trim(),
        password,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={`Новый владелец — ${clinic.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={add.isPending}>
            {add.isPending ? "Сохранение…" : "Добавить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО *">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email *">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Пароль * (минимум 6 символов)">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
