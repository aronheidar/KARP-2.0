-- RÁS-Leikurinn (S1) — game state. Additive; snertir ekki núverandi töflur.
CREATE TABLE IF NOT EXISTS leikur_games (code TEXT PRIMARY KEY, config TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'lobby', current_round INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS leikur_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, game_code TEXT NOT NULL, name TEXT NOT NULL, joined INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS leikur_decisions (game_code TEXT NOT NULL, round INTEGER NOT NULL, team_id INTEGER NOT NULL, decisions TEXT NOT NULL, locked INTEGER NOT NULL DEFAULT 0, submitted_at INTEGER NOT NULL, PRIMARY KEY (game_code, round, team_id));
CREATE TABLE IF NOT EXISTS leikur_results (game_code TEXT NOT NULL, round INTEGER NOT NULL, team_id INTEGER NOT NULL, kpis TEXT NOT NULL, round_score REAL NOT NULL, cumulative REAL NOT NULL, PRIMARY KEY (game_code, round, team_id));
CREATE INDEX IF NOT EXISTS idx_leikur_teams_game ON leikur_teams (game_code);
