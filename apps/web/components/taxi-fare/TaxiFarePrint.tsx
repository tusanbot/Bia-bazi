"use client";

import { useMemo } from "react";
import { getInitialLetter } from "../../lib/taxi-fare/alphabet";
import type { TaxiFareField, TaxiFareRow, TaxiFareSettings } from "../../lib/taxi-fare/types";

const ROWS_PER_COLUMN = 25;
const UNITS_PER_PAGE = 50;
const PAPER = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };

type Unit =
  | { type: "letter"; letter: string }
  | { type: "data"; row: TaxiFareRow; number: number };

export function TaxiFarePrint({
  rows, customFields, settings, enabled,
}: {
  rows: TaxiFareRow[];
  customFields: TaxiFareField[];
  settings: TaxiFareSettings;
  enabled: boolean;
}) {
  const fields = useMemo(() => [
    settings.fields.number && { id: "number", label: "ردیف" },
    settings.fields.city && { id: "city", label: "شهر" },
    settings.fields.province && { id: "province", label: "استان" },
    settings.fields.day && { id: "day", label: "کرایه روز" },
    settings.fields.night && { id: "night", label: "کرایه شب" },
    ...customFields.filter((f) => f.enabled).map((f) => ({ id: f.id, label: f.name })),
  ].filter(Boolean) as { id: string; label: string }[], [settings.fields, customFields]);

  const units = useMemo<Unit[]>(() => {
    const result: Unit[] = [];
    let last = "";
    rows.forEach((row, index) => {
      const letter = getInitialLetter(row.city);
      if (letter !== last) {
        result.push({ type: "letter", letter });
        last = letter;
      }
      result.push({ type: "data", row, number: index + 1 });
    });
    return result;
  }, [rows]);

  const pages = Array.from(
    { length: Math.max(1, Math.ceil(units.length / UNITS_PER_PAGE)) },
    (_, i) => units.slice(i * UNITS_PER_PAGE, (i + 1) * UNITS_PER_PAGE)
  );

  if (!enabled) return null;

  return (
    <div className={`taxi-print-root paper-${settings.paperSize}`}>
      <style media="print">{`@page { size: ${settings.paperSize} portrait; margin: 5mm; }`}</style>
      {pages.map((page, index) => {
        const right = page.slice(0, ROWS_PER_COLUMN);
        const left = page.slice(ROWS_PER_COLUMN, UNITS_PER_PAGE);
        return (
          <PrintPage
            key={index}
            right={right}
            left={left}
            fields={fields}
            settings={settings}
            pageNumber={index + 1}
            total={pages.length}
          />
        );
      })}
    </div>
  );
}

function PrintPage({
  right, left, fields, settings, pageNumber, total,
}: {
  right: Unit[];
  left: Unit[];
  fields: { id: string; label: string }[];
  settings: TaxiFareSettings;
  pageNumber: number;
  total: number;
}) {
  const size = PAPER[settings.paperSize];
  const rowHeight = (size.h - 10) / 26;
  const style = {
    width: `${size.w}mm`,
    height: `${size.h}mm`,
    ["--taxi-row-height" as string]: `${rowHeight}mm`,
    ["--taxi-padding" as string]: `${settings.textPadding}mm`,
    ["--taxi-max-font" as string]: `${settings.maxFontSize}px`,
    ["--taxi-cols" as string]: String(Math.max(1, fields.length)),
  };

  return (
    <section className="taxi-print-page" style={style}>
      <PrintColumn units={right} fields={fields} />
      <PrintColumn units={left} fields={fields} />
      {total > 1 && <div className="taxi-print-page-number">صفحه {pageNumber} از {total}</div>}
    </section>
  );
}

function PrintColumn({
  units, fields,
}: {
  units: Unit[];
  fields: { id: string; label: string }[];
}) {
  const cells = units.slice(0, ROWS_PER_COLUMN);

  return (
    <div className="taxi-print-column">
      <div className="taxi-print-header">
        {fields.map((field) => <div key={field.id}>{field.label}</div>)}
      </div>
      <div className="taxi-print-body">
        {cells.map((unit, i) =>
          unit.type === "letter" ? (
            <div className="taxi-print-letter" key={`l-${i}-${unit.letter}`}>
              {unit.letter}
            </div>
          ) : (
            <div className="taxi-print-data" key={unit.row.id}>
              {fields.map((field) => (
                <div key={field.id} className="taxi-print-cell">
                  {valueOf(unit, field.id)}
                </div>
              ))}
            </div>
          )
        )}
        {Array.from({ length: Math.max(0, ROWS_PER_COLUMN - cells.length) }).map((_, i) => (
          <div className="taxi-print-data taxi-print-empty" key={`e-${i}`}>
            {fields.map((field) => <div key={field.id} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function valueOf(unit: Extract<Unit, { type: "data" }>, id: string) {
  if (id === "number") return unit.number;
  if (id === "city") return unit.row.city;
  if (id === "province") return unit.row.province;
  if (id === "day") return unit.row.day;
  if (id === "night") return unit.row.night;
  return unit.row.custom[id] ?? "";
}
