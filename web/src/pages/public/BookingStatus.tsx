import { Link, useParams } from "react-router-dom";
import { useBookingStatus } from "../../api/public";
import { errorMessage } from "../../api/client";
import { formatDate, formatTime } from "../../lib/datetime";
import { useT } from "../../lib/i18n";
import { Row } from "./BookingPage";

const STATUS_VIEW: Record<string, { label: string; className: string }> = {
  pending: { label: "Ожидает подтверждения", className: "bg-amber-100 text-amber-700" },
  scheduled: { label: "Подтверждена", className: "bg-green-100 text-green-700" },
  completed: { label: "Приём состоялся", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Отклонена", className: "bg-slate-200 text-slate-600" },
  no_show: { label: "Приём не состоялся", className: "bg-orange-100 text-orange-700" },
};

/** Статус заявки клиента по секретной ссылке из сообщения. */
export default function BookingStatus({ slug }: { slug: string }) {
  const { t } = useT();
  const { token = "" } = useParams();
  const { data, isLoading, error } = useBookingStatus(slug, token);

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-slate-400">{t("Загрузка…")}</p>;
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-ink">{t("Заявка не найдена")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {errorMessage(error, t("Проверьте ссылку из сообщения."))}
        </p>
        <Link to={`/book/${slug}`} className="mt-4 block text-sm text-brand">
          {t("Записаться заново")}
        </Link>
      </div>
    );
  }

  const view = STATUS_VIEW[data.status] ?? { label: data.status, className: "bg-slate-100 text-slate-600" };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-ink">{data.clinic.name}</h1>
        <span
          className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${view.className}`}
        >
          {t(view.label)}
        </span>
        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <Row label={t("Когда")} value={`${formatDate(data.start_time)} ${formatTime(data.start_time)}`} />
          <Row label={t("Врач")} value={data.doctor_name} />
          <Row label={t("Пациент")} value={data.patient_name} />
        </div>
        {data.status === "pending" && (
          <p className="mt-3 text-xs text-slate-400">
            {t("Страница обновится сама, когда клиника ответит.")}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-600">{t("Как добраться")}</h2>
        {data.clinic.address && <p className="mt-1 text-sm text-ink">{data.clinic.address}</p>}
        <div className="mt-3 space-y-2">
          {data.clinic.map_url && (
            <a
              href={data.clinic.map_url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl bg-green-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              {t("Открыть в 2GIS")}
            </a>
          )}
          {data.clinic.phone && (
            <a
              href={`tel:${data.clinic.phone}`}
              className="block rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-ink"
            >
              {t("Позвонить")}: {data.clinic.phone}
            </a>
          )}
        </div>
      </div>

      {(data.telegram_link || data.telegram_linked) && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {data.telegram_linked ? (
            <p className="text-sm text-slate-600">✓ {t("Telegram подключён - уведомления придут и туда.")}</p>
          ) : (
            <a
              href={data.telegram_link}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl bg-sky-500 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              {t("Получать уведомления в Telegram")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
