import { useState } from "react";
import { useDeleteUser, useSaveUser, useUsers } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { ClinicUser, Role } from "../lib/types";
import { ROLE_LABELS } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "../components/ui";

// Roles a clinic owner can assign (superadmin is platform-only).
const ROLES: Role[] = ["owner", "admin", "doctor"];

// Учётные записи сотрудников клиники. Доступно только владельцу.
export default function Users() {
  const { data: users = [], isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const [editing, setEditing] = useState<ClinicUser | null | "new">(null);
  const [error, setError] = useState("");

  async function del(u: ClinicUser) {
    if (!confirm(`Удалить пользователя ${u.full_name}?`)) return;
    try {
      await deleteUser.mutateAsync(u.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <p className="mt-1 text-sm text-slate-400">
            Учётные записи сотрудников клиники и их роли.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>+ Добавить</Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
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
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => setEditing(u)}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="danger"
                        className="px-2 py-1 text-xs"
                        onClick={() => del(u)}
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

      {editing !== null && (
        <UserModal user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function UserModal({ user, onClose }: { user: ClinicUser | null; onClose: () => void }) {
  const saveUser = useSaveUser();
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>((user?.role as Role) ?? "admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) return setError("Введите ФИО");
    if (!email.trim()) return setError("Введите email");
    if (!user && !password) return setError("Введите пароль");
    if (password && password.length < 6)
      return setError("Пароль должен быть не короче 6 символов");
    try {
      await saveUser.mutateAsync({
        id: user?.id,
        full_name: name,
        email,
        role,
        password: password || undefined,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={user ? "Редактировать пользователя" : "Новый пользователь"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saveUser.isPending}>
            {saveUser.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ФИО">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Роль">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            user
              ? "Новый пароль (оставьте пустым чтобы не менять, минимум 6 символов)"
              : "Пароль * (минимум 6 символов)"
          }
        >
          <Input
            type="password"
            value={password}
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}
