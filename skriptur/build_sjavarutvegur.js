// build_sjavarutvegur.js — Sjávarútvegs-síðan (/atvinnuvegir/sjavarutvegur/) — LANDSYFIRLIT úr per-skip gögnum.
//
// ⚠ ENDUR-ARKITEKTÚR 2026-07-09: gamli Gagnavefs-Azure-bakendinn (gagnavefur-api-…azurewebsites.net)
//   er DAUÐUR (404). Hann skilaði landssamtölum (Aflastodulisti/FrontPageData) beint. Nýja opna
//   island.is-gáttin (fiskistofaGetShipStatusForTimePeriod) hefur AÐEINS per-skip fyrirspurnir, svo
//   landsyfirlitið er nú BYGGT UPP úr flotanum: flotavísir (skip_owners.json) → per skip aflamark →
//   samlagt per tegund á landsvísu. Sjá memory/iceland-fiskistofa-api.md (GEGNUMBROT-kaflinn).
//
// Flæði:
//   1) skip_owners.json (byKt, lögaðila-skip) → afmörkuð skipnr + regno→nafn.
//   2) per skip: island.is fiskistofaGetShipStatusForTimePeriod(shipNumber, timePeriod="2526")
//      → catchQuotaCategories { id name allocation catchQuota catch status }.
//   3) samlagt per tegund (nafn/id): aflamark(=catchQuota), afli(=catch), staða(=status), úthlutað(=allocation).
//      nýting = afli/aflamark; þjöppun top10pct = hlutdeild 10 stærstu skipa í aflamarki; topp-15 kvótahafar.
//   4) featured = stærstu stofnar (hero-spjöld).  → gogn/sjavarutvegur.json (+ web/public/gogn afrit).
//
// ⚠ SVIÐ (samræmt worker.kvotiHandler, worker.js:984): aflamark=catchQuota (eftir millifærslur), afli=catch,
//   staða=status, úthlutað=allocation. id===0 / "Þorskígildi" = samtala í þorskígildum → SLEPPT úr tegundum.
// ⚠ EKKI operationName (nafnlaus fyrirspurn → annars 400). timePeriod="2526" (fiskveiðiár 2025/26).
// ⚠ ÞEKKING: flotavísirinn nær aðeins LÖGAÐILA-skipum (kt 41–71). Krókaaflamark einstaklinga-báta er því
//   vantalið → aflamark botnfisks lítillega vanmetið og þjöppun lítillega ofmetin fyrir strandtegundir.
//   (Skýrt í `coverage`.) island.is throttlar stórar sprengjur → lotur af CONC með töf á milli.
//
// KEYRSLA:  node skriptur/build_sjavarutvegur.js            (fullur floti, ~8-12 mín, 1×/dag í CI)
//   prófun: LIMIT=200 node skriptur/build_sjavarutvegur.js  (fyrstu 200 skip — sannreynir form, ekki landstölur)
//   stillanlegt: CONC=5, DELAY=400 (ms milli lota), TIMABIL=2526

const fs = require('fs');
const path = require('path');

const GQL = 'https://island.is/api/graphql';
const IDX = path.join(__dirname, '..', 'web', 'public', 'gogn', 'skip_owners.json');
const OUT = [path.join(__dirname, '..', 'gogn'), path.join(__dirname, '..', 'web', 'public', 'gogn')];
const CONC = +process.env.CONC || 5;            // samhliða köll per lotu (island.is throttlar — hóflegt)
const DELAY = +process.env.DELAY || 400;        // ms milli lota — stöðug töf heldur okkur undir throttle-mörkum
const LIMIT = +process.env.LIMIT || 0;          // >0 = prófun: aðeins fyrstu N skip
const MIN_T = 300;                              // tegund kemst á síðuna ef landsaflamark ≥ 300 t (síar smá-hjáveiði)
const MIN_KG = MIN_T * 1000;

