-- 0002_auth.sql — Cloudflare-native auðkenning + áskriftar-réttindi (leysir WordPress/Xnet af hólmi).
-- Keyrt á TENGSL-D1: npx wrangler d1 execute tengsl --remote --file web/migrations/0002_auth.sql
-- Hugmynd: Áskell er sannleiksuppspretta ÁSKRIFTA (vefkrókur → grant hér); D1 geymir notendur,
-- réttindi og staðfestingar-/endurstillinga-tóken. Lotur = undirritaðar kökur (engin lotu-tafla).

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT UNIQUE NOT NULL,          -- lágstafað
  username       TEXT UNIQUE,                   -- valfrjálst birtinganafn/innskráning
  pass_hash      TEXT NOT NULL,                 -- 'pbkdf2$<iter>$<salt_b64>$<hash_b64>' (Web Crypto)
  name           TEXT,
  is_admin       INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,    -- 0 = óstaðfest (staðfestingar-hlekkur); 1 = virkt
  kt             TEXT,                          -- bindur Áskell customer_reference við notanda
  tier           TEXT,                          -- grunnur | fyrirtaeki | fyrirtaeki_plus
  tier_until     INTEGER,                       -- unix; NULL/liðið = ekki virkt þrep
  tier_trial_used INTEGER NOT NULL DEFAULT 0,   -- prufuvörn þreps
  tier_askell    TEXT,                          -- Áskell samnings-id (uppsögn)
  reports_used   INTEGER NOT NULL DEFAULT 0,    -- skýrslu-kvóti mánaðarins
  reports_month  TEXT,                          -- 'YYYY-MM' (núllstilling við mánaðamót)
  terms_accepted INTEGER,                       -- unix samþykkis skilmála
  created        INTEGER NOT NULL,
  updated        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_kt ON users(kt);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Þjónustu-áskriftir (sérlausnir): Útboð/Fjölmiðla/Fasteign/Þingskýrslur/Kvóti — per notanda.
CREATE TABLE IF NOT EXISTS sub_service (
  user_id     INTEGER NOT NULL,
  service     TEXT NOT NULL,                    -- utbod | frettir | fasteign | thingskyrslur | kvoti
  until       INTEGER,                          -- unix aðgangur til (Áskell active_until)
  askell_id   TEXT,                             -- samnings-id (uppsögn)
  trial_used  INTEGER NOT NULL DEFAULT 0,       -- prufuvörn (einu sinni per notanda+þjónustu)
  PRIMARY KEY (user_id, service)
);

-- Keyptar stakar skýrslur (990 kr einskiptis) — varanlegt grant.
CREATE TABLE IF NOT EXISTS reports_granted (
  user_id    INTEGER NOT NULL,
  report_key TEXT NOT NULL,                     -- 'fyrirtaeki:<kt>' | 'eigendur:<kt>' | 'areidanleiki:<kt>' | ...
  granted    INTEGER NOT NULL,                  -- unix
  PRIMARY KEY (user_id, report_key)
);

-- Staðfestingar-/endurstillinga-tóken (email verify + password reset). Einnota, tímabundin.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token   TEXT PRIMARY KEY,                     -- 32-bæta slembi-hex
  user_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,                        -- 'verify' | 'reset'
  expires INTEGER NOT NULL                      -- unix
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

-- Idempotency fyrir Áskell-grant (sama greidda áskrift veitt einu sinni) — speglar karp_sub_granted_refs.
CREATE TABLE IF NOT EXISTS granted_refs (
  ref     TEXT PRIMARY KEY,
  created INTEGER NOT NULL
);

-- Fyrsti admin (Aron) — email uppfært handvirkt eftir fyrstu nýskráningu, eða sett hér.
-- (Skilinn eftir sem athugasemd; admin-flögg sett með: UPDATE users SET is_admin=1 WHERE email='aron@karp.is';)
