import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lagaTilvisanir, reglugerdaTilvisanir, innraProf, erKandidat, snertirLog, ollLog, lagaSlod, STODUR,
} from './lib/ivilnanir.mjs';

// Strengirnir hér að neðan eru ORÐRÉTT úr gogn/ivilnanir.json (13.9.2026).

test('lagaTilvisanir les einfalda tilvísun', () => {
  assert.deepEqual(lagaTilvisanir('Lög nr. 90/2003 (tekjuskatt)'), [{ nr: 90, ar: 2003 }]);
});

test('lagaTilvisanir les tvenn lög í einum streng', () => {
  const s = 'Lög nr. 129/1997 (skyldutryggingu lífeyrisréttinda) og nr. 111/2016 (stuðning til kaupa á fyrstu íbúð)';
  assert.deepEqual(lagaTilvisanir(s), [{ nr: 129, ar: 1997 }, { nr: 111, ar: 2016 }]);
});

test('þingsályktun er EKKI lög — 148 er þingnúmer, ekki ártal', () => {
  const s = 'Þingsályktun nr. 32/148 (þskj. 1364, 675. mál) — stofnun sjóðsins, framlög af fjárlögum 2019–2023';
  assert.deepEqual(lagaTilvisanir(s), []);
});

test('reglugerð telst ekki með lögunum en finnst sér', () => {
  const s = 'Lög nr. 38/2020 (fjárstuðning til minni rekstraraðila vegna heimsfaraldurs kórónuveiru), sbr. rg. nr. 534/2020 um stuðningslán';
  assert.deepEqual(lagaTilvisanir(s), [{ nr: 38, ar: 2020 }]);
  assert.deepEqual(reglugerdaTilvisanir(s), [{ nr: 534, ar: 2020 }]);
});

test('reglugerð í miðjum streng ruglar ekki lagatilvísunina', () => {
  const s = 'Lög nr. 33/1997 (Bókasafnssjóð höfunda) — úthlutun skv. rg. nr. 203/1998';
  assert.deepEqual(lagaTilvisanir(s), [{ nr: 33, ar: 1997 }]);
  assert.deepEqual(reglugerdaTilvisanir(s), [{ nr: 203, ar: 1998 }]);
});

test('bráðabirgðaákvæði skemma ekki lesturinn', () => {
  assert.deepEqual(lagaTilvisanir('Lög nr. 45/1987 (staðgreiðslu opinberra gjalda), ákvæði til bráðabirgða VII'),
    [{ nr: 45, ar: 1987 }]);
});

test('sömu lög tvisvar telja einu sinni', () => {
  assert.deepEqual(lagaTilvisanir('Lög nr. 50/1988 (virðisaukaskatt) og aftur nr. 50/1988'), [{ nr: 50, ar: 1988 }]);
});

test('lagaSlod núllfyllir númerið í þrjá stafi', () => {
  assert.equal(lagaSlod(38, 2020), 'https://www.althingi.is/lagas/nuna/2020038.html');
  assert.equal(lagaSlod(160, 2011), 'https://www.althingi.is/lagas/nuna/2011160.html');
});

test('innraProf: heil færsla gefur engar aðfinnslur', () => {
  const f = { nafn: 'Barnabætur', stada: 'virk', fra: 1997, til: null, heimild: 'Lög nr. 90/2003 (tekjuskatt, A-liður 68. gr.)' };
  assert.deepEqual(innraProf(f, 2026), []);
});

test('innraProf: virk færsla með liðnu lokaári er flögguð', () => {
  const f = { nafn: 'Eitthvað', stada: 'virk', fra: 2021, til: 2025, heimild: 'Lög nr. 90/2003 (tekjuskatt)' };
  const a = innraProf(f, 2026);
  assert.equal(a.length, 1);
  assert.equal(a[0].tegund, 'utrunnid');
  assert.match(a[0].skyring, /lauk 2025/);
});

test('innraProf: lidin færsla með liðnu lokaári er í lagi', () => {
  const f = { nafn: 'Ferðagjöf', stada: 'lidin', fra: 2020, til: 2021, heimild: 'Lög nr. 54/2020 (ferðagjöf)' };
  assert.deepEqual(innraProf(f, 2026), []);
});

test('innraProf: ógild staða er flögguð (stada er ÁN broddstafs)', () => {
  const f = { nafn: 'X', stada: 'liðin', fra: 2020, til: 2021, heimild: 'Lög nr. 54/2020 (ferðagjöf)' };
  assert.equal(innraProf(f, 2026).filter((x) => x.tegund === 'ogild-stada').length, 1);
});

test('innraProf: þingsályktunar-heimild telst læsileg þótt engin lög finnist', () => {
  const f = { nafn: 'Barnamenningarsjóður', stada: 'virk', fra: 2018, til: null, heimild: 'Þingsályktun nr. 32/148 (þskj. 1364)' };
  assert.deepEqual(innraProf(f, 2026), []);
});

test('innraProf: heimildarlaus færsla er flögguð', () => {
  const a = innraProf({ nafn: 'X', stada: 'virk', heimild: '' }, 2026);
  assert.equal(a[0].tegund, 'heimild-vantar');
});

test('innraProf: fra á eftir til er flaggað', () => {
  const a = innraProf({ nafn: 'X', stada: 'lidin', fra: 2024, til: 2020, heimild: 'Lög nr. 90/2003 (tekjuskatt)' }, 2026);
  assert.equal(a.filter((x) => x.tegund === 'ogild-ar').length, 1);
});

test('innraProf ber nafnið með sér svo aðfinnslan sé rekjanleg', () => {
  const a = innraProf({ nafn: 'Lokunarstyrkir', stada: 'ekkitil', heimild: 'Lög nr. 38/2020 (x)' }, 2026);
  assert.equal(a[0].nafn, 'Lokunarstyrkir');
});

