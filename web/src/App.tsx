import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import PlatformLogin from "./pages/PlatformLogin";
import Platform from "./pages/Platform";
import Calendar from "./pages/Calendar";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Doctors from "./pages/Doctors";
import Admin from "./pages/Admin";
import Services from "./pages/Services";
import Stats from "./pages/Stats";
import Users from "./pages/Users";
import Archive from "./pages/Archive";
import Events from "./pages/Events";
import AppointmentsPage from "./pages/Appointments";
import DoctorCabinet from "./pages/DoctorCabinet";
import OwnerCabinet from "./pages/OwnerCabinet";
import Frozen from "./pages/Frozen";

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      {children}
    </div>
  );
}

export default function App() {
  const { user, loading, supportClinic } = useAuth();

  if (loading) return <FullScreen>Загрузка…</FullScreen>;

  // Not signed in: clinic picker/login + separate platform login.
  if (!user) {
    return (
      <Routes>
        <Route path="/platform-login" element={<PlatformLogin />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Platform superadmin: dedicated single-page panel, no clinic UI - unless
  // they opened a clinic in support mode, where they get the clinic screens
  // read-only (the server refuses any write in that mode).
  if (user.role === "superadmin" && !supportClinic) {
    return (
      <Routes>
        <Route path="/" element={<Platform />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Пробный период клиники истёк: вместо приложения - экран с контактами для
  // продления. Суперадмина в режиме поддержки это не касается.
  if (user.role !== "superadmin" && user.clinic_frozen) {
    return <Frozen />;
  }

  // Clinic screens: a clinic user (owner / admin / doctor) or the superadmin
  // in support mode.
  const isOwner = user.role === "owner";
  const isManager = isOwner || user.role === "admin";
  // Управление и прайс закрыты requireManager на сервере; в режиме поддержки
  // суперадмин только смотрит, поэтому и здесь их не показываем.
  const canManage = isManager && !supportClinic;
  // Кабинет врача завязан на профиль врача, которого у владельца нет.
  const cabinet = user.role === "doctor" ? <DoctorCabinet /> : <OwnerCabinet />;
  // Куда ведёт «Управление» по умолчанию: у менеджера нет вкладки пользователей.
  const manageHome = isOwner ? "/admin/users" : "/admin/stats";
  const managed = (element: ReactNode) =>
    canManage ? element : <Navigate to="/" replace />;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/platform-login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<Calendar />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/my-cabinet" element={cabinet} />
        <Route path="/services" element={managed(<Services />)} />
        <Route path="/admin" element={<Navigate to={manageHome} replace />} />
        <Route path="/admin/new-appointment" element={managed(<Admin />)} />
        <Route
          path="/admin/users"
          element={canManage && isOwner ? <Users /> : <Navigate to="/" replace />}
        />
        <Route path="/admin/stats" element={managed(<Stats />)} />
        <Route path="/admin/archive" element={managed(<Archive />)} />
        <Route path="/admin/events" element={managed(<Events />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
