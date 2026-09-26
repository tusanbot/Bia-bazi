"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initTelegram, telegramUser } from "../../../lib/telegram";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Card = { id: string; suit: Suit; rank: number };
type Player = { id: string; seat: number; displayName: string };
type Game = {
  rules: { playerCount: number; cardsPerPlayer: number };
  players: Player[];
  hokmPlayerId: string;
  hokm?: Suit;
  phase: string;
  hands: Record<string, Card[]>;
  trick: Array<{ playerId: string; card: Card }>;
  lastCompletedTrick: Array<{ playerId: string; card: Card }>;
  turnUnlockAt: number;
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

type Payload = { room: { status: string }; game: Game | null; error?: string };

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
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);

  useEffect(() => {
    initTelegram();
    setUser(telegramUser());
    const queryRoom = new URLSearchParams(window.location.search).get("room") ?? "";
    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ??
      new URLSearchParams(window.location.search).get("tgWebAppStartParam") ??
      "";
    const startRoom = startParam.startsWith("room_") ? startParam.slice(5) : "";
    const savedRoom = window.localStorage.getItem("bia-bazi:last-room") ?? "";
    const room = queryRoom || startRoom || savedRoom;
    if (room) window.localStorage.setItem("bia-bazi:last-room", room);
    setRoomId(room);
    setReady(true);
  }, []);

  const playerId = user ? String(user.id) : "";
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentGame || currentGame.phase !== "hand_finished" || !currentGame.handResultApplied) return;
    const timer = window.setTimeout(() => {
      act({ type: "next_hand" });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [currentGame?.phase, currentGame?.handResultApplied]);


  const refresh = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData ?? "";
    const res = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`, {
      cache: "no-store",
      headers: initData ? { "x-telegram-init-data": initData } : {}
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "خطا در دریافت وضعیت بازی");
    setData(json);
  }, [roomId]);

  useEffect(() => {
    if (!ready || !roomId) return;
    refresh().catch(e => setError(e.message));
    const timer = setInterval(() => refresh().catch(e => setError(e.message)), 1200);
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
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setBusy(false);
    }
  }

  const currentGame = data?.game;
  const me = currentGame?.players.find(p => p.id === playerId);
  const myHand = currentGame?.hands[playerId] ?? [];
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
  const nameOf = (id: string) => game.players.find(p => p.id === id)?.displayName ?? "بازیکن";
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
      const summary = ranking.map((p, i) => `${i + 1}. ${p.displayName} — ${currentGame.scores[p.id] ?? 0}`).join("\n");
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(linkJson.url)}&text=${encodeURIComponent(`نتیجه بازی حکم\n${summary}`) }`;
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
      <header className="hero">
        <div className="brand-mark">🃏</div>
        <div>
          <div className="eyebrow">HOKM · {game.rules.playerCount} PLAYER</div>
          <h1>حکم</h1>
          <p>{game.hokm ? `حکم: ${suitMeta[game.hokm].symbol} ${suitMeta[game.hokm].name}` : "در انتظار انتخاب حکم"}</p>
        </div>
      </header>

      <section className="score-strip">
        {game.players.map(player => (
          <div key={player.id} className={player.id === playerId ? "score-box me" : "score-box"}>
            <span>{player.displayName}</span>
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

        <div className="trick-table">
          {(game.phase === "hand_finished" || game.phase === "game_finished" || game.phase === "playing") && game.lastCompletedTrick?.length
            ? game.lastCompletedTrick.map(play => (
                <div className="played-card" key={play.playerId}>
                  <small>{nameOf(play.playerId)}</small>
                  <span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "red" : ""}>{suitMeta[play.card.suit].symbol}</span>
                  <b>{rankLabel(play.card.rank)}</b>
                </div>
              ))
            : game.trick.length
              ? game.trick.map(play => (
                  <div className="played-card" key={play.playerId}>
                    <small>{nameOf(play.playerId)}</small>
                    <span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "red" : ""}>{suitMeta[play.card.suit].symbol}</span>
                    <b>{rankLabel(play.card.rank)}</b>
                  </div>
                ))
              : <div className="empty-trick">دست جدید — {game.leaderId === playerId ? "شما شروع می‌کنید" : `${nameOf(game.leaderId)} شروع می‌کند`}</div>}
        </div>

        {game.phase === "playing" && (
          <div className="hand-area">
            <div className="hand-title"><span>دست شما</span><small>{myHand.length} کارت</small></div>
            <div className="cards">
              {myHand.map(card => {
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

      {error && <p className="error">{error}</p>}
      {!me && <p className="error">شناسه بازیکن فعلی هنوز به تلگرام متصل نشده است.</p>}
    </main>
  );
}