test('STODUR eru nákvæmlega gildin sem síðan þekkir', () => {
  assert.deepEqual([...STODUR].sort(), ['breytt', 'lidin', 'virk']);
});

test('erKandidat: ný stuðningslög eru tillaga', () => {
  assert.equal(erKandidat('LÖG um tímabundinn rekstrarstuðning vegna jarðhræringa.'), true);
  assert.equal(erKandidat('LÖG um stuðningslán til rekstraraðila í Grindavíkurbæ vegna jarðhræringa á Reykjanesskaga.'), true);
});

test('erKandidat: breytingalög eru EKKI kandídatar (vöktuð sem breyting í staðinn)', () => {
  assert.equal(erKandidat('LÖG um breytingu á lögum um fjárstuðning til minni rekstraraðila, nr. 38/2020 (framhald lokunarstyrkja).'), false);
});

test('erKandidat: fjárlög og óskyld lög sleppa', () => {
  assert.equal(erKandidat('LÖG um fjárlög fyrir árið 2027.'), false);
  assert.equal(erKandidat('LÖG um rekstraraðila sérhæfðra sjóða.'), true); // ber „sjóð" — mannlegt mat sker úr
  assert.equal(erKandidat('LÖG um pakkaferðir og samtengda ferðatilhögun.'), false);
});

test('erKandidat: reglugerðir í B-deild eru ekki kandídatar', () => {
  assert.equal(erKandidat('REGLUGERÐ um stuðningslán.'), false);
});

test('snertirLog finnur breytingu á lögum sem við vitnum í', () => {
  const titill = 'LÖG um breytingu á lögum um fjárstuðning til minni rekstraraðila vegna heimsfaraldurs kórónuveiru, nr. 38/2020 (framhald lokunarstyrkja).';
  assert.deepEqual(snertirLog(titill, [{ nr: 38, ar: 2020 }, { nr: 90, ar: 2003 }]), [{ nr: 38, ar: 2020 }]);
});

test('snertirLog ruglast ekki á svipuðu númeri', () => {
  assert.deepEqual(snertirLog('LÖG um breytingu á lögum nr. 138/2020.', [{ nr: 38, ar: 2020 }]), []);
});

test('ollLog skilar einkvæmum lögum í stöðugri röð', () => {
  const f = [
    { heimild: 'Lög nr. 90/2003 (tekjuskatt)' },
    { heimild: 'Lög nr. 38/2020 (x)' },
    { heimild: 'Lög nr. 90/2003 (tekjuskatt, B-liður)' },
    { heimild: 'Þingsályktun nr. 32/148' },
  ];
  assert.deepEqual(ollLog(f), [{ nr: 90, ar: 2003 }, { nr: 38, ar: 2020 }]);
});

// ── Lagasafns-vísirinn: kandídatar verða að bera laganúmer, annars hverfa þeir aldrei ──
// Brotið hér að neðan er ORÐRÉTT úr althingi.is/lagasafn/ (13.9.2026).
const VISIR_BROT = `<li data-laganumer="71/2026" data-laganumer-texti="lög numer 71 frá 2026" data-rodun="ráðstöfun viðbótariðgjalds"><a href="/lagas/157c/2026071.html">Lög um ráðstöfun viðbótariðgjalds til séreignarsparnaðar inn á höfuðstól húsnæðislána</a>, 2026 nr. 71 28. júní</li>
  <li data-laganumer="144/1998" data-laganumer-texti="lög numer 144"><a href="/lagas/157c/1998144.html">Lög um eitthvað annað</a>, 1998 nr. 144</li>`;

test('lagaVisir les númer úr data-laganumer, ekki úr slóðinni', async () => {
  const { lagaVisir } = await import('./lib/ivilnanir.mjs');
  const v = lagaVisir(VISIR_BROT);
  assert.equal(v.length, 2);
  assert.deepEqual(v[0], { nr: 71, ar: 2026, heiti: 'Lög um ráðstöfun viðbótariðgjalds til séreignarsparnaðar inn á höfuðstól húsnæðislána' });
  assert.deepEqual(v[1], { nr: 144, ar: 1998, heiti: 'Lög um eitthvað annað' });
});

test('normTitill brúar bil auglýsingar og vísis (hástafir + punktur)', async () => {
  const { normTitill } = await import('./lib/ivilnanir.mjs');
  assert.equal(
    normTitill('LÖG um ráðstöfun viðbótariðgjalds til séreignarsparnaðar inn á höfuðstól húsnæðislána.'),
    normTitill('Lög um ráðstöfun viðbótariðgjalds til séreignarsparnaðar inn á höfuðstól húsnæðislána'));
});

test('titilTafla flettir auglýsingatitli upp í laganúmer', async () => {
  const { lagaVisir, titilTafla, normTitill } = await import('./lib/ivilnanir.mjs');
  const t = titilTafla(lagaVisir(VISIR_BROT));
  assert.deepEqual(t.get(normTitill('LÖG um ráðstöfun viðbótariðgjalds til séreignarsparnaðar inn á höfuðstól húsnæðislána.')),
    { nr: 71, ar: 2026 });
  assert.equal(t.get(normTitill('LÖG um eitthvað sem er ekki til.')), undefined);
});

test('breytingalög eru EKKI vöktuð — þau renna inn í meginlögin og 404 er eðlilegt', () => {
  const s = 'Lög nr. 52/2016 (almennar íbúðir), 11. og 14. gr. — hlutfall ríkisins hækkað með breytingalögum nr. 67/2026';
  assert.deepEqual(lagaTilvisanir(s), [{ nr: 52, ar: 2016 }]);
});
