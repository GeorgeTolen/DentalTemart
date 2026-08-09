import { useRef, useState } from "react";
import { useDeleteAvatar, useUploadAvatar } from "../api/hooks";
import { errorMessage } from "../api/client";
import { useT } from "../lib/i18n";

const SIZES = {
  sm: "h-10 w-10 text-base",
  md: "h-14 w-14 text-xl",
  lg: "h-24 w-24 text-3xl",
} as const;

/**
 * Аватарка пациента или врача. Без фотографии показывает инициал на цветном
 * круге - так список остаётся читаемым и до загрузки фото.
 *
 * `color` задаёт фон заглушки: у врачей это их цвет в календаре, так что
 * человек узнаётся тем же цветом, что и его приёмы.
 */
export function Avatar({
  name,
  url,
  size = "md",
  color,
}: {
  name: string;
  url: string | null;
  size?: keyof typeof SIZES;
  color?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ backgroundColor: color || "#94A3B8" }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

/**
 * Аватарка с загрузкой: клик по фото открывает выбор файла, рядом - «Удалить».
 * Загрузка идёт сразу, без отдельной кнопки «Сохранить»: файл - не поле формы,
 * и держать его в состоянии до сохранения только запутывает.
 */
export function AvatarUpload({
  kind,
  id,
  name,
  url,
  color,
  size = "lg",
}: {
  kind: "patients" | "doctors";
  id: number;
  name: string;
  url: string | null;
  color?: string;
  size?: keyof typeof SIZES;
}) {
  const { t } = useT();
  const upload = useUploadAvatar(kind);
  const remove = useDeleteAvatar(kind);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const busy = upload.isPending || remove.isPending;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      await upload.mutateAsync({ id, file });
    } catch (e) {
      setError(errorMessage(e));
    }
    // Сбрасываем input, иначе повторный выбор того же файла не вызовет change.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onRemove() {
    setError("");
    try {
      await remove.mutateAsync(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={t("Загрузить фото")}
        className="relative rounded-full transition hover:opacity-80 disabled:opacity-50"
      >
        <Avatar name={name} url={url} size={size} color={color} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <div className="text-sm">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="block text-brand hover:underline disabled:opacity-50"
        >
          {busy ? t("Загрузка…") : url ? t("Заменить фото") : t("Загрузить фото")}
        </button>
        {url && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="mt-1 block text-red-500 hover:underline disabled:opacity-50"
          >
            {t("Удалить фото")}
          </button>
        )}
        <div className="mt-1 text-xs text-slate-400">{t("jpg, png, webp - до 5 МБ")}</div>
        {error && <div className="mt-1 text-xs text-red-600">{t(error)}</div>}
      </div>
    </div>
  );
}
