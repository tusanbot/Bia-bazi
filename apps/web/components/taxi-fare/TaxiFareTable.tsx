"use client";
import {getDisplayCity,getTaxiGroup,TAXI_SPECIAL_MARKERS} from "../../lib/taxi-fare/alphabet";
import type { TaxiFareField, TaxiFareRow } from "../../lib/taxi-fare/types";

type Props={rows:TaxiFareRow[];customFields:TaxiFareField[];onUpdate:(id:string,patch:Partial<TaxiFareRow>)=>void;onRemove:(id:string)=>void};

export function TaxiFareTable({rows,customFields,onUpdate,onRemove}:Props){
  return <div className="taxi-table-wrap"><table className="taxi-data-table"><thead><tr>
    <th>ردیف</th><th>شهر</th><th>کرایه روز</th><th>کرایه شب</th>
    {customFields.map(f=><th key={f.id}>{f.name}</th>)}<th>حذف</th>
  </tr></thead><tbody>
    {rows.map((row,index)=><tr key={row.id}>
      <td>{index+1}</td>
      <EditableCell value={getDisplayCity(row.city)} fontSize={row.fontSizes?.city} onChange={city=>onUpdate(row.id,{city:withCityMarker(row.city,city)})} onFontSizeChange={fontSize=>updateFontSize(row,"city",fontSize,onUpdate)}/>
      <EditableCell number value={row.day} fontSize={row.fontSizes?.day} onChange={day=>onUpdate(row.id,{day})} onFontSizeChange={fontSize=>updateFontSize(row,"day",fontSize,onUpdate)}/>
      <EditableCell number value={row.night} fontSize={row.fontSizes?.night} onChange={night=>onUpdate(row.id,{night})} onFontSizeChange={fontSize=>updateFontSize(row,"night",fontSize,onUpdate)}/>
      {customFields.map(f=><EditableCell key={f.id} value={row.custom[f.id]??""} fontSize={row.fontSizes?.[f.id]} onChange={value=>onUpdate(row.id,{custom:{...row.custom,[f.id]:value}})} onFontSizeChange={fontSize=>updateFontSize(row,f.id,fontSize,onUpdate)}/>)}
      <td><button className="icon-button danger" onClick={()=>onRemove(row.id)}>🗑️</button></td>
    </tr>)}
    {!rows.length&&<tr><td colSpan={5+customFields.length} className="empty-state">هنوز شهری اضافه نشده است.</td></tr>}
  </tbody></table></div>;
}
function EditableCell({value,onChange,number,fontSize,onFontSizeChange}:{value:string;onChange:(value:string)=>void;number?:boolean;fontSize?:number;onFontSizeChange:(fontSize:number|undefined)=>void}){
  const formatFare=(input:string)=>{
    const normalized=input.replace(/[٬،,\s]/g,"").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    if(!normalized)return "";
    const sign=normalized.startsWith("-")?"-":"";
    const digits=normalized.replace(/[^0-9]/g,"");
    return sign+Number(digits||0).toLocaleString("en-US");
  };
  return <td className="taxi-editable-cell"><div className="taxi-cell-editor">
    <input style={fontSize ? {fontSize:`${fontSize}px`} : undefined} value={value} inputMode={number?"numeric":"text"} onChange={e=>onChange(number?formatFare(e.target.value):e.target.value)}/>
    <button type="button" className="taxi-cell-size-button" title="تغییر اندازه متن" onClick={()=>{
      const current=fontSize??20;
      const next=window.prompt("اندازه فونت این سلول را وارد کنید (۱۰ تا ۶۰):",String(current));
      if(next===null)return;
      const parsed=Number(next);
      if(!Number.isFinite(parsed))return;
      onFontSizeChange(Math.max(10,Math.min(60,Math.round(parsed))));
    }}>Aa</button>
    {fontSize&&<button type="button" className="taxi-cell-size-reset" title="بازگشت به اندازه پیش‌فرض" onClick={()=>onFontSizeChange(undefined)}>↺</button>}
  </div></td>;
}
function updateFontSize(row:TaxiFareRow,fieldId:string,fontSize:number|undefined,onUpdate:Props["onUpdate"]){
  const fontSizes={...(row.fontSizes??{})};
  if(fontSize===undefined)delete fontSizes[fieldId];else fontSizes[fieldId]=fontSize;
  onUpdate(row.id,{fontSizes});
}
function withCityMarker(original:string,city:string){
  const group=getTaxiGroup(original);
  if(group==="border")return TAXI_SPECIAL_MARKERS.border+city;
  if(group==="tabriz")return TAXI_SPECIAL_MARKERS.tabriz+city;
  return city;
}
