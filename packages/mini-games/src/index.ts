export type MiniGameId =
  | "haft_khabis" | "chahar_barg" | "rock_paper_scissors" | "shelem"
  | "tic_tac_toe" | "battleship" | "truth_or_dare" | "spy" | "backgammon";

export type MiniPlayer = { id: string; seat: number; displayName?: string; username?: string };
export type MiniAction = { type: string; [key: string]: unknown };
export type MiniGameState = {
  gameId: MiniGameId;
  phase: string;
  players: MiniPlayer[];
  turnPlayerId?: string;
  scores: Record<string, number>;
  round?: number;
  winnerIds?: string[];
  [key: string]: unknown;
};

type Card = { id: string; rank: number; suit: string };

const suits = ["♠", "♥", "♦", "♣"];
const ranks = Array.from({ length: 13 }, (_, i) => i + 1);
const locations = ["فرودگاه","رستوران","دانشگاه","بیمارستان","هتل","استادیوم","قطار","سینما","موزه","کشتی","بانک","پارک","دادگاه","آشپزخانه","ایستگاه فضایی","کتابخانه","ساحل","فروشگاه"];

function deck(jokers = false): Card[] {
  const cards: Card[] = [];
  for (const suit of suits) for (const rank of ranks) cards.push({ id: `${suit}${rank}`, rank, suit });
  if (jokers) cards.push({ id: "J1", rank: 0, suit: "J" }, { id: "J2", rank: 0, suit: "J" });
  return cards;
}

