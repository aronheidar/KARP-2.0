import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEVER_VIGT, LEVER_META, POLICY_VIGT, SKALI, FLOKKA_MORK, politikStada, politikFerill } from './politik.mjs';
import { POLICIES } from './policies.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// ── Heilindi vigtar-töflunnar: ALLIR lyklar raunverulegir sleðar + bil í takt við baseline (ver gegn
// týpóum og framtíðar-endurnefningum/endurskölun í gogn/roads/baseline.json).
for (const id in LEVER_VIGT) {
  ok(`LEVER_VIGT.${id} er raunverulegur sleði í baseline`, !!baseline.levers[id]);
  const w = LEVER_VIGT[id];
  ok(`vigt ${id} heiltala í [-3,3] og ekki 0 (0 á að sleppa)`, Number.isInteger(w) && w >= -3 && w <= 3 && w !== 0);
  const m = LEVER_META[id], b = baseline.levers[id] || {};
  ok(`LEVER_META.${id} bil = baseline (min/base/max)`, !!m && m.min === b.min && m.base === b.base && m.max === b.max && typeof m.heiti === 'string' && m.heiti.length > 0);
}
ok('LEVER_META hefur nákvæmlega sömu lykla og LEVER_VIGT',
  Object.keys(LEVER_META).sort().join('|') === Object.keys(LEVER_VIGT).sort().join('|'));

for (const id in POLICY_VIGT) {
  const p = POLICIES.find((x) => x.id === id);
  ok(`POLICY_VIGT.${id} er raunveruleg ákvörðun í policies.mjs`, !!p);
  const w = POLICY_VIGT[id];
  if (p && typeof w === 'object') for (const k in w) ok(`POLICY_VIGT.${id}.${k} er raunverulegur valkostur`, (p.options || []).some((o) => o.key === k));
  if (p && typeof w === 'object') ok(`POLICY_VIGT.${id} er choice-ákvörðun`, p.kind === 'choice');
}
ok('esb er hlutlaust (önnur vídd)', POLICY_VIGT.esb === 0);
ok('icesave er hlutlaust', POLICY_VIGT.icesave === 0);

// ── Tóm inntök → 0 / miðja
const t0 = politikStada({}, {});
ok('tómt → stig 0', t0.stig === 0);
ok('tómt → midja + lýsing', t0.flokkur === 'midja' && t0.lysing === 'Miðjustjórn');
ok('tómt → engin tog', t0.togar.vinstri.length === 0 && t0.togar.haegri.length === 0);
const tU = politikStada();
ok('engin rök → sama og tómt', tU.stig === 0 && tU.flokkur === 'midja');

// ── Hreint vinstra sett: veiðigjald + velferð upp
const v = politikStada({ veidigjald: 100, tilfaerslur: 20 }, {});
ok('veiðigjald+velferð upp → vinstri (stig ≤ -25)', v.flokkur === 'vinstri' && v.stig <= -FLOKKA_MORK);
ok('lýsing vinstri', v.lysing === 'Vinstrisinnuð stjórn');

// ── Hreint hægra sett: skattar niður + bankar einka + regluverk losað
const h = politikStada({ skattar: -15 }, { bankar: 'einka', fjarmalaregluverk: 'losa' });
ok('skattar niður + einkavæðing + losað regluverk → haegri (stig ≥ 25)', h.flokkur === 'haegri' && h.stig >= FLOKKA_MORK);
ok('lýsing hægri', h.lysing === 'Hægrisinnuð stjórn');

// ── Blandað → miðja (vinstri veiðigjald á móti hægri sköttum/stóriðju jafnast út)
const m = politikStada({ veidigjald: 100, skattar: -15, utgjold: 8, orka: 30 }, { stjoridja: 'reisa' });
ok('blandað sett → midja', m.flokkur === 'midja' && Math.abs(m.stig) < FLOKKA_MORK);
// Eitt stórmál eitt og sér (vigt 3 full-nýtt = 24 stig) helst rétt innan miðju — kvörðunarpróf á SKALI=8.
ok('eitt full-nýtt stórmál → enn midja (24 stig)', politikStada({ tilfaerslur: 20 }, {}).flokkur === 'midja' && politikStada({ tilfaerslur: 20 }, {}).stig === -3 * SKALI);
ok('stórmál + eitt grænt til viðbótar → vinstri', politikStada({ tilfaerslur: 20, fridun: 30 }, {}).flokkur === 'vinstri');

