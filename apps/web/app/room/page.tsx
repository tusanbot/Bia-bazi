"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initTelegram, telegramUser, waitForTelegram } from "../../lib/telegram";
import { HOKM_VARIANTS, type HokmVariantId } from "@bia-bazi/hokm-engine";

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
  config: { gameId: string; playerCount: number; minPlayers: number; maxPlayers: number; targetScore?: 1 | 3 | 5 | 7; variantId?: HokmVariantId; autoPlayEnabled?: boolean; autoPlayDelaySeconds?: number };
  players: RoomPlayer[];
};

type Payload = { room: Room; game: unknown | null; error?: string };

export default function RoomPage() {
  const [roomId, setRoomId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [shareState, setShareState] = useState("");
  const [fromGame, setFromGame] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initTelegram();

    void waitForTelegram().then(app => {
      if (cancelled) return;
      setUser(app?.initDataUnsafe?.user ?? telegramUser());
    });

    const queryRoom = new URLSearchParams(window.location.search).get("room") ?? "";
    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ??
      new URLSearchParams(window.location.search).get("tgWebAppStartParam") ??
      "";
    const startRoom = startParam.startsWith("room_") ? startParam.slice(5) : "";
    const savedRoom = window.localStorage.getItem("bia-bazi:last-room") ?? "";
    const room = queryRoom || startRoom || savedRoom;
    setFromGame(new URLSearchParams(window.location.search).get("from") === "game");
    if (room) window.localStorage.setItem("bia-bazi:last-room", room);
    setRoomId(room);
    setReady(true);

    return () => {
      cancelled = true;
    };
  }, []);

  const playerId = user ? String(user.id) : "";
  const displayName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن" : "بازیکن";

  const refresh = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData ?? "";
    const headers: HeadersInit = {};
    if (initData) headers["x-telegram-init-data"] = initData;

    const res = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
      cache: "no-store",
      headers
    });
    const json = await res.json();

    if (!res.ok && res.status === 400 && user) {
      const joinRes = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "join",
          initData,
          player: { id: playerId, displayName, username: user.username }
        })
      });
      const joinJson = await joinRes.json();
      if (joinRes.ok) {
        setData(joinJson);
        return;
      }
      throw new Error(joinJson.error || json.error || "ورود به اتاق ناموفق بود");
    }

    if (!res.ok) throw new Error(json.error || "خطا در دریافت اتاق");
    setData(json);
  }, [roomId, user, playerId, displayName]);

  useEffect(() => {
    if (!ready || !roomId) return;
    fetch(`/api/mini-app-link?room=${encodeURIComponent(roomId)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error()))
      .then(json => setInviteLink(json.url || ""))
      .catch(() => setInviteLink(""));

    let stopped = false;
    let timer: number | undefined;

    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "خطا در دریافت اتاق");
        }
      }
      if (!stopped) timer = window.setTimeout(poll, document.hidden ? 5000 : 2000);
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
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
    if (!fromGame && (data?.room.status === "playing" || data?.room.status === "finished")) {
      const miniGames = ["haft_khabis","chahar_barg","rock_paper_scissors","shelem","tic_tac_toe","battleship","truth_or_dare","spy","backgammon"];
      const target = data.room.config.gameId === "scala_quaranta" ? "/room/scala" : miniGames.includes(data.room.config.gameId) ? "/room/mini" : "/room/game";
      router.replace(target + "?room=" + encodeURIComponent(roomId));
    }
  }, [data?.room.status, data?.room.config.gameId, roomId, router, fromGame]);

  async function shareRoom() {
    if (!inviteLink) return;
    const text = "برای ورود به اتاق حکم، این لینک را باز کن:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "دعوت به اتاق حکم", text, url: inviteLink });
        setShareState("لینک دعوت ارسال شد.");
      } else {
        await navigator.clipboard.writeText(inviteLink);
        setShareState("لینک دعوت کپی شد.");
      }
    } catch {
      // User cancellation is intentionally silent.
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setShareState("لینک دعوت کپی شد.");
  }

  if (!data) {
    return <main className="shell"><div className="room-panel">در حال بارگذاری اتاق...</div>{error && <p className="error">{error}</p>}</main>;
  }

  const { room } = data;
  const isJoined = room.players.some(p => p.id === playerId);
  const isHost = room.hostId === playerId;
  const canChange = room.status === "waiting" && isHost;
  const targetScores = [1, 3, 5, 7] as const;
  const selectedVariant = room.config.gameId === "hokm" ? HOKM_VARIANTS[room.config.variantId ?? "standard"] : null;
  const isScala = room.config.gameId === "scala_quaranta";
  const isHokm = room.config.gameId === "hokm";
  const roomGameNames: Record<string,string> = { hokm:"حکم", scala_quaranta:"SKALA", haft_khabis:"هفت خبیث", chahar_barg:"۴ برگ", rock_paper_scissors:"سنگ کاغذ قیچی", shelem:"شلم", tic_tac_toe:"دوز", battleship:"کشتی جنگی", truth_or_dare:"جرأت حقیقت", spy:"جاسوس", backgammon:"نرد" };
  const playerModes = Array.from({ length: room.config.maxPlayers - room.config.minPlayers + 1 }, (_, i) => room.config.minPlayers + i);
  const seats = Array.from({ length: room.config.playerCount }, (_, i) => i);
  const teamForSeat = (seat: number) => {
    if (room.config.playerCount === 4) return seat % 2 === 0 ? "team-a" : "team-b";
    if (room.config.playerCount === 3) return ["team-a", "team-b", "team-c"][seat] ?? "team-a";
    return "team-a";
  };
  const playerAtSeat = (seat: number) => room.players.find(p => p.seat === seat);
  const autoDelay = room.config.autoPlayDelaySeconds ?? 10;

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark">🃏</div>
        <div>
          <div className="eyebrow">ROOM</div>
          <h1>{isScala ? "اتاق اسکالا کوآرانتا" : isHokm ? "اتاق حکم" : `اتاق ${room.config.gameId}`}</h1>
          <p>{room.config.playerCount} نفره · {isScala ? "۱۰۱ امتیازی" : isHokm ? `${room.config.targetScore ?? 7} دور · ${selectedVariant?.title ?? "استاندارد"}` : "بازی گروهی"} · کد اتاق {room.id.slice(-6)}</p>
        </div>
      </header>

      <div className="room-navigation"><button className="secondary" onClick={() => router.replace("/")}>بازگشت به صفحه اصلی</button></div>

      <section className="room-panel">
        <div className="room-status">
          <span>وضعیت</span>
          <strong>{room.status === "waiting" ? "منتظر بازیکنان" : room.status === "playing" ? "در حال بازی" : room.status}</strong>
        </div>

        <div className="section-title"><h2>بازیکنان</h2><span>{room.players.length} / {room.config.playerCount}</span></div>

        {room.status === "waiting" && (
          <div className="invite-panel">
            <div>
              <strong>دوستت را به بازی دعوت کن</strong>
              <span>با لینک زیر مستقیم وارد همین اتاق می‌شود.</span>
            </div>
            <div className="invite-actions">
              <button className="primary" disabled={!inviteLink} onClick={shareRoom}>دعوت بازیکن</button>
              <button className="secondary" disabled={!inviteLink} onClick={copyInviteLink}>کپی لینک</button>
            </div>
            {shareState && <small>{shareState}</small>}
          </div>
        )}

        <div className={`game-table-preview table-${room.config.playerCount}`}>
          <div className="table-center">
            <strong>{roomGameNames[room.config.gameId] || room.config.gameId}</strong>
            <small>{room.config.playerCount} نفره</small>
          </div>
          {seats.map(seat => {
            const player = playerAtSeat(seat);
            const mine = player?.id === playerId;
            return (
              <button
                key={seat}
                className={`table-seat ${teamForSeat(seat)} ${player ? "occupied" : "empty"} ${mine ? "mine" : ""}`}
                data-seat={seat}
                disabled={!isJoined || room.status !== "waiting" || busy || (!player && false)}
                onClick={() => act({ type: "set_seat", playerId, seat })}
                title={player ? (mine ? "جای شما" : `صندلی بازیکن: ${player.displayName}`) : "انتخاب این صندلی"}
              >
                <span className="seat-number">{seat + 1}</span>
                <span className="seat-avatar">{player ? "👤" : "＋"}</span>
                <strong>{player ? player.displayName : "صندلی خالی"}</strong>
                {player?.id === room.hostId && <small>میزبان</small>}
              </button>
            );
          })}
        </div>
        <div className="team-legend">
          <span className="team-a">تیم ۱</span>
          {room.config.playerCount === 4 && <span className="team-b">تیم ۲</span>}
          {room.config.playerCount === 3 && <span className="team-c">بازیکن ۳</span>}
          <small>برای تغییر یار، صندلی خودتان را انتخاب کنید.</small>
        </div>

        {!user && (
          <div className="error">
            <strong>اتصال تلگرام برقرار نشد.</strong>
            <p>این اتاق باید داخل Mini App تلگرام باز شود؛ باز کردن آدرس مستقیم سایت باعث نبودن initData می‌شود.</p>
            {inviteLink && (
              <a className="primary wide" href={inviteLink}>
                باز کردن اتاق داخل تلگرام
              </a>
            )}
          </div>
        )}

        {user && !isJoined && room.status === "waiting" && (
          <button className="primary wide" disabled={busy} onClick={() => act({ type: "join", player: { id: playerId, displayName } })}>
            ورود به اتاق
          </button>
        )}

        {isHokm && canChange && (
          <div className="room-actions">
            <span>تعداد دورهای بازی:</span>
            {targetScores.map(score => (
              <button
                key={score}
                className={room.config.targetScore === score ? "mode-chip selected" : "mode-chip"}
                disabled={busy}
                onClick={() => act({ type: "set_target_score", targetScore: score })}
              >
                {score} دور
              </button>
            ))}
          </div>
        )}

        {isHokm && canChange && (
          <div className="room-actions variant-actions">
            <span>نوع حکم:</span>
            {Object.values(HOKM_VARIANTS).map(variant => (
              <button
                key={variant.id}
                className={room.config.variantId === variant.id || (!room.config.variantId && variant.id === "standard") ? "mode-chip selected" : "mode-chip"}
                disabled={busy}
                onClick={() => act({ type: "set_variant", variantId: variant.id })}
                title={variant.shortDescription}
              >
                {variant.title}
              </button>
            ))}
            <div className="mode-hint"><strong>{selectedVariant?.title}:</strong> {selectedVariant?.shortDescription}</div>
          </div>
        )}

        {canChange && (
          <div className="auto-play-panel">
            <div>
              <strong>بازی خودکار</strong>
              <small>{room.config.autoPlayEnabled ? `اگر نوبت بازیکنی برسد، بعد از ${autoDelay} ثانیه کارت انتخاب می‌شود.` : "در حالت خاموش، همه حرکت‌ها دستی هستند."}</small>
            </div>
            <button
              className={room.config.autoPlayEnabled ? "mode-chip selected" : "mode-chip"}
              disabled={busy}
              onClick={() => act({ type: "set_auto_play", enabled: !room.config.autoPlayEnabled, delaySeconds: autoDelay })}
            >
              {room.config.autoPlayEnabled ? "روشن" : "خاموش"}
            </button>
            <div className="auto-delay">
              {[5,10,15,20,30,45,60].map(seconds => (
                <button key={seconds} className={autoDelay === seconds ? "mode-chip selected" : "mode-chip"} disabled={busy} onClick={() => act({ type: "set_auto_play", enabled: Boolean(room.config.autoPlayEnabled), delaySeconds: seconds })}>{seconds} ثانیه</button>
              ))}
            </div>
          </div>
        )}

        {canChange && (
          <div className="room-actions">
            <span>تعداد بازیکن:</span>
            {playerModes.map(mode => (
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

        {isJoined && room.status === "waiting" && !isHost && (
          <button
            className="secondary wide"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const res = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ type: "leave", playerId, initData: window.Telegram?.WebApp?.initData ?? "" })
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "خروج از اتاق ناموفق بود");
                window.localStorage.removeItem("bia-bazi:last-room");
                router.replace("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : "خروج از اتاق ناموفق بود");
              } finally {
                setBusy(false);
              }
            }}
          >
            خروج از اتاق
          </button>
        )}

        {isHost && room.status === "waiting" && (
          <div className="host-player-management">
            <strong>مدیریت بازیکنان</strong>
            {room.players.filter(p => p.id !== playerId).map(player => (
              <div key={player.id} className="host-player-row">
                <span>{player.displayName}</span>
                <button className="secondary danger" disabled={busy} onClick={() => act({ type: "remove_player", playerId: player.id })}>حذف</button>
              </div>
            ))}
            {!room.players.some(p => p.id !== playerId) && <small>بازیکن دیگری برای مدیریت وجود ندارد.</small>}
          </div>
        )}

        {isHost && room.status === "waiting" && (
          <div className="management-actions room-waiting-management">
            <button className="secondary danger" disabled={busy} onClick={() => act({ type: "cancel_room" })}>لغو اتاق</button>
            <button className="secondary danger" disabled={busy} onClick={() => act({ type: "close_room" })}>بستن اتاق</button>
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
