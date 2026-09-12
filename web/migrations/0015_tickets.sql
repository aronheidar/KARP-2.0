-- 0015_tickets.sql — 🎫 Þjónustuborðs-tickets (12.9.2026)
-- Hjálparbeiðni af /hjalp/ verður að ticket: þjónustufulltrúi (AI) svarar og beinir,
-- CTO-agent (GitHub Actions) leggur til lagfæringu, stjórnandi samþykkir/hafnar úr pósti.
-- Sjá docs/superpowers/specs/2026-09-12-hjalp-agentar-design.md
-- Keyrsla: npx wrangler d1 execute tengsl --remote --file=migrations/0015_tickets.sql

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,                     -- 'K-' + 6 hex (sýnt notanda sem málsnúmer)
  created TEXT NOT NULL,                   -- ISO
  updated TEXT,
  nafn TEXT NOT NULL DEFAULT '',
  netfang TEXT NOT NULL,
  flokkur TEXT NOT NULL DEFAULT 'Annað',   -- HJALP_FLOKKAR úr /api/hjalp
  lysing TEXT NOT NULL,
  innskraning INTEGER NOT NULL DEFAULT 0,
  fra TEXT DEFAULT '',                     -- slóðin sem beiðnin kom af
  stada TEXT NOT NULL DEFAULT 'nytt',      -- nytt|mottekid|cto|tillaga|greint|samthykkt|hafnad|lagad|villa
  leid TEXT DEFAULT '',                    -- 'cto' | 'madur' (ákvörðun þjónustufulltrúa, gátuð í kóða)
  svar TEXT DEFAULT '',                    -- móttökusvar þjónustufulltrúa til notanda
  verkbeining TEXT DEFAULT '',             -- verklýsing þjónustufulltrúa handa CTO-agentinum
  greining TEXT DEFAULT '',                -- niðurstaða CTO-agents (rót + hvað var gert)
  notendasvar TEXT DEFAULT '',             -- drög CTO-agents að lokasvari til notanda
  branch TEXT DEFAULT '',                  -- ticket/<id> greinin með tillögunni
  diffstat TEXT DEFAULT '',
  ahaetta TEXT DEFAULT '',                 -- mat CTO-agents: litil|medal|mikil
  atburdir TEXT NOT NULL DEFAULT '[]'      -- JSON-annáll [{t,a}]
);
CREATE INDEX IF NOT EXISTS idx_tickets_stada ON tickets(stada);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created);
