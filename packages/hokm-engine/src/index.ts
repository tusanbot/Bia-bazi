import type { GamePlayer, PlayerId } from "@bia-bazi/game-engine";

export type PlayerCount = 2 | 3 | 4;
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card { suit: Suit; rank: Rank; id: string; }
export interface Team { id: string; playerIds: PlayerId[]; }
export type Phase = "select_hokm" | "build_two_player_hand" | "playing" | "hand_finished" | "game_finished";

export interface HokmRules {
  playerCount: PlayerCount;
  cardsPerPlayer: 13 | 17;
  targetTricks: 7;
  firstDeal: 5;
  followUpDeals: number[];
  teams: Team[];
  removedCards: number;
  twoPlayerStockDraw: boolean;
}

export interface TwoPlayerBuild {
  stock: Card[];
  discarded: Card[];
  currentPlayer: PlayerId;
  kept: Record<PlayerId, Card[]>;
  /** The two privately revealed stock cards currently offered to currentPlayer. */
  drawOptions: Card[];
  phase: "discard" | "draw";
}

export interface HokmState {
  rules: HokmRules;
  players: GamePlayer[];
  dealerId: PlayerId;
  hokmPlayerId: PlayerId;
  hokm?: Suit;
  phase: Phase;
  hands: Record<PlayerId, Card[]>;
  trick: Array<{ playerId: PlayerId; card: Card }>;
  tricksWon: Record<PlayerId, number>;
  teamTricks: Record<string, number>;
  scores: Record<PlayerId, number>;
  teams: Team[];
  deck: Card[];
  removedCards: Card[];
  twoPlayerBuild?: TwoPlayerBuild;
  leaderId: PlayerId;
  turnPlayerId: PlayerId;
}

const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const ranks: Rank[] = [2,3,4,5,6,7,8,9,10,11,12,13,14];

