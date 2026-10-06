import type {TaxiFareField,TaxiFareRow} from "./types";

export type ImportedTaxiFare={rows:TaxiFareRow[];customFields:TaxiFareField[]};

const slug=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-");
const normalize=(v:string)=>v.trim().replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[‌\u200c]/g," ").replace(/\s+/g," ");
const aliases={
 city:new Set(["شهر","city","نام شهر"]),
 day:new Set(["کرایه روز","روز","day","day fare"]),
 night:new Set(["کرایه شب","شب","night","night fare"]),
};

export async function importTaxiFareExcel(file:File):Promise<ImportedTaxiFare>{
 const XLSX=await import("xlsx");
 const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
 const sh=wb.Sheets[wb.SheetNames[0]];
 const matrix=XLSX.utils.sheet_to_json<unknown[]>(sh,{header:1,defval:"",raw:false});
 if(!matrix.length)return{rows:[],customFields:[]};

 const first=matrix.find(row=>Array.isArray(row)&&row.some(cell=>String(cell??"").trim()!=="")) as unknown[]|undefined;
 if(!first)return{rows:[],customFields:[]};

 const headers=first.map(cell=>normalize(String(cell??"")));
 const find=(names:Set<string>)=>headers.findIndex(h=>names.has(h.toLowerCase()));
 const cityIndex=find(aliases.city),dayIndex=find(aliases.day),nightIndex=find(aliases.night);

 const valid=(i:number)=>i>=0;
 const customIndexes=headers.map((name,i)=>({name,index:i})).filter(({name,index})=>
   name!==""&&!valid(index===cityIndex?cityIndex:-1)&&index!==dayIndex&&index!==nightIndex&&
   !new Set(["ردیف","استان","نام شهر و استان","شهر و استان"]).has(name)
 );
 const customFields=customIndexes.map(({name})=>({id:slug(name)||`field-${Math.random().toString(36).slice(2,8)}`,name,enabled:true}));

 const dataRows=matrix.slice(matrix.indexOf(first)+1).filter(row=>Array.isArray(row)&&row.some(cell=>String(cell??"").trim()!==""));
 const rows=dataRows.map((item,index)=>({
   id:`taxi-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`,
   city:valid(cityIndex)?String(item[cityIndex]??""):"",
   day:valid(dayIndex)?String(item[dayIndex]??""):"",
   night:valid(nightIndex)?String(item[nightIndex]??""):"",
   custom:Object.fromEntries(customIndexes.map((entry,j)=>[customFields[j].id,String(item[entry.index]??"")]))
 }));
 return{rows,customFields};
}

export async function exportTaxiFareExcel(rows:TaxiFareRow[],customFields:TaxiFareField[]){
 const XLSX=await import("xlsx");
 const data=rows.map((r,i)=>({"ردیف":i+1,"شهر":r.city,"کرایه روز":r.day,"کرایه شب":r.night,...Object.fromEntries(customFields.map(f=>[f.name,r.custom[f.id]??""]))}));
 const ws=XLSX.utils.json_to_sheet(data);
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,ws,"کرایه تاکسی");
 XLSX.writeFile(wb,"جدول-کرایه-تاکسی.xlsx");
}