-- 0010_account.sql — firma-account (org/sæta-sameign v1). parent_account_id = users.id eigandans; null = eigandi/sjálfstæður.
-- Keyrt: npx wrangler d1 execute tengsl --remote --file web/migrations/0010_account.sql
ALTER TABLE users ADD COLUMN parent_account_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_account_id);
