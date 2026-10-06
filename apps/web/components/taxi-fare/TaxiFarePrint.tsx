"use client";
import {useMemo} from "react";
import {getInitialLetter} from "../../lib/taxi-fare/alphabet";
import type {TaxiFareField,TaxiFareRow,TaxiFareSettings} from "../../lib/taxi-fare/types";
const ROWS_PER_COLUMN=25,UNITS_PER_PAGE=50;
const PAPER={A4:{w:210,h:297},A3:{w:297,h:420}};
type Unit={type:"letter";letter:string}|{type:"data";row:TaxiFareRow;number:number};
export function TaxiFarePrint({rows,customFields,settings,enabled}:{rows:TaxiFareRow[];customFields:TaxiFareField[];settings:TaxiFareSettings;enabled:boolean}){
 const fields=useMemo(()=>[
  settings.fields.number&&{id:"number",label:"ردیف"},
  settings.fields.city&&{id:"city",label:"شهر"},
  settings.fields.day&&{id:"day",label:"کرایه روز"},
  settings.fields.night&&{id:"night",label:"کرایه شب"},
  ...customFields.filter(f=>f.enabled&&!isLegacyField(f.name)).map(f=>({id:f.id,label:f.name}))
 ].filter(Boolean) as {id:string;label:string}[],[settings.fields,customFields]);
 const units=useMemo<Unit[]>(()=>{const out:Unit[]=[];let last="";rows.forEach((row,index)=>{const letter=getInitialLetter(row.city);if(letter&&letter!==last){out.push({type:"letter",letter});last=letter}out.push({type:"data",row,number:index+1})});return out},[rows]);
 const pages=Array.from({length:Math.max(1,Math.ceil(units.length/UNITS_PER_PAGE))},(_,i)=>units.slice(i*UNITS_PER_PAGE,(i+1)*UNITS_PER_PAGE));
 if(!enabled)return null;
 return <div className={`taxi-print-root paper-${settings.paperSize}`}><style media="print">{`@page{size:${settings.paperSize} portrait;margin:5mm}`}</style>{pages.map((page,i)=><PrintPage key={i} right={page.slice(0,ROWS_PER_COLUMN)} left={page.slice(ROWS_PER_COLUMN)} fields={fields} settings={settings} pageNumber={i+1} total={pages.length}/>)}</div>;
}
function PrintPage({right,left,fields,settings,pageNumber,total}:{right:Unit[];left:Unit[];fields:{id:string;label:string}[];settings:TaxiFareSettings;pageNumber:number;total:number}){
 const size=PAPER[settings.paperSize],rowHeight=(size.h-12)/26;
 const style={width:`${size.w}mm`,height:`${size.h}mm`,["--taxi-row-height" as string]:`${rowHeight}mm`,["--taxi-padding" as string]:`${settings.textPadding}mm`,["--taxi-max-font" as string]:`${settings.maxFontSize}px`,["--taxi-cols" as string]:String(Math.max(1,fields.length))};
 return <section className="taxi-print-page" style={style}><PrintColumn units={right} fields={fields}/><PrintColumn units={left} fields={fields}/>{total>1&&<div className="taxi-print-page-number">صفحه {pageNumber} از {total}</div>}</section>;
}
function PrintColumn({units,fields}:{units:Unit[];fields:{id:string;label:string}[]}){
 const cells=units.slice(0,ROWS_PER_COLUMN);
 return <div className="taxi-print-column"><div className="taxi-print-header">{fields.map(f=><div key={f.id}>{f.label}</div>)}</div><div className="taxi-print-body">
 {cells.map((u,i)=>u.type==="letter"
   ? <div className="taxi-print-row taxi-print-letter-row" key={`l-${i}-${u.letter}`}><div className="taxi-print-letter">{u.letter}</div></div>
   : <div className="taxi-print-row taxi-print-data" key={u.row.id}>{fields.map(f=><div key={f.id} className="taxi-print-cell">{valueOf(u,f.id)}</div>)}</div>
 )}
 {Array.from({length:Math.max(0,ROWS_PER_COLUMN-cells.length)}).map((_,i)=><div className="taxi-print-row taxi-print-data taxi-print-empty" key={`e-${i}`}>{fields.map(f=><div key={f.id}/>)}</div>)}
 </div></div>;
}
function isLegacyField(name:string){
 const n=name.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[‌\u200c]/g," ").replace(/\s+/g," ");
 return n==="نام شهر و استان"||n==="استان"||n==="شهر و استان"||n==="ردیف";
}
function valueOf(unit:Extract<Unit,{type:"data"}>,id:string){if(id==="number")return unit.number;if(id==="city")return unit.row.city;if(id==="day")return unit.row.day;if(id==="night")return unit.row.night;return unit.row.custom[id]??"";}