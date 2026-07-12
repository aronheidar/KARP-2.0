// sweep.mjs — adaptív forskeyta-upptalning á nafnaleit fyrirtækjaskrár.
// Staðfest 2026-07-12: ?nafn=<q> skilar ≤100 treffum (þak) og enginn áreiðanlegur
// heildarfjöldi → dýpkum forskeyti þegar 100-þak næst.
export const SWEEP_ALPHABET = 'abcdefghijklmnopqrstuvwxyzáðéíóúýþæö0123456789 '.split('');

export function extractKts(html) {
  return [...new Set([...String(html || '').matchAll(/kennitala\/(\d{10})/g)].map((m) => m[1]))];
}

// hitCount = fjöldi einstakra kt á síðunni. cap = þak APIsins (100).
export function nextPrefixes(prefix, hitCount, cap = 100) {
  if (hitCount >= cap) return { done: false, children: SWEEP_ALPHABET.map((c) => prefix + c) };
  return { done: true, children: [] };
}
