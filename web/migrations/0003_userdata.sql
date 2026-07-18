-- 0003_userdata.sql — F6: períferu notenda-gögn úr WordPress user-meta í D1.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0003_userdata.sql
-- Flest vakt-/stillinga-endapunktarnir eru „JSON-blobb per notanda" → ein user_prefs-tafla.
-- Kvóta-endapunktar nota users.reports_used/reports_month (þrep) + sub_service.used/used_month
-- (fasteign/thing). Samfélags-fítusar (atkvæði/spár/kannanir) fá deildar töflur með aggregate.

-- Blobb-geymsla: leitvakt, fastvakt, firmavakt, utbodvakt, verkprofil, digest, follows,
-- ktwatch, team, burst, vaktir — hver key geymir heilt JSON-objekt notandans.
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER NOT NULL,
  k       TEXT NOT NULL,             -- 'leitvakt' | 'firmavakt' | 'follows' | 'ktwatch' | ...
  v       TEXT NOT NULL,             -- JSON
  updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, k)
);

-- Frumvarpa-atkvæði (/vote) — aggregate talning þvert á notendur.
CREATE TABLE IF NOT EXISTS bill_votes (
  bill    TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  choice  TEXT NOT NULL,             -- 'ja' | 'nei' | 'hlutlaus' (o.s.frv.)
  updated INTEGER NOT NULL,
  PRIMARY KEY (bill, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bill_votes_bill ON bill_votes(bill);

-- Notenda-spár (/spa) — meðaltal þvert á notendur per efni.
CREATE TABLE IF NOT EXISTS spa_votes (
  topic   TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  val     REAL NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (topic, user_id)
);
CREATE INDEX IF NOT EXISTS idx_spa_votes_topic ON spa_votes(topic);

-- Kannanir (/polls, /pollvote) — skilgreiningar + atkvæði.
CREATE TABLE IF NOT EXISTS polls (
  id       TEXT PRIMARY KEY,
  spurning TEXT NOT NULL,
  valkostir TEXT NOT NULL,           -- JSON array af strengjum
  created  INTEGER NOT NULL,
  virk     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  opt     INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

-- Mánaðar-kvóti fyrir þjónustu-áskriftir (fasteign 20/mán, thingskyrslur 20/mán).
ALTER TABLE sub_service ADD COLUMN used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sub_service ADD COLUMN used_month TEXT;
