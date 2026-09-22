// backtest_sendirad.mjs — endurspilar sendirad-skynjarann yfir committaða sögu og ber saman við gamla hegðun.
//
// Keyrsla:  node skriptur/backtest_sendirad.mjs
//
// Hver commit sem snerti gogn/frettavel_state.json er ein keyrsla fréttavélarinnar. Fyrir hverja slíka er
// gogn/sendirad.json úr sömu commit lesin og báðir skynjarar keyrðir: gamli (inline-kóðinn eins og hann var) og
// nýi. Skráin ber enga dagsetningu í sögunni, svo commit-dagurinn er notaður sem `updated` — það er nákvæmlega sú
// dagsetning sem build_sendirad.js skrifar nú. Engin ritun, engin netsókn — aðeins `git show`.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pickSendirad } = createRequire(import.meta.url)('./sendirad_detect.js');
const git = (...a) => execFileSync('git', ['-C', ROT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const synaJson = (h, f) => { try { return JSON.parse(git('show', `${h}:${f}`)); } catch (e) { return null; } };

// Gamli skynjarinn, orðréttur: ódagsettur grunnur, hver keyrsla skrifar yfir — líka tóm.
function gamli(sr, grunnur) {
  if (!(sr && Array.isArray(sr.abroad))) return { cand: [], grunnur };
  const cur = {}; sr.abroad.forEach((s) => { if (s.sendiherra) cur[s.is] = s.sendiherra; });
  const cand = [];
  if (grunnur) for (const [land, nafn] of Object.entries(cur)) {
    if (grunnur[land] && grunnur[land] !== nafn) cand.push({ land, nafn, fyrri: grunnur[land] });
  }
  return { cand, grunnur: cur };
}

const keyrslur = git('log', '--format=%H %cI', '--', 'gogn/frettavel_state.json').trim().split('\n')
  .map((l) => { const [h, d] = l.split(' '); return { h, dags: d.slice(0, 10) }; }).reverse();

let gG = null, nG = null;
const gEv = [], nEv = [];
const saga = [];
let sidast;
for (const k of keyrslur) {
  const sr = synaJson(k.h, 'gogn/sendirad.json');
  const srD = sr ? { ...sr, updated: sr.updated || k.dags } : sr;   // skráin bar enga dagsetningu í sögunni
  const rg = gamli(srD, gG); gG = rg.grunnur; for (const c of rg.cand) gEv.push({ dags: k.dags, ...c });
  const rn = pickSendirad(srD, nG); nG = rn.grunnur; for (const c of rn.cand) nEv.push({ dags: k.dags, ...c });

  const iSkra = sr ? (sr.abroad || []).filter((s) => s.sendiherra).length : null;
  const sig = `${iSkra}|${Object.keys(gG || {}).length}|${Object.keys((nG || {}).sendiherrar || {}).length}`;
  if (sig !== sidast) { saga.push({ dags: k.dags, iSkra, gamli: Object.keys(gG || {}).length, nyi: Object.keys((nG || {}).sendiherrar || {}).length }); sidast = sig; }
}

console.log(`keyrslur (commit á gogn/frettavel_state.json): ${keyrslur.length}\n`);
console.log('nöfn í skránni vs. nöfn í grunni skynjarans (aðeins breytingar):');
console.log('  dags        í skrá   gamli grunnur   nýi grunnur');
for (const s of saga) console.log(`  ${s.dags}  ${String(s.iSkra).padStart(6)}   ${String(s.gamli).padStart(13)}   ${String(s.nyi).padStart(11)}`);
console.log(`\nGAMLI — birtar fréttir: ${gEv.length}`);
for (const e of gEv) console.log(`  ${e.dags}  ${e.land}: ${e.fyrri} → ${e.nafn}`);
console.log(`NÝI   — birtar fréttir: ${nEv.length}`);
for (const e of nEv) console.log(`  ${e.dags}  ${e.land}: ${e.fyrri} → ${e.nafn}`);

const gLok = Object.keys(gG || {}).length, nLok = Object.keys((nG || {}).sendiherrar || {}).length;
console.log(`\ngrunnur í lok sögunnar — gamli: ${gLok} lönd, nýi: ${nLok} lönd`);
if (nLok < gLok) { console.error('✖ FALL: nýi skynjarinn geymir færri nöfn en sá gamli'); process.exit(1); }
console.log(nLok > gLok ? '✔ nýi skynjarinn hélt nöfnunum sem sá gamli þurrkaði út' : '✔ jafnstaða');
