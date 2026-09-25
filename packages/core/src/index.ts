export type GameStatus = "waiting" | "starting" | "active" | "finished" | "cancelled";

export type Player = {
  telegramId: number;
  username?: string;
  firstName: string;
  avatarUrl?: string;
  status: "active" | "disconnected" | "left";
  joinedAt: number;
};

export type GameRoom = {
  id: string;
  gameType: string;
  status: GameStatus;
  groupChatId?: number;
  groupMessageId?: number;
  creatorTelegramId: number;
  maxPlayers: number;
  players: Player[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
};

export interface GameDefinition {
  id: string;
  title: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  createInitialState: (players: Player[]) => unknown;
}

export const games: GameDefinition[] = [
  {
    id: "hokm",
    title: "حکم",
    emoji: "🃏",
    minPlayers: 4,
    maxPlayers: 4,
    createInitialState: (players) => ({
      phase: "lobby",
      players: players.map((p) => p.telegramId),
      deck: [],
      hands: {},
      trump: null,
      turn: null,
      tricks: [],
      scores: {}
    })
  }
];