// frettaadili.mjs — HREIN rökvísi fyrir indexeranlegar aðila-fréttasíður (/frettir/<slug>/).
// Aðskilið frá worker/DOM svo slug-uppfletting og gagnamótun séu prófanleg.
import { asciiId } from './frettavel-cat.mjs';
import { reputationScore } from './ordspor.mjs';

/** Slóðarnafn aðila. asciiId þýðir íslenska stafi rétt (þ→th, ð→d, ö→o, æ→ae). */
export const adiliSlug = (nafn) => asciiId(String(nafn || ''));

/**
 * Finnur aðila út frá slug. Skilar null ef enginn passar — worker svarar þá 404
 * (mikilvægt: ALDREI búa til síðu fyrir ókunnan slug, það býr til ruslsíður fyrir leitarvélar).
 */
export function findAdili(slug, list) {
  const s = String(slug || '').toLowerCase();
  if (!s || !Array.isArray(list)) return null;
  return list.find((x) => x && x.n && adiliSlug(x.n) === s) || null;
}

/** Leitarorð aðilans (nafn + samheiti), hreinsuð og takmörkuð. */
export function adiliTerms(adili) {
  if (!adili || !adili.n) return [];
  const raw = (Array.isArray(adili.a) && adili.a.length) ? adili.a : [adili.n];
  return [...new Set([adili.n, ...raw])].map((s) => String(s || '').trim()).filter((s) => s.length >= 3).slice(0, 8);
}

/**
 * Mótar allt sem síðan sýnir úr fréttalista.
 * @param {Array<{title,url,source,ts,date,sent}>} items
 * @returns {{n:number, ordspor:object, sources:Array, timeline:Array, nyjast:Array, tone:number}}
 */
export function adiliPageData(items, opts = {}) {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && x.title);
  const now = opts.now || Math.floor(Date.now() / 1000);
  const ordspor = reputationScore(list.map((x) => ({ ts: x.ts, sent: x.sent })), { now, days: opts.days || 90 });

  const bySrc = new Map();
  for (const it of list) {
    const s = it.source || '—';
    bySrc.set(s, (bySrc.get(s) || 0) + 1);
  }
  const sources = [...bySrc.entries()].map(([s, n]) => ({ s, n })).sort((a, b) => b.n - a.n).slice(0, 8);

  // Mánaðar-tímalína (fjöldi + tónn) — nógu gróft til að vera læsilegt í SSR-töflu.
  const byMon = new Map();
  for (const it of list) {
    if (!it.ts) continue;
    const m = new Date(it.ts * 1000).toISOString().slice(0, 7);
    const b = byMon.get(m) || { m, n: 0, tone: 0 };
    b.n++; b.tone += (typeof it.sent === 'number' ? it.sent : 0);
    byMon.set(m, b);
  }
  const timeline = [...byMon.values()].sort((a, b) => (a.m < b.m ? -1 : 1))
    .map((b) => ({ m: b.m, n: b.n, idx: b.n ? Math.round((b.tone / b.n) * 100) : 0 }));

  const nyjast = list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 20)
    .map((x) => ({ title: x.title, url: x.url, source: x.source, date: x.date, sent: x.sent }));

  return { n: list.length, ordspor, sources, timeline, nyjast, tone: ordspor.tone };
}

/** Lýsing fyrir <meta description> — verður að vera upplýsandi, ekki almenn. */
export function adiliDesc(nafn, d) {
  if (!d || !d.n) return `Fréttaumfjöllun um ${nafn} á Karp — tónn, tímalína og miðlar sem fjalla um aðilann.`;
  const t = d.ordspor.score != null ? `orðspors-einkunn ${d.ordspor.score}/100 (${d.ordspor.label})` : 'tónn ekki metinn';
  return `${d.n} fréttir um ${nafn} síðustu mánuði — ${t}. ${d.sources.length} miðlar fjalla um aðilann. Uppfært daglega á Karp.`;
}
