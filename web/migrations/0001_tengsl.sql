-- Tengslagrunnur v1 — landsdekkandi eigenda- & stjórnendagrunnur. Sjá spec 2026-07-12.
CREATE TABLE IF NOT EXISTS felog (
  kt TEXT PRIMARY KEY, nafn TEXT, form TEXT, stada TEXT, skraning TEXT,
  afskrad INTEGER DEFAULT 0, afskrad_dags TEXT,
  gjaldthrot INTEGER DEFAULT 0, gjaldthrot_dags TEXT,
  gjaldthol INTEGER DEFAULT 0, gjaldthol_dags TEXT,
  isat TEXT, hlutafe REAL, mynt TEXT, last_crawled TEXT, last_eigendur TEXT
);
CREATE TABLE IF NOT EXISTS folk (
  person_key TEXT PRIMARY KEY, kt TEXT, nafn TEXT, faeding TEXT
);
CREATE TABLE IF NOT EXISTS hlutverk (
  felag_kt TEXT NOT NULL, person_key TEXT NOT NULL, hlutverk TEXT, tegund TEXT,
  seen_first TEXT NOT NULL, seen_last TEXT,
  PRIMARY KEY (felag_kt, person_key, hlutverk)
);
CREATE TABLE IF NOT EXISTS eign (
  felag_kt TEXT NOT NULL, eigandi_key TEXT NOT NULL, eigandi_tegund TEXT NOT NULL,
  hlutur REAL, tegund TEXT NOT NULL, heimild TEXT, seen_first TEXT NOT NULL, seen_last TEXT,
  PRIMARY KEY (felag_kt, eigandi_key, tegund)
);
CREATE TABLE IF NOT EXISTS crawl_queue (
  kt TEXT PRIMARY KEY, priority INTEGER NOT NULL, discovered_from TEXT,
  added_at TEXT NOT NULL, crawled_at TEXT, attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS sweep_state (
  prefix TEXT PRIMARY KEY, done INTEGER DEFAULT 0, hit_count INTEGER, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hlutverk_person ON hlutverk(person_key);
CREATE INDEX IF NOT EXISTS idx_hlutverk_felag ON hlutverk(felag_kt);
CREATE INDEX IF NOT EXISTS idx_eign_eigandi ON eign(eigandi_key);
CREATE INDEX IF NOT EXISTS idx_eign_felag ON eign(felag_kt);
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status, priority, added_at);
