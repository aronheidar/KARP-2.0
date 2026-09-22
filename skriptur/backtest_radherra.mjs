// backtest_radherra.mjs — endurspilar ráðherra-skynjarann yfir committaða sögu og ber saman við gamla hegðun.
//
// Keyrsla:  node skriptur/backtest_radherra.mjs
//
// Hver commit sem snerti gogn/frettavel_state.json er ein keyrsla fréttavélarinnar; cabinet.json úr sömu commit er
// það sem hún sá. cabinet.json er FYLKI og bar enga dagsetningu í sögunni, svo `sott` er hermt eftir því hvenær
// innihaldið breyttist síðast — nákvæmlega það sem build_cabinet.js skrifar nú í cabinet_meta.json (aðeins þegar
// sóknin heppnaðist). Engin ritun, engin netsókn — aðeins `git show`.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pickRadherra } = createRequire(import.meta.url)('./radherra_detect.js');
const git = (...a) => execFileSync('git', ['-C', ROT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const J = (h, f) => { try { return JSON.parse(git('show', `${h}:${f}`)); } catch (e) { return null; } };

// Gamli skynjarinn eins og hann var FYRIR 22.9: ódagsettur grunnur {id: {nafn, emb, flokkur}}, hver keyrsla skrifar
// yfir (líka tóm), emb borið saman sem strengur, ekkert þak.
function gamli(cab, grunnur) {
  if (!Array.isArray(cab)) return { cand: [], grunnur };
  const cur = {};
  for (const c of cab) cur[c.id] = { nafn: c.nafn, emb: (c.emb || [])[0] || '', flokkur: c.flok || '' };
  const cand = [];
  if (grunnur) for (const [id, c] of Object.entries(cur)) {
    const p = grunnur[id];
    if (!p) { if (c.emb) cand.push({ nafn: c.nafn, embaetti: c.emb, adur: null }); continue; }
    if (p.emb !== c.emb) cand.push({ nafn: c.nafn, embaetti: c.emb, adur: p.emb || null });
  }
  return { cand, grunnur: cur };
}

const runs = git('log', '--format=%H %cI', '--', 'gogn/frettavel_state.json').trim().split('\n')
  .map((l) => { const [h, d] = l.split(' '); return { h, dags: d.slice(0, 10) }; }).reverse();

let gG = null, nG = null, sidastEfni, sott = null;
const gEv = [], nEv = [];
for (const r of runs) {
  const cab = J(r.h, 'gogn/cabinet.json');
  // `sott` = dagurinn sem innihaldið breyttist síðast (það sem cabinet_meta.json geymir nú).
  const efni = Array.isArray(cab) ? JSON.stringify(cab) : null;
  if (efni && efni !== sidastEfni) { sott = r.dags; sidastEfni = efni; }

  const rg = gamli(cab, gG); gG = rg.grunnur; for (const c of rg.cand) gEv.push({ dags: r.dags, ...c });
  const rn = pickRadherra(cab, nG, { idag: r.dags, sott }); nG = rn.grunnur; for (const c of rn.cand) nEv.push({ dags: r.dags, ...c });
}

const syna = (nafn, ev) => {
  console.log(`\n${nafn} — birtar fréttir: ${ev.length}`);
  for (const e of ev) console.log(`  ${e.dags}  ${e.nafn} tekur við sem ${e.embaetti}${e.adur ? ` (áður ${e.adur})` : ''}`);
};
console.log(`keyrslur (commit á gogn/frettavel_state.json): ${runs.length}`);
syna('GAMLI', gEv);
syna('NÝI  ', nEv);

const rangar = gEv.filter((e) => e.dags === '2026-08-23');
console.log(`\n23.8.2026 (daginn eftir að Alþingi svaraði 429 og cabinet.json varð []) — gamli: ${rangar.length} rangar fréttir, nýi: ${nEv.filter((e) => e.dags === '2026-08-23').length}`);
if (nEv.length > gEv.length) { console.error('✖ FALL: nýi skynjarinn birtir fleiri fréttir en sá gamli'); process.exit(1); }
console.log('✔ nýi skynjarinn birtir engar af röngu fréttunum');
