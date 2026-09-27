"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initTelegram, telegramUser } from "../../lib/telegram";

type RankingRow = {
  playerId: number;
  displayName: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    initTelegram();
    const user = telegramUser();
    if (!user) {
      setLoading(false);
      setError("رتبه‌بندی باید از داخل تلگرام مشاهده شود.");
      return;
    }
    const initData = window.Telegram?.WebApp?.initData ?? "";
    fetch("/api/ranking", { headers: { "x-telegram-init-data": initData }, cache: "no-store" })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "دریافت رتبه‌بندی ناموفق بود");
        setRows(json.ranking ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "دریافت رتبه‌بندی ناموفق بود"))
      .finally(() => setLoading(false));
  }, []);

  return <main className="shell">
    <header className="hero"><div className="brand-mark">🏆</div><div><div className="eyebrow">LEADERBOARD</div><h1>رتبه‌بندی</h1><p>امتیاز و عملکرد بازیکنان</p></div></header>

    <section className="room-panel">
      <div className="section-title"><h2>جدول رتبه‌بندی</h2><span>{rows.length ? `${rows.length} بازیکن` : ""}</span></div>
      {loading && <p className="mode-hint">در حال دریافت رتبه‌بندی...</p>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && rows.length === 0 && <p className="mode-hint">هنوز بازی‌ای ثبت نشده است.</p>}
      {!loading && !error && rows.length > 0 && <div className="active-rooms">
        {rows.map((row, index) => <div className="active-room" key={row.playerId}>
          <div className="active-room-icon">{index < 3 ? ["🥇","🥈","🥉"][index] : `#${index + 1}`}</div>
          <div className="active-room-copy">
            <strong>{row.displayName}</strong>
            <span>{row.rating} امتیاز · {row.gamesPlayed} بازی · {row.wins} برد · رکورد {row.bestScore}</span>
          </div>
          <span className="secondary">#{index + 1}</span>
        </div>)}
      </div>}
    </section>

    <nav className="bottom-nav"><Link href="/">خانه</Link><Link href="/games">بازی‌ها</Link><Link className="active" href="/leaderboard">رتبه‌بندی</Link><Link href="/profile">پروفایل</Link></nav>
  </main>;
}