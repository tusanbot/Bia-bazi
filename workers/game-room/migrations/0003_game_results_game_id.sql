-- Complete the result schema used by the live game worker.
-- Older installations created game_results without game_id.

ALTER TABLE game_results ADD COLUMN game_id TEXT;

CREATE INDEX IF NOT EXISTS idx_game_results_game
  ON game_results(game_id, created_at DESC);
