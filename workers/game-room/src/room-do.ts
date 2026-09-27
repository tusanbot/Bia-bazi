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
  TELEGRAM_WEBHOOK_SECRET?: string;
  DB?: D1Database;
}

type ActiveRoom = {
  id: string;
  gameId: string;
  playerCount: number;
  currentPlayers: number;
  hostName: string;
  createdAt: number;
  updatedAt: number;
  status: "waiting" | "playing" | "finished" | "cancelled" | "closed";
};

type PlayerStats = {
  playerId: string;
  displayName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  rating: number;
  currentStreak: number;
  bestStreak: number;
  updatedAt: number;
};

type ChatMessage = {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  createdAt: number;
};

type GameResultRecord = {
  roomId: string;
  gameId: string;
  playerId: string;
  displayName: string;
  placement: number;
  score: number;
  scoreDelta: number;
  won: boolean;
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
  | { type: "create_group_room"; gameId: "hokm"; playerCount: HokmPlayerCount; chatId: string; hostId: string; hostName: string }
  | { type: "create_inline_room"; gameId: "hokm"; playerCount: HokmPlayerCount; hostId: string; hostName: string }
  | { type: "state" }
  | { type: "join"; player: unknown; initData: string }
  | { type: "leave"; playerId: string; initData: string }
  | { type: "change_player_count"; playerCount: HokmPlayerCount; initData: string }
  | { type: "set_target_score"; targetScore: 1 | 3 | 5 | 7; initData: string }
  | { type: "start"; initData: string }
  | { type: "choose_hokm"; playerId: string; suit: Suit; initData: string }
  | { type: "discard_two"; playerId: string; cardIds: string[]; initData: string }
  | { type: "draw_two"; playerId: string; keep: boolean; initData: string }
  | { type: "play_card"; playerId: string; cardId: string; initData: string }
  | { type: "finish_hand"; initData: string }
  | { type: "next_hand"; initData: string }
  | { type: "request_finish"; initData: string }
  | { type: "cancel_room"; initData: string }
  | { type: "close_room"; initData: string }
  | { type: "send_message"; text: string; initData: string }
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
  private stopAfterOddHand = false;
  private chatMessages: ChatMessage[] = [];

  constructor(private state: DurableObjectState, private env: Env) {}

  private async load() {
    if (this.room) return this.room;
    const storedRoom = await this.state.storage.get<GameRoomState>("room");
    if (storedRoom) this.room = new GameRoom(storedRoom);
    this.game = await this.state.storage.get<HokmState>("game");
    this.stopAfterOddHand = (await this.state.storage.get<boolean>("stop_after_odd_hand")) ?? false;
    this.chatMessages = (await this.state.storage.get<ChatMessage[]>("chat_messages")) ?? [];
    return this.room;
  }

  private async save() {
    if (!this.room) throw new Error("Room does not exist");
    await this.state.storage.put("room", this.room.getState());
    if (this.game) await this.state.storage.put("game", this.game);
    await this.state.storage.put("stop_after_odd_hand", this.stopAfterOddHand);
    await this.state.storage.put("chat_messages", this.chatMessages.slice(-100));
  }

  private async persistUser(user: TelegramUser) {
    if (!this.env.DB) return;
    await this.env.DB.prepare(
      "INSERT INTO users (telegram_id, username, first_name, last_name, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name, last_name = excluded.last_name, updated_at = CURRENT_TIMESTAMP"
    ).bind(user.id, user.username ?? null, user.first_name ?? "", user.last_name ?? null).run();
    await this.env.DB.prepare(
      "INSERT INTO player_stats (user_id) SELECT id FROM users WHERE telegram_id = ? ON CONFLICT(user_id) DO NOTHING"
    ).bind(user.id).run();
  }

  private async persistRoom() {
    if (!this.env.DB || !this.room) return;
    const state = this.room.getState();
    const creator = Number(state.players.find(p => p.id === state.hostId)?.id ?? 0);
    await this.env.DB.prepare(
      "INSERT INTO game_rooms (id, game_type, status, creator_telegram_id, max_players, created_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, max_players = excluded.max_players, started_at = COALESCE(game_rooms.started_at, excluded.started_at), finished_at = excluded.finished_at"
    ).bind(state.id, state.config.gameId, state.status, creator, state.config.playerCount, Math.floor(state.createdAt / 1000), state.status === "playing" ? new Date().toISOString() : null, state.status === "finished" ? new Date().toISOString() : null).run();
    for (const player of state.players) {
      await this.env.DB.prepare(
        "INSERT INTO game_players (room_id, telegram_id, seat, status) VALUES (?, ?, ?, 'active') ON CONFLICT(room_id, telegram_id) DO UPDATE SET seat = excluded.seat, status = 'active'"
      ).bind(state.id, Number(player.id), player.seat).run();
    }
  }

  private async persistGameResult(game: HokmState) {
    if (!this.env.DB || !this.room) return;
    const roomId = this.room.getState().id;
    const ranking = game.players.map(player => ({ player, score: game.scores[player.id] ?? 0 })).sort((a, b) => b.score - a.score);
    for (let i = 0; i < ranking.length; i++) {
      const item = ranking[i];
      const telegramId = Number(item.player.id);
      const scoreDelta = item.score;
      const won = i === 0;
      const existing = await this.env.DB.prepare("SELECT id FROM game_results WHERE room_id = ? AND telegram_id = ? LIMIT 1").bind(roomId, telegramId).first<{ id: number }>();
      if (existing) continue;
      const user = await this.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ? LIMIT 1").bind(telegramId).first<{ id: number }>();
      if (!user) continue;
      const ratingDelta = won ? 10 : -5;
      await this.env.DB.prepare("INSERT INTO game_results (room_id, telegram_id, placement, score_delta, rating_delta) VALUES (?, ?, ?, ?, ?)").bind(roomId, telegramId, i + 1, scoreDelta, ratingDelta).run();
      await this.env.DB.prepare(
        "UPDATE player_stats SET rating = rating + ?, games_played = games_played + 1, wins = wins + ?, losses = losses + ?, current_streak = CASE WHEN ? = 1 THEN current_streak + 1 ELSE 0 END, best_streak = CASE WHEN ? = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(ratingDelta, won ? 1 : 0, won ? 0 : 1, won ? 1 : 0, won ? 1 : 0, user.id).run();
    }
  }

  private async syncRegistry() {
    if (!this.room || this.state.id.toString() === "__room_registry__") return;
    try {
      const state = this.room.getState();
      const registryId = this.env.GAME_ROOM.idFromName("__room_registry__");
      const registry = this.env.GAME_ROOM.get(registryId);
          const payload: ActiveRoom | null = ["waiting", "playing", "finished"].includes(state.status)
        ? {
            id: state.id,
            gameId: state.config.gameId,
            playerCount: state.config.playerCount,
            currentPlayers: state.players.length,
            hostName: state.players.find(p => p.id === state.hostId)?.displayName || "میزبان",
            createdAt: state.createdAt,
            updatedAt: Date.now(),
            status: state.status as ActiveRoom["status"]
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
      // In the two-card draw phase, only the player whose turn it is may
      // see the two privately revealed stock cards.
      if (game.twoPlayerBuild.currentPlayer !== viewerId) {
        game.twoPlayerBuild.drawOptions = [];
      }
    }

    return Response.json({
      room: this.room.getState(),
      game,
      stopAfterOddHand: this.stopAfterOddHand,
      chatMessages: this.chatMessages
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get("x-room-health-check") === "1") {
        await this.load();
        return Response.json({ exists: Boolean(this.room), status: this.room?.getState().status ?? null });
      }

      const requestedRoomId = new URL(request.url).searchParams.get("room") || this.state.id.toString();

      const isRegistryRequest =
        request.headers.get("x-room-registry-request") === "1" ||
        request.headers.get("x-room-registry-token") === this.env.TELEGRAM_BOT_TOKEN;

      if (isRegistryRequest) {
        if (request.method === "POST" && request.headers.get("x-room-registry-token") === this.env.TELEGRAM_BOT_TOKEN) {
          const body = await request.json<
            | { type: "sync"; room: ActiveRoom | null; roomId: string }
            | { type: "record_result"; result: GameResultRecord }
          >();

          if (body.type === "record_result") {
            const stats = (await this.state.storage.get<Record<string, PlayerStats>>("player_stats")) || {};
            const key = body.result.playerId;
            const existing = stats[key] || {
              playerId: key,
              displayName: body.result.displayName,
              gamesPlayed: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              score: 0,
              rating: 1000,
              currentStreak: 0,
              bestStreak: 0,
              updatedAt: Date.now()
            };
            const resultKeys = (await this.state.storage.get<Record<string, true>>("recorded_results")) || {};
            const resultKey = body.result.roomId + ":" + body.result.playerId;

            if (!resultKeys[resultKey]) {
              existing.displayName = body.result.displayName || existing.displayName;
              existing.gamesPlayed += 1;
              existing.score += body.result.scoreDelta;
              existing.rating += body.result.won ? 10 : -5;

              if (body.result.won) {
                existing.wins += 1;
                existing.currentStreak += 1;
                existing.bestStreak = Math.max(existing.bestStreak, existing.currentStreak);
              } else {
                existing.losses += 1;
                existing.currentStreak = 0;
              }

              existing.updatedAt = Date.now();
              stats[key] = existing;
              resultKeys[resultKey] = true;
              await this.state.storage.put("player_stats", stats);
              await this.state.storage.put("recorded_results", resultKeys);
            }

            return Response.json({ ok: true, stats: existing });
          }

          const rooms = (await this.state.storage.get<Record<string, ActiveRoom>>("rooms")) || {};
          if (body.room) rooms[body.room.id] = body.room;
          else delete rooms[body.roomId];
          await this.state.storage.put("rooms", rooms);
          return Response.json({ ok: true });
        }

        const initData = request.headers.get("x-telegram-init-data") || "";
        await verifyTelegramInitData(initData, this.env.TELEGRAM_BOT_TOKEN);

        if (request.method === "GET" && new URL(request.url).searchParams.get("view") === "ranking") {
          const stats = (await this.state.storage.get<Record<string, PlayerStats>>("player_stats")) || {};
          const ranking = Object.values(stats)
            .sort((a, b) => b.rating - a.rating || b.wins - a.wins || b.score - a.score)
            .slice(0, 100);
          return Response.json({ ranking });
        }

        if (request.method === "GET") {
          const rooms = (await this.state.storage.get<Record<string, ActiveRoom>>("rooms")) || {};
          const active = [] as ActiveRoom[];
          for (const room of Object.values(rooms)) {
            if (Date.now() - room.updatedAt >= 24 * 60 * 60 * 1000) {
              delete rooms[room.id];
              continue;
            }
            try {
              const roomId = this.env.GAME_ROOM.idFromName(room.id);
              const health = await this.env.GAME_ROOM.get(roomId).fetch("https://internal/health", { headers: { "x-room-health-check": "1" } });
              const healthJson = await health.json() as { exists?: boolean; status?: string | null };
              if (!healthJson.exists || !["waiting", "playing"].includes(healthJson.status || "")) {
                delete rooms[room.id];
                continue;
              }
              const cleanedRoom = { ...room, status: healthJson.status as ActiveRoom["status"], updatedAt: Date.now() };
              active.push(cleanedRoom);
              rooms[room.id] = cleanedRoom;
            } catch {
              delete rooms[room.id];
            }
          }
          await this.state.storage.put("rooms", rooms);
          active.sort((a, b) => b.updatedAt - a.updatedAt);
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

      if (action.type === "create_group_room" || action.type === "create_inline_room") {
        if (request.headers.get("x-bia-bot-token") !== this.env.TELEGRAM_BOT_TOKEN) throw new Error("Unauthorized bot action");
        const roomId = action.type === "create_group_room" ? `group-${action.chatId}-hokm4` : `inline-${action.hostId}-${Date.now().toString(36)}`;
        if (!this.room) {
          this.room = createHokmRoom(roomId, action.playerCount, { id: action.hostId, displayName: action.hostName });
          await this.persistRoom();
          await this.save();
          await this.syncRegistry();
        }
        return Response.json({ room: this.room.getState(), game: null });
      }

      const telegramUser = await verifyTelegramInitData(action.initData, botToken);
      const userId = String(telegramUser.id);
      await this.persistUser(telegramUser);

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
          },
          Date.now(),
          7
        );

        await this.persistRoom();
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

        await this.persistRoom();
      await this.save();
        await this.syncRegistry();
        return Response.json({ room: this.room.getState(), game: null });
      }

      if (!this.room) throw new Error("Room does not exist");

      if (
        ["choose_hokm", "discard_two", "draw_two", "play_card", "next_hand"].includes(action.type) &&
        this.room.getState().status !== "playing"
      ) {
        throw new Error("Room is no longer playing");
      }

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

        case "set_target_score":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can change the match length");
          if (this.room.getState().status !== "waiting") throw new Error("Match length can only be changed before the game starts");
          this.room.getState().config.targetScore = action.targetScore;
          {
            const roomState = this.room.getState();
            roomState.config.targetScore = action.targetScore;
            this.room = new GameRoom(roomState);
          }
          break;

        case "start": {
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can start the game");
          this.room.start();
          const players = this.room.getState().players.map(({ id, seat, displayName, username }) => ({ id, seat, displayName, username }));
          this.game = buildInitialState(
            players,
            userId,
            userId,
            Math.random,
            this.room.getState().config.targetScore ?? 7,
            0
          );
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
          if (this.game.phase === "hand_finished") {
            this.game = finishHand(this.game);

            if (this.stopAfterOddHand && this.game.handsCompleted % 2 === 1) {
              this.game.phase = "game_finished";
            }

            if (this.game.phase === "game_finished") {
              this.room.finish();
              await this.persistRoom();
              await this.persistGameResult(this.game);
            }
          }
          break;

        case "finish_hand":
          throw new Error("Hand results are recorded automatically");

        case "next_hand":
          this.requireGame();
          if (!this.game.players.some(player => player.id === userId)) throw new Error("You are not a player");
          this.game = startNextHand(this.game);
          break;

        case "request_finish":
          this.requireGame();
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can finish the game");
          if (this.room.getState().status !== "playing") throw new Error("Game is not playing");
          this.stopAfterOddHand = true;
          if (this.game.phase === "hand_finished" && this.game.handsCompleted % 2 === 1) {
            this.game.phase = "game_finished";
            this.room.finish();
            await this.persistRoom();
            await this.persistGameResult(this.game);
          }
          break;

        case "cancel_room":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can cancel the room");
          this.room.cancel();
          break;

        case "close_room":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can close the room");
          this.room.close();
          break;

        case "send_message": {
          if (!this.room.getState().players.some(player => player.id === userId)) throw new Error("You are not a player");
          const text = action.text.trim();
          if (!text) throw new Error("Message cannot be empty");
          if (text.length > 300) throw new Error("Message is too long");
          this.chatMessages.push({
            id: crypto.randomUUID(),
            playerId: userId,
            displayName: displayName(telegramUser),
            text,
            createdAt: Date.now()
          });
          this.chatMessages = this.chatMessages.slice(-100);
          break;
        }

        case "state":
        case "create":
          throw new Error("Invalid action");
      }

      await this.persistRoom();
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

  private async recordFinalResult(game: HokmState) {
    const registryId = this.env.GAME_ROOM.idFromName("__room_registry__");
    const registry = this.env.GAME_ROOM.get(registryId);
    const rankingScores = game.players.map(player => ({
      player,
      score: game.scores[player.id] || 0
    })).sort((a, b) => b.score - a.score);

    for (let i = 0; i < rankingScores.length; i++) {
      const item = rankingScores[i];
      await registry.fetch("https://internal/registry", {
        method: "POST",
        headers: {
          "x-room-registry-token": this.env.TELEGRAM_BOT_TOKEN,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          type: "record_result",
          result: {
            roomId: this.room!.getState().id,
            gameId: this.room!.getState().config.gameId,
            playerId: item.player.id,
            displayName: item.player.displayName || item.player.username || "بازیکن",
            placement: i + 1,
            score: item.score,
            scoreDelta: item.score,
            won: i === 0
          } satisfies GameResultRecord
        })
      });
    }
  }

  private requireGame(): asserts this is this & { game: HokmState } {
    if (!this.game) throw new Error("Game has not started");
  }
}



type BotUpdate = {
  message?: { chat: { id: number; type: string }; from?: { id: number; first_name?: string; last_name?: string; username?: string }; text?: string };
  inline_query?: { id: string; from: { id: number; first_name?: string; last_name?: string; username?: string }; query: string; chat_type?: string };
};

async function telegramBotApi(token: string, method: string, body: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return response.json() as Promise<any>;
}

function botUserName(user?: { first_name?: string; last_name?: string; username?: string }) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "بازیکن";
}

async function createBotRoom(env: Env, roomId: string, hostId: string, hostName: string, chatId?: string) {
  const id = env.GAME_ROOM.idFromName(roomId);
  const response = await env.GAME_ROOM.get(id).fetch(`https://internal/api/room?room=${encodeURIComponent(roomId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bia-bot-token": env.TELEGRAM_BOT_TOKEN },
    body: JSON.stringify({ type: chatId ? "create_group_room" : "create_inline_room", gameId: "hokm", playerCount: 4, chatId, hostId, hostName })
  });
  const json = await response.json() as { room?: { id: string }; error?: string };
  if (!response.ok || !json.room) throw new Error(json.error || "ساخت اتاق ناموفق بود");
  return json.room;
}

async function handleTelegramWebhook(request: Request, env: Env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const update = await request.json() as BotUpdate;
  const me = await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "getMe", {});
  const username = me?.result?.username as string | undefined;
  if (!username) throw new Error("Bot username unavailable");

  if (update.inline_query) {
    const q = update.inline_query;
    const room = await createBotRoom(env, `inline-${q.from.id}-${Date.now().toString(36)}`, String(q.from.id), botUserName(q.from));
    const link = `https://t.me/${username}?startapp=${encodeURIComponent(`room_${room.id}`)}`;
    await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "answerInlineQuery", {
      inline_query_id: q.id, is_personal: true, cache_time: 0,
      results: [{ type: "article", id: room.id, title: "بازی حکم ۴ نفره", description: "ساخت اتاق حکم و ارسال لینک ورود", input_message_content: { message_text: "🃏 بازی حکم آماده است. برای ورود روی دکمه زیر بزنید." }, reply_markup: { inline_keyboard: [[{ text: "ورود به بازی", url: link }]] } }]
    });
    return Response.json({ ok: true });
  }

  const message = update.message;
  if (message?.text && message.from && (message.chat.type === "group" || message.chat.type === "supergroup")) {
    const command = message.text.trim().split(/\\s+/)[0].split("@")[0].toLowerCase();
    if (command === "/hokm") {
      const room = await createBotRoom(env, `group-${message.chat.id}-hokm4`, String(message.from.id), botUserName(message.from), String(message.chat.id));
      const link = `https://t.me/${username}?startapp=${encodeURIComponent(`room_${room.id}`)}`;
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: message.chat.id, text: "🃏 اتاق حکم آماده است. هر بازیکن برای ورود روی دکمه زیر بزند.", reply_markup: { inline_keyboard: [[{ text: "ورود به بازی حکم", url: link }]] } });
    }
  }
  return Response.json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      try { return await handleTelegramWebhook(request, env); }
      catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "Webhook error" }, { status: 500 }); }
    }
    if (url.pathname === "/telegram/setup" && request.method === "POST") {
      const setupSecret = url.searchParams.get("secret") || request.headers.get("x-telegram-setup-secret");
      if (!env.TELEGRAM_WEBHOOK_SECRET || setupSecret !== env.TELEGRAM_WEBHOOK_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const webhookUrl = new URL("/telegram/webhook", url.origin).toString();
      const commands = [
        { command: "hokm", description: "ساخت اتاق بازی حکم در گروه" },
        { command: "start", description: "باز کردن بیا بازی" }
      ];
      const [webhook, commandResult] = await Promise.all([
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "setWebhook", { url: webhookUrl, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "inline_query"] }),
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "setMyCommands", { commands })
      ]);
      return Response.json({ ok: Boolean(webhook?.ok && commandResult?.ok), webhook, commands: commandResult });
    }

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

    if (url.pathname === "/api/ranking") {
      const initData = request.headers.get("x-telegram-init-data") || "";
      if (!initData) return Response.json({ error: "Telegram authentication required" }, { status: 401 });
      await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
      if (env.DB) {
        const rows = await env.DB.prepare(
          "SELECT u.telegram_id AS playerId, COALESCE(u.first_name || ' ' || u.last_name, u.username, 'بازیکن') AS displayName, s.rating, s.games_played AS gamesPlayed, s.wins, s.losses, s.draws, s.current_streak AS currentStreak, s.best_streak AS bestStreak FROM player_stats s JOIN users u ON u.id = s.user_id ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 100"
        ).all();
        return Response.json({ ranking: rows.results });
      }
      const registryId = env.GAME_ROOM.idFromName("__room_registry__");
      return env.GAME_ROOM.get(registryId).fetch("https://internal/registry?view=ranking", {
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
