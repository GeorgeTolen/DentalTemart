import { useState } from "react";
import {
  useAddClinicOwner,
  useChangeOwnPassword,
  useClinicUsers,
  useClinics,
  useDeleteClinic,
  useDeleteClinicUserByPlatform,
  useDeletePlatformAdmin,
  usePlatformAdmins,
  usePlatformStats,
  useResetClinicUserPassword,
  useSaveClinic,
  useSavePlatformAdmin,
  useSetClinicAccess,
  type ClinicPayload,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Clinic, ClinicUser, PlatformAdmin } from "../lib/types";
import { ROLE_LABELS } from "../lib/types";
import { formatMoney } from "../lib/money";
import { Button, Field, Input, Modal } from "../components/ui";
import { SortToggle, sortList, type SortOrder } from "../components/SortToggle";

type PlatformTab = "clinics" | "admins";

export default function Platform() {
  const { user, logout, enterSupport } = useAuth();
  const { data: stats } = usePlatformStats();
  const { data: rawClinics = [], isLoading } = useClinics();
  const [tab, setTab] = useState<PlatformTab>("clinics");
  // Клиники приходят целиком (created_at DESC) - порядок меняем на клиенте.
  const [clinicSort, setClinicSort] = useState<SortOrder>("new");
  // В типе Clinic нет created_at, поэтому новизну задаёт растущий id - он даёт
  // тот же порядок, что и дата создания.
  const clinics = sortList(rawClinics, clinicSort, (c) => c.id, (c) => c.name);
  const [editing, setEditing] = useState<Clinic | "new" | null>(null);
  const [addingOwner, setAddingOwner] = useState<Clinic | null>(null);
  const [managingUsers, setManagingUsers] = useState<Clinic | null>(null);
  const [managingAccess, setManagingAccess] = useState<Clinic | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
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
    { label: "Клиник", value: String(stats?.total_clinics ?? 0) },
    { label: "Активных", value: String(stats?.active_clinics ?? 0) },
    { label: "Сотрудников", value: String(stats?.total_users ?? 0) },
    { label: "Пациентов", value: String(stats?.total_patients ?? 0) },
    { label: "Врачей", value: String(stats?.total_doctors ?? 0) },
    { label: "Приёмов", value: String(stats?.total_appointments ?? 0) },
    { label: "Выручка всех клиник", value: formatMoney(stats?.total_revenue ?? 0) },
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
            onClick={() => setChangingPassword(true)}
            className="text-sm text-slate-500 hover:text-brand"
          >
            Сменить пароль
          </button>
          <button
            onClick={() => logout()}
            className="text-sm text-slate-500 hover:text-brand"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="truncate text-2xl font-bold text-ink" title={c.value}>
                {c.value}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{c.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          {(
            [
              { key: "clinics", label: "Клиники" },
              { key: "admins", label: "Администраторы платформы" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "bg-brand text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "admins" && <PlatformAdmins />}

        {tab === "clinics" && (
          <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-ink">Клиники</h1>
            <div className="flex flex-wrap items-center gap-3">
              <SortToggle value={clinicSort} onChange={setClinicSort} withName />
              <Button onClick={() => setEditing("new")}>+ Новая клиника</Button>
            </div>
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
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              c.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {c.is_active ? "Активна" : "Отключена"}
                          </span>
                          <AccessBadge clinic={c} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.owner_count}</td>
                      <td className="px-4 py-3 text-slate-600">{c.patient_count}</td>
                      <td className="px-4 py-3 text-slate-600">{c.doctor_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => enterSupport({ id: c.id, name: c.name })}
                            title="Открыть данные клиники только для просмотра"
                          >
                            Открыть
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => setManagingUsers(c)}
                          >
                            Учётки
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs"
                            onClick={() => setManagingAccess(c)}
                          >
                            Доступ
                          </Button>
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
          </>
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
      {managingUsers && (
        <ClinicUsersModal
          clinic={managingUsers}
          onClose={() => setManagingUsers(null)}
        />
      )}
      {managingAccess && (
        <ClinicAccessModal
          clinic={managingAccess}
          onClose={() => setManagingAccess(null)}
        />
      )}
      {changingPassword && (
        <ChangePasswordModal onClose={() => setChangingPassword(false)} />
      )}
    </div>
  );
}

// --- Доступ клиники (пробный период / оплата) --------------------------------

function AccessBadge({ clinic }: { clinic: Clinic }) {
  if (clinic.frozen) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Заморожена
      </span>
    );
  }
  if (clinic.access_expires_at) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        до {new Date(clinic.access_expires_at).toLocaleDateString("ru")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-brand-dark">
      Бессрочно
    </span>
  );
}

function ClinicAccessModal({
  clinic,
  onClose,
}: {
  clinic: Clinic;
  onClose: () => void;
}) {
  const setAccess = useSetClinicAccess();
  const [days, setDays] = useState("7");
  const [error, setError] = useState("");

  async function run(action: "unlimited" | "freeze" | "grant") {
    setError("");
    if (action === "freeze" && !confirm(`Заморозить «${clinic.name}» прямо сейчас? Сотрудники клиники не смогут работать, пока вы не продлите доступ.`))
      return;
    const n = Number(days) || 0;
    if (action === "grant" && n < 1) return setError("Укажите срок в днях");
    try {
      await setAccess.mutateAsync({
        clinicId: clinic.id,
        action,
        days: action === "grant" ? n : undefined,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={`Доступ - ${clinic.name}`}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Закрыть</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          Сейчас: <AccessBadge clinic={clinic} />
          {clinic.frozen && clinic.access_expires_at && (
            <span className="text-xs text-slate-400">
              (истёк {new Date(clinic.access_expires_at).toLocaleDateString("ru")})
            </span>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Выдать доступ на</span>
            <div className="w-20">
              <Input
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <span>дней</span>
            <Button
              className="px-3 py-1.5 text-xs"
              onClick={() => run("grant")}
              disabled={setAccess.isPending}
            >
              Выдать
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Срок отсчитывается от текущего момента - подходит и для продления, и
            для разморозки.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="success"
            onClick={() => run("unlimited")}
            disabled={setAccess.isPending}
          >
            Оплачено - доступ навсегда
          </Button>
          <Button
            variant="danger"
            onClick={() => run("freeze")}
            disabled={setAccess.isPending}
          >
            Заморозить сейчас
          </Button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}

// --- Администраторы платформы ---------------------------------------------

function PlatformAdmins() {
  const { data: rawAdmins = [], isLoading } = usePlatformAdmins();
  const del = useDeletePlatformAdmin();
  // Свой порядок, независимый от списка клиник: дефолт повторяет сервер -
  // свежие учётки сверху.
  const [sort, setSort] = useState<SortOrder>("new");
  const admins = sortList(rawAdmins, sort, (a) => a.created_at, (a) => a.full_name);
  const [editing, setEditing] = useState<PlatformAdmin | "new" | null>(null);
  const [error, setError] = useState("");

  async function onDelete(a: PlatformAdmin) {
    if (!confirm(`Удалить администратора платформы «${a.full_name}»?`)) return;
    setError("");
    try {
      await del.mutateAsync(a.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Администраторы платформы</h1>
          <p className="mt-1 text-sm text-slate-400">
            Учётные записи с полным доступом ко всем клиникам. Вход - на странице
            «Вход для администратора платформы».
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SortToggle value={sort} onChange={setSort} withName />
          <Button onClick={() => setEditing("new")}>+ Администратор</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">ФИО</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{a.full_name}</span>
                    {a.is_self && (
                      <span className="ml-2 rounded-full bg-brand-bg px-2 py-0.5 text-xs text-brand-dark">
                        это вы
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => setEditing(a)}
                      >
                        Изменить
                      </Button>
                      {!a.is_self && (
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          onClick={() => onDelete(a)}
                        >
                          Удалить
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlatformAdminModal
          admin={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PlatformAdminModal({
  admin,
  onClose,
}: {
  admin: PlatformAdmin | null;
  onClose: () => void;
}) {
  const save = useSavePlatformAdmin();
  const [fullName, setFullName] = useState(admin?.full_name ?? "");
  const [email, setEmail] = useState(admin?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!fullName.trim()) return setError("Введите ФИО");
    if (!email.trim()) return setError("Введите email");
    // При создании пароль обязателен, при изменении - только если его меняют.
    if ((!admin || password) && password.length < 6)
      return setError("Пароль должен быть не короче 6 символов");
    try {
      await save.mutateAsync({
        id: admin?.id,
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
      title={admin ? "Изменить администратора" : "Новый администратор платформы"}
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
        <Field label="ФИО *">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email *">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@temart.kz"
          />
        </Field>
        <Field
          label={
            admin
              ? "Новый пароль (оставьте пустым, чтобы не менять; минимум 6 символов)"
              : "Пароль * (минимум 6 символов)"
          }
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {admin?.is_self && password && (
          <p className="text-xs text-slate-400">
            Вы меняете пароль собственной учётной записи - сессия сохранится, но
            на других устройствах придётся войти заново.
          </p>
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

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const change = useChangeOwnPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setError("");
    if (next.length < 6) return setError("Новый пароль должен быть не короче 6 символов");
    if (next !== repeat) return setError("Пароли не совпадают");
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title="Смена пароля"
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Готово</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={change.isPending}>
              {change.isPending ? "Сохранение…" : "Сменить"}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-slate-600">
          Пароль изменён. Сессии на других устройствах завершены.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Текущий пароль *">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="Новый пароль * (минимум 6 символов)">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Повторите новый пароль *">
            <Input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// --- Учётные записи клиники ------------------------------------------------

function ClinicUsersModal({
  clinic,
  onClose,
}: {
  clinic: Clinic;
  onClose: () => void;
}) {
  const { data: users = [], isLoading } = useClinicUsers(clinic.id);
  const reset = useResetClinicUserPassword();
  const del = useDeleteClinicUserByPlatform();
  const [resetting, setResetting] = useState<ClinicUser | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitReset() {
    if (!resetting) return;
    setError("");
    if (password.length < 6)
      return setError("Пароль должен быть не короче 6 символов");
    try {
      await reset.mutateAsync({
        clinicId: clinic.id,
        userId: resetting.id,
        password,
      });
      setNotice(`Пароль для ${resetting.email} изменён. Передайте его владельцу.`);
      setResetting(null);
      setPassword("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onDelete(u: ClinicUser) {
    if (!confirm(`Удалить учётную запись «${u.full_name}» (${u.email})?`)) return;
    setError("");
    setNotice("");
    try {
      await del.mutateAsync({ clinicId: clinic.id, userId: u.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={`Учётные записи - ${clinic.name}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Закрыть</Button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Сброс пароля нужен, когда владелец клиники не может войти сам. После
          сброса его открытые сессии завершаются.
        </p>

        {notice && (
          <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-400">
            В клинике нет ни одной учётной записи - добавьте владельца.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {users.map((u) => (
              <li key={u.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">
                      {u.full_name}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {u.email} · {ROLE_LABELS[u.role]}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => {
                        setResetting(resetting?.id === u.id ? null : u);
                        setPassword("");
                        setError("");
                      }}
                    >
                      Сбросить пароль
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      onClick={() => onDelete(u)}
                    >
                      Удалить
                    </Button>
                  </div>
                </div>

                {resetting?.id === u.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-[12rem] flex-1">
                      <Field label="Новый пароль (минимум 6 символов)">
                        <Input
                          type="text"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="например, Temart2026!"
                        />
                      </Field>
                    </div>
                    <Button onClick={submitReset} disabled={reset.isPending}>
                      {reset.isPending ? "Сохранение…" : "Сохранить"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
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
  // Пробный период (только при создании): тумблер + число дней.
  const [trial, setTrial] = useState(false);
  const [trialDays, setTrialDays] = useState("7");
  // Only used when creating a new clinic - its first owner.
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Введите название клиники");
    if (ownerEmail && ownerPassword.length < 6)
      return setError("Пароль владельца должен быть не короче 6 символов");
    const days = Number(trialDays) || 0;
    if (!clinic && trial && days < 1)
      return setError("Укажите срок пробного периода в днях");
    const payload: ClinicPayload = {
      id: clinic?.id,
      name: name.trim(),
      slug: slug.trim(),
      address: address.trim(),
      phone: phone.trim(),
      is_active: isActive,
    };
    if (!clinic && trial) payload.trial_days = days;
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
        <Field label="Идентификатор (slug, латиницей - оставьте пустым для авто)">
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

        {/* Пробный период задаётся при создании; дальше срок управляется
            кнопкой «Доступ» у клиники. */}
        {!clinic && (
          <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <input
                type="checkbox"
                checked={trial}
                onChange={(e) => setTrial(e.target.checked)}
                className="h-4 w-4"
              />
              Пробный период (временный доступ)
            </label>
            {trial && (
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <span>Срок:</span>
                <div className="w-20">
                  <Input
                    inputMode="numeric"
                    value={trialDays}
                    onChange={(e) =>
                      setTrialDays(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                  />
                </div>
                <span>дней. Потом клиника заморозится до продления.</span>
              </div>
            )}
          </div>
        )}

        {!clinic && (
          <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-600">
              Владелец клиники (необязательно - можно добавить позже)
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
      title={`Новый владелец - ${clinic.name}`}
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
