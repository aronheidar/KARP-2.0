// ─────────────────────────────────────────────────────────────
// build_lyf.js — SÉRLYFJASKRÁ (Lyfjastofnun) → gogn/lyf.json
// DRÖG (bíður samþykkis Arons). Sjá spec: docs/superpowers/specs/2026-07-07-serlyfjaskra-lyf-design.md
//
// KEYRSLA: node skriptur/build_lyf.js            (svo endurbygging: cd web && npx astro build)
//   • LYF_PRICE_MAX : fjöldi verð-sókna. Óstillt/„0" = ÖLL. „none" = engin. N = fyrstu N (forgangsröðuð).
//   • LYF_OUT       : skrifa annað en gogn/lyf.json (prófun; slökkur á dual-write).
//
// OPINBER, opin gögn. Tvær heimildir (báðar staðfestar með raun-köllum við smíði):
//
//  ÞREP 1 — ALGOLIA (grunngögn, ódýrt/heilt).  Opinn search-only lykill úr /leit-búnti serlyfjaskra.is.
//    appId CMDR8T9UU3 · index dev_serlyfjaskra · key a3d4323ff90485057b4ce99f99e01620 (read-only, óhætt).
//    POST https://cmdr8t9uu3-dsn.algolia.net/1/indexes/dev_serlyfjaskra/query  (X-Algolia-* hausar).
//    ~3023 lyf. ⚠ browse lokað + 1000-síðuþak → BIN-PACK: kljúf á ALGILT facet (þar sem sum(counts)===nbHits,
//    þ.e. hver færsla hefur nákvæmlega eitt gildi → ekkert tapast), OR-pakka gildum í hópa <900 → 1 kall/hóp.
//    Facet-forgangur: fínasta algilda facet fyrst (atc.text hefur pínulítil börn → fæst köll). Staðfest count.
//    Færsla inniheldur ALLT nema verð: name, slug, atc, strength, activeIngredients, attributes
//    (marketingAuthorizationHolder, representative=umboð, pharmaceuticalForm, shortage=LYFJASKORTUR,
//    legalStatusOfSupply, category, essentialMedicines, narcotic…), packages[].nordicProductNumber (NPN).
//
//  ÞREP 2 — VERÐ (þyngra).  SSR-síðan /lyf/<slug> ber verðið í __NEXT_DATA__:
//    props.pageProps.results.packages[] → retailPrice (smásölu), referencePrice (viðmiðun),
//    reimbursementStatus (greiðsluþátttaka), wholesalerName (heildsali), referencePriceLastUpdated.
//    Join á NPN. Eitt HTTP-kall per lyf. ⚠ KURTEISI: UA + ~1,2s töf + 1× endurtilraun (engin árás/álag).
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const OUT = process.env.LYF_OUT || path.join(__dirname, '..', 'gogn', 'lyf.json');
const RAWMAX = process.env.LYF_PRICE_MAX;
const PRICE_MAX = (RAWMAX == null || RAWMAX === '' || RAWMAX === '0') ? Infinity
                : (RAWMAX === 'none' ? 0 : Math.max(0, parseInt(RAWMAX, 10) || 0));
