"use client";
import {getDisplayCity} from "../../lib/taxi-fare/alphabet";
import type { TaxiFareField, TaxiFareRow } from "../../lib/taxi-fare/types";

type Props={rows:TaxiFareRow[];customFields:TaxiFareField[];onUpdate:(id:string,patch:Partial<TaxiFareRow>)=>void;onRemove:(id:string)=>void};

export function TaxiFareTable({rows,customFields,onUpdate,onRemove}:Props){
  return <div className="taxi-table-wrap"><table className="taxi-data-table"><thead><tr>
    <th>ردیف</th><th>شهر</th><th>کرایه روز</th><th>کرایه شب</th>
    {customFields.map(f=><th key={f.id}>{f.name}</th>)}<th>حذف</th>
  </tr></thead><tbody>
    {rows.map((row,index)=><tr key={row.id}>
      <td>{index+1}</td>
      <EditableCell value={getDisplayCity(row.city)} onChange={city=>onUpdate(row.id,{city})}/>
      <EditableCell number value={row.day} onChange={day=>onUpdate(row.id,{day})}/>
      <EditableCell number value={row.night} onChange={night=>onUpdate(row.id,{night})}/>
      {customFields.map(f=><EditableCell key={f.id} value={row.custom[f.id]??""} onChange={value=>onUpdate(row.id,{custom:{...row.custom,[f.id]:value}})}/>)}
      <td><button className="icon-button danger" onClick={()=>onRemove(row.id)}>🗑️</button></td>
    </tr>)}
    {!rows.length&&<tr><td colSpan={5+customFields.length} className="empty-state">هنوز شهری اضافه نشده است.</td></tr>}
  </tbody></table></div>;
}
function EditableCell({value,onChange,number}:{value:string;onChange:(value:string)=>void;number?:boolean}){
  const formatFare=(input:string)=>{
    const normalized=input.replace(/[٬،,\\s]/g,"").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    if(!normalized)return "";
    const sign=normalized.startsWith("-")?"-":"";
    const digits=normalized.replace(/[^0-9]/g,"");
    return sign+Number(digits||0).toLocaleString("en-US");
  };
  return <td><input value={value} inputMode={number?"numeric":"text"} onChange={e=>onChange(number?formatFare(e.target.value):e.target.value)}/></td>
}