// mirror worker.AFLA_Q + shipInformation (staðfest gilt svið í probe)
const AFLA_Q = 'query($input: FiskistofaGetShipStatusForTimePeriodInput!){ fiskistofaGetShipStatusForTimePeriod(input:$input){ fiskistofaShipStatus { shipInformation { name shipNumber } catchQuotaCategories { id name allocation catchQuota catch status } } } }';
const UA = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (n) => Math.round(n * 10) / 10;                          // 1 aukastafur
const clean = (l) => String(l || '').replace(/^\d+\s+/, '').trim(); // strípa hugsanlegt númera-forskeyti

// fiskveiðiár → "2526" (hefst 1. sept) — samræmt worker.fiskveidiTimabil()
function fiskveidiTimabil() {
  const d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const s = m >= 8 ? y : y - 1;
  return String(s % 100).padStart(2, '0') + String((s + 1) % 100).padStart(2, '0');
}

// per skip: island.is → catchQuotaCategories (+ nafn). null = mistókst (aðgreint frá tómu).
async function fetchShip(regno, timabil, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(GQL, { method: 'POST', headers: UA, body: JSON.stringify({ query: AFLA_Q, variables: { input: { shipNumber: regno, timePeriod: timabil } } }) });
      if (r.status === 405 || r.status === 429 || r.status >= 500) { await wait(900 * (t + 1)); continue; }
      const j = await r.json().catch(() => null);
      if (j && j.errors) { await wait(900 * (t + 1)); continue; }  // t.d. tímabundið "Internal server error"
      const st = j && j.data && j.data.fiskistofaGetShipStatusForTimePeriod && j.data.fiskistofaGetShipStatusForTimePeriod.fiskistofaShipStatus;
      if (!st) return { cats: [], name: null };
      return { cats: st.catchQuotaCategories || [], name: (st.shipInformation && st.shipInformation.name) || null };
    } catch (e) { await wait(800 * (t + 1)); }
  }
  return null;
}

