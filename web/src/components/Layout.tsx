import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABELS } from "../lib/types";

const baseLinks = [
  { to: "/", label: "Календарь", end: true },
  { to: "/appointments", label: "Записи" },
  { to: "/patients", label: "Пациенты" },
  { to: "/doctors", label: "Врачи" },
];

export default function Layout() {
  const { user, logout, supportClinic, exitSupport } = useAuth();
  const navigate = useNavigate();

  const isManager = user?.role === "owner" || user?.role === "admin";
  // В режиме поддержки нет ни личного кабинета, ни управления учётками —
  // администратор платформы только смотрит данные клиники.
  const links = supportClinic
    ? baseLinks
    : isManager
      ? [...baseLinks, { to: "/admin", label: "Управление", end: undefined }]
      : [...baseLinks, { to: "/my-cabinet", label: "Мой кабинет", end: undefined }];

  // Клик по имени открывает личную зону: кабинет врача или панель управления.
  const cabinetPath = isManager ? "/admin" : "/my-cabinet";

  // Название клиники: в режиме поддержки — открытой, иначе — своей.
  const clinicName = supportClinic?.name ?? user?.clinic_name;

  // Выход из режима поддержки возвращает в панель платформы, а не разлогинивает.
  function onExit() {
    if (supportClinic) {
      exitSupport();
      navigate("/", { replace: true });
      return;
    }
    logout();
  }

  return (
    <div className="flex min-h-screen flex-col">
      {supportClinic && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          <span>
            Режим поддержки: «{supportClinic.name}» — только просмотр, изменения
            недоступны
          </span>
          <button
            onClick={onExit}
            className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            Выйти из режима
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ===== Мобильная шапка (телефон/планшет, < md) ===== */}
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="min-w-0">
            <div className="text-lg font-bold leading-none text-brand">Temart</div>
            {clinicName && (
              <div className="mt-0.5 truncate text-xs text-slate-400">
                {clinicName}
              </div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {supportClinic ? (
              <span className="max-w-[42vw] truncate text-sm font-medium text-ink">
                {user?.full_name}
              </span>
            ) : (
              <button
                onClick={() => navigate(cabinetPath)}
                className="max-w-[42vw] truncate text-sm font-medium text-ink"
                title="Мой кабинет"
              >
                {user?.full_name}
              </button>
            )}
            <button
              onClick={onExit}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 active:bg-slate-100"
            >
              {supportClinic ? "К платформе" : "Выйти"}
            </button>
          </div>
        </header>

        {/* Мобильные вкладки навигации — отдельная строка, прокручивается вбок */}
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 active:bg-slate-200"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* ===== Десктопный сайдбар (md+) ===== */}
        <aside className="hidden shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex md:w-64">
          <div className="mb-6 px-2">
            <div className="text-2xl font-bold text-brand">Temart</div>
            {clinicName && (
              <div className="mt-0.5 truncate text-sm text-slate-400">
                {clinicName}
              </div>
            )}
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-bg text-brand-dark"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 border-t border-slate-100 pt-4">
            {supportClinic ? (
              <div className="px-3 py-1.5">
                <span className="block text-sm font-medium text-ink">
                  {user?.full_name}
                </span>
                <span className="block text-xs text-slate-400">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </div>
            ) : (
              <button
                onClick={() => navigate(cabinetPath)}
                className="block w-full rounded-xl px-3 py-1.5 text-left transition hover:bg-brand-bg"
                title="Открыть мой кабинет"
              >
                <span className="block text-sm font-medium text-ink">
                  {user?.full_name}
                </span>
                <span className="block text-xs text-slate-400">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </button>
            )}
            <button
              onClick={onExit}
              className="mt-2 px-3 text-sm text-slate-500 hover:text-brand"
            >
              {supportClinic ? "Вернуться к платформе" : "Выйти"}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
