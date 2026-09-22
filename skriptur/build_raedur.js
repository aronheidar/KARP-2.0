// ─────────────────────────────────────────────────────────────
// build_raedur.js — Ræðugreining Alþingis (LOTA 16, liður 4)
// Les ræðulista yfirstandandi þings (XML, ~15þ ræður) og reiknar TÖLFRÆÐILEGT
// „málróf" hvers þingmanns: fjöldi/mínútur eftir tegund ræðu (ræða,
// andsvar, um fundarstjórn…), topp-málefni eftir ræðutíma, lengsta ræða.
// ENGIN gervigreind — hrein talning úr opinberu XML-i Alþingis.
// Keyrsla: node skriptur/build_raedur.js  →  gogn/raedugreining.json
//
// ⚠ lthing var harðkóðað 157 og `thing: 157` skrifað í skrána — 158. þing hófst 9/2026 og
//   gögnin frusu: summa mp[*].min stóð í 42.503 á hverju einasta dagskommitti frá júlí meðan
//   `updated` færðist daglega. Nú spurt hjá Alþingi (nuverandiThing, sama og build_cabinet.js).
//
// ⚠ Seigla (sjá _seigla.js): fetchText hendir á non-2xx og reynir aftur með bakslagi, og
//   writeJsonUnlessEmpty heldur fyrri skrá ef ekkert fannst. Hvort tveggja er nauðsyn hér því
//   refresh-data.yml keyrir skriftina með `|| true` — villa er ÞÖGUL, svo það sem ekki er
//   varið skrifast yfir góð gögn. 200-svar án <ræða> (villusíða, tómur listi) má aldrei
//   skrifa mp: {} yfir 115 þingmenn.
// ─────────────────────────────────────────────────────────────
const path = require('path');
const { fetchText, writeJsonUnlessEmpty, nuverandiThing } = require('./_seigla.js');

const OUT = path.join(__dirname, '..', 'gogn', 'raedugreining.json');
const UA = { 'User-Agent': 'KARP dashboard build (karp.is)' };

const grab = (xml, tag) => {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
};
const klippt = (h) => (h.length > 80 ? h.slice(0, 77) + '…' : h);

// ── greinRaedulista(xml) → { total, skipped, mp } ────────────────────────────
// Hreint fall (engin fs/net) svo talningin sé prófanleg og svo að þáttun á rusli skili
// sannanlega TÓMU mp í stað þess að búa til gögn.
// `skipped` = ræður án ræðumanns-auðkennis: forseti Íslands og gestir eru ekki þingmenn og
// síast hvort eð er út við samsvörun við althingi.json síðar.
function greinRaedulista(xml) {
  const chunks = String(xml || '').split('<ræða>').slice(1);
  const safn = {}; // id → safn
  let skipped = 0;
  for (const c of chunks) {
    const idm = c.match(/<ræðumaður id='(\d+)'/);
    if (!idm) { skipped++; continue; }
    const id = +idm[1];
    const teg = grab(c, 'tegundræðu') || 'ræða';
    const heiti = grab(c, 'málsheiti');
    const t0 = grab(c, 'ræðahófst'), t1 = grab(c, 'ræðulauk');
    let min = 0;
    if (t0 && t1) {
      const d = (new Date(t1) - new Date(t0)) / 60000;
      if (d > 0 && d < 180) min = d;   // meira en 3 klst er skráningarvilla, ekki ræða
    }
    const e = (safn[id] = safn[id] || { n: 0, min: 0, teg: {}, mal: {}, longest: 0, longestHeiti: '' });
    e.n++;
    e.min += min;
    e.teg[teg] = (e.teg[teg] || 0) + 1;
    if (heiti && !/^ávarp|^þingsetning/i.test(heiti)) {
      const m2 = (e.mal[heiti] = e.mal[heiti] || { n: 0, min: 0 });
      m2.n++;
      m2.min += min;
    }
    if (min > e.longest) { e.longest = min; e.longestHeiti = heiti; }
  }

  const mp = {};
  Object.keys(safn).forEach((id) => {
    const e = safn[id];
    mp[id] = {
      n: e.n,
      min: Math.round(e.min),
      raedur: e.teg['ræða'] || 0,
      andsvor: (e.teg['andsvar'] || 0) + (e.teg['svar'] || 0),
      fundarstj: e.teg['um fundarstjórn'] || 0,
      flutn: e.teg['flutningsræða'] || 0,
      topMal: Object.entries(e.mal).sort((a, b) => b[1].min - a[1].min).slice(0, 5)
        .map(([h, v]) => ({ h: klippt(h), n: v.n, min: Math.round(v.min) })),
      longest: Math.round(e.longest),
      longestHeiti: klippt(e.longestHeiti),
    };
  });
  return { total: chunks.length, skipped, mp };
}

// ── erTom(d) — skilgreining á „tómu" fyrir writeJsonUnlessEmpty ──────────────
// ⚠ Aðeins mp ræður, EKKI total og ekki summa mínútna. Fyrstu daga nýs þings er skráin
//   agnarsmá og uppsafnaðar mínútur hrynja úr 42.503 í nær núll; teldist það „tómt" héldi
//   seiglan 157. þingi að eilífu og við hefðum skipt einni frystingu út fyrir aðra.
function erTom(d) {
  return !d || !d.mp || Object.keys(d.mp).length === 0;
}

async function main() {
  const LTHING = await nuverandiThing({ fallback: 157 });
  console.log('Sæki ræðulista ' + LTHING + '…');
  const xml = await fetchText('https://www.althingi.is/altext/xml/raedulisti/?lthing=' + LTHING, { headers: UA });
  const { total, skipped, mp } = greinRaedulista(xml);
  console.log('Ræður í skrá:', total);

  const out = { updated: new Date().toISOString().slice(0, 10), thing: LTHING, total, mp };
  const { kept } = writeJsonUnlessEmpty(OUT, out, { isEmpty: erTom, label: 'raedugreining.json' });
  console.log('Þingmenn/ræðumenn m/gögn:', Object.keys(mp).length, '· sleppt (án id):', skipped);
  console.log(kept ? 'Fyrri skrá haldið:' : 'Skrifað:', OUT);
}

module.exports = { greinRaedulista, erTom };

if (require.main === module) {
  main().catch((e) => { console.error('VILLA', e); process.exit(1); });
}
