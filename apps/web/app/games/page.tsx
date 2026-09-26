"use client";

import Link from "next/link";

export default function GamesPage() {
  return <main className="shell">
    <header className="hero"><div className="brand-mark">🎮</div><div><div className="eyebrow">GAMES</div><h1>بازی‌ها</h1><p>بازی موردنظر را انتخاب کنید.</p></div></header>
    <section className="game-card">
      <div className="game-icon">🃏</div><div className="game-copy"><h3>حکم</h3><p>حکم دو، سه و چهار نفره</p><small>۲ تا ۴ بازیکن</small></div>
      <Link className="play" href="/?game=hokm">انتخاب</Link>
    </section>
    <nav className="bottom-nav"><Link href="/">خانه</Link><Link className="active" href="/games">بازی‌ها</Link><Link href="/leaderboard">رتبه‌بندی</Link><Link href="/profile">پروفایل</Link></nav>
  </main>;
}