function shuffle<T>(items: T[], rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nextPlayer(state: MiniGameState, id: string, steps = 1): string {
  const i = state.players.findIndex(p => p.id === id);
  if (i < 0) throw new Error("بازیکن نامعتبر است");
  return state.players[(i + steps + state.players.length * 4) % state.players.length].id;
}

function emptyScores(players: MiniPlayer[]) {
  return Object.fromEntries(players.map(p => [p.id, 0]));
}

function minPlayers(id: MiniGameId) {
  return id === "spy" ? 3 : id === "shelem" ? 4 : 2;
}

function maxPlayers(id: MiniGameId) {
  if (["tic_tac_toe", "battleship", "backgammon"].includes(id)) return 2;
  if (id === "shelem") return 4;
  if (id === "spy") return 10;
  if (id === "truth_or_dare" || id === "rock_paper_scissors") return 20;
  if (id === "chahar_barg") return 4;
  return 6;
}

export function createMiniGame(gameId: MiniGameId, inputPlayers: MiniPlayer[], rng = Math.random): MiniGameState {
  if (inputPlayers.length < minPlayers(gameId) || inputPlayers.length > maxPlayers(gameId)) {
    throw new Error("تعداد بازیکنان این بازی مجاز نیست");
  }

  const players = [...inputPlayers].sort((a, b) => a.seat - b.seat);
  const base: MiniGameState = {
    gameId,
    phase: "playing",
    players,
    scores: emptyScores(players),
    round: 1,
    turnPlayerId: players[0].id
  };

  if (gameId === "haft_khabis") {
    const cards = shuffle(deck(), rng);
    const hands: Record<string, Card[]> = {};
    for (const p of players) hands[p.id] = cards.splice(0, 7);
    let top = cards.pop()!;
    while (top.rank === 7 && cards.length) {
      cards.unshift(top);
      top = cards.pop()!;
    }
    return {
      ...base,
      phase: "playing",
      hands,
      deck: cards,
      discard: [top],
      direction: 1,
      pendingPenalty: 0,
      requiredSuit: undefined,
      drawnThisTurn: false
    };
  }

  if (gameId === "chahar_barg") {
    const cards = shuffle(deck(), rng);
    const hands: Record<string, Card[]> = {};
    for (const p of players) hands[p.id] = cards.splice(0, 4);
    return {
      ...base,
      hands,
      deck: cards,
      table: cards.splice(0, 4),
      captures: Object.fromEntries(players.map(p => [p.id, []])),
      lastCapturerId: undefined,
      scores: emptyScores(players)
    };
  }

  if (gameId === "rock_paper_scissors") {
    return { ...base, phase: "round", choices: {}, lastRound: undefined, round: 1 };
  }

  if (gameId === "shelem") {
    const cards = shuffle(deck(), rng);
    const hands: Record<string, Card[]> = {};
    for (const p of players) hands[p.id] = cards.splice(0, 12);
    return {
      ...base,
      phase: "bidding",
      hands,
      talon: cards.splice(0, 4),
      deck: cards,
      bids: {},
      passed: {},
      bidWinnerId: undefined,
      bidValue: 95,
      trick: [],
      tricksWon: Object.fromEntries(players.map(p => [p.id, 0])),
      trickPoints: Object.fromEntries(players.map(p => [p.id, 0])),
      trump: undefined,
      bidderDiscarded: false,
      trickNumber: 0,
      turnPlayerId: players[0].id
    };
  }

  if (gameId === "tic_tac_toe") {
    return {
      ...base,
      board: Array(9).fill(null),
      marks: { [players[0].id]: "X", [players[1].id]: "O" },
      turnPlayerId: players[0].id
    };
  }

  if (gameId === "battleship") {
    return {
      ...base,
      phase: "placement",
      boards: Object.fromEntries(players.map(p => [p.id, []])),
      shots: Object.fromEntries(players.map(p => [p.id, []])),
      shipSizes: Object.fromEntries(players.map(p => [p.id, []])),
      ready: Object.fromEntries(players.map(p => [p.id, false])),
      turnPlayerId: players[0].id
    };
  }

  if (gameId === "truth_or_dare") {
    return {
      ...base,
      phase: "choice",
      currentPlayerId: players[0].id,
      prompts: []
    };
  }

  if (gameId === "spy") {
    const location = locations[Math.floor(rng() * locations.length)];
    const spyId = players[Math.floor(rng() * players.length)].id;
    return {
      ...base,
      phase: "questions",
      location,
      spyId,
      questionIndex: 0,
      questions: [],
      turnPlayerId: players[0].id,
      lastQuestionerId: undefined
    };
  }

  const points: Record<string, number[]> = {};
  points[players[0].id] = Array(24).fill(0);
  points[players[1].id] = Array(24).fill(0);
  points[players[0].id][0] = 2;
  points[players[0].id][11] = 5;
  points[players[0].id][16] = 3;
  points[players[0].id][18] = 5;
  points[players[1].id][23] = 2;
  points[players[1].id][12] = 5;
  points[players[1].id][7] = 3;
  points[players[1].id][5] = 5;
  return {
    ...base,
    phase: "rolling",
    points,
    bar: { [players[0].id]: 0, [players[1].id]: 0 },
    borneOff: { [players[0].id]: 0, [players[1].id]: 0 },
    dice: [],
    movesLeft: []
  };
}

function winLine(board: unknown[]) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return lines.find(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
}

function ticTacToe(s: MiniGameState, a: MiniAction, p: string) {
  if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  if (a.type !== "place" || !Number.isInteger(a.cell) || Number(a.cell) < 0 || Number(a.cell) > 8 || (s.board as unknown[])[Number(a.cell)]) {
    throw new Error("خانه نامعتبر است");
  }
  const board = s.board as unknown[];
  board[Number(a.cell)] = (s.marks as Record<string,string>)[p];
  if (winLine(board)) {
    s.phase = "finished";
    s.winnerIds = [p];
    s.scores[p] += 1;
  } else if (board.every(Boolean)) {
    s.phase = "finished";
    s.winnerIds = [];
  } else {
    s.turnPlayerId = nextPlayer(s, p);
  }
  return s;
}

function rps(s: MiniGameState, a: MiniAction, p: string) {
  if (a.type !== "choose" || !["سنگ","کاغذ","قیچی"].includes(String(a.choice))) throw new Error("انتخاب نامعتبر است");
  const choices = s.choices as Record<string,string>;
  choices[p] = String(a.choice);
  if (Object.keys(choices).length < s.players.length) return s;

  const beats: Record<string,string> = { "سنگ":"قیچی", "قیچی":"کاغذ", "کاغذ":"سنگ" };
  const winners = s.players.filter(x => s.players.every(y => x.id === y.id || beats[choices[x.id]] === choices[y.id]));
  const roundNumber = Number(s.round || 1);
  s.lastRound = {
    round: roundNumber,
    players: s.players.map(x => ({ id: x.id, displayName: x.displayName, choice: choices[x.id] })),
    winnerIds: winners.map(x => x.id)
  };

  if (winners.length === 1) {
    s.scores[winners[0].id] += 1;
    if (s.scores[winners[0].id] >= 3) {
      s.phase = "finished";
      s.winnerIds = [winners[0].id];
      return s;
    }
  }
  s.round = roundNumber + 1;
  s.choices = {};
  return s;
}

const truthPrompts = ["بزرگ‌ترین سوتی‌ات چه بوده؟","آخرین دروغی که گفتی چه بود؟","چه کاری را همیشه عقب می‌اندازی؟","از چه چیزی بیشتر می‌ترسی؟","به چه کسی بیشتر از همه اعتماد داری؟"];
const darePrompts = ["۱۰ ثانیه آواز بخوان.","یک حرکت خنده‌دار اجرا کن.","با صدای ربات یک جمله بگو.","یک لطیفه تعریف کن.","۵ بار دست بزن و اسم خودت را بگو."];

function truthDare(s: MiniGameState, a: MiniAction, p: string, rng: () => number) {
  if (s.currentPlayerId !== p) throw new Error("نوبت شما نیست");
  if (a.type === "choose") {
    const kind = String(a.kind);
    if (kind !== "حقیقت" && kind !== "جرأت") throw new Error("نوع نامعتبر است");
    const source = kind === "حقیقت" ? truthPrompts : darePrompts;
    s.prompts.push({ playerId: p, kind, text: source[Math.floor(rng() * source.length)] });
    s.currentPlayerId = nextPlayer(s, p);
    s.turnPlayerId = s.currentPlayerId;
    return s;
  }
  if (a.type === "skip") {
    s.currentPlayerId = nextPlayer(s, p);
    s.turnPlayerId = s.currentPlayerId;
    return s;
  }
  throw new Error("عملیات نامعتبر");
}

function spy(s: MiniGameState, a: MiniAction, p: string) {
  if (a.type === "ask") {
    if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
    const text = String(a.text || "").trim();
    if (!text) throw new Error("سؤال خالی است");
    s.questions.push({ from: p, text, at: Date.now() });
    s.questionIndex = Number(s.questionIndex || 0) + 1;
    s.lastQuestionerId = p;
    s.turnPlayerId = nextPlayer(s, p);
    return s;
  }
  if (a.type === "accuse") {
    const target = String(a.playerId || "");
    if (!s.players.some(x => x.id === target) || target === p) throw new Error("بازیکن نامعتبر است");
    s.phase = "finished";
    if (target === s.spyId) {
      const innocents = s.players.filter(x => x.id !== s.spyId);
      s.winnerIds = innocents.map(x => x.id);
      innocents.forEach(x => s.scores[x.id] += x.id === p ? 2 : 1);
    } else {
      s.winnerIds = [s.spyId];
      s.scores[s.spyId] += 2;
    }
    return s;
  }
  if (a.type === "reveal") {
    if (p !== s.spyId) throw new Error("فقط جاسوس می‌تواند خود را فاش کند");
    const guess = String(a.locationGuess || "").trim();
    s.phase = "finished";
    if (guess && guess === s.location) {
      s.winnerIds = [p];
      s.scores[p] += 4;
    } else {
      s.winnerIds = [p];
      s.scores[p] += 1;
    }
    return s;
  }
  throw new Error("عملیات نامعتبر");
}

function cellsContiguous(cells: number[]) {
  return cells.every((cell, i) => i === 0 || cell === cells[i-1] + 1 || cell === cells[i-1] + 10);
}

function battleship(s: MiniGameState, a: MiniAction, p: string) {
  const boards = s.boards as Record<string, number[]>;
  const sizes = s.shipSizes as Record<string, number[]>;
  const ready = s.ready as Record<string, boolean>;
  if (s.phase === "placement") {
    if (a.type !== "place_ship") throw new Error("ابتدا کشتی‌ها را بچینید");
    const cells = Array.isArray(a.cells) ? a.cells.map(Number) : [];
    if (![2,3,4].includes(cells.length) || !cells.every(x => Number.isInteger(x) && x >= 0 && x < 100)) throw new Error("کشتی نامعتبر است");
    if (!cellsContiguous(cells)) throw new Error("خانه‌های کشتی باید پشت سر هم باشند");
    const sorted = [...cells].sort((x,y) => x-y);
    const horizontal = sorted.every((x,i) => i === 0 || x === sorted[i-1] + 1);
    const vertical = sorted.every((x,i) => i === 0 || x === sorted[i-1] + 10);
    if (!horizontal && !vertical) throw new Error("کشتی باید افقی یا عمودی باشد");
    if (cells.some(x => boards[p].includes(x))) throw new Error("کشتی‌ها نباید همپوشانی داشته باشند");
    if (sizes[p].length >= 4) throw new Error("همه کشتی‌ها قبلاً چیده شده‌اند");
    const requiredSizes = [4,3,3,2];
    const requiredCount = requiredSizes.filter(n => n === cells.length).length;\n    if (sizes[p].filter(n => n === cells.length).length >= requiredCount) throw new Error("تعداد این نوع کشتی کامل شده است");
    boards[p].push(...cells);
    sizes[p].push(cells.length);
    if (sizes[p].length === 4) ready[p] = true;
    if (Object.values(ready).every(Boolean)) {
      s.phase = "playing";
      s.turnPlayerId = s.players[0].id;
    }
    return s;
  }
  if (s.phase !== "playing" || a.type !== "fire") throw new Error("عملیات نامعتبر است");
  if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  const cell = Number(a.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 99) throw new Error("مختصات نامعتبر است");
  const shots = s.shots as Record<string, {cell:number;hit:boolean}[]>;
  if (shots[p].some(x => x.cell === cell)) throw new Error("این خانه قبلاً شلیک شده");
  const opponent = s.players.find(x => x.id !== p)!;
  const hit = boards[opponent.id].includes(cell);
  shots[p].push({ cell, hit });
  const remaining = boards[opponent.id].filter(c => !shots[p].some(x => x.hit && x.cell === c));
  if (!remaining.length) {
    s.phase = "finished";
    s.winnerIds = [p];
    s.scores[p] += 1;
  } else {
    s.turnPlayerId = opponent.id;
  }
  return s;
}

function nextChaharDeal(s: MiniGameState) {
  if (s.deck.length === 0) {
    if (s.lastCapturerId) {
      const leftovers = [...s.table];
      (s.captures as Record<string, Card[]>)[s.lastCapturerId].push(...leftovers);
      s.table = [];
    }
    const captureCounts = s.players.map(p => ({ id: p.id, count: (s.captures as Record<string, Card[]>)[p.id].length }));
    const max = Math.max(...captureCounts.map(x => x.count));
    const winners = captureCounts.filter(x => x.count === max).map(x => x.id);
    winners.forEach(id => s.scores[id] += 1);
    const cardPoints: Record<string, number> = {};
    for (const p of s.players) {
      let points = 0;
      for (const card of (s.captures as Record<string, Card[]>)[p.id]) {
        if (card.rank === 1) points += 1;
        if (card.rank === 11) points += 1;
        if (card.suit === "♦" && card.rank === 10) points += 2;
        if (card.suit === "♣" && card.rank === 2) points += 1;
      }
      s.scores[p.id] += points;
    }
    s.phase = "finished";
    s.winnerIds = [...s.players].sort((a,b) => s.scores[b.id] - s.scores[a.id]).slice(0,1).map(x => x.id);
    return;
  }
  for (const p of s.players) (s.hands as Record<string, Card[]>)[p.id].push(...s.deck.splice(0,4));
}

function chaharBarg(s: MiniGameState, a: MiniAction, p: string) {
  if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  if (a.type !== "capture") throw new Error("عملیات نامعتبر است");
  const hand = (s.hands as Record<string, Card[]>)[p];
  const i = hand.findIndex(c => c.id === String(a.cardId));
  if (i < 0) throw new Error("کارت در دست شما نیست");
  const card = hand[i];
  const table = s.table as Card[];
  let targetIds = Array.isArray(a.targets) ? a.targets.map(String) : [];
  let targets = table.filter(c => targetIds.includes(c.id));
  const sum = targets.reduce((n,c) => n + (c.rank === 1 ? 1 : c.rank), 0);
  if (!targets.length && table.some(c => c.rank === card.rank)) {
    targets = table.filter(c => c.rank === card.rank);
  } else if (targets.length && sum + (card.rank === 1 ? 1 : card.rank) !== 11 && targets.length !== 1) {
    throw new Error("مجموع کارت‌ها باید ۱۱ شود");
  }
  if (targets.length) {
    hand.splice(i,1);
    s.table = table.filter(c => !targets.some(t => t.id === c.id));
    (s.captures as Record<string, Card[]>)[p].push(card, ...targets);
    s.lastCapturerId = p;
    if (!s.table.length) s.scores[p] += 1;
  } else {
    hand.splice(i,1);
    table.push(card);
  }
  s.turnPlayerId = nextPlayer(s,p);
  if (s.players.every(pl => (s.hands as Record<string,Card[]>)[pl.id].length === 0)) nextChaharDeal(s);
  return s;
}

function shelem(s: MiniGameState, a: MiniAction, p: string) {
  if (s.phase === "bidding") {
    if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
    if (a.type !== "bid") throw new Error("باید خواندن یا پاس را انتخاب کنید");
    const bids = s.bids as Record<string, number>;
    const passed = s.passed as Record<string, boolean>;
    if (passed[p]) throw new Error("شما قبلاً پاس داده‌اید");
    if (a.value === "pass") {
      passed[p] = true;
    } else {
      const value = Number(a.value);
      const current = Number(s.bidValue || 95);
      if (!Number.isInteger(value) || value < 100 || value > 165 || value % 5 !== 0 || value <= current) throw new Error("خواندن باید بالاتر و مضرب ۵ باشد");
      bids[p] = value;
      s.bidValue = value;
      s.bidWinnerId = p;
    }
    const active = s.players.filter(x => !passed[x.id]);
    if (active.length === 1 && s.bidWinnerId) {
      s.phase = "talon";
      s.turnPlayerId = s.bidWinnerId;
      return s;
    }
    s.turnPlayerId = nextPlayer(s,p);
    while (passed[s.turnPlayerId]) s.turnPlayerId = nextPlayer(s,s.turnPlayerId);
    return s;
  }
  if (s.phase === "talon") {
    if (p !== s.bidWinnerId) throw new Error("فقط برنده خواندن زمین را برمی‌دارد");
    if (a.type !== "take_talon") throw new Error("زمین را بردارید");
    const hand = (s.hands as Record<string,Card[]>)[p];
    hand.push(...(s.talon as Card[]));
    s.talon = [];
    s.phase = "discard";
    return s;
  }
  if (s.phase === "discard") {
    if (p !== s.bidWinnerId) throw new Error("فقط حاکم می‌تواند کنار بگذارد");
    if (a.type !== "discard") throw new Error("چهار کارت باید کنار گذاشته شود");
    const ids = Array.isArray(a.cardIds) ? a.cardIds.map(String) : [];
    if (ids.length !== 4 || new Set(ids).size !== 4) throw new Error("دقیقاً ۴ کارت انتخاب کنید");
    const hand = (s.hands as Record<string,Card[]>)[p];
    if (ids.some(id => !hand.some(c => c.id === id))) throw new Error("کارت در دست شما نیست");
    const discarded = hand.filter(c => ids.includes(c.id));
    s.hands[p] = hand.filter(c => !ids.includes(c.id));
    s.declarerDiscard = discarded;
    s.phase = "playing";
    s.trump = undefined;
    s.turnPlayerId = p;
    s.trick = [];
    s.trickNumber = 0;
    s.tricksWon = Object.fromEntries(s.players.map(x => [x.id,0]));
    s.trickPoints = Object.fromEntries(s.players.map(x => [x.id,0]));
    return s;
  }
  if (s.phase !== "playing") throw new Error("مرحله نامعتبر است");
  if (a.type !== "play_card" || s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  const hand = (s.hands as Record<string,Card[]>)[p];
  const cardIndex = hand.findIndex(c => c.id === String(a.cardId));
  if (cardIndex < 0) throw new Error("کارت در دست شما نیست");
  const card = hand[cardIndex];
  const trick = s.trick as {playerId:string;card:Card}[];
  const lead = trick[0]?.card.suit;
  if (lead && hand.some(c => c.suit === lead) && card.suit !== lead) throw new Error("باید خال را رعایت کنید");
  if (!s.trump) s.trump = card.suit;
  hand.splice(cardIndex,1);
  trick.push({playerId:p,card});
  if (trick.length < 4) {
    s.turnPlayerId = nextPlayer(s,p);
    return s;
  }
  const winner = trick.reduce((best, play) => {
    const b = best.card, c = play.card;
    const cTrump = c.suit === s.trump, bTrump = b.suit === s.trump;
    if (cTrump !== bTrump) return cTrump ? play : best;
    if (c.suit === trick[0].card.suit && b.suit !== trick[0].card.suit) return play;
    if (c.suit === b.suit && c.rank > b.rank) return play;
    return best;
  });
  const points = trick.reduce((n,x) => n + (x.card.rank === 1 ? 11 : x.card.rank === 12 ? 10 : x.card.rank === 10 ? 5 : 0), 0) + 5;
  s.tricksWon[winner.playerId] += 1;
  s.trickPoints[winner.playerId] += points;
  s.trick = [];
  s.trickNumber += 1;
  s.turnPlayerId = winner.playerId;
  if (s.trickNumber === 12) {
    const declarer = String(s.bidWinnerId);
    const partner = nextPlayer(s, declarer, 2);
    const declarerTeam = [declarer, partner];
    const teamPoints = declarerTeam.reduce((n,id) => n + Number(s.trickPoints[id] || 0), 0) + (s.declarerDiscard as Card[]).reduce((n,c) => n + (c.rank===1?11:c.rank===12?10:c.rank===10?5:0),0);
    const contract = Number(s.bidValue || 100);
    if (teamPoints >= contract) {
      declarerTeam.forEach(id => s.scores[id] += contract);
      s.scores[declarer] += Math.max(0, teamPoints - contract);
    } else {
      declarerTeam.forEach(id => s.scores[id] -= contract);
      s.players.filter(x => !declarerTeam.includes(x.id)).forEach(x => s.scores[x.id] += 165 - teamPoints);
    }
    s.phase = "finished";
    const max = Math.max(...Object.values(s.scores));
    s.winnerIds = s.players.filter(x => s.scores[x.id] === max).map(x => x.id);
  }
  return s;
}

function backgammon(s: MiniGameState, a: MiniAction, p: string, rng: () => number) {
  if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  const dice = s.dice as number[];
  const movesLeft = s.movesLeft as number[];
  const points = s.points as Record<string,number[]>;
  const bar = s.bar as Record<string,number>;
  const borneOff = s.borneOff as Record<string,number>;
  const me = s.players[0].id === p;
  const dir = me ? 1 : -1;
  const ownSign = me ? 1 : -1;
  const oppSign = -ownSign;
  const own = points[p];
  const opponent = s.players.find(x => x.id !== p)!;
  const opp = points[opponent.id];

  if (a.type === "roll") {
    if (dice.length) throw new Error("تاس قبلاً ریخته شده");
    const d1 = 1 + Math.floor(rng()*6), d2 = 1 + Math.floor(rng()*6);
    s.dice = [d1,d2];
    s.movesLeft = d1 === d2 ? [d1,d1,d1,d1] : [d1,d2];
    s.phase = "moving";
    return s;
  }

  if (a.type !== "move" || !movesLeft.length) throw new Error("حرکت نامعتبر");
  if (bar[p] > 0 && !Number.isInteger(a.to)) throw new Error("ابتدا مهره خارج از بار را وارد کنید");
  const from = Number(a.from), to = Number(a.to);
  const distance = me ? to - from : from - to;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 23 || to < 0 || to > 23) {
    throw new Error("خانه نامعتبر");
  }
  const dieIndex = movesLeft.indexOf(distance);
  if (dieIndex < 0) throw new Error("این حرکت با تاس ممکن نیست");
  if (bar[p] > 0) throw new Error("ورود از بار هنوز در رابط کاربری فعال نشده است");
  if (own[from] <= 0) throw new Error("مهره شما در این خانه نیست");
  if (opp[to] < -1 && oppSign === -1 || opp[to] > 1 && oppSign === 1) throw new Error("خانه بسته است");
  const targetOpp = opp[to] * oppSign;
  if (targetOpp === 1) {
    opp[to] = 0;
    bar[opponent.id] += 1;
  }
  own[from] -= 1;
  own[to] += 1;
  movesLeft.splice(dieIndex,1);
  if (own.every(n => n <= 0)) throw new Error("وضعیت مهره‌ها نامعتبر است");
  if (to === (me ? 23 : 0) && borneOff[p] >= 15) s.phase = "finished";
  if (!movesLeft.length) {
    s.dice = [];
    s.phase = "rolling";
    s.turnPlayerId = opponent.id;
  }
  return s;
}

export function applyMiniAction(state: MiniGameState, action: MiniAction, playerId: string, rng = Math.random): MiniGameState {
  const s = structuredClone(state) as MiniGameState;
  if (!s.players.some(p => p.id === playerId)) throw new Error("بازیکن در اتاق نیست");
  if (s.phase === "finished") throw new Error("بازی تمام شده است");
  switch (s.gameId) {
    case "tic_tac_toe": return ticTacToe(s, action, playerId);
    case "rock_paper_scissors": return rps(s, action, playerId);
    case "truth_or_dare": return truthDare(s, action, playerId, rng);
    case "spy": return spy(s, action, playerId);
    case "battleship": return battleship(s, action, playerId);
    case "haft_khabis": return haft(s, action, playerId);
    case "chahar_barg": return chaharBarg(s, action, playerId);
    case "shelem": return shelem(s, action, playerId);
    case "backgammon": return backgammon(s, action, playerId, rng);
  }
}

function haft(s: MiniGameState, a: MiniAction, p: string): MiniGameState {
  if (s.turnPlayerId !== p) throw new Error("نوبت شما نیست");
  const hand = (s.hands as Record<string,Card[]>)[p];
  const discard = s.discard as Card[];
  const top = discard[discard.length - 1];
  const requiredSuit = s.requiredSuit as string | undefined;
  const penalty = Number(s.pendingPenalty || 0);
  if (a.type === "draw") {
    if (s.drawnThisTurn) throw new Error("در این نوبت قبلاً کارت کشیده‌اید");
    const count = penalty || 1;
    for (let i=0;i<count;i++) {
      if (!(s.deck as Card[]).length) {
        if (discard.length < 2) throw new Error("کارت دیگری باقی نمانده است");
        const topCard = discard.pop()!;
        s.deck = shuffle(discard);
        s.discard = [topCard];
      }
      hand.push((s.deck as Card[]).pop()!);
    }
    s.drawnThisTurn = true;
    return s;
  }
  if (a.type !== "play") throw new Error("عملیات نامعتبر");
  const card = hand.find(c => c.id === String(a.cardId));
  if (!card) throw new Error("کارت در دست شما نیست");
  const playable = penalty ? card.rank === 7 : card.rank === 11 || card.suit === requiredSuit || card.suit === top.suit || card.rank === top.rank || card.rank === 7;
  if (!playable) throw new Error("کارت قابل بازی نیست");
  hand.splice(hand.indexOf(card),1);
  discard.push(card);
  s.requiredSuit = card.rank === 11 ? (String(a.suit || "") || undefined) : undefined;
  if (card.rank === 7) s.pendingPenalty = penalty + 2;
  else s.pendingPenalty = 0;
  if (!hand.length) {
    s.phase = "finished";
    s.winnerIds = [p];
    s.scores[p] += 1;
    return s;
  }
  let steps = 1;
  if (card.rank === 1) steps = 2;
  if (card.rank === 10) s.direction = Number(s.direction || 1) * -1;
  if (card.rank === 8) steps = 0;
  s.turnPlayerId = nextPlayer(s,p,steps || 1);
  s.drawnThisTurn = false;
  return s;
}
