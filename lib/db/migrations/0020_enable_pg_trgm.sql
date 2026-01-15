-- Enable pg_trgm extension for fuzzy text search (trigram similarity)
-- This allows matching "Man United" to "Manchester United" and handles typos
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes on team name columns for faster similarity searches
CREATE INDEX IF NOT EXISTS idx_football_match_home_team_trgm 
ON "FootballMatch" USING GIN ("homeTeam" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_football_match_away_team_trgm 
ON "FootballMatch" USING GIN ("awayTeam" gin_trgm_ops);
