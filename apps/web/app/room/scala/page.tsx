"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initTelegramtelegramUser, waitForTelegram } from "../../../lib/telegram";

type Card = { id: string; suit?: "spades" | "hearts" | "diamonds" | "clubs"; rank?: number; joker: boolean };
type Meld = { id: string; type: "set" | "run"; cards: Card[] };
type Player = { id: string; seat: number; displayName?: string; username?: string };
type ScalaGame = {
  players: Player[];
  turnPlayerId: string;
  phase: "playing" | "round_finished" | "match_finished";
  deck: Card[];
  discardPile: Card[];
  hands: Record<string, Card[]>;
  table: Meld[];
  opened: Record<string, boolean>;
  scores: Record<string, number>;
  round: number;
  roundWinnerId?: string;
  lastDraw?: { playerId: string; source: "deck" | "discard"; cardId: string };
};
type Room = { id: string; status: string; hostId: string; config: { gameId: string; playerCount: number; minPlayers: number; maxPlayers: number } };
type Payload = { room: Room; game: ScalaGame | null; chatMessages?: Array<{ id: string; playerId: string; displayName: string; text: string }> ; error?: string };

const suitSymbol: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

function rankLabel(rank?: number) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank ?? "");
}

function cardText(card: Card) {
  return card.joker ? "جوکر" : rankLabel(card.rank) + " " + (card.suit ? suitSymbol[card.suit] : "");
}

