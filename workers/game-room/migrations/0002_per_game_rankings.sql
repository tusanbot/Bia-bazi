-- Per-game ranking backfill. game_id is already part of the baseline schema.
UPDATE game_results
SET game_id = (SELECT game_type FROM game_rooms WHERE game_rooms.id = game_results.room_id)
WHERE game_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_game_results_game ON game_results(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_game_stats_rating ON player_game_stats(game_type, rating DESC);