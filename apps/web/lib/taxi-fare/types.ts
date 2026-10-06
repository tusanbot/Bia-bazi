export type TaxiFareRow = {
  id: string;
  city: string;
  province: string;
  day: string;
  night: string;
  custom: Record<string, string>;
};

export type TaxiFareField = {
  id: string;
  name: string;
  enabled: boolean;
};

export type TaxiFareSettings = {
  paperSize: "A4" | "A3";
  maxFontSize: number;
  textPadding: number;
  fields: {
    number: boolean;
    city: boolean;
    province: boolean;
    day: boolean;
    night: boolean;
  };
};

export const DEFAULT_TAXI_FARE_SETTINGS: TaxiFareSettings = {
  paperSize: "A4",
  maxFontSize: 28,
  textPadding: 2,
  fields: {
    number: true,
    city: true,
    province: true,
    day: true,
    night: true,
  },
};
