-- 0005_news_body.sql — F7b: bæta `body` við news (titill + RSS-lýsing) svo premium-greiningar
-- (firmagraph co-occurrence, agenda, firma) hafi ríkari texta til að leita í en bara fyrirsögn.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0005_news_body.sql
ALTER TABLE news ADD COLUMN body TEXT;
