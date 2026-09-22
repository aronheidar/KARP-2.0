#!/usr/bin/env node
// =============================================================================
//  build_heilsa.mjs — smíðar web/public/gogn/heilsa.json: FERSKLEIKI lykil-gagnaveita
//  + ÞEKJU-mælar. Stjórnborðið (/stjorn/) les þetta og sýnir „🩺 Gagnaheilsa".
//  Röksemd: ef gagna-pípa brotnar hættir `updated` að færast fram → veitan verður
//  „stale" (rauð) → sést strax. Keyrt í refresh-data workflow EFTIR að veitur uppfærast
//  (svo dagsetningar séu ferskar) — og má keyra staðbundið: node skriptur/build_heilsa.mjs
//
//  ⚠⚠ TVÆR ÓLÍKAR MÆLINGAR (22.9.2026):
//   • `freshness` mælir hvenær skriptan KEYRÐI (`updated`) → nær pípum sem hrynja.
//   • `timabil` mælir aldur NÝJASTA TÍMABILS gagnanna (lib/ferskleiki.mjs) → nær pípum sem keyra en lesa
//     gömul gögn. Fimm söfn stóðu í allt að þrjá mánuði þannig (atvinnuleysi á forsíðu í maí) og
//     `freshness` var græn allan tímann, því `updated` færðist fram á hverjum degi. Hrafn les `timabil`.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAGNASOFN, metaFerskleika } from './lib/ferskleiki.mjs';

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
  // ⚠ BÆTT VIÐ 14.9.2026 EFTIR ÞÖGULA BILUN. numbeo var ÓVÖKTUÐ: skrapið hætti að skila 22.8,
  //   skrifaði TÓMA skrá yfir 55 góða liði, og verðsamanburðarhlutinn á /samanburdur/ hvarf af
  //   vefnum í þrjár vikur án þess að nokkuð yrði rautt. Ferskleika-vöktun EIN hefði ekki dugað —
  //   skráin var til og nýleg, bara tóm — svo build_numbeo.js fékk líka seiglu-vörn. Þetta hlið
  //   grípur hina hliðina: haldi seiglan gömlu eintaki of lengi sést það hér.
  //   WEEKLY því skrapið er þungt og verðlag hreyfist hægt; strangara þak gæfi falskt rautt.
  ['numbeo.json', 'Numbeo verðsamanburður', WEEKLY],
  // ⚠ BÆTT VIÐ 14.9.2026 ÁSAMT build_sveitarfelog_fin.js. Skráin hafði ÁÐUR enga byggingarskriftu
  //   og engin metagögn — hún stóð óbreytt frá 29.6 og enginn vissi hvaða ár hún sýndi. MONTHLY því
  //   Sambandið uppfærir pivot-skrána þegar ársreikningum er skilað, ekki daglega.
  ['sveitarfelog_fin.json', 'Fjárhagur sveitarfélaga', MONTHLY],
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

// Tímabil: aldur nýjasta tímabils í tölfræðisöfnunum (les RÓT gogn/, uppsprettuna).
function timabil() {
  const lesa = (skra) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'gogn', skra + '.json'), 'utf8')); } catch (e) { return null; } };
  return metaFerskleika(GAGNASOFN.map((g) => ({ ...g, json: lesa(g.skra) })), new Date().toISOString().slice(0, 10));
}

const heilsa = { builtAt: new Date().toISOString(), freshness, coverage: coverage(), timabil: timabil() };
fs.writeFileSync(path.join(GOGN, 'heilsa.json'), JSON.stringify(heilsa, null, 1));
console.log(`heilsa.json → ${freshness.length} veitur · ársreikn ${JSON.stringify(heilsa.coverage.arsreikningar)} · eigendur ${JSON.stringify(heilsa.coverage.eigendur)}`);
const MERKI = { ok: '✓', gamalt: '⚠ GAMALT', olesanlegt: '⚠ ÓLESANLEGT' };
for (const r of heilsa.timabil) console.log(`  ${MERKI[r.stada].padEnd(13)} ${r.nafn}: ${r.timabil ?? '—'}${r.aldur != null ? ` (${r.aldur} d, hámark ${r.hamark})` : ''}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const linur = ['### Aldur nýjasta tímabils', '', '| staða | gagnasafn | nýjasta tímabil | aldur (dagar) | hámark |', '|---|---|---|---|---|',
    ...heilsa.timabil.map((r) => `| ${MERKI[r.stada]} | ${r.nafn} | ${r.timabil ?? '—'} | ${r.aldur ?? '—'} | ${r.hamark} |`)];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, linur.join('\n') + '\n');
}
