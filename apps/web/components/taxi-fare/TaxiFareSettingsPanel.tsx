"use client";
import type {TaxiFareField,TaxiFareSettings} from "../../lib/taxi-fare/types";
type Props={settings:TaxiFareSettings;customFields:TaxiFareField[];onSettingsChange:(s:TaxiFareSettings)=>void;onAddField:()=>void;onRemoveField:(id:string)=>void;onCustomFieldChange:(id:string,p:Partial<TaxiFareField>)=>void};
export function TaxiFareSettingsPanel({settings,customFields,onSettingsChange,onAddField,onRemoveField,onCustomFieldChange}:Props){
 const set=<K extends keyof TaxiFareSettings>(k:K,v:TaxiFareSettings[K])=>onSettingsChange({...settings,[k]:v});
 return <section className="taxi-settings"><div className="settings-grid">
  <label>اندازه کاغذ<select value={settings.paperSize} onChange={e=>set("paperSize",e.target.value as "A4"|"A3")}><option value="A4">A4 عمودی</option><option value="A3">A3 عمودی</option></select></label>
  <label>حداکثر فونت متن<input type="number" min={10} max={60} value={settings.maxFontSize} onChange={e=>set("maxFontSize",Number(e.target.value)||28)}/></label>
  <label>اندازه عنوان‌ها<input type="number" min={10} max={60} value={settings.titleFontSize} onChange={e=>set("titleFontSize",Number(e.target.value)||28)}/></label>
  <label>فاصله متن از کادر (mm)<input type="number" min={0} max={8} step={.5} value={settings.textPadding} onChange={e=>set("textPadding",Number(e.target.value)||0)}/></label>
 </div><div className="field-toggles"><strong>فیلدهای چاپ:</strong>
  {Object.entries({number:"ردیف",city:"شهر",day:"کرایه روز",night:"کرایه شب"}).map(([id,label])=><label key={id}><input type="checkbox" checked={settings.fields[id as keyof typeof settings.fields]} onChange={e=>onSettingsChange({...settings,fields:{...settings.fields,[id]:e.target.checked}})}/> {label}</label>)}
 </div><div className="custom-fields"><div className="custom-fields-head"><strong>فیلدهای سفارشی</strong><button onClick={onAddField}>➕ افزودن فیلد</button></div>
 {customFields.map(f=><div className="custom-field-row" key={f.id}><input value={f.name} onChange={e=>onCustomFieldChange(f.id,{name:e.target.value})}/><label><input type="checkbox" checked={f.enabled} onChange={e=>onCustomFieldChange(f.id,{enabled:e.target.checked})}/> چاپ شود</label><button className="danger" onClick={()=>onRemoveField(f.id)}>حذف</button></div>)}</div></section>;
}