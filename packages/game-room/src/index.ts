import type { GamePlayer } from "@bia-bazi/game-engine";

export type RoomStatus = "waiting" | "starting" | "playing" | "finished" | "cancelled";

export interface RoomPlayer extends GamePlayer {
  username?: string;
  displayName: string;
  joinedAt: number;
}

export interface GameRoomConfig {
  gameId: string;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameRoomState {
  id: string;
  config: GameRoomConfig;
  status: RoomStatus;
  hostId: string;
  players: RoomPlayer[];
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export class GameRoom {
  private state: GameRoomState;

  constructor(state: GameRoomState) {
    this.state = structuredClone(state);
  }

  static create(
    id: string,
    config: GameRoomConfig,
    host: Omit<RoomPlayer, "seat" | "joinedAt">,
    now = Date.now()
  ): GameRoom {
    if (config.minPlayers < 2 || config.maxPlayers < config.minPlayers) {
      throw new Error("Invalid room capacity");
    }
    if (config.playerCount < config.minPlayers || config.playerCount > config.maxPlayers) {
      throw new Error("Invalid player count");
    }

    return new GameRoom({
      id,
      config,
      status: "waiting",
      hostId: host.id,
      players: [{ ...host, seat: 0, joinedAt: now }],
      createdAt: now
    });
  }

  getState(): GameRoomState {
    return structuredClone(this.state);
  }

  join(player: Omit<RoomPlayer, "seat" | "joinedAt">, now = Date.now()): GameRoomState {
    if (this.state.status !== "waiting") throw new Error("Room is not accepting players");
    if (this.state.players.some(p => p.id === player.id)) return this.getState();
    if (this.state.players.length >= this.state.config.playerCount) {
      throw new Error("Room is full");
    }

    const seat = this.state.players.length;
    this.state.players.push({ ...player, seat, joinedAt: now });
    return this.getState();
  }

  leave(playerId: string): GameRoomState {
    if (this.state.status !== "waiting") throw new Error("Players cannot leave after the game starts");

    const index = this.state.players.findIndex(p => p.id === playerId);
    if (index < 0) return this.getState();

    this.state.players.splice(index, 1);
    this.state.players = this.state.players.map((p, seat) => ({ ...p, seat }));

    if (playerId === this.state.hostId && this.state.players.length > 0) {
      this.state.hostId = this.state.players[0].id;
    }

    return this.getState();
  }

  setPlayerCount(playerCount: number): GameRoomState {
    if (this.state.status !== "waiting") {
      throw new Error("Room mode can only be changed while waiting");
    }
    if (playerCount < this.state.config.minPlayers || playerCount > this.state.config.maxPlayers) {
      throw new Error("Player count is outside the allowed range");
    }
    if (playerCount < this.state.players.length) {
      throw new Error("Cannot reduce player count below the number of joined players");
    }

    this.state.config.playerCount = playerCount;
    return this.getState();
  }

  canStart(): boolean {
    return (
      this.state.status === "waiting" &&
      this.state.players.length === this.state.config.playerCount
    );
  }

  start(now = Date.now()): GameRoomState {
    if (!this.canStart()) throw new Error("Room is not ready to start");
    this.state.status = "starting";
    this.state.startedAt = now;
    return this.getState();
  }

  markPlaying(): GameRoomState {
    if (this.state.status !== "starting") throw new Error("Room has not started");
    this.state.status = "playing";
    return this.getState();
  }

  finish(now = Date.now()): GameRoomState {
    if (this.state.status !== "playing") throw new Error("Room is not playing");
    this.state.status = "finished";
    this.state.finishedAt = now;
    return this.getState();
  }
}
