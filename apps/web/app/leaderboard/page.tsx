"use client";

import Link from "next/link";

export default function LeaderboardPage() {
  return <main className="shell">
    <header className="hero"><div className="brand-mark">🏆</div><div><div className="eyebrow">LEADERBOARD</div><h1>رتبه‌بندی</h1><p>جدول امتیاز بازیکنان</p></div></header>
    <section className="room-panel"><div className="section-title"><h2>رتبه‌بندی</h2><span>به‌زودی</span></div><p className="mode-hint">سیستم امتیاز، رتبه و رکورد بازی‌ها در این بخش نمایش داده می‌شود.</p></section>
    <nav className="bottom-nav"><Link href="/">خانه</Link><Link href="/games">بازی‌ها</Link><Link className="active" href="/leaderboard">رتبه‌بندی</Link><Link href="/profile">پروفایل</Link></nav>
  </main>;
}
