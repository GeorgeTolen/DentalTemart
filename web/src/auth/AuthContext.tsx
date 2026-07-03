import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, UNAUTHORIZED_EVENT } from "../api/client";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  // Clinic user login: pick a clinic, then sign in with email + password.
  login: (clinicId: number, email: string, password: string) => Promise<void>;
  // Platform superadmin login (separate, no clinic).
  platformLogin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  // Try to restore the session on first load via the cookie.
  useEffect(() => {
    api
      .get<User>("/me")
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // When any request reports the session is invalid (401), drop back to login.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
      qc.clear();
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  async function login(clinicId: number, email: string, password: string) {
    const res = await api.post<User>("/auth/login", {
      clinic_id: clinicId,
      email,
      password,
    });
    qc.clear();
    setUser(res.data);
  }

  async function platformLogin(email: string, password: string) {
    const res = await api.post<User>("/auth/platform/login", { email, password });
    qc.clear();
    setUser(res.data);
  }

  async function logout() {
    await api.post("/auth/logout");
    qc.clear();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, platformLogin, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
