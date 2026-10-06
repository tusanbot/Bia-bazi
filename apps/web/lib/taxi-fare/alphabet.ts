const LETTERS = [
  "الف","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش",
  "ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی",
];

export function normalizePersian(value: string) {
  return value
    .trim()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ت")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .replace(/‌/g, " ");
}

export function getInitialLetter(value: string) {
  const text = normalizePersian(value);
  const first = text.charAt(0);
  if (first === "آ" || first === "ا") return "الف";
  if (first === "ی") return "ی";
  return LETTERS.find((letter) => letter === first) ?? first.toUpperCase() || "سایر";
}

export function sortTaxiRows(rows: import("./types").TaxiFareRow[]) {
  return [...rows].sort((a, b) =>
    normalizePersian(a.city).localeCompare(normalizePersian(b.city), "fa")
  );
}

export { LETTERS };
