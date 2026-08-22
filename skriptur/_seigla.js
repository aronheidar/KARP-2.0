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

module.exports = { loadPrev, fetchText, writeJsonUnlessEmpty };
