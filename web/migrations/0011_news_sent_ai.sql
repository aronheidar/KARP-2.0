-- 0011_news_sent_ai.sql — AI-metinn tónn per frétt (Claude Haiku) í SÉR-dálki.
--
-- HVERS VEGNA SÉR-DÁLKUR en ekki yfirskrifa `sent`:
--   • `sent` er lexíkon-tónn sem worker setur STRAX við innlestur (newsIngest → _tone(body)),
--     svo hver ný frétt hefur alltaf eitthvað gildi. Það viljum við halda.
--   • `sent_ai` er NULL þar til AI hefur metið fréttina → batch-keyrslan verður sjálfkrafa
--     ENDURRÆSANLEG og idempotent (WHERE sent_ai IS NULL), og hægt er að bakfæra AI-lagið
--     án þess að tapa grunngildinu.
--   • Lesendur nota COALESCE(sent_ai, sent) → AI þar sem það er til, annars lexíkon.
--
-- ⚠ Gamla lexíkon-`sent` er ÓÁREIÐANLEGT: build_archive_sentiment.js (WP-tíminn) skrifaði 0
--   fyrir hverja frétt sem ekki tókst að skora (cache-fallback), svo 46.874 af 58.298 eru 0.
--   AI-lagið leiðréttir það.
--
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0011_news_sent_ai.sql
ALTER TABLE news ADD COLUMN sent_ai INTEGER;
CREATE INDEX IF NOT EXISTS idx_news_sent_ai ON news(sent_ai);
-- Vísir fyrir batch-valið (finna óskoraðar, nýjustu fyrst) án full-table-scan.
CREATE INDEX IF NOT EXISTS idx_news_sentai_ts ON news(sent_ai, ts);