// ── Klemma á ±100: allt í botn hvora átt
const allLeft = {}, allRight = {};
for (const id in LEVER_VIGT) {
  const mm = LEVER_META[id];
  allLeft[id] = LEVER_VIGT[id] < 0 ? mm.max : mm.min;   // vinstri-sleðar upp, hægri-sleðar niður
  allRight[id] = LEVER_VIGT[id] < 0 ? mm.min : mm.max;  // öfugt
}
const xl = politikStada(allLeft, { bankar: 'thjod', fjarmalaregluverk: 'adhald', stjoridja: 'hafna', hoft: true, verdtrygging: true, audlindasjodur: true });
ok('allt til vinstri → klemmt á -100', xl.stig === -100 && xl.flokkur === 'vinstri');
const xr = politikStada(allRight, { bankar: 'einka', fjarmalaregluverk: 'losa', stjoridja: 'reisa' });
ok('allt til hægri → klemmt á +100', xr.stig === 100 && xr.flokkur === 'haegri');

// ── togar: rétt heiti og áttir
const tg = politikStada({ veidigjald: 100, orka: 30 }, { bankar: 'einka' });
ok('togar.vinstri inniheldur „Veiðigjald ↑"', tg.togar.vinstri.some((x) => x.label === 'Veiðigjald ↑'));
ok('togar.haegri inniheldur orku-sleðann ↑', tg.togar.haegri.some((x) => x.label === 'Orka til stóriðju ↑'));
ok('togar.haegri inniheldur banka-valið (heiti úr policies)', tg.togar.haegri.some((x) => x.label.includes('Einkavæða á ný')));
ok('framlag er jákvæð stærð báðum megin', tg.togar.vinstri.every((x) => x.framlag > 0) && tg.togar.haegri.every((x) => x.framlag > 0));
// Lækkaður vinstri-sleði togar til HÆGRI og fær ↓-ör
const tg2 = politikStada({ skattar: -15 }, {});
ok('skattar niður → togar.haegri með „Tekjuskattur ↓"', tg2.togar.haegri.some((x) => x.label === 'Tekjuskattur ↓') && tg2.togar.vinstri.length === 0);
// Hámark 3 per átt, raðað stærsta fyrst
const tg3 = politikStada({ veidigjald: 100, tilfaerslur: 20, menntun: 30, leiguhusnaedi: 40, kolefnisgjald: 100 }, {});
ok('togar.vinstri klippt við 3', tg3.togar.vinstri.length === 3);
ok('togar raðað stærsta framlagi fyrst', tg3.togar.vinstri[0].framlag >= tg3.togar.vinstri[1].framlag && tg3.togar.vinstri[1].framlag >= tg3.togar.vinstri[2].framlag);
ok('stærsta framlagið er vigt-3 sleði (24 stig)', tg3.togar.vinstri[0].framlag === 3 * SKALI);

// ── Fylki-gildi (per-fjórðungs leið): síðasta gildið gildir
ok('fylki → síðasta gildi notað', politikStada({ veidigjald: [0, 50, 100] }, {}).stig === politikStada({ veidigjald: 100 }, {}).stig);

// ── politikFerill: röð, númering og bæði inntaks-form
const fer = politikFerill([
  {},                                                            // 1: ekkert gert
  { veidigjald: 100, tilfaerslur: 20 },                          // 2: hreint lever-sett
  { levers: { skattar: -15 }, policies: { bankar: 'einka' } },   // 3: pakkað form m. policies
]);
ok('ferill: lengd og lotu-röð 1,2,3', fer.length === 3 && fer[0].round === 1 && fer[1].round === 2 && fer[2].round === 3);
ok('ferill: lota 1 midja', fer[0].flokkur === 'midja' && fer[0].stig === 0);
ok('ferill: lota 2 vinstri', fer[1].flokkur === 'vinstri');
ok('ferill: lota 3 haegri (skattar niður + einkavæðing)', fer[2].flokkur === 'haegri');
ok('ferill: round úr staki virðir yfirtöku', politikFerill([{ round: 5, levers: {} }])[0].round === 5);
ok('ferill: tómur listi → tómt', politikFerill([]).length === 0 && politikFerill().length === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
