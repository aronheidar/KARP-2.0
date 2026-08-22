// SVIÐSMYNDA-SKRÁ RÁS-Leiksins — ein uppspretta yfir þær sviðsmyndir sem leikurinn styður.
//
// AF HVERJU SÉR-SKRÁ (en ekki inni í game-config.mjs)?
//   game-config.mjs er LAUFA-eining: hrein gögn, engar innfluttar einingar. Skráin hér þarf hins vegar
//   að flytja inn sviðsmyndir úr sér-skrám (svidsmynd-2058.mjs). Ef sú innflutnings-lína væri sett í
//   game-config.mjs myndi HVER einasta eining sem les ROUNDS/MANDATE/DECISIONS (þ.e. nánast allur
//   leikurinn) draga sviðsmyndirnar með sér — og verra: sviðsmyndar-skrá sem sjálf vildi lesa eitthvað
//   úr game-config (t.d. QUARTERS_PER_ROUND eða lever-heiti) byggi til HRING (circular import) með
//   TDZ-villum á `const`-útflutningi. Með því að setja skrána hér er stefnan einstefna:
//       game-config.mjs  ─┐
//       svidsmynd-2058.mjs┴→ svidsmyndir.mjs → server/client/demo
//   game-config heldur líka læsileika sínum (hún er þegar 25 KB af efni).
//
// FORMIÐ (SVIÐSMYND):
//   { id, heiti, undirtitill, yearStart, rounds, dials, events[], reality|null, hefurSogu, blurb, erFramtid }
//   • dials      — LEVER-YFIRSKRIFTIR sem spóla baseline aftur til upphafsárs sviðsmyndarinnar.
//                  gogn/roads/baseline.json er líkan af Íslandi Í DAG (~2026); 'island2000' þarf því
//                  YEAR2000_DIALS til að komast aftur til 2000, en FRAMTÍÐAR-sviðsmynd þarf ENGA
//                  spólun → dials = {}.
//   • reality    — raun-KPI fylki (33 gildi per KPI) til samanburðar. Framtíðin á sér engin raungögn → null.
//   • hefurSogu  — er til raun-hagsaga (saga.mjs: SAGA/RADHERRAR/REALITY) fyrir þessa sviðsmynd?
//                  false → EKKERT „Svona fór það í alvöru"-spjald og enginn raunveruleika-samanburður.
//   • erFramtid  — sviðsmyndin gerist í framtíðinni → ALDREI nafngreindir ráðherrar (við skáldum
//                  ekki nöfn á raunverulegt fólk í framtíðar-embættum); forsætisráðherrann er nafnlaus.
//   • scenario   — ÞÆGINDA-svið: hluturinn sem resolve.mjs/analytics.mjs taka við ({ id, events }).
//                  Fyrir 'island2000' er þetta NÁKVÆMLEGA SCENARIO-hluturinn úr game-config (sama
//                  tilvísun) svo hegðun sé óbreytt niður í síðasta bæti.
import { YEAR_START, ROUNDS, QUARTERS_PER_ROUND, SCENARIO, REALITY, YEAR2000_DIALS } from './game-config.mjs';
import { SVIDSMYND_2058 } from './svidsmynd-2058.mjs';

export const SVIDSMYND_SJALFGEFIN = 'island2000';

// Heiti reiknað úr upphafsári + fjölda kjörtímabila svo það sé ALLTAF í takt (8×4 ár → 2000–2032 / 2026–2058).
const heitiAf = (yearStart, rounds) => 'Ísland ' + yearStart + '–' + (yearStart + rounds * QUARTERS_PER_ROUND);

// ── 'island2000' — söguleg sjálfgefna sviðsmyndin (óbreytt efni úr game-config.mjs) ─────────────────
export const island2000 = {
  id: 'island2000',
  heiti: heitiAf(YEAR_START, ROUNDS),
  undirtitill: 'Netbólan, útrásin, hrunið og viðspyrnan',
  yearStart: YEAR_START,
  rounds: ROUNDS,
  dials: YEAR2000_DIALS,          // spólar baseline (~2026) aftur til 2000-stefnu
  events: SCENARIO.events,
  reality: REALITY,
  hefurSogu: true,
  blurb: 'Átta raunveruleg kjörtímabil: netbólan springur, útrásin þenst, bankarnir falla, höftin koma, '
    + 'ferðamennirnir streyma, faraldurinn lokar landinu og verðbólgan snýr aftur. Eftir hvert kjörtímabil '
    + 'sérðu hvernig Ísland fór í raun — og hvort þú gerðir betur.',
  erFramtid: false,
  scenario: SCENARIO,             // SAMA tilvísun og áður → resolve/analytics fá óbreytt inntak
};

