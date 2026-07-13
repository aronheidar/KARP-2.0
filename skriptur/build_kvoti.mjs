#!/usr/bin/env node
// build_kvoti.mjs — Kvótavaktin: aflamark ALLS flotans samlagt per útgerð (lögaðila) + samþjöppunar-tölfræði.
// Uppspretta: island.is/api/graphql fiskistofaGetShipStatusForTimePeriod (OPIÐ, óauðkennt, ENGIN operationName)
// — sama fyrirspurn og kvotiHandler í web/worker.js (AFLA_Q afrituð orðrétt þaðan).
// Inntak: web/public/gogn/skip_owners.json (byKt: kt → skip; AÐEINS lögaðilar 41–71) → öfugt: regno → eigendur.
// Flokkur id===0 / „Þorskígildi“ = SAMTALA skips í þorskígildum (Fiskistofa reiknar) — notuð sem aðal-mælikvarði.
// Skipting á útgerðir: kg × (hlutur/100). ⚠ hlutur er ALDREI null í skipaskrá heldur 0 þegar óskráður
// (727 skip af 2510 með alla hluti =0) → ef enginn eigandi með hlutur>0 → jöfn skipting.
// Ef Σhlutur < 100 (t.d. einstaklingur á afganginn, 23 skip) fer afgangurinn í „adrir_kg“ (heildar-nefnarinn
// heldur samt ÖLLU aflamarki skipsins). PII: byKt er þegar aðeins lögaðilar → engir einstaklingar í úttakinu.
// KVOTI_LIMIT=50 → smoke-test (aðeins fyrstu N skip). Sjá memory/iceland-fiskistofa-api.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INN = path.join(__dirname, '..', 'web', 'public', 'gogn', 'skip_owners.json');
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'kvoti.json');
const GQL = 'https://island.is/api/graphql';
const UA = { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };
const CONC = 8;                       // hófleg samhliðni — sama og kvotiHandler (island.is throttlar stórar sprengjur)
// ⚠ Orðrétt úr web/worker.js (AFLA_Q) — ekki breyta án þess að breyta þar líka.
const AFLA_Q = 'query($input: FiskistofaGetShipStatusForTimePeriodInput!){ fiskistofaGetShipStatusForTimePeriod(input:$input){ fiskistofaShipStatus { catchQuotaCategories { id name allocation catchQuota catch status } } } }';

function fiskveidiTimabil() {
  const d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth();   // fiskveiðiár hefst 1. sept
  const s = m >= 8 ? y : y - 1;
  return String(s % 100).padStart(2, '0') + String((s + 1) % 100).padStart(2, '0');
}
const sofa = (ms) => new Promise((s) => setTimeout(s, ms));
const pct2 = (x) => +x.toFixed(2);

// Skilar catchQuotaCategories-fylki ([] = skip án aflamarks) eða null = mistókst (aðgreint f. talningu).
async function fetchAflamark(regno, timabil, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(GQL, { method: 'POST', headers: UA, body: JSON.stringify({ query: AFLA_Q, variables: { input: { shipNumber: regno, timePeriod: timabil } } }) });
      if (r.status === 405 || r.status === 429) { await sofa(1500 * (t + 1)); continue; }
      if (!r.ok) { await sofa(800 * (t + 1)); continue; }
      const j = await r.json().catch(() => null);
      if (!j || j.data === undefined) { await sofa(800 * (t + 1)); continue; }   // GraphQL-villa → reyna aftur
      const st = j.data && j.data.fiskistofaGetShipStatusForTimePeriod && j.data.fiskistofaGetShipStatusForTimePeriod.fiskistofaShipStatus;
      return (st && st.catchQuotaCategories) || [];
    } catch (e) { await sofa(800 * (t + 1)); }
  }
  return null;
}

