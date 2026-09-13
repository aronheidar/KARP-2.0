#!/usr/bin/env node
// build_ivilnanir.mjs — vaktar forsendur ívilnana-skrárinnar → gogn/ivilnanir_vakt.json
//
// Af hverju VAKT en ekki framleiðandi (13.9.2026): `gogn/ivilnanir.json` er RITSTÝRÐ. Engin veita
// listar „allar ívilnanir ríkisins" — hver færsla er mannlegt mat á því hvað telst ívilnun og
// hvernig hún er orðuð. Skript sem þættist búa listann til myndi skálda hann. En forsendurnar
// ERU vélrænar, og það var raunverulega gatið: skráin bar dagsetninguna 2026-07-02 fram í september.
//
// Skriptið athugar fernt og SKRIFAR ALDREI í ritstýrðu skrána:
//   1. Standa lögin sem vitnað er í enn í gildandi lagasafni?           (althingi.is/lagas/nuna/)
//   2. Hefur þeim verið breytt síðan síðast var athugað?                (Stjórnartíðindi, A-deild)
//   3. Er skráin sjálfri sér samkvæm? (virk færsla með liðnu lokaári …) (hrein próf, engin köll)
//   4. Hafa ný stuðningslög verið birt sem gætu átt heima í skránni?    (tillögur til yfirferðar)
//
// ⚠ Það LAGAR ekkert sjálfkrafa. „Virk færsla með lokaárið 2025" gæti verið útrunnin — eða
//   framlengd án þess að `til` væri uppfært. Vélin veit ekki hvort; hún bendir, Aron sker úr.
//   Sjálfvirk leiðrétting hér myndi búa til rangar fullyrðingar á síðu sem fólk treystir.
//
// Keyrsla: node skriptur/build_ivilnanir.mjs [--fra 2026-01-01]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  ollLog, lagaSlod, lagaMerki, innraProf, erKandidat, snertirLog, reglugerdaTilvisanir,
  lagaVisir, titilTafla, normTitill,
} from './lib/ivilnanir.mjs';

const require = createRequire(import.meta.url);
const { writeJsonUnlessEmpty, loadPrev } = require('./_seigla.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKRA = path.join(__dirname, '..', 'gogn', 'ivilnanir.json');
const UT = path.join(__dirname, '..', 'gogn', 'ivilnanir_vakt.json');

const GQL = 'https://island.is/api/graphql';
const UA = 'Mozilla/5.0 (KARP ivilnana-vakt; +https://karp.is)';
const BID_MS = 400;          // hógvær töf milli Alþingis-kalla (429 hefur sést, sjá _seigla.js)
// ⚠ FASTUR gluggi, ekki „síðan síðast var athugað". Vikulegur þrepaglugga-lestur þýddi að ábending
// sem enginn læsi þá vikuna hyrfi af síðunni að eilífu. Lesandi vill lika vita að lögunum var breytt
// í vor, ekki bara í gær. Kostnadurinn er sá sami — ein fyrirspurn hvort sem er.
const GLUGGI_DAGAR = 365;

const iso = (d) => d.toISOString().slice(0, 10);
const bid = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sækir lagatexta og greinir Á MILLI þess að lögin séu fallin úr gildi og að veitan svari ekki.
 * ⚠ Þetta er kjarninn í heiðarleika skriptsins: 404 = fallin, net-villa = ÓVISS.
 *   Ef við létum villu þýða „fallin" myndi ein léleg nettenging merkja öll lögin brottfallin.
 */
async function sakjaLog(url, { reynt = 0 } = {}) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (r.status === 404) return { stada: 'fallin' };
    if (r.ok) {
      const heiti = (await r.text()).match(/<title>([^<]*)<\/title>/i);
      return { stada: 'i-gildi', heiti: heiti ? heiti[1].split('|')[0].trim() : null };
    }
    if (reynt < 2) { await bid(2000 * (reynt + 1)); return sakjaLog(url, { reynt: reynt + 1 }); }
    return { stada: 'oviss', skyring: 'HTTP ' + r.status };
  } catch (e) {
    if (reynt < 2) { await bid(2000 * (reynt + 1)); return sakjaLog(url, { reynt: reynt + 1 }); }
    return { stada: 'oviss', skyring: e.message };
  }
}

