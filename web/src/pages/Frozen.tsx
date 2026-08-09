import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui";
import { HourglassIcon } from "../components/icons";
import { useT } from "../lib/i18n";

/**
 * Экран замороженной клиники: пробный (или оплаченный) период истёк. Пользователь
 * может войти и увидеть это сообщение, но все рабочие эндпоинты отвечают 403 -
 * блокировка настоящая, на сервере, а не только спрятанный интерфейс.
 */
export default function Frozen() {
  const { t } = useT();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <HourglassIcon className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-ink">
          {t("Ваш пробный период истёк")}
        </h1>
        {user?.clinic_name && (
          <p className="mt-1 text-sm text-slate-400">{user.clinic_name}</p>
        )}
        <p className="mt-4 text-sm text-slate-600">
          {t(
            "Доступ к платформе приостановлен, но все ваши данные - пациенты, записи и история - в сохранности. Хотите продлить? Напишите нам:"
          )}
        </p>

        <div className="mt-5 space-y-2">
          <a
            href="https://wa.me/77779109965"
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            WhatsApp: +7 777 910 99 65
          </a>
          <a
            href="mailto:tolenn.olzhas@gmail.com"
            className="block rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
          >
            tolenn.olzhas@gmail.com
          </a>
        </div>

        <Button variant="ghost" className="mt-6" onClick={() => logout()}>
          {t("Выйти")}
        </Button>
      </div>
    </div>
  );
}
