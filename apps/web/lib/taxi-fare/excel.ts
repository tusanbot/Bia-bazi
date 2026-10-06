import type {TaxiFareField,TaxiFareRow} from "./types";
export type ImportedTaxiFare={rows:TaxiFareRow[];customFields:TaxiFareField[]};
const slug=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-");
export async function importTaxiFareExcel(file:File):Promise<ImportedTaxiFare>{
 const XLSX=await import("xlsx"); const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}); const sh=wb.Sheets[wb.SheetNames[0]];
 const json=XLSX.utils.sheet_to_json<Record<string,unknown>>(sh,{defval:""}); if(!json.length)return{rows:[],customFields:[]};
 const headers=Object.keys(json[0]); const find=(names:string[])=>headers.find(h=>names.includes(h.trim().toLowerCase()));
 const cityKey=find(["شهر","city"]),dayKey=find(["کرایه روز","روز","day","day fare"]),nightKey=find(["کرایه شب","شب","night","night fare"]);
 const fixed=new Set([cityKey,dayKey,nightKey].filter(Boolean)); const normalizeHeader=(name:string)=>name.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/\s+/g," "); const legacy=new Set(["ردیف","استان","نام شهر و استان"]); const customHeaders=headers.filter(h=>!fixed.has(h)&&!legacy.has(normalizeHeader(h)));
 const customFields=customHeaders.map(name=>({id:slug(name)||`field-${Math.random().toString(36).slice(2,8)}`,name,enabled:true}));
 const rows=json.map((item,index)=>({id:`taxi-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,city:String((cityKey&&item[cityKey])??""),day:String((dayKey&&item[dayKey])??""),night:String((nightKey&&item[nightKey])??""),custom:Object.fromEntries(customHeaders.map(h=>[customFields.find(f=>f.name===h)!.id,String(item[h]??"")]))}));
 return{rows,customFields};
}
export async function exportTaxiFareExcel(rows:TaxiFareRow[],customFields:TaxiFareField[]){
 const XLSX=await import("xlsx"); const data=rows.map((r,i)=>({"ردیف":i+1,"شهر":r.city,"کرایه روز":r.day,"کرایه شب":r.night,...Object.fromEntries(customFields.map(f=>[f.name,r.custom[f.id]??""]))}));
 const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"کرایه تاکسی");XLSX.writeFile(wb,"جدول-کرایه-تاکسی.xlsx");
}