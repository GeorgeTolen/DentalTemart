import { useState } from "react";
import {
  useApproveRequest,
  useBookingRequests,
  useDoctors,
  useRejectRequest,
  useRescheduleRequest,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment } from "../lib/types";
import { formatDateTime, isoToLocalInput, localInputToISO } from "../lib/datetime";
import { Button, Field, Modal, Select } from "../components/ui";
import { PickerField } from "../components/PickerDrawer";
import TimePickerDrawer from "../components/TimePickerDrawer";
import { SortToggle, type SortOrder } from "../components/SortToggle";
import { useT } from "../lib/i18n";

/**
 * Заявки с онлайн-записи: клиент выбрал время сам, клиника подтверждает,
 * переносит или отклоняет. Клиент получает ответ в WhatsApp/Telegram.
 */
export default function Requests() {
  const { t } = useT();
  const [sort, setSort] = useState<SortOrder>("old");
  const { data, isLoading } = useBookingRequests(true, sort);
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  const items = data?.items ?? [];

  async function onApprove(a: Appointment) {
    setError("");
    try {
      await approve.mutateAsync(a.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onReject(a: Appointment) {
    if (!confirm(t("Отклонить заявку {name}? Клиент получит сообщение.", { name: a.patient_name })))
      return;
    setError("");
    try {
      await reject.mutateAsync({ id: a.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("Заявки")}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t("Клиенты записались сами через ссылку клиники. Подтвердите, перенесите или отклоните - клиенту уйдёт сообщение.")}
        </p>
      </div>

      <SortToggle value={sort} onChange={setSort} />

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">{t("Загрузка…")}</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          {t("Новых заявок нет")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((a) => (
            <div key={a.id} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{a.patient_name}</div>
                  {a.patient_phone && (
                    <a href={`tel:${a.patient_phone}`} className="text-sm text-brand">
                      {a.patient_phone}
                    </a>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {t("Заявка")}
                </span>
              </div>
              <div className="space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">{t("Когда")}</span>
                  <span className="font-medium">{formatDateTime(a.start_time)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">{t("Врач")}</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: a.doctor_color }}
                    />
                    {a.doctor_name}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="success" className="flex-1" onClick={() => onApprove(a)} disabled={busy}>
                  {t("Подтвердить")}
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setRescheduling(a)} disabled={busy}>
                  {t("Перенести")}
                </Button>
                <Button variant="danger" onClick={() => onReject(a)} disabled={busy}>
                  {t("Отклонить")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rescheduling && (
        <RescheduleModal request={rescheduling} onClose={() => setRescheduling(null)} />
      )}
    </div>
  );
}

/** Перенос заявки: другое время и/или врач, после сохранения она подтверждена. */
function RescheduleModal({ request, onClose }: { request: Appointment; onClose: () => void }) {
  const { t } = useT();
  const { data: doctors = [] } = useDoctors();
  const reschedule = useRescheduleRequest();
  const [doctorId, setDoctorId] = useState(request.doctor_id);
  const [start, setStart] = useState(isoToLocalInput(request.start_time));
  const [end, setEnd] = useState(isoToLocalInput(request.end_time));
  const [pickingTime, setPickingTime] = useState(false);
  const [error, setError] = useState("");

  const timeLabel = `${start.slice(0, 10).split("-").reverse().join(".")} ${start.slice(11, 16)} – ${end.slice(11, 16)}`;

  async function submit() {
    setError("");
    try {
      await reschedule.mutateAsync({
        id: request.id,
        doctor_id: doctorId,
        start_time: localInputToISO(start),
        end_time: localInputToISO(end),
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={t("Перенести заявку")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("Отмена")}
          </Button>
          <Button onClick={submit} disabled={reschedule.isPending}>
            {reschedule.isPending ? t("Сохранение…") : t("Перенести и подтвердить")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {request.patient_name} · {t("просил(а)")} {formatDateTime(request.start_time)}
        </p>
        <Field label={t("Новое время")}>
          <PickerField value={timeLabel} placeholder={t("Выбрать дату и время")} onClick={() => setPickingTime(true)} />
        </Field>
        <Field label={t("Врач")}>
          <Select value={doctorId} onChange={(e) => setDoctorId(Number(e.target.value))}>
            {doctors
              .filter((d) => d.is_active || d.id === request.doctor_id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                  {d.specialization && ` · ${d.specialization}`}
                </option>
              ))}
          </Select>
        </Field>
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{t(error)}</div>
        )}
      </div>
      {pickingTime && (
        <TimePickerDrawer
          value={{ start, end }}
          onApply={(range) => {
            setStart(range.start);
            setEnd(range.end);
            setPickingTime(false);
          }}
          onClose={() => setPickingTime(false)}
        />
      )}
    </Modal>
  );
}
