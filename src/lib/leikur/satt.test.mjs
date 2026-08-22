import { SATT_DEFAULT_LOTUR, SATT_VAL, SATT_FYLKI, SATT_FLOKKAR, SATT_TEXTI, sattLota, sattNormVal, sattUtkoma, applySatt } from './satt.mjs';
import { scoreRound } from './scoring.mjs';
import { mandateFor } from './game-config.mjs';
import { govtStability } from './flavor.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const r2 = (x) => Math.round(x * 100) / 100;

// ── Fastar ───────────────────────────────────────────────────────────────────────────────────────────────────────
ok('sjálfgefnar sáttar-lotur = KT3 + KT6', JSON.stringify(SATT_DEFAULT_LOTUR) === '[3,6]');
ok('tvö val með íslenskum textum', SATT_VAL.satt.key === 'satt' && SATT_VAL.saekja.key === 'saekja' && /Þjóðarsátt/.test(SATT_VAL.satt.label) && /Sækja fram/.test(SATT_VAL.saekja.label) && SATT_VAL.satt.blurb.length > 20 && SATT_VAL.saekja.blurb.length > 20);
ok('fjórir flokkar merktir', ['samvinna', 'svik', 'spirall', 'einn'].every((f) => SATT_FLOKKAR[f] && SATT_FLOKKAR[f].label));
ok('UI-textar til (karphús, ekki-valið, watch, results)', /Karphúsið er opið/.test(SATT_TEXTI.karphus) && /telst Sækja fram/.test(SATT_TEXTI.ekkiValid) && /lið velja/.test(SATT_TEXTI.watch) && /hvað gerðist/.test(SATT_TEXTI.results));
// ±30%-rammi utan um upphafstillögu hönnunar (samvinna −0,8/+0,3/+4 · svikari +1,2/+0,5/+5 · sogari +0,4/−2 · spírall +1,0/−3 · +0,5/−0,3)
const within = (x, base) => Math.abs(x - base) <= Math.abs(base) * 0.3 + 1e-9;
ok('SATT_FYLKI innan ±30% af tillögu', within(SATT_FYLKI.samvinna.verdbolga, -0.8) && within(SATT_FYLKI.samvinna.kaupmattur, 0.3) && within(SATT_FYLKI.samvinna.pop, 4)
  && within(SATT_FYLKI.svik.svikari.kaupmattur, 1.2) && within(SATT_FYLKI.svik.svikari.verdbolga, 0.5) && within(SATT_FYLKI.svik.svikari.pop, 5)
  && within(SATT_FYLKI.svik.sattLid.verdbolga, 0.4) && within(SATT_FYLKI.svik.sattLid.pop, -2)
  && within(SATT_FYLKI.spirall.allir.verdbolga, 1.0) && within(SATT_FYLKI.spirall.allir.pop, -3) && within(SATT_FYLKI.spirall.svikari.kaupmattur, 0.5) && within(SATT_FYLKI.spirall.sattLid.kaupmattur, -0.3));
ok('táknin rétt: samvinna lækkar verðbólgu, svikari hækkar eigin verðbólgu, sogari fær smit, spírall hjá öllum', SATT_FYLKI.samvinna.verdbolga < 0 && SATT_FYLKI.svik.svikari.verdbolga > 0 && SATT_FYLKI.svik.sattLid.verdbolga > 0 && SATT_FYLKI.spirall.allir.verdbolga > 0 && SATT_FYLKI.spirall.sattLid.kaupmattur < 0);

// ── sattLota ─────────────────────────────────────────────────────────────────────────────────────────────────────
ok('rofi slökktur → aldrei sáttar-lota', !sattLota(3, {}) && !sattLota(3, null) && !sattLota(3, { satt: false }) && !sattLota(6, { satt: 0 }));
ok('rofi kveiktur → KT3 og KT6 sjálfgefið, ekki aðrar', sattLota(3, { satt: true }) && sattLota(6, { satt: true }) && [1, 2, 4, 5, 7, 8].every((r) => !sattLota(r, { satt: true })));
ok('fac-lotusett úr config (fylki)', sattLota(2, { satt: true, sattLotur: [2, 7] }) && sattLota(7, { satt: true, sattLotur: [2, 7] }) && !sattLota(3, { satt: true, sattLotur: [2, 7] }));
ok('fac-lotusett úr config (strengur „4, 8")', sattLota(4, { satt: true, sattLotur: '4, 8' }) && sattLota(8, { satt: true, sattLotur: '4,8' }) && !sattLota(6, { satt: true, sattLotur: '4,8' }));
ok('tómt lotusett → aldrei; strengur „3" sem round virkar', !sattLota(3, { satt: true, sattLotur: [] }) && sattLota('3', { satt: true }));
ok('rusl í lotusetti síað', sattLota(3, { satt: true, sattLotur: ['x', 3, -1, 2.5] }) && !sattLota(2, { satt: true, sattLotur: ['x', 3, -1, 2.5] }));

