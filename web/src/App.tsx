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
import AppointmentsPage from "./pages/Appointments";
import DoctorCabinet from "./pages/DoctorCabinet";

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

  // Platform superadmin: dedicated single-page panel, no clinic UI — unless
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

  // Clinic screens: a clinic user (owner / admin / doctor) or the superadmin
  // in support mode.
  const isManager = user.role === "owner" || user.role === "admin";
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
        <Route path="/my-cabinet" element={<DoctorCabinet />} />
        <Route
          path="/admin"
          element={isManager ? <Admin /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
