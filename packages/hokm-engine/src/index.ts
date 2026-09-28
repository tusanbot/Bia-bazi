// CLOUDFLARE_BUILD_SENTINEL_2026_09_28
// This marker intentionally identifies the exact source snapshot used by the build.
// Do not remove unless the deployment pipeline is verified against main.
// Diagnostic marker line 1.
// Diagnostic marker line 2.
// Diagnostic marker line 3.
// Diagnostic marker line 4.
// Diagnostic marker line 5.
// Diagnostic marker line 6.
// Diagnostic marker line 7.
// Diagnostic marker line 8.
// Diagnostic marker line 9.
// Diagnostic marker line 10.
// Diagnostic marker line 11.
// Diagnostic marker line 12.
// Diagnostic marker line 13.
// Diagnostic marker line 14.
// Diagnostic marker line 15.
import type { GamePlayer, PlayerId } from "@bia-bazi/game-engine";

export type PlayerCount = 2 | 3 | 4;
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type HokmVariantId = "standard" | "saras" | "naras" | "tak_bresh";

export interface HokmVariantDefinition {
  id: HokmVariantId;
  title: string;
  shortDescription: string;
  fullDescription: string;
  hasTrump: boolean;
  reversedRanks?: boolean;
  limitedCuts?: boolean;
}

export const HOKM_VARIANTS: Record<HokmVariantId, HokmVariantDefinition> = {
  standard: {
    id: "standard",
    title: "حکم معمولی",
    shortDescription: "حکم کلاسیک با انتخاب یک خال به‌عنوان حکم.",
    fullDescription: "در هر دست حاکم یکی از چهار خال را به‌عنوان حکم انتخاب می‌کند. اگر خال شروع‌شده را دارید باید همان خال را بازی کنید؛ در صورت نداشتن آن خال، می‌توانید با حکم ببُرید یا کارت دیگری رد بدهید.",
    hasTrump: true
  },
  saras: {
    id: "saras",
    title: "سرَس",
    shortDescription: "بدون خال حکم؛ آس بالاترین کارت است.",
    fullDescription: "در سرَس خال حکم وجود ندارد و بریدن انجام نمی‌شود. روند بازی مانند حکم معمولی و با رعایت خال شروع‌شده است، اما برنده هر دست بالاترین کارت همان خال است. ترتیب ارزش کارت‌ها از آس به ۲ است.",
    hasTrump: false
  },
  naras: {
    id: "naras",
    title: "نرس",
    shortDescription: "بدون خال حکم؛ ۲ بالاترین و آس پایین‌ترین است.",
    fullDescription: "در نرس خال حکم وجود ندارد و بریدن انجام نمی‌شود. روند بازی مانند حکم معمولی و با رعایت خال شروع‌شده است، اما ارزش کارت‌ها معکوس می‌شود: ۲ بالاترین و آس پایین‌ترین کارت است.",
    hasTrump: false,
    reversedRanks: true
  },
  tak_bresh: {
    id: "tak_bresh",
    title: "تک‌حکم (تک‌برش)",
    shortDescription: "خال حکم عادی است، اما هر بازیکن فقط یک بار می‌تواند با حکم ببُرد.",
    fullDescription: "حاکم یک خال را به‌عنوان حکم انتخاب می‌کند. هر بازیکن در کل آن دست فقط یک بار اجازه دارد وقتی خال شروع‌شده را ندارد، با کارت حکم ببُرد. پیروی از خال و سایر قوانین حکم معمولی حفظ می‌شوند.",
    hasTrump: true,
    limitedCuts: true
  }
};

export function getHokmVariant(id: HokmVariantId = "standard"): HokmVariantDefinition {
  return HOKM_VARIANTS[id] ?? HOKM_VARIANTS.standard;
}
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card { suit: Suit; rank: Rank; id: string; }
export interface Team { id: string; playerIds: PlayerId[]; }
export type Phase = "select_hokm" | "build_two_player_hand" | "playing" | "hand_finished" | "game_finished";

