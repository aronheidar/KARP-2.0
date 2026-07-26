-- 0008_kyc.sql — Áreiðanleikavaktin (KYC-vöktun v1). Sjá spec 2026-07-26.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0008_kyc.sql
-- kyc_watch/kyc_audit/kyc_ack eru PER-EIGANDA (owner_id = users.id). kyc_snapshot/kyc_event eru HNATTRÆN per kt.
CREATE TABLE IF NOT EXISTS kyc_watch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, kt TEXT NOT NULL, nafn TEXT,
  risk TEXT, risk_reason TEXT, status TEXT DEFAULT 'active',
  added_at INTEGER, reviewed_at INTEGER,
  UNIQUE(owner_id, kt)
);
CREATE INDEX IF NOT EXISTS idx_kycwatch_owner ON kyc_watch(owner_id);
CREATE TABLE IF NOT EXISTS kyc_snapshot (
  kt TEXT NOT NULL, signal TEXT NOT NULL,
  state_hash TEXT, state_json TEXT, computed_at INTEGER,
  PRIMARY KEY (kt, signal)
);
CREATE TABLE IF NOT EXISTS kyc_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kt TEXT NOT NULL, signal TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  detail_json TEXT, detected_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_kycevent_kt ON kyc_event(kt, detected_at);
CREATE TABLE IF NOT EXISTS kyc_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, kt TEXT NOT NULL, ts INTEGER NOT NULL,
  actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, detail_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_kycaudit_owner ON kyc_audit(owner_id, kt, ts);
CREATE TABLE IF NOT EXISTS kyc_ack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
  status TEXT DEFAULT 'open', note TEXT, by TEXT, at INTEGER,
  UNIQUE(owner_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_kycack_owner ON kyc_ack(owner_id, status);
