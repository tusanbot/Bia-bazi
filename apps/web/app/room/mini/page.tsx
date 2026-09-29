
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { initTelegram, telegramUser } from "../../../lib/telegram";

const names:Record<string,string>={haft_khabis:"هفت خبیث",chahar_barg:"۴ برگ",rock_paper_scissors:"سنگ کاغذ قیچی",shelem:"شلم",tic_tac_toe:"دوز",battleship:"کشتی جنگی",truth_or_dare:"جرأت حقیقت",spy:"جاسوس",backgammon:"نرد"};

export default function MiniRoomPage(){
 const router=useRouter(); const [user,setUser]=useState<any>(null); const [room,setRoom]=useState<any>(null); const [game,setGame]=useState<any>(null); const [error,setError]=useState(""); const [text,setText]=useState("");
 useEffect(()=>{initTelegram();setUser(telegramUser());},[]);
 const roomId=useMemo(()=>new URLSearchParams(typeof window==="undefined"?"":window.location.search).get("room")||"",[]);
 const refresh=useCallback(async()=>{if(!roomId)return;const initData=window.Telegram?.WebApp?.initData??"";const r=await fetch("/api/room?room="+encodeURIComponent(roomId),{cache:"no-store",headers:{"x-telegram-init-data":initData}});const j=await r.json();if(!r.ok)throw new Error(j.error||"خطا");setRoom(j.room);setGame(j.game);if(j.room.status!=="playing"&&j.room.status!=="finished")router.replace("/room?room="+encodeURIComponent(roomId));},[roomId,router]);
 useEffect(()=>{if(!user||!roomId)return;let stopped=false;let timer:number|undefined;const poll=async()=>{if(stopped)return;if(!document.hidden){try{await refresh();}catch(e){setError(e instanceof Error?e.message:"خطا در دریافت بازی");}}if(!stopped)timer=window.setTimeout(poll,document.hidden?5000:1200);};void poll();return()=>{stopped=true;if(timer)window.clearTimeout(timer);};},[user,roomId,refresh]);
 async function act(action:any){setError("");try{const r=await fetch("/api/room?room="+encodeURIComponent(roomId),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"mini_action",action,playerId:String(user.id),initData:window.Telegram?.WebApp?.initData??""})});const j=await r.json();if(!r.ok)throw new Error(j.error||"عملیات ناموفق");setRoom(j.room);setGame(j.game);}catch(e){setError(e instanceof Error?e.message:"خطا");}}
 if(!room||!game)return <main className="shell"><div className="room-panel">در حال بارگذاری بازی...</div>{error&&<p className="error">{error}</p>}</main>;
 const id=game.gameId, me=String(user.id), mine=game.hands?.[me]||[], top=game.discard?.at(-1);
 const players=room.players||[];
 const playerName=(pid:string)=>players.find((p:any)=>p.id===pid)?.displayName||"بازیکن";
 return <main className="shell">
  <header className="hero"><div className="brand-mark">🎮</div><div><div className="eyebrow">BIA BAZI</div><h1>{names[id]||id}</h1><p>{players.length} نفره · اتاق {room.id.slice(-6)}</p></div></header>
  {error&&<div className="error">{error}</div>}
  <section className="room-panel">
   <div className="section-title"><h2>{game.phase==="finished"?"پایان بازی":"بازی در حال اجرا"}</h2><span>{game.turnPlayerId?"نوبت "+playerName(game.turnPlayerId):""}</span></div>
   <ScoreBar game={game} players={players}/>
   {id==="tic_tac_toe"&&<TicTac game={game} me={me} act={act}/>}
   {id==="rock_paper_scissors"&&<Rps game={game} me={me} act={act}/>}
   {id==="truth_or_dare"&&<Truth game={game} me={me} act={act}/>}
   {id==="spy"&&<Spy game={game} me={me} players={players} text={text} setText={setText} act={act}/>}
   {id==="battleship"&&<Battleship game={game} me={me} act={act}/>}
   {id==="haft_khabis"&&<Haft game={game} me={me} top={top} act={act}/>}
   {id==="chahar_barg"&&<Chahar game={game} me={me} act={act}/>}
   {id==="shelem"&&<Shelem game={game} me={me} act={act}/>}
   {id==="backgammon"&&<Backgammon game={game} me={me} act={act}/>}
  </section>
 </main>;
}

