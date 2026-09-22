// backtest_fastthr.mjs — endurspilar fastthr-skynjarann yfir committaða sögu og ber saman við það sem VAR birt.
//
// Keyrsla:  node skriptur/backtest_fastthr.mjs
//
// Hver commit sem snerti gogn/frettavel_state.json er ein keyrsla fréttavélarinnar. Fyrir hverja slíka er
// gogn/fasteignir.json úr sömu commit lesin og skynjarinn keyrður með commit-daginn sem keyrsludegi. Birtar fréttir
// gamla skynjarans eru lesnar beint úr state.fastVerdict (hver breyting á honum var ein frétt).
// Engin ritun, engin netsókn — aðeins `git show`.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pickFastthr } = createRequire(import.meta.url)('./fastthr_detect.js');
const git = (...a) => execFileSync('git', ['-C', ROT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const synaJson = (h, f) => { try { return JSON.parse(git('show', `${h}:${f}`)); } catch (e) { return null; } };

const keyrslur = git('log', '--format=%H %cI', '--', 'gogn/frettavel_state.json').trim().split('\n')
  .map((l) => { const [h, d] = l.split(' '); return { h, dags: d.slice(0, 10) }; }).reverse();

let grunnur = null, fyrriGamli;
const nyjar = [], gamlar = [];
for (const k of keyrslur) {
  const st = synaJson(k.h, 'gogn/frettavel_state.json');
  if (st && st.fastVerdict !== fyrriGamli) {
    if (fyrriGamli !== undefined && st.fastVerdict) gamlar.push({ dags: k.dags, v: st.fastVerdict });
    fyrriGamli = st.fastVerdict;
  }
  const fa = synaJson(k.h, 'gogn/fasteignir.json');
  const r = pickFastthr(fa, grunnur, { todayISO: k.dags });
  grunnur = r.grunnur;
  for (const c of r.cand) nyjar.push({ dags: k.dags, ...c });
}

const manudur = (x) => (x.manudur || '').slice(0, 7);
const talning = (xs, f) => xs.reduce((a, x) => ((a[f(x)] = (a[f(x)] || 0) + 1), a), {});

console.log(`keyrslur (commit á gogn/frettavel_state.json): ${keyrslur.length}\n`);
console.log('GAMLI SKYNJARINN — birtar fréttir:');
for (const g of gamlar) console.log(`  ${g.dags}  ${g.v}`);
console.log(`  alls ${gamlar.length}\n`);
console.log('NÝI SKYNJARINN — birtar fréttir:');
for (const n of nyjar) console.log(`  ${n.dags}  ${n.manudur}  ${n.fyrri} → ${n.verdict} (${n.ordalag}), chg3 ${n.chg3}, n=${n.n}`);
console.log(`  alls ${nyjar.length}\n`);

const juliGamlar = gamlar.filter((g) => g.dags.startsWith('2026-07')).length;
const juliNyjar = nyjar.filter((n) => manudur(n) === '2026-07').length;
console.log(`júlí 2026 — gamli: ${juliGamlar} fréttir, nýi: ${juliNyjar}`);
console.log('fréttir per mánuð (nýi):', JSON.stringify(talning(nyjar, manudur)));
if (juliNyjar > 1) { console.error('✖ FALL: fleiri en ein júlí-frétt'); process.exit(1); }
console.log('✔ í mesta lagi ein frétt um hvern mánuð');
