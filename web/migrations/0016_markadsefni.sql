-- 0016_markadsefni.sql — efnissafn markaðsfulltrúans (Bjarki). Keyrt:
--   npx wrangler d1 execute tengsl --remote --file web/migrations/0016_markadsefni.sql
--
-- ⚠ Þetta er EKKI afrit af Postiz. Postiz er sannleikurinn um hvað fór út og hvenær; þessi tafla bætir
--   við því sem Postiz veit ekki: UM HVAÐ verkið fjallaði og HVAÐA TÖLU það byggði á. Án þess getur
--   Bjarki ekki svarað hvort við höfum sagt þetta áður — og þá er hann bara dagatal með andliti.
--
-- ⚠ postiz_id geymir HÓPINN (`group`), ekki auðkenni stakrar færslu: sama myndband á LinkedIn og
--   Facebook kemur sem tvær færslur með sameiginlegt group. Hópurinn er verkið; færslan er birtingin.
CREATE TABLE IF NOT EXISTS markadsefni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created    INTEGER NOT NULL,
  titill     TEXT NOT NULL,
  tegund     TEXT NOT NULL DEFAULT 'myndband',   -- myndband | mynd | texti
  efnistok   TEXT,                               -- málefnaheiti úr malefni.json (NULL = óflokkað)
  tala       TEXT,                               -- talan sem verkið byggir á, sem TEXTI ("1.708,5 ma.kr.")
  heimild    TEXT,                               -- hvaðan talan kom
  lota       INTEGER,                            -- framleiðslulota
  postiz_id  TEXT,                               -- `group` í Postiz — eitt verk, ekki ein birting
  rasir      TEXT,                               -- JSON-fylki rásarheita
  birt       INTEGER,                            -- unix þegar það fór út (NULL = drög eða í röð)
  skra       TEXT                                -- skráarnafn (upplýsingar, ekki vefslóð)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_markadsefni_postiz ON markadsefni(postiz_id) WHERE postiz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markadsefni_birt ON markadsefni(birt);
CREATE INDEX IF NOT EXISTS idx_markadsefni_efnistok ON markadsefni(efnistok);