/** Stjórnartíðindi um opna island.is GraphQL-ið. Sjá memory/iceland-stjornartidindi-leit.md. */
async function stjornartidindi(dateFrom, dateTo) {
  const Q = 'query($input: OfficialJournalOfIcelandAdvertsInput!){ officialJournalOfIcelandAdverts(input:$input){ adverts { id title publicationDate department { title } } paging { totalPages } } }';
  const allt = [];
  for (let p = 1; p <= 10; p++) {
    const r = await fetch(GQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query: Q, variables: { input: { dateFrom, dateTo, page: p, pageSize: 100 } } }),
      signal: AbortSignal.timeout(40000),
    });
    const j = await r.json().catch(() => null);
    if (!j || j.errors) throw new Error('Stjórnartíðindi: ' + JSON.stringify((j && j.errors) || 'ekkert svar').slice(0, 200));
    const d = j.data.officialJournalOfIcelandAdverts;
    allt.push(...(d.adverts || []));
    if (p >= ((d.paging && d.paging.totalPages) || 1)) break;
    await bid(150);
  }
  // ⚠ Aðeins A-deild ber lög. B-deild (reglugerðir) og C-deild myndu drekkja niðurstöðunni.
  return allt.filter((a) => /A\s*deild/i.test((a.department && a.department.title) || ''));
}

