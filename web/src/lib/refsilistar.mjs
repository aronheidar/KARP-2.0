// refsilistar.mjs — hrein lyklunar- og samsvörunarrök refsilista-skimunar (F9).
// Flutt úr worker/veitur.mjs 31.7.2026 svo hægt sé að prófa þau: sanctionsIndex er
// memo-að í modúl-breytu (SANCTIONS_IDX) sem prófin komast ekki framhjá.
//
// TVÖ LÖG, viljandi aðskilin:
//   sterk — fjöl-orða nöfn, lykill 'fyrsta|síðasta' + SAMRÆMIS-próf (samraemi).
//   veik  — tvær tegundir:
//             'einsords' — raunveruleg eins-orðs nöfn, NÁKVÆMT jafnræði.
//             'jadar'    — fjöl-orða samsvörun sem hvílir EINGÖNGU á fyrsta og síðasta
//                          tókeni; lækkuð úr sterka laginu (spec 2026-08-01).
// Veik samsvörun má ALDREI enda í sanctions.hits: hits keyrir severity:'critical',
// deriveRisk→'Há', kycCriticalCron-póst og lánshæfis-þak (cap 20 → E).
// Mæling 31.7.2026: nákvæm eins-orðs samsvörun gaf 17 samsvaranir á 8.240 íslenskum
// nöfnum — allar falskar (Nova, Saga, Orion, Titan, Fox …). Þess vegna veikt lag.

// ⚠ sancNorm er EKKI eingöngu F9-rök: worker/veitur.mjs notar hana líka til að byggja
// og fletta upp í PEP-vísitölunni (kycPepIndex + PEP-samsvörunarlínan í kycScreenKt).
// Breyting hér hefur því þögul áhrif á PEP-samsvörun líka, ekki bara sanctions-skimun.
export const sancNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Eins og sancNorm en heldur TÖLUSTÖFUM og hendir bilum — til að bera fyrirspurn
// saman við birtingarnafn færslunnar. Greinarmerki og broddstafir hunsuð.
const alnum = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ðþæ]/g, '');

// Levenshtein með lengdar-vörn: nöfn sem munar meira en 2 stöfum eru hafnað strax,
// svo fylkja-smíðin keyrir aldrei á augljóslega ólíkum tókenum.
function _lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const _hlutmengi = (a, b) => { const B = new Set(b); return a.every((x) => B.has(x)); };

// samraemi — er fyrirspurnin efnislega SAMA nafn og færslan, eða deila þær aðeins
// fyrsta og síðasta tókeni? Sterki lykillinn ('fyrsta|síðasta') hunsar allt þar á milli,
// og mæling 1.8.2026 á 6.803 raun-íslenskum nöfnum gaf 3 sterkar samsvaranir — allar 3
// falskar ("The Basic Cookbook Company" → "The Niru Battery Company").
//
// Þrepin eru valin eftir MÆLDU endurheimtar-tapi, ekki eftir tilfinningu. Hvert einfalt
// skilyrði eitt og sér fellur á öðru raunhæfu afbrigði (sjá spec 2026-08-01, tafla 2.3):
//   tóken-fjöldi einn      → 0% endurheimt á slepptu/auknu millinafni
//   röð-helt innihald einu → 0,2% á víxluðum millinöfnum
//   mengja-innihald eitt   → 0,7-1,0% á umrituðum mið-tókenum
// Sambland mengja-innihalds og jafnaðs lev<=2 heldur 100% á öllum fimm afbrigðis-formum.
export function samraemi(q, e) {
  if (!q || !e || !q.length || !e.length) return null;
  if (q.length === e.length && q.every((x, i) => x === e[i])) return 'nakvaemt';
  // mengja-innihald í hvora átt: sleppt millinafn, aukið millinafn, víxluð röð
  if (_hlutmengi(q, e) || _hlutmengi(e, q)) return 'innihald';
  // jafnað námunda: umritun ("Abdul"/"Abdel", "Aleksandr"/"Alexandr")
  if (q.length === e.length && q.every((x, i) => x === e[i] || _lev(x, e[i]) <= 2)) return 'namunda';
  return null;
}
const _RODUN = { nakvaemt: 3, innihald: 2, namunda: 1 };

export function byggjaVisitolu(names) {
  const sterk = new Map(), veik = new Map();
  for (const x of (names || [])) {
    const t = String((x && x.n) || '').split(' ').filter(Boolean);
    const gildi = { nafn: x && x.nafn, listar: x && x.listar };
    if (t.length >= 2) {
      const key = t[0] + '|' + t[t.length - 1];
      // ÖLLUM færslum haldið, ekki aðeins þeirri fyrstu. Áður féllu 9.728 færslur
      // (16,5%) í skuggann og 26,4% deildu lykli með AÐGREINDU nafni — worker gat því
      // birt nafn annars aðila sem „samsvörunina". Nú velur skima réttu færsluna.
      gildi.n = t.join(' ');
      const arr = sterk.get(key);
      if (arr) arr.push(gildi); else sterk.set(key, [gildi]);
    } else if (t.length === 1) {
      // Aðeins RAUNVERULEG eins-orðs nöfn. Ef birtingarnafnið er fleiri en eitt orð
      // varð eins-orðs myndin til við normaliseringu (kýrillískt/grískt/tölur falla
      // burt): "полковник Omega"→omega, "Department 140/16"→department, "NAVIS 6"→navis.
      // 217 af 3.419 færslum eru slíkar og eru verstu falsjákvæðurnar.
      const disp = String((x && x.nafn) || '').trim().split(/\s+/).filter(Boolean);
      if (disp.length !== 1) continue;
      if (!veik.has(t[0])) veik.set(t[0], gildi);
    }
  }
  return { sterk, veik };
}

