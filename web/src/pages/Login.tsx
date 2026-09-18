import { useState, type FormEvent } from "react";
import { useAuth, type LoginChoice } from "../auth/AuthContext";
import { errorMessage } from "../api/client";
import { Button, Field, Input } from "../components/ui";
import { useT } from "../lib/i18n";

/**
 * Единый вход для всех: email и пароль, без выбора клиники. Куда попадёт
 * человек - в свою клинику или в панель платформы - решает сервер по учётке.
 * Список клиник показывается только если один и тот же email с тем же
 * паролем заведён в нескольких, и только эти клиники - чужих названий
 * посторонний здесь не увидит.
 */
export default function Login() {
  const { t } = useT();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [choices, setChoices] = useState<LoginChoice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(clinicId?: number) {
    setError("");
    setBusy(true);
    try {
      const next = await login(email, password, clinicId);
      setChoices(next);
    } catch (err) {
      setError(errorMessage(err, "Не удалось войти"));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn();
  }

  // Другой аккаунт: возвращаемся к форме, пароль не храним.
  function reset() {
    setChoices(null);
    setPassword("");
    setError("");
  }

  return (
    <AuthShell>
      {choices ? (
        <div className="space-y-4">
          <h2 className="text-center text-lg font-semibold text-ink">
            {t("Выберите, куда войти")}
          </h2>
          <p className="text-center text-sm text-slate-400">
            {t("Этот email и пароль подходят к нескольким клиникам.")}
          </p>
          <div className="space-y-2">
            {choices.map((c) => (
              <button
                key={c.clinic_id}
                onClick={() => signIn(c.clinic_id)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand hover:bg-brand-bg disabled:opacity-60"
              >
                <span className="font-medium text-ink">{t(c.clinic_name)}</span>
                <span className="text-slate-300">→</span>
              </button>
            ))}
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {t(error)}
            </div>
          )}
          <div className="border-t border-slate-100 pt-4 text-center">
            <button
              type="button"
              onClick={reset}
              className="text-sm text-slate-400 hover:text-brand"
            >
              {t("← войти под другим аккаунтом")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label={t("Пароль")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {t(error)}
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t("Вход…") : t("Войти")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <img src="/logo.svg" alt="Temart" className="mx-auto mb-2 h-28 w-auto" />
        <p className="mb-6 text-center text-sm text-slate-400">
          {t("CRM для стоматологических клиник")}
        </p>
        {children}
      </div>
    </div>
  );
}
