"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "../components/GameCard";
import { initTelegram, telegramUser } from "../lib/telegram";

export default function Home() {
  const [hokmMode, setHokmMode] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const router = useRouter();

  useEffect(() => {
    initTelegram();
    setUser(telegramUser());
  }, []);

  async function createRoom() {
    if (!user) {
      setError("این بازی باید از داخل تلگرام باز شود.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const roomId = crypto.randomUUID();
      const initData = window.Telegram?.WebApp?.initData ?? "";
      const res = await fetch(`/api/room?room=${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "create",
          gameId: "hokm",
          playerCount: hokmMode,
          initData,
          host: { id: String(user.id), displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن", username: user.username }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ساخت اتاق ناموفق بود");
      router.push(`/room?room=${encodeURIComponent(json.room.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setCreating(false);
    }
  }

  const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن" : "ورود با تلگرام";

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🎮</div>
        <div>
          <div className="eyebrow">BIA BAZI</div>
          <h1>بیا بازی</h1>
          <p>بازی‌های چندنفره، مستقیم داخل تلگرام.</p>
        </div>
      </header>

      <section className="profile-card">
        <div className="avatar">👤</div>
        <div>
          <strong>{displayName}</strong>
          <span>{user ? "حساب تلگرام متصل است." : "این صفحه را از داخل تلگرام باز کنید."}</span>
        </div>
        <button className="primary" disabled={!user} onClick={createRoom}>بازی</button>
      </section>

      <section>
        <div className="section-title">
          <h2>بازی‌ها</h2>
          <span>۱ بازی فعال</span>
        </div>
        <GameCard
          emoji="🃏"
          title="حکم"
          subtitle="حکم دو، سه و چهار نفره"
          meta="۲ تا ۴ بازیکن"
          playerModes={[2, 3, 4]}
          selectedMode={hokmMode}
          onModeChange={setHokmMode}
          onPlay={createRoom}
        />
      </section>

      {creating && <div className="mode-hint">در حال ساخت اتاق...</div>}
      {error && <div className="error">{error}</div>}
      <div className="mode-hint">حالت انتخاب‌شده: <strong>حکم {hokmMode} نفره</strong> — قبل از شروع اتاق می‌توان آن را تغییر داد.</div>

      <section className="stats">
        <div><b>۰</b><span>بازی</span></div>
        <div><b>۰</b><span>برد</span></div>
        <div><b>۰</b><span>امتیاز</span></div>
      </section>

      <nav className="bottom-nav">
        <a className="active">خانه</a><a>بازی‌ها</a><a>رتبه‌بندی</a><a>پروفایل</a>
      </nav>
    </main>
  );
}
