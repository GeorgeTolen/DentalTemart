import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../api/client";
import { Button, Field, Input } from "../components/ui";
import { AuthShell } from "./Login";

// Separate login for the platform superadmin - the person who manages every
// clinic. No clinic is chosen here.
export default function PlatformLogin() {
  const { platformLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await platformLogin(email, password);
    } catch (err) {
      setError(errorMessage(err, "Не удалось войти"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl bg-slate-900 px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Панель платформы
          </div>
          <div className="font-semibold text-white">Администратор платформы</div>
        </div>

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Пароль">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Вход…" : "Войти"}
        </Button>

        <div className="border-t border-slate-100 pt-4 text-center">
          <Link to="/" className="text-sm text-slate-400 hover:text-brand">
            ← Вход для клиник
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
