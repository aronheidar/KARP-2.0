-- 0013_kyc_greinargerd.sql — eftirlitshæf áhættumats-greinargerð (audit-ready CDD narrative).
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0013_kyc_greinargerd.sql
--
-- APPEND-ONLY: hver endurmyndun er ný röð — eldri útgáfur standa sem audit-saga matsins
-- (hvað sá skýrslan á hverjum tíma). Ekkert DELETE/UPDATE fer nokkurn tíma á þessa töflu.
-- Endurmyndun AÐEINS þegar state_hash breytist (kostnaðar-gát, sjá build_kyc_greinargerd.mjs).
-- Hnattræn per kt (eins og kyc_snapshot); birt aðeins í gáttaðri möppu.
CREATE TABLE IF NOT EXISTS kyc_greinargerd (
  kt TEXT NOT NULL,
  state_hash TEXT NOT NULL,         -- greinargerdHash(samhengi) — sam-hash allra inntaka
  samhengi_json TEXT,               -- afmarkaða staðreynda-samhengið (rekjanleiki hverrar setningar)
  tulkun TEXT,                      -- LLM-samantektin (gátuð með parseTulkun) — NULL ef gátin felldi
  model TEXT,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (kt, generated_at)
);
CREATE INDEX IF NOT EXISTS idx_kycgrein_kt ON kyc_greinargerd(kt, generated_at DESC);