const UA = { 'User-Agent': 'KARP dashboard build (karp.is; aronheidars@gmail.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Algolia ───────────────────────────────────────────────────
const APP = 'CMDR8T9UU3', KEY = 'a3d4323ff90485057b4ce99f99e01620', IDX = 'dev_serlyfjaskra';
const ALGOLIA = `https://${APP.toLowerCase()}-dsn.algolia.net/1/indexes/${IDX}/query`;
const AH = { 'X-Algolia-Application-Id': APP, 'X-Algolia-API-Key': KEY, 'Content-Type': 'application/json' };
// algilt facet = leyfilegt til klofnings (sum(counts) verður að vera === nbHits í viðkomandi poka).
const FACETS = ['atc.text', 'attributes.pharmaceuticalForm', 'attributes.legalStatusOfSupply', 'attributes.category'];

// params-strengur Algolia (URL-kóðaður). facetFilters: strengur=OG, fylki=EÐA.
function P(o) {
  const parts = ['query=' + encodeURIComponent(o.query || '')];
  if (o.hitsPerPage != null) parts.push('hitsPerPage=' + o.hitsPerPage);
  if (o.page != null) parts.push('page=' + o.page);
  if (o.facets) parts.push('facets=' + encodeURIComponent(JSON.stringify(o.facets)));
  if (o.maxValuesPerFacet != null) parts.push('maxValuesPerFacet=' + o.maxValuesPerFacet);
  if (o.facetFilters && o.facetFilters.length) parts.push('facetFilters=' + encodeURIComponent(JSON.stringify(o.facetFilters)));
  return parts.join('&');
}
async function algolia(o) {
  for (let att = 0; att < 3; att++) {
    try {
      const r = await fetch(ALGOLIA, { method: 'POST', headers: AH, body: JSON.stringify({ params: P(o) }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (att === 2) throw e; await sleep(700 * (att + 1)); }
  }
}

// OR-pökkun facet-gilda í hópa (summa <=900 OG <=120 gildi) → fá öll gögn hvers hóps í einu kalli.
function packGroups(counts, keys) {
  const small = keys.filter(k => counts[k] <= 900).sort((a, b) => counts[b] - counts[a]);
  const groups = []; let cur = [], sum = 0;
  for (const k of small) {
    if (cur.length && (sum + counts[k] > 900 || cur.length >= 120)) { groups.push(cur); cur = []; sum = 0; }
    cur.push(k); sum += counts[k];
  }
  if (cur.length) groups.push(cur);
  return groups;
}

const seen = new Map();   // objectID -> hit
async function fetchInto(facetFilters) {
  const r = await algolia({ hitsPerPage: 1000, page: 0, facetFilters });
  for (const h of (r.hits || [])) seen.set(h.objectID, h);
  return r.nbHits;
}

// Endurkvæm bin-pack. Klýfur AÐEINS á algilt facet (sum===n) → engin færsla tapast.
async function harvest(filters, guard) {
  if (guard > 12) { console.log('   ! bin-pack of djúpt, hætti á', JSON.stringify(filters)); return; }
  const probe = await algolia({ hitsPerPage: 0, facetFilters: filters, facets: FACETS, maxValuesPerFacet: 1000 });
  const n = probe.nbHits;
  if (!n) return;
  if (n <= 1000) { await fetchInto(filters); await sleep(80); return; }

  // veldu algilt facet með >1 gildi og minnst stærsta barn (skreppur hraðast → fæst köll)
  let best = null;
  for (const f of FACETS) {
    const m = probe.facets && probe.facets[f]; if (!m) continue;
    const ks = Object.keys(m); if (ks.length < 2) continue;
    const sum = ks.reduce((a, k) => a + m[k], 0);
    if (sum !== n) continue;                          // ekki algilt í þessum poka → sleppa (tap-vörn)
    const max = Math.max(...ks.map(k => m[k]));
    if (!best || max < best.max) best = { f, m, ks, max };
  }
  if (!best) {                                        // ekkert algilt facet skiptir pokanum → fínasta facet þvingað
    const f = 'atc.text', m = (probe.facets && probe.facets[f]) || {}, ks = Object.keys(m);
    if (ks.length > 1) best = { f, m, ks, max: Math.max(...ks.map(k => m[k])) };
    else { console.log('   ! ósundurgreinanlegur poki (', n, ') á', JSON.stringify(filters), '— tek fyrstu 1000'); await fetchInto(filters); return; }
  }
  const big = best.ks.filter(k => best.m[k] > 900);
  for (const g of packGroups(best.m, best.ks)) {      // EÐA-hópar (hver <900) → 1 kall
    await fetchInto([...filters, g.map(v => `${best.f}:${v}`)]);
    await sleep(80);
  }
  for (const k of big) await harvest([...filters, `${best.f}:${k}`], guard + 1);  // stök gildi >900 → dýpra
}

// ── Verð: __NEXT_DATA__ á /lyf/<slug> ─────────────────────────
async function getText(u) {
  for (let att = 0; att < 2; att++) {
    try {
      const r = await fetch(u, { headers: UA });
      return { status: r.status, text: await r.text() };
    } catch (e) { if (att === 1) return { status: 0, text: '' }; await sleep(900); }
  }
}
function extractPackages(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let nd; try { nd = JSON.parse(m[1]); } catch (e) { return null; }
  const res = nd && nd.props && nd.props.pageProps && nd.props.pageProps.results;
  return res && Array.isArray(res.packages) ? res.packages : null;
}
async function fetchPrice(slug) {
  const { status, text } = await getText(`https://serlyfjaskra.is/lyf/${encodeURIComponent(slug)}`);
  if (status !== 200) return null;
  const pkgs = extractPackages(text);
  if (!pkgs) return null;
  const byNpn = {};
  for (const p of pkgs) {
    if (!p.nordicProductNumber) continue;
    byNpn[p.nordicProductNumber] = {
      retail: p.retailPrice != null ? p.retailPrice : null,
      reference: p.referencePrice != null ? p.referencePrice : null,
      reimb: !!p.reimbursementStatus,
      wholesaler: p.wholesalerName || null,
      refUpdated: p.referencePriceLastUpdated ? String(p.referencePriceLastUpdated).slice(0, 10) : null,
    };
  }
  return byNpn;
}

// ── ATC efsta-stig (til flokkunar í viðmóti) ──────────────────
const ATC1 = {
  A: 'Meltingarfæri og efnaskipti', B: 'Blóð og blóðmyndandi líffæri', C: 'Hjarta og æðakerfi',
  D: 'Húðlyf', G: 'Þvagfæri, kynfæri og kynhormón', H: 'Hormón (ekki kyn-)', J: 'Sýkingalyf',
  L: 'Æxlishemjandi og ónæmislyf', M: 'Stoðkerfi', N: 'Taugakerfi', P: 'Sníkjudýralyf',
  Q: 'Dýralyf (ATC-vet)', R: 'Öndunarfæri', S: 'Skynfæri', V: 'Ýmislegt',
};

// ── mótun úttaks + skrif (m/ dual-write) ──────────────────────
function buildOut(lyf) {
  const priced = lyf.filter(r => r.priced).length;
  const shortageCount = lyf.filter(r => r.shortage).length;
  const atc = {};
  for (const r of lyf) { const c = (r.atc.code || '?')[0]; const e = atc[c] || (atc[c] = { label: ATC1[c] || 'Óflokkað', count: 0 }); e.count++; }
  return { updated: new Date().toISOString().slice(0, 10), count: lyf.length, priced, shortageCount,
    source: 'serlyfjaskra.is (Lyfjastofnun) · Algolia dev_serlyfjaskra + /lyf SSR-verð', atc, lyf };
}
// Skrifar OUT + (nema LYF_OUT sé sett) dual-write í web/public/gogn/lyf.json. Kallað reglulega
// (checkpoint) svo löng verð-sókn tapist ekki + síðan hafi ferskt eintak strax eftir grunnsókn.
function writeOut(lyf) {
  const out = buildOut(lyf);
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT, json);
  if (!process.env.LYF_OUT) {
    const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn', 'lyf.json');
    try { fs.mkdirSync(path.dirname(PUB), { recursive: true }); fs.writeFileSync(PUB, json); }
    catch (e) { console.log('  ! dual-write brást:', String(e.message || e).slice(0, 90)); }
  }
  return out;
}

// ── keyrsla ───────────────────────────────────────────────────
async function main() {
  // ÞREP 1 — grunngögn
  const t0 = Date.now();
  const nbHits = (await algolia({ hitsPerPage: 0 })).nbHits;
  console.log('Algolia dev_serlyfjaskra: nbHits =', nbHits);
  await harvest([], 0);
  console.log('Bin-pack →', seen.size, 'einstök lyf (af', nbHits + ')', 'á', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (seen.size < nbHits) console.log('   ⚠ vantar', nbHits - seen.size, 'lyf — bin-pack náði ekki öllu (skoða facet-algildi).');

  // móta grunnfærslur
  const lyf = [];
  const npnIndex = new Map();  // npn -> {record, pkg}
  for (const h of seen.values()) {
    const a = h.attributes || {};
    const rec = {
      name: h.name || '', add: h.additionalName || '', slug: h.slug || '',
      atc: { code: (h.atc && h.atc.category) || '', name: (h.atc && h.atc.name) || '' },
      strength: (h.strength && h.strength.text) || '',
      form: a.pharmaceuticalForm || '',
      ingredients: (h.activeIngredients || []).filter(x => x.active !== false).map(x => x.name).filter(Boolean),
      holder: a.marketingAuthorizationHolder || '',
      agent: a.representative || '',
      shortage: !!a.shortage,
      rx: a.legalStatusOfSupply || '',
      vet: a.category === 'Lyf fyrir dýr',
      essential: !!a.essentialMedicines,
      narcotic: !!a.narcotic,
      status: a.authorizationStatus || '',
      packages: (h.packages || []).map(p => ({ npn: p.nordicProductNumber || '', size: p.packaging || '' })),
      priceLow: null, priceHigh: null, priced: false,
    };
    for (const p of rec.packages) if (p.npn) npnIndex.set(p.npn, { rec, pkg: p });
    lyf.push(rec);
  }
  lyf.sort((x, y) => (y.shortage - x.shortage) || x.name.localeCompare(y.name, 'is'));
  writeOut(lyf);   // checkpoint 0: grunngögn strax (leit + lyfjaskortur eru þegar heil án verðs)
  console.log('Grunngögn skrifuð (' + lyf.length + ' lyf, án verðs) — byrja verð-sókn.');

  // ÞREP 2 — verð (forgangur: skortur → nauðsyn → dreift). Sæki upp að PRICE_MAX.
  const order = lyf.map((r, i) => i).sort((ia, ib) => {
    const a = lyf[ia], b = lyf[ib];
    return (b.shortage - a.shortage) || (b.essential - a.essential) || a.name.localeCompare(b.name, 'is');
  });
  const budget = Math.min(order.length, PRICE_MAX);
  let done = 0, ok = 0, fail = 0;
  console.log('Verð-sókn:', budget === Infinity ? 'öll' : budget, 'lyf (LYF_PRICE_MAX=' + (RAWMAX ?? '(óstillt→öll)') + ')');
  for (let k = 0; k < budget; k++) {
    const rec = lyf[order[k]];
    if (!rec.slug) { fail++; continue; }
    const byNpn = await fetchPrice(rec.slug);
    done++;
    if (byNpn) {
      let retails = [];
      for (const p of rec.packages) {
        const pr = byNpn[p.npn];
        if (pr) { p.retail = pr.retail; p.reference = pr.reference; p.reimb = pr.reimb; p.wholesaler = pr.wholesaler; p.refUpdated = pr.refUpdated;
          if (pr.retail != null) retails.push(pr.retail); }
      }
      if (retails.length) { rec.priceLow = Math.min(...retails); rec.priceHigh = Math.max(...retails); rec.priced = true; ok++; }
      else ok++; // síðan svaraði en engin smásöluverð (t.d. sjúkrahúslyf) — telst sótt
    } else fail++;
    if (done % 100 === 0) console.log('   ·', done + '/' + budget, '(' + ok + ' ok,', fail, 'engin verð) —', Math.round((Date.now() - t0) / 6e4) + ' mín');
    if (done % 250 === 0) writeOut(lyf);   // checkpoint: löng sókn tapist ekki
    await sleep(1150);
  }

  // ── yfirlit + lokaskrif ─────────────────────────────────────
  const out = writeOut(lyf);
  console.log('\nSkrifað', OUT, '(' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB)' + (process.env.LYF_OUT ? '' : ' + web/public/gogn/lyf.json'));
  console.log('  ', out.count, 'lyf ·', out.priced, 'með verð ·', out.shortageCount, 'í skorti ·',
    Object.keys(out.atc).length, 'ATC-flokkar ·', ok, 'sótt,', fail, 'án ·', ((Date.now() - t0) / 6e4).toFixed(1), 'mín alls');
}

main().catch(e => { console.error('VILLA', e); process.exit(1); });