// ── sattNormVal / null = saekja ──────────────────────────────────────────────────────────────────────────────────
ok('null/undefined/rusl = saekja, aðeins „satt" = satt', sattNormVal(null) === 'saekja' && sattNormVal(undefined) === 'saekja' && sattNormVal('') === 'saekja' && sattNormVal('SATT') === 'saekja' && sattNormVal('satt') === 'satt' && sattNormVal('saekja') === 'saekja');
{
  const u = sattUtkoma({ 1: 'satt', 2: null, 3: undefined });
  ok('null-val telst saekja í útkomu (k=1 af 3 → spírall)', u.k === 1 && u.n === 3 && u.flokkur === 'spirall' && u.perTeam[2].val === 'saekja' && u.perTeam[3].val === 'saekja' && u.perTeam[2].svikari === true && u.perTeam[1].svikari === false);
}

// ── Flokka-mörk ──────────────────────────────────────────────────────────────────────────────────────────────────
const mk = (n, k) => { const v = {}; for (let i = 1; i <= n; i++) v['t' + i] = i <= k ? 'satt' : 'saekja'; return v; };
ok('n=4,k=4 → samvinna', sattUtkoma(mk(4, 4)).flokkur === 'samvinna');
ok('n=4,k=3 → svik', sattUtkoma(mk(4, 3)).flokkur === 'svik');
ok('n=4,k=2 (nákvæmlega n/2) → svik', sattUtkoma(mk(4, 2)).flokkur === 'svik');
ok('n=4,k=1 → spírall', sattUtkoma(mk(4, 1)).flokkur === 'spirall');
ok('n=4,k=0 → spírall', sattUtkoma(mk(4, 0)).flokkur === 'spirall');
ok('n=2,k=1 → svik (k=n/2)', sattUtkoma(mk(2, 1)).flokkur === 'svik');
ok('n=3,k=2 → svik; k=1 → spírall', sattUtkoma(mk(3, 2)).flokkur === 'svik' && sattUtkoma(mk(3, 1)).flokkur === 'spirall');
ok('n=6,k=3 → svik; k=2 → spírall; k=6 → samvinna', sattUtkoma(mk(6, 3)).flokkur === 'svik' && sattUtkoma(mk(6, 2)).flokkur === 'spirall' && sattUtkoma(mk(6, 6)).flokkur === 'samvinna');
ok('k og n skilað rétt', (() => { const u = sattUtkoma(mk(6, 4)); return u.k === 4 && u.n === 6 && Object.keys(u.perTeam).length === 6; })());

// ── n=1 brúnir + n=0 ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const a = sattUtkoma({ 7: 'satt' }), b = sattUtkoma({ 7: 'saekja' }), c = sattUtkoma({ 7: null });
  ok('n=1 → flokkur einn', a.flokkur === 'einn' && b.flokkur === 'einn' && a.n === 1 && a.k === 1 && b.k === 0);
  ok('n=1 satt = samvinnu-bónus', JSON.stringify(a.perTeam[7].effect) === JSON.stringify(SATT_FYLKI.samvinna));
  ok('n=1 saekja = freisting m/ eigin verðbólgu (engin sogara-kostnaður)', b.perTeam[7].effect.kaupmattur === SATT_FYLKI.svik.svikari.kaupmattur && b.perTeam[7].effect.verdbolga > 0 && b.perTeam[7].effect.pop === SATT_FYLKI.svik.svikari.pop);
  ok('n=1 null = saekja', JSON.stringify(c.perTeam[7]) === JSON.stringify(b.perTeam[7]));
  ok('n=1 textar ólíkir eftir vali', a.texti !== b.texti && a.texti.length > 20 && b.texti.length > 20);
  const z = sattUtkoma({});
  ok('n=0 brotnar ekki', z.n === 0 && z.k === 0 && Object.keys(z.perTeam).length === 0);
  ok('null-inntak brotnar ekki', sattUtkoma(null).n === 0);
}

