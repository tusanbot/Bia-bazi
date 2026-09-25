"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GameCard } from "../components/GameCard";

export default function Home() {
  const [hokmMode, setHokmMode] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function createRoom() {
    setCreating(true);
    setError("");
    try {
      const roomId = crypto.randomUUID();
      const res = await fetch(`/api/room?room=${roomId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "create",
          gameId: "hokm",
          playerCount: hokmMode,
          host: { id: "telegram-user", displayName: "بازیکن" }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ساخت اتاق ناموفق بود");
      router.push(`/room/${json.room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setCreating(false);
    }
  }

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
          <strong>ورود با تلگرام</strong>
          <span>حساب تلگرام شما به‌صورت امن به بازی متصل می‌شود.</span>
        </div>
        <button className="primary">ورود</button>
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
        <a className="active">خانه</a>
        <a>بازی‌ها</a>
        <a>رتبه‌بندی</a>
        <a>پروفایل</a>
      </nav>
    </main>
  );
}