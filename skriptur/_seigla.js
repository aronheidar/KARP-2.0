// Seiglu-hjálpar fyrir CJS build-skriptur sem sækja Alþingis-XML o.fl. (build_cabinet.js, build_dagatal.js …).
//
// Af hverju (22.8.2026): althingi.is svaraði HTTP 429 (hraðatakmörkun eftir ~1.700 köll build_frumvorp.js) í ≥6 s.
// Skriptur sem athuguðu ekki r.ok þáttuðu 429-svarið sem „0 niðurstöður" og skrifuðu TÓMAR skrár
// (cabinet.json=[], dagatal.json range:[null,null] …) sem automation committaði → /althingi/ varð óbyggjanleg.
//
// Mynstur = sama „seigla" og `X ?? prev.X` í Hagstofu-snapshot-skriptunum (_pxlib.mjs loadPrev):
//   1) fetchText()            — hendir á non-2xx og reynir aftur með bakslagi (virðir Retry-After) → villa er VILLA, ekki tóm gögn
//   2) writeJsonUnlessEmpty() — tóm niðurstaða + fyrri skrá með efni → HALDA fyrri skrá óbreyttri og vara við (⚠ SEIGLA í loggi)
//   3) loadPrev()             — fyrri skrá (undefined ef vantar/ógild) f. `X ?? prev.X` á stökum sviðum (t.d. mynd ráðherra)
const fs = require('fs');

function loadPrev(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (e) { return undefined; }
}

async function fetchText(url, opts = {}) {
  const {
    retries = 3, backoffMs = [2000, 5000, 10000],
    fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)),
    logger = console, headers = { 'User-Agent': 'Mozilla/5.0' },
  } = opts;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    let wait = backoffMs[Math.min(i, backoffMs.length - 1)];
    try {
      const r = await fetchImpl(url, { headers });
      if (r.ok) return await r.text();
      const ra = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : 0);
      if (ra > 0) wait = Math.max(wait, Math.min(ra * 1000, 60000)); // þak 60 s — ekki hanga í CI
      lastErr = new Error('HTTP ' + r.status + ' for ' + url);
    } catch (e) { lastErr = e; }
    if (i < retries) {
      logger.log('  ↻ ' + lastErr.message + ' — reyni aftur eftir ' + (wait / 1000) + 's (' + (i + 2) + '/' + (retries + 1) + ')');
      await sleep(wait);
    }
  }
  throw lastErr;
}

// isEmpty(data) skilgreinir „tómt" per skrá (t.d. d => !d.length, eða f. dagatal: plenary EÐA meetings 0).
// Skilar { kept: true } ef fyrri skrá var haldið (ekkert skrifað), annars { kept: false }.
function writeJsonUnlessEmpty(path, data, { isEmpty, label, logger = console } = {}) {
  const name = label || path;
  if (isEmpty(data)) {
    const prev = loadPrev(path);
    if (prev !== undefined && !isEmpty(prev)) {
      logger.log('⚠ SEIGLA ' + name + ': veitan skilaði engu — held fyrri skrá óbreyttri (ekkert skrifað). Athugaðu veituna.');
      return { kept: true };
    }
  }
  fs.writeFileSync(path, JSON.stringify(data));
  return { kept: false };
}

