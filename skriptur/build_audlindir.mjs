#!/usr/bin/env node
// build_audlindir.mjs — snapshot fyrir /audlindir/:
//   • Erlendir ferðamenn — brottfarir um KEF sl. 12 mán    (Hagstofa SAM02001)
//   • Losun á mann frá 1970 (þróun + nýjasta)              (Our World in Data)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga).
// Veiðigjald/umhverfisgjöld + raforka koma ÁFRAM úr bökuðu skattar.json/orka.json (ekki sótt hér).
// -> gogn/audlindir.json + web/public/gogn/audlindir.json
import { px, sel, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const prev = loadPrev('audlindir');

// Ferðamenn: brottfarir erlendra farþega um KEF sl. 12 mán (PxWeb SAM02001, Ríkisfang=erlendir).
let ferda12 = null;
try {
  const j = await px('Atvinnuvegir/ferdathjonusta/ferdaidnadurhagvisar/SAM02001.px', [sel('Ríkisfang', 'item', ['2'])]);
  const rows = (j.data || []).map((d) => ({ t: d.key[0], v: parseFloat(String(d.values[0]).replace(',', '.')) })).filter((x) => !isNaN(x.v)).sort((a, b) => a.t.localeCompare(b.t));
  if (rows.length >= 12) ferda12 = Math.round(rows.slice(-12).reduce((a, x) => a + x.v, 0));
} catch (e) { console.error('ferda12', e.message); }

// Losun á mann: OWID CSV (þróun frá 1970 + nýjasta) — sama mynstur og /samanburdur.
let CO2 = null;
try {
  const t = await (await fetch('https://ourworldindata.org/grapher/co-emissions-per-capita.csv')).text();
  const lines = t.split('\n');
  const rows = lines.slice(1).map((l) => l.split(',')).filter((p) => p[1] === 'ISL').map((p) => ({ y: +p[2], v: parseFloat(p[3]) })).filter((x) => x.y >= 1970 && !isNaN(x.v));
  if (rows.length > 10) CO2 = { years: rows.map((x) => x.y), vals: rows.map((x) => Math.round(x.v * 10) / 10), last: rows[rows.length - 1] };
} catch (e) { console.error('CO2', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
ferda12 = ferda12 ?? prev.ferda12 ?? null;
CO2 = CO2 ?? prev.CO2 ?? null;
if (ferda12 == null && CO2 == null) { console.error('audlindir: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('audlindir', { updated: today(), ferda12, CO2 });
console.log('audlindir.json | ferda12', ferda12, '| CO2', CO2 && CO2.years.length, 'ár | bytes', bytes);
