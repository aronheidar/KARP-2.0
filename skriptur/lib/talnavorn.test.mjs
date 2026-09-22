// Talnavörnin er tryggingin fyrir reglunni „aðeins úr facts". Dæmin eru RAUNFRÉTTIR úr straumnum 22.9.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athugaTolur, talnaTokar, leyfd } from './talnavorn.mjs';

const SIMINN = { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 };
const DAGAR = { felag: 'Dagar hf.', kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], verdmaeti: 1024188084, dags: '2026-09-21', tedNr: '649909-2026' };
const THEMA = { manudur: '2026-08', rikisgreidslur: 17698591083, staersti_birgir: 'Distica hf.', ny_utbod_30d: 42, styrkir_alls: 11318801491 };
const DOMUR = { domstoll: 'Hæstiréttur', malsnr: '28/2026', svid: 'Einkamál', dags: '2026-09-17' };

test('raunfréttir úr straumnum standast', () => {
  assert.deepEqual(athugaTolur('Síminn lækkar um 7,3%\nHlutabréf í Símanum hf. lækkuðu um 7,3% og stóð gengið í 10,2.', SIMINN), { ok: true, rangar: [] });
  assert.equal(athugaTolur('Dagar hf. varð hlutskarpast með tilboði að verðmæti 1.024.188.084 krónur. Niðurstaðan var birt 21. september 2026. Útboðið er skráð undir tilkynningarnúmerinu 649909-2026.', DAGAR).ok, true);
  // 30 kemur úr sviðaheitinu ny_utbod_30d, ekki úr uppspunnu sviði
  assert.equal(athugaTolur('Í ágúst 2026 námu ríkisgreiðslur 17,7 milljörðum króna. Á síðustu 30 dögum voru 42 ný útboð birt. Styrkir námu samtals 11,3 milljörðum króna.', THEMA).ok, true);
  assert.equal(athugaTolur('Hæstiréttur vísaði frá einkamáli nr. 28/2026 þann 17. september 2026.', DOMUR).ok, true);
});

test('uppspunnin tala, ártal og rangt námundað gildi falla', () => {
  assert.deepEqual(athugaTolur('Hlutabréf í Símanum lækkuðu um 7,5%.', SIMINN).rangar, ['7,5%']);
  assert.deepEqual(athugaTolur('Málið hófst árið 2025.', DOMUR).rangar, ['2025']);
  assert.deepEqual(athugaTolur('Ríkisgreiðslur námu 17,9 milljörðum.', THEMA).rangar, ['17,9 milljörðum']);
  assert.deepEqual(athugaTolur('Mál nr. 29/2026.', DOMUR).rangar, ['29/2026']);
});

test('námundun innan birtrar nákvæmni er leyfð, líka með einingum', () => {
  assert.equal(athugaTolur('um 18 milljarðar', THEMA).ok, true);            // 17,7 ma → 18 ma (nákvæmni 1 ma)
  assert.equal(athugaTolur('1.024 m.kr.', DAGAR).ok, true);                 // 1.024.188.084 → 1.024 milljónir
  assert.equal(athugaTolur('atvinnuleysi 4%', { atvinnuleysi: 3.95 }).ok, true);
  assert.equal(athugaTolur('1,5 prósentustig', { breyting: 1.5 }).ok, true);
});

test('hreiðruð gildi í bakgrunni og dagsetningar í strengjum teljast', () => {
  const f = { felag: 'Dagar hf.', bakgrunnur: { sigurvegari: { utbod_unnin: { fjoldi: 3, sidast: '2026-06-01' } } } };
  assert.equal(athugaTolur('Félagið hefur unnið 3 útboð, síðast 1. júní 2026.', f).ok, true);
  assert.equal(athugaTolur('Atvinnuleysi í ágúst 2026', { manudur: '2026M08' }).ok, true);
});

test('táknun: númer, hlutföll og einingar greinast rétt', () => {
  const t = talnaTokar('nr. 28/2026 · 7,3% · 17,7 milljörðum · 1.024.188.084 kr.');
  assert.deepEqual(t.map((x) => x.tegund), ['numer', 'hlutfall', 'tala', 'tala']);
  assert.equal(t[2].gildi, 17.7e9);
  assert.equal(t[3].gildi, 1024188084);
  assert.ok(leyfd({ d: '2026-09-21' }).gildi.includes(21));
});

test('samsett orð er ekki eining', () => {
  assert.equal(athugaTolur('Á svæðinu voru 5 milljarðamæringar.', { fjoldi: 5 }).ok, true);
  assert.deepEqual(athugaTolur('Talan var 5 milljarðamæringar.', { x: 5000000000 }).rangar, ['5']);
});

