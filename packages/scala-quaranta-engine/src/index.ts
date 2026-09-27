import type { GamePlayer, PlayerId } from "@bia-bazi/game-engine";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Card = {
  id: string;
  suit?: Suit;
  rank?: Rank;
  joker: boolean;
};

export type MeldType = "set" | "run";
export type Meld = {
  id: string;
  type: MeldType;
  cards: Card[];
};

export type Phase = "playing" | "round_finished" | "match_finished";

export interface ScalaRules {
  minPlayers: 2;
  maxPlayers: 6;
  initialCards: 13;
  openingPoints: 40;
  matchLimit: 101;
  jokers: 4;
  decks: 2;
  maxJokersPerMeld: 1;
  allowJokerInOpening: boolean;
  requireFinalDiscard: true;
}

export const SCALA_RULES: ScalaRules = {
  minPlayers: 2,
  maxPlayers: 6,
  initialCards: 13,
  openingPoints: 40,
  matchLimit: 101,
  jokers: 4,
  decks: 2,
  maxJokersPerMeld: 1,
  allowJokerInOpening: true,
  requireFinalDiscard: true
};

export interface ScalaState {
  rules: ScalaRules;
  players: GamePlayer[];
  dealerId: PlayerId;
  turnPlayerId: PlayerId;
  phase: Phase;
  deck: Card[];
  discardPile: Card[];
  hands: Record<PlayerId, Card[]>;
  table: Meld[];
  opened: Record<PlayerId, boolean>;
  scores: Record<PlayerId, number>;
  round: number;
  roundWinnerId?: PlayerId;
  lastDraw?: { playerId: PlayerId; source: "deck" | "discard"; cardId: string };
  lastDiscard?: { playerId: PlayerId; cardId: string };
  turnStartedAt: number;
  hasTakenTurn: Record<PlayerId, boolean>;
}

const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const ranks: Rank[] = [1,2,3,4,5,6,7,8,9,10,11,12,13];

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < SCALA_RULES.decks; deck++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push({ id: `d${deck}-${suit}-${rank}`, suit, rank, joker: false });
      }
    }
  }
  for (let i = 0; i < SCALA_RULES.jokers; i++) {
    cards.push({ id: `joker-${i}`, joker: true });
  }
  return cards;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nextPlayer(players: GamePlayer[], id: PlayerId): PlayerId {
  const index = players.findIndex(p => p.id === id);
  if (index < 0) throw new Error("Unknown player");
  return players[(index + 1) % players.length].id;
}

export function cardValue(card: Card, aceHigh = true): number {
  if (card.joker) return 25;
  if (!card.rank) throw new Error("Invalid card");
  if (card.rank === 1) return aceHigh ? 11 : 1;
  return card.rank >= 11 ? 10 : card.rank;
}

function naturalKey(card: Card) {
  return card.joker ? "joker" : `${card.suit}-${card.rank}`;
}

