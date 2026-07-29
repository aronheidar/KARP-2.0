import { test } from 'node:test';
import assert from 'node:assert';
import {
  SECTORS, ALL_SECTORS, SECTOR_HINTS,
  matchItem, matchKeyword, matchNews, filterFeed, feedFor, newSince, classifyHeuristic, stigRank, isatToSector,
} from './lobbyvakt.mjs';

// ── fixtures ──────────────────────────────────────────────────────────────
const ITEMS = [
  { id: 'a1', kind: 'thingmal', titill: 'Frumvarp um veiðigjald', greinar: ['sjavarutvegur'], frestur: null, dags: '2026-07-01' },
  { id: 'a2', kind: 'samrad', titill: 'Samráð um byggingarreglugerð', greinar: ['bygging'], frestur: '2026-08-15', dags: '2026-07-10' },
  { id: 'a3', kind: 'samrad', titill: 'Skattalagabreyting', greinar: ['almennt'], frestur: '2026-08-01', dags: '2026-07-05' },
  { id: 'a4', kind: 'thingmal', titill: 'Um fiskeldi', greinar: ['sjavarutvegur'], frestur: null, dags: '2026-07-15' },
  { id: 'a5', kind: 'samrad', titill: 'Um ferðaþjónustu', greinar: ['ferdathjonusta'], frestur: null, dags: '2026-07-20' },
];

// ── taxonomy ──────────────────────────────────────────────────────────────
test('SECTORS/ALL_SECTORS: 16 greinar, ALL_SECTORS = lyklar SECTORS', () => {
  assert.equal(ALL_SECTORS.length, 16);
  assert.deepEqual(ALL_SECTORS, Object.keys(SECTORS));
  assert.ok(ALL_SECTORS.includes('almennt'));
  assert.equal(SECTORS.sjavarutvegur, 'Sjávarútvegur');
});
test('SECTOR_HINTS: nær yfir allar 16 greinar með fylki af leitarorðum', () => {
  for (const code of ALL_SECTORS) {
    assert.ok(Array.isArray(SECTOR_HINTS[code]) && SECTOR_HINTS[code].length > 0, `vantar hints fyrir ${code}`);
  }
});

// ── matchItem ─────────────────────────────────────────────────────────────
test('matchItem: skörun milli item.greinar og userSectors = true', () => {
  assert.equal(matchItem({ greinar: ['bygging'] }, ['orka', 'bygging']), true);
});
test('matchItem: almennt-mál = true óháð userSectors (líka tómt/ótengt)', () => {
  assert.equal(matchItem({ greinar: ['almennt'] }, []), true);
  assert.equal(matchItem({ greinar: ['almennt'] }, ['orka']), true);
  assert.equal(matchItem({ greinar: ['almennt'] }, undefined), true);
});
test('matchItem: engin skörun = false', () => {
  assert.equal(matchItem({ greinar: ['bygging'] }, ['orka']), false);
});
test('matchItem: vantar/tómt greinar = false (nema almennt)', () => {
  assert.equal(matchItem({ greinar: [] }, ['orka']), false);
  assert.equal(matchItem({}, ['orka']), false);
  assert.equal(matchItem(null, ['orka']), false);
});

// ── filterFeed ────────────────────────────────────────────────────────────
test('filterFeed: mutar ekki inntak og skilar nýju fylki', () => {
  const items = ITEMS.map((x) => ({ ...x }));
  const before = JSON.stringify(items);
  const out = filterFeed(items, ['bygging']);
  assert.notEqual(out, items);
  assert.equal(JSON.stringify(items), before);
});
test('filterFeed: réttur fjöldi eftir síun (grein + almennt alltaf með)', () => {
  const out = filterFeed(ITEMS, ['bygging']);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((x) => x.id).sort(), ['a2', 'a3']);
});
test('filterFeed: frestur-mál raðast á undan frestlausum; næsti frestur efst; frestlaus eftir dags lækkandi', () => {
  const out = filterFeed(ITEMS, ['sjavarutvegur', 'bygging', 'almennt', 'ferdathjonusta']);
  assert.deepEqual(out.map((x) => x.id), ['a3', 'a2', 'a5', 'a4', 'a1']);
});
test('filterFeed: tómt/ógilt inntak → tómt fylki', () => {
  assert.deepEqual(filterFeed([], ['bygging']), []);
  assert.deepEqual(filterFeed(null, ['bygging']), []);
});

