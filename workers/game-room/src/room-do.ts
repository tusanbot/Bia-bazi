import {
  buildInitialState,
  chooseHokm,
  discardTwo,
  drawTwo,
  playCard,
  finishHand,
  createHokmRoom,
  type HokmPlayerCount,
  type HokmState,
  type Suit
} from "@bia-bazi/hokm-engine";
import { GameRoom, type GameRoomState } from "@bia-bazi/game-room";

export interface Env { GAME_ROOM: DurableObjectNamespace; }

type PlayerInput = { id: string; displayName: string; username?: string };

type Action =
  | { type: "create"; gameId: "hokm"; playerCount: HokmPlayerCount; host: PlayerInput }
  | { type: "state" }
  | { type: "join"; player: PlayerInput }
  | { type: "leave"; playerId: string }
  | { type: "change_player_count"; playerCount: HokmPlayerCount }
  | { type: "start" }
  | { type: "choose_hokm"; playerId: string; suit: Suit }
  | { type: "discard_two"; playerId: string; cardIds: string[] }
  | { type: "draw_two"; playerId: string; keep: boolean }
  | { type: "play_card"; playerId: string; cardId: string }
  | { type: "finish_hand" };

export class GameRoomDurableObject {
  private room?: GameRoom;
  private game?: HokmState;

  constructor(private state: DurableObjectState) {}

  private async load() {
    if (this.room) return this.room;
    const stored = await this.state.storage.get<GameRoomState>("room");
    if (stored) this.room = new GameRoom(stored);
    this.game = await this.state.storage.get<HokmState>("game");
    return this.room;
  }

  private async save() {
    if (!this.room) throw new Error("Room does not exist");
    await this.state.storage.put("room", this.room.getState());
    if (this.game) await this.state.storage.put("game", this.game);
  }

  private response() {
    if (!this.room) throw new Error("Room does not exist");
    return Response.json({ room: this.room.getState(), game: this.game ?? null });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      await this.load();

      const action: Action =
        request.method === "GET"
          ? { type: "state" }
          : await request.json<Action>();

      if (action.type === "create") {
        if (this.room) throw new Error("Room already exists");
        this.room = createHokmRoom(
          this.state.id.toString(),
          action.playerCount,
          action.host
        );
        await this.save();
        return Response.json({ room: this.room.getState(), game: null }, { status: 201 });
      }

      if (!this.room) throw new Error("Room does not exist");

      switch (action.type) {
        case "state":
          return this.response();

        case "join":
          this.room.join(action.player);
          break;

        case "leave":
          this.room.leave(action.playerId);
          break;

        case "change_player_count":
          this.room.setPlayerCount(action.playerCount);
          break;

        case "start": {
          this.room.start();
          const players = this.room.getState().players.map(({ id, seat }) => ({ id, seat }));
          const hostId = this.room.getState().hostId;
          this.game = buildInitialState(players, hostId, hostId);
          this.room.markPlaying();
          break;
        }

        case "choose_hokm":
          this.requireGame();
          this.game = chooseHokm(this.game, action.playerId, action.suit);
          break;

        case "discard_two":
          this.requireGame();
          this.game = discardTwo(this.game, action.playerId, action.cardIds);
          break;

        case "draw_two":
          this.requireGame();
          this.game = drawTwo(this.game, action.playerId, action.keep);
          break;

        case "play_card":
          this.requireGame();
          this.game = playCard(this.game, action.playerId, action.cardId);
          break;

        case "finish_hand":
          this.requireGame();
          this.game = finishHand(this.game);
          if (this.game.phase === "game_finished") {
            this.room.finish();
          }
          break;

        case "create":
          throw new Error("Room already exists");
      }

      await this.save();
      return this.response();
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 400 }
      );
    }
  }

  private requireGame(): asserts this is this & { game: HokmState } {
    if (!this.game) throw new Error("Game has not started");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const roomId = new URL(request.url).searchParams.get("room");
    if (!roomId) {
      return Response.json({ error: "room is required" }, { status: 400 });
    }

    const id = env.GAME_ROOM.idFromName(roomId);
    return env.GAME_ROOM.get(id).fetch(request);
  }
};