test('einingar þekkjast í öllum beygingarmyndum sem heil orð', () => {
  assert.equal(athugaTolur('3 milljónum', { a: 3e6 }).ok, true);
  assert.equal(athugaTolur('2 þúsund', { a: 2000 }).ok, true);
  assert.equal(athugaTolur('um 1,3 milljarða', { a: 1334522008 }).ok, true);
  assert.equal(athugaTolur('4 milljarðar', { a: 4e9 }).ok, true);
});

// Yfirferð 22.9 (síðari lota): ×100 er nú BUNDIÐ við sviðaheiti sem passa nákvæmlega breytingN eða hms_breyting_ÁÁÁÁ —
// þau einu sem geyma raunverulegt BROT (0,162 = 16,2%) í gögnunum (svæðaskynjarinn breyting12, HMS-spá
// hms_breyting_2027). Laustengd samsvörun á „breyting"/„hlutfall" hvar sem er í heitinu (eldra far) hleypti óskyldu
// PRÓSENTUSTIGI í gegn sem prósentu: vaxtabreytingin `breyting: 0,25` (0,25 prósentustig úr vextir-skynjaranum) stóðst
// ranglega á móti uppspunninni „25%".
test('×100 er BUNDIÐ við breytingN og hms_breyting_ÁÁÁÁ — vaxtabreyting í prósentustigum er ekki prósenta', () => {
  assert.deepEqual(athugaTolur('Seðlabankinn hækkaði vexti um 25%', { breyting: 0.25, nyir: 8, fyrri: 7.75 }).rangar, ['25%'], '0,25 prósentustig ≠ 25%');
  assert.equal(athugaTolur('hækkaði um 16,2%', { breyting12: 0.162 }).ok, true);
  assert.equal(athugaTolur('hækkaði um 3,1%', { hms_breyting_2027: 0.031 }).ok, true);
  assert.equal(athugaTolur('áætluð breyting fyrir 2027 er 5,5%', { hms_breyting_2027: 0.055 }).ok, true);
  assert.deepEqual(athugaTolur('hlutfallið var 50%', { hlutfall: 0.5 }).rangar, ['50%'], 'hlutfall er ekki á allowlistanum lengur');
  assert.equal(athugaTolur('hlutfallið var 50%', { hlutfall: 50 }).ok, true, 'nákvæm samsvörun þarf enga ×100');
  assert.deepEqual(athugaTolur('hlutfallið var 50%', { onnur_tala: 0.5 }).rangar, ['50%'], 'óskylt brot');
  assert.deepEqual(athugaTolur('breytingin var 150%', { breyting: 1.5 }).rangar, ['150%'], 'yfir 1 hvort eð er');
  assert.deepEqual(athugaTolur('úrvalsvísitalan hækkaði um 40%', { urvalsvisitala_breyting_pct: 0.4 }).rangar, ['40%'], '_pct ber prósentu nú þegar, og er ekki á allowlistanum');
});

test('tölustafir í sviðaheitum teljast leyfð gildi (raundæmi sem vörnin hafnaði áður)', () => {
  assert.equal(athugaTolur('Í kosningunum 2024 fékk flokkurinn 19,36% fylgi.', { flokkur: 'Sjálfstæðisflokkurinn', kosningar2024: 19.36 }).ok, true);
  assert.equal(athugaTolur('Verðbólga var 4% fyrir 12 mánuðum.', { verdbolga_12man_fyrr: 4 }).ok, true);
  assert.deepEqual(athugaTolur('Á síðustu 31 degi voru 42 ný útboð birt.', { ny_utbod_30d: 42 }).rangar, ['31'], 'aðeins talan í heitinu');
});

// Yfirferð 22.9 (síðari lota): lykiltölur AÐEINS úr tímabilshluta (skiptitala + man/d/ar/ara) eða fjögurra stafa ártali —
// ekki hvaða tala sem stendur í heitinu. Áður las lykilTolur ALLA tölustafi í heitinu, svo t.d. `verd_m2` hleypti „2"
// í gegn sem gilda tölu (raundæmi sem vörnin hefði átt að hafna).
test('lykilTolur: aðeins tímabil (man/d/ar/ara) eða ártal úr sviðaheiti, ekki hvaða tala sem er (t.d. m2)', () => {
  assert.deepEqual(athugaTolur('2 kaup', { verd_m2: 350 }).rangar, ['2'], 'm2 lekur ekki lengur lykilstafnum sínum');
  assert.equal(athugaTolur('síðustu 12 mánuði', { verdbolga_12man_fyrr: 4 }).ok, true);
  assert.equal(athugaTolur('2024', { kosningar2024: 5 }).ok, true);
});

