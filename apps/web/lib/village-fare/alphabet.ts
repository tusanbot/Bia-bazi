const LETTERS = [
  "الف","ب","پ","ت","ث","ج","چ","ح","خ","د","ذ","ر","ز","ژ","س","ش",
  "ص","ض","ط","ظ","ع","غ","ف","ق","ک","گ","ل","م","ن","و","ه","ی",
];

export const VILLAGE_SPECIAL_MARKER = "@";
export type VillageFareGroup = "alphabet" | "misc";

export function normalizePersian(value: string) {
  return value.trim().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "ه")
    .replace(/ة/g, "ت").replace(/ؤ/g, "و").replace(/إ|أ/g, "ا")
    .replace(/[‌\u200b\u2060\u2061]/g, " ");
}

export function getVillageGroup(value: string): VillageFareGroup {
  return value.trimStart().startsWith(VILLAGE_SPECIAL_MARKER) ? "misc" : "alphabet";
}

export function getDisplayVillage(value: string) {
  return value.replace(VILLAGE_SPECIAL_MARKER, "").trim();
}

export function getInitialLetter(value: string) {
  const text = normalizePersian(getDisplayVillage(value));
  const first = text.charAt(0);
  if (first === "آ" || first === "ا") return "الف";
  return LETTERS.includes(first) ? first : "";
}

export function sortVillageRows(rows: import("./types").VillageFareRow[]) {
  return [...rows].sort((a, b) => {
    const ga = getVillageGroup(a.village), gb = getVillageGroup(b.village);
    if (ga !== gb) return ga === "alphabet" ? -1 : 1;
    return normalizePersian(getDisplayVillage(a.village)).localeCompare(
      normalizePersian(getDisplayVillage(b.village)), "fa"
    );
  });
}

export { LETTERS };
