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
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);

  useEffect(() => {
    initTelegram();
    setUser(telegramUser());
    const room = new URLSearchParams(window.location.search).get("room") ?? "";
    setRoomId(room);
    setReady(true);
  }, []);

  const playerId = user ? String(user.id) : "";

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
    if (!game || game.phase !== "playing" || game.turnPlayerId !== playerId) return new Set<string>();
    const lead = game.trick[0]?.card.suit;
    if (!lead) return new Set(myHand.map(c => c.id));
    const same = myHand.filter(c => c.suit === lead);
    return new Set((same.length ? same : myHand).map(c => c.id));
  }, [game, myHand, playerId]);

  if (!data || !currentGame) {
    return <main className="shell"><div className="room-panel">در حال بارگذاری بازی...</div>{error && <p className="error">{error}</p>}</main>;
  }

  const game = currentGame;
  const nameOf = (id: string) => game.players.find(p => p.id === id)?.displayName ?? "بازیکن";
  const isMyTurn = game.turnPlayerId === playerId;
  const build = game.twoPlayerBuild;
  const mustDiscard = game.phase === "build_two_player_hand" && build?.phase === "discard" && build.currentPlayer === playerId;
  const mustDraw = game.phase === "build_two_player_hand" && build?.phase === "draw" && build.currentPlayer === playerId;

  function toggleCard(card: Card) {
    if (game.phase !== "build_two_player_hand" || !mustDiscard) return;
    setSelected(current => current.includes(card.id)
      ? current.filter(id => id !== card.id)
      : current.length < 2 ? [...current, card.id] : current);
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
            <h2>{mustDiscard ? "۲ کارت را کنار بگذارید" : mustDraw ? "کارت بکشید" : `در انتظار ${nameOf(build?.currentPlayer ?? "")}`}</h2>
            {mustDiscard && <button className="primary wide" disabled={busy || selected.length !== 2} onClick={() => act({ type: "discard_two", playerId, cardIds: selected })}>کنار گذاشتن ۲ کارت</button>}
            {mustDraw && <div className="draw-actions"><button className="primary" disabled={busy} onClick={() => act({ type: "draw_two", playerId, keep: true })}>بردار</button><button className="secondary" disabled={busy} onClick={() => act({ type: "draw_two", playerId, keep: false })}>رد کن</button></div>}
          </div>
        )}

        <div className="trick-table">
          {game.trick.length ? game.trick.map(play => (
            <div className="played-card" key={play.playerId}><small>{nameOf(play.playerId)}</small><span className={play.card.suit === "hearts" || play.card.suit === "diamonds" ? "red" : ""}>{suitMeta[play.card.suit].symbol}</span><b>{rankLabel(play.card.rank)}</b></div>
          )) : <div className="empty-trick">دست جدید — {game.leaderId === playerId ? "شما شروع می‌کنید" : `${nameOf(game.leaderId)} شروع می‌کند`}</div>}
        </div>

        {game.phase === "playing" && (
          <div className="hand-area">
            <div className="hand-title"><span>دست شما</span><small>{myHand.length} کارت</small></div>
            <div className="cards">
              {myHand.map(card => {
                const allowed = playable.has(card.id);
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
            <div className="hand-title"><span>۵ کارت اولیه</span><small>{selected.length} / ۲ انتخاب</small></div>
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
            <p>دست‌های برده‌شده محاسبه شدند. برای ثبت نتیجه ادامه دهید.</p>
            <button className="primary wide" disabled={busy} onClick={() => act({ type: "finish_hand" })}>ثبت نتیجه دست</button>
          </div>
        )}

        {game.phase === "game_finished" && (
          <div className="action-panel">
            <h2>بازی تمام شد</h2>
            <p>امتیاز نهایی ثبت شده است.</p>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {!me && <p className="error">شناسه بازیکن فعلی هنوز به تلگرام متصل نشده است.</p>}
    </main>
  );
}