(async () => {
  const timabil = process.env.TIMABIL || fiskveidiTimabil();
  console.log('fiskveiðiár:', timabil, '| CONC:', CONC, '| DELAY:', DELAY, LIMIT ? '| LIMIT ' + LIMIT + ' (PRÓFUN)' : '');

  // 1) flotavísir → afmörkuð skipnr + regno→nafn (úr skip_owners.json)
  if (!fs.existsSync(IDX)) throw new Error('skip_owners.json vantar (' + IDX + ') — keyrðu build_skip_owners.mjs fyrst');
  const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const nameByRegno = {};
  const regset = new Set();
  for (const kt of Object.keys(idx.byKt || {})) for (const s of idx.byKt[kt]) { regset.add(s.regno); if (s.nafn && !nameByRegno[s.regno]) nameByRegno[s.regno] = s.nafn; }
  let regnos = [...regset].sort((a, b) => a - b);
  if (LIMIT) regnos = regnos.slice(0, LIMIT);
  console.log('skip í flotavísi:', regset.size, LIMIT ? '→ sæki ' + regnos.length : '');

  // 2) per skip → samlagt per tegund (id). agg[key] = { id, nafn, aflamark, afli, stada, uthlutad, ships[] }
  const agg = {};
  let ok = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < regnos.length; i += CONC) {
    const batch = regnos.slice(i, i + CONC);
    const res = await Promise.all(batch.map((n) => fetchShip(n, timabil).then((r) => [n, r])));
    for (const [regno, r] of res) {
      if (r === null) { fail++; continue; }
      ok++;
      const skip = r.name || nameByRegno[regno] || ('Skip ' + regno);
      for (const c of (r.cats || [])) {
        if (c.id === 0 || /Þorskígildi/i.test(c.name || '')) continue;   // þorskígildis-samtala, ekki raun-tegund
        const aflamark = +c.catchQuota || 0, afli = +c.catch || 0;
        if (aflamark <= 0 && afli <= 0) continue;                        // skip á enga heimild/afla í tegundinni
        const key = (c.id != null ? 'i' + c.id : 'n' + clean(c.name));
        const a = agg[key] || (agg[key] = { id: c.id, nafn: clean(c.name), aflamark: 0, afli: 0, stada: 0, uthlutad: 0, ships: [] });
        a.aflamark += aflamark; a.afli += afli; a.stada += (+c.status || 0); a.uthlutad += (+c.allocation || 0);
        a.ships.push({ skip, regno, aflamark, afli });
      }
    }
    if (i % (CONC * 60) === 0 && i) console.log('  ..' + i + '/' + regnos.length + ' skip (' + ok + ' í lagi, ' + fail + ' mistök, ' + Object.keys(agg).length + ' tegundir)');
    if (i + CONC < regnos.length) await wait(DELAY);   // töf milli lota (nema síðasta)
  }
  console.log('sótt:', ok, 'skip í lagi ·', fail, 'mistök · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (!LIMIT && ok < 500) throw new Error('Grunsamlega fá skip sótt (' + ok + ') — hætti, yfirskrifa ekki góð gögn (throttle?)');

  // 3) tegundir → landstölur + nýting + þjöppun + topp-kvótahafar
  const all = Object.values(agg).map((a) => {
    const ships = a.ships.filter((s) => s.aflamark > 0).sort((x, y) => y.aflamark - x.aflamark);
    const top10 = ships.slice(0, 10).reduce((s, x) => s + x.aflamark, 0);
    const nSkip = a.ships.filter((s) => s.aflamark > 0 || s.afli > 0).length;
    return {
      fteg: a.id, nafn: a.nafn,
      aflamark: a.aflamark, afli: a.afli, stada: a.stada, uthlutad: a.uthlutad,
      nyting: a.aflamark ? r1((a.afli / a.aflamark) * 100) : 0,
      nSkip, top10pct: a.aflamark ? r1((top10 / a.aflamark) * 100) : 0,
      top: ships.slice(0, 15).map((x) => ({ skip: x.skip, fl: null, aflamark: x.aflamark, afli: x.afli, pct: a.aflamark ? r1((x.aflamark / a.aflamark) * 100) : 0 })),
    };
  });

  // tegundir á síðuna: landsaflamark ≥ þröskuldur (síar smá-hjáveiði/rugl), raðað eftir aflamarki
  const species = all.filter((s) => s.aflamark >= MIN_KG).sort((a, b) => b.aflamark - a.aflamark);
  console.log('tegundir alls:', all.length, '→ á síðu (≥' + MIN_T + ' t):', species.length);

  // 4) featured (hero) — Þorskur fyrst (ef til), svo stærstu eftir aflamarki, alls 4. afli/kvóti í ÞÚS. TONNA.
  const sevOf = (p) => (p >= 95 ? 'critical' : p >= 80 ? 'warning' : 'normal');
  const featOrder = [...species].sort((a, b) => b.aflamark - a.aflamark);
  const thorsk = featOrder.find((s) => /^Þorskur$/i.test(s.nafn));
  const featSp = [];
  if (thorsk) featSp.push(thorsk);
  for (const s of featOrder) { if (featSp.length >= 4) break; if (s !== thorsk) featSp.push(s); }
  const featured = featSp.map((s) => {
    const pct = s.aflamark ? Math.round((s.afli / s.aflamark) * 100) : 0;
    return { species: s.nafn, afli: Math.round(s.afli / 1e6), kvoti: Math.round(s.aflamark / 1e6), pct, severity: sevOf(pct) };
  });

  const out = {
    updated: new Date().toISOString(),
    timabil,
    timabilLabel: timabil.replace(/(\d\d)(\d\d)/, '20$1/20$2'),
    source: 'Fiskistofa um opnu island.is-gáttina (fiskistofaGetShipStatusForTimePeriod, per skip) — samlagt úr flotavísi',
    coverage: 'Lögaðila-skip úr flotavísi (' + ok + ' skip sótt). Krókaaflamark einstaklinga-báta ekki meðtalið.',
    nSkip: ok, nFail: fail,
    featured, species,
  };
  const s = JSON.stringify(out);
  const target = LIMIT ? [OUT[0]] : OUT;   // í prófun (LIMIT) → aðeins gogn/ (ekki menga runtime-afritið með hlutamengi)
  target.forEach((dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'sjavarutvegur.json'), s); });
  console.log('\nsjavarutvegur.json:', species.length, 'tegundir · featured', featured.map((f) => f.species).join('/'), '·', (s.length / 1024).toFixed(0), 'KB', LIMIT ? '(PRÓFUN → aðeins gogn/)' : '');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
