import type { GamePlayer } from "@bia-bazi/game-engine";
import { GameRoom, type GameRoomConfig } from "@bia-bazi/game-room";

export type HokmPlayerCount = 2 | 3 | 4;

export interface HokmRoomConfig extends GameRoomConfig {
  gameId: "hokm";
  playerCount: HokmPlayerCount;
  minPlayers: HokmPlayerCount;
  maxPlayers: HokmPlayerCount;
}

export function createHokmRoomConfig(playerCount: HokmPlayerCount): HokmRoomConfig {
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    throw new Error("Hokm supports exactly 2, 3 or 4 players");
  }

  return {
    gameId: "hokm",
    playerCount,
    minPlayers: 2,
    maxPlayers: 4
  };
}

export function createHokmRoom(
  roomId: string,
  playerCount: HokmPlayerCount,
  host: Omit<GamePlayer, "seat"> & { displayName: string; username?: string },
  now = Date.now()
): GameRoom {
  return GameRoom.create(roomId, createHokmRoomConfig(playerCount), host, now);
}
