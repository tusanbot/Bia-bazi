"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initTelegram, telegramUser } from "../../lib/telegram";

export default function ProfilePage() {
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);

  useEffect(() => { initTelegram(); setUser(telegramUser()); }, []);

  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن" : "";
  return <main className="shell">
    <header className="hero"><div className="brand-mark">👤</div><div><div className="eyebrow">PROFILE</div><h1>پروفایل</h1><p>حساب بازیکن</p></div></header>
    <section className="profile-card"><div className="avatar">👤</div><div><strong>{user ? name : "ورود با تلگرام"}</strong><span>{user ? "حساب تلگرام متصل است." : "این صفحه را از داخل تلگرام باز کنید."}</span></div></section>
    {!user && <div className="error">احراز هویت در نسخه Mini App تلگرام انجام می‌شود.</div>}
    <section className="stats"><div><b>۰</b><span>بازی</span></div><div><b>۰</b><span>برد</span></div><div><b>۰</b><span>امتیاز</span></div></section>
    <nav className="bottom-nav"><Link href="/">خانه</Link><Link href="/games">بازی‌ها</Link><Link href="/leaderboard">رتبه‌بندی</Link><Link className="active" href="/profile">پروفایل</Link></nav>
  </main>;
}
