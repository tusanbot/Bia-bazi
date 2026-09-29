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
  type Suit,
  type HokmVariantId,
  getHokmVariant,
  startNoTrumpVariant,
  legalCards,
  trickWinner,
  isLegalMove
} from "@bia-bazi/hokm-engine";
import { GameRoom, type GameRoomState } from "@bia-bazi/game-room";
import { createMiniGame, applyMiniAction, type MiniGameId, type MiniGameState } from "@bia-bazi/mini-games";
import {
  createInitialState as createScalaInitialState,
  drawFromDeck as scalaDrawFromDeck,
  drawFromDiscard as scalaDrawFromDiscard,
  recycleDiscard as scalaRecycleDiscard,
  layMelds as scalaLayMelds,
  addCardToMeld as scalaAddCardToMeld,
  replaceMeldJoker as scalaReplaceMeldJoker,
  discard as scalaDiscard,
  startNextRound as scalaStartNextRound,
  type ScalaState,
  type Meld as ScalaMeld
} from "@bia-bazi/scala-quaranta-engine";

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  ADMIN_INTERNAL_TOKEN?: string;
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

type HokmHandHistory = {
  hand: number;
  hokmPlayerId: string;
  hokm?: Suit;
  winnerIds: string[];
  points: Record<string, number>;
  tricks: Record<string, number>;
  scores: Record<string, number>;
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
  | { type: "create"; gameId: "hokm" | "scala_quaranta" | MiniGameId; playerCount: number; host: unknown; initData: string }
  | { type: "create_or_join_group"; gameId: "hokm"; playerCount: HokmPlayerCount; initData: string }
  | { type: "create_group_room"; gameId: "hokm"; playerCount: HokmPlayerCount; roomId: string; chatId: string; hostId: string; hostName: string }
  | { type: "create_inline_room"; gameId: "hokm"; playerCount: HokmPlayerCount; roomId: string; hostId: string; hostName: string }
  | { type: "state" }
  | { type: "join"; player: unknown; initData: string }
  | { type: "leave"; playerId: string; initData: string }
  | { type: "change_player_count"; playerCount: number; initData: string }
  | { type: "set_seat"; playerId: string; seat: number; initData: string }
  | { type: "remove_player"; playerId: string; initData: string }
  | { type: "set_auto_play"; enabled: boolean; delaySeconds: number; initData: string }
  | { type: "set_target_score"; targetScore: 1 | 3 | 5 | 7; initData: string }
  | { type: "set_variant"; variantId: HokmVariantId; initData: string }
  | { type: "start"; initData: string }
  | { type: "scala_draw_deck"; playerId: string; initData: string }
  | { type: "scala_draw_discard"; playerId: string; initData: string }
  | { type: "scala_recycle_discard"; initData: string }
  | { type: "scala_lay_melds"; playerId: string; melds: ScalaMeld[]; initData: string }
  | { type: "scala_add_card"; playerId: string; meldId: string; cardId: string; initData: string }
  | { type: "scala_replace_joker"; playerId: string; meldId: string; cardId: string; initData: string }
  | { type: "scala_discard"; playerId: string; cardId: string; initData: string }
  | { type: "scala_next_round"; initData: string }
  | { type: "choose_hokm"; playerId: string; suit?: Suit; initData: string }
  | { type: "discard_two"; playerId: string; cardIds: string[]; initData: string }
  | { type: "draw_two"; playerId: string; keep: boolean; initData: string }
  | { type: "play_card"; playerId: string; cardId: string; initData: string }
  | { type: "finish_hand"; initData: string }
  | { type: "next_hand"; initData: string }
  | { type: "request_finish"; initData: string }
  | { type: "cancel_room"; initData: string }
  | { type: "close_room"; initData: string }
  | { type: "send_message"; text: string; initData: string }
  | { type: "list_rooms"; initData: string }
  | { type: "mini_action"; action: Record<string, unknown>; playerId: string; initData: string };

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function createAdminSession(env: Env) {
  const secret = env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 });
  const encoded = base64UrlEncode(payload);
  const signature = await hmacHex(secret, encoded);
  return encoded + "." + signature;
}

async function verifyAdminSession(request: Request, env: Env) {
  const secret = env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)bia_admin=([^;]+)/);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 2) return false;
  const expected = await hmacHex(secret, parts[0]);
  if (!constantTimeEqual(expected, parts[1])) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0])) as { exp?: number };
    return Boolean(payload.exp && payload.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

async function requireAdmin(request: Request, env: Env) {
  if (!(await verifyAdminSession(request, env))) {
    throw new Error("ADMIN_UNAUTHORIZED");
  }
}

function adminCookie(value: string, maxAge: number) {
  return `bia_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function ensureOperationalSchema(env: Env) {
  if (!env.DB) return;

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bot_groups (
    chat_id INTEGER PRIMARY KEY, title TEXT, username TEXT,
    type TEXT NOT NULL DEFAULT 'supergroup', member_count INTEGER,
    blocked INTEGER NOT NULL DEFAULT 0, bot_status TEXT,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS group_members (
    chat_id INTEGER NOT NULL, telegram_id INTEGER NOT NULL,
    display_name TEXT, username TEXT, status TEXT NOT NULL DEFAULT 'seen',
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, telegram_id)
  )`).run();

  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_bot_groups_status ON bot_groups(blocked, updated_at DESC)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_group_members_seen ON group_members(chat_id, last_seen_at DESC)`).run();

  const columns = await env.DB.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
  const names = new Set((columns.results || []).map(column => column.name));
  if (!names.has("game_type")) await env.DB.prepare("ALTER TABLE game_rooms ADD COLUMN game_type TEXT NOT NULL DEFAULT 'hokm'").run();
  if (!names.has("group_chat_id")) await env.DB.prepare("ALTER TABLE game_rooms ADD COLUMN group_chat_id INTEGER").run();
  if (!names.has("group_message_id")) await env.DB.prepare("ALTER TABLE game_rooms ADD COLUMN group_message_id INTEGER").run();
  if (!names.has("deleted_at")) await env.DB.prepare("ALTER TABLE game_rooms ADD COLUMN deleted_at TEXT").run();
  if (!names.has("cancelled_at")) await env.DB.prepare("ALTER TABLE game_rooms ADD COLUMN cancelled_at TEXT").run();

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS player_game_stats (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1000,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, game_type)
  )`).run();

  const resultColumns = await env.DB.prepare("PRAGMA table_info(game_results)").all<{ name: string }>();
  const resultNames = new Set((resultColumns.results || []).map(column => column.name));
  if (!resultNames.has("game_id")) await env.DB.prepare("ALTER TABLE game_results ADD COLUMN game_id TEXT").run();

  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status, created_at DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_game_rooms_group ON game_rooms(group_chat_id, created_at DESC)").run();
}

async function upsertBotGroup(env: Env, chat: { id: number; title?: string; username?: string; type?: string }, botStatus?: string) {
  if (!env.DB || !["group", "supergroup"].includes(chat.type || "")) return;
  let memberCount: number | null = null;
  try {
    const response = await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "getChatMemberCount", { chat_id: chat.id });
    if (response?.ok && typeof response.result === "number") memberCount = response.result;
  } catch {}
  await env.DB.prepare(
    "INSERT INTO bot_groups (chat_id,title,username,type,member_count,bot_status,last_seen_at,updated_at) VALUES (?,?,?,?,?,COALESCE(?, 'member'),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(chat_id) DO UPDATE SET title=COALESCE(excluded.title,bot_groups.title),username=COALESCE(excluded.username,bot_groups.username),type=excluded.type,member_count=COALESCE(excluded.member_count,bot_groups.member_count),bot_status=COALESCE(excluded.bot_status,bot_groups.bot_status),last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP"
  ).bind(chat.id, chat.title ?? null, chat.username ?? null, chat.type || "supergroup", memberCount, botStatus ?? null).run();
}

async function trackGroupMember(env: Env, chatId: number, user?: { id: number; first_name?: string; last_name?: string; username?: string }, status = "seen") {
  if (!env.DB || !user?.id) return;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "کاربر";
  await env.DB.prepare(
    "INSERT INTO group_members(chat_id,telegram_id,display_name,username,status,last_seen_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(chat_id,telegram_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,status=excluded.status,last_seen_at=CURRENT_TIMESTAMP"
  ).bind(chatId, user.id, name, user.username ?? null, status).run();
}

