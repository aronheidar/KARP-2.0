// Samningsbundinn aðgangur (Allt fasteignasala o.fl.) — réttindi sem koma úr samningi utan Áskels.
// ⚠⚠ Samningsaðgangur má ALDREI lenda í sub_service: stjórnborðið telur hverja röð þar á listaverði
//    í MRR og vistar töluna í daglegri MRR-sögu. Tíu starfsmenn Allt yrðu 39.000 kr „tekjur" sem koma
//    aldrei um Áskel. Þess vegna býr samningurinn hér og réttindin eru leidd af honum í /me.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMNINGAR, samningurNotanda, samningsThjonustur, anLykilords, BOD_GILDI_SEK, bodHlekkur, fornafn, askriftarLina,
} from './samningar.mjs';
import { _svcOk } from '../worker/auth.mjs';

const NU = Date.parse('2026-09-22T12:00:00Z') / 1000;

test('samningaskráin er lokaður listi og Allt er í honum með fasteignamatið', () => {
  assert.deepEqual(Object.keys(SAMNINGAR), ['allt']);
  assert.equal(SAMNINGAR.allt.nafn, 'Allt fasteignasala');
  assert.equal(SAMNINGAR.allt.stutt, 'Allt');
  assert.deepEqual(SAMNINGAR.allt.thjonustur, ['fasteign']);
});

test('notandi á samningi fær samninginn', () => {
  const s = samningurNotanda({ id: 40, samningur: 'allt' }, NU);
  assert.equal(s.id, 'allt');
  assert.equal(s.nafn, 'Allt fasteignasala');
  assert.deepEqual(s.thjonustur, ['fasteign']);
});

test('samningurinn á tengilið hjá Karp sem svör starfsfólksins berast til', () => {
  assert.equal(samningurNotanda({ samningur: 'allt' }, NU).tengilidur, 'aron@karp.is');
});

test('⚠ hver samningur í skránni er heill: dagsetningar á réttu sniði, gildar þjónustur, netfang', () => {
  // Rangt snið á `til` gerði samanburðinn alltaf ósannan og samningurinn rynni ALDREI út (fellur opið).
  const DAGS = /^\d{4}-\d{2}-\d{2}$/;
  for (const [id, s] of Object.entries(SAMNINGAR)) {
    assert.ok(s.nafn && s.stutt, id + ' vantar nafn');
    assert.ok(DAGS.test(s.fra) && !Number.isNaN(Date.parse(s.fra)), id + ': fra');
    assert.ok(s.til === null || (DAGS.test(s.til) && !Number.isNaN(Date.parse(s.til))), id + ': til verður að vera null eða YYYY-MM-DD');
    assert.ok(Array.isArray(s.thjonustur) && s.thjonustur.length > 0, id + ': engar þjónustur');
    for (const t of s.thjonustur) assert.ok(_svcOk(t), id + ': óþekkt þjónusta ' + t);
    assert.match(s.tengilidur, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, id + ': tengiliður');
  }
});

test('notandi án samnings, óþekktur samningur og enginn notandi skila null', () => {
  assert.equal(samningurNotanda({ id: 1, samningur: null }, NU), null);
  assert.equal(samningurNotanda({ id: 1 }, NU), null);
  assert.equal(samningurNotanda({ id: 1, samningur: 'einhver-annar' }, NU), null);
  assert.equal(samningurNotanda(null, NU), null);
});

test('⚠ útrunninn samningur veitir ekkert, en síðasti dagurinn er með', () => {
  const skra = { gamall: { nafn: 'Gömul stofa', stutt: 'Gömul', thjonustur: ['fasteign'], til: '2026-09-21' },
    dagurinn: { nafn: 'Stofa', stutt: 'Stofa', thjonustur: ['fasteign'], til: '2026-09-22' } };
  assert.equal(samningurNotanda({ samningur: 'gamall' }, NU, skra), null);
  assert.equal(samningurNotanda({ samningur: 'dagurinn' }, NU, skra).id, 'dagurinn');
});