// ── Áhrif per flokk ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const u = sattUtkoma(mk(3, 3));
  ok('samvinna: allir fá sama bónus', ['t1', 't2', 't3'].every((t) => JSON.stringify(u.perTeam[t].effect) === JSON.stringify(SATT_FYLKI.samvinna)));
  const s = sattUtkoma(mk(3, 2));
  ok('svik: svikari fær freistingu, sáttar-lið smit', JSON.stringify(s.perTeam.t3.effect) === JSON.stringify(SATT_FYLKI.svik.svikari) && JSON.stringify(s.perTeam.t1.effect) === JSON.stringify(SATT_FYLKI.svik.sattLid) && s.perTeam.t1.effect.kaupmattur === undefined);
  const p = sattUtkoma(mk(3, 1));
  ok('spírall: allir verðbólga+pop, svikari +kaupm, sáttar-lið −kaupm', p.perTeam.t1.effect.verdbolga === 1.0 && p.perTeam.t2.effect.verdbolga === 1.0 && p.perTeam.t1.effect.pop === -3 && p.perTeam.t1.effect.kaupmattur === -0.3 && p.perTeam.t2.effect.kaupmattur === 0.5 && p.perTeam.t3.effect.kaupmattur === 0.5);
  ok('texti per flokk (íslenska, ein setning+)', /traust/i.test(u.texti) && /sóttu fram/.test(s.texti) && /spírall/i.test(p.texti));
  ok('svik-texti nefnir fjölda svikara', /1 af 3/.test(s.texti));
}

// ── applySatt ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const base = { verdbolga: 4, kaupmattur: 1.5, hagvoxtur: 2, atvinnuleysi: 4, skuldir: 40, losun: 100 };
  const r = applySatt(base, { verdbolga: -0.56, kaupmattur: 0.21, pop: 3 });
  ok('applySatt hreyfir aðeins tilgreinda KPI', r2(r.kpis.verdbolga) === 3.44 && r2(r.kpis.kaupmattur) === 1.71 && r.kpis.hagvoxtur === 2 && r.kpis.atvinnuleysi === 4 && r.kpis.skuldir === 40 && r.kpis.losun === 100);
  ok('applySatt skilar pop sér', r.pop === 3 && r.kpis.pop === undefined);
  ok('applySatt breytir ekki inntaki', base.verdbolga === 4 && base.kaupmattur === 1.5);
  ok('applySatt: KPI sem vantar er ekki búið til', applySatt({ verdbolga: 4 }, { kaupmattur: 1.56 }).kpis.kaupmattur === undefined);
  ok('applySatt án áhrifa → óbreytt, pop 0', (() => { const x = applySatt(base, null); return x.kpis.verdbolga === 4 && x.pop === 0; })());
  ok('applySatt tómt kpis brotnar ekki', applySatt(null, { verdbolga: 1 }).pop === 0);
}

// ── Determinismi ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const v = { a: 'satt', b: null, c: 'saekja', d: 'satt' };
  ok('sama inntak → sama úttak (deep)', JSON.stringify(sattUtkoma(v)) === JSON.stringify(sattUtkoma(v)) && JSON.stringify(sattUtkoma(v)) === JSON.stringify(sattUtkoma({ ...v })));
  ok('inntak óbreytt eftir kall', v.b === null && v.a === 'satt');
}

// ═══ JAFNVÆGIS-HERMUN — skilyrði (i)–(iv) úr hönnun ═══════════════════════════════════════════════════════════════
// AÐFERÐ (skjalfest val): RAUN-uppgjörsleiðin úr server.mjs — stig = scoreRound(kpis+Δ, mandateFor(3)).composite ×
// govtStability(kpis+Δ, pop).factor — á SAFNI dæmigerðra sáttar-lotu-staða (2008/2020-líkar: verðbólga YFIR markmiðs-
// bandi, kaupmáttur UNDIR því, fylgi lágt svo fylgis-áhrif skipti máli um ólgu/uppreisnar-þröskulda 40/28).
// Meðaltal yfir safnið = „vænt stigaáhrif" — tekur með bæði KPI-halla GOAL_SPECS og fylgis-þröskuldana.
// (Stakt „grunnsett" verdbolga 4 / kaupmattur 1,5 dugar EKKI: kaupmáttur 1,5 er INNAN bands → allur kaupmáttar-
//  ábati = 0 stig í scoreRound og freistingin hyrfi — þess vegna safn í línulega svæðinu, þar sem sátt skiptir máli.)
const STATES = [];
for (const verdbolga of [4.0, 5.0, 6.0]) for (const kaupmattur of [-3, -2, -1]) for (const hagvoxtur of [-3, 0]) for (const atvinnuleysi of [5, 7])
  STATES.push({ verdbolga, kaupmattur, hagvoxtur, atvinnuleysi, skuldir: 60 });
