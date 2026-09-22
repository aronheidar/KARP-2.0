-- 0018_samningar.sql — samningsbundinn aðgangur (Allt fasteignasala o.fl.). Sjá web/src/lib/samningar.mjs.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file migrations/0018_samningar.sql
--
-- users.samningur = lykill í SAMNINGAR (lokaður listi í kóða), NULL = enginn samningur. Aðeins D1-skrift
-- setur hann; enginn endapunktur skrifar dálkinn. ⚠ Samningsréttindi fara EKKI í sub_service, því þar
-- teldust þau á listaverði í MRR stjórnborðsins og í samstemmingu við Áskel.
ALTER TABLE users ADD COLUMN samningur TEXT;

-- Notkun samnings per mánuð, svo semja megi um endurnýjun út frá raunnotkun.
-- ⚠⚠ ENGIN persónugreinanleg gögn. Hvorki notandi, heimilisfang né fyrirspurn. Aðeins talning.
-- ⚠ fjoldi = KEYRSLUR á matinu, ekki ólíkar eignir (sama eign metin aftur telst aftur).
CREATE TABLE IF NOT EXISTS samningur_notkun (
  manudur    TEXT NOT NULL,          -- YYYY-MM (UTC)
  samningur  TEXT NOT NULL,          -- lykill í SAMNINGAR
  thjonusta  TEXT NOT NULL,          -- t.d. 'fasteign'
  fjoldi     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (manudur, samningur, thjonusta)
);
