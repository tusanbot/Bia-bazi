import { TaxiFareRow, TaxiFareField, TaxiFareSettings, DEFAULT_TAXI_FARE_SETTINGS } from "./types";

const KEY = "bia-bazi-taxi-fare-v1";

type TaxiFareState = {
  rows: TaxiFareRow[];
  customFields: TaxiFareField[];
  settings: TaxiFareSettings;
};

export function loadTaxiFareState(): TaxiFareState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TaxiFareState>;
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
      settings: {
        ...DEFAULT_TAXI_FARE_SETTINGS,
        ...(parsed.settings ?? {}),
        fields: {
          ...DEFAULT_TAXI_FARE_SETTINGS.fields,
          ...(parsed.settings?.fields ?? {}),
        },
      },
    };
  } catch {
    return null;
  }
}

export function saveTaxiFareState(state: TaxiFareState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearTaxiFareState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