const MANDATE3 = mandateFor(3);
const stig = (kp, effect) => { const { kpis, pop } = applySatt(kp, effect); return scoreRound(kpis, MANDATE3).composite * govtStability(kpis, pop).factor; };
const dStig = (effect) => STATES.reduce((a, kp) => a + (stig(kp, effect) - stig(kp, null)), 0) / STATES.length;   // vænt Δstig
const dPop = (effect) => (effect && effect.pop) || 0;

// Allar samsetningar vals fyrir n lið → per-lið Δstig (vænt), Δfylgi, flokkur.
function grid(n) {
  const rows = [];
  for (let mask = 0; mask < (1 << n); mask++) {
    const valin = {}; for (let i = 0; i < n; i++) valin['L' + (i + 1)] = (mask >> i) & 1 ? 'satt' : 'saekja';
    const u = sattUtkoma(valin);
    const teams = Object.keys(valin).map((id) => ({ id, val: u.perTeam[id].val, d: dStig(u.perTeam[id].effect), pop: dPop(u.perTeam[id].effect) }));
    rows.push({ mask, valin, flokkur: u.flokkur, k: u.k, teams, total: teams.reduce((a, t) => a + t.d, 0) });
  }
  return rows;
}
const S = dStig(SATT_FYLKI.samvinna);                      // samvinna per lið
const G = dStig(SATT_FYLKI.svik.svikari);                  // svikari í svik-flokki
const L = dStig(SATT_FYLKI.svik.sattLid);                  // sogari í svik-flokki
const PS = dStig({ ...SATT_FYLKI.spirall.allir, ...SATT_FYLKI.spirall.svikari });   // svikari í spíral
const PL = dStig({ ...SATT_FYLKI.spirall.allir, ...SATT_FYLKI.spirall.sattLid });   // sáttar-lið í spíral
console.log(`\nJafnvægis-hermun (vænt Δstig per lið, ${STATES.length} sáttar-lotu-stöður, KT3-umboð): samvinna ${r2(S)} · svikari ${r2(G)} · sogari ${r2(L)} · spírall svikari ${r2(PS)} · spírall sáttar-lið ${r2(PL)}`);

