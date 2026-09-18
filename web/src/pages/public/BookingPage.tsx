import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBook, usePublicClinic, usePublicSlots, useSendCode } from "../../api/public";
import { errorMessage } from "../../api/client";
import type { BookingResult, PublicClinic } from "../../lib/types";
import { formatDate, formatTime } from "../../lib/datetime";
import { Button, Input } from "../../components/ui";
import { Avatar } from "../../components/Avatar";
import { useT, dateLocale } from "../../lib/i18n";

// Шаги мастера. Дата, врач и время выбираются на одном экране - так клиенту
// видно всё сразу; дальше контакты, код и готово.
type Step = "slot" | "contact" | "code" | "done";

const pad = (n: number) => String(n).padStart(2, "0");

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Дни, открытые для записи: сегодня + horizon. Считаем в поясе браузера -
// клиенты клиники в том же городе, что и клиника.
function upcomingDays(horizon: number): Date[] {
  const out: Date[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
}

export default function BookingPage({ slug }: { slug: string }) {
  const { t } = useT();
  const { data: clinic, isLoading, error } = usePublicClinic(slug);

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-slate-400">{t("Загрузка…")}</p>;
  }
  if (error || !clinic) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ink">{t("Онлайн-запись недоступна")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {errorMessage(error, t("Клиника не найдена или запись временно закрыта."))}
        </p>
      </Card>
    );
  }
  return <Wizard slug={slug} clinic={clinic} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white p-5 shadow-sm">{children}</div>;
}

