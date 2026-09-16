-- 0016_markadsefni.sql — efnissafn markaðsfulltrúans (Bjarki). Keyrt:
--   npx wrangler d1 execute tengsl --remote --file web/migrations/0016_markadsefni.sql
--
-- ⚠ Þetta er EKKI afrit af Postiz. Postiz er sannleikurinn um hvað fór út og hvenær; þessi tafla bætir
--   við því sem Postiz veit ekki: UM HVAÐ verkið fjallaði og HVAÐA TÖLU það byggði á. Án þess getur
--   Bjarki ekki svarað hvort við höfum sagt þetta áður — og þá er hann bara dagatal með andliti.
--
-- ⚠⚠ LEIÐRÉTT 16.9 — upphaflega stóð hér að postiz_id geymdi HÓPINN (`group`) og að sama myndband á
--   LinkedIn og Facebook kæmi sem tvær færslur með sameiginlegt group. ÞAÐ ER RANGT. Mæling á
--   reikningnum: `group === id` í öllum 41 færslum, og 18 pör deildu texta og birtingartíma en báru
--   sitt hvort `group`. Postiz gefur hverri einustu færslu sitt eigið group, svo það auðkennir
--   BIRTINGU en ekki verk. Þar á ofan skilar `posts:create` engu group, aðeins [{postId,integration}].
-- ⚠ postiz_id geymir því FÆRSLU-AUÐKENNI (cuid) — það fyrsta í stafrófsröð af auðkennum verksins.
--   Samstillingin telur línu fundna ef EITTHVERT auðkenni verksins er þegar skráð. Hópað er á
--   birtingartíma + fullan texta; sjá `hopaFaerslur` í ../src/lib/markadsefni.mjs.
CREATE TABLE IF NOT EXISTS markadsefni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created    INTEGER NOT NULL,
  titill     TEXT NOT NULL,
  tegund     TEXT NOT NULL DEFAULT 'myndband',   -- myndband | mynd | texti
  efnistok   TEXT,                               -- málefnaheiti úr malefni.json (NULL = óflokkað)
  tala       TEXT,                               -- talan sem verkið byggir á, sem TEXTI ("1.708,5 ma.kr.")
  heimild    TEXT,                               -- hvaðan talan kom
  lota       INTEGER,                            -- framleiðslulota
  postiz_id  TEXT,                               -- færslu-auðkenni (cuid) úr Postiz, ekki `group` — sjá að ofan
  rasir      TEXT,                               -- JSON-fylki rásarheita
  birt       INTEGER,                            -- unix þegar það fór út (NULL = drög eða í röð)
  skra       TEXT                                -- skráarnafn (upplýsingar, ekki vefslóð)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_markadsefni_postiz ON markadsefni(postiz_id) WHERE postiz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markadsefni_birt ON markadsefni(birt);
CREATE INDEX IF NOT EXISTS idx_markadsefni_efnistok ON markadsefni(efnistok);
