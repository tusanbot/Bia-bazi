import {
  VillageFareField,
  VillageFareSettings,
  DEFAULT_VILLAGE_FARE_SETTINGS,
  VillageFareRow,
} from "./types";

const KEY = "bia-bazi-village-fare-v1";

type VillageFareState = {
  rows: VillageFareRow[];
  customFields: VillageFareField[];
  settings: VillageFareSettings;
};

export function loadVillageFareState(): VillageFareState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VillageFareState>;
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
      settings: {
        ...DEFAULT_VILLAGE_FARE_SETTINGS,
        ...(parsed.settings ?? {}),
        fields: {
          ...DEFAULT_VILLAGE_FARE_SETTINGS.fields,
          ...(parsed.settings?.fields ?? {}),
        },
      },
    };
  } catch {
    return null;
  }
}

export function saveVillageFareState(state: VillageFareState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearVillageFareState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