export interface HokmRules {
  playerCount: PlayerCount;
  cardsPerPlayer: 13 | 17;
  targetTricks: 7;
  /** Number of points/hands required to finish the match. */
  targetScore: 1 | 3 | 5 | 7;
  variantId: HokmVariantId;
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
  /** The most recently completed trick, kept visible during the hand/game result pause. */
  lastCompletedTrick: Array<{ playerId: PlayerId; card: Card }>;
  handResultApplied: boolean;
  handWinnerIds: PlayerId[];
  handPoints: Record<PlayerId, number>;
  tricksWon: Record<PlayerId, number>;
  teamTricks: Record<string, number>;
  scores: Record<PlayerId, number>;
  teams: Team[];
  deck: Card[];
  removedCards: Card[];
  twoPlayerBuild?: TwoPlayerBuild;
  leaderId: PlayerId;
  turnPlayerId: PlayerId;
  /** Number of completed hands in this match. */
  handsCompleted: number;
  /** Prevent card selection during the short transition into a fresh hand. */
  turnUnlockAt: number;
  /** For Tak-bresh, whether each player has already used their one allowed cut. */
  cutUsed: Record<PlayerId, boolean>;
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

export function createRules(count: PlayerCount, players: GamePlayer[], targetScore: number = 7, variantId: HokmVariantId = "standard"): HokmRules {
  if (![1, 3, 5, 7].includes(targetScore)) throw new Error("Target score must be 1, 3, 5 or 7");
  const normalizedTargetScore = targetScore as 1 | 3 | 5 | 7;
  if (!HOKM_VARIANTS[variantId]) throw new Error("Invalid Hokm variant");
  if (players.length !== count) throw new Error("Invalid player count");
  const teams = count === 4
    ? [
        { id: "team-a", playerIds: [players[0].id, players[2].id] },
        { id: "team-b", playerIds: [players[1].id, players[3].id] }
      ]
    : players.map(p => ({ id: "player-" + p.id, playerIds: [p.id] }));

  if (count === 2) return {
    playerCount: 2, cardsPerPlayer: 13, targetTricks: 7, targetScore: normalizedTargetScore, variantId, firstDeal: 5,
    followUpDeals: [], teams, removedCards: 0, twoPlayerStockDraw: true
  };
  if (count === 3) return {
    playerCount: 3, cardsPerPlayer: 17, targetTricks: 7, targetScore: normalizedTargetScore, variantId, firstDeal: 5,
    followUpDeals: [4,4,4], teams, removedCards: 1, twoPlayerStockDraw: false
  };
  return {
    playerCount: 4, cardsPerPlayer: 13, targetTricks: 7, targetScore: normalizedTargetScore, variantId, firstDeal: 5,
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

export function cardBeats(a: Card, b: Card, lead: Suit, hokm?: Suit, reversedRanks = false): boolean {
  const rankValue = (rank: Rank) => reversedRanks ? 15 - rank : rank;
  const at = Boolean(hokm) && a.suit === hokm, bt = Boolean(hokm) && b.suit === hokm;
  if (at !== bt) return at;
  if (a.suit !== b.suit) {
    if (a.suit !== lead) return false;
    return b.suit !== lead || a.rank > b.rank;
  }
  return rankValue(a.rank) > rankValue(b.rank);
}

export function trickWinner(trick: Array<{ playerId: PlayerId; card: Card }>, hokm?: Suit, reversedRanks = false): PlayerId {
  if (!trick.length) throw new Error("Empty trick");
  const lead = trick[0].card.suit;
  let winner = trick[0];
  for (const play of trick.slice(1)) if (cardBeats(play.card, winner.card, lead, hokm, reversedRanks)) winner = play;
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
  random = Math.random,
  targetScore: number = 7,
  handsCompleted = 0,
  variantId: HokmVariantId = "standard"
): HokmState {
  if (![2,3,4].includes(players.length)) throw new Error("Hokm supports 2, 3 or 4 players");
  const count = players.length as PlayerCount;
  if (![1, 3, 5, 7].includes(targetScore)) throw new Error("Target score must be 1, 3, 5 or 7");
  // Build the rules with the default score first so older declaration/type consumers
  // cannot reject the runtime numeric value during TypeScript checking.
  const rules = createRules(count, players, 7, variantId);
  rules.targetScore = targetScore as 1 | 3 | 5 | 7;
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
    lastCompletedTrick: [],
    handResultApplied: false,
    handWinnerIds: [],
    handPoints: {},
    tricksWon: Object.fromEntries(players.map(p => [p.id, 0])),
    teamTricks: Object.fromEntries(rules.teams.map(t => [t.id, 0])),
    scores: Object.fromEntries(players.map(p => [p.id, 0])),
    teams: rules.teams, deck, removedCards,
    leaderId: hokmPlayerId,
    turnPlayerId: hokmPlayerId,
    handsCompleted,
    turnUnlockAt: 0,
    cutUsed: Object.fromEntries(players.map(p => [p.id, false]))
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

export function chooseHokm(state: HokmState, playerId: PlayerId, suit?: Suit): HokmState {
  if (state.phase !== "select_hokm" || playerId !== state.hokmPlayerId) {
    throw new Error("Cannot choose hokm now");
  }
  const variant = getHokmVariant(state.rules.variantId);
  if (variant.hasTrump && !suit) throw new Error("A trump suit is required for this variant");
  if (!variant.hasTrump && suit) throw new Error("This variant has no trump suit");
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

export function startNoTrumpVariant(state: HokmState): HokmState {
  if (state.phase !== "select_hokm") throw new Error("Cannot start this variant now");
  const variant = getHokmVariant(state.rules.variantId);
  if (variant.hasTrump) throw new Error("This variant requires a trump suit");
  const next = structuredClone(state);
  next.hokm = undefined;
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
    if (next.twoPlayerBuild) {
      next.twoPlayerBuild.phase = "discard";
      next.twoPlayerBuild.currentPlayer = next.hokmPlayerId;
    }
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

  const stateBuild = state.twoPlayerBuild!;
  if (stateBuild.phase !== "discard" || stateBuild.currentPlayer !== playerId) {
    throw new Error("Not your discard turn");
  }

  if (new Set(cardIds).size !== required) {
    throw new Error(`Exactly ${required} different cards are required`);
  }

  const next = structuredClone(state);
  const build = next.twoPlayerBuild!;
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

  // The 42-card stock is now the draw pile. Reveal the first pair
  // immediately so the Hakem can choose one of the two cards.
  build.stock = next.deck;
  next.deck = [];
  build.phase = "draw";
  build.currentPlayer = next.hokmPlayerId;
  if (build.stock.length < 2) {
    throw new Error("The two-player stock must contain at least two cards");
  }
  build.drawOptions = build.stock.slice(0, 2);
  return next;
}

export function drawTwo(state: HokmState, playerId: PlayerId, keep: boolean): HokmState {
  if (state.phase !== "build_two_player_hand" || state.players.length !== 2) {
    throw new Error("Invalid two-player draw");
  }

  const stateBuild = state.twoPlayerBuild!;
  if (stateBuild.phase !== "draw" || stateBuild.currentPlayer !== playerId) {
    throw new Error("Not your draw turn");
  }
  if (stateBuild.drawOptions.length !== 2) {
    throw new Error("Two stock cards are not currently available");
  }

  const next = structuredClone(state);
  const build = next.twoPlayerBuild!;
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
  const variant = getHokmVariant(state.rules.variantId);
  if (state.phase !== "playing" || (variant.hasTrump && !state.hokm) || state.turnPlayerId !== playerId) {
    throw new Error("Invalid play");
  }
  if (state.turnUnlockAt > Date.now()) {
    throw new Error("Card selection is temporarily locked");
  }

  const next = structuredClone(state);
  // The final trick of the previous hand remains visible until the first
  // card of this hand is actually selected.
  next.lastCompletedTrick = [];
  const hand = next.hands[playerId];
  const card = hand.find(c => c.id === cardId);
  if (!card) throw new Error("Card not in hand");

  const lead = next.trick[0]?.card.suit;
  const sameSuit = lead ? hand.filter(c => c.suit === lead) : [];
  const hasLead = Boolean(lead && sameSuit.length);
  const isCut = Boolean(variant.limitedCuts && next.hokm && lead && lead !== next.hokm && !hasLead && card.suit === next.hokm);
  let legal = legalCards(hand, lead);
  if (isCut && next.cutUsed[playerId]) {
    const nonTrump = legal.filter(c => c.suit !== next.hokm);
    if (nonTrump.length) legal = nonTrump;
  }
  if (!legal.some(c => c.id === cardId)) {
    throw new Error(variant.limitedCuts && next.cutUsed[playerId] ? "شما قبلاً از تنها فرصت برش خود استفاده کرده‌اید" : "Must follow suit");
  }

  next.hands[playerId] = hand.filter(c => c.id !== cardId);
  if (isCut) next.cutUsed[playerId] = true;
  next.trick.push({ playerId, card });

  if (next.trick.length < next.players.length) {
    next.turnPlayerId = nextPlayer(next.players, playerId);
    return next;
  }

  const completedTrick = structuredClone(next.trick);
  const winner = trickWinner(next.trick, next.hokm, variant.reversedRanks);
  next.lastCompletedTrick = completedTrick;
  next.tricksWon[winner]++;
  next.teamTricks[teamForPlayer(next.teams, winner).id]++;
  next.trick = [];
  next.leaderId = winner;
  next.turnPlayerId = winner;

  const total = Object.values(next.tricksWon).reduce((a,b) => a+b, 0);

  if (next.players.length === 2 || next.players.length === 4) {
    // In 2-player and 4-player Hokm, the first side/player to reach 7 tricks
    // wins the hand immediately.
    if (Object.values(next.tricksWon).some(n => n >= 7) || total === 13) {
      next.phase = "hand_finished";
    }
  } else if (next.players.length === 3) {
    // Three-player Hokm has no simple "first to 7" rule unless that lead
    // cannot be caught. A 7-4-4 position is already decisive, while 7-4-3
    // is not. If all 17 tricks are played, a tie for the highest total means
    // the third player (the lower total) wins the hand.
    if (total === 17) {
      next.phase = "hand_finished";
    } else {
      const remaining = 17 - total;
      const values = next.players.map(p => next.tricksWon[p.id]);
      const decisive = values.some(value =>
        values.every(other => value > other + remaining)
      );
      if (decisive) next.phase = "hand_finished";
    }
  }

  return next;
}

export function finishHand(state: HokmState): HokmState {
  if (state.phase !== "hand_finished") throw new Error("Hand is not finished");
  if (state.handResultApplied) throw new Error("Hand result has already been recorded");
  const next = structuredClone(state);

  next.handPoints = Object.fromEntries(next.players.map(player => [player.id, 0]));

  if (next.players.length === 4) {
    const hokmTeam = teamForPlayer(next.teams, next.hokmPlayerId);
    const winningTeam = next.teams.reduce((best, team) =>
      next.teamTricks[team.id] > next.teamTricks[best.id] ? team : best
    );
    const winningTricks = next.teamTricks[winningTeam.id];
    const hokmTricks = next.teamTricks[hokmTeam.id];
    const points =
      winningTricks === 7 && hokmTricks === 0 && winningTeam.id !== hokmTeam.id ? 3 :
      winningTricks === 7 && hokmTricks === 0 ? 2 :
      1;
    for (const id of winningTeam.playerIds) {
      next.scores[id] += points;
      next.handPoints[id] = points;
    }
    next.handWinnerIds = [...winningTeam.playerIds];
  } else if (next.players.length === 2) {
    const winner = next.players.reduce((best, player) =>
      next.tricksWon[player.id] > next.tricksWon[best.id] ? player : best
    );
    const winnerTricks = next.tricksWon[winner.id];
    const opponent = next.players.find(player => player.id !== winner.id)!;
    const opponentTricks = next.tricksWon[opponent.id];
    const points =
      winnerTricks === 7 && opponentTricks === 0 && winner.id !== next.hokmPlayerId ? 3 :
      winnerTricks === 7 && opponentTricks === 0 ? 2 :
      1;
    next.scores[winner.id] += points;
    next.handPoints[winner.id] = points;
    next.handWinnerIds = [winner.id];
  } else {
    const values = next.players.map(player => ({
      player,
      tricks: next.tricksWon[player.id]
    }));
    const max = Math.max(...values.map(v => v.tricks));
    const leaders = values.filter(v => v.tricks === max);
    const winner = leaders.length === 1
      ? leaders[0].player
      : values.find(v => v.tricks < max)!.player;
    const winnerTricks = next.tricksWon[winner.id];
    const allOthersZero = next.players
      .filter(player => player.id !== winner.id)
      .every(player => next.tricksWon[player.id] === 0);
    const points =
      winnerTricks === 7 && allOthersZero
        ? (winner.id === next.hokmPlayerId ? 2 : 3)
        : 1;
    next.scores[winner.id] += points;
    next.handPoints[winner.id] = points;
    next.handWinnerIds = [winner.id];
  }

  next.handResultApplied = true;
  next.handsCompleted += 1;
  if (Object.values(next.scores).some(score => score >= next.rules.targetScore)) next.phase = "game_finished";
  return next;
}

export function startNextHand(state: HokmState): HokmState {
  if (state.phase !== "hand_finished") throw new Error("Hand is not finished");
  if (Object.values(state.scores).some(score => score >= state.rules.targetScore)) throw new Error("Game is already finished");
  let dealerId = state.dealerId;
  let hokmPlayerId = state.hokmPlayerId;

  const winnerId = state.players.reduce((best, player) =>
    state.tricksWon[player.id] > state.tricksWon[best.id] ? player : best
  ).id;

  // Standard rotation: the Hakem keeps the role after winning the hand.
  // When the Hakem loses, the old Hakem deals and the opponent becomes Hakem
  // (for 2 players); for 3 players the old Hakem deals and the player to his
  // right becomes Hakem.
  if (winnerId !== state.hokmPlayerId) {
    dealerId = state.hokmPlayerId;
    const hakemIndex = state.players.findIndex(p => p.id === state.hokmPlayerId);
    hokmPlayerId = state.players[(hakemIndex + 1) % state.players.length].id;
  }

  const next = buildInitialState(
    state.players,
    dealerId,
    hokmPlayerId,
    Math.random,
    state.rules.targetScore,
    state.handsCompleted,
    state.rules.variantId
  );
  next.scores = structuredClone(state.scores);
  // Keep the previous hand's final trick visible during the 1-second
  // transition and until the first card of the new hand is selected.
  next.lastCompletedTrick = structuredClone(state.lastCompletedTrick);
  next.turnUnlockAt = Date.now() + 1000;
  return next;
}

export function isLegalMove(state: HokmState, playerId: PlayerId, cardId: string): boolean {
  const variant = getHokmVariant(state.rules.variantId);
  if (state.phase !== "playing" || state.turnPlayerId !== playerId || (variant.hasTrump && !state.hokm)) return false;
  const hand = state.hands[playerId] || [];
  const lead = state.trick[0]?.card.suit;
  let legal = legalCards(hand, lead);
  if (variant.limitedCuts && state.cutUsed[playerId] && state.hokm && lead && lead !== state.hokm && !hand.some(c => c.suit === lead)) {
    const nonTrump = legal.filter(c => c.suit !== state.hokm);
    if (nonTrump.length) legal = nonTrump;
  }
  return legal.some(c => c.id === cardId);
}


export { createHokmRoom, createHokmRoomConfig } from "./room";
export type { HokmRoomConfig } from "./room";