// ── newSince ──────────────────────────────────────────────────────────────
test('newSince: síar burt seen-id og mál eldri en/jöfn sinceTs (Date.parse, ms)', () => {
  const since = Date.parse('2026-07-10T00:00:00Z');
  const seen = new Set(['a2']);
  const out = newSince(ITEMS, since, seen);
  assert.deepEqual(out.map((x) => x.id).sort(), ['a4', 'a5']);
});
test('newSince: seenIds má vera plain array (ekki bara Set)', () => {
  const out = newSince(ITEMS, Date.parse('2026-07-01'), ['a4']);
  assert.ok(!out.some((x) => x.id === 'a4'));
  assert.ok(!out.some((x) => x.id === 'a1')); // a1.dags === sinceTs, ekki strangt >
});

// ── classifyHeuristic ─────────────────────────────────────────────────────
test('classifyHeuristic: "veiðigjald" texti inniheldur sjavarutvegur', () => {
  const out = classifyHeuristic('Frumvarp um veiðigjald', 'Breyting á lögum um veiðigjald í sjávarútvegi');
  assert.ok(out.includes('sjavarutvegur'));
});
test('classifyHeuristic: ótengdur texti → [\'almennt\']', () => {
  assert.deepEqual(classifyHeuristic('Alveg ótengt titill', 'ekkert sem passar neitt'), ['almennt']);
});
test('classifyHeuristic: hástafanæmi skiptir ekki máli', () => {
  const out = classifyHeuristic('VEIÐIGJALD Í SJÁVARÚTVEGI', '');
  assert.ok(out.includes('sjavarutvegur'));
});

// ── stigRank ──────────────────────────────────────────────────────────────
test('stigRank: Mikil > Miðlungs > Lítil; óþekkt → 2', () => {
  assert.ok(stigRank('Mikil') > stigRank('Miðlungs'));
  assert.ok(stigRank('Miðlungs') > stigRank('Lítil'));
  assert.equal(stigRank('rugl'), 2);
  assert.equal(stigRank(undefined), 2);
});

// ── isatToSector ──────────────────────────────────────────────────────────
test('isatToSector: byggingar-ÍSAT (bókstafur og tölukóði) → bygging', () => {
  assert.equal(isatToSector('F'), 'bygging');
  assert.equal(isatToSector('41'), 'bygging');
  assert.equal(isatToSector('4120'), 'bygging');
});
test('isatToSector: óþekkt/tómt → null', () => {
  assert.equal(isatToSector('Z'), null);
  assert.equal(isatToSector('999'), null);
  assert.equal(isatToSector(''), null);
  assert.equal(isatToSector(null), null);
  assert.equal(isatToSector(undefined), null);
});
test('isatToSector: fiskveiðar (03) sérregla yfir A → sjavarutvegur; annars A → landbunadur', () => {
  assert.equal(isatToSector('03'), 'sjavarutvegur');
  assert.equal(isatToSector('01'), 'landbunadur');
  assert.equal(isatToSector('A'), 'landbunadur');
});
test('isatToSector: matvælaiðnaður (C10/C11) → landbunadur; annað C → idnadur', () => {
  assert.equal(isatToSector('10'), 'landbunadur');
  assert.equal(isatToSector('11'), 'landbunadur');
  assert.equal(isatToSector('20'), 'idnadur');
  assert.equal(isatToSector('C'), 'idnadur');
});
test('isatToSector: fjölmiðla-deildir innan J (58-60) → fjolmidlar; annað J → ut; R → fjolmidlar', () => {
  assert.equal(isatToSector('58'), 'fjolmidlar');
  assert.equal(isatToSector('61'), 'ut');
  assert.equal(isatToSector('R'), 'fjolmidlar');
});

