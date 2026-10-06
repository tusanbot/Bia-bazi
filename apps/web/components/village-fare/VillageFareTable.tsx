"use client";
import { getDisplayVillage, getVillageGroup, VILLAGE_SPECIAL_MARKER } from "../../lib/village-fare/alphabet";
import type { VillageFareField, VillageFareRow } from "../../lib/village-fare/types";

type Props = {
  rows: VillageFareRow[];
  customFields: VillageFareField[];
  onUpdate: (id: string, patch: Partial<VillageFareRow>) => void;
  onRemove: (id: string) => void;
};

export function VillageFareTable({ rows, customFields, onUpdate, onRemove }: Props) {
  return <div className="village-table-wrap"><table className="village-data-table"><thead><tr>
    <th>ردیف</th><th>روستا</th><th>کرایه روز</th><th>کرایه شب</th>
    {customFields.map(f => <th key={f.id}>{f.name}</th>)}<th>حذف</th>
  </tr></thead><tbody>
    {rows.map((row, index) => <tr key={row.id}>
      <td>{index + 1}</td>
      <EditableCell value={getDisplayVillage(row.village)} onChange={v => onUpdate(row.id, { village: withVillageMarker(row.village, v) })} />
      <EditableCell number value={row.day} onChange={day => onUpdate(row.id, { day })} />
      <EditableCell number value={row.night} onChange={night => onUpdate(row.id, { night })} />
      {customFields.map(f => <EditableCell key={f.id} value={row.custom[f.id] ?? ""} onChange={value => onUpdate(row.id, { custom: { ...row.custom, [f.id]: value } })} />)}
      <td><button className="village-icon-button village-danger" onClick={() => onRemove(row.id)}>🗑️</button></td>
    </tr>)}
    {!rows.length && <tr><td colSpan={5 + customFields.length} className="village-empty-state">هنوز روستایی اضافه نشده است.</td></tr>}
  </tbody></table></div>;
}

function EditableCell({ value, onChange, number }: { value: string; onChange: (value: string) => void; number?: boolean }) {
  const formatFare = (input: string) => {
    const normalized = input.replace(/[٬،,\s]/g, "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    if (!normalized) return "";
    const sign = normalized.startsWith("-") ? "-" : "";
    const digits = normalized.replace(/[^0-9]/g, "");
    return sign + Number(digits || 0).toLocaleString("en-US");
  };
  return <td><input value={value} inputMode={number ? "numeric" : "text"} onChange={e => onChange(number ? formatFare(e.target.value) : e.target.value)} /></td>;
}

function withVillageMarker(original: string, village: string) {
  return getVillageGroup(original) === "misc" ? VILLAGE_SPECIAL_MARKER + village : village;
}
