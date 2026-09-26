import {
  buildInitialState,
  chooseHokm,
  discardTwo,
  drawTwo,
  playCard,
  finishHand,
  startNextHand,
  createHokmRoom,
  type HokmPlayerCount,
  type HokmState,
  type Suit
} from "@bia-bazi/hokm-engine";
import { GameRoom, type GameRoomState } from "@bia-bazi/game-room";

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
}

type ActiveRoom = {
  id: string;
  gameId: string;
  playerCount: number;
  currentPlayers: number;
  hostName: string;
  createdAt: number;
  updatedAt: number;
};

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type Action =
  | { type: "create"; gameId: "hokm"; playerCount: HokmPlayerCount; host: unknown; initData: string }
  | { type: "create_or_join_group"; gameId: "hokm"; playerCount: HokmPlayerCount; initData: string }
  | { type: "state" }
  | { type: "join"; player: unknown; initData: string }
  | { type: "leave"; playerId: string; initData: string }
  | { type: "change_player_count"; playerCount: HokmPlayerCount; initData: string }
  | { type: "start"; initData: string }
  | { type: "choose_hokm"; playerId: string; suit: Suit; initData: string }
  | { type: "discard_two"; playerId: string; cardIds: string[]; initData: string }
  | { type: "draw_two"; playerId: string; keep: boolean; initData: string }
  | { type: "play_card"; playerId: string; cardId: string; initData: string }
  | { type: "finish_hand"; initData: string }
  | { type: "next_hand"; initData: string }
  | { type: "list_rooms"; initData: string };

