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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isManager = user?.role === "owner" || user?.role === "admin";
  const links = isManager
    ? [...baseLinks, { to: "/admin", label: "Управление", end: undefined }]
    : [...baseLinks, { to: "/my-cabinet", label: "Мой кабинет", end: undefined }];

  // Clicking your own name opens your personal area: the doctor's cabinet for
  // doctors, the management panel for owners/managers.
  const cabinetPath = isManager ? "/admin" : "/my-cabinet";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-b border-slate-200 bg-white p-3 md:w-64 md:border-b-0 md:border-r md:p-4">
        {/* Шапка: на мобильном — логотип слева, имя+выход справа. */}
        <div className="mb-2 flex items-center justify-between gap-2 px-1 md:mb-6 md:block md:px-2">
          <div>
            <div className="text-xl font-bold text-brand md:text-2xl">Temart</div>
            {user?.clinic_name && (
              <div className="mt-0.5 hidden truncate text-sm text-slate-400 md:block">
                {user.clinic_name}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => navigate(cabinetPath)}
              className="max-w-40 truncate text-right text-sm font-medium text-ink"
            >
              {user?.full_name}
            </button>
            <button
              onClick={() => logout()}
              className="text-sm text-slate-500 hover:text-brand"
            >
              Выйти
            </button>
          </div>
        </div>
        <nav className="-mx-1 flex flex-1 flex-row gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
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
        <div className="mt-4 hidden border-t border-slate-100 pt-4 md:block">
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
          <button
            onClick={() => logout()}
            className="mt-2 px-3 text-sm text-slate-500 hover:text-brand"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-3 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
