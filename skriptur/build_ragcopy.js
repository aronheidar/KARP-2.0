// build_ragcopy.js (LOTA 61; ENDURSMÍÐ í mánaðaruttekt C7, 30.7.2026) — samstillir gagnatrén tvö:
//   gogn/            = KANÓNÍSKA tréð: skriptur skrifa hingað og Astro les það á byggingartíma
//                      (via '@gogn'-alias í web/astro.config.mjs).
//   web/public/gogn/ = ÞJÓNAÐA tréð: workerinn les AÐEINS úr ASSETS (Spyrðu-Karp AUG o.fl.) og
//                      client-síður fetch-a /gogn/*.json.
//
// ÁÐUR: 19-skráa hvítlisti; allt annað varð að tvískrifa sjálft, og skripta/workflow sem gleymdi
// því staðnaði HLJÓÐLAUST (dæmi: build_birgjar.js tvískrifar rétt en birgjar-weekly.yml git-add-aði
// aðeins rótina → web-eintakið fraus 27 daga þótt rótin væri fersk).
// NÚ: SPEGLUN — sérhver top-level gogn/*.json sem á sér hliðstæðu í web/public/gogn/ (eða er á
// RAG-skyldulistanum) er afrituð rót→web þegar innihald víkur, með tveimur vörnum:
//   1) VEF_KANONISKT: skrár þar sem web/public/gogn er UPPSPRETTAN (skriptan skrifar beint þangað)
//      — ALDREI speglað yfir þær, sama hvað.
//   2) Tímastimpla-vörn (nýrri vinnur): sé web-eintakið greinilega ferskara (mtime > rót + 2 mín,
//      þ.e. skrifað í þessari keyrslu/nýlega) er sleppt og varað við — það bendir til að skráin
//      eigi heima á VEF_KANONISKT-listanum. Í CI-checkouti hafa ósnert pör ~sama mtime og þá
//      ræður rótin (kanóníska tréð) þegar innihald víkur.
// Undirmöppur (roads/, arsreikningar/, eigendur/, stjorn/, hnit/, pdf/ o.s.frv.) eru ALDREI
// snertar, engu er nokkurn tíma eytt í markmiðinu, og skrár sem eru AÐEINS í rót eru EKKI birtar
// (innri state/cache/AI-efni — t.d. thingskyrsla_ai.json er SELT efni og má alls ekki í public!).
//
// NÝTT GAGNASETT sem á að vera aðgengilegt á /gogn/<skrá>.json: skrifaðu það EINU SINNI í
// web/public/gogn/ (eða bættu á RAG_FILES) — eftir það heldur speglunin því fersku, engin
// tvískrifun þarf framar. Innri skrá (state/cache/einkagögn) fylgir INNRI-mynstri eða fer á
// INNRI-listann svo viðvörunin þegi; ella prentast ⚠-lína í CI-loggnum (ekkert staðnar hljóðlaust).
//
// KEYRSLA: node skriptur/build_ragcopy.js [--dry]   (keyrt síðast í refresh-data.yml)

const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'gogn');
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
const DRY = process.argv.includes('--dry');
const TAG = DRY ? '[DRY] ' : '';

// Skyldulisti Spyrðu-Karp-RAG (AUG-kort worker.js): afritað þó eintakið vanti í web.
const RAG_FILES = [
  'sveitarstjorar.json', 'cabinet.json', 'althingi.json', 'althingi_meta.json',
  'frumvorp.json', 'atvinnuleysi.json', 'orka.json', 'glaepir.json', 'leiga.json',
  'markadir.json', 'ivilnanir.json', 'skattar.json', 'utgjold.json', 'nefndir.json',
  'sendirad.json', 'numbeo.json', 'sedlabanki.json',
  'styrkir.json',   // LOTA 92: opinberar styrkveitingar (nafn→úthlutun; /api/styrkir + #fs-styrkir)
  'logbirting.json',// LOTA 95: Lögbirtingablaðið (kt→lögform. tilkynningar; /api/logbirting + #fs-logbirting)
];

