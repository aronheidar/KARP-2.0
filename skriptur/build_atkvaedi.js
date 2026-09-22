// ─────────────────────────────────────────────────────────────
// build_atkvaedi.js — nafnakall þingmanna per þingmál (LOTA 19, #2)
// frumvorp.json ber vs2 = atkvæðagreiðslu-ID; hér er LOKA-atkvæðagreiðsla
// hvers máls sótt af XML-veitu Alþingis og nöfnin flokkuð eftir atkvæði.
// Úttak: gogn/atkvaedi.json { nr: { ja:[nöfn], nei:[], hja:[], fjar:[] } }
// — knýr „Hvernig kusu þingmenn?" í frumvarpa-glugganum á /thingmal/.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const FRUMVORP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gogn', 'frumvorp.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'gogn', 'atkvaedi.json');
const UA = { 'User-Agent': 'KARP build (karp.is; aronheidars@gmail.com)' };

const grab = (x, tag) => { const m = x.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].trim() : ''; };

// ── malasponn(bills) → { thingin, arekstrar } ────────────────────────────────
// Hvaða löggjafarþing ná málin með atkvæðagreiðslu raunverulega yfir? Þingið var HARÐKÓÐAÐ
// 157 í úttakinu; gögnin sjálf eru rétt (sótt eftir atkvæðanúmeri, ekki þingi) en merkingin
// var það ekki. frumvorp.json notar thingListi() og spannar því tvö þing um leið og nýja
// þingið eignast mál með lokaatkvæðagreiðslu.
//
// ⚠⚠ Um leið og spönnin er tvö þing REKAST LYKLARNIR Á: atkvaedi.json er lyklað á bert
//   málsnúmer og mál nr. 1 á 158 eru fjárlögin en allt annað á 157. `if (mal[b.nr]) continue`
//   heldur því sem kom fyrst og hitt málið fengi RANGT nafnakall undir sig — þögult.
//   Skráin getur ekki borið bæði án nýrrar lyklingar (sem breytir líka thingmal.astro og
//   build_frettavel.js), svo hér er AÐEINS greint og varað. Sjá minni: „Lyklar VERÐA að bera
//   þing við sameiningu".
function malasponn(bills) {
  const medAtkv = (bills || []).filter((b) => Array.isArray(b.vs2) && b.vs2.length);
  const thingin = [...new Set(medAtkv.map((b) => b.thing).filter((t) => t != null))].sort((a, b) => a - b);
  const perNr = {};
  medAtkv.forEach((b) => { (perNr[b.nr] = perNr[b.nr] || new Set()).add(b.thing); });
  const arekstrar = Object.entries(perNr)
    .filter(([, t]) => t.size > 1)
    .map(([nr, t]) => ({ nr: +nr, thing: [...t].sort((a, b) => a - b) }));
  return { thingin, arekstrar };
}

async function rollCall(voteId) {
  const url = 'https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=' + voteId;
  const x = await (await fetch(url, { headers: UA })).text();
  const out = { ja: [], nei: [], hja: [], fjar: [] };
  // hver þingmaður: <þingmaður id='..'><nafn>..</nafn>...<atkvæði>já</atkvæði>
  const chunks = x.split(/<þingmaður\b/).slice(1);
  for (const c of chunks) {
    const nafn = grab(c, 'nafn');
    const atkv = grab(c, 'atkvæði').toLowerCase();
    if (!nafn) continue;
    if (atkv === 'já') out.ja.push(nafn);
    else if (atkv === 'nei') out.nei.push(nafn);
    else if (/greiðir ekki/.test(atkv)) out.hja.push(nafn);
    else if (/fjarver/.test(atkv)) out.fjar.push(nafn);
  }
  return (out.ja.length + out.nei.length + out.hja.length) ? out : null;
}

async function main() {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).mal || {}; } catch (e) {}
  const bills = FRUMVORP.filter((b) => Array.isArray(b.vs2) && b.vs2.length);
  const { thingin, arekstrar } = malasponn(FRUMVORP);
  console.log('Mál með atkvæðagreiðslu:', bills.length, '· þing:', thingin.join(', ') || '(óþekkt)');
  if (arekstrar.length) {
    console.log('⚠⚠ ' + arekstrar.length + ' málsnúmer eru á FLEIRI EN EINU þingi — atkvaedi.json er lyklað á bert');
    console.log('   málsnúmer og getur aðeins borið annað þeirra. Nafnakall getur birst undir RÖNGU máli.');
    arekstrar.slice(0, 10).forEach((a) => console.log('   · mál ' + a.nr + ' á þingum ' + a.thing.join(' og ')));
  }
  const mal = { ...existing };
  let fetched = 0;
  for (const b of bills) {
    if (mal[b.nr]) continue; // þegar sótt (nafnakall breytist ekki eftir á)
    const voteId = b.vs2[b.vs2.length - 1]; // loka-atkvæðagreiðslan
    try {
      const rc = await rollCall(voteId);
      if (rc) { mal[b.nr] = rc; fetched++; }
    } catch (e) { console.log('  villa mál', b.nr, String(e).slice(0, 60)); }
    if (fetched && fetched % 25 === 0) console.log('  …', fetched, 'sótt');
  }
  // thing = efsta þingið sem gögnin ná yfir (tala, eins og aðrar skrár), thingin = öll spönnin.
  const payload = JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    thing: thingin.length ? thingin[thingin.length - 1] : null,
    thingin,
    arekstrar: arekstrar.length,   // >0 þýðir að nafnakall getur setið undir röngu máli
    mal,
  });
  fs.writeFileSync(OUT, payload);
  // LOTA 23: líka sem static asset — þingmálasíðan sækir nafnakallið LATÍNT
  // (fetch við fyrsta glugga) í stað 272KB inline í HTML-inu.
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'atkvaedi.json'), payload);
  console.log('Skrifað: gogn/atkvaedi.json + web/public/gogn/atkvaedi.json ·', Object.keys(mal).length, 'mál með nafnakalli (', fetched, 'ný )');
}
module.exports = { malasponn };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
