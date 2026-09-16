#!/usr/bin/env node
// maela_verdmat.mjs — EIN mæling á nákvæmni verðmatsins, svo talan sé endurtakanleg.
//
// Af hverju þessi skripta er til: nákvæmnistalan var mæld handvirkt í þrjú skipti með ólíkum úrtökum
// og ólíkum forsendum, og afurðin bar á endanum sex ólíkar tölur (5,5 · 6,0 · 6,5 · 6,7 · 8,3 · 3,4)
// án þess að nokkur þeirra segði á hvaða úrtaki hún var mæld. Tala sem enginn getur endurtekið er ekki
// mæling heldur minning. Hér er hún reiknuð úr sömu gögnum og varan keyrir á, með einni skipun.
//
//     node skriptur/maela_verdmat.mjs               # allt landið
//     node skriptur/maela_verdmat.mjs --pn 230,101  # valin póstnúmer
//     node skriptur/maela_verdmat.mjs --manudir 12  # lengd prófunarglugga (sjálfgefið 12)
//
// ⚠⚠ BÁÐAR LEIÐIR ERU MÆLDAR Á NÁKVÆMLEGA SAMA ÚRTAKI. Fyrri mælingar báru þær saman á ólíkum
//   úrtökum (7.700 sölur á móti 3.579) og þá er munurinn á 5,5 og 6,5 ekki munur á aðferðunum
//   heldur á úrtökunum. Hér er eign aðeins talin ef BÁÐAR leiðir skila mati á hana.
//
// ⚠⚠ LEKAVÖRN Í LEIÐ 2. mat_hlutfall.json er kyrrmynd reiknuð úr sölum SÍÐUSTU 12 MÁNAÐA. Að baktesta
//   sölu úr þeim sama glugga með hlutfalli sem sá þá sölu er leki, og hann fegrar leið 2. Þess vegna er
//   hlutfallið hér endurreiknað per eign úr sölum STRANGT Á UNDAN henni, alveg eins og leið 1 gerir.
//   Niðurstaðan heldur samt: 5,5% stóðst endurmælingu, lekinn var ekki að fegra hana.
//
// MÆLT 16.9.2026 á öllu landinu (7.828 sölur, 42 pn með ≥20 sölum í 12 mánaða glugga):
//   1) sambaerilegar sölur      5,8% miðgildisskekkja · 71% innan ±10%
//   2) fasteignamat × hlutfall  5,5% · 74%
//      blanda (meðaltal)        5,4% · 75%  — ⚠ gömul athugasemd sagði „blanda bætir EKKI“ og það er
//      ekki lengur rétt, en 0,1 prosentustig á 7.828 sölum er hávaði. Þær eru áfram sýndar hlið við
//      hlið af öðrum ástæðum: þegar tvö óháð möt eru ósammala er það sjálft upplýsing, og blanda felur hana.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaUrSolusogu, midgildi, hundradsmark, tsOf, MATHL, tegLykill } from '../web/src/lib/fasteignamat.mjs';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'gogn');
const arg = (n, s) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : s; };
const MANUDIR = +arg('manudir', 12);
const NU = Date.now();
const FRA = NU - MANUDIR * 30.4 * 864e5;
const les = (s) => { try { return JSON.parse(readFileSync(s, 'utf8')); } catch { return null; } };
const nlyk = (s) => String(s || '').trim().toLowerCase();

const valin = arg('pn', null);
const pnListi = (valin ? valin.split(',') : readdirSync(join(ROT, 'solusaga')).map((f) => f.replace('.json', '')))
  .map((s) => s.trim()).filter(Boolean).sort();

// ── Leið 2, endurreiknað hlutfall: miðgildi kaupverð/fasteignamat úr sölum STRANGT á undan viðfanginu.
// Sama þrepun og veljaMatHlutfall í vörunni: svæði+tegund → svæði allt → pn+tegund → pn allt.
//
// ⚠⚠ GLUGGINN ER EKKI VALFRJÁLS OG HANN MÁ EKKI VERA ÓENDANLEGUR. `mat` í kaupskránni er NÚGILDANDI
//   fasteignamat (2026-kyrrmynd), ekki matið sem gilti við söluna. Hlutfallið kv/mat er því aðeins
//   marktækt þegar salan er nálægt kyrrmyndinni í tíma; það rak úr 0,98 í 1,056 frá 2024-06 til 2026-08.
//   Fyrsta atrenna mín leyfði ALLAR eldri sölur (fimm ár) og bar þá verð frá 2021 saman við mat frá 2026.
//   Leið 2 mældist 13,6% og leit út eins og aðferðin væri ónýt. Hún var það ekki, mælingin var það.
//   Þess vegna er glugginn hér 12 mánuðir á undan hverri eign, sem er bæði lekalaust og trútt aðferðinni.
const HLGLUGGI = +arg('hlgluggi', 12) * 30.4 * 864e5;
function hlutfallAUndan(sogur, subj, fyrir) {
  const gild = (r) => r.mat > 0 && r.kv > 0 && tsOf(r.d) < fyrir && tsOf(r.d) >= fyrir - HLGLUGGI;
  const tk = tegLykill(subj.teg);
  const throp = [
    subj.zone != null ? (r) => r.zone === subj.zone && (!tk || tegLykill(r.teg) === tk) : null,
    subj.zone != null ? (r) => r.zone === subj.zone : null,
    (r) => r.pn === subj.pn && (!tk || tegLykill(r.teg) === tk),
    (r) => r.pn === subj.pn,
  ].filter(Boolean);
  for (const sia of throp) {
    const h = sogur.filter((r) => gild(r) && sia(r)).map((r) => r.kv / r.mat);
    if (h.length >= MATHL.min) return { h: midgildi(h), n: h.length };
  }
  return null;
}

