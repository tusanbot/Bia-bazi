export type TaxiFareRow = {
  id: string;
  city: string;
  day: string;
  night: string;
  custom: Record<string, string>;
  fontSizes?: Record<string, number>;
};

export type TaxiFareField = {
  id: string;
  name: string;
  enabled: boolean;
};

export type TaxiFareSettings = {
  paperSize: "A4" | "A3";
  maxFontSize: number;
  titleFontSize: number;
  textPadding: number;
  fields: {
    number: boolean;
    city: boolean;
    day: boolean;
    night: boolean;
  };
};

export const DEFAULT_TAXI_FARE_SETTINGS: TaxiFareSettings = {
  paperSize: "A4",
  maxFontSize: 28,
  titleFontSize: 28,
  textPadding: 2,
  fields: { number: true, city: true, day: true, night: true },
};
