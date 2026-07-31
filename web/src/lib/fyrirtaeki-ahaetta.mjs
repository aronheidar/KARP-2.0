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
// ── PEP: stjórnmálalega tengdir aðilar ────────────────────────────────────────
// Nöfn eigenda/forráðamanna gegn /gogn/pep.json (þingmenn, ráðherrar, sveitarstjórar).
// Fornafn+eftirnafn samsvörun → MÖGULEG tengsl, aldrei fullyrðing (sama nafn ≠ sami maður).
export function pepNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function pepMatch(nafn, folk) {
  const t = pepNorm(nafn).split(' ').filter(Boolean);
  if (t.length < 2) return null;                 // eitt nafn er of veikt til samsvörunar
  const first = t[0], last = t[t.length - 1];
  for (const p of (folk || [])) {
    const pt = String(p && p.n || '').split(' ').filter(Boolean);
    if (pt.length >= 2 && pt[0] === first && pt[pt.length - 1] === last) return p;
  }
  return null;
}

// null = listinn er EKKI tiltækur (sókn brást eða hann er tómur) — má ALDREI birtast sem „engin tengsl".
// Annars { hits, skimad } þar sem `skimad` er fjöldi nafna sem raunverulega fóru í gegnum skimun;
// skimad === 0 þýðir að ekkert var til að skima, sem er heldur ekki hrein niðurstaða.
export function pepScreen(folk, eigendur, radamenn) {
  if (!Array.isArray(folk) || !folk.length) return null;
  const hits = [], seen = new Set();
  let skimad = 0;
  const chk = (raw, hlutverk) => {
    const nm = String(raw || '').split(' - ')[0].trim();   // „Nafn - hlutverk" → nafn
    if (!nm) return;
    skimad++;
    const p = pepMatch(nm, folk);
    if (p && !seen.has(p.n)) { seen.add(p.n); hits.push({ nafn: nm, felagshlutverk: hlutverk, pep: p }); }
  };
  for (const e of (eigendur || [])) chk(e && e.nafn, 'raunv. eigandi' + (e && e.hlutur ? ' ' + e.hlutur : ''));
  for (const r of (radamenn || [])) { const parts = String(r).split(' - '); chk(parts[0], (parts[1] || 'forráðamaður').toLowerCase()); }
  return { hits, skimad };
}

// Samantektarmerki áreiðanleikamatsins (KYC): eitt yfirlit yfir stöðu allra athugana.
// `stodur` = stöðustafur hvers reits — 'u' BÍÐUR svars, 'n' niðurstaða án merkis (t.d. „Engir aðilar“),
// 'g'/'o'/'b' raunmerki. `uppgefid` = hætt að bíða (tímamörk runnin út).
//
// ⚠ Tvennt sem má ALDREI rugla saman: reitur sem bíður svars og reitur sem svaraði án merkis.
// Eldri útgáfan taldi hvort tveggja sem „óklárað“ OG kvað samt upp úrskurð úr því sem komið var —
// græna „Engin neikvæð stöðumerki“ birtist því áður en refsilista- og PEP-skimun höfðu skilað sér.
// Hér er enginn úrskurður (lvl = null) fyrr en engir reitir bíða.
export function areidStig(stodur, uppgefid) {
  const listi = stodur || [];
  if (!listi.length) return null;
  const c = { g: 0, o: 0, b: 0, n: 0, u: 0 };
  for (const k of listi) { if (c[k] == null) c.u++; else c[k]++; }
  const grunnur = { skilad: c.g + c.o + c.b, tomar: c.n, bidur: c.u, alls: listi.length, merki: { g: c.g, o: c.o, b: c.b } };
  if (c.u && !uppgefid) return { ...grunnur, lvl: null, lokid: false, label: 'Athuganir í vinnslu…' };
  if (c.u) return { ...grunnur, lvl: 'o', lokid: false, label: 'Athuganir kláruðust ekki' };
  const label = c.b ? 'Alvarleg stöðumerki' : c.o >= 2 ? 'Nokkur athugunarefni' : c.o ? 'Minniháttar athugunarefni' : 'Engin neikvæð stöðumerki';
  return { ...grunnur, lvl: c.b ? 'b' : c.o ? 'o' : 'g', lokid: true, label };
}

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
