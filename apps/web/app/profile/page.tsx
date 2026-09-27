"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initTelegram, telegramUser } from "../../lib/telegram";

type Profile = {
  displayName: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  bestScore: number;
  rank: number | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    initTelegram();
    const currentUser = telegramUser();
    setUser(currentUser);
    if (!currentUser) return;

    const initData = window.Telegram?.WebApp?.initData ?? "";
    fetch("/api/profile", { headers: { "x-telegram-init-data": initData }, cache: "no-store" })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "دریافت پروفایل ناموفق بود");
        setProfile(json.profile);
      })
      .catch(e => setError(e instanceof Error ? e.message : "دریافت پروفایل ناموفق بود"));
  }, []);

  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن" : "";

  return <main className="shell">
    <header className="hero"><div className="brand-mark">👤</div><div><div className="eyebrow">PROFILE</div><h1>پروفایل</h1><p>آمار، امتیاز و رکوردهای شما</p></div></header>

    <section className="profile-card">
      <div className="avatar">👤</div>
      <div><strong>{user ? name : "ورود با تلگرام"}</strong><span>{user ? "حساب تلگرام متصل است." : "این صفحه را از داخل تلگرام باز کنید."}</span></div>
    </section>

    {!user && <div className="error">احراز هویت در نسخه Mini App تلگرام انجام می‌شود.</div>}
    {error && <div className="error">{error}</div>}

    {profile && <>
      <section className="stats">
        <div><b>{profile.gamesPlayed}</b><span>بازی</span></div>
        <div><b>{profile.wins}</b><span>برد</span></div>
        <div><b>{profile.rating}</b><span>امتیاز</span></div>
      </section>

      <section className="room-panel">
        <div className="section-title"><h2>رکوردها</h2><span>{profile.rank ? `رتبه ${profile.rank}` : "بدون رتبه"}</span></div>
        <div className="stats">
          <div><b>{profile.bestScore}</b><span>بهترین امتیاز بازی</span></div>
          <div><b>{profile.currentStreak}</b><span>برد متوالی</span></div>
          <div><b>{profile.bestStreak}</b><span>بهترین برد متوالی</span></div>
        </div>
        <p className="mode-hint">با هر بازی، نتیجه، امتیاز، رتبه و رکوردهای شما به‌صورت خودکار ثبت می‌شود.</p>
      </section>
    </>}

    <nav className="bottom-nav"><Link href="/">خانه</Link><Link href="/games">بازی‌ها</Link><Link href="/leaderboard">رتبه‌بندی</Link><Link className="active" href="/profile">پروفایل</Link></nav>
  </main>;
}