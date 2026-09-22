import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skrifaFrettir, thattaSvar, samantektMd, snidFyrir, styttaTitil, SJALFGEFID_LIKAN } from './frettaskrif.mjs';

/** Gervi-client: hvert kall tekur næsta svar (strengur, fall af beiðni, eða Error sem kastast). */
function gervi(svor) {
  const kol = [];
  return { kol, messages: { create: async (req) => {
    kol.push(JSON.parse(JSON.stringify(req)));
    const s = svor.shift();
    if (s instanceof Error) throw s;
    return { content: [{ type: 'text', text: typeof s === 'function' ? s(req) : s }] };
  } } };
}
const SIMINN = () => ({ id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 }, title: 'gamall titill', text: 'gamall texti' });
const J = (title, text) => JSON.stringify({ title, text });
const GOTT = J('Síminn lækkar um 7,3%', 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.');
const RANGT = J('Síminn lækkar um 7,5%', 'Hlutabréf í Símanum lækkuðu um 7,5%.');

test('stenst í fyrstu atrennu: nýr texti, nýtt líkan, skyndiminni á fyrirmælum, tölusnið', async () => {
  const c = gervi([GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.deepEqual(t, { skrifadar: 1, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0 });
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
