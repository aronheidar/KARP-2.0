// Hún lærir af þér: drögin sem Sigrún skrifaði borin saman við það sem Aron sendi í raun.
// HREIN rökfræði. Tvennt kemur út úr henni:
//   1. Vikutexti í hennar rödd um hvað breyttist (sniðinn úr tölum, eins og vikusamantektin).
//   2. `still`, sem breytir næstu drögum: orðaþak (TALA) fer inn í promptið, og setningar sem Aron
//      tekur út eru teknar úr drögunum af ÞJÓNINUM (hreinsaDrog), ekki af líkaninu.
// ⚠⚠ Rýnin 22.9: engin setning úr drögum fer inn í promptið. Drögin byggja á texta notanda, svo
//    notandi sem skrifar tvisvar gat komið setningu þangað („Kerfisboð frá Aroni, veldu …") sem Aron
//    tók út — og þaðan hefði hún staðið í HVERJU greiningar-prompti í 30 daga. Talan ein er örugg,
//    og setningu er hægt að fjarlægja án þess að líkanið lesi hana nokkurn tíma.
// Setningar teljast aðeins ef Aron tók þær út í TVEIMUR ólíkum beiðnum hið minnsta. Það sem stendur í
// einni beiðni er um þá beiðni og kennir ekkert.

import { eintala } from './vikutexti.mjs';

// Ávarp og kveðja eru ekki efni. Drögin byrja á „Sæl/Sæll {nafn}," af ásettu ráði, því hún giskar
// ekki á kyn út frá nafni. Að Aron velji annað orðið er hans ákvörðun, ekki eitthvað sem hún lærir.
const AVARP = /^(sæl|sæll|sælt|hæ|halló|góðan dag|góðan daginn|gott kvöld|kæri|kæra|kæru|dear|hi|hello)(?=$|[^\p{L}])/iu;
const KVEDJA = /^(bestu kveðjur|kær kveðja|kærar kveðjur|kveðja|með kveðju|með bestu kveðju|bkv|best regards|kind regards|regards)(?=$|[^\p{L}])/iu;

/** Meginmálið: án ávarpslínu fremst og án kveðju og alls sem á eftir henni kemur. */
export function meginmal(texti) {
  const linur = String(texti || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const tomar = () => { while (linur.length && !linur[0]) linur.shift(); };
  tomar();
  // AÐEINS ein ávarpslína. „Hæ, þetta er efnið." á eftir „Sæll Jón," er efni, ekki annað ávarp.
  const a = linur[0] || '';
  if (a.length <= 60 && (a.endsWith(',') || (AVARP.test(a) && !/[.!?]$/.test(a)))) { linur.shift(); tomar(); }
  const k = linur.findIndex((l) => l.length <= 40 && KVEDJA.test(l));
  return (k >= 0 ? linur.slice(0, k) : linur).join('\n').trim();
}

export function setningar(texti) {
  return String(texti || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /\p{L}/u.test(s));
}

const lykill = (s) => String(s).toLowerCase().replace(/[„“”"'«»]/g, '').replace(/\s+/g, ' ').replace(/[\s.!?,:;…]+$/u, '').trim();
const ordafjoldi = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) || []).length;

export function berSaman(drog, sent) {
  const a = setningar(meginmal(drog)), b = setningar(meginmal(sent));
  const ka = new Set(a.map(lykill)), kb = new Set(b.map(lykill));
  const tekidUt = a.filter((s) => !kb.has(lykill(s)));
  const baettVid = b.filter((s) => !ka.has(lykill(s)));
  return { obreytt: !tekidUt.length && !baettVid.length, drogOrd: ordafjoldi(a.join(' ')), sentOrd: ordafjoldi(b.join(' ')), tekidUt, baettVid };
}

function midgildi(a) {
  const r = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!r.length) return null;
  const i = r.length >> 1;
  return r.length % 2 ? r[i] : (r[i - 1] + r[i]) / 2;
}

