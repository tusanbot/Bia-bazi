import type { TaxiFareField, TaxiFareRow } from "./types";

export type ImportedTaxiFare = {
  rows: TaxiFareRow[];
  customFields: TaxiFareField[];
};

const slug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-");

export async function importTaxiFareExcel(file: File): Promise<ImportedTaxiFare> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) return { rows: [], customFields: [] };

  const headers = Object.keys(json[0]);
  const find = (names: string[]) =>
    headers.find((h) => names.includes(h.trim().toLowerCase()));

  const cityKey = find(["شهر", "city"]);
  const provinceKey = find(["استان", "province"]);
  const dayKey = find(["کرایه روز", "روز", "day", "day fare"]);
  const nightKey = find(["کرایه شب", "شب", "night", "night fare"]);

  const fixed = new Set([cityKey, provinceKey, dayKey, nightKey].filter(Boolean));
  const customHeaders = headers.filter((h) => !fixed.has(h));
  const customFields = customHeaders.map((name) => ({
    id: slug(name) || `field-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enabled: true,
  }));

  const rows = json.map((item, index) => ({
    id: `taxi-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    city: String((cityKey && item[cityKey]) ?? ""),
    province: String((provinceKey && item[provinceKey]) ?? ""),
    day: String((dayKey && item[dayKey]) ?? ""),
    night: String((nightKey && item[nightKey]) ?? ""),
    custom: Object.fromEntries(customHeaders.map((h) => [customFields.find((f) => f.name === h)!.id, String(item[h] ?? "")])),
  }));

  return { rows, customFields };
}

export async function exportTaxiFareExcel(
  rows: TaxiFareRow[],
  customFields: TaxiFareField[]
) {
  const XLSX = await import("xlsx");
  const data = rows.map((row, index) => ({
    "ردیف": index + 1,
    "شهر": row.city,
    "استان": row.province,
    "کرایه روز": row.day,
    "کرایه شب": row.night,
    ...Object.fromEntries(customFields.map((field) => [field.name, row.custom[field.id] ?? ""])),
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "کرایه تاکسی");
  XLSX.writeFile(workbook, "جدول-کرایه-تاکسی.xlsx");
}
