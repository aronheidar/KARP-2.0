-- Topplistar fyrirtækja v1 — fjárhags-samantekt (röðun) + primary ÍSAT (greina-sía). Sjá spec 2026-07-20.
CREATE TABLE IF NOT EXISTS fjarhagur (
  kt TEXT PRIMARY KEY,
  ar TEXT,
  sala REAL,
  hagnadur REAL,
  eignir REAL,
  eigid_fe REAL,
  sott TEXT
);
CREATE INDEX IF NOT EXISTS idx_fjarhagur_sala ON fjarhagur(sala);

-- felog.isat_primary: fyrsti ÍSAT-kóði (greina-sía fyrir topplista). Viðhaldið áfram af nætur-crawl
-- (crawl_tengsl.mjs). ⚠ APPLY-ONCE: á EXISTING D1 þar sem dálkurinn er þegar til villar þessi ALTER
-- ("duplicate column name") — það er skaðlaust (migrations eru keyrðar einu sinni). Á FERSKA D1 (þar
-- sem felog er þegar til úr fyrri migration) gengur hún upp og fyllir dálkinn.
ALTER TABLE felog ADD COLUMN isat_primary TEXT;
UPDATE felog SET isat_primary = json_extract(isat, '$[0].id') WHERE isat IS NOT NULL AND isat <> '[]' AND isat_primary IS NULL;