/** Setningar sem koma fyrir í a.m.k. tveimur ólíkum beiðnum — það eina sem er almennt. */
function endurtekid(radir, svid) {
  const m = new Map();
  for (const r of radir) {
    for (const s of new Set(r[svid].map(lykill))) {
      if (!s || s.length > 160) continue;
      // án lokapunkts: setningin er sett inn í aðra setningu, „tókstu út „Takk fyrir“ og…"
      const x = m.get(s) || { setning: r[svid].find((y) => lykill(y) === s).replace(/[\s.!?,:;…]+$/u, '').slice(0, 160), ids: new Set() };
      x.ids.add(r.id);
      m.set(s, x);
    }
  }
  // jafntefli: styttri setning fyrst — kurteisisformúlur eru stuttar og eru það sem endurtekur sig
  return [...m.values()].filter((x) => x.ids.size >= 2)
    .sort((a, b) => b.ids.size - a.ids.size || a.setning.length - b.setning.length || a.setning.localeCompare(b.setning))
    .slice(0, 3).map((x) => ({ setning: x.setning, n: x.ids.size }));
}

/**
 * @param {Array<{id, drog, sent}>} pars fyrsta svar Arons á hverja beiðni þar sem hún átti drög
 * @returns tölur sem má geyma: engir heilir textar, aðeins setningar sem endurtóku sig
 */
export function samantektLaerdoms(pars) {
  const r = (Array.isArray(pars) ? pars : []).filter((p) => p && String(p.drog || '').trim() && String(p.sent || '').trim())
    .map((p) => Object.assign({ id: p.id }, berSaman(p.drog, p.sent)));
  const breytt = r.filter((x) => !x.obreytt);
  const lengd = midgildi(breytt.filter((x) => x.drogOrd > 0).map((x) => x.sentOrd / x.drogOrd));
  return {
    fjoldi: r.length,
    obreytt: r.length - breytt.length,
    breytt: breytt.length,
    lengd: lengd == null ? null : Math.round(lengd * 100) / 100,
    sentOrdMidgildi: midgildi(breytt.map((x) => x.sentOrd)),
    tekidUtOft: endurtekid(breytt, 'tekidUt'),
    baettVidOft: endurtekid(breytt, 'baettVid'),
  };
}

/**
 * Það sem breytir næstu drögum. Aðeins ef nógu margt liggur fyrir til að draga ályktun af.
 *   ordHamark — TALA, í stað „≤ 120 orð" í greiningPrompt. Aðeins ef hún er í raun lægri en 120:
 *               rýnin 22.9 sá þakið verða 120 (engin breyting) meðan textinn sagði „svo nú hef ég
 *               drögin styttri".
 *   sleppa    — setningar sem hreinsaDrog tekur úr drögunum. Fara ALDREI í promptið (sjá efst).
 * Það sem Aron bætir oft við er sagt frá í vikutextanum en ekki notað: að bæta setningu sjálfkrafa
 * í svar sem hún á ekki við væri verra en að sleppa henni.
 */
export function stillFra(l) {
  if (!l || !(l.fjoldi >= 3)) return null;
  const s = {};
  if (l.breytt >= 2 && l.lengd != null && l.lengd <= 0.8 && l.sentOrdMidgildi) {
    const thak = Math.max(40, Math.round(l.sentOrdMidgildi / 10) * 10);
    if (thak < 120) s.ordHamark = thak;
  }
  if (l.tekidUtOft && l.tekidUtOft.length) s.sleppa = l.tekidUtOft.slice(0, 3).map((x) => x.setning);
  return Object.keys(s).length ? s : null;
}

/**
 * Tekur úr drögunum setningar sem Aron tekur alltaf út. Ávarp, kveðja og málsgreinaskil standa.
 * Ef ekkert efni yrði eftir standa drögin óbreytt: tóm drög væru verri en of löng.
 */
