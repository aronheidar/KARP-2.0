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
  console.log('Mál með atkvæðagreiðslu:', bills.length);
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
  const payload = JSON.stringify({ updated: new Date().toISOString().slice(0, 10), thing: 157, mal });
  fs.writeFileSync(OUT, payload);
  // LOTA 23: líka sem static asset — þingmálasíðan sækir nafnakallið LATÍNT
  // (fetch við fyrsta glugga) í stað 272KB inline í HTML-inu.
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'atkvaedi.json'), payload);
  console.log('Skrifað: gogn/atkvaedi.json + web/public/gogn/atkvaedi.json ·', Object.keys(mal).length, 'mál með nafnakalli (', fetched, 'ný )');
}
main().catch((e) => { console.error(e); process.exit(1); });