// ── 'island2026' — framtíðar-sviðsmyndin (efnið kemur úr svidsmynd-2058.mjs) ────────────────────────
// SAMNINGURINN við svidsmynd-2058.mjs: `export const SVIDSMYND_2058` = hlutur með a.m.k. `events[]`
// (sama form og SCENARIO.events: { round, year, icon, title, text, focus, watch, shocks, responses[] })
// og valfrjálst heiti/undirtitill/blurb/yearStart/rounds. Skráin hér normaliserar og NEGLIR
// byggingar-eiginleikana (dials/reality/hefurSogu/erFramtid) svo þeir geti aldrei rekið í sundur:
// baseline ER 2026-ástandið (engin spólun), engin raungögn eru til um framtíðina og engin hagsaga heldur.
const f = (SVIDSMYND_2058 && typeof SVIDSMYND_2058 === 'object') ? SVIDSMYND_2058 : {};
const F_YEAR_START = typeof f.yearStart === 'number' ? f.yearStart : 2026;
const F_ROUNDS = (Number.isInteger(f.rounds) && f.rounds > 0) ? f.rounds : ROUNDS;
const F_EVENTS = Array.isArray(f.events) ? f.events : [];

export const island2026 = {
  id: 'island2026',               // NEGLT: verður að stemma við lykilinn í SVIDSMYNDIR (svidsmyndOf)
  heiti: f.heiti || heitiAf(F_YEAR_START, F_ROUNDS),
  undirtitill: f.undirtitill || 'Framtíðin er óskrifuð',
  yearStart: F_YEAR_START,
  rounds: F_ROUNDS,
  dials: {},                      // NEGLT: baseline ER ~2026 → engin spólun
  events: F_EVENTS,
  reality: null,                  // NEGLT: engin raungögn til um framtíðina
  hefurSogu: false,               // NEGLT: engin hagsaga → ekkert „Svona fór það í alvöru"
  blurb: f.blurb || 'Ísland frá deginum í dag og átta kjörtímabil fram í tímann. Engin fyrirfram-gefin saga, '
    + 'enginn samanburður við raunveruleikann — aðeins ákvarðanir ykkar og afleiðingar þeirra.',
  erFramtid: true,                // NEGLT: aldrei nafngreindir (skáldaðir) framtíðar-ráðherrar
  scenario: { id: 'island2026', events: F_EVENTS },
};

export const SVIDSMYNDIR = { island2000, island2026 };

// Er `id` gild sviðsmynd? (notað til að validera config.svidsmynd í /create)
export function gildSvidsmynd(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SVIDSMYNDIR, id);
}

// Sviðsmynd eftir auðkenni — ÓÞEKKT/vantar/rusl fellur á sjálfgefnu (island2000).
export function svidsmyndOf(id) {
  return gildSvidsmynd(id) ? SVIDSMYNDIR[id] : SVIDSMYNDIR[SVIDSMYND_SJALFGEFIN];
}

// Létta formið sem þjónninn sendir í /state (efnið sjálft — events/dials/reality — fer ALDREI þangað;
// vafrinn flettir því upp í skránni hér eftir auðkenni).
export function svidsmyndMeta(sv) {
  const s = (sv && typeof sv === 'object') ? sv : svidsmyndOf(null);
  return { id: s.id, heiti: s.heiti, undirtitill: s.undirtitill, yearStart: s.yearStart, erFramtid: !!s.erFramtid, hefurSogu: !!s.hefurSogu };
}

// Listi fyrir sviðsmynda-val leikstjórans (föst röð: sjálfgefna fyrst).
export const SVIDSMYNDA_LISTI = [island2000, island2026];
