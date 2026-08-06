import { useState } from "react";
import { useChangeMyPassword } from "../api/hooks";
import { errorMessage } from "../api/client";
import { Button, Field, Input } from "./ui";

/**
 * Смена собственного пароля - для любой роли клиники.
 *
 * Сервер бампает token_version и тут же выдаёт свежие куки текущей сессии, так
 * что после смены выкидывает только с других устройств.
 */
export default function PasswordChangeForm() {
  const change = useChangeMyPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setError("");
    setDone(false);
    if (next.length < 6) return setError("Новый пароль должен быть не короче 6 символов");
    if (next !== repeat) return setError("Пароли не совпадают");
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setDone(true);
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Смена пароля</h2>
      <p className="mt-1 text-sm text-slate-400">
        После смены сессии на других устройствах завершатся.
      </p>

      <div className="mt-4 max-w-sm space-y-4">
        <Field label="Текущий пароль *">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Новый пароль * (минимум 6 символов)">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Повторите новый пароль *">
          <Input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </Field>

        {done && (
          <div className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
            Пароль изменён.
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <Button onClick={submit} disabled={change.isPending}>
          {change.isPending ? "Сохранение…" : "Сменить пароль"}
        </Button>
      </div>
    </div>
  );
}
