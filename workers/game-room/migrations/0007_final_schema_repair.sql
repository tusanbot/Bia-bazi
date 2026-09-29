-- Bia Bazi D1 final repair / convergence migration.
-- Safe to run on an existing database. No destructive statements are used.
-- Live game state remains in Durable Objects; D1 stores users, rooms, groups and records.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS game_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  min_players INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO game_catalog
  (id, name, description, min_players, max_players, enabled)
VALUES
  ('hokm','حکم','بازی حکم چندنفره',2,4,1),
  ('scala_quaranta','اسکالا کوآرانتا','رامی چندنفره با افتتاح ۴۰ امتیازی',2,6,1),
  ('haft_khabis','هفت خبیث','بازی کارتی سریع با کارت‌های ویژه',2,6,1),
  ('chahar_barg','۴ برگ','کارت‌بازی ایرانی با جمع‌کردن کارت‌های هم‌رتبه',2,4,1),
  ('rock_paper_scissors','سنگ کاغذ قیچی','مسابقه هم‌زمان بهترین از ۵ دور',2,6,1),
  ('shelem','شلم','بازی ورق چهار نفره با سیستم خواندن',4,4,1),
  ('tic_tac_toe','دوز','دوز کلاسیک سه در سه',2,2,1),
  ('battleship','کشتی جنگی','نبرد ناوگان دو نفره روی صفحه ۱۰ در ۱۰',2,2,1),
  ('truth_or_dare','جرأت حقیقت','بازی گروهی نوبتی پرسش و چالش',2,20,1),
  ('spy','جاسوس','یک جاسوس مخفی در میان بازیکنان',3,10,1),
  ('backgammon','نرد','نرد دو نفره با تاس و مهره',2,2,1);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  status TEXT NOT NULL,
  group_chat_id INTEGER,
  group_message_id INTEGER,
  creator_telegram_id INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  deleted_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  telegram_id INTEGER NOT NULL,
  seat INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT,
  PRIMARY KEY (room_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES game_rooms(id),
  telegram_id INTEGER NOT NULL,
  game_id TEXT,
  placement INTEGER,
  score_delta INTEGER NOT NULL DEFAULT 0,
  rating_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS player_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_value INTEGER NOT NULL,
  room_id TEXT REFERENCES game_rooms(id) ON DELETE SET NULL,
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_type, record_type)
);

CREATE TABLE IF NOT EXISTS game_hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  hand_number INTEGER NOT NULL,
  winner_telegram_id INTEGER,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, hand_number)
);

CREATE TABLE IF NOT EXISTS bot_groups (
  chat_id INTEGER PRIMARY KEY,
  title TEXT,
  username TEXT,
  type TEXT NOT NULL DEFAULT 'supergroup',
  member_count INTEGER,
  blocked INTEGER NOT NULL DEFAULT 0,
  bot_status TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  chat_id INTEGER NOT NULL,
  telegram_id INTEGER NOT NULL,
  display_name TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'seen',
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, telegram_id)
);

-- Do not derive game_results.game_id from game_rooms here.
-- Older databases may use a different room-game column name, while
-- game_results.game_id is already part of the baseline schema.
-- Existing NULL game_id values are left untouched rather than making
-- the migration depend on a non-guaranteed room column.
CREATE INDEX IF NOT EXISTS idx_player_stats_rating
  ON player_stats(rating DESC);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating
  ON player_game_stats(game_type, rating DESC);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_points
  ON player_game_stats(game_type, games_played DESC, wins DESC);

CREATE INDEX IF NOT EXISTS idx_game_results_player
  ON game_results(telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_results_game
  ON game_results(game_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_results_room
  ON game_results(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_rooms_status
  ON game_rooms(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_rooms_group
  ON game_rooms(group_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_records_lookup
  ON player_records(user_id, game_type, record_type);

CREATE INDEX IF NOT EXISTS idx_game_hands_room
  ON game_hands(room_id, hand_number);

CREATE INDEX IF NOT EXISTS idx_bot_groups_status
  ON bot_groups(blocked, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_members_seen
  ON group_members(chat_id, last_seen_at DESC);
