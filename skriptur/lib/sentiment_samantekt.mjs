// skriptur/lib/sentiment_samantekt.mjs — færsla eins félags í gogn/sentiment.json.
//
// Fréttirnar koma síaðar úr _firmaSia (web/src/worker/cron.mjs) og samantektin úr aggregateFirma,
// SÖMU föllum og /api/firma notar, svo bakaða skráin og lifandi svarið reikna tón eins.
import { aggregateFirma } from '../../web/src/lib/firma-greining.mjs';

/** Síaðar fréttir eins félags → { idx, n, pos, neu, neg, recent } eða null ef ekkert er tóngreint. */
export function faersla(items, days) {
  if (!items.length) return null;
  const { sentiment } = aggregateFirma(items, { days, capped: false });
  if (!(sentiment.scored > 0)) return null;
  const recent = [...items].sort((a, b) => b.ts - a.ts).slice(0, 8)
    .map((x) => ({ t: x.title, l: x.url, s: typeof x._t === 'number' ? x._t : null }));
  return { idx: sentiment.idx, n: sentiment.scored, pos: sentiment.pos, neu: sentiment.neu ?? 0, neg: sentiment.neg, recent };
}
