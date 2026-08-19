// leiguverd.mjs — LEIGUVERÐMAT (hrein föll, engin DOM-snerting). Systir fasteignamat.mjs fyrir leigu.
// Gögn: web/public/gogn/leigusaga/<pn>.json = { til:'YYYY-MM', stig, fra, n, s:[{ d, st (m²), verd (kr/mán við
// samning), vi (kr/mán FRAMREIKNAÐ til `til` með vísitölu leiguverðs HMS), teg, z (matssvæði|0) }] } (build_leiga.js).
// Opna leiguskráin nær aðeins til 2023 (þinglýsingarskyldan féll) — þess vegna er hver samningur framreiknaður með
// mánaðarlegri vísitölu HMS úr nýju leiguskránni (2023-05=100 → 130,4 í 2026-07) og matið miðast við `til`.
//
// Aðferð: sambærilegir samningar í SAMA MATSSVÆÐI (→ pn ef <min) með ±30% stærð, stærðarleiðréttir — leiga á m²
// FELLUR með stærð (teygni −0,52 innan svæðis×árs, mælt 19.8.2026 á 20.630 samningum 2021–24) — miðgildi × m².
// Strangt bakpróf (samningar 2023-07→2024-06 metnir úr fyrri samningum, 2 ára gluggi): miðgildisskekkja 11,6%,
// 45% innan ±10%, 73% innan ±20% (án stærðarleiðréttingar 12,3%/41%). Leiga er hávaðasamari en kaupverð
// (húsgögn, hiti/rafmagn innifalið, óhagnaðardrifnir leigusalar í skránni) → bil, ekki ein tala.

import { midgildi, hundradsmark } from './fasteignamat.mjs';
export { midgildi, hundradsmark };

export const LEIGA = { staerd: 0.3, teygni: -0.52, min: 6, minBak: 20 };

export const tsOf = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
export const nothaef = (c) => !!c && c.st >= 15 && c.st <= 400 && c.vi > 0 && !!c.d;

// Sambærilegir: sama matssvæði (subj.zone) → allt pn-safnið ef <min; ±staerd í stærð; strangt: aðeins d < now og ≠ sleppa.
export function veljaLeigu(contracts, subj, opts) {
  const o = Object.assign({}, LEIGA, opts || {});
  const fm = +subj.fm || 0;
  const lo = fm * (1 - o.staerd), hi = fm * (1 + o.staerd);
  const pool = (Array.isArray(contracts) ? contracts : []).filter((c) => {
    if (!nothaef(c) || c === o.sleppa) return false;
    if (fm > 0 && !(c.st >= lo && c.st <= hi)) return false;
    if (o.now != null && o.strangt && !(tsOf(c.d) < o.now)) return false;
    return true;
  });
  const z = subj.zone != null ? +subj.zone : 0;
  let comps = z ? pool.filter((c) => +c.z === z) : [], stig = 'svaedi';
  if (comps.length < o.min) { comps = pool; stig = 'pn'; }
  return { comps, stig };
}

// Stærðarleiðrétt leiga á m²: (vi/st) × (st/fm)^(−teygni) — stærri sambærileg er „ódýrari" á m², skaluð að eigninni.
export const leidrettPpm = (c, fm, teygni) => (c.vi / c.st) * ((teygni && fm > 0 && c.st > 0) ? Math.pow(c.st / fm, -teygni) : 1);

// Mat: { m (kr/m²/mán), lo, hi (fjórðungsbil), n, stig, leiga (kr/mán = m×fm), leigaLo, leigaHi, staerdLeidr } | null
export function metaLeigu(contracts, subj, opts) {
  const o = Object.assign({}, LEIGA, opts || {});
  const { comps, stig } = veljaLeigu(contracts, subj, o);
  if (comps.length < o.min) return null;
  const fm = +subj.fm || 0;
  const v = comps.map((c) => leidrettPpm(c, fm, o.teygni));
  const m = midgildi(v), lo = hundradsmark(v, 0.25), hi = hundradsmark(v, 0.75);
  return { m, lo, hi, n: comps.length, stig, staerdLeidr: !!(o.teygni && fm > 0), leiga: fm > 0 ? m * fm : null, leigaLo: fm > 0 ? lo * fm : null, leigaHi: fm > 0 ? hi * fm : null, comps };
}

// Brúttó leiguávöxtun: ársleiga ÷ verð (kr). pr = verð ÷ ársleiga (ár). Skilar null án gildra talna.
export function avoxtun(leigaMan, verdKr) {
  if (!(leigaMan > 0) || !(verdKr > 0)) return null;
  const arleg = leigaMan * 12;
  return { arleg, brutto: arleg / verdKr, pr: verdKr / arleg };
}

// Bakpróf: samningar síðustu `manudir` mánaða skrárinnar (m.v. nýjasta samning) metnir með SÖMU aðferð úr
// samningum Á UNDAN þeim (strangt). Bæði mat og raun eru framreiknuð á sama verðlag (vi) svo vísitalan styttist út.
export function bakprofLeiga(contracts, opts) {
  const o = Object.assign({ manudir: 12 }, LEIGA, opts || {});
  const list = (Array.isArray(contracts) ? contracts : []).filter(nothaef);
  if (!list.length) return null;
  const nyjast = list.reduce((m, c) => (c.d > m ? c.d : m), '');
  const fra = tsOf(nyjast) - o.manudir * 30.4 * 864e5;
  const errs = [];
  for (const t of list) {
    const td = tsOf(t.d);
    if (!(td >= fra)) continue;
    const r = metaLeigu(list, { fm: t.st, zone: t.z }, Object.assign({}, o, { now: td, strangt: true, sleppa: t }));
    if (!r) continue;
    errs.push(Math.abs(r.m / (t.vi / t.st) - 1));
  }
  if (errs.length < o.minBak) return null;
  return { n: errs.length, midgildi: midgildi(errs), p75: hundradsmark(errs, 0.75), innan10: errs.filter((e) => e <= 0.1).length / errs.length, innan20: errs.filter((e) => e <= 0.2).length / errs.length };
}
