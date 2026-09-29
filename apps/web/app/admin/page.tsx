"use client";

import { useEffect, useState } from "react";

type Tab = "overview" | "rooms" | "users" | "groups" | "games";
const gameNames: Record<string,string> = { hokm:"حکم", scala_quaranta:"اسکالا کوآرانتا", haft_khabis:"هفت خبیث", chahar_barg:"چهار برگ", rock_paper_scissors:"سنگ کاغذ قیچی", shelem:"شلم", tic_tac_toe:"دوز", battleship:"کشتی جنگی", truth_or_dare:"جرأت حقیقت", spy:"جاسوس", backgammon:"نرد" };

async function api(path:string, init?:RequestInit) {
  const res=await fetch(path,{...init,credentials:"same-origin",headers:{"content-type":"application/json",...(init?.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"خطا در ارتباط با پنل");
  return data;
}

export default function AdminPage(){
  const [authenticated,setAuthenticated]=useState<boolean|null>(null),[username,setUsername]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[tab,setTab]=useState<Tab>("overview"),[dashboard,setDashboard]=useState<any>(null),[rooms,setRooms]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[groups,setGroups]=useState<any[]>([]),[games,setGames]=useState<any[]>([]),[roomQuery,setRoomQuery]=useState(""),[userQuery,setUserQuery]=useState(""),[messageText,setMessageText]=useState(""),[messageTarget,setMessageTarget]=useState<{type:"group"|"user",id:string}|null>(null),[busy,setBusy]=useState(false);

  async function check(){try{await api("/admin/api/me");setAuthenticated(true);}catch{setAuthenticated(false);}}
  useEffect(()=>{void check();},[]);

  async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await api("/admin/api/login",{method:"POST",body:JSON.stringify({username,password})});setAuthenticated(true);setPassword("");}catch(e){setError(e instanceof Error?e.message:"ورود ناموفق بود");}finally{setBusy(false);}}
  async function loadDashboard(){try{const [d,r,u,g,ga]=await Promise.all([api("/admin/api/dashboard"),api("/admin/api/rooms"),api("/admin/api/users"),api("/admin/api/groups"),api("/admin/api/games")]);setDashboard(d);setRooms(r.rooms||[]);setUsers(u.users||[]);setGroups(g.groups||[]);setGames(ga.games||[]);}catch(e){setError(e instanceof Error?e.message:"خطا در بارگذاری");}}
  useEffect(()=>{if(authenticated)void loadDashboard();},[authenticated]);

  async function action(type:string,extra:any){
    if(!confirm(type==="room_delete"?"این اتاق و نتایج ثبت‌شده آن حذف می‌شود. ادامه می‌دهید؟":"عملیات انجام شود؟"))return;
    setBusy(true);setError("");try{await api("/admin/api/action",{method:"POST",body:JSON.stringify({type,...extra})});await loadDashboard();}catch(e){setError(e instanceof Error?e.message:"عملیات ناموفق بود");}finally{setBusy(false);}}
  async function sendMessage(){if(!messageTarget||!messageText.trim())return;setBusy(true);setError("");try{await api("/admin/api/action",{method:"POST",body:JSON.stringify({type:messageTarget.type==="group"?"group_message":"user_message",...(messageTarget.type==="group"?{chatId:messageTarget.id}:{userId:messageTarget.id}),text:messageText.trim()})});setMessageText("");setMessageTarget(null);alert("پیام ارسال شد.");}catch(e){setError(e instanceof Error?e.message:"ارسال پیام ناموفق بود");}finally{setBusy(false);}}
  async function logout(){await api("/admin/api/logout",{method:"POST"});setAuthenticated(false);}

  if(authenticated===null)return <main className="admin-shell"><div className="admin-card">در حال بررسی دسترسی...</div></main>;
  if(!authenticated)return <main className="admin-shell"><form className="admin-card admin-login" onSubmit={login}><div className="admin-logo">🎮</div><h1>پنل مدیریت بیا بازی</h1><p>این بخش مستقل از Telegram است.</p><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="نام کاربری" autoComplete="username"/><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="رمز عبور" type="password" autoComplete="current-password"/><button className="primary wide" disabled={busy}>ورود به پنل</button>{error&&<div className="admin-error">{error}</div>}</form></main>;

  const cards=dashboard?[["کاربران",dashboard.users],["کاربران فعال ۳۰ روز",dashboard.activeUsers],["اتاق‌های فعال",dashboard.activeRooms],["بازی‌های انجام‌شده",dashboard.finishedGames],["گروه‌ها",dashboard.groups],["گروه‌های مسدود",dashboard.blockedGroups]]:[];
  return <main className="admin-shell">
    <header className="admin-header"><div><span className="eyebrow">BIA BAZI ADMIN</span><h1>پنل مدیریت</h1><p>مدیریت متمرکز کاربران، اتاق‌ها، بازی‌ها و گروه‌ها</p></div><button className="secondary" onClick={logout}>خروج</button></header>
    <nav className="admin-tabs">{([["overview","داشبورد"],["rooms","اتاق‌ها"],["users","اعضا"],["groups","گروه‌ها"],["games","بازی‌ها"]] as [Tab,string][]).map(x=><button key={x[0]} className={tab===x[0]?"active":""} onClick={()=>setTab(x[0])}>{x[1]}</button>)}</nav>
    {error&&<div className="admin-error">{error}</div>}

    {tab==="overview"&&<section className="admin-grid">{cards.map(([label,value])=><div className="admin-stat" key={String(label)}><span>{String(label)}</span><strong>{String(value)}</strong></div>)}<div className="admin-card admin-wide"><h2>مدیریت مرکزی</h2><p>اتاق‌ها، کاربران، گروه‌ها و آمار بازی‌ها از همین پنل قابل مدیریت هستند.</p></div></section>}

    {tab==="rooms"&&<section className="admin-card"><div className="admin-section-head"><div><h2>اتاق‌های فعال</h2><p>جستجو بر اساس بازی، شماره اتاق، میزبان یا شناسه تلگرام</p></div><button className="secondary" onClick={loadDashboard}>به‌روزرسانی</button></div><div className="admin-search"><input value={roomQuery} onChange={e=>setRoomQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void (async()=>{const d=await api("/admin/api/rooms?q="+encodeURIComponent(roomQuery));setRooms(d.rooms||[]);})();}} placeholder="مثلاً battleship، شماره اتاق یا نام میزبان"/><button className="primary" onClick={async()=>{const d=await api("/admin/api/rooms?q="+encodeURIComponent(roomQuery));setRooms(d.rooms||[]);}}>جستجو</button></div><div className="admin-table-wrap"><table><thead><tr><th>اتاق</th><th>بازی</th><th>میزبان</th><th>بازیکنان</th><th>وضعیت</th><th>گروه</th><th>عملیات</th></tr></thead><tbody>{rooms.map(r=><tr key={r.id}><td><code>{r.id}</code></td><td>{gameNames[r.gameId]||r.gameId}</td><td>{r.hostName}<small>{r.hostId}</small></td><td>{r.currentPlayers} / {r.maxPlayers}</td><td>{r.status==="playing"?"در حال بازی":"منتظر"}</td><td>{r.groupChatId??"—"}</td><td className="actions"><button onClick={()=>action("room_cancel",{roomId:r.id})}>لغو</button><button onClick={()=>action("room_close",{roomId:r.id})}>بستن</button><button className="danger" onClick={()=>action("room_delete",{roomId:r.id})}>حذف</button></td></tr>)}{!rooms.length&&<tr><td colSpan={7}>اتاق فعالی پیدا نشد.</td></tr>}</tbody></table></div></section>}

    {tab==="users"&&<section className="admin-card"><div className="admin-section-head"><div><h2>اعضا</h2><p>کاربرانی که ربات آن‌ها را شناخته یا با بازی تعامل داشته‌اند.</p></div></div><div className="admin-search"><input value={userQuery} onChange={e=>setUserQuery(e.target.value)} placeholder="جستجو با نام، username یا ID"/><button className="primary" onClick={async()=>{const d=await api("/admin/api/users?q="+encodeURIComponent(userQuery));setUsers(d.users||[]);}}>جستجو</button></div><div className="admin-table-wrap"><table><thead><tr><th>کاربر</th><th>ID</th><th>امتیاز</th><th>بازی</th><th>برد</th><th>عملیات</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{[u.firstName,u.lastName].filter(Boolean).join(" ")||u.username||"کاربر"}<small>{u.username?("@"+u.username):""}</small></td><td>{u.id}</td><td>{u.rating??1000}</td><td>{u.gamesPlayed??0}</td><td>{u.wins??0}</td><td><button onClick={()=>setMessageTarget({type:"user",id:String(u.id)})}>ارسال پیام</button></td></tr>)}</tbody></table></div></section>}

    {tab==="groups"&&<section className="admin-card"><div className="admin-section-head"><div><h2>گروه‌ها</h2><p>اعضای کل از Telegram و اعضای فعال از تعاملات مشاهده‌شده محاسبه می‌شوند.</p></div><button className="secondary" onClick={loadDashboard}>به‌روزرسانی</button></div><div className="admin-table-wrap"><table><thead><tr><th>گروه</th><th>Chat ID</th><th>اعضا</th><th>فعال</th><th>بازی</th><th>اتاق فعال</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{groups.map(g=><tr key={g.chatId}><td>{g.title||"بدون عنوان"}<small>{g.username?("@"+g.username):""}</small></td><td>{g.chatId}</td><td>{g.memberCount??"—"}</td><td>{g.activeMembers??0}</td><td>{g.gamesPlayed??0}</td><td>{g.activeRooms??0}</td><td>{g.blocked?"مسدود":"فعال"} · {g.botStatus||"unknown"}</td><td className="actions"><button onClick={()=>setMessageTarget({type:"group",id:String(g.chatId)})}>پیام</button><button onClick={()=>action(g.blocked?"group_unblock":"group_block",{chatId:g.chatId})}>{g.blocked?"رفع مسدودی":"مسدود"}</button><button onClick={()=>action("group_refresh",{chatId:g.chatId})}>تازه‌سازی</button><button className="danger" onClick={()=>action("group_leave",{chatId:g.chatId})}>خروج ربات</button></td></tr>)}</tbody></table></div></section>}

    {tab==="games"&&<section className="admin-card"><div className="admin-section-head"><div><h2>بازی‌ها</h2><p>آمار بر اساس نتایج ذخیره‌شده در D1.</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>بازی</th><th>بازی انجام‌شده</th><th>آخرین بازی</th></tr></thead><tbody>{games.map(g=><tr key={g.gameId}><td>{gameNames[g.gameId]||g.gameId}</td><td>{g.gamesPlayed}</td><td>{g.lastPlayed||"—"}</td></tr>)}</tbody></table></div></section>}

    {messageTarget&&<div className="admin-modal"><div className="admin-card"><button className="modal-close" onClick={()=>setMessageTarget(null)}>×</button><h2>{messageTarget.type==="group"?"ارسال پیام به گروه":"ارسال پیام به کاربر"}</h2><p>مقصد: {messageTarget.id}</p><textarea value={messageText} onChange={e=>setMessageText(e.target.value)} placeholder="متن پیام..." rows={7}/><div className="modal-actions"><button className="secondary" onClick={()=>setMessageTarget(null)}>انصراف</button><button className="primary" disabled={busy||!messageText.trim()} onClick={sendMessage}>ارسال</button></div></div></div>}
  </main>;
}
