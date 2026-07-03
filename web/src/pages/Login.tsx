import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../api/client";
import { usePublicClinics } from "../api/hooks";
import { Button, Field, Input } from "../components/ui";
import type { PublicClinic } from "../lib/types";

// Clinic user login: first choose the clinic (стоматология), then sign in.
export default function Login() {
  const [clinic, setClinic] = useState<PublicClinic | null>(null);

  return (
    <AuthShell>
      {clinic ? (
        <ClinicSignIn clinic={clinic} onBack={() => setClinic(null)} />
      ) : (
        <ClinicPicker onPick={setClinic} />
      )}
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-1 text-center text-3xl font-bold text-brand">Temart</div>
        <p className="mb-6 text-center text-sm text-slate-400">
          CRM для стоматологических клиник
        </p>
        {children}
      </div>
    </div>
  );
}

function ClinicPicker({ onPick }: { onPick: (c: PublicClinic) => void }) {
  const { data: clinics = [], isLoading, isError } = usePublicClinics();
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      clinics.filter((c) =>
        c.name.toLowerCase().includes(q.trim().toLowerCase())
      ),
    [clinics, q]
  );

  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-semibold text-ink">
        Выберите вашу клинику
      </h2>

      {clinics.length > 5 && (
        <Input
          placeholder="Поиск клиники…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {isLoading && (
          <p className="px-2 text-sm text-slate-400">Загрузка клиник…</p>
        )}
        {isError && (
          <p className="px-2 text-sm text-red-500">
            Не удалось загрузить список клиник.
          </p>
        )}
        {!isLoading && !isError && clinics.length === 0 && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Пока нет ни одной клиники. Обратитесь к администратору платформы.
          </p>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand hover:bg-brand-bg"
          >
            <span className="font-medium text-ink">{c.name}</span>
            <span className="text-slate-300">→</span>
          </button>
        ))}
        {!isLoading && clinics.length > 0 && filtered.length === 0 && (
          <p className="px-2 text-sm text-slate-400">Клиника не найдена</p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4 text-center">
        <Link
          to="/platform-login"
          className="text-sm text-slate-400 hover:text-brand"
        >
          Вход для администратора платформы
        </Link>
      </div>
    </div>
  );
}

function ClinicSignIn({
  clinic,
  onBack,
}: {
  clinic: PublicClinic;
  onBack: () => void;
}) {
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
      await login(clinic.id, email, password);
    } catch (err) {
      setError(errorMessage(err, "Не удалось войти"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-slate-400 hover:text-brand"
      >
        ← выбрать другую клинику
      </button>
      <div className="rounded-xl bg-brand-bg px-4 py-3 text-center">
        <div className="text-xs uppercase tracking-wide text-brand">Клиника</div>
        <div className="font-semibold text-ink">{clinic.name}</div>
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
    </form>
  );
}
