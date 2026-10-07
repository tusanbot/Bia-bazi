"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDisplayVillage, getInitialLetter, getVillageGroup } from "../../lib/village-fare/alphabet";
import type { VillageFareField, VillageFareRow, VillageFareSettings } from "../../lib/village-fare/types";

const ROWS_PER_COLUMN = 25, UNITS_PER_PAGE = 50;
const PAPER = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
type Unit = { type: "letter"; letter: string } | { type: "group"; label: string } | { type: "data"; row: VillageFareRow; number: number };

export function VillageFarePrint({ rows, customFields, settings, enabled }: { rows: VillageFareRow[]; customFields: VillageFareField[]; settings: VillageFareSettings; enabled: boolean }) {
  const fields = useMemo(() => [
    settings.fields.number && { id: "number", label: "ردیف" },
    settings.fields.village && { id: "village", label: "روستا" },
    settings.fields.day && { id: "day", label: "کرایه روز" },
    settings.fields.night && { id: "night", label: "کرایه شب" },
    ...customFields.filter(f => f.enabled && !isLegacyField(f.name)).map(f => ({ id: f.id, label: f.name })),
  ].filter(Boolean) as { id: string; label: string }[], [settings.fields, customFields]);

  const units = useMemo<Unit[]>(() => {
    const out: Unit[] = [];
    let lastLetter = "";
    let lastGroup = "alphabet";
    const letterGroup = (letter: string) => {
      if (["ر", "ز"].includes(letter)) return "ر-ز";
      if (["ع", "غ"].includes(letter)) return "ع-غ";
      if (["ف", "ق"].includes(letter)) return "ف-ق";
      if (["گ", "ل"].includes(letter)) return "گ-ل";
      if (["و", "ه", "ی"].includes(letter)) return "و-ی";
      return letter;
    };

    rows.forEach((row, index) => {
      const group = getVillageGroup(row.village);
      if (group === "misc") {
        if (lastGroup !== "misc") {
          out.push({ type: "group", label: "متفرقه" });
          lastGroup = "misc";
          lastLetter = "";
        }
      } else {
        if (lastGroup !== "alphabet") {
          lastGroup = "alphabet";
          lastLetter = "";
        }
        const letter = letterGroup(getInitialLetter(row.village));
        if (letter && letter !== lastLetter) {
          out.push({ type: "letter", letter });
          lastLetter = letter;
        }
      }
      out.push({ type: "data", row, number: index + 1 });
    });
    return out;
  }, [rows]);

  const pages = Array.from({ length: Math.max(1, Math.ceil(units.length / UNITS_PER_PAGE)) }, (_, i) => units.slice(i * UNITS_PER_PAGE, (i + 1) * UNITS_PER_PAGE));
  if (!enabled) return null;
  return <div className={`village-print-root paper-${settings.paperSize}`}><style media="print">{`@page{size:${settings.paperSize} portrait;margin:5mm}`}</style>
    {pages.map((page, i) => <PrintPage key={i} right={page.slice(0, ROWS_PER_COLUMN)} left={page.slice(ROWS_PER_COLUMN)} fields={fields} settings={settings} />)}
  </div>;
}

function PrintPage({ right, left, fields, settings }: { right: Unit[]; left: Unit[]; fields: { id: string; label: string }[]; settings: VillageFareSettings }) {
  const size = PAPER[settings.paperSize], rowHeight = (size.h - 12) / 26;
  const gridTemplate = fields.map(f => f.id === "number" ? "1fr" : f.id === "village" ? "4fr" : f.id === "day" || f.id === "night" ? "2.5fr" : "1fr").join(" ");
  const style = { width: `${size.w}mm`, height: `${size.h}mm`, ["--village-row-height" as string]: `${rowHeight}mm`, ["--village-padding" as string]: `${settings.textPadding}mm`, ["--village-font" as string]: `${settings.villageFontSize}px`, ["--village-cols" as string]: String(Math.max(1, fields.length)), ["--village-grid-template" as string]: gridTemplate };
  return <section className="village-print-page" style={style}><PrintColumn units={right} fields={fields} /><PrintColumn units={left} fields={fields} /></section>;
}

function PrintColumn({ units, fields }: { units: Unit[]; fields: { id: string; label: string }[] }) {
  const cells = units.slice(0, ROWS_PER_COLUMN);
  return <div className="village-print-column"><div className="village-print-header">{fields.map(f => <div key={f.id} className="village-print-title">{f.label}</div>)}</div><div className="village-print-body">
    {cells.map((u, i) => u.type === "letter"
      ? <div className="village-print-row village-print-letter-row" key={`l-${i}-${u.letter}`}><div className="village-print-letter">{u.letter}</div></div>
      : u.type === "group"
        ? <div className="village-print-row village-print-letter-row" key={`g-${i}-${u.label}`}><div className="village-print-letter">{u.label}</div></div>
        : <div className="village-print-row village-print-data" key={u.row.id}>{fields.map(f => <div key={f.id} className={`village-print-cell ${f.id === "village" ? "village-name-cell" : ""}`}>{f.id === "village" ? <AutoFitVillageName value={getDisplayVillage(u.row.village)} maxFontSize={settings.villageFontSize} /> : valueOf(u, f.id)}</div>)}</div>
    )}
    {Array.from({ length: Math.max(0, ROWS_PER_COLUMN - cells.length) }).map((_, i) => <div className="village-print-row village-print-data village-print-empty" key={`e-${i}`}>{fields.map(f => <div key={f.id} />)}</div>)}
  </div></div>;
}

function AutoFitVillageName({ value, maxFontSize }: { value: string; maxFontSize: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const fit = () => {
      const base = parseFloat(getComputedStyle(element).fontSize);
      const min = Math.min(16, base);
      element.style.fontSize = `${base}px`;

      if (element.scrollWidth <= element.clientWidth) {
        setFontSize(null);
        return;
      }

      let size = base;
      while (size > min && element.scrollWidth > element.clientWidth) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, maxFontSize]);

  return <div ref={ref} className="village-auto-fit-name" style={fontSize ? { fontSize: `${fontSize}px` } : undefined}>{value}</div>;
}

function isLegacyField(name: string) {
  const n = name.trim().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌\u200c]/g, " ").replace(/\s+/g, " ");
  return n === "نام روستا و استان" || n === "استان" || n === "روستا و استان" || n === "ردیف";
}

function valueOf(unit: Extract<Unit, { type: "data" }>, id: string) {
  if (id === "number") return unit.number;
  if (id === "village") return getDisplayVillage(unit.row.village);
  if (id === "day") return unit.row.day;
  if (id === "night") return unit.row.night;
  return unit.row.custom[id] ?? "";
}
