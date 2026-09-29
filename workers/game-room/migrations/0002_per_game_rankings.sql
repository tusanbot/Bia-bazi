-- Per-game ranking support.
-- This migration is intentionally independent from the physical shape of
-- legacy game_rooms rows. Runtime schema repair/backfill handles old DBs.

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

CREATE INDEX IF NOT EXISTS idx_game_results_game
  ON game_results(game_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating
  ON player_game_stats(game_type, rating DESC);