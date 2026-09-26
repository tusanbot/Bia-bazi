"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initTelegram, telegramUser } from "../../lib/telegram";

type RoomPlayer = {
  id: string;
  seat: number;
  displayName: string;
  username?: string;
};

type Room = {
  id: string;
  status: "waiting" | "starting" | "playing" | "finished" | "cancelled";
  hostId: string;
  config: { gameId: string; playerCount: number; minPlayers: number; maxPlayers: number };
  players: RoomPlayer[];
};

type Payload = { room: Room; game: unknown | null; error?: string };

const modes = [2, 3, 4];

export default function RoomPage() {
  const [roomId, setRoomId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);

  useEffect(() => {
    initTelegram();
    setUser(telegramUser());
    const room = new URLSearchParams(window.location.search).get("room") ?? "";
    setRoomId(room);
    setReady(true);
  }, []);

  const playerId = user ? String(user.id) : "";
  const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن" : "بازیکن";

  const refresh = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData ?? "";
    const res = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
      cache: "no-store",
      headers: initData ? { "x-telegram-init-data": initData } : {}
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "خطا در دریافت اتاق");
    setData(json);
  }, [roomId]);

  useEffect(() => {
    if (!ready || !roomId) return;
    refresh().catch(e => setError(e.message));
    const timer = setInterval(() => refresh().catch(e => setError(e.message)), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function act(body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, initData: window.Telegram?.WebApp?.initData ?? "" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "عملیات ناموفق بود");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (data?.room.status === "playing") {
      router.replace(`/room/game?room=${encodeURIComponent(roomId)}`);
    }
  }, [data?.room.status, roomId, router]);

  if (!data) {
    return <main className="shell"><div className="room-panel">در حال بارگذاری اتاق...</div>{error && <p className="error">{error}</p>}</main>;
  }

  const { room } = data;
  const isJoined = room.players.some(p => p.id === playerId);
  const isHost = room.hostId === playerId;
  const canChange = room.status === "waiting" && isHost;

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🃏</div>
        <div>
          <div className="eyebrow">ROOM</div>
          <h1>اتاق حکم</h1>
          <p>{room.config.playerCount} نفره · کد اتاق {room.id.slice(-6)}</p>
        </div>
      </header>

      <section className="room-panel">
        <div className="room-status">
          <span>وضعیت</span>
          <strong>{room.status === "waiting" ? "منتظر بازیکنان" : room.status === "playing" ? "در حال بازی" : room.status}</strong>
        </div>

        <div className="section-title"><h2>بازیکنان</h2><span>{room.players.length} / {room.config.playerCount}</span></div>

        <div className="players-list">
          {room.players.map(player => (
            <div className="player-row" key={player.id}>
              <span className="seat">{player.seat + 1}</span>
              <span>{player.displayName}</span>
              {player.id === room.hostId && <small>میزبان</small>}
            </div>
          ))}
        </div>

        {!user && <p className="error">برای ورود به بازی، اتاق را از داخل تلگرام باز کنید.</p>}

        {user && !isJoined && room.status === "waiting" && (
          <button className="primary wide" disabled={busy} onClick={() => act({ type: "join", player: { id: playerId, displayName } })}>
            ورود به اتاق
          </button>
        )}

        {canChange && (
          <div className="room-actions">
            <span>تعداد بازیکن:</span>
            {modes.map(mode => (
              <button
                key={mode}
                className={room.config.playerCount === mode ? "mode-chip selected" : "mode-chip"}
                disabled={busy || room.players.length > mode}
                onClick={() => act({ type: "change_player_count", playerCount: mode })}
              >
                {mode} نفره
              </button>
            ))}
          </div>
        )}

        {isHost && room.status === "waiting" && (
          <button
            className="primary wide"
            disabled={busy || room.players.length !== room.config.playerCount}
            onClick={() => act({ type: "start" })}
          >
            {room.players.length === room.config.playerCount ? "شروع بازی" : "منتظر تکمیل ظرفیت"}
          </button>
        )}

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
