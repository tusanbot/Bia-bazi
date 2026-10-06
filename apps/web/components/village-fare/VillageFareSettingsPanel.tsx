"use client";
import type { VillageFareField, VillageFareSettings } from "../../lib/village-fare/types";

type Props = {
  settings: VillageFareSettings;
  customFields: VillageFareField[];
  onSettingsChange: (s: VillageFareSettings) => void;
  onAddField: () => void;
  onRemoveField: (id: string) => void;
  onCustomFieldChange: (id: string, p: Partial<VillageFareField>) => void;
};

export function VillageFareSettingsPanel({ settings, customFields, onSettingsChange, onAddField, onRemoveField, onCustomFieldChange }: Props) {
  const set = <K extends keyof VillageFareSettings>(k: K, v: VillageFareSettings[K]) => onSettingsChange({ ...settings, [k]: v });
  return <section className="village-settings"><div className="village-settings-grid">
    <label>اندازه کاغذ<select value={settings.paperSize} onChange={e => set("paperSize", e.target.value as "A4" | "A3")}><option value="A4">A4 عمودی</option><option value="A3">A3 عمودی</option></select></label>
    <label>فونت روستاها<input type="number" min={10} max={60} value={settings.villageFontSize} onChange={e => set("villageFontSize", Number(e.target.value) || 28)} /></label>
    <label>فاصله متن از کادر (mm)<input type="number" min={0} max={8} step={.5} value={settings.textPadding} onChange={e => set("textPadding", Number(e.target.value) || 0)} /></label>
  </div><div className="village-field-toggles"><strong>فیلدهای چاپ:</strong>
    {Object.entries({ number: "ردیف", village: "روستا", day: "کرایه روز", night: "کرایه شب" }).map(([id, label]) =>
      <label key={id}><input type="checkbox" checked={settings.fields[id as keyof typeof settings.fields]} onChange={e => onSettingsChange({ ...settings, fields: { ...settings.fields, [id]: e.target.checked } })} /> {label}</label>
    )}
  </div><div className="village-custom-fields"><div className="village-custom-fields-head"><strong>فیلدهای سفارشی</strong><button onClick={onAddField}>➕ افزودن فیلد</button></div>
    {customFields.map(f => <div className="village-custom-field-row" key={f.id}><input value={f.name} onChange={e => onCustomFieldChange(f.id, { name: e.target.value })} /><label><input type="checkbox" checked={f.enabled} onChange={e => onCustomFieldChange(f.id, { enabled: e.target.checked })} /> چاپ شود</label><button className="village-danger" onClick={() => onRemoveField(f.id)}>حذف</button></div>)}
  </div></section>;
}