ok('samvinna borgar sig í sjálfu sér (Δstig > 0)', S > 0);
for (const n of [2, 3, 4, 6]) {
  const rows = grid(n);
  const allSatt = rows.find((r) => r.k === n);
  // (i) allir-satt = besta HEILDAR-útkoman (summa stiga allra) — strangt.
  ok(`(i) n=${n}: allir-satt hæst í heild`, rows.every((r) => r === allSatt || r.total < allSatt.total - 1e-9));
  // (ii) eitt svik = best fyrir SVIKARANN þegar hinir halda (annars engin klemma).
  const oneDefect = rows.filter((r) => r.k === n - 1);
  ok(`(ii) n=${n}: svikari græðir á að svíkja einn`, oneDefect.every((r) => { const sv = r.teams.find((t) => t.val === 'saekja'); return r.flokkur === 'svik' && sv.d > S + 1e-9; }));
  // (iii) flestir-svíkja = verst fyrir ALLA: hvert lið í spíral-samsetningu < lakasta útkoma utan spírals; heildin líka.
  const spir = rows.filter((r) => r.flokkur === 'spirall'), non = rows.filter((r) => r.flokkur !== 'spirall');
  const maxSpir = Math.max(...spir.flatMap((r) => r.teams.map((t) => t.d))), minNon = Math.min(...non.flatMap((r) => r.teams.map((t) => t.d)));
  ok(`(iii) n=${n}: spírall verstur fyrir alla (hám. ${r2(maxSpir)} < lágm. annarra ${r2(minNon)})`, spir.length > 0 && maxSpir < minNon - 1e-9 && Math.max(...spir.map((r) => r.total)) < Math.min(...non.map((r) => r.total)) - 1e-9);
  // (iv) svik er EKKI ráðandi stefna: til er staða hinna þar sem „satt" er strangt betra fyrir mig — nákvæmlega þegar
  //      ég er á vogarskálinni (mitt svik kæmi spíralnum af stað). Jafnframt: klemman er raunveruleg (ii) — svo (iv)+(ii)
  //      saman = traust borgar sig EF það er gagnkvæmt, svik freistar EF hinir halda, og sá sem hrindir af stað spíral tapar.
  let sattBetra = 0, saekjaBetra = 0, pivotOk = true;
  for (let others = 0; others < (1 << (n - 1)); others++) {
    const mkv = (me) => { const v = { me }; for (let i = 0; i < n - 1; i++) v['o' + i] = (others >> i) & 1 ? 'satt' : 'saekja'; return v; };
    const a = sattUtkoma(mkv('satt')), b = sattUtkoma(mkv('saekja'));
    const da = dStig(a.perTeam.me.effect), db = dStig(b.perTeam.me.effect);
    if (da > db + 1e-9) sattBetra++; else if (db > da + 1e-9) saekjaBetra++;
    if (a.flokkur === 'svik' && b.flokkur === 'spirall' && !(da > db)) pivotOk = false;   // vogarskál: halda > svíkja
  }
  ok(`(iv) n=${n}: svik ekki ráðandi (satt betra í ${sattBetra}, saekja í ${saekjaBetra} af ${1 << (n - 1)} stöðum hinna)`, sattBetra > 0 && saekjaBetra > 0 && pivotOk);
}
// Fylgi styður sömu átt: svikari fær meira fylgi en samvinna, sogari tapar, spírall tapar.
ok('fylgi: svikari > samvinna > 0 > sogari > spírall', SATT_FYLKI.svik.svikari.pop > SATT_FYLKI.samvinna.pop && SATT_FYLKI.samvinna.pop > 0 && SATT_FYLKI.svik.sattLid.pop < 0 && SATT_FYLKI.spirall.allir.pop < SATT_FYLKI.svik.sattLid.pop);
// Freistingin er EKKI háð fylgi einu: í stöðu þar sem fylgi er langt frá þröskuldum (engin stigaáhrif af pop) og
// báðir KPI í línulega svæðinu er svikari samt ≥ samvinna í hreinum KPI-stigum.
{
  const kp = { verdbolga: 4.5, kaupmattur: -2, hagvoxtur: 2, atvinnuleysi: 4, skuldir: 40 };   // fylgi ≈ 56 → ±6 helst „stable"
  const st = govtStability(kp, 0).approval;
  const sOnly = stig(kp, SATT_FYLKI.samvinna) - stig(kp, null), gOnly = stig(kp, SATT_FYLKI.svik.svikari) - stig(kp, null);
  ok(`(ii-KPI) freisting stendur án fylgis (svikari ${r2(gOnly)} ≥ samvinna ${r2(sOnly)}, fylgi ${st})`, st >= 46 && st <= 66 && gOnly >= sOnly);
}

// ── Taflan n=3 (fyrir töflu leikstjóra) ──────────────────────────────────────────────────────────────────────────
{
  const rows = grid(3).sort((a, b) => b.k - a.k || a.mask - b.mask);
  console.log('\nÞjóðarsáttin n=3 — allar 8 samsetningar (vænt Δstig per lið | Δfylgi):');
  console.log('  L1      L2      L3      | flokkur   |    L1         L2         L3      | heild');
  for (const r of rows) {
    const v = (t) => (t.val === 'satt' ? 'SÁTT  ' : 'sækja ');
    const c = (t) => ((t.d >= 0 ? '+' : '') + r2(t.d).toFixed(2) + '|' + (t.pop >= 0 ? '+' : '') + t.pop).padStart(10);
    console.log('  ' + r.teams.map(v).join('  ') + ' | ' + r.flokkur.padEnd(9) + ' | ' + r.teams.map(c).join(' ') + ' | ' + (r.total >= 0 ? '+' : '') + r2(r.total).toFixed(2));
  }
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