const villur1 = [], villur2 = [], villurB = [], perPn = [];
let heild = 0, badar = 0;

for (const pn of pnListi) {
  const sol = les(join(ROT, 'solusaga', pn + '.json'));
  if (!Array.isArray(sol) || !sol.length) continue;
  const hnit = les(join(ROT, 'hnit', pn + '.json')) || {};
  // Hnit OG matssvæði á hverja sölu. Lyklar hnitaskrárinnar eru LÁGSTAFA (gildra sem hefur bitið áður).
  for (const r of sol) { const h = hnit[nlyk(r.a)]; if (h) { r.hnit = [h[0], h[1]]; r.zone = h[5] != null ? +h[5] : null; } r.pn = pn; }

  const v1 = [], v2 = [], vB = [];
  for (const t of sol) {
    if (!t || !(t.fm > 15) || !(t.ppm > 0)) continue;
    const td = tsOf(t.d);
    if (!(td >= FRA && td <= NU)) continue;
    heild++;
    // Leið 1 — sambærilegar sölur, NÁKVÆMLEGA eins og varan kallar hana (hnit fylgja → radíus virkur).
    const r1 = metaUrSolusogu(sol, { teg: t.teg, fm: t.fm, ar: t.ar, a: t.a, hnit: t.hnit },
      { now: td, strangt: true, sleppa: t, hnit });
    // Leið 2 — fasteignamat × svæðishlutfall úr sölum strangt á undan.
    const hl = t.mat > 0 ? hlutfallAUndan(sol, { teg: t.teg, zone: t.zone, pn }, td) : null;
    if (!r1 || !hl) continue;              // ⚠ aðeins eignir sem BÁÐAR leiðir meta → sama úrtak
    badar++;
    v1.push(Math.abs(r1.m / t.ppm - 1));
    v2.push(Math.abs((t.mat * hl.h) / t.kv - 1));
    // Blandan er mæld LÍKA, því fullyrðingin „blanda bætir ekki" er það sem réttlætir að leiðirnar
    // séu sýndar hlið við hlið í stað einnar tölu. Ómæld fullyrðing sem ber uppi hönnunarákvörðun
    // er verri en engin. Bæði mötin færð í heildarverð svo meðaltalið sé af sömu stærð.
    vB.push(Math.abs((((r1.m * t.fm) / 1000) + (t.mat * hl.h)) / 2 / t.kv - 1));
  }
  if (v1.length >= 20) {
    perPn.push({ pn, n: v1.length, m1: midgildi(v1), m2: midgildi(v2) });
    villur1.push(...v1); villur2.push(...v2); villurB.push(...vB);
  }
}

const samantekt = (e) => ({
  n: e.length,
  midgildi: midgildi(e),
  p75: hundradsmark(e, 0.75),
  innan10: e.filter((x) => x <= 0.10).length / e.length,
  innan20: e.filter((x) => x <= 0.20).length / e.length,
});
const pc = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const lina = (heiti, s) => console.log('  ' + heiti.padEnd(26)
  + 'miðgildi ' + pc(s.midgildi).padStart(6)
  + ' · p75 ' + pc(s.p75).padStart(6)
  + ' · ±10% ' + pc(s.innan10).padStart(6)
  + ' · ±20% ' + pc(s.innan20).padStart(6));

if (!villur1.length) { console.log('Engin eign stóðst báðar leiðir — athugaðu gögnin.'); process.exit(1); }

const s1 = samantekt(villur1), s2 = samantekt(villur2), sB = samantekt(villurB);
console.log('\nNÁKVÆMNI VERÐMATS — bakpróf, hver sala metin EINGÖNGU úr eldri sölum');
console.log('Gluggi: síðustu ' + MANUDIR + ' mánuðir · ' + perPn.length + ' póstnúmer · '
  + heild + ' sölur í glugganum, ' + badar + ' metnar af BÁÐUM leiðum (' + villur1.length + ' í uppgjöri)\n');
lina('1) Sambærilegar sölur', s1);
lina('2) Fasteignamat × hlutfall', s2);
lina('   blanda (þriðja leið)', sB);


const betri = s1.midgildi <= s2.midgildi ? '1) sambærilegar sölur' : '2) fasteignamat × hlutfall';
console.log('\nBetri leið á þessu úrtaki: ' + betri);

perPn.sort((a, b) => b.m1 - a.m1);
console.log('\nVerstu 8 póstnúmer (leið 1):');
for (const p of perPn.slice(0, 8)) console.log('  ' + p.pn + '  n=' + String(p.n).padStart(4) + '  leið1 ' + pc(p.m1) + '  leið2 ' + pc(p.m2));
console.log('\nBestu 5:');
for (const p of perPn.slice(-5).reverse()) console.log('  ' + p.pn + '  n=' + String(p.n).padStart(4) + '  leið1 ' + pc(p.m1) + '  leið2 ' + pc(p.m2));
