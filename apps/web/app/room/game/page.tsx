"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { telegramInitData,
  initTelegram, telegramUser, waitForTelegram } from "../../../lib/telegram";
import { HOKM_VARIANTS, type HokmVariantId } from "@bia-bazi/hokm-engine";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Card = { id: string; suit: Suit; rank: number };
type Player = { id: string; seat: number; displayName: string };
type Game = {
  rules: { playerCount: number; cardsPerPlayer: number; targetScore?: 1 | 3 | 5 | 7; variantId: HokmVariantId };
  players: Player[];
  hokmPlayerId: string;
  hokm?: Suit;
  phase: string;
  hands: Record<string, Card[]>;
  trick: Array<{ playerId: string; card: Card }>;
  lastCompletedTrick: Array<{ playerId: string; card: Card }>;
  turnUnlockAt: number;
  cutUsed: Record<string, boolean>;
  handResultApplied: boolean;
  handWinnerIds: string[];
  handPoints: Record<string, number>;
  tricksWon: Record<string, number>;
  teamTricks: Record<string, number>;
  scores: Record<string, number>;
  teams: Array<{ id: string; playerIds: string[] }>;
  twoPlayerBuild?: {
    stock: Card[];
    discarded: Card[];
    currentPlayer: string;
    kept: Record<string, Card[]>;
    phase: "discard" | "draw";
    drawOptions: Card[];
  };
  turnPlayerId: string;
  leaderId: string;
};

type Payload = {
  room: { status: string; hostId?: string };
  game: Game | null;
  stopAfterOddHand?: boolean;
  chatMessages?: Array<{ id: string; playerId: string; displayName: string; text: string; createdAt: number }>;
  hokmHandHistory?: Array<{
    hand: number;
    hokmPlayerId: string;
    hokm?: Suit;
    winnerIds: string[];
    points: Record<string, number>;
    tricks: Record<string, number>;
    scores: Record<string, number>;
  }>;
  error?: string;
};

const suitMeta: Record<Suit, { symbol: string; name: string }> = {
  spades: { symbol: "♠", name: "پیک" },
  hearts: { symbol: "♥", name: "دل" },
  diamonds: { symbol: "♦", name: "خشت" },
  clubs: { symbol: "♣", name: "گشنیز" }
};