export function skima(visitala, rawNafn) {
  const sterk = (visitala && visitala.sterk) || new Map();
  const veik = (visitala && visitala.veik) || new Map();
  const t = sancNorm(rawNafn).split(' ').filter(Boolean);

  if (t.length >= 2) {
    const lykill = t[0] + '|' + t[t.length - 1];
    const cands = sterk.get(lykill);
    if (!cands || !cands.length) return null;
    // Besti frambjóðandi ræður — bæði flokkuninni OG hvaða aðili er birtur.
    let best = null, bestRodun = 0;
    for (const c of cands) {
      const s = samraemi(t, String(c.n || '').split(' ').filter(Boolean));
      if (!s) continue;
      const r = _RODUN[s];
      if (r > bestRodun) { bestRodun = r; best = c; if (r === 3) break; }
    }
    if (best) return { flokkur: 'sterk', tegund: 'fjolords', lykill, listi: best.nafn, listar: best.listar };
    // Enginn frambjóðandi er efnislega samrýmanlegur: samsvörunin hvílir EINGÖNGU á
    // fyrsta og síðasta tókeni. LÆKKUÐ í veika lagið — ekki hent. Endurheimtar-tap á
    // refsilista er sjálfstætt regluvörslu-brot, svo samsvörunin heldur áfram að birtast;
    // aðeins alvarleikinn breytist (enginn critical-atburður, engin 'Há', enginn póstur).
    const f = cands[0];
    return { flokkur: 'veik', tegund: 'jadar', lykill, listi: f.nafn, listar: f.listar };
  }
  if (t.length === 1) {
    const m = veik.get(t[0]);
    // Fyrirspurnar-vörn: lyklunin ein og sér hleypir of miklu í gegn, því sancNorm
    // hendir tölustöfum. Krefjumst þess að fyrirspurnin sé stafrétt sama nafn og
    // BIRTINGARNAFN færslunnar — annars samsvarar "SSL25" ESB-færslunni SSL og
    // "Maia" OFAC-færslunni MAIA-1. Greinarmerki hunsuð: "Hamas." samsvarar "Hamas".
    if (!m || alnum(rawNafn) !== alnum(m.nafn)) return null;
    return { flokkur: 'veik', tegund: 'einsords', lykill: t[0], listi: m.nafn, listar: m.listar };
  }
  return null;
}

// flokkaNofn — ein sameiginleg leið fyrir báða kallstaðina (sanctionsHandler + kycScreenKt)
// til að raða nöfnum í sterkar/veikar. Áður var þessi lúkka afrituð inn í hvorn kallstað
// fyrir sig í worker/veitur.mjs — ÓPRÓFANLEG afritun sem leyfði stökkbreytingu (bæði lögin
// í sterkar) að renna í gegn með öll 336 prófin standandi. Nú á einum stað, einingaprófanleg.
export function flokkaNofn(visitala, nofn, { dedup = false } = {}) {
  const sterkar = [], veikar = [], seen = new Set();
  for (const raw of (nofn || [])) {
    const m = skima(visitala, raw);
    if (!m) continue;
    if (dedup) { const k = m.flokkur + '|' + m.lykill; if (seen.has(k)) continue; seen.add(k); }
    (m.flokkur === 'sterk' ? sterkar : veikar).push({ nafn: raw, listi: m.listi, listar: m.listar, tegund: m.tegund });
  }
  return { sterkar, veikar };
}

// skimunarNidurstada — skilar nákvæmlega því sem kycScreenKt setur í sanctions-sviðið.
// Áður var þessi lögun (flokkaNofn → { hits, veikar }) tvær .map-línur inni í kycScreenKt
// sjálfu — óprófanlegt glue (þarf D1-mokkun + fjögur augGet-gögn + fetch), og stökkbreyting
// sem sameinaði lögin þar lét öll 342 prófin standast. Nú á einum stað, einingaprófanleg.
// dedup:false er tilgreint berum orðum (ekki reitt á sjálfgefna gildi flokkaNofn) — þessi
// leið á ALDREI að fella saman endurtekningar, ólíkt sanctionsHandler sem tilgreinir dedup:true.
export function skimunarNidurstada(visitala, nofn) {
  const { sterkar, veikar } = flokkaNofn(visitala, nofn, { dedup: false });
  return {
    hits: sterkar.map((x) => ({ name: x.nafn })),
    // tegund fylgir með svo kyc.mjs geti gefið LÆKKUÐUM samsvörunum ('jadar') sinn eigin
    // info-atburð án þess að snerta eins-orðs lagið, og F9 geti birt rétt orðalag.
    veikar: veikar.map((x) => ({ name: x.nafn, listi: x.listi, listar: x.listar, tegund: x.tegund })),
  };
}