function displayName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "بازیکن";
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyTelegramInitData(initData: string, botToken: string): Promise<TelegramUser> {
  const token = botToken.trim();

  if (!token) throw new Error("Telegram bot token is not configured on the Worker");
  if (!initData) throw new Error("Telegram initData is missing; open the game from Telegram");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date") || 0);

  if (!receivedHash || !authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new Error("Invalid or expired Telegram authentication");
  }

  const checkString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const encoder = new TextEncoder();

  // Telegram Web Apps validation:
  // secret_key = HMAC-SHA256(key=bot_token, message="WebAppData")
  // Telegram's current official documentation specifies the bot token as
  // the HMAC key and the literal "WebAppData" as the message.
  const botTokenKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secret = await crypto.subtle.sign(
    "HMAC",
    botTokenKey,
    encoder.encode("WebAppData")
  );

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    dataKey,
    encoder.encode(checkString)
  );

  const expectedHash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  if (!constantTimeEqual(expectedHash, receivedHash)) {
    // Telegram also provides an Ed25519 signature for third-party validation.
    // Use it as an independent fallback so a token mismatch can no longer
    // masquerade as a generic "invalid signature" error.
    const signature = params.get("signature");

    if (signature) {
      try {
        const meResponse = await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`
        );

        if (!meResponse.ok) {
          throw new Error(
            "Worker Telegram bot token is rejected by Telegram. Check/replace the TELEGRAM_BOT_TOKEN secret on Cloudflare."
          );
        }

        const meJson = await meResponse.json() as {
          ok?: boolean;
          result?: { id?: number };
        };

        const botId = meJson.result?.id;
        if (!meJson.ok || !botId) {
          throw new Error("Worker Telegram bot token could not be identified");
        }

        // Telegram Ed25519 validation excludes both hash and signature.
        // The signed payload starts with the Worker-resolved bot ID.
        const signatureCheckString = [
          botId + ":WebAppData",
          ...[...params.entries()]
            .filter(([key]) => key !== "hash" && key !== "signature")
            .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
            .map(([key, value]) => key + "=" + value)
        ].join("\n");

        const publicKeyHex =
          "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";

        const hexToBytes = (hex: string) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
          }
          return bytes;
        };

        const base64UrlToBytes = (value: string) => {
          const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
          const binary = atob(padded);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        };

        const publicKey = await crypto.subtle.importKey(
          "raw",
          hexToBytes(publicKeyHex),
          { name: "Ed25519" },
          false,
          ["verify"]
        );

        const validSignature = await crypto.subtle.verify(
          "Ed25519",
          publicKey,
          base64UrlToBytes(signature),
          encoder.encode(signatureCheckString)
        );

        if (!validSignature) {
          throw new Error(
            "Telegram authentication failed: the Worker bot token does not match the bot that opened this Mini App, or Telegram initData was modified"
          );
        }

        // The Telegram Ed25519 signature is independently valid, so the
        // Mini App data is authentic even if the bot-token HMAC does not match.
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Telegram authentication failed:")) {
          throw error;
        }
        throw new Error(
          error instanceof Error
            ? error.message
            : "Telegram authentication failed"
        );
      }
    } else {
      throw new Error(
        "Invalid Telegram authentication signature. The Worker TELEGRAM_BOT_TOKEN may belong to a different bot than this Mini App."
      );
    }
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user is missing");

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new Error("Invalid Telegram user data");
  }

  if (!user.id) throw new Error("Telegram user id is missing");
  return user;
}

export class GameRoomDurableObject {
  private room?: GameRoom;
  private game?: HokmState;

  constructor(private state: DurableObjectState, private env: Env) {}

  private async load() {
    if (this.room) return this.room;
    const storedRoom = await this.state.storage.get<GameRoomState>("room");
    if (storedRoom) this.room = new GameRoom(storedRoom);
    this.game = await this.state.storage.get<HokmState>("game");
    return this.room;
  }

  private async save() {
    if (!this.room) throw new Error("Room does not exist");
    await this.state.storage.put("room", this.room.getState());
    if (this.game) await this.state.storage.put("game", this.game);
  }

  private async syncRegistry() {
    if (!this.room || this.state.id.toString() === "__room_registry__") return;
    try {
      const state = this.room.getState();
      const registryId = this.env.GAME_ROOM.idFromName("__room_registry__");
      const registry = this.env.GAME_ROOM.get(registryId);
      const payload: ActiveRoom | null = state.status === "waiting"
        ? {
            id: state.id,
            gameId: state.config.gameId,
            playerCount: state.config.playerCount,
            currentPlayers: state.players.length,
            hostName: state.players.find(p => p.id === state.hostId)?.displayName || "میزبان",
            createdAt: state.createdAt,
            updatedAt: Date.now()
          }
        : null;
      await registry.fetch("https://internal/registry", {
        method: "POST",
        headers: { "x-room-registry-token": this.env.TELEGRAM_BOT_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({ type: "sync", room: payload, roomId: state.id })
      });
    } catch {
      // The live game must remain available even if the discovery registry is temporarily unavailable.
    }
  }

  private response(viewerId?: string) {
    if (!this.room) throw new Error("Room does not exist");

    if (!this.game) {
      return Response.json({ room: this.room.getState(), game: null });
    }

    if (!viewerId) throw new Error("Authentication required");

    const game = structuredClone(this.game);
    game.deck = [];
    game.removedCards = [];

    for (const player of game.players) {
      if (player.id !== viewerId) game.hands[player.id] = [];
    }

    if (game.twoPlayerBuild) {
      game.twoPlayerBuild.stock = [];
      game.twoPlayerBuild.discarded = [];
      for (const player of game.players) {
        if (player.id !== viewerId) game.twoPlayerBuild.kept[player.id] = [];
      }
    }

    return Response.json({ room: this.room.getState(), game });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const requestedRoomId = new URL(request.url).searchParams.get("room") || this.state.id.toString();

      const isRegistryRequest =
        request.headers.get("x-room-registry-request") === "1" ||
        request.headers.get("x-room-registry-token") === this.env.TELEGRAM_BOT_TOKEN;

      if (isRegistryRequest) {
        if (request.method === "POST" && request.headers.get("x-room-registry-token") === this.env.TELEGRAM_BOT_TOKEN) {
          const body = await request.json<{ type: "sync"; room: ActiveRoom | null; roomId: string }>();
          const rooms = (await this.state.storage.get<Record<string, ActiveRoom>>("rooms")) || {};
          if (body.room) rooms[body.room.id] = body.room;
          else delete rooms[body.roomId];
          await this.state.storage.put("rooms", rooms);
          return Response.json({ ok: true });
        }

        if (request.method === "GET") {
          const initData = request.headers.get("x-telegram-init-data") || "";
          await verifyTelegramInitData(initData, this.env.TELEGRAM_BOT_TOKEN);
          const rooms = (await this.state.storage.get<Record<string, ActiveRoom>>("rooms")) || {};
          const active = Object.values(rooms)
            .filter(room => Date.now() - room.updatedAt < 30 * 60 * 1000)
            .sort((a, b) => b.updatedAt - a.updatedAt);
          return Response.json({ rooms: active });
        }

        return Response.json({ error: "Not found" }, { status: 404 });
      }

      await this.load();

      const action: Action = request.method === "GET"
        ? { type: "state" }
        : await request.json<Action>();

      const botToken = request.headers.get("x-bia-bot-token") || "";

      if (action.type === "state") {
        const initData = request.headers.get("x-telegram-init-data") || "";
        const telegramUser = await verifyTelegramInitData(initData, botToken);
        const viewerId = String(telegramUser.id);

        if (!this.room) throw new Error("Room does not exist");
        if (!this.room.getState().players.some(player => player.id === viewerId)) {
          throw new Error("You are not a player in this room");
        }

        return this.response(viewerId);
      }

      const telegramUser = await verifyTelegramInitData(action.initData, botToken);
      const userId = String(telegramUser.id);

      if (action.type === "list_rooms") {
        throw new Error("Room list is served by the registry endpoint");
      }

      if (action.type === "create") {
        if (this.room) throw new Error("Room already exists");

        this.room = createHokmRoom(
          requestedRoomId,
          action.playerCount,
          {
            id: userId,
            displayName: displayName(telegramUser),
            username: telegramUser.username
          }
        );

        await this.save();
        await this.syncRegistry();
        return Response.json({ room: this.room.getState(), game: null }, { status: 201 });
      }

      if (action.type === "create_or_join_group") {
        if (!this.room) {
          this.room = createHokmRoom(
            requestedRoomId,
            action.playerCount,
            {
              id: userId,
              displayName: displayName(telegramUser),
              username: telegramUser.username
            }
          );
        } else {
          this.room.join({
            id: userId,
            displayName: displayName(telegramUser),
            username: telegramUser.username
          });
        }

        await this.save();
        await this.syncRegistry();
        return Response.json({ room: this.room.getState(), game: null });
      }

      if (!this.room) throw new Error("Room does not exist");

      switch (action.type) {
        case "join":
          this.room.join({
            id: userId,
            displayName: displayName(telegramUser),
            username: telegramUser.username
          });
          break;

        case "leave":
          if (action.playerId !== userId) throw new Error("You can only leave as yourself");
          this.room.leave(userId);
          break;

        case "change_player_count":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can change player count");
          this.room.setPlayerCount(action.playerCount);
          break;

        case "start": {
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can start the game");
          this.room.start();
          const players = this.room.getState().players.map(({ id, seat }) => ({ id, seat }));
          this.game = buildInitialState(players, userId, userId);
          this.room.markPlaying();
          break;
        }

        case "choose_hokm":
          this.requireGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.game = chooseHokm(this.game, userId, action.suit);
          break;

        case "discard_two":
          this.requireGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.game = discardTwo(this.game, userId, action.cardIds);
          break;

        case "draw_two":
          this.requireGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.game = drawTwo(this.game, userId, action.keep);
          break;

        case "play_card":
          this.requireGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.game = playCard(this.game, userId, action.cardId);
          break;

        case "finish_hand":
          this.requireGame();
          if (!this.game.players.some(player => player.id === userId)) throw new Error("You are not a player");
          this.game = finishHand(this.game);
          if (this.game.phase === "game_finished") this.room.finish();
          break;

        case "next_hand":
          this.requireGame();
          if (!this.game.players.some(player => player.id === userId)) throw new Error("You are not a player");
          this.game = startNextHand(this.game);
          break;

        case "state":
        case "create":
          throw new Error("Invalid action");
      }

      await this.save();
      await this.syncRegistry();
      return this.response(userId);
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
    const url = new URL(request.url);

    // The same Worker serves both the Mini App and the game backend.
    // All /api/room traffic is routed to the Durable Object; everything
    // else is served from the Next.js static export.
    if (url.pathname === "/api/rooms") {
      const initData = request.headers.get("x-telegram-init-data") || "";
      if (!initData) return Response.json({ error: "Telegram authentication required" }, { status: 401 });
      const registryId = env.GAME_ROOM.idFromName("__room_registry__");
      return env.GAME_ROOM.get(registryId).fetch("https://internal/registry", {
        method: "GET",
        headers: { "x-telegram-init-data": initData, "x-room-registry-request": "1" }
      });
    }

    if (url.pathname === "/api/mini-app-link") {
      const roomId = url.searchParams.get("room") || "";
      if (!roomId) return Response.json({ error: "room is required" }, { status: 400 });
      const response = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(env.TELEGRAM_BOT_TOKEN)}/getMe`
      );
      const json = await response.json() as { ok?: boolean; result?: { username?: string } };
      const username = json.result?.username;
      if (!response.ok || !json.ok || !username) {
        return Response.json({ error: "Telegram bot username could not be resolved" }, { status: 502 });
      }
      return Response.json({
        url: `https://t.me/${username}?startapp=${encodeURIComponent(`room_${roomId}`)}`
      });
    }

    if (url.pathname === "/api/room") {
      const roomId = url.searchParams.get("room");
      if (!roomId) {
        return Response.json({ error: "room is required" }, { status: 400 });
      }

      const id = env.GAME_ROOM.idFromName(roomId);
      const headers = new Headers(request.headers);
      headers.set("x-bia-bot-token", env.TELEGRAM_BOT_TOKEN);

      return env.GAME_ROOM.get(id).fetch(new Request(request, { headers }));
    }

    return env.ASSETS.fetch(request);
  }
};
