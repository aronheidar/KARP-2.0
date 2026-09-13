-- 0015: Hjálparbeiðnir (tickets) + skilaboðaþráður — þjónustufulltrúa-/CTO-flæðið á /stjorn/ (13.9.2026).
-- Hvert erindi á hjalp@karp.is (formið /hjalp/, beinn póstur, eða samið á /stjorn/) verður ticket;
-- ÖLL skilaboð inn og út (notandi, agent, Aron) skrást í ticket_msgs svo /stjorn/ sýni allan þráðinn
-- án þess að þurfa Gmail-lesaðgang. Staða: nytt → stadfest → svarad | cto → tillaga → samthykkt → lagad → lokad | hafnad.
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  uppruni TEXT NOT NULL DEFAULT 'form',      -- form | gmail | stjorn
  nafn TEXT,
  netfang TEXT NOT NULL,
  user_id INTEGER,
  flokkur TEXT,                              -- HJALP_FLOKKAR (val notanda)
  tegund TEXT,                               -- AI: villa | spurning | adgangur | reikningur | osk | annad
  forgangur INTEGER NOT NULL DEFAULT 2,      -- 1 hátt · 2 miðlungs · 3 lágt
  efni TEXT,
  lysing TEXT NOT NULL,
  stada TEXT NOT NULL DEFAULT 'nytt',
  ai_greining TEXT,                          -- JSON {tegund, forgangur, samantekt, svar, cto_brief, kb, model}
  ack_sent INTEGER,
  svar_sent INTEGER,
  cto_pr TEXT,
  cto_branch TEXT,
  cto_samantekt TEXT,
  samthykkt_by INTEGER,
  samthykkt_at INTEGER,
  gmail_thread TEXT,
  gmail_msgid TEXT,
  notur TEXT
);
CREATE INDEX IF NOT EXISTS tickets_stada ON tickets(stada, created);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_gmail_msgid ON tickets(gmail_msgid) WHERE gmail_msgid IS NOT NULL;

CREATE TABLE IF NOT EXISTS ticket_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  dir TEXT NOT NULL,                         -- in | out | moot (ráðsfundur persónanna — engin ný tafla, sjá src/worker/moot.mjs)
  sent_by TEXT NOT NULL,                     -- notandi | agent | aron | cto · dir='moot': persónu-id (innlegg) | moot (niðurstaða Kára) | moot_fall (kall féll) | aron (atkvæði)
  fra TEXT,
  til TEXT,
  efni TEXT,
  texti TEXT NOT NULL,
  gmail_msgid TEXT,
  meta TEXT                                  -- JSON (t.d. {ok, error} úr sendGmail)
);
CREATE INDEX IF NOT EXISTS ticket_msgs_ticket ON ticket_msgs(ticket_id, ts);