export function validateMeld(meld: Meld, rules = SCALA_RULES): boolean {
  if (meld.cards.length < 3) return false;
  const jokers = meld.cards.filter(c => c.joker).length;
  if (jokers > rules.maxJokersPerMeld) return false;

  if (meld.type === "set") {
    const natural = meld.cards.filter(c => !c.joker);
    if (!natural.length) return false;
    const rank = natural[0].rank;
    if (!rank || natural.some(c => c.rank !== rank || !c.suit)) return false;
    const suitsSeen = new Set<Suit>();
    for (const card of natural) {
      if (!card.suit || suitsSeen.has(card.suit)) return false;
      suitsSeen.add(card.suit);
    }
    return natural.length + jokers <= 4;
  }

  const natural = meld.cards.filter(c => !c.joker);
  if (!natural.length || natural.some(c => !c.suit || !c.rank)) return false;
  const suit = natural[0].suit!;
  if (natural.some(c => c.suit !== suit)) return false;

  const ranks = natural.map(c => c.rank!);
  if (new Set(ranks).size !== ranks.length) return false;

  // Legal runs are ordinary consecutive sequences (A-2-3 through Q-K-A).
  // Ace may be low or high, but it cannot bridge K and 2.
  const candidateSequences: number[][] = [];
  for (let start = 1; start <= 11; start++) {
    for (let length = 3; length <= 14 - start; length++) {
      candidateSequences.push(Array.from({ length }, (_, i) => start + i));
    }
  }
  for (let start = 2; start <= 12; start++) {
    const highAceLength = 15 - start;
    candidateSequences.push([...Array.from({ length: highAceLength - 1 }, (_, i) => start + i), 14]);
  }

  return candidateSequences.some(sequence => {
    if (sequence.length !== meld.cards.length) return false;
    const normalized = sequence.map(rank => rank === 14 ? 1 : rank);
    if (new Set(normalized).size !== normalized.length) return false;
    return ranks.every(rank => normalized.includes(rank));
  });
}
function runValue(meld: Meld): number {
  const natural = meld.cards.filter(c => !c.joker);
  if (!natural.length) return 0;
  const ranks = natural.map(c => c.rank!);
  const isLowAce = ranks.includes(1) && ranks.includes(2) && ranks.includes(3) && !ranks.includes(13);
  return meld.cards.reduce((sum, c) => {
    if (!c.joker) return sum + cardValue(c, !isLowAce);
    // A joker is worth the missing card it represents in the run.
    const missing = missingRunRank(meld);
    return sum + (missing === 1 && isLowAce ? 1 : missing === 1 ? 11 : missing >= 11 ? 10 : missing);
  }, 0);
}

function missingRunRank(meld: Meld): Rank {
  const natural = meld.cards.filter(c => !c.joker).map(c => c.rank!);
  for (let r = 1; r <= 13; r++) {
    const candidate = natural.concat(r).filter((v, i, a) => a.indexOf(v) === i);
    if (candidate.length !== natural.length + 1) continue;
    const fake: Meld = { ...meld, cards: candidate.map(rank => ({ id: `x-${rank}`, suit: meld.cards.find(c => !c.joker)?.suit, rank: rank as Rank, joker: false })) };
    if (validateMeld(fake, { ...SCALA_RULES, maxJokersPerMeld: 0 })) return r as Rank;
  }
  return 1;
}

export function meldValue(meld: Meld): number {
  if (!validateMeld(meld)) throw new Error("Invalid meld");
  if (meld.type === "run") return runValue(meld);
  const natural = meld.cards.find(c => !c.joker);
  if (!natural) throw new Error("Invalid set");
  const representedValue = cardValue(natural);
  return meld.cards.reduce((sum, card) => sum + (card.joker ? representedValue : cardValue(card)), 0);
}

export function canOpen(melds: Meld[], rules = SCALA_RULES): boolean {
  if (!melds.length || melds.some(m => !validateMeld(m, rules))) return false;
  if (!rules.allowJokerInOpening && melds.some(m => m.cards.some(c => c.joker))) return false;
  return melds.reduce((sum, meld) => sum + meldValue(meld), 0) >= rules.openingPoints;
}

function cardMatchesMeld(card: Card, meld: Meld): boolean {
  return validateMeld({ ...meld, cards: [...meld.cards, card] });
}

export function canAddCardToMeld(card: Card, meld: Meld): boolean {
  return cardMatchesMeld(card, meld);
}

export function canReplaceJoker(meld: Meld, card: Card): boolean {
  if (!meld.cards.some(c => c.joker)) return false;
  const index = meld.cards.findIndex(c => c.joker);
  const replaced = meld.cards.slice();
  replaced[index] = card;
  return validateMeld({ ...meld, cards: replaced });
}

export function scoreHand(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + (card.joker ? 25 : cardValue(card)), 0);
}

