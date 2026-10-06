const LETTERS = [
  "الف","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش",
  "ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی",
];

export const TAXI_SPECIAL_MARKERS = {
  border: "\u2060\u2060",
  tabriz: "\u2060\u2061",
} as const;

export type TaxiFareGroup = "alphabet" | "border" | "tabriz";

export function normalizePersian(value: string) {
  return value.trim().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "ه")
    .replace(/ة/g, "ت").replace(/ؤ/g, "و").replace(/إ|أ/g, "ا").replace(/[‌\u200b\u2060\u2061]/g, " ");
}

export function getTaxiGroup(value: string): TaxiFareGroup {
  if (value.startsWith(TAXI_SPECIAL_MARKERS.border)) return "border";
  if (value.startsWith(TAXI_SPECIAL_MARKERS.tabriz)) return "tabriz";
  return "alphabet";
}

export function getDisplayCity(value: string) {
  return value
    .replace(TAXI_SPECIAL_MARKERS.border, "")
    .replace(TAXI_SPECIAL_MARKERS.tabriz, "")
    .trim();
}

export function getInitialLetter(value: string) {
  const text = normalizePersian(getDisplayCity(value));
  const first = text.charAt(0);
  if (first === "آ" || first === "ا") return "الف";
  return LETTERS.includes(first) ? first : "";
}

export function sortTaxiRows(rows: import("./types").TaxiFareRow[]) {
  return [...rows].sort((a,b) => {
    const ga = getTaxiGroup(a.city), gb = getTaxiGroup(b.city);
    if (ga !== gb) {
      const order: Record<TaxiFareGroup, number> = {alphabet: 0, border: 1, tabriz: 2};
      return order[ga] - order[gb];
    }
    return normalizePersian(getDisplayCity(a.city)).localeCompare(
      normalizePersian(getDisplayCity(b.city)), "fa"
    );
  });
}

export { LETTERS };