// ── matchKeyword ──────────────────────────────────────────────────────────
test('matchKeyword: leitarorð sem hlutstrengur í titli/brief/efni = true', () => {
  assert.equal(matchKeyword({ titill: 'Frumvarp um veiðigjald' }, ['veiðigjald']), true);
  assert.equal(matchKeyword({ titill: 'X', brief: 'Hefur áhrif á kvóta útgerða' }, ['kvóta']), true);
  assert.equal(matchKeyword({ titill: 'X', efni: ['skattar', 'vsk'] }, ['vsk']), true);
});
test('matchKeyword: hástafanæmi skiptir ekki máli', () => {
  assert.equal(matchKeyword({ titill: 'VEIÐIGJALD Í SJÁVARÚTVEGI' }, ['veiðigjald']), true);
});
test('matchKeyword: tómt/ekkert ord → false; engin samsvörun → false; ógilt item → false', () => {
  assert.equal(matchKeyword({ titill: 'Frumvarp um veiðigjald' }, []), false);
  assert.equal(matchKeyword({ titill: 'Frumvarp um veiðigjald' }, undefined), false);
  assert.equal(matchKeyword({ titill: 'Frumvarp um X' }, ['ferðaþjónusta']), false);
  assert.equal(matchKeyword(null, ['x']), false);
});

// ── feedFor ────────────────────────────────────────────────────────────────
test('feedFor: item er með ef grein EÐA leitarorð passar (a5 grein, a1 orð, a3 almennt)', () => {
  const out = feedFor(ITEMS, { greinar: ['ferdathjonusta'], ord: ['veiðigjald'] });
  assert.deepEqual(out.map((x) => x.id).sort(), ['a1', 'a3', 'a5']);
});
test('feedFor: engin samsvörun (hvorki grein né orð) → tómt fylki', () => {
  const noAlmennt = ITEMS.filter((x) => !x.greinar.includes('almennt'));
  assert.deepEqual(feedFor(noAlmennt, { greinar: ['orka'], ord: ['ekkifinnst'] }), []);
});
test('feedFor: röðun eins og filterFeed þegar aðeins greinar (ord tómt) — sort-jafngildi', () => {
  const greinar = ['sjavarutvegur', 'bygging', 'almennt', 'ferdathjonusta'];
  assert.deepEqual(
    feedFor(ITEMS, { greinar }).map((x) => x.id),
    filterFeed(ITEMS, greinar).map((x) => x.id),
  );
  assert.deepEqual(feedFor(ITEMS, { greinar }).map((x) => x.id), ['a3', 'a2', 'a5', 'a4', 'a1']);
});
test('feedFor: mutar ekki inntak og skilar nýju fylki', () => {
  const items = ITEMS.map((x) => ({ ...x }));
  const before = JSON.stringify(items);
  const out = feedFor(items, { greinar: ['bygging'], ord: ['fiskeldi'] });
  assert.notEqual(out, items);
  assert.equal(JSON.stringify(items), before);
});
test('feedFor: default-args (aðeins items) → aðeins almennt-mál', () => {
  assert.deepEqual(feedFor(ITEMS).map((x) => x.id), ['a3']);
});

// ── matchNews ─────────────────────────────────────────────────────────────
test('matchNews: leitarorð í titli → true', () => {
  assert.equal(matchNews({ title: 'Veiðigjald hækkar', body: '' }, ['veiðigjald']), true);
});
test('matchNews: leitarorð í body, case-insensitive → true', () => {
  assert.equal(matchNews({ title: 'Frétt', body: 'Um LAXELDI í firði' }, ['laxeldi']), true);
});
test('matchNews: les text-reit (sh.news-form) → true', () => {
  assert.equal(matchNews({ title: 'X', text: 'kvótinn seldur' }, ['kvóti']), true);
});
test('matchNews: ekkert match → false', () => {
  assert.equal(matchNews({ title: 'Óskylt', body: 'ekkert hér' }, ['veiðigjald']), false);
});
test('matchNews: tómt ord → false', () => {
  assert.equal(matchNews({ title: 'Veiðigjald', body: '' }, []), false);
});
