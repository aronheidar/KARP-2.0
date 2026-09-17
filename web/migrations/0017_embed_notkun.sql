-- Teljari fyrir innfellda glugga (allt.is o.fl.). Fast mánaðargjald þarf samt tölu.
-- ⚠⚠ ENGIN persónugreinanleg gögn. Ekki heimilisfang, ekki fyrirspurn, ekki IP. Aðeins talning.
CREATE TABLE IF NOT EXISTS embed_notkun (
  dagur       TEXT NOT NULL,          -- YYYY-MM-DD (UTC)
  uppspretta  TEXT NOT NULL,          -- lokaður listi, sjá EMBED_LEN í src/worker/embed.mjs
  fjoldi      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dagur, uppspretta)
);
