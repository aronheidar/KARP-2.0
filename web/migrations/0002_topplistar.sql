-- Topplistar fyrirtækja v1 — fjárhags-samantekt (röðun) + primary ÍSAT (greina-sía). Sjá spec 2026-07-20.
CREATE TABLE IF NOT EXISTS fjarhagur (
  kt TEXT PRIMARY KEY,
  ar TEXT,
  sala REAL,
  hagnadur REAL,
  eignir REAL,
  eigid_fe REAL,
  sott TEXT
);
CREATE INDEX IF NOT EXISTS idx_fjarhagur_sala ON fjarhagur(sala);
