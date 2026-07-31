// ordspor.mjs — HREIN orðspors-einkunn úr fréttaumfjöllun (AI-tónn í news.sent_ai).
// -----------------------------------------------------------------------------
// Notað af (a) fyrirtækjaskýrslu (/fyrirtaeki/) og (b) orðsporsvaktinni (tón-viðvörun),
// svo TALAN SÉ SÚ SAMA á báðum stöðum. Engin I/O hér → prófanlegt.
//
// HÖNNUNARREGLUR (svo einkunnin sé verjanleg, ekki handahófskennd):
//  1. 50 = hlutlaust. Yfir 50 = jákvæðari umfjöllun en meðaltal, undir = neikvæðari.
//  2. TÓNN ræður mestu (±35), ÞRÓUN gefur minni vigt (±10) — nýleg sveifla á ekki að
//     kollvarpa langtímamynd.
//  3. ⚠ FÁAR FRÉTTIR = ÓVISS EINKUNN. Í stað þess að gefa fyrirtæki með 2 fréttir
//     einkunn 95 dregst útkoman að 50 í hlutfalli við gagnamagn (shrinkage). Þannig
//     lofar talan aldrei meiru en gögnin standa undir.
//  4. Fjöldi frétta hækkar EKKI einkunn — mikil umfjöllun er hvorki góð né slæm í sjálfu sér.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Fullt gagnamagn (fréttir) á 90 daga glugga til að einkunn fái fulla vigt. */
export const FULL_N = 30;

/**
 * ⚠ Öryggisstuðullinn VERÐUR að kvarðast með gluggalengd. 30 fréttir á 90 dögum er mikið,
 * en 30 á 7 dögum er gríðarlegt — væri FULL_N fast þá drægist 7-daga einkunn alltaf að 50
 * og orðsporsvaktin þagði þótt umfjöllun væri eintóm neikvæð (prófin gripu þetta).
 */
export const fullNFor = (days) => Math.max(5, Math.round(FULL_N * (days > 0 ? days : 90) / 90));

/**
 * @param {Array<{ts:number, sent:number}>} items fréttir með tón (-1|0|1) og unix-ts
 * @param {{now?:number, days?:number}} opts gluggi (sjálfg. 90 dagar)
 * @returns {{score:number|null, tone:number, trend:number, n:number, conf:number, label:string, pos:number, neg:number, neu:number}}
 *          score = null þegar EKKERT er að byggja á (0 fréttir) → UI sýnir „—", ekki 50.
 */
export function reputationScore(items, opts = {}) {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && typeof x.sent === 'number');
  const now = opts.now || Math.floor(Date.now() / 1000);
  const days = opts.days > 0 ? opts.days : 90;
  const since = now - days * 86400;
  const win = list.filter((x) => !x.ts || x.ts >= since);
  const n = win.length;
  const pos = win.filter((x) => x.sent > 0).length;
  const neg = win.filter((x) => x.sent < 0).length;
  const neu = n - pos - neg;
  if (!n) return { score: null, tone: 0, trend: 0, n: 0, conf: 0, label: 'engin umfjöllun', pos: 0, neg: 0, neu: 0 };

  const tone = mean(win.map((x) => x.sent));                    // −1..+1
  // Þróun: seinni helmingur gluggans vs fyrri helmingur (aðeins ef báðir hafa gögn).
  const mid = now - (days / 2) * 86400;
  const late = win.filter((x) => x.ts >= mid).map((x) => x.sent);
  const early = win.filter((x) => x.ts < mid).map((x) => x.sent);
  const trend = (late.length >= 3 && early.length >= 3) ? mean(late) - mean(early) : 0;

  const raw = 50 + tone * 35 + clamp(trend, -1, 1) * 10;
  const conf = clamp(n / (opts.fullN || fullNFor(days)), 0, 1);  // shrinkage, kvarðað eftir glugga
  const score = Math.round(50 + (raw - 50) * conf);

  return {
    score: clamp(score, 0, 100),
    tone: Math.round(tone * 100) / 100,
    trend: Math.round(trend * 100) / 100,
    n, pos, neg, neu,
    conf: Math.round(conf * 100) / 100,
    label: scoreLabel(clamp(score, 0, 100), conf),
  };
}

/** Orðalag sem má birta notanda — segir LÍKA til um óvissu. */
export function scoreLabel(score, conf) {
  if (conf < 0.34) return 'of lítil umfjöllun til að meta';
  if (score >= 68) return 'mjög jákvætt';
  if (score >= 57) return 'jákvætt';
  if (score > 43) return 'hlutlaust';
  if (score > 32) return 'neikvætt';
  return 'mjög neikvætt';
}

/**
 * Orðsporsvakt: er ástæða til að vara við? Ber saman NÝJASTA gluggann við þann á undan.
 * @returns {{alert:boolean, reason:string|null, now:object, prev:object, drop:number}}
 */
export function toneAlert(items, opts = {}) {
  const now = opts.now || Math.floor(Date.now() / 1000);
  const win = opts.windowDays > 0 ? opts.windowDays : 7;
  const minN = opts.minN > 0 ? opts.minN : 3;        // undir þessu er ekkert marktækt
  const dropAt = opts.dropAt > 0 ? opts.dropAt : 25; // fall í stigum sem kallar á viðvörun
  const badAt = opts.badAt != null ? opts.badAt : 35; // alger þröskuldur

  const cur = reputationScore(items, { now, days: win });
  const prev = reputationScore(items.filter((x) => x.ts < now - win * 86400), { now: now - win * 86400, days: win });
  if (cur.n < minN) return { alert: false, reason: null, now: cur, prev, drop: 0 };

  const drop = (prev.score != null && cur.score != null) ? prev.score - cur.score : 0;
  if (prev.score != null && drop >= dropAt) {
    return { alert: true, reason: 'fall', now: cur, prev, drop };
  }
  if (cur.score != null && cur.score <= badAt) {
    return { alert: true, reason: 'lagt', now: cur, prev, drop };
  }
  return { alert: false, reason: null, now: cur, prev, drop };
}