test('gildi á sviðum í þúsundum (_thus) teljast líka ×1000', () => {
  assert.equal(athugaTolur('Fermetraverð er 824 þúsund krónur.', { fermetraverd_thus: 824 }).ok, true);
  assert.equal(athugaTolur('Fermetraverð er 824.000 krónur.', { fermetraverd_thus: 824 }).ok, true);
  assert.equal(athugaTolur('Miðgildið er 710 þúsund krónur á fermetra.', { midgildi_thus_m2: 710 }).ok, true);
  assert.deepEqual(athugaTolur('Fermetraverð er 824 þúsund krónur.', { fermetraverd: 824 }).rangar, ['824 þúsund'], 'án _thus er 824 bara 824');
});

test('hrein heiltala (enginn aukastafur, engin eining, ekki %) verður að passa nákvæmlega', () => {
  assert.deepEqual(athugaTolur('Félagið hefur unnið 3 útboð.', { fjoldi: 2.6 }).rangar, ['3']);
  assert.equal(athugaTolur('Félagið hefur unnið 3 útboð.', { fjoldi: 3 }).ok, true);
  assert.deepEqual(athugaTolur('Gengið stóð í 190.', { verd: 190.5 }).rangar, ['190']);
  assert.equal(athugaTolur('Gengið stóð í 190,5.', { verd: 190.5 }).ok, true);
  // námundun helst þar sem textinn sýnir nákvæmnina: aukastafur, eining eða prósenta
  assert.equal(athugaTolur('Gengið stóð í 17,7.', { verd: 17.66 }).ok, true);
  assert.equal(athugaTolur('um 18 milljarðar', { a: 17698591083 }).ok, true);
  assert.equal(athugaTolur('atvinnuleysi 4%', { atvinnuleysi: 3.95 }).ok, true);
});

// Prufukeyrsla 22.9 (þriðja lota): „Ístak fær samning Isavia um flughlöð fyrir tæpa 1,6 milljarða" þegar samningurinn var
// 1.619.182.758 kr., þ.e. RÚMLEGA 1,6 milljarðar. Talan stóðst námundun; orðið á undan sagði öfugt.
test('„tæp-" og „rúm-" gefa stefnu: gildið verður að liggja undir eða yfir birtri tölu', () => {
  const ISTAK = { verdmaeti: 1619182758 };
  assert.deepEqual(athugaTolur('fyrir tæpa 1,6 milljarða', ISTAK), { ok: false, rangar: ['tæpa 1,6 milljarða'] });
  assert.equal(athugaTolur('fyrir rúmlega 1,6 milljarða', ISTAK).ok, true);
  assert.equal(athugaTolur('fyrir 1,6 milljarða', ISTAK).ok, true);
  const UNDIR = { verdmaeti: 1598000000 };
  assert.equal(athugaTolur('Tæplega 1,6 milljarðar króna', UNDIR).ok, true, 'hástafur í upphafi setningar');
  assert.equal(athugaTolur('rúm 1,6 milljarðar', UNDIR).ok, false);
  assert.equal(athugaTolur('ríflega 1,6 milljarðar', UNDIR).ok, false);
  assert.equal(athugaTolur('hátt í 1,6 milljarða', UNDIR).ok, true);
});

test('stefnuorð á hreinni heiltölu: nákvæmt gildi er hvorki „tæplega" né „rúmlega" það sjálft', () => {
  assert.equal(athugaTolur('29 útboð', { n: 29 }).ok, true);
  assert.equal(athugaTolur('tæplega 29 útboð', { n: 29 }).ok, false);
  assert.equal(athugaTolur('rúmlega 9,5 milljónir', { kr: 9500000 }).ok, false, 'nákvæmlega 9,5 milljónir er ekki rúmlega');
});

test('samanburðarorð vísa í viðmið og gefa ekki stefnu („meiri en 7,3%" þegar 7,3 er fyrri metdagur)', () => {
  const M = { staersta_fyrri_dagshreyfing_i_gagnarod_karp_pct: 7.3 };
  for (const s of ['Hreyfing dagsins var meiri en 7,3%', 'yfir 7,3%', 'undir 7,3%', 'lækkaði yfir 40 viðskiptadaga']) {
    assert.equal(athugaTolur(s, { ...M, vidskiptadagar_i_gagnarod_karp: 40 }).ok, true, s);
  }
  assert.equal(talnaTokar('rúmlega 7,3%')[0].att, 'yfir');
  assert.equal(talnaTokar('tæp 7,3%')[0].att, 'undir');
  assert.equal(talnaTokar('um 7,3%')[0].att, undefined);
  assert.equal(talnaTokar('rúmum 40 dögum')[0].att, 'yfir');
});
