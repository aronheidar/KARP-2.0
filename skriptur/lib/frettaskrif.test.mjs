import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skrifaFrettir, thattaSvar, samantektMd, efnisgreinMd, snidFyrir, styttaTitil, hafnadarLinur, SJALFGEFID_LIKAN, KERFI } from './frettaskrif.mjs';

/** Gervi-client: hvert kall tekur næsta svar — strengur, fall af beiðni, Error sem kastast, eða hlutur
 *  { text, stop_reason, hugsun } þar sem hugsun:true setur thinking-blokk (án .text) Á UNDAN text-blokkinni,
 *  eins og claude-opus-5 gerir með aðlögunarhæfri hugsun. */
function gervi(svor) {
  const kol = [];
  return { kol, messages: { create: async (req) => {
    kol.push(JSON.parse(JSON.stringify(req)));
    let s = svor.shift();
    if (s instanceof Error) throw s;
    if (typeof s === 'function') s = s(req);
    const o = s && typeof s === 'object' ? s : { text: s };
    const content = [];
    // hugsunin ber JSON-líkan streng með rangri tölu: sá sem læsi .thinking fengi ranga frétt
    if (o.hugsun) content.push({ type: 'thinking', thinking: '{"title":"Síminn lækkar um 9,9%","text":"9,9%"}', signature: 'sig' });
    content.push({ type: 'text', text: o.text });
    return { content, stop_reason: o.stop_reason || 'end_turn' };
  } } };
}
const SIMINN = () => ({ id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 }, title: 'gamall titill', text: 'gamall texti' });
const J = (title, text) => JSON.stringify({ title, text });
const GOTT = J('Síminn lækkar um 7,3%', 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.');
const RANGT = J('Síminn lækkar um 7,5%', 'Hlutabréf í Símanum lækkuðu um 7,5%.');

test('stenst í fyrstu atrennu: nýr texti, nýtt líkan, skyndiminni á fyrirmælum, tölusnið', async () => {
  const c = gervi([GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.deepEqual(t, { skrifadar: 1, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0, hafnadar: [] });
  assert.equal(e.ai, true);
  assert.equal(e.title, 'Síminn lækkar um 7,3%');
  assert.equal(c.kol[0].model, SJALFGEFID_LIKAN);
  assert.equal(c.kol[0].system[0].cache_control.type, 'ephemeral');
  assert.equal(JSON.parse(c.kol[0].messages[0].content).snid, 'tolur');
});

test('talnavörn fellir → EITT endurskrif sem nefnir röngu töluna', async () => {
  const c = gervi([RANGT, GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.endurskrifadar, 1);
  assert.equal(t.skrifadar, 1);
  assert.equal(c.kol.length, 2);
  const sidast = c.kol[1].messages[c.kol[1].messages.length - 1].content;
  assert.match(sidast, /7,5%/);
  assert.equal(c.kol[1].messages[1].role, 'assistant');
});

test('fellur tvisvar → sniðmát helst og röngu tölurnar skráðar', async () => {
  const c = gervi([RANGT, RANGT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.hafnad, 1);
  assert.equal(e.ai, undefined);
  assert.equal(e.title, 'gamall titill');
  assert.deepEqual(e.talnavorn, ['7,5%']);
});

test('ógilt JSON → endurskrif; ógilt aftur → sniðmát', async () => {
  const c = gervi(['ekki json', 'ekki heldur']); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.hafnad, 1);
  assert.equal(c.kol.length, 2);
  assert.equal(e.text, 'gamall texti');
});

test('hrá línuskil inni í JSON-streng eru löguð (þekkt Claude-gildra)', () => {
  const r = thattaSvar('{"title":"T","text":"Fyrsta málsgrein.\n\nÖnnur málsgrein."}');
  assert.equal(r.text, 'Fyrsta málsgrein.\n\nÖnnur málsgrein.');
});

test('API-villa fellir ekki næstu frétt; þak og noai virt', async () => {
  const c = gervi([new Error('529 overloaded'), GOTT]);
  const a = SIMINN(), b = SIMINN(), n = { ...SIMINN(), id: 'vikan-x', noai: true }, d = SIMINN();
  const t = await skrifaFrettir([a, n, b, d], { client: c, hamark: 2, skra: () => {} });
  assert.equal(t.villur, 1);
  assert.equal(t.skrifadar, 1);
  assert.equal(t.sleppt, 1, 'd er utan þaks');
  assert.equal(a.text, 'gamall texti');
  assert.equal(b.ai, true);
  assert.equal(c.kol.length, 2, 'noai sent aldrei');
  assert.deepEqual(t.hafnadar, [{ id: 'mark-x', astaeda: 'villa' }]);
});

test('efnismál fá efnissnið; samantekt sýnir áður/nýtt, bakgrunn og höfnun', () => {
  assert.equal(snidFyrir('urslit'), 'efni');
  assert.equal(snidFyrir('mark'), 'tolur');
  const md = samantektMd([
    { id: 'a', type: 'urslit', ai: true, title: 'Nýtt', text: 'Nýr texti.', gamall: { title: 'Gamalt', text: 'Gamall texti.' }, facts: { bakgrunnur: { x: 1 } } },
    { id: 'b', type: 'mark', title: 'Sniðmát', text: 'S.', talnavorn: ['7,5%'], facts: {} },
  ], { titill: 'Prófun' });
  assert.match(md, /Áður/);
  assert.match(md, /"x":1/);
  assert.match(md, /Talnavörn hafnaði.*7,5%/);
});

test('titill lengri en 90 stafir kallar á endurskrif sem nefnir mörkin (90)', async () => {
  const langurTitill = 'orð '.repeat(25); // 100 stafir — tölurnar réttar strax
  const FYRSTA = J(langurTitill, 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.');
  const c = gervi([FYRSTA, GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(e.ai, true);
  assert.equal(c.kol.length, 2);
  assert.equal(t.endurskrifadar, 1);
  const sidast = c.kol[1].messages[c.kol[1].messages.length - 1].content;
  assert.match(sidast, /90/);
});

test('titill enn of langur eftir endurskrif → samþykktur og styttur við orðaskil', async () => {
  const langurTitill = 'orð '.repeat(30); // 120 stafir, tölurnar réttar í bæði skiptin
  const SVAR = J(langurTitill, 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.');
  const c = gervi([SVAR, SVAR]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(e.ai, true);
  assert.ok(e.title.length <= 90);
  assert.equal(langurTitill[e.title.length], ' ', 'sker við orðaskil, ekki í miðju orði');
});

test('styttaTitil: óbreytt undir mörkum, sker við orðaskil annars, fer aldrei yfir hámarki', () => {
  assert.equal(styttaTitil('Stuttur titill'), 'Stuttur titill');
  const langur = 'orð '.repeat(30);
  const stytt = styttaTitil(langur);
  assert.ok(stytt.length <= 90);
  assert.equal(langur[stytt.length], ' ');
  assert.equal(styttaTitil('x'.repeat(200), 90).length, 90);
});

test('endurskrifskall bregst eftir talnavarnarhöfnun → villur teljast, talnavörn geymist, sniðmát helst', async () => {
  const c = gervi([RANGT, new Error('529 overloaded')]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c, skra: () => {} });
  assert.equal(t.villur, 1);
  assert.deepEqual(e.talnavorn, ['7,5%']);
  assert.equal(e.text, 'gamall texti');
  assert.equal(e.ai, undefined);
});

test('samþykkt hreinsar gamalt talnavörn-merki af fyrri keyrslu', async () => {
  const c = gervi([GOTT]); const e = SIMINN(); e.talnavorn = ['gamalt'];
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(e.ai, true);
  assert.equal(e.talnavorn, undefined);
});

// Talnavörnin athugar að tala SÉ til, ekki hvað hún merkir; fyrirmælin verða að banna merkingarvillurnar sjálf.
test('fyrirmælin banna efstastig og tímabilsfullyrðingar sem facts segja ekki berum orðum', () => {
  for (const s of ['í röð', 'frá upphafi', 'í fyrsta sinn', 'síðan', 'á árinu', 'í gagnaröð Karp']) assert.ok(KERFI.includes(s), s);
});

// ── Kallið sjálft (yfirferð 22.9): max_tokens, effort, stop_reason, hugsun, tímaþak ──────────────
test('hvert kall: max_tokens 4096 og effort low, líka endurskrifið; hugsun er ekki gerð óvirk', async () => {
  const c = gervi([RANGT, GOTT]);
  await skrifaFrettir([SIMINN()], { client: c });
  assert.equal(c.kol.length, 2);
  for (const k of c.kol) {
    assert.equal(k.max_tokens, 4096);
    assert.deepEqual(k.output_config, { effort: 'low' });
    assert.equal(k.thinking, undefined, 'skjöl vara við thinking:disabled, hugsun lekur þá inn í textann');
  }
});

test('svar sem byrjar á thinking-blokk (án .text): aðeins text-blokkin er lesin', async () => {
  const c = gervi([{ text: GOTT, hugsun: true }]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.skrifadar, 1);
  assert.equal(e.title, 'Síminn lækkar um 7,3%');
  assert.doesNotMatch(e.text, /9,9/);
});

test('stop_reason max_tokens → hafnað strax, endurskrifinu er ekki eytt á klippt svar', async () => {
  const c = gervi([{ text: '{"title":"Síminn lækk', stop_reason: 'max_tokens' }]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(c.kol.length, 1);
  assert.equal(t.endurskrifadar, 0);
  assert.equal(t.hafnad, 1);
  assert.deepEqual(t.hafnadar, [{ id: 'mark-x', astaeda: 'max_tokens' }]);
  assert.equal(e.text, 'gamall texti');
  assert.equal(e.ai, undefined);
});

test('stop_reason refusal → hafnað strax án endurskrifs, jafnvel þótt texti fylgi', async () => {
  const c = gervi([{ text: GOTT, stop_reason: 'refusal' }]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(c.kol.length, 1);
  assert.deepEqual(t.hafnadar, [{ id: 'mark-x', astaeda: 'refusal' }]);
  assert.equal(e.ai, undefined);
});

test('max_tokens í endurskrifinu → hafnað með þeirri ástæðu', async () => {
  const c = gervi([RANGT, { text: GOTT, stop_reason: 'max_tokens' }]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(c.kol.length, 2);
  assert.equal(t.endurskrifadar, 1);
  assert.deepEqual(t.hafnadar, [{ id: 'mark-x', astaeda: 'max_tokens' }]);
  assert.equal(e.ai, undefined);
});

test('tölfræðin skráir hverja höfnun: id, ástæðu og röngu tölurnar; línurnar prentast', async () => {
  const c = gervi([RANGT, RANGT, 'ekki json', 'ekki heldur', new Error('529 overloaded')]);
  const a = SIMINN(), b = { ...SIMINN(), id: 'mark-y' }, d = { ...SIMINN(), id: 'mark-z' };
  const t = await skrifaFrettir([a, b, d], { client: c, skra: () => {} });
  assert.deepEqual(t.hafnadar, [
    { id: 'mark-x', astaeda: 'tolur', rangar: ['7,5%'] },
    { id: 'mark-y', astaeda: 'json' },
    { id: 'mark-z', astaeda: 'villa' },
  ]);
  assert.equal(t.hafnad, 2);
  assert.equal(t.villur, 1);
  assert.deepEqual(hafnadarLinur(t.hafnadar), ['• hafnað: mark-x · tolur · 7,5%', '• hafnað: mark-y · json', '• hafnað: mark-z · villa']);
});

test('tímaþak: eftir þakið byrjar engin ný frétt og afgangurinn heldur sniðmáti (sleppt)', async () => {
  let klukka = 0;
  const skref = () => { klukka += 5 * 60000; return GOTT; };   // hvert kall tekur 5 mínútur
  const c = gervi([skref, skref, skref, GOTT]);
  const ev = [SIMINN(), SIMINN(), SIMINN(), SIMINN()];
  const t = await skrifaFrettir(ev, { client: c, nu: () => klukka, timaThak: 12 * 60000, skra: () => {} });
  assert.equal(t.skrifadar, 3, 'fréttir byrja kl. 0, 5 og 10 mín; sú fjórða hefði byrjað kl. 15');
  assert.equal(t.sleppt, 1);
  assert.equal(c.kol.length, 3);
  assert.equal(ev[3].text, 'gamall texti');
  assert.equal(ev[3].ai, undefined);
});

// Prufuhamurinn prentar hverja frétt jafnóðum (I7), svo sýnishorn glatist ekki þótt vinnuflæðið nái tímamörkum.
test('eftirHverja kallast strax eftir hverja frétt, áður en sú næsta er skrifuð, með höfnuninni ef hún varð', async () => {
  const kallad = [];
  const c = gervi([() => { kallad.push('kall1'); return GOTT; }, () => { kallad.push('kall2'); return RANGT; }, RANGT]);
  const a = SIMINN(), b = { ...SIMINN(), id: 'mark-y' };
  await skrifaFrettir([a, b], { client: c, eftirHverja: (e, h) => kallad.push(e.id + (h ? ':' + h.astaeda : '')) });
  assert.deepEqual(kallad, ['kall1', 'mark-x', 'kall2', 'mark-y:tolur']);
});

test('prentun sem bregst stöðvar ekki ritunina', async () => {
  const c = gervi([GOTT, GOTT]);
  const t = await skrifaFrettir([SIMINN(), SIMINN()], { client: c, skra: () => {}, eftirHverja: () => { throw new Error('diskur fullur'); } });
  assert.equal(t.skrifadar, 2);
});

test('efnisgreinMd: ein frétt með áður/nýtt, bakgrunni og höfnunarástæðu', () => {
  const md = efnisgreinMd({ id: 'b', type: 'mark', title: 'Sniðmát', text: 'S.', gamall: { title: 'Gamalt', text: 'G.' }, facts: { bakgrunnur: { x: 1 } } }, { id: 'b', astaeda: 'tolur', rangar: ['7,5%'] });
  assert.match(md, /^### mark · b/);
  assert.match(md, /Áður:\*\* Gamalt/);
  assert.match(md, /Sniðmát \(ekki vélskrifað\)/);
  assert.match(md, /"x":1/);
  assert.match(md, /Hafnað:_ tolur · 7,5%/);
});

test('sjálfgefið tímaþak er 12 mínútur', async () => {
  const keyra = async (lidid) => {
    let klukka = 0;
    const c = gervi([() => { klukka = lidid; return GOTT; }, GOTT]);
    return skrifaFrettir([SIMINN(), SIMINN()], { client: c, nu: () => klukka, skra: () => {} });
  };
  assert.equal((await keyra(11.9 * 60000)).skrifadar, 2, 'fyrir 12 mín byrjar næsta frétt');
  const eftir = await keyra(12 * 60000);
  assert.equal(eftir.skrifadar, 1);
  assert.equal(eftir.sleppt, 1, 'eftir 12 mín byrjar engin ný frétt');
});
