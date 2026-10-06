"use client";
import {useMemo} from "react";
import {getDisplayCity,getInitialLetter,getTaxiGroup,normalizePersian} from "../../lib/taxi-fare/alphabet";
import type {TaxiFareField,TaxiFareRow,TaxiFareSettings} from "../../lib/taxi-fare/types";
const ROWS_PER_COLUMN=25,UNITS_PER_PAGE=50;
const PAPER={A4:{w:210,h:297},A3:{w:297,h:420}};
type Unit={type:"letter";letter:string}|{type:"group";label:string}|{type:"data";row:TaxiFareRow;number:number};
export function TaxiFarePrint({rows,customFields,settings,enabled}:{rows:TaxiFareRow[];customFields:TaxiFareField[];settings:TaxiFareSettings;enabled:boolean}){
 const fields=useMemo(()=>[
  settings.fields.number&&{id:"number",label:"ردیف"},
  settings.fields.city&&{id:"city",label:"شهر"},
  settings.fields.day&&{id:"day",label:"کرایه روز"},
  settings.fields.night&&{id:"night",label:"کرایه شب"},
  ...customFields.filter(f=>f.enabled&&!isLegacyField(f.name)).map(f=>({id:f.id,label:f.name}))
 ].filter(Boolean) as {id:string;label:string}[],[settings.fields,customFields]);
 const units=useMemo<Unit[]>(()=>{
  const out:Unit[]=[]; let lastLetter=""; let lastGroup="alphabet";
  const letterGroup=(letter:string)=>{
    if(["ر","ز"].includes(letter)) return "ر-ز";
    if(["ع","غ"].includes(letter)) return "ع-غ";
    if(["ف","ق"].includes(letter)) return "ف-ق";
    if(["گ","ل"].includes(letter)) return "گ-ل";
    if(["و","ه","ی"].includes(letter)) return "و-ی";
    return letter;
  };
  rows.forEach((row,index)=>{
    const group=getTaxiGroup(row.city);
    if(group==="border"||group==="tabriz"){
      if(lastGroup!==group){
        out.push({type:"group",label:group==="border"?"مرز":"تبریز"});
        lastGroup=group; lastLetter="";
      }
    }else{
      if(lastGroup!=="alphabet"){lastGroup="alphabet";lastLetter="";}
      const letter=letterGroup(getInitialLetter(row.city));
      if(letter&&letter!==lastLetter){out.push({type:"letter",letter});lastLetter=letter;}
    }
    out.push({type:"data",row,number:index+1});
  });
  return out;
},[rows]);
 const pages=Array.from({length:Math.max(1,Math.ceil(units.length/UNITS_PER_PAGE))},(_,i)=>units.slice(i*UNITS_PER_PAGE,(i+1)*UNITS_PER_PAGE));
 if(!enabled)return null;
 return <div className={`taxi-print-root paper-${settings.paperSize}`}><style media="print">{`@page{size:${settings.paperSize} portrait;margin:5mm}`}</style>{pages.map((page,i)=><PrintPage key={i} right={page.slice(0,ROWS_PER_COLUMN)} left={page.slice(ROWS_PER_COLUMN)} fields={fields} settings={settings} pageNumber={i+1} total={pages.length}/>)}</div>;
}
function PrintPage({right,left,fields,settings,pageNumber,total}:{right:Unit[];left:Unit[];fields:{id:string;label:string}[];settings:TaxiFareSettings;pageNumber:number;total:number}){
 const size=PAPER[settings.paperSize],rowHeight=(size.h-12)/26;
 const gridTemplate=fields.map(f=>{
  if(f.id==="number")return "1fr";
  if(f.id==="city")return "4fr";
  if(f.id==="day"||f.id==="night")return "2.5fr";
  return "1fr";
 }).join(" ");
 const style={width:`${size.w}mm`,height:`${size.h}mm`,["--taxi-row-height" as string]:`${rowHeight}mm`,["--taxi-padding" as string]:`${settings.textPadding}mm`,["--taxi-max-font" as string]:`${settings.maxFontSize}px`,["--taxi-cols" as string]:String(Math.max(1,fields.length)),["--taxi-grid-template" as string]:gridTemplate};
 return <section className="taxi-print-page" style={style}><PrintColumn units={right} fields={fields}/><PrintColumn units={left} fields={fields}/>{total>1&&<div className="taxi-print-page-number">صفحه {pageNumber} از {total}</div>}</section>;
}
function PrintColumn({units,fields}:{units:Unit[];fields:{id:string;label:string}[]}){
 const cells=units.slice(0,ROWS_PER_COLUMN);
 return <div className="taxi-print-column"><div className="taxi-print-header">{fields.map(f=><div key={f.id}>{f.label}</div>)}</div><div className="taxi-print-body">
 {cells.map((u,i)=>u.type==="letter"
   ? <div className="taxi-print-row taxi-print-letter-row" key={`l-${i}-${u.letter}`}><div className="taxi-print-letter">{u.letter}</div></div>
   : u.type==="group"
     ? <div className="taxi-print-row taxi-print-letter-row" key={`g-${i}-${u.label}`}><div className="taxi-print-letter">{u.label}</div></div>
     : <div className="taxi-print-row taxi-print-data" key={u.row.id}>{fields.map(f=><div key={f.id} className="taxi-print-cell">{valueOf(u,f.id)}</div>)}</div>
 )}
 {Array.from({length:Math.max(0,ROWS_PER_COLUMN-cells.length)}).map((_,i)=><div className="taxi-print-row taxi-print-data taxi-print-empty" key={`e-${i}`}>{fields.map(f=><div key={f.id}/>)}</div>)}
 </div></div>;
}
function isLegacyField(name:string){
 const n=name.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[‌\u200c]/g," ").replace(/\s+/g," ");
 return n==="نام شهر و استان"||n==="استان"||n==="شهر و استان"||n==="ردیف";
}
function valueOf(unit:Extract<Unit,{type:"data"}>,id:string){if(id==="number")return unit.number;if(id==="city")return getDisplayCity(unit.row.city);if(id==="day")return unit.row.day;if(id==="night")return unit.row.night;return unit.row.custom[id]??"";}