// ── nuverandiThing() ────────────────────────────────────────────────────────
// Af hverju (9.9.2026): `lthing=157` var HARÐKÓÐAÐ í build_althingi/cabinet/committees/dagatal/
// frumvorp. 158. löggjafarþing hófst í september 2026 og skriftirnar héldu áfram að spyrja um
// þing sem var lokið — ný mál, nýir þingfundir og ný nefndaskipan komust aldrei inn.
// Harðkóðun færir vandann bara til næsta þings (159 haustið 2027), svo við SPYRJUM Alþingi.
//
// `/altext/xml/loggjafarthing/` telur öll þing (`<þing númer='158' …><tímabil>2026-2027</tímabil>`).
// Hæsta númerið er yfirstandandi þing. Fellur aftur á `fallback` ef veitan svarar ekki — betra að
// byggja á síðasta þekkta þingi en að hrynja, og fetchText hefur þá þegar reynt fjórum sinnum.
let _thingCache = null;
async function nuverandiThing(opts = {}) {
  const { fallback = null, logger = console } = opts;
  if (_thingCache) return _thingCache;
  try {
    const xml = await fetchText('https://www.althingi.is/altext/xml/loggjafarthing/', opts);
    const nr = (xml.match(/<þing\s+númer='(\d+)'/g) || [])
      .map((m) => +m.replace(/\D/g, '')).filter(Boolean);
    if (!nr.length) throw new Error('ekkert þingnúmer í svari');
    _thingCache = Math.max(...nr);
    logger.log('  löggjafarþing: ' + _thingCache);
    return _thingCache;
  } catch (e) {
    if (fallback) { logger.log('⚠ SEIGLA þingnúmer: ' + e.message + ' — nota fallback ' + fallback); return fallback; }
    throw e;
  }
}

// ── thingListi() ────────────────────────────────────────────────────────────
// Skilar [núverandi, næstliðið] löggjafarþingi — t.d. [158, 157].
//
// Af hverju BÆÐI: gögn um ATHAFNIR (mál, atkvæði, ræður) safnast upp yfir þingið. Nýtt þing er
// nær tómt fyrstu vikurnar — 9.9.2026 hafði 158. þing 1 mál á móti 1.070 hjá 157.
//   · aðeins núverandi  → /thingmal/ tæmist og öll atkvæðasaga hverfur
//   · aðeins næstliðið  → ný mál birtast aldrei (fjárlagafrumvarpið sjálft hefði ekki sést)
// Sameining gefur hvort tveggja: nýtt efni um leið og það kemur, og söguna óskerta.
//
// ⚠ Á EKKI við um SKIPAN (þingmenn, nefndir, ráðherrar) — þar er aðeins núverandi þing rétt,
//   annars birtust þingmenn sem eru hættir. Notið nuverandiThing() fyrir þau.
async function thingListi(opts = {}) {
  const nu = await nuverandiThing(opts);
  return [nu, nu - 1];
}

// ── kjortimabilThing() ──────────────────────────────────────────────────────
// Skilar ÖLLU yfirstandandi kjörtímabili — t.d. { thing: [156,157,158], fra: 156, til: 158 }.
//
// Af hverju heilt kjörtímabil (Aron, 12.9.2026): hollusta, uppreisnar-atkvæði og mæting yfir
// EITT þing eru hávaðasöm — 158. þing hafði 0 nafnaköll fyrstu vikuna. Kjörtímabilið er sú
// eining sem kjósandi og fréttamaður hugsa í, og hún gefur nógu marga mælipunkta.
//
// ⚠ Upphafsþingið er LESIÐ ÚR gogn/kjortimabil.json, ekki leitt af API-inu — Alþingi birtir
//   ekkert kjörtímabils-hugtak og bæði merkin sem voru prófuð brugðust (sjá skrána sjálfa).
//   Talan er birt á skýrslunni svo skekkja sjáist; hún má ekki verða falin fastayrðing.
async function kjortimabilThing(opts = {}) {
  const nu = await nuverandiThing(opts);
  const cfg = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'gogn', 'kjortimabil.json'), 'utf8'));
  const fra = +cfg.fra;
  if (!(fra > 0) || fra > nu) {
    throw new Error(`kjortimabil.json: fra=${cfg.fra} gengur ekki upp á móti yfirstandandi þingi ${nu}`);
  }
  const thing = [];
  for (let t = fra; t <= nu; t++) thing.push(t);
  (opts.logger || console).log(`  kjörtímabil: þing ${fra}–${nu} (kosningar ${cfg.kosningar})`);
  return { thing, fra, til: nu, kosningar: cfg.kosningar };
}

module.exports = { loadPrev, fetchText, writeJsonUnlessEmpty, nuverandiThing, thingListi, kjortimabilThing };
