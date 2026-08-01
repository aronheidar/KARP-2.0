-- 0012_kyc_adverse.sql — FATF-flokkað adverse media (10. KYC-merkið) + frystir tón-mánuðir.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0012_kyc_adverse.sql
--
-- ⚠ FROSNAR TÖFLUR: news-taflan grisjast eftir 400 daga en adverse media-saga félags og
-- tón-tímaröðin mega ALDREI fylgja með — EDD á að ná yfir árabil og tímaröð sem er hent
-- verður aldrei endursköpuð (rýni 2026-08-01). Ekkert DELETE fer nokkurn tíma á þessar töflur.
--
-- kyc_adverse er HNATTRÆN per kt (eins og kyc_snapshot/kyc_event): flokkun er staðreynd um
-- lögaðilann, ekki um vaktarann. Lykluð EINGÖNGU á kt LÖGAÐILA (DPIA leið A — aldrei einstaklinga)
-- og birt aðeins í gáttaðri KYC-möppu.
CREATE TABLE IF NOT EXISTS kyc_adverse (
  kt TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  source TEXT,
  dags TEXT,
  flokkur TEXT NOT NULL,            -- FATF_FLOKKAR í lib/adverse-media.mjs
  stada TEXT DEFAULT 'umfjollun',   -- umfjollun | asokun | akaera | domur
  alvarleiki TEXT NOT NULL,         -- ADV_SEVERITY: critical | high
  model TEXT,
  created_at INTEGER,
  PRIMARY KEY (kt, url)
);
CREATE INDEX IF NOT EXISTS idx_kycadv_kt ON kyc_adverse(kt, dags);

-- „Séð"-skrá flokkarans: hver metin frétt (líka hreinar, sem fara EKKI í kyc_adverse) skráist hér
-- svo nætur-keyrslan meti aldrei sömu frétt tvisvar — annars endur-flokkaðist allur LIKE-gluggi
-- stórra félaga á hverri nóttu (kostnaðar-rýni 2026-08-01).
CREATE TABLE IF NOT EXISTS kyc_adverse_sed (
  kt TEXT NOT NULL,
  url TEXT NOT NULL,
  at INTEGER,
  PRIMARY KEY (kt, url)
);

-- Mánaðarleg tón-frysting vaktaðra félaga: fjöldi frétta + meðal-AI-tónn. Grunnur síðari
-- CDD-greinargerða og tón-tímaraða sem 400-daga grisjunin myndi annars eyða.
CREATE TABLE IF NOT EXISTS kyc_tonn (
  kt TEXT NOT NULL,
  man TEXT NOT NULL,                -- 'YYYY-MM'
  n INTEGER,
  tonn REAL,
  PRIMARY KEY (kt, man)
);