export default function ScalaRoomPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [user, setUser] = useState<ReturnType<typeof telegramUser>>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMeld, setSelectedMeld] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initTelegram();
    void waitForTelegram().then(app => {
      if (cancelled) return;
      setUser(app?.initDataUnsafe?.user ?? telegramUser());
    });
    setRoomId(new URLSearchParams(window.location.search).get("room") ?? "");
    return () => {
      cancelled = true;
    };
  }, []);

  const playerId = user ? String(user.id) : "";

  const refresh = useCallback(async () => {
    if (!roomId) return;
    const initData = window.Telegram?.WebApp?.initData ?? "";
    const res = await fetch("/api/room?room=" + encodeURIComponent(roomId), {
      cache: "no-store",
      headers: { "x-telegram-init-data": initData }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "خطا در دریافت بازی");
    setData(json);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    refresh().catch(e => setError(e.message));
    const timer = window.setInterval(() => refresh().catch(e => setError(e.message)), 1200);
    return () => window.clearInterval(timer);
  }, [roomId, refresh]);

  async function act(body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/room?room=" + encodeURIComponent(roomId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, initData: window.Telegram?.WebApp?.initData ?? "" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "عملیات ناموفق بود");
      setData(json);
      if ((body as { type?: string }).type !== "send_message") setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setBusy(false);
    }
  }

  const game = data?.game;
  const myHand = game?.hands[playerId] ?? [];
  const isMyTurn = game?.turnPlayerId === playerId;
  const isOpened = Boolean(game?.opened[playerId]);
  const selectedCards = useMemo(() => myHand.filter(c => selected.includes(c.id)), [myHand, selected]);

  function toggle(cardId: string) {
    if (!isMyTurn || game?.phase !== "playing") return;
    setSelected(current => current.includes(cardId) ? current.filter(id => id !== cardId) : [...current, cardId]);
  }

  if (!data || !game) {
    return <main className="shell"><div className="room-panel">در حال بارگذاری بازی اسکالا کوآرانتا...</div>{error && <p className="error">{error}</p>}</main>;
  }

  const nameOf = (id: string) => game.players.find(p => p.id === id)?.displayName || "بازیکن";
  const shortName = (name: string, max = 13) => name.length > max ? name.slice(0, max) + "…" : name;
  const canLay = isMyTurn && game.phase === "playing" && selected.length >= 3;

  return (
    <main className="shell scala-game">
      <div className="game-navigation">
        <Link className="secondary" href="/games/scala-quaranta/learn">آموزش</Link>
        <button className="secondary" disabled={busy} onClick={() => router.replace("/room?room=" + encodeURIComponent(roomId) + "&from=game")}>بازگشت</button>
        {data.room.hostId === playerId && <button className="secondary danger" disabled={busy} onClick={() => act({ type: "cancel_room" })}>لغو بازی</button>}
      </div>

      <header className="hero">
        <div className="brand-mark">🂡</div>
        <div>
          <div className="eyebrow">SCALA 40 · {game.players.length} PLAYER</div>
          <h1>اسکالا کوآرانتا</h1>
          <p>دور {game.round} · افتتاح حداقل ۴۰ امتیاز · سقف حذف ۱۰۱</p>
        </div>
      </header>

      <section className="score-strip">
        {game.players.map(p => (
          <div className={p.id === playerId ? "score-box me" : "score-box"} key={p.id}>
            <span title={p.displayName}>{shortName(p.displayName || "بازیکن")}</span>
            <b>{game.scores[p.id] ?? 0}</b>
            <small>{game.opened[p.id] ? "باز شده" : "بسته"}</small>
          </div>
        ))}
      </section>

      <section className="table-panel">
        <div className="turn-banner">
          <span>نوبت</span><strong>{nameOf(game.turnPlayerId)}</strong><em>{isMyTurn ? "نوبت شماست" : "منتظر بازیکن"}</em>
        </div>

        <div className="scala-stock">
          <button className="secondary" disabled={busy || !isMyTurn || game.phase !== "playing"} onClick={() => act({ type: "scala_draw_deck", playerId })}>برداشتن از دسته</button>
          <div className="discard-pile"><small>دورریز</small><strong>{game.discardPile.length ? cardText(game.discardPile[game.discardPile.length - 1]) : "—"}</strong></div>
          <button className="secondary" disabled={busy || !isMyTurn || game.phase !== "playing"} onClick={() => act({ type: "scala_draw_discard", playerId })}>برداشتن دورریز</button>
        </div>

        <div className="scala-table">
          <div className="section-title"><h2>روی میز</h2><span>{game.table.length} ترکیب</span></div>
          <div className="meld-grid">
            {game.table.map(meld => (
              <button key={meld.id} className={selectedMeld === meld.id ? "meld selected" : "meld"} onClick={() => setSelectedMeld(meld.id)}>
                <small>{meld.type === "run" ? "ترتیب" : "دسته"}</small>
                <div>{meld.cards.map(card => <span key={card.id}>{cardText(card)}</span>)}</div>
              </button>
            ))}
            {!game.table.length && <div className="empty-trick">هنوز ترکیبی روی میز نیست.</div>}
          </div>
        </div>

        {isMyTurn && game.phase === "playing" && (
          <div className="action-panel">
            <h2>{isOpened ? "حرکت خود را انجام دهید" : "برای افتتاح حداقل ۴۰ امتیاز لازم است"}</h2>
            <p>{selected.length ? selected.length + " کارت انتخاب شده" : "کارت‌ها را انتخاب کنید."}</p>
            <div className="management-actions">
              <button className="primary" disabled={busy || !canLay} onClick={() => act({ type: "scala_lay_melds", playerId, melds: [{ id: "meld-" + Date.now(), type: "run", cards: selectedCards }] })}>ترتیب</button>
              <button className="secondary" disabled={busy || !canLay} onClick={() => act({ type: "scala_lay_melds", playerId, melds: [{ id: "meld-" + Date.now(), type: "set", cards: selectedCards }] })}>دسته</button>
              {selectedMeld && selected.length === 1 && <button className="secondary" disabled={busy} onClick={() => act({ type: "scala_add_card", playerId, meldId: selectedMeld, cardId: selected[0] })}>افزودن به ترکیب</button>}
              {selectedMeld && selected.length === 1 && <button className="secondary" disabled={busy} onClick={() => act({ type: "scala_replace_joker", playerId, meldId: selectedMeld, cardId: selected[0] })}>جایگزینی جوکر</button>}
              <button className="secondary danger" disabled={busy || selected.length !== 1} onClick={() => act({ type: "scala_discard", playerId, cardId: selected[0] })}>دور انداختن</button>
            </div>
          </div>
        )}

        <div className="hand-area">
          <div className="hand-title"><span>دست شما</span><small>{myHand.length} کارت</small></div>
          <div className="cards">
            {myHand.map(card => (
              <button key={card.id} className={selected.includes(card.id) ? "playing-card allowed picked" : "playing-card allowed"} disabled={busy || !isMyTurn || game.phase !== "playing"} onClick={() => toggle(card.id)}>
                <span className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{card.joker ? "J" : rankLabel(card.rank)}</span>
                <b className={card.suit === "hearts" || card.suit === "diamonds" ? "red" : ""}>{card.joker ? "🃏" : suitSymbol[card.suit!]}</b>
              </button>
            ))}
          </div>
        </div>

        {game.phase === "round_finished" && (
          <div className="action-panel">
            <h2>دور {game.round} تمام شد</h2>
            <p>برنده این دور: {nameOf(game.roundWinnerId || "")}</p>
            <button className="primary wide" disabled={busy} onClick={() => act({ type: "scala_next_round" })}>شروع دور بعد</button>
          </div>
        )}

        {game.phase === "match_finished" && (
          <div className="action-panel">
            <h2>بازی تمام شد</h2><p>نتیجه نهایی بر اساس کمترین امتیاز ثبت شد.</p>
            <div className="final-results">
              {[...game.players].sort((a,b) => (game.scores[a.id] ?? 0) - (game.scores[b.id] ?? 0)).map((p,i) => (
                <div className="score-box" key={p.id}><span>{i+1}. {p.displayName}</span><b>{game.scores[p.id] ?? 0}</b><small>امتیاز</small></div>
              ))}
            </div>
          </div>
        )}

        <section className="chat-panel">
          <div className="section-title"><h2>گفت‌وگوی بازیکنان</h2><span>{(data.chatMessages ?? []).length} پیام</span></div>
          <div className="chat-messages">{(data.chatMessages ?? []).slice(-20).map(msg => <div className={msg.playerId === playerId ? "chat-message mine" : "chat-message"} key={msg.id}><strong>{shortName(msg.displayName)}</strong><span>{msg.text}</span></div>)}</div>
          <div className="chat-compose">
            <input value={message} maxLength={300} placeholder="پیام..." onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && message.trim()) { act({ type: "send_message", text: message.trim() }); setMessage(""); } }} />
            <button className="primary" disabled={busy || !message.trim()} onClick={() => { act({ type: "send_message", text: message.trim() }); setMessage(""); }}>ارسال</button>
          </div>
        </section>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