function Wizard({ slug, clinic }: { slug: string; clinic: PublicClinic }) {
  const { t, lang } = useT();
  const days = useMemo(() => upcomingDays(clinic.horizon_days), [clinic.horizon_days]);

  const [step, setStep] = useState<Step>("slot");
  const [date, setDate] = useState(dateKey(days[0]));
  // 0 - «любой свободный врач».
  const [doctorId, setDoctorId] = useState(0);
  const [start, setStart] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);

  const { data: slotsData, isFetching: slotsLoading } = usePublicSlots(slug, date, doctorId);
  const slots = slotsData?.slots ?? [];
  const sendCode = useSendCode(slug);
  const book = useBook(slug);

  // Слот мог исчезнуть после обновления списка - сбрасываем выбор.
  useEffect(() => {
    if (start && !slots.some((s) => s.start === start) && !slotsLoading) setStart("");
  }, [slots, start, slotsLoading]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const chosenDoctor = clinic.doctors.find((d) => d.id === doctorId);

  async function requestCode() {
    setErr("");
    if (name.trim().length < 2) return setErr("Укажите имя");
    if (phone.replace(/\D/g, "").length < 10) return setErr("Укажите номер телефона");
    try {
      const res = await sendCode.mutateAsync(phone);
      setPhone(res.phone || phone);
      setDebugCode(res.debug_code ?? "");
      setCooldown(60);
      setStep("code");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  async function submit() {
    setErr("");
    if (code.replace(/\D/g, "").length !== 4) return setErr("Введите 4 цифры кода");
    try {
      const res = await book.mutateAsync({
        phone,
        code,
        name: name.trim(),
        doctor_id: doctorId,
        start_time: start,
      });
      setResult(res);
      setStep("done");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      {/* Шапка клиники */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="text-xl font-bold text-ink">{clinic.name}</h1>
              {clinic.address && (
                <span className="truncate text-sm text-slate-500">{clinic.address}</span>
              )}
            </div>
            {clinic.phone && (
              <a href={`tel:${clinic.phone}`} className="mt-1 block text-sm text-brand">
                {clinic.phone}
              </a>
            )}
          </div>
          <img src="/tooth.svg" alt="Temart" className="h-12 w-12 shrink-0" />
        </div>
        {!clinic.whatsapp_connected && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("Клиника ещё не подключила WhatsApp: код подтверждения может не прийти. Позвоните по телефону клиники.")}
          </p>
        )}
      </Card>

      {step === "slot" && (
        <>
          <Card>
            <h2 className="text-sm font-semibold text-slate-600">{t("Дата")}</h2>
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {days.map((d) => {
                const key = dateKey(d);
                const active = key === date;
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setDate(key);
                      setStart("");
                    }}
                    className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-brand text-white"
                        : weekend
                          ? "bg-slate-100 text-slate-500"
                          : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="text-[11px] uppercase opacity-80">
                      {d.toLocaleDateString(dateLocale(lang), { weekday: "short" })}
                    </span>
                    <span className="font-semibold">{d.getDate()}</span>
                    <span className="text-[11px] opacity-80">
                      {d.toLocaleDateString(dateLocale(lang), { month: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-600">{t("Врач")}</h2>
            <div className="mt-2 space-y-1.5">
              <DoctorRow
                active={doctorId === 0}
                onClick={() => {
                  setDoctorId(0);
                  setStart("");
                }}
                title={t("Любой свободный врач")}
                subtitle={t("Подберём того, кто свободен")}
              />
              {clinic.doctors.map((d) => (
                <DoctorRow
                  key={d.id}
                  active={doctorId === d.id}
                  onClick={() => {
                    setDoctorId(d.id);
                    setStart("");
                  }}
                  title={d.full_name}
                  subtitle={d.specialization}
                  media={<Avatar name={d.full_name} url={d.avatar_url} size="sm" />}
                />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-600">
              {t("Время")}{" "}
              <span className="font-normal text-slate-400">· {formatDate(date)}</span>
            </h2>
            {slotsLoading && slots.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">{t("Загрузка…")}</p>
            ) : slots.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                {t("На этот день свободного времени нет - выберите другой день или врача.")}
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => setStart(s.start)}
                    className={`rounded-xl py-2.5 text-sm font-semibold tabular-nums transition ${
                      start === s.start
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-700 active:bg-slate-200"
                    }`}
                  >
                    {formatTime(s.start)}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Button className="w-full" disabled={!start} onClick={() => setStep("contact")}>
            {start
              ? t("Продолжить: {date} в {time}", { date: formatDate(start), time: formatTime(start) })
              : t("Выберите время")}
          </Button>
        </>
      )}

      {step === "contact" && (
        <Card>
          <Summary
            date={start}
            doctor={chosenDoctor?.full_name ?? t("Любой свободный врач")}
            onBack={() => setStep("slot")}
          />
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-600">{t("Ваше имя")}</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("Иван")}
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                {t("Номер WhatsApp")}
              </span>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 777 123 45 67"
                inputMode="tel"
                autoComplete="tel"
              />
              <span className="mt-1 block text-xs text-slate-400">
                {t("На этот номер придёт код подтверждения и уведомления о записи.")}
              </span>
            </label>
            {/* Ловушка для ботов: люди её не видят. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden
            />
            {err && <ErrorBox text={t(err)} />}
            <Button className="w-full" onClick={requestCode} disabled={sendCode.isPending}>
              {sendCode.isPending ? t("Отправляем код…") : t("Получить код в WhatsApp")}
            </Button>
          </div>
        </Card>
      )}

      {step === "code" && (
        <Card>
          <Summary
            date={start}
            doctor={chosenDoctor?.full_name ?? t("Любой свободный врач")}
            onBack={() => setStep("contact")}
          />
          <p className="mt-4 text-sm text-slate-600">
            {t("Мы отправили код в WhatsApp на номер {phone}. Введите его ниже.", { phone })}
          </p>
          {debugCode && (
            <p className="mt-1 text-xs text-amber-700">
              {t("Режим разработки: код")} <b>{debugCode}</b>
            </p>
          )}
          <div className="mt-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="0000"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-center text-2xl tracking-[0.5em] text-ink outline-none focus:border-brand"
              autoFocus
            />
          </div>
          {err && <ErrorBox text={t(err)} className="mt-3" />}
          <Button className="mt-3 w-full" onClick={submit} disabled={book.isPending}>
            {book.isPending ? t("Отправляем заявку…") : t("Записаться")}
          </Button>
          <button
            onClick={requestCode}
            disabled={cooldown > 0 || sendCode.isPending}
            className="mt-3 w-full text-center text-sm text-brand disabled:text-slate-400"
          >
            {cooldown > 0
              ? t("Отправить код ещё раз через {sec} с", { sec: cooldown })
              : t("Отправить код ещё раз")}
          </button>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </div>
          <h2 className="mt-3 text-center text-lg font-bold text-ink">{t("Заявка отправлена")}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            {t("Клиника подтвердит запись и пришлёт сообщение в WhatsApp.")}
          </p>
          <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <Row label={t("Когда")} value={`${formatDate(result.start_time)} ${formatTime(result.start_time)}`} />
            <Row label={t("Врач")} value={result.doctor_name} />
            <Row label={t("Статус")} value={t("ожидает подтверждения")} />
          </div>
          {result.telegram_link && (
            <a
              href={result.telegram_link}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block rounded-xl bg-sky-500 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              {t("Получать уведомления в Telegram")}
            </a>
          )}
          <Link
            to={`/book/${slug}/status/${result.public_token}`}
            className="mt-3 block rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-ink"
          >
            {t("Открыть статус заявки")}
          </Link>
        </Card>
      )}
    </div>
  );
}

function DoctorRow({
  active,
  onClick,
  title,
  subtitle,
  media,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  media?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
        active ? "border-brand bg-brand-bg" : "border-slate-100 bg-white active:bg-slate-50"
      }`}
    >
      {media ?? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-sm text-brand-dark">
          ★
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        {subtitle && <span className="block truncate text-xs text-slate-400">{subtitle}</span>}
      </span>
      {active && <span className="text-brand">✓</span>}
    </button>
  );
}

function Summary({ date, doctor, onBack }: { date: string; doctor: string; onBack: () => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-bg px-3 py-2.5">
      <div className="min-w-0 text-sm">
        <div className="font-semibold text-brand-dark">
          {formatDate(date)} · {formatTime(date)}
        </div>
        <div className="truncate text-xs text-slate-500">{doctor}</div>
      </div>
      <button onClick={onBack} className="shrink-0 text-xs text-brand hover:underline">
        {t("Изменить")}
      </button>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export function ErrorBox({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 ${className}`}>{text}</div>
  );
}