test('⚠ lykill af frumgerðinni (t.d. toString) er ekki samningur', () => {
  assert.equal(samningurNotanda({ samningur: 'toString' }, NU), null);
  assert.equal(samningurNotanda({ samningur: '__proto__' }, NU), null);
});

test('samningsThjonustur skilar þjónustum samningsins, annars tómu', () => {
  assert.deepEqual(samningsThjonustur({ samningur: 'allt' }, NU), ['fasteign']);
  assert.deepEqual(samningsThjonustur({ samningur: null }, NU), []);
  assert.deepEqual(samningsThjonustur(null, NU), []);
});

test('samningsThjonustur skilar afriti, svo kallandi getur ekki breytt skránni', () => {
  const t = samningsThjonustur({ samningur: 'allt' }, NU);
  t.push('frettir');
  assert.deepEqual(SAMNINGAR.allt.thjonustur, ['fasteign']);
});

test('anLykilords: aðeins pbkdf2-hash telst lykilorð', () => {
  assert.equal(anLykilords('pbkdf2$100000$c2FsdA$aGFzaA'), false);
  assert.equal(anLykilords('!'), true, 'aðgangur stofnaður án lykilorðs (boð)');
  assert.equal(anLykilords(''), true);
  assert.equal(anLykilords(null), true);
});

test('boðshlekkurinn gildir í viku og fer á /endurstilla/ í boðs-ham', () => {
  assert.equal(BOD_GILDI_SEK, 7 * 86400);
  assert.equal(bodHlekkur('abc123'), 'https://karp.is/endurstilla/?token=abc123&bod=1');
});

test('fornafn tekur fyrsta orðið og þolir tómt', () => {
  // ⚠ Repóið er opinbert: tilbúin nöfn, aldrei raunverulegt starfsfólk samningsaðila.
  assert.equal(fornafn('Jón Þór Jónsson'), 'Jón');
  assert.equal(fornafn('  Anna Björk '), 'Anna');
  assert.equal(fornafn(''), '');
  assert.equal(fornafn(null), '');
});

test('áskriftarlína: samningsþjónusta er ótakmörkuð, án uppsagnar og nefnir samninginn', () => {
  const u = { subs: ['fasteign'], samningur: { id: 'allt', nafn: 'Allt fasteignasala', thjonustur: ['fasteign'] } };
  assert.deepEqual(askriftarLina('fasteign', u), { kvoti: 'ótakmörkuð verðmöt', uppsogn: false, samningur: 'Allt fasteignasala' });
});

test('áskriftarlína: venjuleg áskrift sýnir kvótann og má segja henni upp', () => {
  const u = { subs: ['fasteign'], svcQuota: { fasteign: { used: 15, quota: 20, remaining: 5 } } };
  assert.deepEqual(askriftarLina('fasteign', u), { kvoti: '5 af 20 eftir í mánuðinum', uppsogn: true, samningur: null });
});

test('áskriftarlína: ótakmörkuð Fasteignavakt (quota -1) segir það, og henni má segja upp', () => {
  const u = { subs: ['fasteign'], svcQuota: { fasteign: { used: 30, quota: -1, remaining: -1 } } };
  assert.deepEqual(askriftarLina('fasteign', u), { kvoti: 'ótakmörkuð verðmöt', uppsogn: true, samningur: null });
});

test('áskriftarlína: áskrift án kvóta hefur engan kvótatexta', () => {
  assert.deepEqual(askriftarLina('utbod', { subs: ['utbod'] }), { kvoti: '', uppsogn: true, samningur: null });
});

test('áskriftarlína: samningur um AÐRA þjónustu breytir ekki eigin áskrift', () => {
  const u = { subs: ['fasteign', 'utbod'], samningur: { id: 'allt', nafn: 'Allt fasteignasala', thjonustur: ['fasteign'] } };
  assert.equal(askriftarLina('utbod', u).uppsogn, true);
  assert.equal(askriftarLina('utbod', u).samningur, null);
});