export function createInitialState(
  players: GamePlayer[],
  dealerId: PlayerId = players[0]?.id,
  random = Math.random,
  round = 1,
  scores?: Record<PlayerId, number>
): ScalaState {
  if (players.length < 2 || players.length > 6) throw new Error("Scala Quaranta supports 2 to 6 players");
  if (!players.length || !dealerId) throw new Error("At least one player is required");

  let deck = shuffle(createDeck(), random);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(players.map(p => [p.id, []]));
  for (let i = 0; i < SCALA_RULES.initialCards; i++) {
    for (const player of players) hands[player.id].push(deck.shift()!);
  }

  const firstDiscard = deck.shift();
  if (!firstDiscard) throw new Error("Deck exhausted");

  return {
    rules: SCALA_RULES,
    players,
    dealerId,
    turnPlayerId: nextPlayer(players, dealerId),
    phase: "playing",
    deck,
    discardPile: [firstDiscard],
    hands,
    table: [],
    opened: Object.fromEntries(players.map(p => [p.id, false])),
    scores: scores ?? Object.fromEntries(players.map(p => [p.id, 0])),
    round,
    turnStartedAt: Date.now(),
    hasTakenTurn: Object.fromEntries(players.map(p => [p.id, false]))
  };
}

function requireTurn(state: ScalaState, playerId: PlayerId) {
  if (state.phase !== "playing") throw new Error("Round is not playing");
  if (state.turnPlayerId !== playerId) throw new Error("It is not your turn");
}

export function drawFromDeck(state: ScalaState, playerId: PlayerId): ScalaState {
  requireTurn(state, playerId);
  if (!state.deck.length) throw new Error("The stock is empty; recycle the discard pile first");
  const next = structuredClone(state);
  const card = next.deck.shift()!;
  next.hands[playerId].push(card);
  next.lastDraw = { playerId, source: "deck", cardId: card.id };
  return next;
}

export function drawFromDiscard(state: ScalaState, playerId: PlayerId): ScalaState {
  requireTurn(state, playerId);
  if (!state.discardPile.length) throw new Error("Discard pile is empty");
  const next = structuredClone(state);
  const card = next.discardPile.pop()!;
  next.hands[playerId].push(card);
  next.lastDraw = { playerId, source: "discard", cardId: card.id };
  return next;
}

export function recycleDiscard(state: ScalaState): ScalaState {
  if (state.deck.length || state.discardPile.length < 2) return state;
  const next = structuredClone(state);
  const top = next.discardPile.pop()!;
  next.deck = shuffle(next.discardPile);
  next.discardPile = [top];
  return next;
}

function removeCards(hand: Card[], cards: Card[]): Card[] {
  const ids = new Set(cards.map(c => c.id));
  if (ids.size !== cards.length) throw new Error("Duplicate cards in meld");
  if (cards.some(c => !hand.some(h => h.id === c.id))) throw new Error("Card is not in your hand");
  return hand.filter(c => !ids.has(c.id));
}

export function layMelds(state: ScalaState, playerId: PlayerId, melds: Meld[]): ScalaState {
  requireTurn(state, playerId);
  if (!melds.length) throw new Error("At least one meld is required");
  const next = structuredClone(state);
  const hand = next.hands[playerId];
  const allCards = melds.flatMap(m => m.cards);
  const remaining = removeCards(hand, allCards);

  if (!next.opened[playerId]) {
    if (next.lastDraw?.playerId === playerId && next.lastDraw.source === "discard") {
      const drawnId = next.lastDraw.cardId;
      if (!allCards.some(card => card.id === drawnId)) throw new Error("The discarded card taken for the opening must be used in the opening");
    }
    if (!canOpen(melds, next.rules)) throw new Error("Opening melds must total at least 40 points");
    next.opened[playerId] = true;
  } else if (melds.some(m => !validateMeld(m, next.rules))) {
    throw new Error("Invalid meld");
  }

  if (new Set(allCards.map(c => c.id)).size !== allCards.length) throw new Error("A card cannot be used twice");
  next.hands[playerId] = remaining;
  next.table.push(...melds);
  next.hasTakenTurn[playerId] = true;
  return next;
}

