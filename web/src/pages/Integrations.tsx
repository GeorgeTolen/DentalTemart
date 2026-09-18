import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  useClinicSettings,
  useSaveClinicSettings,
  useTelegramStatus,
  useWhatsAppLogout,
  useWhatsAppStart,
  useWhatsAppStatus,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Field, Input } from "../components/ui";
import { useT } from "../lib/i18n";

/**
 * Онлайн-запись клиники: ссылка для клиентов, ссылка 2GIS для сообщений,
 * выключатель и подключение WhatsApp-номера клиники по QR.
 */
export default function Integrations() {
  const { t } = useT();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const { data: settings, isLoading } = useClinicSettings();

  if (isLoading || !settings) {
    return <p className="text-sm text-slate-400">{t("Загрузка…")}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("Онлайн-запись")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t("Клиенты записываются сами по ссылке, а сообщения им уходят с WhatsApp-номера клиники.")}
        </p>
      </div>

      <BookingLinkCard url={settings.booking_url} enabled={settings.online_booking} />

      {isOwner && (
        <SettingsCard
          mapUrl={settings.map_url}
          onlineBooking={settings.online_booking}
          provider={settings.messenger_provider}
          greenInstance={settings.greenapi_instance}
          hasGreenToken={settings.has_greenapi_token}
        />
      )}

      {isOwner && <WhatsAppCard provider={settings.messenger_provider} />}

      <TelegramCard />
    </div>
  );
}

function BookingLinkCard({ url, enabled }: { url: string; enabled: boolean }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Старые браузеры без clipboard API: пусть выделят текст сами.
      prompt(t("Скопируйте ссылку"), url);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t("Ссылка для записи")}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {t("Отправьте её клиентам в WhatsApp, разместите в Instagram или распечатайте QR-код на стойку.")}
      </p>
      {!enabled && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("Онлайн-запись выключена: по ссылке клиенты увидят, что запись недоступна.")}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <Input value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>{copied ? t("Скопировано ✓") : t("Скопировать")}</Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              {t("Открыть")}
            </a>
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-slate-100 bg-white p-2">
          <QRCodeSVG value={url} size={128} />
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  mapUrl,
  onlineBooking,
  provider,
  greenInstance,
  hasGreenToken,
}: {
  mapUrl: string;
  onlineBooking: boolean;
  provider: string;
  greenInstance: string;
  hasGreenToken: boolean;
}) {
  const { t } = useT();
  const save = useSaveClinicSettings();
  const [map, setMap] = useState(mapUrl);
  const [enabled, setEnabled] = useState(onlineBooking);
  const [instance, setInstance] = useState(greenInstance);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError("");
    setSaved(false);
    try {
      await save.mutateAsync({
        map_url: map.trim(),
        online_booking: enabled,
        ...(provider === "greenapi"
          ? { greenapi_instance: instance.trim(), greenapi_token: token.trim() || undefined }
          : {}),
      });
      setToken("");
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t("Настройки")}</h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        {t("Принимать заявки онлайн")}
      </label>
      <Field label={t("Ссылка на клинику в 2GIS")}>
        <Input
          value={map}
          onChange={(e) => setMap(e.target.value)}
          placeholder="https://2gis.kz/almaty/firm/…"
        />
        <span className="mt-1 block text-xs text-slate-400">
          {t("Уходит клиенту в сообщении о подтверждённой записи вместе с адресом.")}
        </span>
      </Field>
      {provider === "greenapi" && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
          <Field label="Green API: idInstance">
            <Input value={instance} onChange={(e) => setInstance(e.target.value)} />
          </Field>
          <Field label={hasGreenToken ? "apiTokenInstance (сохранён)" : "apiTokenInstance"}>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={hasGreenToken ? "••••••••" : ""}
            />
          </Field>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
      )}
      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {t("Сохранено")}
        </div>
      )}
      <Button onClick={submit} disabled={save.isPending}>
        {save.isPending ? t("Сохранение…") : t("Сохранить")}
      </Button>
    </div>
  );
}

function WhatsAppCard({ provider }: { provider: string }) {
  const { t } = useT();
  // Пока ждём сканирования QR, опрашиваем статус часто.
  const [linking, setLinking] = useState(false);
  const { data: status } = useWhatsAppStatus(true, linking);
  const start = useWhatsAppStart();
  const logout = useWhatsAppLogout();
  const [error, setError] = useState("");

  useEffect(() => {
    if (status?.connected) setLinking(false);
  }, [status?.connected]);

  async function connect() {
    setError("");
    try {
      await start.mutateAsync();
      setLinking(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function disconnect() {
    if (!confirm(t("Отвязать WhatsApp-номер клиники? Сообщения клиентам перестанут уходить."))) return;
    setError("");
    try {
      await logout.mutateAsync();
      setLinking(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("WhatsApp клиники")}</h2>
        {status && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status.connected ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {status.connected
              ? `${t("Подключено")}${status.me ? `: +${status.me.replace(/\D/g, "")}` : ""}`
              : t("Не подключено")}
          </span>
        )}
      </div>

      {provider === "noop" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("Отправка сообщений выключена на сервере (режим разработки): коды и уведомления пишутся только в лог.")}
        </p>
      )}
      {provider === "greenapi" && (
        <p className="text-sm text-slate-500">
          {t("Сообщения уходят через Green API. Укажите реквизиты инстанса в настройках выше.")}
        </p>
      )}

      {provider === "baileys" && (
        <>
          <p className="text-sm text-slate-500">
            {t("С этого номера клиентам приходят коды подтверждения и уведомления о записи. Подключите рабочий номер клиники: WhatsApp → Связанные устройства → Привязать устройство → отсканируйте QR-код.")}
          </p>
          {status?.error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{status.error}</div>
          )}
          {!status?.connected && status?.qr && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4">
              <img src={status.qr} alt="QR" className="h-56 w-56" />
              <p className="text-center text-xs text-slate-400">
                {t("Отсканируйте телефоном клиники. Код обновляется сам.")}
              </p>
            </div>
          )}
          {!status?.connected && !status?.qr && linking && (
            <p className="text-sm text-slate-400">{t("Готовим QR-код…")}</p>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {status?.connected ? (
              <Button variant="secondary" onClick={disconnect} disabled={logout.isPending}>
                {t("Отвязать номер")}
              </Button>
            ) : (
              <Button onClick={connect} disabled={start.isPending}>
                {start.isPending ? t("Подключаем…") : status?.qr ? t("Обновить QR") : t("Подключить WhatsApp")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TelegramCard() {
  const { t } = useT();
  const { data } = useTelegramStatus();
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Telegram</h2>
      {data?.enabled ? (
        <p className="mt-1 text-sm text-slate-500">
          {t("Клиент может подключить уведомления в Telegram кнопкой на странице записи. Бот платформы:")}{" "}
          <a
            href={`https://t.me/${data.bot_username}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand"
          >
            @{data.bot_username}
          </a>
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">{t("Telegram-бот на платформе пока не настроен.")}</p>
      )}
    </div>
  );
}
