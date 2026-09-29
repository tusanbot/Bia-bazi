-- LEGACY: retained for reference only.
-- Production D1 migrations are now managed from workers/game-room/migrations.
-- This file is intentionally safe to run on the current schema and does not
-- attempt to ADD COLUMN game_id, because game_id is already part of the baseline.

UPDATE game_results
SET game_id = (
  SELECT game_rooms.game_type FROM game_rooms WHERE game_rooms.id = game_results.room_id
)
WHERE game_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating
  ON player_game_stats(game_type, rating DESC);
CREATE INDEX IF NOT EXISTS idx_game_results_game
  ON game_results(game_id, created_at DESC);

INSERT INTO player_game_stats (
  user_id, game_type, rating, games_played, wins, losses, draws,
  current_streak, best_streak
)
SELECT
  u.id, gr.game_id, 1000 + SUM(gr.rating_delta), COUNT(*),
  SUM(CASE WHEN gr.placement = 1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN gr.placement > 1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN gr.placement IS NULL THEN 1 ELSE 0 END), 0, 0
FROM game_results gr
JOIN users u ON u.telegram_id = gr.telegram_id
WHERE gr.game_id IS NOT NULL
GROUP BY u.id, gr.game_id
ON CONFLICT(user_id, game_type) DO UPDATE SET
  rating = excluded.rating, games_played = excluded.games_played,
  wins = excluded.wins, losses = excluded.losses, draws = excluded.draws,
  updated_at = CURRENT_TIMESTAMP;
