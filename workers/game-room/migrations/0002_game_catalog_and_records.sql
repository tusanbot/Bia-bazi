-- Permanent game catalog and long-term player records.
-- Live room state remains in Durable Objects; D1 stores durable history/statistics.

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
  ('hokm', 'حکم', 'بازی حکم چندنفره', 2, 4, 1);

CREATE TABLE IF NOT EXISTS player_game_stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL REFERENCES game_catalog(id),
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_result_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, game_type)
);

CREATE TABLE IF NOT EXISTS player_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL REFERENCES game_catalog(id),
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

CREATE INDEX IF NOT EXISTS idx_game_catalog_enabled
  ON game_catalog(enabled);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_game_rating
  ON player_game_stats(game_type, rating DESC);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_points
  ON player_game_stats(game_type, points DESC);

CREATE INDEX IF NOT EXISTS idx_player_records_lookup
  ON player_records(user_id, game_type, record_type);

CREATE INDEX IF NOT EXISTS idx_game_hands_room
  ON game_hands(room_id, hand_number);
