-- 0006_stjorn_sync.sql — S2b: Node-stjórnborðið ýtir rekstrar-samantekt (samþykktir/tickets/
-- herferðir/ledger) í karp.is-D1 svo hún sjáist í /stjorn/. Lykil-gildi (k='summary' → JSON).
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0006_stjorn_sync.sql
CREATE TABLE IF NOT EXISTS stjorn_sync (
  k       TEXT PRIMARY KEY,
  v       TEXT NOT NULL,      -- JSON
  updated INTEGER NOT NULL
);
