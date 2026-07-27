// ubo-core.mjs — hrein UBO-rakning fyrir Áreiðanleikavaktina (KYC-merkið 'ubo'). Engin I/O.
// Gengur UPP eignarhaldsnetið frá rótarfélagi, margfaldar eignarhlutföll eftir hverri keðju og
// leggur VIRKT eignarhald saman á endanlega EINSTAKLINGA. Kallarinn (worker `_kycUbo`) útvegar
// netið sem samstillt uppflettifall (forsótt með afmarkaðri BFS) svo þetta sé einingaprófanlegt.
//
// hlutur er PRÓSENTA (0..100) — sama og eign-taflan og computeUbo (skriptur/lib/ubo.mjs). Gildi
// geta verið strengir úr RSK-skrapinu ('60%', '60,5%', '-', null) → hlutFrac þáttar þau örugglega.
//
// AML: við OFMETUM ALDREI þekjuna. Blindgötur (félag án þekktra eigenda), hringir og þök á dýpt/
// hnútafjölda setja `incompleteChain=true`; virkt eignarhald sem skilað er er þá LÁGMARKSMAT.

export const KYC_UBO_THRESHOLD = 0.25;   // 25% — íslensk/ESB AML-viðmið fyrir raunverulega eigendur

// '60%' -> 0.6, '60,5%' -> 0.605, 60 -> 0.6, '-'/null/rusl -> 0. Speglar hlNum í ubo-report.js.
export function hlutFrac(v) {
  if (v == null) return 0;
  const m = String(v).replace(',', '.').match(/-?[\d.]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) ? n / 100 : 0;
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// graph = { getOwners(key) -> [{ key, hlutur, isCompany, nafn }] }  (virkir eigenda-leggir `key`; [] ef engir/óþekkt)
// Skilar { beneficial:[{key,nafn,effPct,incomplete?}], incompleteChain:bool, truncated:bool, visited:int }.
export function traceUbo(graph, rootKt, { threshold = KYC_UBO_THRESHOLD, depthCap = 8, nodeCap = 200 } = {}) {
  const getOwners = (k) => graph.getOwners(k) || [];
  const acc = new Map();                 // eigandi-lykill -> { key, nafn, frac, incomplete }
  let visited = 0, incompleteChain = false, truncated = false;

  // Félaga-eigandi telst ÓREKJANLEGUR ef: hann er þegar á leiðinni (hringur), næsta þrep færi yfir
  // dýptarþak, eða hann hefur enga þekkta eigendur (blindgata — órakið/óbyggt í tengslagrunni).
  const unresolvedCompany = (o, path, depth) =>
    o.isCompany && (path.includes(o.key) || depth + 1 > depthCap || getOwners(o.key).length === 0);

  function add(o, frac, incomplete) {
    const cur = acc.get(o.key) || { key: o.key, nafn: o.nafn || o.key, frac: 0, incomplete: false };
    cur.frac += frac;                    // sami einstaklingur um margar keðjur -> SUMMA
    if (incomplete) cur.incomplete = true;
    acc.set(o.key, cur);
  }

  function walk(key, frac, path, depth, inherited) {
    if (visited >= nodeCap) { truncated = true; incompleteChain = true; return; }   // hnúta-þak
    visited++;
    const owners = getOwners(key);
    // Er þetta félag að fullu rakið? Ef einhver félaga-eigandi er órekjanlegur erfa AFKOMENDUR
    // 'incomplete' (virkt eignarhald neðar í keðjunni er þá lágmarksmat).
    let hasUnresolved = false;
    for (const o of owners) if (unresolvedCompany(o, path, depth)) { hasUnresolved = true; incompleteChain = true; }
    const childTaint = inherited || hasUnresolved;
    for (const o of owners) {
      const eff = frac * hlutFrac(o.hlutur);
      if (o.isCompany) {
        if (unresolvedCompany(o, path, depth)) continue;         // þegar merkt sem órekjanlegt -> sleppa
        walk(o.key, eff, [...path, o.key], depth + 1, childTaint);
      } else {
        add(o, eff, inherited);   // endanlegur einstaklingur; incomplete ef keðjan HINGAÐ var ófullgerð (erft)
      }
    }
  }
  walk(rootKt, 1, [rootKt], 0, false);

  const beneficial = [...acc.values()]
    .filter((b) => b.frac >= threshold - 1e-9)
    .map((b) => ({ key: b.key, nafn: b.nafn, effPct: round2(b.frac * 100), ...(b.incomplete ? { incomplete: true } : {}) }))
    .sort((a, b) => b.effPct - a.effPct || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { beneficial, incompleteChain, truncated, visited };
}
