import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../api/client";
import { Button, Field, Input } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err, "Не удалось войти"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm"
      >
        <div className="mb-1 text-center text-3xl font-bold text-brand">
          Temart
        </div>
        <p className="mb-6 text-center text-sm text-slate-400">
          CRM стоматологической клиники
        </p>

        <div className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@temart.local"
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
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? "Вход…" : "Войти"}
        </Button>
      </form>
    </div>
  );
}