(async () => {
  const faerslur = JSON.parse(fs.readFileSync(SKRA, 'utf8'));
  if (!Array.isArray(faerslur) || !faerslur.length) throw new Error('gogn/ivilnanir.json er tóm eða ekki fylki');
  const nu = new Date();
  const nuAr = nu.getUTCFullYear();

  const fraArg = (process.argv.find((a) => a.startsWith('--fra=')) || '').slice(6);
  const fyrri = loadPrev(UT);
  const leitadFra = fraArg || iso(new Date(nu.getTime() - GLUGGI_DAGAR * 86400000));

  console.log(`ívilnana-vakt: ${faerslur.length} færslur, leita breytinga frá ${leitadFra}`);

  // 1) Innri samkvæmni — engin net-köll, bregst aldrei.
  const adfinnslur = faerslur.flatMap((f) => innraProf(f, nuAr));

  // 2) Standa lögin enn?
  const log = ollLog(faerslur);
  console.log(`  ${log.length} einkvæm lög í heimildum`);
  const logStada = [];
  for (const l of log) {
    const r = await sakjaLog(lagaSlod(l.nr, l.ar));
    logStada.push({ ...l, ...r });
    if (r.stada === 'fallin') {
      const snert = faerslur.filter((f) => (f.heimild || '').includes(lagaMerki(l))).map((f) => f.nafn);
      adfinnslur.push({
        tegund: 'heimild-fallin', nafn: snert.join(', ') || '(engin færsla)',
        skyring: `${lagaMerki(l)} er ekki lengur í gildandi lagasafni`,
      });
    }
    await bid(BID_MS);
  }
  const oviss = logStada.filter((l) => l.stada === 'oviss').length;

  // Lagasafns-vísirinn gefur kandídötum laganúmer. ⚠ ÁN hans endurtekur vaktin sömu tillöguna
  // í hverri viku þótt Aron hafi brugðist við henni — titill nýrra laga ber ekki eigið númer,
  // svo snertirLog nær þeim aldrei. Vakt sem hreinsast ekki er vakt sem enginn les.
  let tafla = new Map();
  try {
    const v = await fetch('https://www.althingi.is/lagasafn/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(40000) });
    if (v.ok) tafla = titilTafla(lagaVisir(await v.text()));
    console.log(`  lagasafns-vísir: ${tafla.size} lög`);
  } catch (e) {
    console.log('⚠ náði ekki lagasafns-vísi (' + e.message + ') — kandídatar bera ekki laganúmer í þetta sinn');
  }
  const vitnadI = new Set(log.map((l) => `${l.nr}/${l.ar}`));

  // 3+4) Breytingar á lögunum okkar, og ný stuðningslög sem gætu vantað.
  let breytingar = [];
  let kandidatar = [];
  let leitStod = true;
  try {
    const nyjar = await stjornartidindi(leitadFra, iso(new Date(nu.getTime() + 86400000)));
    console.log(`  ${nyjar.length} auglýsingar í A-deild á tímabilinu`);
    for (const a of nyjar) {
      const titill = (a.title || '').replace(/\s+/g, ' ').trim();
      const dags = (a.publicationDate || '').slice(0, 10);
      const snert = snertirLog(titill, log);
      if (snert.length) { breytingar.push({ dags, titill, snertir: snert.map(lagaMerki) }); continue; }
      if (!erKandidat(titill)) continue;
      const nyLog = tafla.get(normTitill(titill));
      // Vitnum við þegar í þessi lög? Þá er tillagan afgreidd — sleppum henni.
      if (nyLog && vitnadI.has(`${nyLog.nr}/${nyLog.ar}`)) continue;
      kandidatar.push({ dags, titill, log: nyLog ? lagaMerki(nyLog) : null });
    }
  } catch (e) {
    leitStod = false;
    console.log('⚠ ' + e.message + ' — held fyrri breytingum/kandídötum óbreyttum');
    breytingar = (fyrri && fyrri.breytingar) || [];
    kandidatar = (fyrri && fyrri.kandidatar) || [];
  }

  const gogn = {
    // athugad = hvenaer forsendurnar voru síðast staðfestar (síðan birtir það). Fari leitin í vaskinn
    // stendur fyrri dagsetning — síðan má ekki segjast hafa staðfest í dag það sem brást.
    athugad: leitStod ? iso(nu) : ((fyrri && fyrri.athugad) || iso(nu)),
    keyrt: iso(nu),
    nFaerslur: faerslur.length,
    nLog: log.length,
    nReglugerdir: new Set(faerslur.flatMap((f) => reglugerdaTilvisanir(f.heimild).map((r) => `${r.nr}/${r.ar}`))).size,
    leitadFra,
    leitStod,
    log: logStada,
    adfinnslur,
    breytingar: breytingar.sort((a, b) => (a.dags < b.dags ? 1 : -1)),
    kandidatar: kandidatar.sort((a, b) => (a.dags < b.dags ? 1 : -1)),
  };

  // Seigla: ef ÖLL lög eru óviss er lagasafnið niðri — ekki skrifa yfir góða fyrri mælingu.
  const isEmpty = (d) => !d || !Array.isArray(d.log) || !d.log.length || d.log.every((l) => l.stada === 'oviss');
  const { kept } = writeJsonUnlessEmpty(UT, gogn, { isEmpty, label: 'ivilnanir_vakt.json' });

  console.log(kept ? '⚠ fyrri vakt haldið' : `skrifað ${path.relative(process.cwd(), UT)}`);
  console.log(`  lög: ${logStada.filter((l) => l.stada === 'i-gildi').length} í gildi · ` +
    `${logStada.filter((l) => l.stada === 'fallin').length} fallin · ${oviss} óviss`);
  console.log(`  aðfinnslur: ${adfinnslur.length} · breytingar: ${breytingar.length} · kandídatar: ${kandidatar.length}`);
  for (const a of adfinnslur) console.log(`   ⚠ [${a.tegund}] ${a.nafn}: ${a.skyring}`);
  for (const b of breytingar.slice(0, 10)) console.log(`   ↻ ${b.dags} ${b.snertir.join(' ')} — ${b.titill.slice(0, 110)}`);
  for (const k of kandidatar.slice(0, 10)) console.log(`   + ${k.dags} ${k.log ? k.log + " " : ""}${k.titill.slice(0, 100)}`);
})().catch((e) => { console.error('ívilnana-vakt BRAST:', e.message); process.exit(1); });
