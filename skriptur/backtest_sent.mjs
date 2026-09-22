// backtest_sent.mjs — endurspilar tón-skynjarann yfir committaða sögu og prófar flökt-vörnina á raungögnum.
//
// Keyrsla:  node skriptur/backtest_sent.mjs
//
// Tveir hlutar:
//  A) SAGAN. Hver commit sem snerti gogn/frettavel_state.json er ein keyrsla; sentiment.json úr sömu commit er það
//     sem hún sá. Gamli skynjarinn (ódagsettur grunnur, engin hlutfallsvörn, engin kæling) á móti þeim nýja.
//  B) FLÖKT. Skráin á aðeins tvær útgáfur í git, svo dagleg sveifla sést ekki í sögunni. Í staðinn er flöktið hermt
//     á RAUNGÖGNUM: félögin úr núverandi sentiment.json og vísitalan látin sveiflast milli tveggja gilda dag eftir
//     dag — nákvæmlega það sem tvær nýjar fréttir hjá litlu félagi gera.
// Engin ritun, engin netsókn — aðeins `git show`.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pickSent } = createRequire(import.meta.url)('./sent_detect.js');
const git = (...a) => execFileSync('git', ['-C', ROT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const J = (h, f) => { try { return JSON.parse(git('show', `${h}:${f}`)); } catch (e) { return null; } };

// Gamli skynjarinn eins og hann var FYRIR 22.9: ber vörpun, engin dagsetning, hver keyrsla skrifar yfir.
function gamli(se, grunnur) {
  const companies = (se && se.companies) || {};
  const cur = {};
  for (const [nafn, d] of Object.entries(companies)) if (d && typeof d.idx === 'number') cur[nafn] = d.idx;
  const cand = [];
  if (grunnur) for (const [nafn, i] of Object.entries(cur)) {
    const fra = grunnur[nafn];
    if (typeof fra === 'number' && Math.abs(i - fra) >= 40) cand.push({ nafn, fra, i, w: Math.abs(i - fra) });
  }
  cand.sort((a, b) => b.w - a.w);
  return { cand: cand.slice(0, 3), grunnur: cur };
}

// ── A) sagan ────────────────────────────────────────────────────────────────
const runs = git('log', '--format=%H %cI', '--', 'gogn/frettavel_state.json').trim().split('\n')
  .map((l) => { const [h, d] = l.split(' '); return { h, dags: d.slice(0, 10) }; }).reverse();
let gG = null, nG = null;
const gEv = [], nEv = [];
for (const r of runs) {
  const se = J(r.h, 'gogn/sentiment.json');
  const rg = gamli(se, gG); gG = rg.grunnur; for (const c of rg.cand) gEv.push({ dags: r.dags, ...c });
  const rn = pickSent(se, nG); nG = rn.grunnur; for (const c of rn.cand) nEv.push({ dags: r.dags, ...c });
}
const syna = (nafn, ev) => { console.log(`${nafn} — birtar fréttir: ${ev.length}`); for (const e of ev) console.log(`  ${e.dags}  ${e.nafn}: ${e.fra} → ${e.i}`); };
console.log(`A) SAGAN — keyrslur: ${runs.length}\n`);
syna('GAMLI', gEv);
syna('NÝI  ', nEv);

// ── B) flökt á raungögnum ───────────────────────────────────────────────────
const nu = JSON.parse(git('show', 'HEAD:gogn/sentiment.json'));
const smaa = Object.entries(nu.companies || {}).filter(([, x]) => (x.n || 0) >= 5 && (x.n || 0) <= 8).map(([k, x]) => [k, x.n]);
console.log(`\nB) FLÖKT — félög með n = 5–8 (tvær fréttir duga í 40 stiga sveiflu): ${smaa.map(([k, n]) => `${k}(n=${n})`).join(', ')}`);
const dagur = (i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
const skra = (i) => ({
  updated: dagur(i),
  companies: Object.fromEntries(Object.entries(nu.companies).map(([k, x]) => {
    const flaktar = smaa.some(([s]) => s === k);
    return [k, { ...x, idx: flaktar ? (i % 2 ? x.idx + 45 : x.idx) : x.idx }];
  })),
});
let gG2 = null, nG2 = null, gN = 0, nN = 0;
for (let i = 0; i < 40; i++) {           // 40 dagar af hreinu flökti fram og til baka
  const rg = gamli(skra(i), gG2); gG2 = rg.grunnur; gN += rg.cand.length;
  const rn = pickSent(skra(i), nG2); nG2 = rn.grunnur; nN += rn.cand.length;
}
console.log(`   40 dagar af sveiflu fram og til baka hjá ${smaa.length} félögum:`);
console.log(`   GAMLI: ${gN} fréttir   NÝI: ${nN} fréttir  (kæling: 1 per félag á 30 daga)`);

const vaent = smaa.length * 2;           // 40 dagar / 30 daga kæling → í mesta lagi tvær lotur per félag
if (nN > vaent) { console.error(`✖ FALL: nýi skynjarinn fór yfir kælingarþakið (${nN} > ${vaent})`); process.exit(1); }
if (nEv.length > gEv.length) { console.error('✖ FALL: nýi skynjarinn birtir fleiri sögulegar fréttir en sá gamli'); process.exit(1); }
console.log('\n✔ kælingin heldur og sögulegu fréttirnar fjölga ekki');
