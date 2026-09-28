"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { initTelegram, telegramUser } from "../../../lib/telegram";

const games = [
  {id:"haft_khabis",title:"هفت خبیث",icon:"🃏",players:"۲ تا ۶ نفر",desc:"بازی کارتی سریع با کارت‌های ویژه"},
  {id:"chahar_barg",title:"۴ برگ",icon:"🂠",players:"۲ تا ۴ نفر",desc:"کارت‌بازی ایرانی با جمع‌کردن کارت‌های هم‌رتبه"},
  {id:"rock_paper_scissors",title:"سنگ کاغذ قیچی",icon:"✊",players:"۲ تا ۶ نفر",desc:"مسابقه هم‌زمان، بهترین از ۵ دور"},
  {id:"shelem",title:"شلم",icon:"♠️",players:"۴ نفر",desc:"نسخه چندنفره شلم با سیستم خواندن"},
  {id:"tic_tac_toe",title:"دوز",icon:"⭕",players:"۲ نفر",desc:"دوز کلاسیک سه در سه"},
  {id:"battleship",title:"کشتی جنگی",icon:"🚢",players:"۲ نفر",desc:"ناوگان خودت را بچین و ناوگان حریف را پیدا کن"},
  {id:"truth_or_dare",title:"جرأت حقیقت",icon:"🎯",players:"۲ تا ۲۰ نفر",desc:"بازی گروهی نوبتی با پرسش و چالش"},
  {id:"spy",title:"جاسوس",icon:"🕵️",players:"۳ تا ۱۰ نفر",desc:"یک نفر جاسوس است؛ با سؤال پیدایش کنید"},
  {id:"backgammon",title:"نرد",icon:"🎲",players:"۲ نفر",desc:"نرد دو نفره با تاس و حرکت مهره‌ها"}
] as const;

export default function MiniGamesPage(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{initTelegram();setUser(telegramUser());},[]);
  async function create(game:string){
    if(!user){setError("این صفحه را از داخل ربات تلگرام باز کنید.");return;}
    setBusy(game);setError("");
    try{
      const info=games.find(x=>x.id===game)!;
      const max=game==="truth_or_dare"?8:game==="spy"?6:game==="shelem"?4:game==="tic_tac_toe"||game==="battleship"||game==="backgammon"?2:4;
      const res=await fetch("/api/room?room="+encodeURIComponent(crypto.randomUUID()),{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({type:"create",gameId:game,playerCount:max,initData:window.Telegram?.WebApp?.initData??"",host:{id:String(user.id),displayName:[user.first_name,user.last_name].filter(Boolean).join(" ")||user.username||"بازیکن",username:user.username}})
      });
      const json=await res.json(); if(!res.ok) throw new Error(json.error||"ساخت اتاق ناموفق بود");
      router.push("/room?room="+encodeURIComponent(json.room.id));
    }catch(e){setError(e instanceof Error?e.message:"خطای نامشخص");}finally{setBusy("");}
  }
  return <main className="shell">
    <header className="hero"><div className="brand-mark">🎮</div><div><div className="eyebrow">MINI GAMES</div><h1>بازی‌های بیشتر</h1><p>بازی را انتخاب کن و اتاق بساز.</p></div></header>
    {error&&<div className="error">{error}</div>}
    <section className="games-grid">
      {games.map(g=><article className="game-card" key={g.id}>
        <div className="game-icon">{g.icon}</div><div className="game-copy"><h3>{g.title}</h3><p>{g.desc}</p><small>{g.players}</small></div>
        <button className="play" disabled={busy!==""} onClick={()=>create(g.id)}>{busy===g.id?"در حال ساخت...":"بازی"}</button>
      </article>)}
    </section>
    <nav className="bottom-nav"><Link href="/">خانه</Link><Link className="active" href="/games">بازی‌ها</Link><Link href="/leaderboard">رتبه‌بندی</Link><Link href="/profile">پروفایل</Link></nav>
  </main>;
}
