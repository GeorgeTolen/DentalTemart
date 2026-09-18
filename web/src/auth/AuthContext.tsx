import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  getSupportClinic,
  setSupportClinic,
  UNAUTHORIZED_EVENT,
  type SupportClinic,
} from "../api/client";
import type { User } from "../lib/types";

// Клиника, куда подходят введённые email и пароль (ответ сервера при
// неоднозначном входе). clinic_id 0 - панель платформы.
export interface LoginChoice {
  clinic_id: number;
  clinic_name: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  // Вход по email и паролю: сервер сам находит клинику или панель платформы.
  // Если учётка с таким паролем есть в нескольких клиниках, возвращает их
  // список - и вход повторяют с выбранным clinicId (0 - панель платформы).
  login: (email: string, password: string, clinicId?: number) => Promise<LoginChoice[] | null>;
  logout: () => Promise<void>;
  // Режим поддержки: администратор платформы смотрит данные клиники, не меняя их.
  supportClinic: SupportClinic | null;
  enterSupport: (clinic: SupportClinic) => void;
  exitSupport: () => void;
  // true, когда интерфейс должен быть только для чтения.
  readOnly: boolean;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportClinic, setSupport] = useState<SupportClinic | null>(
    getSupportClinic()
  );
  const qc = useQueryClient();

  // Try to restore the session on first load via the cookie.
  useEffect(() => {
    api
      .get<User>("/me")
      .then((res) => {
        setUser(res.data);
        // Режим поддержки существует только для администратора платформы:
        // если восстановилась другая сессия, сохранённый режим сбрасываем.
        if (res.data.role !== "superadmin") {
          setSupportClinic(null);
          setSupport(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // When any request reports the session is invalid (401), drop back to login.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
      setSupportClinic(null);
      setSupport(null);
      qc.clear();
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  // Каждый вход/выход начинает с чистого листа: сбрасываем и кеш, и режим
  // поддержки, чтобы данные чужой клиники не «протекли» в новую сессию.
  function resetSession() {
    setSupportClinic(null);
    setSupport(null);
    qc.clear();
  }

  async function login(email: string, password: string, clinicId?: number) {
    const res = await api.post<User | { choose: LoginChoice[] }>("/auth/login", {
      email,
      password,
      ...(clinicId !== undefined ? { clinic_id: clinicId } : {}),
    });
    if ("choose" in res.data) return res.data.choose;
    resetSession();
    setUser(res.data);
    return null;
  }

  async function logout() {
    await api.post("/auth/logout");
    resetSession();
    setUser(null);
  }

  function enterSupport(clinic: SupportClinic) {
    setSupportClinic(clinic);
    setSupport(clinic);
    qc.clear(); // сменилась клиника - прежние ответы больше не относятся к делу
  }

  function exitSupport() {
    setSupportClinic(null);
    setSupport(null);
    qc.clear();
  }

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        supportClinic,
        enterSupport,
        exitSupport,
        readOnly: supportClinic !== null,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
