// Áhættuþættir F8 (kennitöluflakk) og F9 (refsilistar) — hrein lógík, engin netköll né DOM.
// Þetta eru afleiðingamestu merkin í [fyrirtaeki-lanshaefi.mjs]: F8 lækkar um 8 og F9 setur matið
// í lægsta flokk (E). Bæði byggja á NAFNA-samsvörun, sem er vísbending en aldrei staðfesting —
// framsetningin í eyjunni orðar það svo, og þessi eining á að halda fölskum samsvörunum í lágmarki.

// Kjarnanafn: lágstafað, umritað, án félagsforms (ehf/hf/…), aðeins a-z0-9 og stök bil.
// ⚠ þ/ð/æ EIGA ENGA NFD-upplausn, svo eldri útgáfan (bara NFD + [^a-z0-9]) HENTI þeim:
// „Þór ehf“→„or“ og „Ægir ehf“→„gir“ féllu undir 4-stafa vörnina og fengu aldrei F8-flettingu,
// „Þorbjörn hf“→„orbjorn“ missti fyrsta stafinn og „Sæplast“→„s plast“ klofnaði í tvö orð.
// Umritun heldur nöfnunum heilum og aðgreinanlegum.
export function coreName(s) {
  return String(s || '').toLowerCase()
    .replace(/þ/g, 'th').replace(/ð/g, 'd').replace(/æ/g, 'ae').replace(/ø/g, 'o')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ehf|hf|slhf|ohf|sf|slf|svf|bs)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Telst kjarnanafnið `a` vísa á sama félagsnafn og `core`? Nákvæmt jafnt, eða styttra nafnið (≥7 stafir)
// er heilt orða-forskeyti hins. Viðbótin má EKKI vera bara tala: „Vesturbyggð" vs „Vesturbyggð 8" er
// húsnúmer, ekki félagatengsl — sú regla ein bjó til einu fölsku samsvörunina í 2.776 nafna prófun.
export function nameMatch(a, core) {
  if (!a || !core) return false;
  if (a === core) return true;
  const s = a.length < core.length ? a : core, l = a.length < core.length ? core : a;
  if (s.length < 7 || !l.startsWith(s + ' ')) return false;
  return !/^\d+$/.test(l.slice(s.length + 1).trim());
}

// Tilkynningategundir sem teljast þrot/slit.
export const FLAKK_TYPES = { felagsslit: 1, gjaldthrot_beidni: 1, skiptabeidni: 1, skiptalok: 1 };

// F8: félög með sama kjarnanafn en AÐRA kennitölu sem hafa verið tekin til skipta eða slitin.
// null = gögn ekki tiltæk · [] = engin samsvörun.
export function flakkMatches(byKt, minKt, nafn) {
  const core = coreName(nafn);
  if (core.length < 4) return [];        // of stutt nafn → of margar tilviljanir
  if (!byKt) return null;
  const me = String(minKt == null ? '' : minKt).replace(/\D/g, ''), out = [];
  for (const kt in byKt) {
    if (kt === me) continue;
    const ent = byKt[kt] || {};
    if (!nameMatch(coreName(ent.name), core)) continue;
    const notices = (ent.notices || []).filter((n) => FLAKK_TYPES[n.type]);
    if (!notices.length) continue;
    const latest = notices.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    out.push({ kt, name: ent.name, date: latest.date });
  }
  return out;
}

// F9: nöfnin sem fara í refsilista-skimun — félagið sjálft + eigendur + ráðamenn.
// `felagsNafn` kemur ÞEGAR strípað af félagsformi (fsStutt í eyjunni) svo hér sé ekki önnur útgáfa af þeirri reglu.
// • kommu er sleppt úr hverju nafni: þjónninn tekur við kommu-aðgreindum lista, svo „Jón Jónsson,
//   Hverfisgötu 5" hefði klofnað í tvö gervinöfn. Það sem stendur á undan kommu er nafnið sjálft.
// • tvítekningum eytt (sami maður er oft bæði eigandi og ráðamaður) svo þakið fari ekki til spillis.
// Skilar {names, alls, skorid} — `skorid` > 0 ÞÝÐIR að hluti var EKKI skimaður og það verður að sjást
// í skýrslunni; þögul stytting í skimun er verri en engin skimun.
export function sanctionNames(felagsNafn, eigendur, radamenn, max) {
  const cap = max == null ? 40 : max;    // sama þak og sanctionsHandler í worker notar
  const hreinsa = (s) => String(s || '').split(' - ')[0].split(',')[0].trim();
  const oll = [], seen = new Set();
  const baeta = (raw) => { const n = hreinsa(raw); if (!n) return; const k = n.toLowerCase(); if (seen.has(k)) return; seen.add(k); oll.push(n); };
  baeta(felagsNafn);
  for (const e of (eigendur || [])) baeta(e && e.nafn);
  for (const r of (radamenn || [])) baeta(r);
  return { names: oll.slice(0, cap), alls: oll.length, skorid: Math.max(0, oll.length - cap) };
}
