import { test } from 'node:test';
import assert from 'node:assert';
import mod from './throtlok_detect.js';
const { pickThrotlok } = mod;

const TL = { skiptalok: 'Skiptalok þrotabús', gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni', felagsslit: 'Félagsslit / afskráning' };
const BYKT = {
  '1000000001': { name: 'Alfa ehf', notices: [
    { type: 'gjaldthrot_beidni', date: '2026-06-20' },
    { type: 'skiptalok', date: '2026-07-10', court: 'Héraðsdómur Reykjavíkur' },
  ] },
  '1000000002': { name: 'Bravó ehf', notices: [
    { type: 'skiptalok', date: '2026-07-05' },
    { type: 'skiptalok', date: '2026-07-12' },
  ] },
  '1000000003': { name: 'Delta ehf', notices: [{ type: 'felagsslit', date: '2026-07-11' }] },
  '1000000004': { name: 'Efla ehf', notices: [{ type: 'skiptalok', date: '2026-05-01' }] },
  '1000000005': { notices: [{ type: 'skiptalok', date: '2026-07-15' }] },
};
const OPTS = { todayISO: '2026-07-20', days: 30, max: 3 };

test('picks recent skiptalok, newest-per-kt, sorted newest-first, capped at max', () => {
  const items = pickThrotlok(BYKT, TL, OPTS);
  assert.deepEqual(items.map((i) => i.id), ['throtlok-1000000002', 'throtlok-1000000001']);
  assert.equal(items[0].facts.dags, '2026-07-12');
  assert.equal(pickThrotlok(BYKT, TL, { ...OPTS, max: 1 }).length, 1);
});

test('excludes felagsslit (non-skiptalok terminal) and stale skiptalok', () => {
  const ids = pickThrotlok(BYKT, TL, OPTS).map((i) => i.id);
  assert.ok(!ids.includes('throtlok-1000000003'));
  assert.ok(!ids.includes('throtlok-1000000004'));
});

test('item shape: id/type/title/facts/samhengi/url', () => {
  const alfa = pickThrotlok(BYKT, TL, OPTS).find((i) => i.id === 'throtlok-1000000001');
  assert.equal(alfa.type, 'throtlok');
  assert.equal(alfa.title, 'Skiptalok þrotabús: Alfa ehf');
  assert.equal(alfa.facts.dags, '2026-07-10');
  assert.equal(alfa.facts.domstoll, 'Héraðsdómur Reykjavíkur');
  assert.equal(alfa.url, '/logbirting/');
  assert.ok(alfa.samhengi.includes('2 þrotabúum'));
  assert.ok(alfa.samhengi.includes('30 daga'));
});

test('a kennitala with no name is skipped', () => {
  const ids = pickThrotlok(BYKT, TL, OPTS).map((i) => i.id);
  assert.ok(!ids.includes('throtlok-1000000005'));
});