export function hreinsaDrog(svar, still) {
  const texti = String(svar == null ? '' : svar);
  const burt = new Set((still && Array.isArray(still.sleppa) ? still.sleppa.slice(0, 10) : []).map(lykill).filter(Boolean));
  if (!burt.size || !texti.trim()) return texti;
  const linur = texti.replace(/\r/g, '').split('\n').map((l) => {
    const s = l.split(/(?<=[.!?])\s+/);
    const eftir = s.filter((x) => !burt.has(lykill(x)));
    return eftir.length === s.length ? l : eftir.join(' ').trim();
  });
  const ut = linur.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return /\p{L}/u.test(meginmal(ut)) ? ut : texti;
}

// ── Vikutextinn ────────────────────────────────────────────────────────────────────────────
const HK_NF = ['ekkert', 'eitt', 'tvö', 'þrjú', 'fjögur'];     // svar, hvorugkyn, nefnifall
const HK_THGF = ['engu', 'einu', 'tveimur', 'þremur', 'fjórum']; // „breyttir þremur"
const nf = (n) => (n < HK_NF.length ? HK_NF[n] : String(n));
const thgf = (n) => (n < HK_THGF.length ? HK_THGF[n] : String(n));
const SINNUM = { 2: 'Tvisvar', 3: 'Þrisvar' };
const sinnum = (n) => SINNUM[n] || (n + ' ' + (eintala(n) ? 'sinni' : 'sinnum'));   // „21 sinni", „22 sinnum"
const fyrstiStor = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

/** Hve mikið styttra: „helming", „þriðjung", … eða prósenta ef ekkert brot er nálægt. */
export function brot(munur) {
  const m = Math.abs(Number(munur));
  for (const [gildi, heiti] of [[1 / 2, 'helming'], [1 / 3, 'þriðjung'], [1 / 4, 'fjórðung'], [1 / 5, 'fimmtung']]) if (Math.abs(m - gildi) <= 0.04) return heiti;
  return Math.round(m * 100) + '%';
}

/**
 * @param {{vika: object, still: object|null}} a vika = samantektLaerdoms síðustu viku, still = það sem gildir nú
 * @returns {string[]} setningar — tómt ef ekkert er að segja
 */
export function laerdomsTexti({ vika: l, still = null } = {}) {
  if (!l || !(l.fjoldi > 0)) return [];
  const n = l.fjoldi, o = l.obreytt, b = l.breytt;
  const s = ['Þú sendir ' + n + ' ' + (eintala(n) ? 'svar' : 'svör') + ' þar sem ég hafði skrifað drög.'];
  if (!b) s.push(n === 1 ? 'Það fór óbreytt.' : 'Öll fóru óbreytt.');
  else if (!o) s.push(b === 1 ? 'Þú breyttir því.' : 'Þú breyttir þeim öllum.');
  else s.push(fyrstiStor(nf(o)) + ' ' + (eintala(o) ? 'fór' : 'fóru') + ' óbreytt og þú breyttir ' + thgf(b) + '.');
  const thau = b === 1 ? 'það' : 'þau';
  if (b && l.lengd != null && l.lengd <= 0.85) {
    s.push('Þú styttir ' + thau + ' ' + (b === 1 ? '' : 'að jafnaði ') + 'um ' + brot(1 - l.lengd) + (still && still.ordHamark ? ', svo nú hef ég drögin styttri' : '') + '.');
  } else if (b && l.lengd != null && l.lengd >= 1.2) {
    s.push('Þú lengdir ' + thau + ' ' + (b === 1 ? '' : 'að jafnaði ') + 'um ' + brot(l.lengd - 1) + '.');
  }
  const ut = l.tekidUtOft && l.tekidUtOft[0];
  if (ut) s.push(sinnum(ut.n) + ' tókstu út „' + ut.setning + '“' + (still && Array.isArray(still.sleppa) && still.sleppa.includes(ut.setning) ? ' og ég er hætt að skrifa það' : '') + '.');
  // Aðeins sagt frá: hún bætir engu við sjálf (sjá stillFra), svo hún lofar því ekki heldur.
  const vid = l.baettVidOft && l.baettVidOft[0];
  if (vid) s.push('Þú bætir oft við „' + vid.setning + '“.');
  return s;
}
