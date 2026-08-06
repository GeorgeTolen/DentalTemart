// Деньги в системе — целое число тенге. Дробных тиынов в прайсе не бывает, а
// целое число избавляет от неточностей чисел с плавающей точкой при суммировании.

const formatter = new Intl.NumberFormat("ru-RU");

// formatMoney: 20000 → "20 000 ₸"
export function formatMoney(tenge: number): string {
  return `${formatter.format(Math.round(tenge))} ₸`;
}

// formatAmount — то же без символа валюты (для полей ввода и таблиц).
export function formatAmount(tenge: number): string {
  return formatter.format(Math.round(tenge));
}

// parseMoneyInput принимает то, что человек набрал руками ("20 000", "20000₸"),
// и возвращает целое число тенге; мусор превращается в 0.
export function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

// monthLabel: "2026-08" → "август 2026"
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("ru", { month: "long", year: "numeric" });
}