// web/public/gogn er UPPSPRETTAN — rótar-eintakið er stöðnuð afleiða; aldrei speglað rót→web.
const VEF_KANONISKT = new Set([
  'domar_ai.json', // build_domar_ai.js skrifar AÐEINS í web (l.74); vaktir.astro fetch-ar /gogn/domar_ai.json
]);

// Þekktar INNRI rótar-skrár (byggingarinntak/state/AI-efni) sem eiga EKKI að birtast í web —
// engin viðvörun fyrir þær. Mynstrin ná yfir *_seen/_state/_cache/_meta/_ai + fjölskyldur.
const INNRI_MYNSTUR = [
  /_seen\.json$/, /_state\.json$/, /_cache\.json$/, /_meta\.json$/, /_ai\.json$/,
  /^backfill/, /^sveitarfelog/, /^sveitarstjorn_/,
];
const INNRI = new Set([
  'dagatal.json', 'ees.json', 'ees_gerdir.json', 'eftirlit_hnit.json', 'jofnun.json',
  'langtima.json', 'leidrettingar.json', 'natoexp.json', 'raedugreining.json',
  'raunvirdi.json', 'samantektir.json', 'seats.json', 'seat_overrides.json',
  'sentiment.json', 'sereign.json', 'stofnanir.json', 'tengsl_fonix.json',
  'thingskyrsla.json', // þing-skýrslugögn eru bökuð í HTML á byggingartíma; _ai-djúpgreiningin er SELD
  'ytras.json', 'ytsafn.json',
]);
const erInnri = (f) => INNRI.has(f) || INNRI_MYNSTUR.some((re) => re.test(f));

fs.mkdirSync(PUB, { recursive: true });
const rootTop = fs.readdirSync(G).filter((f) => f.endsWith('.json'));           // AÐEINS top-level
const webTop = new Set(fs.readdirSync(PUB).filter((f) => f.endsWith('.json')));

let afritad = 0, itakt = 0, vefkan = 0, innri = 0;
const vidvaranir = [], sleppt = [];

for (const f of rootTop) {
  if (VEF_KANONISKT.has(f)) { vefkan++; continue; }
  const speglanleg = webTop.has(f) || RAG_FILES.includes(f);
  if (!speglanleg) { if (erInnri(f)) innri++; else vidvaranir.push(f); continue; }
  const src = path.join(G, f), dst = path.join(PUB, f);
  if (!fs.existsSync(dst)) { // RAG-skylda sem vantar í web → bootstrap-afrit
    console.log(TAG + '+ ' + f + ' (vantaði í web/public/gogn)');
    if (!DRY) fs.copyFileSync(src, dst);
    afritad++; continue;
  }
  const a = fs.readFileSync(src), b = fs.readFileSync(dst);
  if (a.equals(b)) { itakt++; continue; }
  const sm = fs.statSync(src).mtimeMs, dm = fs.statSync(dst).mtimeMs;
  if (dm - sm > 120000) { // web skrifað nýlega/í þessari keyrslu — nýrri vinnur, EKKI yfirskrifa
    sleppt.push(f + ' (web ' + Math.round((dm - sm) / 60000) + ' mín ferskara — á heima á VEF_KANONISKT?)');
    continue;
  }
  console.log(TAG + '→ ' + f + ' (innihald ólíkt, ' + a.length + 'b yfir ' + b.length + 'b)');
  if (!DRY) fs.copyFileSync(src, dst);
  afritad++;
}

const vantar = RAG_FILES.filter((f) => !fs.existsSync(path.join(G, f)));
for (const f of vantar) console.log('  – vantar í gogn/: ' + f);
for (const s of sleppt) console.log('⚠ sleppt (web ferskara): ' + s);
for (const f of vidvaranir) {
  console.log('⚠ aðeins í rót — hvorki speglað né merkt innri: gogn/' + f +
    ' (skrifaðu einu sinni í web/public/gogn/ til að þjóna, eða bættu á INNRI-listann)');
}
console.log(TAG + 'RAG-spegill: ' + afritad + ' afritaðar, ' + itakt + ' í takt, ' + vefkan +
  ' vef-kanónískar, ' + innri + ' innri, ' + sleppt.length + ' sleppt, ' + vidvaranir.length +
  ' viðvaranir' + (vantar.length ? ', ' + vantar.length + ' vantaði' : ''));
