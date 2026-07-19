-- 0007_news_sent.sql — geymdur tónn per grein (léttur lexíkon-tónn, eins og gamla wp_karp_news.sentiment)
-- svo yearreview reikni nákvæman mánaðar-tón í SQL (AVG(sent)) yfir allt safnið, ekki bara úrtak.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0007_news_sent.sql
ALTER TABLE news ADD COLUMN sent INTEGER;
CREATE INDEX IF NOT EXISTS idx_news_sent ON news(sent);
