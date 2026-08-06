import { useState } from "react";
import { useDeleteService, useSaveService, useServices } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Service } from "../lib/types";
import { formatAmount, formatMoney, parseMoneyInput } from "../lib/money";
import { Button, Field, Input, Modal, Textarea } from "../components/ui";

// Прайс клиники. Ведут владелец и менеджер: из него набирается стоимость приёма.
export default function Services() {
  const { data: services = [], isLoading } = useServices();
  const del = useDeleteService();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [error, setError] = useState("");

  async function onDelete(s: Service) {
    if (
      !confirm(
        `Удалить услугу «${s.name}» из прайса?\n\n` +
          `Уже пробитые приёмы не изменятся - в них сохранены название и цена ` +
          `на момент оказания. Чтобы просто убрать услугу из списка выбора, ` +
          `снимите отметку «Активна».`
      )
    )
      return;
    setError("");
    try {
      await del.mutateAsync(s.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Услуги</h1>
          <p className="mt-1 text-sm text-slate-400">
            Прайс вашей клиники. Из него набирается стоимость приёма.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>+ Услуга</Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : services.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Услуг пока нет - добавьте первую.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Услуга</th>
                <th className="px-5 py-3 font-medium">Цена</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{s.name}</div>
                    {s.description && (
                      <div className="mt-0.5 max-w-md text-xs text-slate-400">
                        {s.description}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">
                    {formatMoney(s.price)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        s.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.is_active ? "Активна" : "Скрыта"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-brand hover:underline"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => onDelete(s)}
                        className="text-red-500 hover:underline"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ServiceModal
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ServiceModal({
  service,
  onClose,
}: {
  service: Service | null;
  onClose: () => void;
}) {
  const save = useSaveService();
  const [name, setName] = useState(service?.name ?? "");
  const [price, setPrice] = useState(service?.price ?? 0);
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [description, setDescription] = useState(service?.description ?? "");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Введите название услуги");
    try {
      await save.mutateAsync({
        id: service?.id,
        name: name.trim(),
        price,
        is_active: isActive,
        description: description.trim(),
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title={service ? "Изменить услугу" : "Новая услуга"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Название *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Удаление зуба"
          />
        </Field>
        <Field label="Цена, ₸">
          <Input
            inputMode="numeric"
            value={formatAmount(price)}
            onChange={(e) => setPrice(parseMoneyInput(e.target.value))}
          />
        </Field>
        <Field label="Описание">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что входит в услугу, для каких случаев (не обязательно)"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4"
          />
          Активна (доступна при расчёте стоимости)
        </label>
        {service && (
          <p className="text-xs text-slate-400">
            Изменение цены действует только на будущие приёмы: в уже пробитых
            сохранена цена на момент оказания.
          </p>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>
    </Modal>
  );
}
