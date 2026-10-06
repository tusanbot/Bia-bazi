"use client";

import type { TaxiFareField, TaxiFareRow } from "../../lib/taxi-fare/types";

type Props = {
  rows: TaxiFareRow[];
  customFields: TaxiFareField[];
  onUpdate: (id: string, patch: Partial<TaxiFareRow>) => void;
  onRemove: (id: string) => void;
};

export function TaxiFareTable({ rows, customFields, onUpdate, onRemove }: Props) {
  return (
    <div className="taxi-table-wrap">
      <table className="taxi-data-table">
        <thead>
          <tr>
            <th>ردیف</th><th>شهر</th><th>استان</th><th>کرایه روز</th><th>کرایه شب</th>
            {customFields.map((field) => <th key={field.id}>{field.name}</th>)}
            <th>حذف</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <EditableCell value={row.city} onChange={(city) => onUpdate(row.id, { city })} />
              <EditableCell value={row.province} onChange={(province) => onUpdate(row.id, { province })} />
              <EditableCell value={row.day} onChange={(day) => onUpdate(row.id, { day })} />
              <EditableCell value={row.night} onChange={(night) => onUpdate(row.id, { night })} />
              {customFields.map((field) => (
                <EditableCell key={field.id} value={row.custom[field.id] ?? ""} onChange={(value) => onUpdate(row.id, { custom: { ...row.custom, [field.id]: value } })} />
              ))}
              <td><button className="icon-button danger" onClick={() => onRemove(row.id)}>🗑️</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6 + customFields.length} className="empty-state">هنوز شهری اضافه نشده است.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function EditableCell({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <td><input value={value} onChange={(e) => onChange(e.target.value)} /></td>;
}
