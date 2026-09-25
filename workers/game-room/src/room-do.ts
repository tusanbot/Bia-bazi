import { buildInitialState, chooseHokm, discardTwo, drawTwo, playCard, finishHand, createHokmRoom, type HokmPlayerCount, type HokmState, type Suit } from "@bia-bazi/hokm-engine";
import { GameRoom, type GameRoomState } from "@bia-bazi/game-room";

export interface Env { GAME_ROOM: DurableObjectNamespace; }
type PlayerInput = { id: string; displayName: string; username?: string };
type Action =
  | { type: "create"; gameId: "hokm"; playerCount: HokmPlayerCount; host: PlayerInput }
  | { type: "state" } | { type: "join"; player: PlayerInput }
  | { type: "change_player_count"; playerCount: HokmPlayerCount }
  | { type: "leave"; playerId: string } | { type: "start" }
  | { type: "playing" } | { type: "finish" };

export class GameRoomDurableObject {
  private room?: GameRoom;
  private game?: import("@bia-bazi/hokm-engine").HokmState;
  constructor(private state: DurableObjectState) {}

  private async load() {
    if (this.room) return this.room;
    const stored = await this.state.storage.get<GameRoomState>("room");
    if (stored) this.room = new GameRoom(stored);
    this.game = await this.state.storage.get<HokmState>("game");
    return this.room;
  }

  private async save(room: GameRoom) {
    this.room = room;
    await this.state.storage.put("room", room.getState());
    if (this.game) await this.state.storage.put("game", this.game);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const action: Action = request.method === "GET" ? { type: "state" } : await request.json<Action>();

      if (action.type === "create") {
        if (await this.load()) throw new Error("Room already exists");
        const room = createHokmRoom(this.state.id.toString(), action.playerCount, action.host);
        await this.save(room);
        return Response.json(room.getState(), { status: 201 });
      }

      const room = await this.load();
      if (!room) throw new Error("Room does not exist");

      switch (action.type) {
        case "state": return Response.json({ room: room.getState(), game: this.game ?? null });
        case "join": room.join(action.player); break;
        case "change_player_count": room.setPlayerCount(action.playerCount); break;
        case "leave": room.leave(action.playerId); break;
        case "start":
          room.start();
          this.game = buildInitialState(room.getState().players.map(({ id, seat }) => ({ id, seat })), room.getState().players[0].id, room.getState().players[0].id);
          room.markPlaying();
          break;
        case "playing": room.markPlaying(); break;
        case "finish": room.finish(); break;
        default: throw new Error("Unknown action");
      }

      await this.save(room);
      return Response.json({ room: room.getState(), game: this.game ?? null });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const roomId = new URL(request.url).searchParams.get("room");
    if (!roomId) return Response.json({ error: "room is required" }, { status: 400 });
    const id = env.GAME_ROOM.idFromName(roomId);
    return env.GAME_ROOM.get(id).fetch(request);
  }
};
