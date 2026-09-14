// sweep.mjs — adaptív forskeyta-upptalning á nafnaleit fyrirtækjaskrár.
// Staðfest 2026-07-12: ?nafn=<q> skilar ≤100 treffum (þak) og enginn áreiðanlegur
// heildarfjöldi → dýpkum forskeyti þegar 100-þak næst.
// ⚠ 14.9: greinarmerkin bættust við. Mælt á 6.522 sóttum félagsnöfnum koma þau fyrir í
// ÖÐRU sæti (. 113 · - 45 · & 3 · / 2 · , 2 · + 1 · % 1); án þeirra duttu heilar greinar
// úr dýpkuninni — „a.“ eitt og sér skilar 99 félögum sem sweepið sá aldrei.
// Stafrófið er notað BÆÐI af crawl_tengsl.mjs (D1) og sweep_stadbundid.mjs; sú síðari
// endur-dýpkar mettuð forskeyti sjálfkrafa þegar stafrófið stækkar. Leitin er FORSKEYTA-
// leit (staðfest 14.9: nafn=gerð skilaði 37 nöfnum, öllum byrjandi á „gerð“).
export const SWEEP_ALPHABET = "abcdefghijklmnopqrstuvwxyzáðéíóúýþæö0123456789 .,-&/'(+%".split('');

export function extractKts(html) {
  return [...new Set([...String(html || '').matchAll(/kennitala\/(\d{10})/g)].map((m) => m[1]))];
}

// hitCount = fjöldi einstakra kt á síðunni. cap = þak APIsins (100).
export function nextPrefixes(prefix, hitCount, cap = 100) {
  if (hitCount >= cap) return { done: false, children: SWEEP_ALPHABET.map((c) => prefix + c) };
  return { done: true, children: [] };
}