function rankLabel(rank: number) {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

export default function HokmGamePage() {
  const [roomId, setRoomId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [variantInfoOpen, setVariantInfoOpen] = useState(false);
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [sortMode, setSortMode] = useState<"original" | "value" | "suit" | "value_suit">("original");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const fetchWithTimeout = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("ارتباط با سرور بازی بیش از ۱۰ ثانیه طول کشید. اتصال شبکه یا آدرس API را بررسی کنید.");
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    initTelegram();
    void waitForTelegram().then(app => {
      if (cancelled) return;
      setUser(app?.initDataUnsafe?.user ?? telegramUser());
    });
    const queryRoom = new URLSearchParams(window.location.search).get("room") ?? "";
    const startParam =
      new URLSearchParams(window.location.search).get("tgWebAppStartParam") ??
      "";
    const startRoom = startParam.startsWith("room_") ? startParam.slice(5) : "";
    const savedRoom = window.localStorage.getItem("bia-bazi:last-room") ?? "";
    const room = queryRoom || startRoom || savedRoom;
    if (room) window.localStorage.setItem("bia-bazi:last-room", room);
    setRoomId(room);
    setReady(true);
    return () => {
      cancelled = true;
    };
  }, []);

  const playerId = user ? String(user.id) : "";
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);



  const refresh = useCallback(async () => {
    const initData = telegramInitData() ?? "";
    const res = await fetchWithTimeout(`/api/room?room=${encodeURIComponent(roomId)}`, {
      cache: "no-store",
      headers: initData ? { "x-telegram-init-data": initData } : {}
    });
    let json: Payload;
    try {
      json = await res.json();
    } catch {
      throw new Error(`سرور بازی پاسخ قابل‌خواندن برنگرداند (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new Error(json.error || `خطا در دریافت وضعیت بازی (HTTP ${res.status})`);
    setData(json);
    setError("");
  }, [fetchWithTimeout, roomId]);

  useEffect(() => {
    if (!ready || !roomId || !user) return;
    let stopped = false;
    let timer: number | undefined;

    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          await refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "خطا در دریافت بازی");
        }
      }
      if (!stopped) timer = window.setTimeout(poll, document.hidden ? 5000 : 1200);
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
      const res = await fetchWithTimeout(`/api/room?room=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, initData: telegramInitData() ?? "" })
      });
      let json: Payload;
      try {
        json = await res.json();
      } catch {
        throw new Error(`سرور بازی پاسخ قابل‌خواندن برنگرداند (HTTP ${res.status}).`);
      }
      if (!res.ok) throw new Error(json.error || "عملیات ناموفق بود");
      setData(json);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setBusy(false);
    }
  }

  const currentGame = data?.game;
  useEffect(() => {
    if (!currentGame || currentGame.phase !== "hand_finished" || !currentGame.handResultApplied) return;
    const timer = window.setTimeout(() => {
      act({ type: "next_hand" });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [currentGame?.phase, currentGame?.handResultApplied]);
  const me = currentGame?.players.find(p => p.id === playerId);
  const myHand = currentGame?.hands[playerId] ?? [];

  const sortedMyHand = useMemo(() => {
    const hand = [...myHand];
    const suitOrder: Record<Suit, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
    if (sortMode === "value") return hand.sort((a, b) => b.rank - a.rank);
    if (sortMode === "suit") return hand.sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || b.rank - a.rank);
    if (sortMode === "value_suit") return hand.sort((a, b) => b.rank - a.rank || suitOrder[a.suit] - suitOrder[b.suit]);
    return hand;
  }, [myHand, sortMode]);
  const playable = useMemo(() => {
    if (!currentGame || currentGame.phase !== "playing" || currentGame.turnPlayerId !== playerId) {
      return new Set<string>();
    }
    const lead = currentGame.trick[0]?.card.suit;
    if (!lead) return new Set(myHand.map(c => c.id));
    const same = myHand.filter(c => c.suit === lead);
    return new Set((same.length ? same : myHand).map(c => c.id));
  }, [currentGame, myHand, playerId]);

  if (!data || !currentGame) {
    return <main className="shell"><div className="room-panel">در حال بارگذاری بازی...</div>{error && <p className="error">{error}</p>}</main>;
  }

  const game = currentGame;
  const variant = HOKM_VARIANTS[game.rules.variantId] ?? HOKM_VARIANTS.standard;
  const nameOf = (id: string) => game.players.find(p => p.id === id)?.displayName ?? "بازیکن";
  const shortName = (name: string, max = 14) => name.length > max ? name.slice(0, max) + "…" : name;
  const isHost = data?.room.hostId === playerId;
  const isMyTurn = game.turnPlayerId === playerId;
  const turnLocked = game.turnUnlockAt > now;
  const build = game.twoPlayerBuild;
  const mustDiscard = game.phase === "build_two_player_hand" && build?.phase === "discard" && build.currentPlayer === playerId;
  const mustDraw = game.phase === "build_two_player_hand" && build?.phase === "draw" && build.currentPlayer === playerId;
  const discardCount = playerId === game.hokmPlayerId ? 3 : 2;

  async function shareResult() {
    if (!roomId || !currentGame) return;
    try {
      const linkRes = await fetch(`/api/mini-app-link?room=${encodeURIComponent(roomId)}`);
      const linkJson = await linkRes.json();
      if (!linkRes.ok || !linkJson.url) throw new Error("لینک اشتراک‌گذاری آماده نشد");
      const ranking = [...currentGame.players].sort(
        (a, b) => (currentGame.scores[b.id] ?? 0) - (currentGame.scores[a.id] ?? 0)
      );
      const suitNames: Record<Suit, string> = { spades: "♠️ پیک", hearts: "♥️ دل", diamonds: "♦️ خشت", clubs: "♣️ گشنیز" };
      const variantTitle = variant.title;
      const history = data.hokmHandHistory ?? [];
      const handLines = history.map(hand => {
        const winnerNames = hand.winnerIds.map(id => nameOf(id)).join(" و ");
        const points = currentGame.players.map(p => `${nameOf(p.id)}: ${hand.points[p.id] ?? 0}`).join(" | ");
        const tricks = currentGame.players.map(p => `${nameOf(p.id)}: ${hand.tricks[p.id] ?? 0}`).join(" | ");
        return `دست ${hand.hand}: ${hand.hokm ? suitNames[hand.hokm] : "بدون حکم"} · برنده: ${winnerNames} · امتیاز: ${points} · دست‌ها: ${tricks}`;
      });
      const summary = ranking.map((p, i) => `${i + 1}. ${p.displayName} — ${currentGame.scores[p.id] ?? 0} امتیاز · ${currentGame.tricksWon[p.id] ?? 0} دست`).join("\\n");
      const shareText = [
        "🏆 نتیجه نهایی «بیا بازی»",
        "━━━━━━━━━━━━━━",
        "🃏 بازی: حکم",
        `🎯 نوع: ${variantTitle}`,
        `👥 بازیکنان: ${currentGame.players.length} نفره`,
        `📊 هدف: ${currentGame.rules.targetScore ?? 7} امتیاز`,
        "",
        "📋 جدول نهایی",
        summary,
        "",
        "📝 نتیجه دست‌ها",
        ...(handLines.length ? handLines : ["جزئیات دست‌ها ثبت نشده است."]),
        "",
        "━━━━━━━━━━━━━━",
        "🎮 بیا بازی"
      ].join("
");
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(linkJson.url)}&text=${encodeURIComponent(shareText)}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "اشتراک‌گذاری ناموفق بود");
    }
  }

  function toggleCard(card: Card) {
    if (game.phase !== "build_two_player_hand" || !mustDiscard) return;
    setSelected(current => current.includes(card.id)
      ? current.filter(id => id !== card.id)
      : current.length < discardCount ? [...current, card.id] : current);
  }

  return (
    <main className="shell hokm-game">
      <div className="game-navigation">
        <Link className="secondary" href={`/games/${game.rules.variantId === "standard" || game.rules.variantId === "saras" || game.rules.variantId === "naras" || game.rules.variantId === "tak_bresh" ? "hokm" : "hokm"}/learn`}>آموزش</Link>
        <button className="secondary" disabled={busy} onClick={() => router.replace(`/room?room=${encodeURIComponent(roomId)}&from=game`)}>بازگشت به اتاق</button>
        {data.room.status === "playing" && game.phase !== "game_finished" && <button className="secondary danger" disabled={busy} onClick={() => act({ type: "surrender" })}>تسلیم شدن</button>}
        {isHost && data.room.status === "playing" && (
          <button className="secondary danger" disabled={busy} onClick={() => act({ type: "cancel_room" })}>لغو بازی</button>
        )}
      </div>

      <header className="hero">
        <div className="brand-mark">🃏</div>
        <div>
          <div className="eyebrow">HOKM · {game.rules.playerCount} PLAYER · {game.rules.targetScore ?? 7} دور</div>
          <h1>حکم</h1>
          <button className="current-trump" onClick={() => setVariantInfoOpen(true)} aria-label="نمایش توضیحات نوع حکم">
            {game.hokm ? `حکم: ${suitMeta[game.hokm].symbol} ${suitMeta[game.hokm].name}` : variant.hasTrump ? "در انتظار انتخاب حکم" : "بدون خال حکم"}
            <span className="trump-info-icon">ⓘ</span>
          </button>
        </div>
      </header>

      <section className="score-strip">
        {game.players.map(player => (
          <div key={player.id} className={player.id === playerId ? "score-box me" : "score-box"}>
            <span title={player.displayName}>{shortName(player.displayName, 16)}</span>
            <b>{game.scores[player.id] ?? 0}</b>
            <small>{game.tricksWon[player.id] ?? 0} دست</small>
          </div>
        ))}
      </section>

      <section className="table-panel">
        <div className="turn-banner">
          <span>نوبت</span>
          <strong>{nameOf(game.turnPlayerId)}</strong>
          {game.hokm && <em>حکم {suitMeta[game.hokm].symbol}</em>}
        </div>

        {game.phase === "select_hokm" && (
          <div className="action-panel">
            <h2>{game.hokmPlayerId === playerId ? "حکم را انتخاب کنید" : `در انتظار ${nameOf(game.hokmPlayerId)} برای انتخاب حکم`}</h2>
            {game.hokmPlayerId === playerId && (
              <div className="suit-grid">
                {(Object.keys(suitMeta) as Suit[]).map(suit => (
                  <button key={suit} className={suit === "hearts" || suit === "diamonds" ? "suit-button red" : "suit-button"} disabled={busy} onClick={() => act({ type: "choose_hokm", playerId, suit })}>
                    <b>{suitMeta[suit].symbol}</b><span>{suitMeta[suit].name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {game.phase === "build_two_player_hand" && (
          <div className="action-panel">
            <h2>{mustDiscard ? (discardCount === 3 ? "۳ کارت را کنار بگذارید" : "۲ کارت را کنار بگذارید") : mustDraw ? "یکی از دو کارت را انتخاب کنید" : `در انتظار ${nameOf(build?.currentPlayer ?? "")}`}</h2>
            {mustDiscard && <button className="primary wide" disabled={busy || selected.length !== discardCount} onClick={() => act({ type: "discard_two", playerId, cardIds: selected })}>کنار گذاشتن {discardCount} کارت</button>}
            {mustDraw && (
              <>
                <p>دو کارت به شما نشان داده شده؛ فقط یکی را نگه می‌دارید.</p>
                <div className="draw-options">
                  {(build?.drawOptions ?? []).map((card, index) => (
                    <button key={card.id} className="playing-card allowed" disabled={busy} onClick={() => act({ type: "draw_two", playerId, keep: index === 0 })}>
                      <span className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{rankLabel(card.rank)}</span>
                      <b className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{suitMeta[card.suit].symbol}</b>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {game.phase === "select_hokm" && game.hokmPlayerId === playerId && (
          <div className="hand-area">
            <div className="hand-title"><span>۵ کارت اولیه شما</span><small>حکم را فقط بر اساس همین ۵ کارت انتخاب کنید</small></div>
            <div className="cards">
              {myHand.map(card => (
                <div key={card.id} className="playing-card allowed">
                  <span className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{rankLabel(card.rank)}</span>
                  <b className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{suitMeta[card.suit].symbol}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`players-around-table table-${game.players.length}`}>
          <div className="table-center game-center">
            <strong>حکم</strong>
            <small>{game.rules.playerCount} نفره</small>
          </div>
          {[...game.players].sort((a,b) => a.seat - b.seat).map(player => {
            const teamClass = game.players.length === 4
              ? (player.seat % 2 === 0 ? "team-a" : "team-b")
              : game.players.length === 3
                ? ([0,1,2][player.seat] === 0 ? "team-a" : [0,1,2][player.seat] === 1 ? "team-b" : "team-c")
                : "team-a";
            return (
              <div key={player.id} className={`game-seat ${teamClass} ${player.id === game.turnPlayerId ? "active" : ""} ${player.id === playerId ? "mine" : ""}`}>
                <span className="game-seat-number">{player.seat + 1}</span>
                <span>👤</span>
                <strong>{shortName(player.displayName, 11)}</strong>
                <small>{player.id === game.turnPlayerId ? "نوبت" : player.id === playerId ? "شما" : ""}</small>
              </div>
            );
          })}
        </div>

        <div className="trick-table">
          {(game.phase === "hand_finished" || game.phase === "game_finished" || game.phase === "playing") && game.lastCompletedTrick?.length
            ? game.lastCompletedTrick.map(play => (
                <div className="played-card" key={play.playerId}>
                  <small title={nameOf(play.playerId)}>{shortName(nameOf(play.playerId), 10)}</small>
                  <span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "red" : ""}>{suitMeta[play.card.suit].symbol}</span>
                  <b>{rankLabel(play.card.rank)}</b>
                </div>
              ))
            : game.trick.length
              ? game.trick.map(play => (
                  <div className="played-card" key={play.playerId}>
                    <small title={nameOf(play.playerId)}>{shortName(nameOf(play.playerId), 10)}</small>
                    <span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "red" : ""}>{suitMeta[play.card.suit].symbol}</span>
                    <b>{rankLabel(play.card.rank)}</b>
                  </div>
                ))
              : <div className="empty-trick">دست جدید — {game.leaderId === playerId ? "شما شروع می‌کنید" : `${nameOf(game.leaderId)} شروع می‌کند`}</div>}
        </div>

        {data.room.status !== "playing" && data.room.status !== "finished" && (
          <div className="action-panel">
            <h2>{data.room.status === "cancelled" ? "بازی لغو شد" : "اتاق بسته شد"}</h2>
            <p>امکان انجام حرکت جدید در این اتاق وجود ندارد.</p>
          </div>
        )}

        {game.phase === "playing" && data.room.status === "playing" && (
          <div className="hand-area">
            <div className="hand-title"><span>دست شما</span><small>{myHand.length} کارت</small></div>
            <div className="sort-actions">
              <button className={sortMode === "original" ? "mode-chip selected" : "mode-chip"} onClick={() => setSortMode("original")}>اصلی</button>
              <button className={sortMode === "value" ? "mode-chip selected" : "mode-chip"} onClick={() => setSortMode("value")}>ارزش</button>
              <button className={sortMode === "suit" ? "mode-chip selected" : "mode-chip"} onClick={() => setSortMode("suit")}>خال</button>
              <button className={sortMode === "value_suit" ? "mode-chip selected" : "mode-chip"} onClick={() => setSortMode("value_suit")}>ارزش + خال</button>
            </div>
            <div className="cards">
              {sortedMyHand.map(card => {
                const allowed = playable.has(card.id) && !turnLocked;
                const picked = selected.includes(card.id);
                return (
                  <button key={card.id} className={`playing-card ${allowed ? "allowed" : "muted"} ${picked ? "picked" : ""}`} disabled={busy || !allowed} onClick={() => act({ type: "play_card", playerId, cardId: card.id })}>
                    <span className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{rankLabel(card.rank)}</span>
                    <b className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{suitMeta[card.suit].symbol}</b>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {game.phase === "build_two_player_hand" && mustDiscard && (
          <div className="hand-area">
            <div className="hand-title"><span>۵ کارت اولیه</span><small>{selected.length} / {discardCount} انتخاب</small></div>
            <div className="cards">
              {myHand.map(card => (
                <button key={card.id} className={selected.includes(card.id) ? "playing-card allowed picked" : "playing-card allowed"} onClick={() => toggleCard(card)}>
                  <span className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{rankLabel(card.rank)}</span>
                  <b className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{suitMeta[card.suit].symbol}</b>
                </button>
              ))}
            </div>
          </div>
        )}

        {game.phase === "hand_finished" && (
          <div className="action-panel">
            <h2>این دست تمام شد</h2>
            {game.lastCompletedTrick?.length > 0 && <p>آخرین کارت‌های دست قبل نمایش داده می‌شوند. دست بعدی پس از یک ثانیه آماده می‌شود.</p>}
          </div>
        )}


        {game.phase === "playing" && (
          <div className="action-panel room-management">
            <div className="section-title"><h2>مدیریت اتاق</h2><span>{isHost ? "میزبان" : "فقط مشاهده"}</span></div>
            {isHost && (
              <div className="management-actions">
                <button className="secondary" disabled={busy} onClick={() => act({ type: "request_finish" })}>
                  اتمام بازی و ثبت آخرین دست کامل
                </button>
                <button className="secondary danger" disabled={busy} onClick={() => act({ type: "cancel_room" })}>لغو بازی</button>
                <button className="secondary danger" disabled={busy} onClick={() => act({ type: "close_room" })}>بستن اتاق</button>
              </div>
            )}
          </div>
        )}

        <section className="chat-panel">
          <div className="section-title"><h2>گفت‌وگوی بازیکنان</h2><span>{(data.chatMessages ?? []).length} پیام</span></div>
          <div className="chat-messages">
            {(data.chatMessages ?? []).slice(-30).map(msg => (
              <div key={msg.id} className={msg.playerId === playerId ? "chat-message mine" : "chat-message"}>
                <strong title={msg.displayName}>{shortName(msg.displayName, 14)}</strong>
                <span>{msg.text}</span>
              </div>
            ))}
            {!(data.chatMessages ?? []).length && <div className="empty-chat">هنوز پیامی ارسال نشده است.</div>}
          </div>
          <div className="chat-compose">
            <input
              value={message}
              maxLength={300}
              placeholder="پیام برای بازیکنان..."
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && message.trim()) {
                  act({ type: "send_message", text: message.trim() });
                  setMessage("");
                }
              }}
            />
            <button className="primary" disabled={busy || !message.trim()} onClick={() => { act({ type: "send_message", text: message.trim() }); setMessage(""); }}>ارسال</button>
          </div>
        </section>

        {game.phase === "game_finished" && (
          <div className="action-panel">
            <h2>بازی تمام شد</h2>
            <p>نتیجه بازی ثبت شد و امتیاز شما در رتبه‌بندی ذخیره شد.</p>
            <div className="final-results">
              {[...game.players]
                .sort((a, b) => (game.scores[b.id] ?? 0) - (game.scores[a.id] ?? 0))
                .map((player, index) => (
                  <div className="score-box" key={player.id}>
                    <span>{index + 1}. {player.displayName}</span>
                    <b>{game.scores[player.id] ?? 0}</b>
                    <small>{game.tricksWon[player.id] ?? 0} دست</small>
                  </div>
                ))}
            </div>
            <button className="primary wide" disabled={busy} onClick={shareResult}>اشتراک‌گذاری نتیجه در تلگرام</button>
          </div>
        )}
      </section>


      {variantInfoOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setVariantInfoOpen(false)}>
          <section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="hokm-variant-title" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setVariantInfoOpen(false)} aria-label="بستن">×</button>
            <div className="modal-kicker">نوع بازی</div>
            <h2 id="hokm-variant-title">{variant.title}</h2>
            <div className="modal-trump">
              <span>{variant.hasTrump ? "خال حکم" : "خال حکم"}</span>
              <strong>{game.hokm ? `${suitMeta[game.hokm].symbol} ${suitMeta[game.hokm].name}` : "ندارد"}</strong>
            </div>
            <p>{variant.fullDescription}</p>
            {variant.limitedCuts && (
              <div className="modal-note">
                <strong>وضعیت تک‌برش:</strong> هر بازیکن در این دست فقط یک بار می‌تواند با حکم ببُرد.
                <div className="cut-status-list">
                  {game.players.map(player => (
                    <span key={player.id} className={game.cutUsed[player.id] ? "cut-used" : "cut-available"}>
                      {shortName(player.displayName, 12)}: {game.cutUsed[player.id] ? "برش مصرف شده" : "برش باقی است"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button className="primary wide" onClick={() => setVariantInfoOpen(false)}>متوجه شدم</button>
          </section>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!me && <p className="error">شناسه بازیکن فعلی هنوز به تلگرام متصل نشده است.</p>}
    </main>
  );
}