function ScoreBar({game,players}:any){return <div className="mode-hint">{players.map((p:any)=><span key={p.id} style={{marginLeft:12}}>{p.displayName}: <strong>{game.scores?.[p.id]??0}</strong></span>)}</div>}

function TicTac({game,me,act}:any){return <div className="ttt-grid">{game.board.map((v:any,i:number)=><button key={i} className="mode-chip" disabled={!!v||game.turnPlayerId!==me||game.phase==="finished"} onClick={()=>act({type:"place",cell:i})}>{v||"·"}</button>)}</div>}

function Rps({game,me,act}:any){const icons:any={سنگ:"✊",کاغذ:"✋",قیچی:"✌️"};return <div><div className="rps-actions">{Object.entries(icons).map(([name,icon])=><button className={game.choices?.[me]===name?"rps-choice selected":"rps-choice"} key={name} onClick={()=>act({type:"choose",choice:name})}><span>{icon}</span></button>)}</div><div className="mode-hint">بعد از انتخاب همه بازیکنان، انتخاب‌ها و نتیجه این دور نمایش داده می‌شود.</div>{game.lastRound&&<div className="rps-result"><strong>نتیجه دور {game.lastRound.round}</strong>{game.lastRound.players.map((p:any)=><div key={p.id}>{p.displayName}: {icons[p.choice]||p.choice}</div>)}<b>{game.lastRound.winnerIds.length?"برنده: "+game.lastRound.winnerIds.map((id:string)=>game.players.find((p:any)=>p.id===id)?.displayName).join("، "):"این دور مساوی شد"}</b></div>}</div>}

function Truth({game,me,act}:any){const current=game.currentPlayerId===me;const last=game.prompts?.at(-1);return <div>{last&&<div className="invite-panel"><strong>{last.kind}</strong><span>{last.text}</span></div>}<div className="room-actions"><button className="primary" disabled={!current} onClick={()=>act({type:"choose",kind:"حقیقت"})}>حقیقت</button><button className="secondary" disabled={!current} onClick={()=>act({type:"choose",kind:"جرأت"})}>جرأت</button><button className="mode-chip" disabled={!current} onClick={()=>act({type:"skip"})}>رد کردن</button></div></div>}

function Spy({game,me,players,text,setText,act}:any){return <div><div className="invite-panel"><strong>{game.spyId===me?"شما جاسوس هستید":"نقش شما محرمانه است"}</strong><span>{game.spyId===me?"مکان را پیدا کنید و نقش خود را لو ندهید.":"با سؤال‌های دقیق جاسوس را پیدا کنید."}</span></div><div className="room-actions"><input className="text-input" value={text} onChange={e=>setText(e.target.value)} placeholder="سؤال خود را بنویس..." /><button className="primary" onClick={()=>{act({type:"ask",text});setText("")}}>ارسال سؤال</button></div><div className="room-actions">{players.filter((p:any)=>p.id!==me).map((p:any)=><button className="mode-chip" key={p.id} onClick={()=>act({type:"accuse",playerId:p.id})}>اتهام: {p.displayName}</button>)}<button className="secondary" onClick={()=>act({type:"reveal"})}>افشای جاسوس</button></div><div className="mode-hint">{(game.questions||[]).slice(-8).map((q:any,i:number)=><div key={i}>{q.text}</div>)}</div></div>}

