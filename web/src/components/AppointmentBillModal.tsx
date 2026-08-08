import { useEffect, useState } from "react";
import {
  useAppointmentServices,
  useDoctors,
  useRateAppointment,
  useSaveAppointmentServices,
  useServices,
  type AppointmentServiceInput,
} from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment } from "../lib/types";
import { formatMoney, parseMoneyInput, formatAmount } from "../lib/money";
import { Button, Field, Input, Modal, Select } from "./ui";

// Строка чека в состоянии редактирования. service_id = 0 - разовая услуга,
// вбитая руками (её нет в прайсе).
interface Row {
  service_id: number;
  name: string;
  price: number;
  quantity: number;
  doctor_id: number;
}

/**
 * Расчёт стоимости приёма: администратор набирает оказанные услуги из прайса
 * клиники, правит количество и при необходимости цену, и видит итог.
 *
 * Сохраняем весь список целиком (PUT), а не по одной позиции: так состояние на
 * сервере всегда совпадает с тем, что человек видит на экране.
 */
export default function AppointmentBillModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const { data: services = [] } = useServices();
  const { data: doctors = [] } = useDoctors();
  const { data: existing, isLoading } = useAppointmentServices(appointment.id);
  const save = useSaveAppointmentServices();
  const rate = useRateAppointment();

  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<number | "">("");
  const [discount, setDiscount] = useState(0);
  // После сохранения чека окно превращается в необязательную оценку посещения.
  const [step, setStep] = useState<"bill" | "rate">("bill");
  const [error, setError] = useState("");
  // Уже загруженный чек подставляем один раз, дальше не трогаем - иначе правки
  // затирались бы фоновым обновлением запроса.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || !existing) return;
    setRows(
      existing.items.map((i) => ({
        service_id: i.service_id ?? 0,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        doctor_id: i.doctor_id ?? appointment.doctor_id,
      }))
    );
    setDiscount(existing.discount_percent);
    setLoaded(true);
  }, [existing, loaded, appointment.doctor_id]);

  const activeServices = services.filter((s) => s.is_active);
  const total = rows.reduce((sum, r) => sum + r.price * r.quantity, 0);
  // Та же формула, что и на сервере: округление half-up.
  const discounted = Math.round((total * (100 - discount)) / 100);

  function addFromCatalog(serviceId: number) {
    const s = services.find((x) => x.id === serviceId);
    if (!s) return;
    setRows((prev) => {
      // Та же услуга второй раз - увеличиваем количество, а не плодим строки.
      const at = prev.findIndex(
        (r) => r.service_id === s.id && r.price === s.price
      );
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], quantity: next[at].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          service_id: s.id,
          name: s.name,
          price: s.price,
          quantity: 1,
          doctor_id: appointment.doctor_id,
        },
      ];
    });
  }

  function addCustom() {
    setRows((prev) => [
      ...prev,
      {
        service_id: 0,
        name: "",
        price: 0,
        quantity: 1,
        doctor_id: appointment.doctor_id,
      },
    ]);
  }

  function patch(index: number, changes: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...changes } : r))
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setError("");
    if (rows.some((r) => !r.name.trim())) {
      setError("У каждой услуги должно быть название");
      return;
    }
    const items: AppointmentServiceInput[] = rows.map((r) => ({
      service_id: r.service_id,
      name: r.name.trim(),
      price: r.price,
      quantity: r.quantity,
      doctor_id: r.doctor_id,
    }));
    try {
      await save.mutateAsync({
        appointmentId: appointment.id,
        items,
        discountPercent: discount,
      });
      // Не закрываем окно: даём поставить необязательную оценку посещения.
      setStep("rate");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submitRating(value: number) {
    setError("");
    try {
      await rate.mutateAsync({ appointmentId: appointment.id, rating: value });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (step === "rate") {
    return (
      <Modal
        title={`Оценка посещения - ${appointment.patient_name}`}
        onClose={onClose}
        footer={
          <Button variant="secondary" onClick={onClose} disabled={rate.isPending}>
            Пропустить
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Чек на {formatMoney(discounted)} сохранён. Как пациент оценил
            посещение? Оценка необязательна и попадёт в рейтинг врача{" "}
            {appointment.doctor_name}.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => submitRating(n)}
                disabled={rate.isPending}
                className={`h-11 w-11 rounded-xl text-sm font-semibold transition ${
                  appointment.rating === n
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-brand-bg hover:text-brand-dark"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between px-1 text-xs text-slate-400">
            <span>1 - плохо</span>
            <span>10 - отлично</span>
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Услуги и стоимость - ${appointment.patient_name}`}
      onClose={onClose}
      footer={
        <>
          <div className="mr-auto flex items-end gap-4 text-left">
            <div>
              <div className="text-xs text-slate-400">Итого</div>
              <div className="text-xl font-bold text-ink">
                {formatMoney(total)}
              </div>
            </div>
            {/* Ячейка скидки полупрозрачна, пока с ней не работают. */}
            <div className="w-20 opacity-60 transition focus-within:opacity-100">
              <div className="text-xs text-slate-400">Скидка, %</div>
              <Input
                inputMode="numeric"
                maxLength={3}
                value={String(discount)}
                onChange={(e) =>
                  setDiscount(
                    Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0)
                  )
                }
              />
            </div>
            <div>
              <div className="text-xs text-slate-400">Со скидкой</div>
              <div className="text-xl font-bold text-brand">
                {formatMoney(discounted)}
              </div>
            </div>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Загрузка…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <Field label="Добавить из прайса">
                  <Select
                    value={picked}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : "";
                      setPicked("");
                      if (id) addFromCatalog(id);
                    }}
                  >
                    <option value="">- выберите услугу -</option>
                    {activeServices.map((s) => (
                      <option key={s.id} value={s.id} title={s.description}>
                        {s.name} - {formatAmount(s.price)} ₸
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button variant="secondary" onClick={addCustom}>
                + Своя услуга
              </Button>
            </div>

            {activeServices.length === 0 && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Прайс пуст. Заполните его во вкладке «Управление» → «Услуги».
              </p>
            )}

            {rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Услуги не добавлены
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[10rem] flex-1">
                        <Field label="Услуга">
                          <Input
                            value={r.name}
                            onChange={(e) => patch(i, { name: e.target.value })}
                            placeholder="Название"
                          />
                        </Field>
                      </div>
                      <div className="w-28">
                        <Field label="Цена, ₸">
                          <Input
                            inputMode="numeric"
                            value={formatAmount(r.price)}
                            onChange={(e) =>
                              patch(i, { price: parseMoneyInput(e.target.value) })
                            }
                          />
                        </Field>
                      </div>
                      <div className="w-20">
                        <Field label="Кол-во">
                          <Input
                            inputMode="numeric"
                            value={String(r.quantity)}
                            onChange={(e) =>
                              patch(i, {
                                quantity: Math.max(
                                  1,
                                  parseMoneyInput(e.target.value) || 1
                                ),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="min-w-[9rem] flex-1">
                        <Field label="Врач">
                          <Select
                            value={r.doctor_id}
                            onChange={(e) =>
                              patch(i, { doctor_id: Number(e.target.value) })
                            }
                          >
                            {doctors.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.full_name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <button
                        onClick={() => removeRow(i)}
                        className="pb-2.5 text-sm text-red-500 hover:underline"
                      >
                        Убрать
                      </button>
                    </div>
                    <div className="mt-1 text-right text-sm text-slate-500">
                      {formatMoney(r.price * r.quantity)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