async function isGroupBlocked(env: Env, chatId: number) {
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT blocked FROM bot_groups WHERE chat_id=? LIMIT 1").bind(chatId).first<{ blocked: number }>();
  return row?.blocked === 1;
}

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
  private scalaGame?: ScalaState;
  private miniGame?: MiniGameState;
  private stopAfterOddHand = false;
  private chatMessages: ChatMessage[] = [];
  private hokmHandHistory: HokmHandHistory[] = [];

  constructor(private state: DurableObjectState, private env: Env) {}

  private async load() {
    if (this.room) return this.room;
    const storedRoom = await this.state.storage.get<GameRoomState>("room");
    if (storedRoom) this.room = new GameRoom(storedRoom);
    this.game = await this.state.storage.get<HokmState>("game");
    this.scalaGame = await this.state.storage.get<ScalaState>("scala_game");
    this.miniGame = await this.state.storage.get<MiniGameState>("mini_game");
    this.stopAfterOddHand = (await this.state.storage.get<boolean>("stop_after_odd_hand")) ?? false;
    this.chatMessages = (await this.state.storage.get<ChatMessage[]>("chat_messages")) ?? [];
    this.hokmHandHistory = (await this.state.storage.get<HokmHandHistory[]>("hokm_hand_history")) ?? [];
    return this.room;
  }

  private async scheduleAutoPlay() {
    if (!this.room || !this.game) return;
    const config = this.room.getState().config;
    if (!config.autoPlayEnabled || this.room.getState().status !== "playing" || this.game.phase !== "playing") return;
    const delay = Math.max(5, Math.min(60, config.autoPlayDelaySeconds ?? 10));
    await this.state.storage.setAlarm(Date.now() + delay * 1000);
  }

  private chooseAutoPlayCard(game: HokmState, playerId: string) {
    const hand = game.hands[playerId] ?? [];
    const lead = game.trick[0]?.card.suit;
    const legal = legalCards(hand, lead).filter(card => isLegalMove(game, playerId, card.id));
    if (!legal.length) throw new Error("No legal cards available");
    const variant = getHokmVariant(game.rules.variantId);
    const winnerOf = (card: typeof legal[number]) => trickWinner([...game.trick, { playerId, card }], game.hokm, variant.reversedRanks) === playerId;
    const winning = legal.filter(winnerOf);
    if (winning.length) {
      return winning.sort((a, b) => a.rank - b.rank)[0];
    }
    return legal.slice().sort((a, b) => a.rank - b.rank)[0];
  }

  async alarm() {
    await this.load();
    if (!this.room || !this.game) return;
    const room = this.room.getState();
    if (!room.config.autoPlayEnabled || room.status !== "playing") return;

    if (this.game.phase === "hand_finished") {
      this.game = startNextHand(this.game);
      await this.save();
      await this.scheduleAutoPlay();
      return;
    }

    if (this.game.phase !== "playing") return;

    const playerId = this.game.turnPlayerId;
    const card = this.chooseAutoPlayCard(this.game, playerId);
    this.game = playCard(this.game, playerId, card.id);

    if (this.game.phase === "hand_finished") {
      this.game = finishHand(this.game);
      this.hokmHandHistory.push({
        hand: this.game.handsCompleted,
        hokmPlayerId: this.game.hokmPlayerId,
        hokm: this.game.hokm,
        winnerIds: [...this.game.handWinnerIds],
        points: { ...this.game.handPoints },
        tricks: { ...this.game.tricksWon },
        scores: { ...this.game.scores }
      });

      if (this.game.phase === "game_finished") {
        this.room.finish();
        await this.persistRoom();
        await this.persistGameResult(this.game);
        await this.recordFinalResult(this.game);
        await this.notifyGroupResult(this.game);
      } else {
        await this.state.storage.setAlarm(Date.now() + 1000);
      }
    } else {
      await this.scheduleAutoPlay();
    }

    await this.save();
    await this.syncRegistry();
  }

  private async save() {
    if (!this.room) throw new Error("Room does not exist");
    await this.state.storage.put("room", this.room.getState());
    if (this.game) await this.state.storage.put("game", this.game);
    if (this.scalaGame) await this.state.storage.put("scala_game", this.scalaGame);
    if (this.miniGame) await this.state.storage.put("mini_game", this.miniGame);
    await this.state.storage.put("stop_after_odd_hand", this.stopAfterOddHand);
    await this.state.storage.put("chat_messages", this.chatMessages.slice(-100));
    await this.state.storage.put("hokm_hand_history", this.hokmHandHistory.slice(-100));
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
    const groupMatch = /^group-(-?\\d+)-/.exec(state.id);
    const groupChatId = groupMatch ? Number(groupMatch[1]) : null;
    await this.env.DB.prepare(
      "INSERT INTO game_rooms (id, game_type, status, group_chat_id, creator_telegram_id, max_players, created_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, group_chat_id = COALESCE(excluded.group_chat_id, game_rooms.group_chat_id), max_players = excluded.max_players, started_at = COALESCE(game_rooms.started_at, excluded.started_at), finished_at = excluded.finished_at"
    ).bind(state.id, state.config.gameId, state.status, groupChatId, creator, state.config.playerCount, Math.floor(state.createdAt / 1000), state.status === "playing" ? new Date().toISOString() : null, state.status === "finished" ? new Date().toISOString() : null).run();
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
      const gameId = this.room.getState().config.gameId;
      const ratingDelta = won ? 10 : -5;
      await this.env.DB.prepare("INSERT INTO game_results (room_id, telegram_id, game_id, placement, score_delta, rating_delta) VALUES (?, ?, ?, ?, ?, ?)").bind(roomId, telegramId, gameId, i + 1, scoreDelta, ratingDelta).run();
      await this.env.DB.prepare(
        "UPDATE player_stats SET rating = rating + ?, games_played = games_played + 1, wins = wins + ?, losses = losses + ?, current_streak = CASE WHEN ? = 1 THEN current_streak + 1 ELSE 0 END, best_streak = CASE WHEN ? = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(ratingDelta, won ? 1 : 0, won ? 0 : 1, won ? 1 : 0, won ? 1 : 0, user.id).run();
      await this.env.DB.prepare(
        "INSERT INTO player_game_stats (user_id, game_type, rating, games_played, wins, losses, draws, current_streak, best_streak) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?) ON CONFLICT(user_id, game_type) DO UPDATE SET rating = rating + excluded.rating - 1000, games_played = games_played + 1, wins = wins + excluded.wins, losses = losses + excluded.losses, current_streak = CASE WHEN excluded.wins = 1 THEN current_streak + 1 ELSE 0 END, best_streak = CASE WHEN excluded.wins = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END, updated_at = CURRENT_TIMESTAMP"
      ).bind(user.id, gameId, 1000 + ratingDelta, won ? 1 : 0, won ? 0 : 1, won ? 1 : 0, won ? 1 : 0).run();
    }
  }

  private async persistMiniGameResult(game: MiniGameState) {
    if (!this.env.DB || !this.room) return;
    const roomId = this.room.getState().id;
    const scores = game.scores || {};
    const ranking = game.players.map(player => ({ player, score: Number(scores[player.id] ?? 0) }))
      .sort((a,b)=>b.score-a.score);
    for (let i=0;i<ranking.length;i++) {
      const item=ranking[i], telegramId=Number(item.player.id);
      const user=await this.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ? LIMIT 1").bind(telegramId).first<{id:number}>();
      if(!user) continue;
      const exists=await this.env.DB.prepare("SELECT id FROM game_results WHERE room_id=? AND telegram_id=? LIMIT 1").bind(roomId,telegramId).first();
      if(exists) continue;
      const winners=game.winnerIds||[];
      const draw=winners.length===0;
      const won=winners.includes(item.player.id);
      const ratingDelta=draw?0:won?10:-5;
      await this.env.DB.prepare("INSERT INTO game_results (room_id, telegram_id, game_id, placement, score_delta, rating_delta) VALUES (?,?,?,?,?,?)")
        .bind(roomId,telegramId,game.gameId,i+1,item.score,ratingDelta).run();
      await this.env.DB.prepare("UPDATE player_stats SET rating=rating+?, games_played=games_played+1, wins=wins+?, losses=losses+?, draws=draws+?, current_streak=CASE WHEN ?=1 THEN current_streak+1 ELSE 0 END, best_streak=MAX(best_streak, CASE WHEN ?=1 THEN current_streak+1 ELSE 0 END), updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
        .bind(ratingDelta,won?1:0,draw?0:won?0:1,draw?1:0,won?1:0,won?1:0,user.id).run();
      await this.env.DB.prepare("INSERT INTO player_game_stats (user_id,game_type,rating,games_played,wins,losses,draws,current_streak,best_streak) VALUES (?,?,?,1,?,?,0,?,?) ON CONFLICT(user_id,game_type) DO UPDATE SET rating=rating+excluded.rating-1000,games_played=games_played+1,wins=wins+excluded.wins,losses=losses+excluded.losses,current_streak=CASE WHEN excluded.wins=1 THEN current_streak+1 ELSE 0 END,best_streak=MAX(best_streak,CASE WHEN excluded.wins=1 THEN current_streak+1 ELSE 0 END),updated_at=CURRENT_TIMESTAMP")
        .bind(user.id,game.gameId,1000+ratingDelta,won?1:0,draw?0:won?0:1,won?1:0,won?1:0).run();
    }
  }

  private async syncRegistry() {
    if (!this.room || this.state.id.toString() === "__room_registry__") return;
    try {
      const state = this.room.getState();
      const registryId = this.env.GAME_ROOM.idFromName("__room_registry__");
      const registry = this.env.GAME_ROOM.get(registryId);
          const payload: ActiveRoom | null = ["waiting", "playing"].includes(state.status)
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

    if (!this.game && !this.scalaGame && !this.miniGame) {
      return Response.json({ room: this.room.getState(), game: null });
    }

    if (!viewerId) throw new Error("Authentication required");

    if (this.room.getState().config.gameId === "scala_quaranta" && this.scalaGame) {
      const game = structuredClone(this.scalaGame);
      game.deck = [];
      for (const player of game.players) {
        if (player.id !== viewerId) game.hands[player.id] = [];
      }
      return Response.json({
        room: this.room.getState(),
        game,
        stopAfterOddHand: false,
        chatMessages: this.chatMessages
      });
    }

    if (this.miniGame) {
      const game = structuredClone(this.miniGame);
      if (game.gameId === "spy" && game.phase !== "finished") {
        // Everyone except the spy sees the location. Only the spy identity is hidden.
        if (game.spyId === viewerId) {
          delete game.location;
        } else {
          delete game.spyId;
        }
      }
      if (game.gameId === "battleship") {
        const boards = game.boards as Record<string, unknown[]>;
        game.boards = { [viewerId]: boards[viewerId] ?? [] };
      }
      if (game.gameId === "haft_khabis") {
        const hands = game.hands as Record<string, unknown[]>;
        game.hands = { [viewerId]: hands[viewerId] ?? [] };
        game.deck = [];
      }
      return Response.json({ room: this.room.getState(), game, chatMessages: this.chatMessages });
    }

    if (!this.game) throw new Error("Game state is unavailable");
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
      if (game.twoPlayerBuild.currentPlayer !== viewerId) {
        game.twoPlayerBuild.drawOptions = [];
      }
    }

    return Response.json({
      room: this.room.getState(),
      game,
      stopAfterOddHand: this.stopAfterOddHand,
      chatMessages: this.chatMessages,
      hokmHandHistory: this.hokmHandHistory
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get("x-room-health-check") === "1") {
        await this.load();
        return Response.json({ exists: Boolean(this.room), status: this.room?.getState().status ?? null });
      }

      const requestedRoomId = new URL(request.url).searchParams.get("room") || this.state.id.toString();

      if (request.headers.get("x-admin-internal-token") && this.env.ADMIN_INTERNAL_TOKEN && request.headers.get("x-admin-internal-token") === this.env.ADMIN_INTERNAL_TOKEN) {
        const adminUrl = new URL(request.url);
        if (adminUrl.pathname === "/admin-room" && request.method === "POST") {
          const body = await request.json() as { type?: string };
          await this.load();
          if (!this.room) return Response.json({ error: "Room does not exist" }, { status: 404 });
          if (body.type === "cancel") this.room.cancel();
          else if (body.type === "close") this.room.close();
          else if (body.type === "delete") {
            await this.syncRegistry();
            await this.state.storage.deleteAll();
            this.room = undefined;
            this.game = undefined;
            this.scalaGame = undefined;
            this.miniGame = undefined;
            return Response.json({ ok: true, deleted: true });
          } else return Response.json({ error: "Unknown admin room action" }, { status: 400 });
          await this.persistRoom();
          await this.save();
          await this.syncRegistry();
          return Response.json({ ok: true, room: this.room.getState() });
        }
      }

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

      if (action.type === "state") {
        const initData = request.headers.get("x-telegram-init-data") || "";
        const telegramUser = await verifyTelegramInitData(initData, this.env.TELEGRAM_BOT_TOKEN);
        const viewerId = String(telegramUser.id);

        if (!this.room) throw new Error("Room does not exist");
        if (!this.room.getState().players.some(player => player.id === viewerId)) {
          throw new Error("You are not a player in this room");
        }

        return this.response(viewerId);
      }

      if (action.type === "create_group_room" || action.type === "create_inline_room") {
        if (request.headers.get("x-bia-bot-token") !== this.env.TELEGRAM_BOT_TOKEN) throw new Error("Unauthorized bot action");
        const roomId = action.roomId;
        if (!this.room || !["waiting", "playing"].includes(this.room.getState().status)) {
          this.room = createHokmRoom(roomId, action.playerCount, { id: action.hostId, displayName: action.hostName });
          await this.persistRoom();
          await this.save();
          await this.syncRegistry();
        }
        if (action.type === "create_group_room" && action.chatId) {
          const existing = await telegramGetBoardMeta(this.state);
          await this.state.storage.put("telegram_board", existing || { chatId: action.chatId, messageId: 0, pvMessages: {}, selections: {} });
          if (this.env.DB) {
            await this.env.DB.prepare("UPDATE game_rooms SET group_chat_id=? WHERE id=?").bind(Number(action.chatId), roomId).run().catch(()=>{});
          }
        }
        return Response.json({ room: this.room.getState(), game: null });
      }

      if ((request.method === "POST" || request.method === "GET") && request.headers.get("x-bia-bot-token") === this.env.TELEGRAM_BOT_TOKEN) {
        const internalUrl = new URL(request.url);
        if (internalUrl.pathname === "/telegram-bind") {
          const body = await request.json() as { chatId?: string; messageId?: number };
          if (!body.chatId || !body.messageId) throw new Error("Invalid Telegram board binding");
          const current = await telegramGetBoardMeta(this.state);
          await this.state.storage.put("telegram_board", {
            chatId: body.chatId,
            messageId: body.messageId,
            pvMessages: current?.pvMessages || {},
            selections: current?.selections || {}
          } satisfies TelegramBoardMeta);
          return Response.json({ ok: true });
        }
        if (internalUrl.pathname === "/telegram-action") {
          const params = internalUrl.searchParams;
          const body = {
            userId: params.get("userId") || "",
            displayName: params.get("displayName") || "بازیکن",
            username: params.get("username") || undefined,
            action: params.get("action") || "",
            arg: params.get("arg") || ""
          };
          const userId = String(body.userId || "");
          const telegramDisplayName = body.displayName || "بازیکن";
          if (!userId || !body.action) throw new Error("Invalid Telegram action");
          await this.load();
          if (!this.room) throw new Error("Room does not exist");
          if (!this.room.getState().players.some((p:any)=>p.id===userId) && body.action !== "seat" && body.action !== "join") {
            throw new Error("شما عضو این اتاق نیستید");
          }
          const actionName = body.action;
          const arg = body.arg || "";
          const hostId = this.room.getState().hostId;
          if (actionName === "manage") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند تنظیمات بازی را تغییر دهد");
            const meta = await telegramGetBoardMeta(this.state);
            if (meta) {
              meta.managementUserId = userId;
              await this.state.storage.put("telegram_board", meta);
            }
          } else if (actionName === "manage_back") {
            const meta = await telegramGetBoardMeta(this.state);
            if (meta) {
              delete meta.managementUserId;
              await this.state.storage.put("telegram_board", meta);
            }
          } else if (actionName === "set_target_score") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند تعداد دورها را تغییر دهد");
            const score = Number(arg);
            if (![1,3,5,7].includes(score)) throw new Error("تعداد دور نامعتبر است");
            this.room.setTargetScore(score as 1|3|5|7);
          } else if (actionName === "set_auto_play") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند بازی خودکار را تغییر دهد");
            const enabled = arg === "1";
            this.room.setAutoPlay(enabled, this.room.getState().config.autoPlayDelaySeconds ?? 10);
          } else if (actionName === "set_auto_delay") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند تأخیر بازی خودکار را تغییر دهد");
            const seconds = Number(arg);
            this.room.setAutoPlay(Boolean(this.room.getState().config.autoPlayEnabled), seconds);
          } else if (actionName === "change_player_count") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند تعداد بازیکنان را تغییر دهد");
            this.room.setPlayerCount(Number(arg));
          } else if (actionName === "cancel_room") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند اتاق را لغو کند");
            this.room.cancel();
          } else if (actionName === "close_room") {
            if (hostId !== userId) throw new Error("فقط میزبان می‌تواند اتاق را ببندد");
            this.room.close();
          } else if (actionName === "join") {
            if (!this.room.getState().players.some((p:any)=>p.id===userId)) {
              this.room.join({id:userId, displayName:telegramDisplayName, username:body.username});
            }
          } else if (actionName === "seat") {
            const seat = Number(arg);
            if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new Error("صندلی نامعتبر است");
            if (!this.room.getState().players.some((p:any)=>p.id===userId)) this.room.join({id:userId,displayName:telegramDisplayName,username:body.username});
            this.room.setPlayerSeat(userId, seat);
          } else if (actionName === "leave") {
            this.room.leave(userId);
          } else if (actionName === "start") {
            if (this.room.getState().hostId !== userId) throw new Error("فقط میزبان می‌تواند بازی را شروع کند");
            this.room.start();
            const rs=this.room.getState();
            const players=rs.players.map(({id,seat,displayName,username}:any)=>({id,seat,displayName,username}));
            const randomBytes=new Uint32Array(1); crypto.getRandomValues(randomBytes);
            const initialHokmIndex=randomBytes[0]%players.length;
            const initialHokmPlayerId=players[initialHokmIndex].id;
            this.game=buildInitialState(players,initialHokmPlayerId,initialHokmPlayerId,Math.random,rs.config.targetScore??7,0,getHokmVariant((rs.config.variantId as HokmVariantId)||"standard").id);
            const variant=getHokmVariant(this.game.rules.variantId);
            if(!variant.hasTrump) this.game=startNoTrumpVariant(this.game);
            await this.persistRoom(); await this.save(); await this.syncRegistry();
          } else if (actionName === "trump") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            this.game=chooseHokm(this.game,userId,arg as Suit);
          } else if (actionName === "play") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            this.game=playCard(this.game,userId,arg);
          } else if (actionName === "finish") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            this.game=finishHand(this.game);
            if (this.game.phase === "game_finished") {
              this.room.finish();
              await this.persistRoom();
              await this.persistGameResult(this.game);
              await this.recordFinalResult(this.game);
              await this.notifyGroupResult(this.game);
            }
          } else if (actionName === "next") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            this.game=startNextHand(this.game);
          } else if (actionName === "toggle_card") {
            const meta=await telegramGetBoardMeta(this.state);
            if(!meta) throw new Error("Telegram board is not configured");
            const selected=new Set(meta.selections[userId]||[]);
            if(selected.has(arg)) selected.delete(arg); else selected.add(arg);
            meta.selections[userId]=[...selected];
            await this.state.storage.put("telegram_board",meta);
          } else if (actionName === "discard_done") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            const meta=await telegramGetBoardMeta(this.state);
            const selected=meta?.selections[userId]||[];
            if(!selected.length) throw new Error("کارت انتخاب نشده است");
            this.game=discardTwo(this.game,userId,selected);
            if(meta){ delete meta.selections[userId]; await this.state.storage.put("telegram_board",meta); }
          } else if (actionName === "draw") {
            if (!this.game) throw new Error("بازی شروع نشده است");
            this.game=drawTwo(this.game,userId,arg==="1");
          } else if (actionName === "pv") {
            // Refresh only; no game mutation.
          } else if (actionName === "noop") {
          } else {
            throw new Error("Unknown Telegram game action");
          }
          await this.persistRoom(); await this.save(); await this.syncRegistry();
          await telegramEditBoard(this.env,this.state,this.room.getState(),this.game);
          await telegramRefreshAllPrivateHands(this.env,this.state,this.room.getState(),this.game);
          return Response.json({ok:true,room:this.room.getState(),game:this.game});
        }
      }

      const telegramUser = await verifyTelegramInitData(action.initData, this.env.TELEGRAM_BOT_TOKEN);
      const userId = String(telegramUser.id);
      await this.persistUser(telegramUser);

      if (action.type === "list_rooms") {
        throw new Error("Room list is served by the registry endpoint");
      }

      if (action.type === "create") {
        if (this.room) throw new Error("Room already exists");
        if (action.gameId === "hokm") {
          if (![2, 3, 4].includes(action.playerCount)) throw new Error("Invalid Hokm player count");
          this.room = createHokmRoom(
            requestedRoomId,
            action.playerCount as HokmPlayerCount,
            {
              id: userId,
              displayName: displayName(telegramUser),
              username: telegramUser.username
            },
            Date.now(),
            7
          );
          this.room.setAutoPlay(false, 10);
        } else if (action.gameId === "scala_quaranta") {
          if (action.playerCount < 2 || action.playerCount > 6) throw new Error("Scala Quaranta supports 2 to 6 players");
          this.room = GameRoom.create(
            requestedRoomId,
            { gameId: "scala_quaranta", playerCount: action.playerCount, minPlayers: 2, maxPlayers: 6, autoPlayEnabled: false, autoPlayDelaySeconds: 10 },
            { id: userId, displayName: displayName(telegramUser), username: telegramUser.username }
          );
          this.room.setAutoPlay(false, 10);
        } else if (["haft_khabis","chahar_barg","rock_paper_scissors","shelem","tic_tac_toe","battleship","truth_or_dare","spy","backgammon"].includes(action.gameId)) {
          const id = action.gameId as MiniGameId;
          const limits: Record<string,[number,number]> = {
            haft_khabis:[2,6], chahar_barg:[2,4], rock_paper_scissors:[2,6], shelem:[4,4],
            tic_tac_toe:[2,2], battleship:[2,2], truth_or_dare:[2,20], spy:[3,10], backgammon:[2,2]
          };
          const [minPlayers,maxPlayers] = limits[id];
          if (action.playerCount < minPlayers || action.playerCount > maxPlayers) throw new Error("تعداد بازیکنان این بازی مجاز نیست");
          this.room = GameRoom.create(requestedRoomId, { gameId:id, playerCount:action.playerCount, minPlayers, maxPlayers }, { id:userId, displayName:displayName(telegramUser), username:telegramUser.username });
        } else {
          throw new Error("Unsupported game");
        }

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
      await this.scheduleAutoPlay();
      await this.save();
        await this.syncRegistry();
        return Response.json({ room: this.room.getState(), game: null });
      }

      if (!this.room) throw new Error("Room does not exist");

      if (
        ["choose_hokm", "discard_two", "draw_two", "play_card", "next_hand", "scala_draw_deck", "scala_draw_discard", "scala_recycle_discard", "scala_lay_melds", "scala_add_card", "scala_replace_joker", "scala_discard", "scala_next_round", "mini_action"].includes(action.type) &&
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

        case "set_seat":
          if (this.room.getState().status !== "waiting") throw new Error("Seats can only be changed before the game starts");
          if (!this.room.getState().players.some(p => p.id === userId)) throw new Error("You are not a player");
          if (action.playerId !== userId) throw new Error("Invalid player identity");
           this.room.setPlayerSeat(userId, action.seat);
          break;

        case "remove_player":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can remove players");
          if (action.playerId === userId) throw new Error("The host cannot remove themselves");
          this.room.removePlayer(action.playerId);
          break;

        case "set_auto_play":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can change auto play settings");
          this.room.setAutoPlay(action.enabled, action.delaySeconds);
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

        case "set_variant":
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can change the game variant");
          if (this.room.getState().status !== "waiting") throw new Error("Game variant can only be changed before the game starts");
          if (this.room.getState().config.gameId !== "hokm") throw new Error("Unsupported game variant");
          {
            const roomState = this.room.getState();
            roomState.config.variantId = getHokmVariant(action.variantId).id;
            this.room = new GameRoom(roomState);
          }
          break;

        case "start": {
          if (this.room.getState().hostId !== userId) throw new Error("Only the host can start the game");
          this.room.start();
          const roomState = this.room.getState();
          const players = roomState.players.map(({ id, seat, displayName, username }) => ({ id, seat, displayName, username }));
          if (["haft_khabis","chahar_barg","rock_paper_scissors","shelem","tic_tac_toe","battleship","truth_or_dare","spy","backgammon"].includes(roomState.config.gameId)) {
            const randomBytes = new Uint32Array(1);
            crypto.getRandomValues(randomBytes);
            this.miniGame = createMiniGame(roomState.config.gameId as MiniGameId, players, () => randomBytes[0] / 0xffffffff);
          } else if (roomState.config.gameId === "scala_quaranta") {
            const randomBytes = new Uint32Array(1);
            crypto.getRandomValues(randomBytes);
            const dealer = players[randomBytes[0] % players.length].id;
            this.scalaGame = createScalaInitialState(players, dealer, Math.random, 1);
          } else {
            const randomBytes = new Uint32Array(1);
            crypto.getRandomValues(randomBytes);
            const initialHokmIndex = randomBytes[0] % players.length;
            const initialHokmPlayerId = players[initialHokmIndex].id;
            this.game = buildInitialState(
              players,
              initialHokmPlayerId,
              initialHokmPlayerId,
              Math.random,
              roomState.config.targetScore ?? 7,
              0,
              getHokmVariant((roomState.config.variantId as HokmVariantId) || "standard").id
            );
            const variant = getHokmVariant(this.game.rules.variantId);
            if (!variant.hasTrump) this.game = startNoTrumpVariant(this.game);
          }
          this.room.markPlaying();
          await this.scheduleAutoPlay();
          break;
        }

        case "surrender":
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          if (this.game) { this.game.phase = "game_finished"; this.game.winnerIds = this.game.players.filter(p => p.id !== userId).map(p => p.id); this.room.finish(); await this.persistRoom(); await this.persistGameResult(); }
          else if (this.scalaGame) { this.scalaGame.phase = "match_finished"; this.scalaGame.roundWinnerId = this.scalaGame.players.find(p => p.id !== userId)?.id; this.room.finish(); await this.persistRoom(); await this.persistScalaGameResult(); }
          else if (this.miniGame) { this.miniGame = applyMiniAction(this.miniGame, { type: "surrender" }, userId); this.room.finish(); await this.persistRoom(); await this.persistMiniGameResult(this.miniGame); }
          else throw new Error("Game state is unavailable");
          break;

        case "mini_action":
          if (!this.miniGame) throw new Error("Mini game state is unavailable");
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.miniGame = applyMiniAction(this.miniGame, action.action as any, userId);
          if (this.miniGame.phase === "finished") {
            this.room.finish();
            await this.persistRoom();
            await this.persistMiniGameResult(this.miniGame);
          }
          break;

        case "scala_draw_deck":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaDrawFromDeck(this.scalaGame, userId);
          break;

        case "scala_draw_discard":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaDrawFromDiscard(this.scalaGame, userId);
          break;

        case "scala_recycle_discard":
          this.requireScalaGame();
          if (!this.scalaGame.players.some(player => player.id === userId)) throw new Error("You are not a player");
           if (this.scalaGame.turnPlayerId !== userId) throw new Error("It is not your turn");
           this.scalaGame = scalaRecycleDiscard(this.scalaGame);
          break;

        case "scala_lay_melds":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaLayMelds(this.scalaGame, userId, action.melds);
          break;

        case "scala_add_card":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaAddCardToMeld(this.scalaGame, userId, action.meldId, action.cardId);
          break;

        case "scala_replace_joker":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaReplaceMeldJoker(this.scalaGame, userId, action.meldId, action.cardId);
          break;

        case "scala_discard":
          this.requireScalaGame();
          if (action.playerId !== userId) throw new Error("Invalid player identity");
          this.scalaGame = scalaDiscard(this.scalaGame, userId, action.cardId);
          if (this.scalaGame.phase === "match_finished") {
            this.room.finish();
            await this.persistRoom();
            await this.persistScalaGameResult(this.scalaGame);
            await this.recordFinalScalaResult(this.scalaGame);
          } else if (this.scalaGame.phase === "round_finished") {
            // Keep the room in playing state; the client explicitly starts the next round.
          }
          break;

        case "scala_next_round":
          this.requireScalaGame();
          if (this.scalaGame.phase !== "round_finished") throw new Error("Round is not finished");
          this.scalaGame = scalaStartNextRound(this.scalaGame);
          break;

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
            this.hokmHandHistory.push({ hand: this.game.handsCompleted, hokmPlayerId: this.game.hokmPlayerId, hokm: this.game.hokm, winnerIds: [...this.game.handWinnerIds], points: { ...this.game.handPoints }, tricks: { ...this.game.tricksWon }, scores: { ...this.game.scores } });

            if (this.stopAfterOddHand && this.game.handsCompleted % 2 === 1) {
              this.game.phase = "game_finished";
            }

            if (this.game.phase === "game_finished") {
              this.room.finish();
              await this.persistRoom();
              await this.persistGameResult(this.game);
              await this.recordFinalResult(this.game);
              await this.notifyGroupResult(this.game);
            }
          }
          await this.scheduleAutoPlay();
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
          if (this.game.handsCompleted < 1) throw new Error("هنوز هیچ دستی کامل نشده است؛ برای پایان بازی حداقل یک دست باید تمام شده باشد");
          this.game.phase = "game_finished";
          this.room.finish();
          await this.persistRoom();
          await this.persistGameResult(this.game);
          await this.recordFinalResult(this.game);
          await this.notifyGroupResult(this.game);
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

  private async notifyGroupResult(game: HokmState) {
    const roomId = this.room?.getState().id ?? "";
    const match = /^group-(-?\\d+)-hokm4(?:-[a-z0-9]+)?$/.exec(roomId);
    if (!match) return;
    const chatId = match[1];
    const ranking = game.players.map(player => ({ player, score: game.scores[player.id] ?? 0, tricks: game.tricksWon[player.id] ?? 0 })).sort((a, b) => b.score - a.score || b.tricks - a.tricks);
    const medal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▫️";
    const lines = ranking.map((item, index) => `${medal(index)} ${index + 1}. ${item.player.displayName || "بازیکن"} — ${item.score} امتیاز · ${item.tricks} دست`);
    const variant = getHokmVariant(game.rules.variantId);
    const suitName: Record<Suit, string> = { spades: "♠️ پیک", hearts: "♥️ دل", diamonds: "♦️ خشت", clubs: "♣️ گشنیز" };
    const historyLines = this.hokmHandHistory.map(hand => {
      const winners = hand.winnerIds.map(id => game.players.find(p => p.id === id)?.displayName || "بازیکن").join(" و ");
      const points = game.players.map(p => `${p.displayName}: ${hand.points[p.id] ?? 0}`).join(" | ");
      const tricks = game.players.map(p => `${p.displayName}: ${hand.tricks[p.id] ?? 0}`).join(" | ");
      return `دست ${hand.hand}: ${hand.hokm ? suitName[hand.hokm] : "بدون حکم"} · برنده: ${winners} · امتیاز: ${points} · دست‌ها: ${tricks}`;
    });
    const winner = ranking[0]?.player.displayName || "بازیکن";
    const text = ["🏆 نتیجه نهایی «بیا بازی»","━━━━━━━━━━━━━━","🃏 بازی: حکم",`🎯 نوع: ${variant.title}`,`👥 بازیکنان: ${game.players.length} نفره`,`📊 هدف: ${game.rules.targetScore} امتیاز`,"","📋 جدول نهایی",...lines,"","📝 نتیجه دست‌ها",...(historyLines.length ? historyLines : ["اطلاعات دست‌ها ثبت نشده است."]),"",`👑 برنده: ${winner}`,"━━━━━━━━━━━━━━","برای بازی دوباره، بیا بازی را باز کنید."].join("\n");
    try { await telegramBotApi(this.env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }); } catch {}
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

  private requireScalaGame(): asserts this is this & { scalaGame: ScalaState } {
    if (!this.scalaGame) throw new Error("Scala Quaranta game has not started");
  }

  private async persistScalaGameResult(game: ScalaState) {
    if (!this.env.DB || !this.room) return;
    const roomId = this.room.getState().id;
    const ranking = game.players
      .map(player => ({ player, score: game.scores[player.id] ?? 0 }))
      .sort((a, b) => a.score - b.score);
    for (let i = 0; i < ranking.length; i++) {
      const item = ranking[i];
      const telegramId = Number(item.player.id);
      const user = await this.env.DB.prepare("SELECT id FROM users WHERE telegram_id = ? LIMIT 1").bind(telegramId).first<{ id: number }>();
      if (!user) continue;
      const existing = await this.env.DB.prepare("SELECT id FROM game_results WHERE room_id = ? AND telegram_id = ? LIMIT 1").bind(roomId, telegramId).first<{ id: number }>();
      if (existing) continue;
      const won = i === 0;
      const gameId = this.room.getState().config.gameId;
      const ratingDelta = won ? 10 : -5;
      await this.env.DB.prepare("INSERT INTO game_results (room_id, telegram_id, game_id, placement, score_delta, rating_delta) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(roomId, telegramId, gameId, i + 1, item.score, ratingDelta).run();
      await this.env.DB.prepare(
        "UPDATE player_stats SET rating = rating + ?, games_played = games_played + 1, wins = wins + ?, losses = losses + ?, current_streak = CASE WHEN ? = 1 THEN current_streak + 1 ELSE 0 END, best_streak = CASE WHEN ? = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).bind(ratingDelta, won ? 1 : 0, won ? 0 : 1, won ? 1 : 0, won ? 1 : 0, user.id).run();
      await this.env.DB.prepare(
        "INSERT INTO player_game_stats (user_id, game_type, rating, games_played, wins, losses, draws, current_streak, best_streak) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?) ON CONFLICT(user_id, game_type) DO UPDATE SET rating = rating + excluded.rating - 1000, games_played = games_played + 1, wins = wins + excluded.wins, losses = losses + excluded.losses, current_streak = CASE WHEN excluded.wins = 1 THEN current_streak + 1 ELSE 0 END, best_streak = CASE WHEN excluded.wins = 1 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END, updated_at = CURRENT_TIMESTAMP"
      ).bind(user.id, gameId, 1000 + ratingDelta, won ? 1 : 0, won ? 0 : 1, won ? 1 : 0, won ? 1 : 0).run();
    }
  }

  private async recordFinalScalaResult(game: ScalaState) {
    const registryId = this.env.GAME_ROOM.idFromName("__room_registry__");
    const registry = this.env.GAME_ROOM.get(registryId);
    const ranking = game.players
      .map(player => ({ player, score: game.scores[player.id] ?? 0 }))
      .sort((a, b) => a.score - b.score);
    for (let i = 0; i < ranking.length; i++) {
      const item = ranking[i];
      await registry.fetch("https://internal/registry", {
        method: "POST",
        headers: { "x-room-registry-token": this.env.TELEGRAM_BOT_TOKEN, "content-type": "application/json" },
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
  my_chat_member?: {
    chat: { id: number; type: string; title?: string; username?: string };
    new_chat_member?: { status?: string; user?: { id: number; first_name?: string; last_name?: string; username?: string } };
  };
  message?: { chat: { id: number; type: string; title?: string; username?: string }; from?: { id: number; first_name?: string; last_name?: string; username?: string }; text?: string };
  callback_query?: TelegramCallback;
  inline_query?: { id: string; from: { id: number; first_name?: string; last_name?: string; username?: string }; query: string; chat_type?: string };
};

async function telegramBotApi(token: string, method: string, body: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return response.json() as Promise<any>;
}

type TelegramCallback = {
  id: string;
  from: { id: number; first_name?: string; last_name?: string; username?: string };
  data?: string;
  message?: { message_id: number; chat: { id: number; type: string } };
};

type TelegramBoardMeta = {
  chatId: string;
  messageId: number;
  pvMessages: Record<string, number>;
  selections: Record<string, string[]>;
  managementUserId?: string;
};

function telegramTeamEmoji(room: any, playerId: string) {
  const players = [...(room.players || [])].sort((a: any, b: any) => (a.seat ?? 99) - (b.seat ?? 99));
  if (players.length === 4) {
    const p = players.find((x: any) => x.id === playerId);
    return p && (p.seat === 0 || p.seat === 2) ? "🔴" : "🔵";
  }
  return "🟢";
}

function telegramSeatPlayer(room: any, seat: number) {
  return (room.players || []).find((p: any) => p.seat === seat);
}

function telegramCardLabel(card: any) {
  const suits: Record<string,string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const ranks: Record<number,string> = { 14:"A", 13:"K", 12:"Q", 11:"J", 10:"10", 9:"9", 8:"8", 7:"7", 6:"6", 5:"5", 4:"4", 3:"3", 2:"2" };
  return `${ranks[card.rank] || card.rank}${suits[card.suit] || card.suit}`;
}

function telegramSuitLabel(suit: string) {
  return ({spades:"♠️ پیک", hearts:"♥️ دل", diamonds:"♦️ خشت", clubs:"♣️ گشنیز"} as Record<string,string>)[suit] || suit;
}

function telegramRoomText(room: any, game?: any) {
  const players = [...(room.players || [])].sort((a: any,b: any)=>(a.seat ?? 99)-(b.seat ?? 99));
  const lines: string[] = ["🃏 <b>بازی حکم</b>", "━━━━━━━━━━━━━━"];
  if (game) {
    const variant = game.rules?.variantId === "standard" ? "معمولی" : (game.rules?.variantId || "حکم");
    const scoreParts = game.players?.length === 4
      ? [
          `🔴 تیم ۱: <b>${game.scores?.[game.players?.[0]?.id] ?? 0}</b>`,
          `🔵 تیم ۲: <b>${game.scores?.[game.players?.[1]?.id] ?? 0}</b>`
        ]
      : (game.players || []).map((p: any) => `${telegramTeamEmoji(room,p.id)} ${p.displayName || "بازیکن"}: <b>${game.scores?.[p.id] ?? 0}</b>`);
    lines.push(scoreParts.join("   ·   "));
    lines.push(`🎯 حکم: <b>${game.hokm ? telegramSuitLabel(game.hokm) : "انتخاب نشده"}</b>   ·   🧩 ${variant}`);
    lines.push(`📘 دور ${(game.handsCompleted ?? 0) + 1}   ·   دست ${(game.tricksWon ? Math.max(0, ...Object.values(game.tricksWon as Record<string,number>)) : 0) + 1}/7`);
    if (game.phase === "select_hokm") lines.push(`👑 حاکم: ${players.find((p:any)=>p.id===game.hokmPlayerId)?.displayName || "بازیکن"} — انتخاب حکم`);
    else if (game.phase === "playing") lines.push(`▶️ نوبت: ${players.find((p:any)=>p.id===game.turnPlayerId)?.displayName || "بازیکن"}`);
    else if (game.phase === "hand_finished") lines.push("🏁 این دست تمام شد؛ نتیجه را ثبت کنید.");
    else if (game.phase === "game_finished") lines.push("🏆 بازی به پایان رسید.");
  } else {
    lines.push(`👥 بازیکنان: <b>${players.length}/${room.config?.playerCount || 4}</b>`);
    lines.push("برای ورود، روی صندلی خالی بزنید.");
    lines.push("میزبان پس از تکمیل صندلی‌ها می‌تواند بازی را شروع کند.");
  }
  const seatLines = [0,1,2,3].map(seat => {
    const p = telegramSeatPlayer(room,seat);
    return p ? `${telegramTeamEmoji(room,p.id)} ${p.displayName || "بازیکن"}` : "خالی";
  });
  lines.push("", `🪑 بالا: ${seatLines[0]}  |  چپ: ${seatLines[1]}`, `🪑 راست: ${seatLines[3]}  |  پایین: ${seatLines[2]}`);
  return lines.join("\n");
}

function telegramBoardKeyboard(room: any, game?: any, managementUserId?: string) {
  if (managementUserId && room.status === "waiting") {
    const cfg = room.config || {};
    const auto = Boolean(cfg.autoPlayEnabled);
    const delay = cfg.autoPlayDelaySeconds ?? 10;
    const rows:any[][] = [
      [{text:"🎯 دور: " + (cfg.targetScore ?? 7), callback_data:"h|"+room.id+"|m"}],
      [1,3,5,7].map(score => ({text:(cfg.targetScore===score?"✅ ":"")+" "+score+" دور",callback_data:"h|"+room.id+"|r|"+score})),
      [{text:"👥 "+cfg.playerCount+" نفره",callback_data:"h|"+room.id+"|m"}],
      [2,3,4].filter((n:number)=>n>=cfg.minPlayers && n<=cfg.maxPlayers).map((n:number)=>({text:(cfg.playerCount===n?"✅ ":"")+" "+n+" نفره",callback_data:"h|"+room.id+"|mode|"+n})),
      [{text:"🤖 بازی خودکار: "+(auto?"روشن":"خاموش"),callback_data:"h|"+room.id+"|a|"+(auto?"0":"1")}],
      [5,10,15,20,30,45,60].map(seconds => ({text:(delay===seconds?"✅ ":"")+seconds+"ث",callback_data:"h|"+room.id+"|ad|"+seconds})),
      [{text:"❌ لغو اتاق",callback_data:"h|"+room.id+"|cancel"},{text:"🔒 بستن اتاق",callback_data:"h|"+room.id+"|close"}],
      [{text:"↩️ بازگشت",callback_data:"h|"+room.id+"|b"}]
    ];
    return {inline_keyboard: rows};
  }
  const seats = [0,1,2,3];
  const labelForSeat = (seat: number) => {
    const p = telegramSeatPlayer(room,seat);
    if (!p) return "👤 صندلی خالی";
    const active = game?.turnPlayerId === p.id && game?.phase === "playing";
    return `${active ? "▶️" : telegramTeamEmoji(room,p.id)} ${p.displayName || "بازیکن"}`;
  };
  const seatButton = (seat: number) => ({ text: labelForSeat(seat), callback_data: `h|${room.id}|s|${seat}` });
  const noop = { text: "·", callback_data: `h|${room.id}|x` };
  const centerText = game?.phase === "select_hokm" ? "🃏 انتخاب حکم" : game?.phase === "playing" ? "🎴 حکم" : game?.phase === "hand_finished" ? "🏁 پایان دست" : game?.phase === "game_finished" ? "🏆 نتیجه" : "🃏 حکم";
  const keyboard: any[][] = [
    [noop, seatButton(0), noop],
    [seatButton(1), { text: centerText, callback_data: `h|${room.id}|c` }, seatButton(3)],
    [noop, seatButton(2), noop]
  ];
  if (!game && room.status === "waiting") keyboard.push([{ text: "▶️ شروع بازی", callback_data: `h|${room.id}|start` }, { text: "🚪 خروج", callback_data: `h|${room.id}|leave` }]);
  else if (game?.phase === "hand_finished") keyboard.push([{ text: "🏁 ثبت نتیجه دست", callback_data: `h|${room.id}|finish` }, { text: "🚪 خروج", callback_data: `h|${room.id}|leave` }]);
  else if (game?.phase === "game_finished") keyboard.push([{ text: "🚪 خروج", callback_data: `h|${room.id}|leave` }]);
  else keyboard.push([{ text: "🚪 خروج", callback_data: `h|${room.id}|leave` }]);
  if (room.status === "waiting") {
    keyboard.push([{ text: "⚙️ مدیریت بازی", callback_data: `h|${room.id}|m` }, { text: "🚪 خروج", callback_data: `h|${room.id}|leave` }]);
  }
  return { inline_keyboard: keyboard };
}

async function telegramGetBoardMeta(state: DurableObjectState) {
  return (await state.storage.get<TelegramBoardMeta>("telegram_board")) || null;
}

async function telegramEditBoard(env: Env, state: DurableObjectState, room: any, game?: any) {
  const meta = await telegramGetBoardMeta(state);
  if (!meta) return;
  const managementUserId = meta.managementUserId;
  const response = await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "editMessageText", {
    chat_id: meta.chatId,
    message_id: meta.messageId,
    text: managementUserId && room.status === "waiting"
      ? telegramRoomText(room, game) + "\n\n⚙️ <b>مدیریت بازی</b>"
      : telegramRoomText(room, game),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: telegramBoardKeyboard(room, game, managementUserId)
  });
  if (!response?.ok && !String(response?.description || "").includes("message is not modified")) {
    throw new Error(response?.description || "Telegram board update failed");
  }
}

async function telegramUpsertPrivateHand(env: Env, state: DurableObjectState, room: any, game: any, playerId: string) {
  const meta = await telegramGetBoardMeta(state);
  if (!meta || !game || !room.players?.some((p:any)=>p.id===playerId)) return;
  const hand = game.hands?.[playerId] || [];
  const pvChatId = playerId;
  const selection = meta.selections?.[playerId] || [];
  const player = room.players.find((p:any)=>p.id===playerId);
  const lines = [`🃏 <b>دست شما — ${player?.displayName || "بازیکن"}</b>`, `حکم: <b>${game.hokm ? telegramSuitLabel(game.hokm) : "انتخاب نشده"}</b>`];
  if (game.phase === "select_hokm" && game.hokmPlayerId === playerId) {
    lines.push("", "👑 شما حاکم هستید؛ حکم را انتخاب کنید.");
  } else if (game.phase === "playing") {
    lines.push("", game.turnPlayerId === playerId ? "▶️ نوبت شماست." : `⏳ نوبت ${room.players.find((p:any)=>p.id===game.turnPlayerId)?.displayName || "بازیکن"} است.`);
  } else if (game.phase === "build_two_player_hand" && game.twoPlayerBuild?.currentPlayer === playerId) {
    lines.push("", game.twoPlayerBuild.phase === "draw" ? "دو کارت را ببینید و یکی را نگه دارید." : "کارت‌های لازم را برای دور ساخت دست انتخاب کنید.");
  }
  const rows:any[][] = [];
  if (game.phase === "select_hokm" && game.hokmPlayerId === playerId) {
    rows.push(
      [{text:"♠️ پیک",callback_data:`h|${room.id}|t|spades`},{text:"♥️ دل",callback_data:`h|${room.id}|t|hearts`}],
      [{text:"♦️ خشت",callback_data:`h|${room.id}|t|diamonds`},{text:"♣️ گشنیز",callback_data:`h|${room.id}|t|clubs`}]
    );
  } else if (game.phase === "playing") {
    const legal = game.turnPlayerId === playerId
      ? legalCards(hand, game.trick?.[0]?.card?.suit).filter((card:any)=>isLegalMove(game, playerId, card.id))
      : [];
    const source = game.turnPlayerId === playerId ? legal : hand;
    for (let i=0;i<source.length;i+=3) {
      rows.push(source.slice(i,i+3).map((card:any)=>({
        text: `${selection.includes(card.id) ? "☑️ " : ""}${telegramCardLabel(card)}`,
        callback_data: `h|${room.id}|p|${card.id}`
      })));
    }
  } else if (game.phase === "build_two_player_hand" && game.twoPlayerBuild?.currentPlayer === playerId) {
    if (game.twoPlayerBuild.phase === "draw") {
      rows.push((game.twoPlayerBuild.drawOptions || []).map((_:any,i:number)=>({text:`🎴 گزینه ${i+1}`,callback_data:`h|${room.id}|d|${i}`})));
    } else {
      for (let i=0;i<hand.length;i+=3) rows.push(hand.slice(i,i+3).map((card:any)=>({text:`${selection.includes(card.id) ? "☑️ " : ""}${telegramCardLabel(card)}`,callback_data:`h|${room.id}|q|${card.id}`})));
      rows.push([{text:"✅ تأیید انتخاب",callback_data:`h|${room.id}|qdone`}]);
    }
  }
  if (game.phase === "playing" && game.turnPlayerId !== playerId) rows.push([{text:"🔄 بروزرسانی دست",callback_data:`h|${room.id}|pv`}]);
  if (!rows.length) rows.push([{text:"🔄 بروزرسانی",callback_data:`h|${room.id}|pv`}]);
  const existingMessageId = meta.pvMessages?.[playerId];
  const payload:any = { chat_id: pvChatId, text: lines.join("\n"), parse_mode:"HTML", disable_web_page_preview:true, reply_markup:{inline_keyboard:rows} };
  let response:any;
  if (existingMessageId) {
    response = await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"editMessageText",{...payload,message_id:existingMessageId});
  }
  if (!response?.ok) {
    response = await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",payload);
    if (response?.ok && response.result?.message_id) {
      meta.pvMessages[playerId] = response.result.message_id;
      await state.storage.put("telegram_board",meta);
    }
  }
}

async function telegramRefreshAllPrivateHands(env: Env, state: DurableObjectState, room: any, game?: any) {
  if (!game) return;
  const meta = await telegramGetBoardMeta(state);
  if (!meta) return;
  for (const p of room.players || []) {
    try { await telegramUpsertPrivateHand(env,state,room,game,p.id); } catch {}
  }
}

function botUserName(user?: { first_name?: string; last_name?: string; username?: string }) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "بازیکن";
}

async function createBotRoom(env: Env, roomId: string, hostId: string, hostName: string, chatId?: string) {
  const id = env.GAME_ROOM.idFromName(roomId);
  const response = await env.GAME_ROOM.get(id).fetch(`https://internal/api/room?room=${encodeURIComponent(roomId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bia-bot-token": env.TELEGRAM_BOT_TOKEN },
    body: JSON.stringify({ type: chatId ? "create_group_room" : "create_inline_room", gameId: "hokm", playerCount: 4, roomId, chatId, hostId, hostName })
  });
  const json = await response.json() as { room?: { id: string }; error?: string };
  if (!response.ok || !json.room) throw new Error(json.error || "ساخت اتاق ناموفق بود");
  return json.room;
}

async function handleTelegramWebhook(request: Request, env: Env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook secret is not configured" }, { status: 503 });
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const update = await request.json() as BotUpdate;
  await ensureOperationalSchema(env);
  const me = await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "getMe", {});
  const username = me?.result?.username as string | undefined;
  if (!username) throw new Error("Bot username unavailable");

  if (update.callback_query) {
    const q = update.callback_query;
    try {
      const parts = String(q.data || "").split("|");
      if (parts[0] !== "h" || !parts[1]) return Response.json({ ok: true });
      const roomId = parts[1];
      const action = parts[2] || "x";
      const arg = parts[3] || "";
      const roomDo = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
      const mappedAction =
        action==="s" ? "seat" :
        action==="c" ? "pv" :
        action==="j" ? "join" :
        action==="t" ? "trump" :
        action==="p" ? "play" :
        action==="q" ? "toggle_card" :
        action==="qdone" ? "discard_done" :
        action==="d" ? "draw" :
        action==="f" ? "finish" :
        action==="n" ? "next" :
        action==="start" ? "start" :
        action==="leave" ? "leave" :
        action==="m" ? "manage" :
        action==="b" ? "manage_back" :
        action==="r" ? "set_target_score" :
        action==="a" ? "set_auto_play" :
        action==="ad" ? "set_auto_delay" :
        action==="mode" ? "change_player_count" :
        action==="cancel" ? "cancel_room" :
        action==="close" ? "close_room" :
        action==="pv" ? "pv" :
        action==="x" ? "noop" : action;
      const query = new URLSearchParams({
        userId:String(q.from.id),
        displayName:botUserName(q.from),
        action:mappedAction,
        arg
      });
      if (q.from.username) query.set("username", q.from.username);
      const response = await roomDo.fetch("https://internal/telegram-action?" + query.toString(), {
        method: "GET",
        headers: { "x-bia-bot-token":env.TELEGRAM_BOT_TOKEN }
      });
      if (!response.ok) {
        const err = await response.json().catch(()=>({error:"عملیات ناموفق بود"})) as any;
        await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:q.id,text:err.error||"عملیات ناموفق بود",show_alert:true});
      } else {
        await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:q.id});
      }
    } catch (error) {
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:q.id,text:error instanceof Error?error.message:"عملیات ناموفق بود",show_alert:true}).catch(()=>{});
    }
    return Response.json({ ok: true });
  }

  if (update.my_chat_member) {
    const change = update.my_chat_member;
    await upsertBotGroup(env, change.chat, change.new_chat_member?.status || "member");
    return Response.json({ ok: true });
  }

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
  if (message?.text && message.from && (message.chat.type === "private" || message.chat.type === "channel")) {
    const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    const userName = botUserName(message.from);

    if (command === "/start") {
      const homeLink = `https://t.me/${username}?startapp=home`;
      const gamesLink = `https://t.me/${username}?startapp=games`;
      const addGroupLink = `https://t.me/${username}?startgroup=hokm`;
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: message.chat.id,
        text: [
          `🎮 سلام ${userName}!`,
          "",
          "╭──────────────╮",
          "│  🃏 «بیا بازی»  │",
          "╰──────────────╯",
          "",
          "بازی‌های چندنفره را مستقیم داخل تلگرام انجام بده.",
          "",
          "🎲 بازی‌ها",
          "├ 🃏 حکم — ۲ تا ۴ نفر",
          "└ 🂡 اسکالا کوآرانتا — ۲ تا ۶ نفر",
          "",
          "🏆 بازی کن • امتیاز بگیر • رکورد بزن",
          "📊 نتیجه، رتبه و آمار بازی‌ها ذخیره می‌شود."
        ].join("\n"),
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎮 ورود به بیا بازی", url: homeLink }],
            [{ text: "🃏 بازی‌ها و آموزش", url: gamesLink }],
            [{ text: "👥 افزودن به گروه", url: addGroupLink }]
          ]
        }
      });
      return Response.json({ ok: true });
    }

    if (command === "/help") {
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: message.chat.id,
        text: "راهنمای بیا بازی\n\n• بازی‌ها داخل Mini App اجرا می‌شوند.\n• نتیجه هر بازی ثبت می‌شود.\n• امتیاز، رتبه، برد و رکورد در پروفایل ذخیره می‌شوند.\n• برای ساخت بازی حکم در گروه، /hokm را ارسال کنید.\n• برای مشاهده آمار خودتان، /profile را بزنید.\n• برای دیدن جدول رتبه‌بندی، /rank را بزنید.\n• در گروه هم می‌توانید /rank، /rank hokm یا /rank scala را بزنید.",
        disable_web_page_preview: true
      });
      return Response.json({ ok: true });
    }

    if (command === "/profile") {
      if (!env.DB) {
        await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: message.chat.id, text: "اطلاعات آماری فعلاً در دسترس نیست." });
        return Response.json({ ok: true });
      }
      const row = await env.DB.prepare(
        "SELECT CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.games_played AS gamesPlayed, s.wins, s.losses, s.draws, s.current_streak AS currentStreak, s.best_streak AS bestStreak, COALESCE((SELECT MAX(gr.score_delta) FROM game_results gr WHERE gr.telegram_id = u.telegram_id), 0) AS bestScore FROM player_stats s JOIN users u ON u.id = s.user_id WHERE u.telegram_id = ? LIMIT 1"
      ).bind(message.from.id).first<any>();
      const p = row || { displayName: userName, rating: 1000, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, bestScore: 0 };
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: message.chat.id,
        text: `👤 پروفایل ${p.displayName}\n\nامتیاز: ${p.rating}\nبازی: ${p.gamesPlayed}\nبرد: ${p.wins}\nباخت: ${p.losses}\nرکورد برد متوالی: ${p.bestStreak}\nبهترین امتیاز بازی: ${p.bestScore}`
      });
      return Response.json({ ok: true });
    }

    if (command === "/rank") {
      if (!env.DB) {
        await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: message.chat.id, text: "رتبه‌بندی فعلاً در دسترس نیست." });
        return Response.json({ ok: true });
      }
      const requestedGame = (message.text.trim().split(/\s+/)[1] || "").toLowerCase();
      const gameAliases: Record<string,string> = { "hokm":"hokm","حکم":"hokm","scala_quaranta":"scala_quaranta","scala":"scala_quaranta","اسکالا":"scala_quaranta","haft_khabis":"haft_khabis","هفت":"haft_khabis","هفت‌خبیث":"haft_khabis","chahar_barg":"chahar_barg","چهاربرگ":"chahar_barg","rock_paper_scissors":"rock_paper_scissors","rps":"rock_paper_scissors","shelem":"shelem","شلم":"shelem","tic_tac_toe":"tic_tac_toe","دوز":"tic_tac_toe","battleship":"battleship","کشتی":"battleship","truth_or_dare":"truth_or_dare","جرات":"truth_or_dare","جاسوس":"spy","spy":"spy","backgammon":"backgammon","نرد":"backgammon" };
      const gameId = gameAliases[requestedGame] || null;
      const title = gameId === "hokm" ? "🃏 رتبه‌بندی حکم" : gameId === "scala_quaranta" ? "🂡 رتبه‌بندی اسکالا کوآرانتا" : "🏆 رتبه‌بندی کلی بیا بازی";
      const rows = gameId
        ? await env.DB.prepare("SELECT CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.wins, s.games_played AS gamesPlayed FROM player_game_stats s JOIN users u ON u.id = s.user_id WHERE s.game_type = ? AND s.games_played > 0 ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 10").bind(gameId).all()
        : await env.DB.prepare("SELECT CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.wins, s.games_played AS gamesPlayed FROM player_stats s JOIN users u ON u.id = s.user_id WHERE s.games_played > 0 ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 10").all();
      const lines = (rows.results || []).map((row:any, index:number) => (index + 1) + ". " + row.displayName + " — " + row.rating + " امتیاز · " + row.wins + " برد · " + row.gamesPlayed + " بازی");
      const hint = "برای رتبه‌بندی هر بازی، نام یا شناسه آن را بعد از /rank بنویسید.";
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: message.chat.id,
        text: title + "\n\n" + (lines.length ? lines.join("\n") : "هنوز رکوردی ثبت نشده است.") + "\n\n" + hint
      });
      return Response.json({ ok: true });
    }
  }

  const groupMessage = update.message;
  if (groupMessage?.text && groupMessage.from && (groupMessage.chat.type === "group" || groupMessage.chat.type === "supergroup")) {
    await upsertBotGroup(env, groupMessage.chat as {id:number;title?:string;username?:string;type?:string}, "member");
    await trackGroupMember(env, groupMessage.chat.id, groupMessage.from);
    if (await isGroupBlocked(env, groupMessage.chat.id)) {
      return Response.json({ ok: true, blocked: true });
    }
    const command = groupMessage.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    if (command === "/hokm") {
      const room = await createBotRoom(env, `group-${groupMessage.chat.id}-hokm4-${Date.now().toString(36)}`, String(groupMessage.from.id), botUserName(groupMessage.from), String(groupMessage.chat.id));
      const sent = await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: groupMessage.chat.id,
        text: telegramRoomText(room, undefined),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: telegramBoardKeyboard(room, undefined)
      });
      if (sent?.ok && sent.result?.message_id) {
        const roomDo = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room.id));
        await roomDo.fetch("https://internal/telegram-bind", {
          method:"POST",
          headers:{"content-type":"application/json","x-bia-bot-token":env.TELEGRAM_BOT_TOKEN},
          body:JSON.stringify({chatId:String(groupMessage.chat.id),messageId:sent.result.message_id})
        });
      }
    }
    if (command === "/rank") {
      if (!env.DB) {
        await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: groupMessage.chat.id, text: "رتبه‌بندی فعلاً در دسترس نیست." });
        return Response.json({ ok: true });
      }
      const requestedGame = (groupMessage.text.trim().split(/\s+/)[1] || "").toLowerCase();
      const gameId = requestedGame === "hokm" || requestedGame === "حکم" ? "hokm" : requestedGame === "scala_quaranta" || requestedGame === "scala" || requestedGame === "اسکالا" ? "scala_quaranta" : null;
      const title = gameId === "hokm" ? "🃏 رتبه‌بندی حکم" : gameId === "scala_quaranta" ? "🂡 رتبه‌بندی اسکالا کوآرانتا" : "🏆 رتبه‌بندی کلی بیا بازی";
      const rows = gameId
        ? await env.DB.prepare("SELECT CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.wins, s.games_played AS gamesPlayed FROM player_game_stats s JOIN users u ON u.id = s.user_id WHERE s.game_type = ? AND s.games_played > 0 ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 10").bind(gameId).all()
        : await env.DB.prepare("SELECT CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.wins, s.games_played AS gamesPlayed FROM player_stats s JOIN users u ON u.id = s.user_id WHERE s.games_played > 0 ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 10").all();
      const lines = (rows.results || []).map((row:any, index:number) => (index + 1) + ". " + row.displayName + " — " + row.rating + " امتیاز · " + row.wins + " برد · " + row.gamesPlayed + " بازی");
      await telegramBotApi(env.TELEGRAM_BOT_TOKEN, "sendMessage", { chat_id: groupMessage.chat.id, text: title + "\n\n" + (lines.length ? lines.join("\n") : "هنوز رکوردی ثبت نشده است.") + "\n\nبرای رتبه‌بندی هر بازی، نام یا شناسه آن را بعد از /rank بنویسید." });
      return Response.json({ ok: true });
    }
  }
  return Response.json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__bia_test_92eaa2cb" && request.method === "GET") {
      return new Response(JSON.stringify({
        ok: true,
        worker: "bia-bazi",
        version: "92eaa2cb",
        mode: "worker-first",
        path: url.pathname
      }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-bia-bazi-version": "92eaa2cb"
        }
      });
    }

    if (url.pathname === "/__version" && request.method === "GET") {
      return new Response(JSON.stringify({
        app: "bia-bazi",
        worker: "game-room",
        version: "telegram-hokm-inline-2026-09-29-v2",
        migrationEndpoint: "/admin/migrate-per-game-rankings",
        source: "github:tusanbot/Bia-bazi"
      }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-bia-bazi-version": "92eaa2cb"
        }
      });
    }

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      try { return await handleTelegramWebhook(request, env); }
      catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "Webhook error" }, { status: 500 }); }
    }
    if (url.pathname === "/admin/migrate-per-game-rankings" && (request.method === "GET" || request.method === "POST")) {
      const migrationSecret = request.headers.get("x-migration-secret");
      if (!env.TELEGRAM_WEBHOOK_SECRET || migrationSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!env.DB) {
        return Response.json({ error: "D1 database is not configured" }, { status: 500 });
      }

      const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS player_game_stats (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            game_type TEXT NOT NULL,
            rating INTEGER NOT NULL DEFAULT 1000,
            games_played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            current_streak INTEGER NOT NULL DEFAULT 0,
            best_streak INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, game_type)
          )
        `).run();
        steps.push({ step: "player_game_stats", ok: true, detail: "table ready" });

        const columns = await env.DB.prepare("PRAGMA table_info(game_results)").all<{ name: string }>();
        const hasGameId = (columns.results || []).some(column => column.name === "game_id");
        if (!hasGameId) {
          await env.DB.prepare("ALTER TABLE game_results ADD COLUMN game_id TEXT").run();
          steps.push({ step: "game_results.game_id", ok: true, detail: "column added" });
        } else {
          steps.push({ step: "game_results.game_id", ok: true, detail: "column already exists" });
        }

        const roomColumns = await env.DB.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
        const hasRoomGameType = (roomColumns.results || []).some(column => column.name === "game_type");
        if (hasRoomGameType) {
          await env.DB.prepare(`
            UPDATE game_results
            SET game_id = (
              SELECT game_type FROM game_rooms WHERE game_rooms.id = game_results.room_id
            )
            WHERE game_id IS NULL
          `).run();
          steps.push({ step: "backfill_game_id", ok: true });
        } else {
          steps.push({ step: "backfill_game_id", ok: true, detail: "skipped: legacy game_rooms has no game_type column" });
        }

        await env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating ON player_game_stats(game_type, rating DESC)"
        ).run();
        await env.DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_game_results_game ON game_results(game_id, created_at DESC)"
        ).run();
        steps.push({ step: "indexes", ok: true });

        await env.DB.prepare("DELETE FROM player_game_stats").run();
        await env.DB.prepare(`
          INSERT INTO player_game_stats (
            user_id, game_type, rating, games_played, wins, losses, draws,
            current_streak, best_streak
          )
          SELECT
            u.id,
            gr.game_id,
            1000 + COALESCE(SUM(gr.rating_delta), 0),
            COUNT(*),
            SUM(CASE WHEN gr.placement = 1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN gr.placement > 1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN gr.placement IS NULL THEN 1 ELSE 0 END),
            0,
            0
          FROM game_results gr
          JOIN users u ON u.telegram_id = gr.telegram_id
          WHERE gr.game_id IS NOT NULL
          GROUP BY u.id, gr.game_id
        `).run();
        steps.push({ step: "rebuild_player_game_stats", ok: true });

        const counts = await env.DB.prepare(
          "SELECT game_type, COUNT(*) AS players FROM player_game_stats GROUP BY game_type ORDER BY game_type"
        ).all<{ game_id: string; players: number }>();

        return Response.json({
          ok: true,
          migration: "per-game-rankings",
          steps,
          summary: counts.results || []
        });
      } catch (error) {
        return Response.json({
          ok: false,
          migration: "per-game-rankings",
          steps,
          error: error instanceof Error ? error.message : "Migration failed"
        }, { status: 500 });
      }
    }

    if (url.pathname === "/telegram/status" && request.method === "GET") {
      const setupSecret = url.searchParams.get("secret") || request.headers.get("x-telegram-setup-secret");
      if (!env.TELEGRAM_WEBHOOK_SECRET || setupSecret !== env.TELEGRAM_WEBHOOK_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const [me, webhook] = await Promise.all([
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "getMe", {}),
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "getWebhookInfo", {})
      ]);
      return Response.json({
        ok: Boolean(me?.ok && webhook?.ok),
        worker: "game-room",
        webhookUrl: webhook?.result?.url || null,
        pendingUpdateCount: webhook?.result?.pending_update_count ?? null,
        lastErrorDate: webhook?.result?.last_error_date ?? null,
        lastErrorMessage: webhook?.result?.last_error_message ?? null,
        bot: me?.result ? { id: me.result.id, username: me.result.username } : null
      });
    }

    if (url.pathname === "/telegram/setup" && (request.method === "GET" || request.method === "POST")) {
      const setupSecret = url.searchParams.get("secret") || request.headers.get("x-telegram-setup-secret");
      if (!env.TELEGRAM_WEBHOOK_SECRET || setupSecret !== env.TELEGRAM_WEBHOOK_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const webhookUrl = new URL("/telegram/webhook", url.origin).toString();
      const commands = [
        { command: "start", description: "باز کردن بیا بازی" },
        { command: "hokm", description: "ساخت اتاق بازی حکم در گروه" },
        { command: "profile", description: "نمایش پروفایل و آمار بازی" },
        { command: "rank", description: "نمایش رتبه‌بندی کلی و بازی‌ها" },
        { command: "help", description: "راهنمای استفاده از بیا بازی" }
      ];
      const [webhook, commandResult] = await Promise.all([
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "setWebhook", { url: webhookUrl, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "inline_query", "my_chat_member"] }),
        telegramBotApi(env.TELEGRAM_BOT_TOKEN, "setMyCommands", { commands })
      ]);
      return Response.json({ ok: Boolean(webhook?.ok && commandResult?.ok), webhook, commands: commandResult });
    }

    if (url.pathname.startsWith("/admin/api/")) {
      try {
        if (url.pathname === "/admin/api/login" && request.method === "POST") {
          const body = await request.json() as { username?: string; password?: string };
          if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
            return Response.json({ error: "Admin authentication is not configured" }, { status: 503 });
          }
          if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
            return Response.json({ error: "نام کاربری یا رمز عبور نادرست است" }, { status: 401 });
          }
          const session = await createAdminSession(env);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json", "set-cookie": adminCookie(session, 60 * 60 * 12) }
          });
        }

        if (url.pathname === "/admin/api/logout" && request.method === "POST") {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json", "set-cookie": adminCookie("", 0) }
          });
        }

        await requireAdmin(request, env);
        if (!env.DB) return Response.json({ error: "D1 database is not configured" }, { status: 500 });
        await ensureOperationalSchema(env);

        if (url.pathname === "/admin/api/me") return Response.json({ ok: true });

        if (url.pathname === "/admin/api/dashboard") {
          const [users, activeUsers, activeRooms, finishedGames, groups, blockedGroups] = await Promise.all([
            env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>(),
            env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE updated_at >= datetime('now','-30 day')").first<{count:number}>(),
            env.DB.prepare("SELECT COUNT(*) AS count FROM game_rooms WHERE status IN ('waiting','playing') AND deleted_at IS NULL").first<{count:number}>(),
            env.DB.prepare("SELECT COUNT(DISTINCT room_id) AS count FROM game_results").first<{count:number}>(),
            env.DB.prepare("SELECT COUNT(*) AS count FROM bot_groups").first<{count:number}>(),
            env.DB.prepare("SELECT COUNT(*) AS count FROM bot_groups WHERE blocked=1").first<{count:number}>()
          ]);
          return Response.json({
            users: users?.count ?? 0,
            activeUsers: activeUsers?.count ?? 0,
            activeRooms: activeRooms?.count ?? 0,
            finishedGames: finishedGames?.count ?? 0,
            groups: groups?.count ?? 0,
            blockedGroups: blockedGroups?.count ?? 0
          });
        }

        if (url.pathname === "/admin/api/rooms" && request.method === "GET") {
          const q = (url.searchParams.get("q") || "").trim();
          const pattern = `%${q}%`;
          const rows = await env.DB.prepare(
            "SELECT r.id,r.game_type AS gameId,r.status,r.creator_telegram_id AS hostId,r.max_players AS maxPlayers,r.created_at AS createdAt,r.started_at AS startedAt,r.finished_at AS finishedAt,r.group_chat_id AS groupChatId,COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')),''),u.username,'میزبان') AS hostName,(SELECT COUNT(*) FROM game_players gp WHERE gp.room_id=r.id AND gp.status='active') AS currentPlayers FROM game_rooms r LEFT JOIN users u ON u.telegram_id=r.creator_telegram_id WHERE r.deleted_at IS NULL AND r.status IN ('waiting','playing') AND (?='' OR r.id LIKE ? OR r.game_type LIKE ? OR CAST(r.creator_telegram_id AS TEXT) LIKE ? OR COALESCE(u.username,'') LIKE ? OR COALESCE(u.first_name,'') LIKE ? OR COALESCE(u.last_name,'') LIKE ?) ORDER BY r.created_at DESC LIMIT 200"
          ).bind(q,pattern,pattern,pattern,pattern,pattern,pattern).all();
          return Response.json({ rooms: rows.results || [] });
        }

        if (url.pathname === "/admin/api/users" && request.method === "GET") {
          const q=(url.searchParams.get("q")||"").trim(), pattern=`%${q}%`;
          const rows=await env.DB.prepare(
            "SELECT u.telegram_id AS id,u.username,u.first_name AS firstName,u.last_name AS lastName,u.updated_at AS lastSeen,s.rating,s.games_played AS gamesPlayed,s.wins,s.losses,s.draws FROM users u LEFT JOIN player_stats s ON s.user_id=u.id WHERE (?='' OR CAST(u.telegram_id AS TEXT) LIKE ? OR COALESCE(u.username,'') LIKE ? OR COALESCE(u.first_name,'') LIKE ? OR COALESCE(u.last_name,'') LIKE ?) ORDER BY u.updated_at DESC LIMIT 300"
          ).bind(q,pattern,pattern,pattern,pattern).all();
          return Response.json({ users: rows.results || [] });
        }

        if (url.pathname === "/admin/api/groups" && request.method === "GET") {
          const groups=await env.DB.prepare(
            "SELECT g.chat_id AS chatId,g.title,g.username,g.type,g.member_count AS memberCount,g.blocked,g.bot_status AS botStatus,g.updated_at AS updatedAt,(SELECT COUNT(*) FROM game_rooms r WHERE r.group_chat_id=g.chat_id AND r.deleted_at IS NULL AND r.status='finished') AS gamesPlayed,(SELECT COUNT(*) FROM game_rooms r WHERE r.group_chat_id=g.chat_id AND r.deleted_at IS NULL AND r.status IN ('waiting','playing')) AS activeRooms,(SELECT COUNT(*) FROM group_members gm WHERE gm.chat_id=g.chat_id AND gm.last_seen_at >= datetime('now','-30 day')) AS activeMembers FROM bot_groups g ORDER BY g.updated_at DESC LIMIT 300"
          ).all();
          return Response.json({ groups: groups.results || [] });
        }

        if (url.pathname === "/admin/api/games" && request.method === "GET") {
          const rows=await env.DB.prepare(
            "SELECT game_id AS gameId,COUNT(DISTINCT room_id) AS gamesPlayed,COUNT(*) AS resultRows,MAX(created_at) AS lastPlayed FROM game_results WHERE game_id IS NOT NULL AND game_id <> '' GROUP BY game_id ORDER BY gamesPlayed DESC"
          ).all();
          return Response.json({ games: rows.results || [] });
        }

        if (url.pathname === "/admin/api/action" && request.method === "POST") {
          const body=await request.json() as { type:string; roomId?:string; chatId?:number|string; userId?:number|string; text?:string };
          if (body.type === "room_cancel" || body.type === "room_close") {
            if (!body.roomId) throw new Error("roomId is required");
            const id=env.GAME_ROOM.idFromName(body.roomId);
            const result=await env.GAME_ROOM.get(id).fetch("https://internal/admin-room", {
              method:"POST",
              headers:{"x-admin-internal-token":env.ADMIN_INTERNAL_TOKEN || "", "content-type":"application/json"},
              body:JSON.stringify({ type:body.type === "room_cancel" ? "cancel" : "close" })
            });
            const data=await result.json();
            if (!result.ok) return Response.json(data,{status:result.status});
            await env.DB.prepare("UPDATE game_rooms SET status=?, cancelled_at=CASE WHEN ?='cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END WHERE id=?").bind(body.type==="room_cancel"?"cancelled":"closed",body.type==="room_cancel"?"cancelled":"closed",body.roomId).run();
            return Response.json({ok:true,room:data});
          }
          if (body.type === "room_delete") {
            if (!body.roomId) throw new Error("roomId is required");
            const id=env.GAME_ROOM.idFromName(body.roomId);
            const result=await env.GAME_ROOM.get(id).fetch("https://internal/admin-room", {
              method:"POST",
              headers:{"x-admin-internal-token":env.ADMIN_INTERNAL_TOKEN || env.ADMIN_SESSION_SECRET || "", "content-type":"application/json"},
              body:JSON.stringify({ type:"delete" })
            });
            if (!result.ok) return Response.json(await result.json(),{status:result.status});
            const registryId = env.GAME_ROOM.idFromName("__room_registry__");
            await env.GAME_ROOM.get(registryId).fetch("https://internal/registry", {
              method: "POST",
              headers: { "x-room-registry-token": env.TELEGRAM_BOT_TOKEN, "content-type": "application/json" },
              body: JSON.stringify({ type: "sync", room: null, roomId: body.roomId })
            });
            await env.DB.prepare("DELETE FROM game_results WHERE room_id=?").bind(body.roomId).run();
            await env.DB.prepare("DELETE FROM game_players WHERE room_id=?").bind(body.roomId).run();
            await env.DB.prepare("DELETE FROM game_rooms WHERE id=?").bind(body.roomId).run();
            return Response.json({ok:true});
          }
          if (body.type === "group_refresh") {
            if (body.chatId === undefined) throw new Error("chatId is required");
            const chat=await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"getChat",{chat_id:body.chatId});
            if (!chat?.ok) return Response.json({error:chat?.description||"Telegram getChat failed"},{status:400});
            const count=await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"getChatMemberCount",{chat_id:body.chatId});
            await upsertBotGroup(env,chat.result,count?.ok?undefined:undefined);
            return Response.json({ok:true,chat:chat.result,memberCount:count?.result??null});
          }
          if (body.type === "group_block" || body.type === "group_unblock") {
            if (body.chatId === undefined) throw new Error("chatId is required");
            await env.DB.prepare("UPDATE bot_groups SET blocked=?,updated_at=CURRENT_TIMESTAMP WHERE chat_id=?").bind(body.type==="group_block"?1:0,body.chatId).run();
            return Response.json({ok:true});
          }
          if (body.type === "group_leave") {
            if (body.chatId === undefined) throw new Error("chatId is required");
            const api=await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"leaveChat",{chat_id:body.chatId});
            if (!api?.ok) return Response.json({error:api?.description||"leaveChat failed"},{status:400});
            await env.DB.prepare("UPDATE bot_groups SET bot_status='left',updated_at=CURRENT_TIMESTAMP WHERE chat_id=?").bind(body.chatId).run();
            return Response.json({ok:true});
          }
          if (body.type === "group_message" || body.type === "user_message") {
            const text=String(body.text||"").trim();
            if (!text || text.length>4096) throw new Error("text is required and must be <= 4096 chars");
            const target=body.type==="group_message"?body.chatId:body.userId;
            if (target===undefined) throw new Error("target is required");
            const api=await telegramBotApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:target,text,disable_web_page_preview:true});
            if (!api?.ok) return Response.json({error:api?.description||"sendMessage failed"},{status:400});
            return Response.json({ok:true,messageId:api.result?.message_id??null});
          }
          throw new Error("Unknown admin action");
        }

        return Response.json({ error: "Not found" }, { status: 404 });
      } catch (error) {
        if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({ error: error instanceof Error ? error.message : "Admin error" }, { status: 400 });
      }
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
      const gameIdParam = new URL(request.url).searchParams.get("game");
      const supportedRankingGames = ["hokm","scala_quaranta","haft_khabis","chahar_barg","rock_paper_scissors","shelem","tic_tac_toe","battleship","truth_or_dare","spy","backgammon"];
      const gameId = supportedRankingGames.includes(gameIdParam || "") ? gameIdParam : null;
      if (env.DB) {
        const rows = gameId
          ? await env.DB.prepare(
              "SELECT u.telegram_id AS playerId, CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.games_played AS gamesPlayed, s.wins, s.losses, s.draws, s.current_streak AS currentStreak, s.best_streak AS bestStreak, COALESCE((SELECT MAX(gr.score_delta) FROM game_results gr WHERE gr.telegram_id = u.telegram_id AND gr.game_id = ?), 0) AS bestScore FROM player_game_stats s JOIN users u ON u.id = s.user_id WHERE s.game_type = ? ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 100"
            ).bind(gameId, gameId).all()
          : await env.DB.prepare(
              "SELECT u.telegram_id AS playerId, CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.games_played AS gamesPlayed, s.wins, s.losses, s.draws, s.current_streak AS currentStreak, s.best_streak AS bestStreak, COALESCE((SELECT MAX(gr.score_delta) FROM game_results gr WHERE gr.telegram_id = u.telegram_id), 0) AS bestScore FROM player_stats s JOIN users u ON u.id = s.user_id ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC LIMIT 100"
            ).all();
        return Response.json({ gameId, ranking: rows.results });
      }
      const registryId = env.GAME_ROOM.idFromName("__room_registry__");
      return env.GAME_ROOM.get(registryId).fetch("https://internal/registry?view=ranking", {
        method: "GET",
        headers: { "x-telegram-init-data": initData, "x-room-registry-request": "1" }
      });
    }

    if (url.pathname === "/api/profile") {
      const initData = request.headers.get("x-telegram-init-data") || "";
      if (!initData) return Response.json({ error: "Telegram authentication required" }, { status: 401 });
      const telegramUser = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);

      if (!env.DB) {
        return Response.json({
          profile: {
            playerId: telegramUser.id,
            displayName: displayName(telegramUser),
            rating: 1000,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            currentStreak: 0,
            bestStreak: 0,
            bestScore: 0,
            rank: null
          }
        });
      }

      const row = await env.DB.prepare(
        "SELECT u.telegram_id AS playerId, CASE WHEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) <> '' THEN TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ELSE COALESCE(u.username, 'بازیکن') END AS displayName, s.rating, s.games_played AS gamesPlayed, s.wins, s.losses, s.draws, s.current_streak AS currentStreak, s.best_streak AS bestStreak, COALESCE((SELECT MAX(gr.score_delta) FROM game_results gr WHERE gr.telegram_id = u.telegram_id), 0) AS bestScore FROM player_stats s JOIN users u ON u.id = s.user_id WHERE u.telegram_id = ? LIMIT 1"
      ).bind(telegramUser.id).first();

      if (!row) {
        return Response.json({
          profile: {
            playerId: telegramUser.id,
            displayName: displayName(telegramUser),
            rating: 1000,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            currentStreak: 0,
            bestStreak: 0,
            bestScore: 0,
            rank: null
          }
        });
      }

      const rankRow = await env.DB.prepare(
        "SELECT COUNT(*) + 1 AS rank FROM player_stats s JOIN users u ON u.id = s.user_id WHERE s.rating > (SELECT rating FROM player_stats ps JOIN users pu ON pu.id = ps.user_id WHERE pu.telegram_id = ?)"
      ).bind(telegramUser.id).first<{ rank: number }>();

      return Response.json({ profile: { ...row, rank: rankRow?.rank ?? null } });
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

    // TEMPORARY TELEGRAM/API DIAGNOSTIC MODE:
    // Keep the Telegram webhook, setup/status endpoints, APIs and Durable
    // Objects reachable while the Next.js Web App is disabled. This prevents
    // the SPA fallback from masking an incorrect Worker deployment/route.
    // Re-enable the two ASSETS branches below after Telegram is verified.
    const WEB_APP_ENABLED = true;

    if (WEB_APP_ENABLED && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = "/admin/";
      return env.ASSETS.fetch(new Request(adminUrl.toString(), request));
    }

    if (!WEB_APP_ENABLED) {
      return Response.json({
        ok: false,
        error: "Web App temporarily disabled",
        worker: "bia-bazi",
        mode: "telegram-api-only"
      }, { status: 503 });
    }

    return env.ASSETS.fetch(request);
  }
};