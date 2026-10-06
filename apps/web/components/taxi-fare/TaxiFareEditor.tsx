"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {importTaxiFareExcel,exportTaxiFareExcel} from "../../lib/taxi-fare/excel";
import {saveTaxiFareState,loadTaxiFareState,clearTaxiFareState} from "../../lib/taxi-fare/storage";
import {sortTaxiRows} from "../../lib/taxi-fare/alphabet";
import {DEFAULT_TAXI_FARE_SETTINGS,TaxiFareField,TaxiFareRow,TaxiFareSettings} from "../../lib/taxi-fare/types";
import {TaxiFareTable} from "./TaxiFareTable"; import {TaxiFareSettingsPanel} from "./TaxiFareSettingsPanel"; import {TaxiFarePrint} from "./TaxiFarePrint";
const newRow=():TaxiFareRow=>({id:`taxi-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,city:"",day:"",night:"",custom:{}});
export function TaxiFareEditor(){
 const[rows,setRows]=useState<TaxiFareRow[]>([]),[customFields,setCustomFields]=useState<TaxiFareField[]>([]),[settings,setSettings]=useState<TaxiFareSettings>(DEFAULT_TAXI_FARE_SETTINGS),[loaded,setLoaded]=useState(false),[showSettings,setShowSettings]=useState(false),[printing,setPrinting]=useState(false); const fileRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{const s=loadTaxiFareState();if(s){const normalize=(name:string)=>name.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[‌\u200c]/g," ").replace(/\s+/g," ");const blocked=new Set(["ردیف","استان","نام شهر و استان","شهر و استان"]);const cleanFields=s.customFields.filter(f=>!blocked.has(normalize(f.name)));const allowed=new Set(cleanFields.map(f=>f.id));setRows(s.rows.map(r=>({id:r.id,city:r.city,day:r.day,night:r.night,custom:Object.fromEntries(Object.entries(r.custom||{}).filter(([id])=>allowed.has(id)))})));setCustomFields(cleanFields);setSettings({...s.settings,fields:{number:s.settings.fields.number,city:s.settings.fields.city,day:s.settings.fields.day,night:s.settings.fields.night}})}setLoaded(true)},[]);
 useEffect(()=>{if(loaded)saveTaxiFareState({rows,customFields,settings})},[rows,customFields,settings,loaded]);
 const sortedRows=useMemo(()=>sortTaxiRows(rows),[rows]);
 const updateRow=(id:string,patch:Partial<TaxiFareRow>)=>setRows(c=>c.map(r=>r.id===id?{...r,...patch}:r));
 const addRow=()=>setRows(c=>[...c,newRow()]); const removeRow=(id:string)=>setRows(c=>c.filter(r=>r.id!==id));
 const addField=()=>{const name=window.prompt("نام فیلد جدید را وارد کنید:");if(!name?.trim())return;setCustomFields(c=>[...c,{id:`custom-${Date.now()}`,name:name.trim(),enabled:true}])};
 const removeField=(id:string)=>{setCustomFields(c=>c.filter(f=>f.id!==id));setRows(c=>c.map(r=>{const custom={...r.custom};delete custom[id];return{...r,custom}}))};
 const importExcel=async(file?:File)=>{if(!file)return;try{const x=await importTaxiFareExcel(file);setRows(x.rows);setCustomFields(x.customFields)}catch(e){console.error(e);alert("خواندن فایل Excel انجام نشد.")}finally{if(fileRef.current)fileRef.current.value=""}};
 const print=()=>{setPrinting(true);window.setTimeout(()=>{window.print();window.setTimeout(()=>setPrinting(false),300)},80)};
 const reset=()=>{if(!confirm("همه اطلاعات جدول حذف شود؟"))return;clearTaxiFareState();setRows([]);setCustomFields([]);setSettings(DEFAULT_TAXI_FARE_SETTINGS)};
 return <main className="taxi-fare-page" dir="rtl"><header className="taxi-fare-title"><div><span className="taxi-fare-eyebrow">ابزار جدول‌ساز</span><h1>جدول کرایه تاکسی</h1><p>ورود اطلاعات، ویرایش مستقیم، تنظیم چاپ و خروجی Excel</p></div><div className="taxi-fare-actions"><button onClick={addRow}>➕ شهر جدید</button><button onClick={()=>fileRef.current?.click()}>📥 ورود Excel</button><button onClick={()=>exportTaxiFareExcel(rows,customFields)}>📤 خروجی Excel</button><button onClick={()=>setShowSettings(v=>!v)}>⚙️ تنظیمات چاپ</button><button className="primary" onClick={print}>🖨️ چاپ / PDF</button><button className="danger" onClick={reset}>پاک‌سازی</button><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>importExcel(e.target.files?.[0])}/></div></header>
 {showSettings&&<TaxiFareSettingsPanel settings={settings} customFields={customFields} onSettingsChange={setSettings} onAddField={addField} onRemoveField={removeField} onCustomFieldChange={(id,p)=>setCustomFields(items=>items.map(f=>f.id===id?{...f,...p}:f))}/>}
 <section className="taxi-fare-card"><div className="taxi-fare-card-head"><div><strong>{rows.length}</strong> شهر</div><span>برای ویرایش، روی هر خانه کلیک کنید.</span></div><TaxiFareTable rows={sortedRows} customFields={customFields} onUpdate={updateRow} onRemove={removeRow}/></section>
 <TaxiFarePrint rows={sortedRows} customFields={customFields} settings={settings} enabled={printing}/></main>;
}