export function createDeck(): Card[] {
  return suits.flatMap(suit => ranks.map(rank => ({ suit, rank, id: suit + "-" + rank })));
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createRules(count: PlayerCount, players: GamePlayer[]): HokmRules {
  if (players.length !== count) throw new Error("Invalid player count");
  const teams = count === 4
    ? [
        { id: "team-a", playerIds: [players[0].id, players[2].id] },
        { id: "team-b", playerIds: [players[1].id, players[3].id] }
      ]
    : players.map(p => ({ id: "player-" + p.id, playerIds: [p.id] }));

  if (count === 2) return {
    playerCount: 2, cardsPerPlayer: 13, targetTricks: 7, firstDeal: 5,
    followUpDeals: [], teams, removedCards: 0, twoPlayerStockDraw: true
  };
  if (count === 3) return {
    playerCount: 3, cardsPerPlayer: 17, targetTricks: 7, firstDeal: 5,
    followUpDeals: [4,4,4], teams, removedCards: 1, twoPlayerStockDraw: false
  };
  return {
    playerCount: 4, cardsPerPlayer: 13, targetTricks: 7, firstDeal: 5,
    followUpDeals: [4,4], teams, removedCards: 0, twoPlayerStockDraw: false
  };
}

export function nextPlayer(players: GamePlayer[], id: PlayerId): PlayerId {
  const i = players.findIndex(p => p.id === id);
  if (i < 0) throw new Error("Unknown player");
  return players[(i + 1) % players.length].id;
}

export function legalCards(hand: Card[], lead?: Suit): Card[] {
  if (!lead) return hand;
  const same = hand.filter(c => c.suit === lead);
  return same.length ? same : hand;
}

export function cardBeats(a: Card, b: Card, lead: Suit, hokm: Suit): boolean {
  const at = a.suit === hokm, bt = b.suit === hokm;
  if (at !== bt) return at;
  if (a.suit !== b.suit) {
    if (a.suit !== lead) return false;
    return b.suit !== lead || a.rank > b.rank;
  }
  return a.rank > b.rank;
}

export function trickWinner(trick: Array<{ playerId: PlayerId; card: Card }>, hokm: Suit): PlayerId {
  if (!trick.length) throw new Error("Empty trick");
  const lead = trick[0].card.suit;
  let winner = trick[0];
  for (const play of trick.slice(1)) if (cardBeats(play.card, winner.card, lead, hokm)) winner = play;
  return winner.playerId;
}

export function teamForPlayer(teams: Team[], id: PlayerId): Team {
  const team = teams.find(t => t.playerIds.includes(id));
  if (!team) throw new Error("Player has no team");
  return team;
}

export function buildInitialState(
  players: GamePlayer[],
  dealerId: PlayerId,
  hokmPlayerId: PlayerId,
  random = Math.random
): HokmState {
  if (![2,3,4].includes(players.length)) throw new Error("Hokm supports 2, 3 or 4 players");
  const count = players.length as PlayerCount;
  const rules = createRules(count, players);
  let deck = shuffle(createDeck(), random);
  const removedCards: Card[] = [];

  if (rules.removedCards) {
    const i = deck.findIndex(c => c.rank === 2);
    removedCards.push(deck.splice(i, 1)[0]);
  }

  const hands: Record<PlayerId, Card[]> = Object.fromEntries(players.map(p => [p.id, []]));
  for (let n = 0; n < rules.firstDeal; n++) {
    for (const p of players) hands[p.id].push(deck.shift()!);
  }

  const base: HokmState = {
    rules, players, dealerId, hokmPlayerId, phase: "select_hokm", hands,
    trick: [],
    tricksWon: Object.fromEntries(players.map(p => [p.id, 0])),
    teamTricks: Object.fromEntries(rules.teams.map(t => [t.id, 0])),
    scores: Object.fromEntries(players.map(p => [p.id, 0])),
    teams: rules.teams, deck, removedCards,
    leaderId: hokmPlayerId, turnPlayerId: hokmPlayerId
  };

  if (count === 2) {
    base.twoPlayerBuild = {
      stock: [], discarded: [], currentPlayer: hokmPlayerId,
      kept: Object.fromEntries(players.map(p => [p.id, []])),
      drawOptions: [],
      phase: "discard"
    };
  }
  return base;
}

export function chooseHokm(state: HokmState, playerId: PlayerId, suit: Suit): HokmState {
  if (state.phase !== "select_hokm" || playerId !== state.hokmPlayerId) {
    throw new Error("Cannot choose hokm now");
  }
  const next = structuredClone(state);
  next.hokm = suit;

  if (next.players.length !== 2) {
    for (const dealSize of next.rules.followUpDeals) {
      for (const player of next.players) {
        for (let i = 0; i < dealSize; i++) {
          const card = next.deck.shift();
          if (!card) throw new Error("Deck exhausted while completing the deal");
          next.hands[player.id].push(card);
        }
      }
    }
    next.phase = "playing";
  } else {
    next.phase = "build_two_player_hand";
  }

  if (next.twoPlayerBuild) {
    next.twoPlayerBuild.phase = "discard";
    next.twoPlayerBuild.currentPlayer = playerId;
  }
  return next;
}

export function discardTwo(state: HokmState, playerId: PlayerId, cardIds: string[]): HokmState {
  if (state.phase !== "build_two_player_hand" || state.players.length !== 2) {
    throw new Error("Invalid two-player discard");
  }

  // Standard two-player Hokm: the Hakem discards 3 of the initial 5 cards;
  // the other player discards 2. This leaves 2 and 3 cards respectively.
  const required = playerId === state.hokmPlayerId ? 3 : 2;
  if (cardIds.length !== required) {
    throw new Error(`You must discard exactly ${required} cards`);
  }

  const build = state.twoPlayerBuild!;
  if (build.phase !== "discard" || build.currentPlayer !== playerId) {
    throw new Error("Not your discard turn");
  }

  if (new Set(cardIds).size !== 2) throw new Error("Exactly two different cards are required");

  const next = structuredClone(state);
  const hand = next.hands[playerId];
  if (cardIds.some(id => !hand.some(c => c.id === id))) throw new Error("Card not in hand");

  next.hands[playerId] = hand.filter(c => !cardIds.includes(c.id));
  build.discarded.push(...hand.filter(c => cardIds.includes(c.id)));
  build.kept[playerId] = next.hands[playerId];

  const other = next.players.find(p => p.id !== playerId)!.id;
  if (!build.kept[other].length) {
    build.currentPlayer = other;
    return next;
  }

  build.stock = next.deck;
  next.deck = [];
  build.phase = "draw";
  build.currentPlayer = next.hokmPlayerId;
  return next;
}

export function drawTwo(state: HokmState, playerId: PlayerId, keep: boolean): HokmState {
  if (state.phase !== "build_two_player_hand" || state.players.length !== 2) {
    throw new Error("Invalid two-player draw");
  }

  const build = state.twoPlayerBuild!;
  if (build.phase !== "draw" || build.currentPlayer !== playerId) {
    throw new Error("Not your draw turn");
  }
  if (build.drawOptions.length !== 2) {
    throw new Error("Two stock cards are not currently available");
  }

  const next = structuredClone(state);
  const [first, second] = build.drawOptions;

  // The player sees two cards but keeps exactly one:
  // keep=true => keep first, discard second
  // keep=false => discard first, keep second.
  if (keep) {
    build.kept[playerId].push(first);
    build.discarded.push(second);
  } else {
    build.discarded.push(first);
    build.kept[playerId].push(second);
  }
  next.hands[playerId] = structuredClone(build.kept[playerId]);

  build.stock.splice(0, 2);
  build.drawOptions = [];

  const other = next.players.find(p => p.id !== playerId)!.id;

  if (build.kept[playerId].length === 13) {
    if (build.kept[other].length === 13) {
      next.phase = "playing";
      next.hands = structuredClone(build.kept);
      next.turnPlayerId = next.hokmPlayerId;
      next.leaderId = next.hokmPlayerId;
      return next;
    }
    build.currentPlayer = other;
  } else {
    build.currentPlayer = other;
  }

  if (build.stock.length < 2) {
    throw new Error("The two-player stock is exhausted before both hands are complete");
  }
  build.drawOptions = build.stock.slice(0, 2);

  return next;
}

export function playCard(state: HokmState, playerId: PlayerId, cardId: string): HokmState {
  if (state.phase !== "playing" || !state.hokm || state.turnPlayerId !== playerId) {
    throw new Error("Invalid play");
  }

  const next = structuredClone(state);
  const hand = next.hands[playerId];
  const card = hand.find(c => c.id === cardId);
  if (!card) throw new Error("Card not in hand");

  if (!legalCards(hand, next.trick[0]?.card.suit).some(c => c.id === cardId)) {
    throw new Error("Must follow suit");
  }

  next.hands[playerId] = hand.filter(c => c.id !== cardId);
  next.trick.push({ playerId, card });

  if (next.trick.length < next.players.length) {
    next.turnPlayerId = nextPlayer(next.players, playerId);
    return next;
  }

  const winner = trickWinner(next.trick, next.hokm);
  next.tricksWon[winner]++;
  next.teamTricks[teamForPlayer(next.teams, winner).id]++;
  next.trick = [];
  next.leaderId = winner;
  next.turnPlayerId = winner;

  const total = Object.values(next.tricksWon).reduce((a,b) => a+b, 0);
  if (Object.values(next.tricksWon).some(n => n >= 7) || total === 13 || total === 17) {
    next.phase = "hand_finished";
  }

  return next;
}

export function finishHand(state: HokmState): HokmState {
  if (state.phase !== "hand_finished") throw new Error("Hand is not finished");
  const next = structuredClone(state);

  if (next.players.length === 4) {
    const ranked = next.teams.slice().sort((a,b) => next.teamTricks[b.id] - next.teamTricks[a.id]);
    const points = next.teamTricks[ranked[0].id] === 13 || next.teamTricks[ranked[1].id] === 0 ? 2 : 1;
    for (const id of ranked[0].playerIds) next.scores[id] += points;
  } else {
    const winner = next.players.slice().sort((a,b) => next.tricksWon[b.id] - next.tricksWon[a.id])[0];
    next.scores[winner.id] += 1;
  }

  if (Object.values(next.scores).some(score => score >= 7)) next.phase = "game_finished";
  return next;
}

export function startNextHand(state: HokmState): HokmState {
  if (state.phase !== "hand_finished") throw new Error("Hand is not finished");
  if (Object.values(state.scores).some(score => score >= 7)) throw new Error("Game is already finished");
  const dealerIndex = state.players.findIndex(p => p.id === state.dealerId);
  const dealerId = state.players[(dealerIndex + 1) % state.players.length].id;
  const hokmIndex = state.players.findIndex(p => p.id === dealerId);
  const hokmPlayerId = state.players[(hokmIndex + 1) % state.players.length].id;
  const next = buildInitialState(state.players, dealerId, hokmPlayerId);
  next.scores = structuredClone(state.scores);
  return next;
}

export function isLegalMove(state: HokmState, playerId: PlayerId, cardId: string): boolean {
  if (state.phase !== "playing" || state.turnPlayerId !== playerId || !state.hokm) return false;
  const hand = state.hands[playerId] || [];
  return legalCards(hand, state.trick[0]?.card.suit).some(c => c.id === cardId);
}


export { createHokmRoom, createHokmRoomConfig } from "./room";
export type { HokmRoomConfig } from "./room";