export function addCardToMeld(state: ScalaState, playerId: PlayerId, meldId: string, cardId: string): ScalaState {
  requireTurn(state, playerId);
  if (!state.opened[playerId]) throw new Error("Open first before extending table melds");
  const next = structuredClone(state);
  const meld = next.table.find(m => m.id === meldId);
  if (!meld) throw new Error("Meld not found");
  const card = next.hands[playerId].find(c => c.id === cardId);
  if (!card) throw new Error("Card is not in your hand");
  if (!canAddCardToMeld(card, meld)) throw new Error("Card cannot be added to this meld");
  next.hands[playerId] = next.hands[playerId].filter(c => c.id !== cardId);
  meld.cards.push(card);
  next.hasTakenTurn[playerId] = true;
  return next;
}

export function replaceMeldJoker(state: ScalaState, playerId: PlayerId, meldId: string, cardId: string): ScalaState {
  requireTurn(state, playerId);
  if (!state.opened[playerId]) throw new Error("Open first");
  const next = structuredClone(state);
  const meld = next.table.find(m => m.id === meldId);
  if (!meld) throw new Error("Meld not found");
  const card = next.hands[playerId].find(c => c.id === cardId);
  if (!card || card.joker) throw new Error("A natural replacement card is required");
  if (!canReplaceJoker(meld, card)) throw new Error("This card cannot replace the joker");
  const index = meld.cards.findIndex(c => c.joker);
  meld.cards[index] = card;
  next.hands[playerId] = next.hands[playerId].filter(c => c.id !== cardId);
  const originalJoker = meld.cards.find(c => c.joker);
  if (!originalJoker) throw new Error("Joker not found");
  const joker: Card = { id: originalJoker.id, joker: true };
  next.hands[playerId].push(joker);
  next.hasTakenTurn[playerId] = true;
  return next;
}

export function discard(state: ScalaState, playerId: PlayerId, cardId: string): ScalaState {
  requireTurn(state, playerId);
  const next = structuredClone(state);
  const hand = next.hands[playerId];
  const card = hand.find(c => c.id === cardId);
  if (!card) throw new Error("Card is not in your hand");
  if (next.lastDraw?.playerId === playerId && next.lastDraw.source === "discard" && next.lastDraw.cardId === cardId) {
    throw new Error("You cannot immediately discard the card you took from the discard pile");
  }
  if (!next.opened[playerId]) {
    if (next.lastDraw?.playerId === playerId && next.lastDraw.source === "discard") {
      throw new Error("If you take the discard pile before opening, you must open before discarding");
    }
    if (card.joker || next.table.some(m => canAddCardToMeld(card, m))) {
      throw new Error("Before opening, you cannot discard a joker or a card that fits an existing meld");
    }
  }

  next.hands[playerId] = hand.filter(c => c.id !== cardId);
  next.discardPile.push(card);
  next.lastDiscard = { playerId, cardId };
  next.hasTakenTurn[playerId] = true;

  if (next.hands[playerId].length === 0) {
    if (card.joker) throw new Error("The final discard cannot be a joker");
    if (next.players.some(p => !next.hasTakenTurn[p.id])) {
      throw new Error("A player cannot close before every player has taken a turn");
    }
    next.phase = "round_finished";
    next.roundWinnerId = playerId;
    next.scores = Object.fromEntries(next.players.map(p => [
      p.id,
      (next.scores[p.id] ?? 0) + (p.id === playerId ? 0 : scoreHand(next.hands[p.id]))
    ]));
    if (next.players.some(p => next.scores[p.id] >= next.rules.matchLimit)) next.phase = "match_finished";
    return next;
  }

  next.turnPlayerId = nextPlayer(next.players, playerId);
  next.lastDraw = undefined;
  next.turnStartedAt = Date.now();
  return next;
}

export function startNextRound(state: ScalaState): ScalaState {
  if (state.phase !== "round_finished") throw new Error("Round is not finished");
  const winner = state.roundWinnerId;
  if (!winner) throw new Error("Round winner is missing");
  const dealer = winner;
  return createInitialState(state.players, dealer, Math.random, state.round + 1, state.scores);
}

export function isFinished(state: ScalaState): boolean {
  return state.phase === "match_finished";
}

export function winner(state: ScalaState): PlayerId | undefined {
  if (!isFinished(state)) return undefined;
  return state.players.reduce((best, p) => (state.scores[p.id] < state.scores[best] ? p : best), state.players[0]).id;
}
