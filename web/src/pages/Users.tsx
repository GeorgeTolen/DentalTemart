import { useState } from "react";
import { useDeleteUser, useSaveUser, useUsers } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { ClinicUser, Role } from "../lib/types";
import { ROLE_LABELS } from "../lib/types";
import { Button, Field, Input, Modal, Select } from "../components/ui";
import { useT } from "../lib/i18n";
import { SortToggle, sortList, type SortOrder } from "../components/SortToggle";

// Roles a clinic owner can assign (superadmin is platform-only).
const ROLES: Role[] = ["owner", "admin", "doctor"];

// Учётные записи сотрудников клиники. Доступно только владельцу.
export default function Users() {
  const { t } = useT();
  const { data: rawUsers = [], isLoading } = useUsers();
  // Список сотрудников грузится целиком - сортируем на клиенте. Дефолт
  // повторяет порядок сервера: свежие учётки сверху.
  const [sort, setSort] = useState<SortOrder>("new");
  // Даты создания в ClinicUser нет, новизну задаёт растущий id.
  const users = sortList(rawUsers, sort, (u) => u.id, (u) => u.full_name);
  const deleteUser = useDeleteUser();
  const [editing, setEditing] = useState<ClinicUser | null | "new">(null);
  const [error, setError] = useState("");

  async function del(u: ClinicUser) {
    if (!confirm(t("Удалить пользователя {name}?", { name: u.full_name }))) return;
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
          <h1 className="text-2xl font-bold">{t("Пользователи")}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {t("Учётные записи сотрудников клиники и их роли.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SortToggle value={sort} onChange={setSort} withName />
          <Button onClick={() => setEditing("new")}>{t("+ Добавить")}</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">{t("Загрузка…")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{t("ФИО")}</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">{t("Роль")}</th>
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
                      {t(ROLE_LABELS[u.role as Role] ?? u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => setEditing(u)}
                      >
                        {t("Изменить")}
                      </Button>
                      <Button
                        variant="danger"
                        className="px-2 py-1 text-xs"
                        onClick={() => del(u)}
                      >
                        {t("Удалить")}
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
  const { t } = useT();
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
      title={user ? t("Редактировать пользователя") : t("Новый пользователь")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("Отмена")}</Button>
          <Button onClick={save} disabled={saveUser.isPending}>
            {saveUser.isPending ? t("Сохранение…") : t("Сохранить")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("ФИО")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("Роль")}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(ROLE_LABELS[r])}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            user
              ? t("Новый пароль (оставьте пустым чтобы не менять, минимум 6 символов)")
              : t("Пароль * (минимум 6 символов)")
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
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
        )}
      </div>
    </Modal>
  );
}
