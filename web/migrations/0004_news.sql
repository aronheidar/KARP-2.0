-- 0004_news.sql — F7: frétta-safn í D1 (leysir WP wp_karp_news + RSS-endapunkta af hólmi).
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0004_news.sql
-- Cron (worker scheduled, á 3 klst fresti) les íslenska fjölmiðla-RSS → safnar hér (dedup á slóð),
-- grisjar > 90 daga. Notað af /api/frettir (stika+/frettir/), /api/firma (fyrirtækja-umfjöllun)
-- og viku-digest. Safnast með tíma (engin bakfærsla á gamla WP-safninu — það er læst/farið).
CREATE TABLE IF NOT EXISTS news (
  url    TEXT PRIMARY KEY,            -- einkvæmt per grein (dedup)
  title  TEXT NOT NULL,
  source TEXT,                        -- 'mbl.is' | 'RÚV' | 'Vísir' | 'Heimildin' | 'Viðskiptablaðið'
  ts     INTEGER NOT NULL             -- unix (pubDate; ella innlestrar-tími)
);
CREATE INDEX IF NOT EXISTS idx_news_ts ON news(ts);
