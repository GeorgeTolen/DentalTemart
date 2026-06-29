import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const links = [
  { to: "/", label: "Календарь", end: true },
  { to: "/dashboard", label: "Дашборд" },
  { to: "/patients", label: "Пациенты" },
  { to: "/doctors", label: "Врачи" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-b border-slate-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
        <div className="mb-6 px-2 text-2xl font-bold text-brand">Temart</div>
        <nav className="flex flex-1 flex-row gap-1 md:flex-col">
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
        <div className="mt-4 hidden border-t border-slate-100 pt-4 md:block">
          <div className="px-3 text-sm font-medium text-ink">
            {user?.full_name}
          </div>
          <div className="px-3 text-xs text-slate-400">{user?.email}</div>
          <button
            onClick={() => logout()}
            className="mt-2 px-3 text-sm text-slate-500 hover:text-brand"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
