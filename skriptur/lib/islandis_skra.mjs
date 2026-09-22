// skriptur/lib/islandis_skra.mjs — finnur skrár sem stofnanir birta á island.is (Contentful).
//
// Síður á island.is eru Next.js og bera slóðir skráa í HTML-inu sem þjónninn skilar, svo vafra þarf
// ekki. ⚠ Contentful skiptir um slóð (hash-hlutann) í hvert sinn sem stofnunin skiptir skránni út,
// svo slóðin er lesin af síðunni í hvert sinn en aldrei harðkóðuð.

/** Fyrsta Contentful-slóð í HTML þar sem afkóðað skráarheitið passar við `mynstur`, eða null. */
export function finnaCtfSlod(html, mynstur) {
  for (const m of String(html).matchAll(/(?:https:)?\/\/(?:assets|downloads)\.ctfassets\.net\/[^"'\s\\<>]+/g)) {
    const slod = m[0].startsWith('//') ? 'https:' + m[0] : m[0];
    let heiti = slod.split('/').pop();
    try { heiti = decodeURIComponent(heiti); } catch { /* ógild kóðun: bera saman óbreytt */ }
    if (mynstur.test(heiti)) return slod;
  }
  return null;
}
