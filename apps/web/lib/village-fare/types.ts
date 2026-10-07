export type VillageFareRow = {
  id: string;
  village: string;
  day: string;
  night: string;
  custom: Record<string, string>;
  fontSizes?: Record<string, number>;
};

export type VillageFareField = {
  id: string;
  name: string;
  enabled: boolean;
};

export type VillageFareSettings = {
  paperSize: "A4" | "A3";
  villageFontSize: number;
  textPadding: number;
  fields: {
    number: boolean;
    village: boolean;
    day: boolean;
    night: boolean;
  };
};

export const DEFAULT_VILLAGE_FARE_SETTINGS: VillageFareSettings = {
  paperSize: "A4",
  villageFontSize: 28,
  textPadding: 2,
  fields: { number: true, village: true, day: true, night: true },
};
