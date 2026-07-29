#!/usr/bin/env node
// =============================================================================
//  build_heilsa.mjs — smíðar web/public/gogn/heilsa.json: FERSKLEIKI lykil-gagnaveita
//  + ÞEKJU-mælar. Stjórnborðið (/stjorn/) les þetta og sýnir „🩺 Gagnaheilsa".
//  Röksemd: ef gagna-pípa brotnar hættir `updated` að færast fram → veitan verður
//  „stale" (rauð) → sést strax. Keyrt í refresh-data workflow EFTIR að veitur uppfærast
//  (svo dagsetningar séu ferskar) — og má keyra staðbundið: node skriptur/build_heilsa.mjs
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Vite/astro-gildran (import.meta.url) á ekki við hér — keyrt beint með `node`. Fallback samt á cwd.
const GOGN = [path.join(ROOT, 'web', 'public', 'gogn'), path.join(process.cwd(), 'web', 'public', 'gogn'), path.join(process.cwd(), 'public', 'gogn')].find((d) => { try { return fs.existsSync(d); } catch (e) { return false; } }) || path.join(ROOT, 'web', 'public', 'gogn');

const H = 3600 * 1000;
const DAILY = 44 * H, WEEKLY = 9 * 24 * H, MONTHLY = 40 * 24 * H;   // hámarks-aldur áður en „stale" (m.v. cadence)
// [skrá, merki, hámarks-aldur] — lykil-veiturnar sem notendur borga fyrir.
const SOURCES = [
  ['frettavel.json', 'Fréttavélin', DAILY],
  ['lyf.json', 'Sérlyfjaskrá', DAILY],
  ['utbod.json', 'Útboð', DAILY],
  ['logbirting.json', 'Lögbirtingablaðið', DAILY],
  ['eftirlit.json', 'Heilbrigðiseftirlit', DAILY],
  ['byggingarleyfi_vakt.json', 'Byggingarleyfi', DAILY],
  ['lobbyvakt.json', 'Lobbývakt', DAILY],
  ['stjornartidindi.json', 'Stjórnartíðindi', DAILY],
  ['sedlabanki.json', 'Seðlabanki', DAILY],
  ['hugverk.json', 'Hugverk / vörumerki', DAILY],
  ['domar_ai.json', 'Dómar', DAILY],
  ['markadir.json', 'Markaðir', DAILY],
  ['styrkir.json', 'Styrkir', WEEKLY],
  ['pep.json', 'PEP-listi', WEEKLY],
  ['kvoti.json', 'Kvótavaktin', WEEKLY],
  ['birgjar.json', 'Birgjar', MONTHLY],   // Fjársýslan birtir mánaðarlega → `updated` lækkar ekki þótt vikuleg keyrsla sé í lagi
  ['sanctions.json', 'Refsilistar', MONTHLY],
  ['skip_owners.json', 'Skipaskrá / eigendur', MONTHLY],
];
const pickDate = (o) => { if (!o || typeof o !== 'object') return null; for (const k of ['updated', 'generated', 'uppfaert', 'sott', 'ts', 'dags', 'timestamp', 'date']) if (o[k]) return String(o[k]); return null; };

const freshness = [];
for (const [file, label, maxAge] of SOURCES) {
  const p = path.join(GOGN, file);
  let iso = null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    iso = pickDate(Array.isArray(j) ? (j[0] || {}) : j) || fs.statSync(p).mtime.toISOString();
  } catch (e) { iso = null; }   // vantar skrá / villa → iso null (birtist sem „óþekkt")
  freshness.push({ label, file, iso, maxAge });
}

// Þekja: ársreikningar (% með lykiltölur) + eigendur (fjöldi byggð).
function coverage() {
  const out = {};
  try {
    const dir = path.join(GOGN, 'arsreikningar');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    let withKpi = 0, engin = 0, scanned = 0;
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (d.ar && Object.keys(d.ar).length) withKpi++;
        else if (d.engin) { engin++; if (d.flokkur === 'skannad') scanned++; }
      } catch (e) {}
    }
    out.arsreikningar = { total: files.length, withKpi, engin, scanned, pct: files.length ? Math.round(withKpi / files.length * 100) : 0 };
  } catch (e) {}
  try {
    const dir = path.join(GOGN, 'eigendur');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    let engin = 0;
    for (const f of files) { try { if (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).engin) engin++; } catch (e) {} }
    out.eigendur = { total: files.length, engin };
  } catch (e) {}
  return out;
}

const heilsa = { builtAt: new Date().toISOString(), freshness, coverage: coverage() };
fs.writeFileSync(path.join(GOGN, 'heilsa.json'), JSON.stringify(heilsa, null, 1));
console.log(`heilsa.json → ${freshness.length} veitur · ársreikn ${JSON.stringify(heilsa.coverage.arsreikningar)} · eigendur ${JSON.stringify(heilsa.coverage.eigendur)}`);
