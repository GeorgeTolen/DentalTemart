import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABELS } from "../lib/types";
import ThemeToggle from "./ThemeToggle";
import { CalendarIcon } from "./icons";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

// Календарь - главный экран: именно в нём администраторы и врачи ставят записи,
// поэтому он выделен и стоит первым.
const CALENDAR: NavItem = { to: "/", label: "Календарь", end: true };

const CLINIC_LINKS: NavItem[] = [
  { to: "/appointments", label: "Записи" },
  { to: "/patients", label: "Пациенты" },
  { to: "/doctors", label: "Врачи" },
];

export default function Layout() {
  const { user, logout, supportClinic, exitSupport } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isOwner = user?.role === "owner";
  const isManager = isOwner || user?.role === "admin";
  // В режиме поддержки суперадмин только смотрит: у него нет ни прайса, ни
  // управления - сервер всё равно ответит 403 на эти запросы.
  const canManage = isManager && !supportClinic;

  // Прайс и деньги менеджерские: /api/services закрыт requireManager.
  const mainLinks: NavItem[] = canManage
    ? [...CLINIC_LINKS, { to: "/services", label: "Услуги" }]
    : CLINIC_LINKS;

  const manageLinks: NavItem[] = canManage
    ? [
        { to: "/admin/new-appointment", label: "Создать запись" },
        ...(isOwner ? [{ to: "/admin/users", label: "Пользователи" }] : []),
        { to: "/admin/stats", label: "Статистика" },
        { to: "/admin/archive", label: "Архив" },
        { to: "/admin/events", label: "События" },
      ]
    : [];

  // Группа раскрыта, пока пользователь внутри неё - иначе он не видит, где стоит.
  const inManage = location.pathname.startsWith("/admin");
  const [manageOpen, setManageOpen] = useState(inManage);
  const showManage = manageOpen || inManage;

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

  // Плоский список для мобильной полосы вкладок: выпадающая группа на узком
  // экране только мешает.
  const mobileLinks = [CALENDAR, ...mainLinks, ...manageLinks];

  return (
    <div className="flex min-h-screen flex-col">
      {supportClinic && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          <span>
            Режим поддержки: «{supportClinic.name}» - только просмотр, изменения
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
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <div className="text-lg font-bold leading-none text-brand">Temart</div>
              {clinicName && (
                <div className="mt-0.5 truncate text-xs text-slate-400">{clinicName}</div>
              )}
            </div>
            <ThemeToggle />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {supportClinic ? (
              <span className="max-w-[42vw] truncate text-sm font-medium text-ink">
                {user?.full_name}
              </span>
            ) : (
              <button
                onClick={() => navigate("/my-cabinet")}
                className="max-w-[42vw] truncate text-sm font-medium text-ink"
                title="Личный кабинет"
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

        {/* Мобильные вкладки навигации - отдельная строка, прокручивается вбок */}
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {mobileLinks.map((l) => (
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

        {/* ===== Десктопный сайдбар (md+): закреплён, чтобы «Личный кабинет»
             и «Выйти» не уезжали вниз на длинных списках ===== */}
        <aside className="hidden shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:overflow-y-auto">
          <div className="mb-6 flex items-start justify-between px-2">
            <div className="min-w-0">
              <div className="text-2xl font-bold text-brand">Temart</div>
              {clinicName && (
                <div className="mt-0.5 truncate text-sm text-slate-400">{clinicName}</div>
              )}
            </div>
            <ThemeToggle className="mt-1" />
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {/* Календарь выделен рамкой: это точка входа в рабочий день. */}
            <NavLink
              to={CALENDAR.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "border-brand bg-brand text-white"
                    : "border-brand-light bg-brand-bg text-brand-dark hover:bg-brand-light"
                }`
              }
            >
              <CalendarIcon className="h-5 w-5" />
              {CALENDAR.label}
            </NavLink>

            {mainLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
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

          {/* «Управление» живёт внизу, рядом с личной зоной, а личный кабинет
              открывается кликом по имени - отдельный пункт меню не нужен. */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            {manageLinks.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setManageOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Управление
                  <span className="text-xs text-slate-400">{showManage ? "▾" : "▸"}</span>
                </button>
                {showManage && (
                  <div className="mt-1 space-y-1 border-l border-slate-100 pl-3">
                    {manageLinks.map((l) => (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        className={({ isActive }) =>
                          `block rounded-xl px-3 py-2 text-sm transition ${
                            isActive
                              ? "bg-brand-bg font-medium text-brand-dark"
                              : "text-slate-500 hover:bg-slate-50 hover:text-ink"
                          }`
                        }
                      >
                        {l.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}

            {supportClinic ? (
              <div className="px-3 py-1.5">
                <span className="block text-sm font-medium text-ink">{user?.full_name}</span>
                <span className="block text-xs text-slate-400">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </div>
            ) : (
              <button
                onClick={() => navigate("/my-cabinet")}
                title="Открыть личный кабинет"
                className="block w-full rounded-xl px-3 py-1.5 text-left transition hover:bg-brand-bg"
              >
                <span className="block text-sm font-medium text-ink">{user?.full_name}</span>
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