function Battleship({game,me,act}:any){const [start,setStart]=useState<number|null>(null);const [horizontal,setHorizontal]=useState(true);const [len,setLen]=useState(4);const placed=game.boards?.[me]||[];const ready=game.ready?.[me];const preview=start===null?[]:Array.from({length:len},(_,k)=>{const r=Math.floor(start/10),col=start%10;return horizontal?r*10+col+k:(r+k)*10+col}).filter(x=>x>=0&&x<100);return <div>{game.phase==="placement"?<><div className="mode-hint">کشتی‌ها را خودت روی صفحه قرار بده. طول و جهت را انتخاب کن، خانه شروع را بزن و ثبت کن.</div><div className="room-actions">{[4,3,2].map(n=><button key={n} className={len===n?"mode-chip selected":"mode-chip"} onClick={()=>setLen(n)}>کشتی {n}</button>)}<button className="secondary" onClick={()=>setHorizontal(v=>!v)}>{horizontal?"افقی":"عمودی"}</button><button className="primary" disabled={start===null||preview.length!==len} onClick={()=>{act({type:"place_ship",cells:preview});setStart(null)}}>ثبت کشتی</button></div><div className="ship-grid placement-grid">{Array.from({length:100},(_,i)=>{const occupied=placed.includes(i),prev=preview.includes(i);return <button key={i} className={occupied?"ship-cell occupied":prev?"ship-cell preview":"ship-cell"} onClick={()=>setStart(i)}>{occupied?"■":""}</button>})}</div><div className="mode-hint">{ready?"چیدمان شما ثبت شده؛ منتظر بازیکن دیگر هستید.":"کشتی‌های ثبت‌شده: "+(game.shipSizes?.[me]?.length||0)+" از 4"}</div></>:<><div className="mode-hint">برای شلیک، یک خانه از صفحه ۱۰×۱۰ را انتخاب کن.</div><div className="ship-grid">{Array.from({length:100},(_,i)=>{const shot=(game.shots?.[me]||[]).find((x:any)=>x.cell===i);return <button key={i} className={shot?.hit?"ship-cell hit":shot?"ship-cell miss":"ship-cell"} disabled={!!shot||game.turnPlayerId!==me||game.phase==="finished"} onClick={()=>act({type:"fire",cell:i})}>{shot?(shot.hit?"✓":"×"):""}</button>})}</div></>}</div>}

function Haft({game,me,top,act}:any){return <div><div className="invite-panel"><strong>کارت روی زمین: {top?.suit}{top?.rank}</strong><span>{game.special||"هم‌خال یا هم‌عدد بازی کن."}</span></div><div className="room-actions"><button className="secondary" disabled={game.turnPlayerId!==me} onClick={()=>act({type:"draw"})}>برداشتن کارت</button></div><div className="card-hand">{(game.hands?.[me]||[]).map((c:any)=><button className="mode-chip" key={c.id} disabled={game.turnPlayerId!==me} onClick={()=>act({type:"play",cardId:c.id})}>{c.suit}{c.rank}</button>)}</div></div>}

function Chahar({game,me,act}:any){return <div><div className="mode-hint">روی میز: {(game.table||[]).map((c:any)=>c.suit+c.rank).join(" · ")||"خالی"}</div><div className="card-hand">{(game.hands?.[me]||[]).map((c:any)=><button className="mode-chip" key={c.id} disabled={game.turnPlayerId!==me} onClick={()=>act({type:"capture",cardId:c.id})}>{c.suit}{c.rank}</button>)}</div></div>}

function Shelem({game,me,act}:any){const [bid,setBid]=useState(100);return <div><div className="invite-panel"><strong>خوانده فعلی: {game.bidValue}</strong><span>برنده خواندن: {game.bidWinnerId?game.bidWinnerId===me?"شما":"بازیکن دیگر":"—"}</span></div>{game.phase==="bidding"?<div className="room-actions"><input className="text-input" type="number" value={bid} onChange={e=>setBid(Number(e.target.value))}/><button className="primary" disabled={game.turnPlayerId!==me} onClick={()=>act({type:"bid",value:bid})}>ثبت خواندن</button></div>:<button className="primary" onClick={()=>act({type:"finish_round"})}>ثبت پایان دست</button>}</div>}

function Backgammon({game,me,act}:any){return <div><div className="invite-panel"><strong>تاس: {game.dice?.join(" - ")||"—"}</strong><span>نسخه اول بازی با حرکت مستقیم بین خانه‌ها</span></div><button className="primary" disabled={game.turnPlayerId!==me||game.dice?.length>0} onClick={()=>act({type:"roll"})}>ریختن تاس</button><div className="room-actions">{Array.from({length:24},(_,i)=><button key={i} className="mode-chip" disabled={game.turnPlayerId!==me||!game.dice?.length} onClick={()=>{const from=game.points?.[me]?.findIndex((n:number)=>n>0);if(from>=0)act({type:"move",from,to:i})}}>خانه {i+1}</button>)}</div></div>}
