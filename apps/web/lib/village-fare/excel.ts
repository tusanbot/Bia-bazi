import type { VillageFareField, VillageFareRow } from "./types";

export type ImportedVillageFare = {
  rows: VillageFareRow[];
  customFields: VillageFareField[];
};

const slug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-");
const normalize = (v: string) => v.trim().replace(/[يى]/g, "ی").replace(/ك/g, "ک")
  .replace(/[‌\u200c]/g, " ").replace(/\s+/g, " ");

const aliases = {
  village: new Set(["روستا", "روستاها", "نام روستا", "نام روستاها", "village", "villages"]),
  day: new Set(["کرایه روز", "روز", "day", "day fare"]),
  night: new Set(["کرایه شب", "شب", "night", "night fare"]),
};

function formatFare(value: string) {
  const digits = value.trim().replace(/[٬،,\s]/g, "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!digits) return "";
  const sign = digits.startsWith("-") ? "-" : "";
  const clean = digits.replace(/[^0-9]/g, "");
  return sign + Number(clean || 0).toLocaleString("en-US");
}

export async function importVillageFareExcel(file: File): Promise<ImportedVillageFare> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "", raw: false });
  if (!matrix.length) return { rows: [], customFields: [] };

  const headerIndex = matrix.findIndex(row =>
    Array.isArray(row) && row.some(cell => aliases.village.has(normalize(String(cell ?? "")).toLowerCase()))
  );
  const actualHeaderIndex = headerIndex >= 0 ? headerIndex : matrix.findIndex(row =>
    Array.isArray(row) && row.some(cell => String(cell ?? "").trim() !== "")
  );
  if (actualHeaderIndex < 0) return { rows: [], customFields: [] };

  const first = matrix[actualHeaderIndex] as unknown[];
  const headers = first.map(cell => normalize(String(cell ?? "")));
  const find = (names: Set<string>) => headers.findIndex(h => names.has(h.toLowerCase()));
  const villageIndex = find(aliases.village);
  const dayIndex = find(aliases.day);
  const nightIndex = find(aliases.night);
  const fallbackVillageIndex = villageIndex >= 0 ? villageIndex : (headers[0] === "ردیف" ? 1 : 0);
  const resolvedVillageIndex = villageIndex >= 0 ? villageIndex : fallbackVillageIndex;

  const customIndexes = headers.map((name, index) => ({ name, index })).filter(({ name, index }) =>
    name !== "" &&
    index !== resolvedVillageIndex &&
    index !== dayIndex &&
    index !== nightIndex &&
    !new Set(["ردیف", "استان", "نام روستا و استان", "روستا و استان"]).has(name)
  );

  const customFields = customIndexes.map(({ name }) => ({
    id: slug(name) || `field-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enabled: true,
  }));

  const dataRows = matrix.slice(actualHeaderIndex + 1).filter(row =>
    Array.isArray(row) && row.some(cell => String(cell ?? "").trim() !== "")
  );

  const rows = dataRows.map((item, index) => ({
    id: `village-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    village: String(item[resolvedVillageIndex] ?? ""),
    day: dayIndex >= 0 ? formatFare(String(item[dayIndex] ?? "")) : "",
    night: nightIndex >= 0 ? formatFare(String(item[nightIndex] ?? "")) : "",
    custom: Object.fromEntries(customIndexes.map((entry, j) =>
      [customFields[j].id, String(item[entry.index] ?? "")]
    )),
  }));

  return { rows, customFields };
}

export async function exportVillageFareExcel(
  rows: VillageFareRow[],
  customFields: VillageFareField[]
) {
  const XLSX = await import("xlsx");
  const data = rows.map((r, i) => ({
    "ردیف": i + 1,
    "روستا": r.village,
    "کرایه روز": r.day,
    "کرایه شب": r.night,
    ...Object.fromEntries(customFields.map(f => [f.name, r.custom[f.id] ?? ""])),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "کرایه روستاها");
  XLSX.writeFile(wb, "جدول-کرایه-روستاها.xlsx");
}
