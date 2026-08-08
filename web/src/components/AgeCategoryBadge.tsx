import { ageCategory } from "../lib/datetime";

// Пилюля «Детский/Взрослый» рядом с датой рождения. Ничего не рендерит, пока
// дата не заполнена.
export function AgeCategoryBadge({ birthDate }: { birthDate: string | null }) {
  const category = ageCategory(birthDate);
  if (!category) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        category === "Детский"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {category}
    </span>
  );
}
