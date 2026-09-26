"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GameCard } from "../components/GameCard";
import {
  initTelegram,
  telegramChatInstance,
  telegramChatType,
  telegramStartParam,
  telegramUser
} from "../lib/telegram";

export default function Home() {
  const [hokmMode, setHokmMode] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [groupLaunch, setGroupLaunch] = useState(false);
  const router = useRouter();

  useEffect(() => {
    initTelegram();

    const currentUser = telegramUser();
    const startParam = telegramStartParam();
    const chatInstance = telegramChatInstance();
    const chatType = telegramChatType();

    setUser(currentUser);

    // A direct Mini App link opened from a group carries chat_instance.
    // All members of that group therefore resolve to the same deterministic room.
    if (
      currentUser &&
      chatInstance &&
      (chatType === "group" || chatType === "supergroup") &&
      (startParam === "hokm" || startParam === "hokm4")
    ) {
      setGroupLaunch(true);
      setCreating(true);

      const roomId = `group-${chatInstance}-hokm4`;
      const initData = window.Telegram?.WebApp?.initData ?? "";

      fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "create_or_join_group",
          gameId: "hokm",
          playerCount: 4,
          initData
        })
      })
        .then(async res => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "ورود گروهی ناموفق بود");
          router.replace(`/room?room=${encodeURIComponent(json.room.id)}`);
        })
        .catch(e => {
          setError(e instanceof Error ? e.message : "ورود گروهی ناموفق بود");
          setCreating(false);
        });
    }
  }, [router]);

  async function createRoom() {
    if (!user) {
      setError("برای ورود و ساخت بازی، این صفحه را از داخل ربات تلگرام باز کنید.");
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
          host: {
            id: String(user.id),
            displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن",
            username: user.username
          }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ساخت اتاق ناموفق بود");
      router.push(`/room?room=${encodeURIComponent(roomId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setCreating(false);
    }
  }

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن"
    : "ورود با تلگرام";

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🎮</div>
        <div><div className="eyebrow">BIA BAZI</div><h1>بیا بازی</h1><p>بازی‌های چندنفره، مستقیم داخل تلگرام.</p></div>
      </header>

      <section className="profile-card">
        <div className="avatar">👤</div>
        <div><strong>{displayName}</strong><span>{user ? "حساب تلگرام متصل است." : "برای ورود، Mini App را از داخل تلگرام باز کنید."}</span></div>
        <button className="primary" onClick={createRoom}>{user ? "بازی" : "ورود با تلگرام"}</button>
      </section>

      {groupLaunch && !error && (
        <div className="mode-hint">در حال ورود به اتاق حکم گروه...</div>
      )}

      <section>
        <div className="section-title"><h2>بازی‌ها</h2><span>۱ بازی فعال</span></div>
        <GameCard emoji="🃏" title="حکم" subtitle="حکم دو، سه و چهار نفره" meta="۲ تا ۴ بازیکن" playerModes={[2, 3, 4]} selectedMode={hokmMode} onModeChange={setHokmMode} onPlay={createRoom} />
      </section>

      {creating && !groupLaunch && <div className="mode-hint">در حال ساخت اتاق...</div>}
      {error && <div className="error">{error}</div>}
      <div className="mode-hint">حالت انتخاب‌شده: <strong>حکم {hokmMode} نفره</strong></div>

      <section className="stats"><div><b>۰</b><span>بازی</span></div><div><b>۰</b><span>برد</span></div><div><b>۰</b><span>امتیاز</span></div></section>

      <nav className="bottom-nav">
        <Link className="active" href="/">خانه</Link>
        <Link href="/games">بازی‌ها</Link>
        <Link href="/leaderboard">رتبه‌بندی</Link>
        <Link href="/profile">پروفایل</Link>
      </nav>
    </main>
  );
}