(async () => {
  const inn = JSON.parse(fs.readFileSync(INN, 'utf8'));
  const nofn = inn.nofn || {};
  // Öfugt kort: regno → [{kt, hlutur}] + skipsnafn (byKt er þegar afmáð tvítekt per kt)
  const rev = {}, skipNafn = {};
  for (const [kt, ships] of Object.entries(inn.byKt || {})) {
    for (const s of ships) {
      (rev[s.regno] = rev[s.regno] || []).push({ kt, hlutur: s.hlutur });
      if (s.nafn && !skipNafn[s.regno]) skipNafn[s.regno] = s.nafn;
    }
  }
  let regnos = Object.keys(rev).map(Number).sort((a, b) => a - b);
  const LIMIT = +(process.env.KVOTI_LIMIT || 0);
  if (LIMIT > 0) {   // smoke-test: jafndreift úrtak yfir ALLT bilið (lág regno eru mest kvótalausar smábátar)
    const stride = Math.max(1, Math.floor(regnos.length / LIMIT));
    regnos = regnos.filter((_, i) => i % stride === 0).slice(0, LIMIT);
    console.log('⚠ KVOTI_LIMIT=' + LIMIT + ' — smoke-test, jafndreift úrtak');
  }
  console.log('kvoti: ' + regnos.length + ' skip í flotavísi, tímabil ' + fiskveidiTimabil());

  const timabil = fiskveidiTimabil();
  const hafar = new Map();      // kt → { ti, teg:Map(nafn→kg), skip:[{regno,nafn,ti}] }
  const tegundir = new Map();   // nafn → { heild, hafar:Map(kt→kg) }
  let heildTi = 0, adrirTi = 0, nSkipMed = 0, tom = 0, fails = 0, done = 0, next = 200;
  const t0 = Date.now();

  for (let i = 0; i < regnos.length; i += CONC) {
    const batch = regnos.slice(i, i + CONC);
    const res = await Promise.all(batch.map((n) => fetchAflamark(n, timabil).then((c) => [n, c])));
    for (const [regno, cats] of res) {
      done++;
      if (cats === null) { fails++; continue; }
      // Per skip: ti = þorskígildis-samtala (id===0), teg = hinir flokkarnir (sleppa 0-aflamarki)
      let ti = 0; const teg = [];
      for (const c of cats) {
        const kg = +c.catchQuota || 0;
        if (c.id === 0 || /Þorskígildi/i.test(c.name || '')) ti += kg;
        else if (kg > 0) teg.push([c.name, kg]);
      }
      if (ti <= 0 && !teg.length) { tom++; continue; }   // skip án aflamarks á tímabilinu
      nSkipMed++;
      // Skipting: hlutur>0 → hlutur/100 (afgangur → adrir); annars jöfn skipting milli lögaðila-eigenda
      const os = rev[regno];
      let sumH = 0; for (const o of os) if (+o.hlutur > 0) sumH += +o.hlutur;
      const shares = sumH > 0
        ? os.filter((o) => +o.hlutur > 0).map((o) => ({ kt: o.kt, frac: +o.hlutur / 100 }))
        : os.map((o) => ({ kt: o.kt, frac: 1 / os.length }));
      const leftover = Math.max(0, 1 - shares.reduce((a, s) => a + s.frac, 0));
      heildTi += ti; adrirTi += ti * leftover;
      for (const s of shares) {
        let h = hafar.get(s.kt);
        if (!h) { h = { ti: 0, teg: new Map(), skip: [] }; hafar.set(s.kt, h); }
        h.ti += ti * s.frac;
        h.skip.push({ regno, nafn: skipNafn[regno] || null, ti: ti * s.frac });
        for (const [tn, kg] of teg) h.teg.set(tn, (h.teg.get(tn) || 0) + kg * s.frac);
      }
      for (const [tn, kg] of teg) {
        let t = tegundir.get(tn);
        if (!t) { t = { heild: 0, hafar: new Map() }; tegundir.set(tn, t); }
        t.heild += kg;   // heildar-nefnarinn fær ALLT kg skipsins (líka óeignaðan afgang)
        for (const s of shares) t.hafar.set(s.kt, (t.hafar.get(s.kt) || 0) + kg * s.frac);
      }
    }
    if (done >= next) { console.log('  ..' + done + '/' + regnos.length + ' skip (' + nSkipMed + ' m/aflamark, ' + hafar.size + ' hafar, ' + fails + ' mistök, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's)'); next += 200; }
  }
  if (!LIMIT && hafar.size < 100) throw new Error('Grunsamlega fáir hafar (' + hafar.size + ') — hætti án þess að skrifa (throttle?)');

  // ── Nafna-uppfylling: skip_owners.nofn nær aðeins hluta hafa — SKIPASKRÁIN sjálf ber eigenda-nöfn
  // (owners[].name í sama shipRegistryShipSearch-svari), svo við sækjum EITT skip vantandi hafa og
  // lesum nafnið þaðan. Án nafna er leit/tafla vörunnar hálf-blind (rýni-atriði #2). Villur → null (kt birt).
  const SKIP_Q = 'query($input: ShipRegistryShipSearchInput!){ shipRegistryShipSearch(input:$input){ ships{ regno owners{ name nationalId } } } }';
  const vantarNofn = [...hafar.entries()].filter(([kt]) => !nofn[kt]).map(([kt, h]) => [kt, (h.skip[0] || {}).regno]).filter(([, r]) => r);
  console.log('Nafna-uppfylling: ' + vantarNofn.length + ' af ' + hafar.size + ' hafa vantar nafn — les úr skipaskrá (eigenda-nöfn fylgja skipum)');
  for (let i = 0; i < vantarNofn.length; i += 5) {
    await Promise.all(vantarNofn.slice(i, i + 5).map(async ([kt, regno]) => {
      try {
        const r = await fetch(GQL, { method: 'POST', headers: UA, body: JSON.stringify({ query: SKIP_Q, variables: { input: { qs: String(regno) } } }) });
        const j = await r.json().catch(() => null);
        for (const ship of ((j && j.data && j.data.shipRegistryShipSearch && j.data.shipRegistryShipSearch.ships) || [])) {
          if (ship.regno !== regno) continue;
          for (const o of (ship.owners || [])) {
            if (String(o.nationalId || '').replace(/\D/g, '') === kt && o.name) { nofn[kt] = String(o.name).trim(); return; }
          }
        }
      } catch (e) {}
    }));
    if (i % 100 === 0 && i) console.log('  ..nöfn ' + i + '/' + vantarNofn.length);
    await sofa(150);
  }
  console.log('Nafna-uppfylling lokið: ' + [...hafar.keys()].filter((kt) => !nofn[kt]).length + ' enn án nafns');

  // ── Samlagning → úttaksform ──
  const hafArr = [...hafar.entries()]
    .map(([kt, h]) => ({ kt, nafn: nofn[kt] || null, ti: h.ti, teg: h.teg, skip: h.skip }))
    .sort((a, b) => b.ti - a.ti);
  const pctTi = (kg) => (heildTi > 0 ? pct2((kg / heildTi) * 100) : 0);
  const top10pct = pct2(hafArr.slice(0, 10).reduce((a, h) => a + h.ti, 0) / (heildTi || 1) * 100);
  const hhi = Math.round(hafArr.reduce((a, h) => a + Math.pow((h.ti / (heildTi || 1)) * 100, 2), 0));

  const tegArr = [...tegundir.entries()].sort((a, b) => b[1].heild - a[1].heild).slice(0, 25).map(([nafn, t]) => {
    const hs = [...t.hafar.entries()].filter(([, kg]) => kg > 0).sort((a, b) => b[1] - a[1]);
    return {
      nafn, heild_kg: Math.round(t.heild),
      top10pct: pct2(hs.slice(0, 10).reduce((a, [, kg]) => a + kg, 0) / t.heild * 100),
      hhi: Math.round(hs.reduce((a, [, kg]) => a + Math.pow((kg / t.heild) * 100, 2), 0)),   // Σ(pct²) yfir ALLA hafa
      top: hs.slice(0, 15).map(([kt, kg]) => ({ kt, nafn: nofn[kt] || null, kg: Math.round(kg), pct: pct2((kg / t.heild) * 100) })),
    };
  });

  const hafarUt = hafArr.slice(0, 150).map((h) => ({
    kt: h.kt, nafn: h.nafn, ti_kg: Math.round(h.ti), pct: pctTi(h.ti), nSkip: h.skip.length,
    skip: [...h.skip].sort((a, b) => b.ti - a.ti).slice(0, 8).map((s) => ({ regno: s.regno, nafn: s.nafn })),
    tegundir: [...h.teg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([tn, kg]) => ({ nafn: tn, kg: Math.round(kg), pct: tegundir.get(tn).heild > 0 ? pct2((kg / tegundir.get(tn).heild) * 100) : 0 })),
  }));

  const leit = {};   // ALLIR lögaðila-hafar (fyrir leitarbox) — létt form [nafn, ti_kg, pct]
  for (const h of hafArr) leit[h.kt] = [h.nafn, Math.round(h.ti), pctTi(h.ti)];

  // ── BREYTINGA-VAKT: bera saman við SÍÐUSTU keyrslu (áður en yfirskrifað) — kvótaflutningar/-tilfærslur
  // per útgerð (Δ þorskígildi + Δ hlutdeild), nýir hafar og horfnir. ⚠ Orðað „breytingar á aflamarki"
  // (ekki fullyrt „sala/kaup" — breyting getur verið flutningur, tilfærsla milli tímabila eða ný úthlutun).
  let breytingar = null;
  try {
    if (fs.existsSync(OUT)) {
      const fyrri = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      if (fyrri.leit && fyrri.uppfaert) {
        const deltas = [];
        for (const [kt, [nafn, ti, pct]] of Object.entries(leit)) {
          const f = fyrri.leit[kt];
          if (!f) { deltas.push({ kt, nafn, d_kg: Math.round(ti), d_pct: pct, nytt: true }); continue; }
          const d_kg = Math.round(ti - f[1]);
          if (Math.abs(d_kg) >= 1000) deltas.push({ kt, nafn, d_kg, d_pct: pct2(pct - f[2]) });   // ≥1 tonn telur
        }
        const horfnir = Object.entries(fyrri.leit)
          .filter(([kt]) => !leit[kt])
          .map(([kt, [nafn, ti]]) => ({ kt, nafn, d_kg: -Math.round(ti) }));
        deltas.sort((a, b) => Math.abs(b.d_kg) - Math.abs(a.d_kg));
        breytingar = {
          fra: fyrri.uppfaert, til: new Date().toISOString(),
          staerstu: deltas.slice(0, 25),
          horfnir: horfnir.slice(0, 15),
          n: deltas.length + horfnir.length,
        };
        console.log('Breytingar frá ' + fyrri.uppfaert.slice(0, 10) + ': ' + deltas.length + ' útgerðir m/breytingu ≥1t, ' + horfnir.length + ' horfnir');
      }
    }
  } catch (e) { console.log('Breytinga-samanburður sleppt:', e.message); }

  const arFmt = '20' + timabil.slice(0, 2) + '/20' + timabil.slice(2);   // '2526' → '2025/2026'
  const data = {
    uppfaert: new Date().toISOString(),
    timabil,
    heild: { ti_kg: Math.round(heildTi), nSkip: nSkipMed, nHafar: hafArr.length, adrir_kg: Math.round(adrirTi), top10pct, hhi },
    tegundir: tegArr,
    hafar: hafarUt,
    leit,
    breytingar,
    heimild: 'Fiskistofa — aflamark og þorskígildi fiskveiðiárið ' + arFmt + '; eigendur skipa úr skipaskrá island.is. Hlutdeild reiknuð af Karp (áætlun; eignarhlutur skips ræður skiptingu).',
  };
  fs.writeFileSync(OUT, JSON.stringify(data));

  // ── SÖGUÞRÓUN: viðauka-lína per keyrslu í kvoti_saga.json (samþjöppunar-tímaröð + hafa-snapshot).
  // Létt form (~10KB/viku): heildartölur + kt→ti_kg heiltölur. Knýr þróunar-línurit þegar ≥3 punktar.
  try {
    const SAGA = path.join(path.dirname(OUT), 'kvoti_saga.json');
    const saga = fs.existsSync(SAGA) ? JSON.parse(fs.readFileSync(SAGA, 'utf8')) : { punktar: [] };
    const dagur = new Date().toISOString().slice(0, 10);
    saga.punktar = saga.punktar.filter((p) => p.dags !== dagur);   // sama-dags endurkeyrsla yfirskrifar
    const hafKompakt = {};
    for (const h of hafArr) hafKompakt[h.kt] = Math.round(h.ti);
    saga.punktar.push({ dags: dagur, timabil, ti_kg: Math.round(heildTi), top10pct, hhi, nHafar: hafArr.length, hafar: hafKompakt });
    if (saga.punktar.length > 120) saga.punktar = saga.punktar.slice(-120);   // ~2,3 ár vikulega
    fs.writeFileSync(SAGA, JSON.stringify(saga));
    console.log('kvoti_saga.json: ' + saga.punktar.length + ' punktar');
  } catch (e) { console.log('Saga sleppt:', e.message); }
  console.log('kvoti.json | skip m/aflamark:', nSkipMed, '/', done, '| tóm:', tom, '| mistök:', fails, '| hafar:', hafArr.length,
    '| tegundir:', tegArr.length, '| ti-heild:', Math.round(heildTi / 1e6) + 'kt', '| top10:', top10pct + '%', '| HHI:', hhi,
    '| ' + ((Date.now() - t0) / 1000).toFixed(0) + 's | bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
