import { test } from 'node:test';
import assert from 'node:assert';
import { threadKey, caseThread } from './soguthraedir.mjs';

const BYKT = {
  '4102160270': { notices: [
    { type: 'innkollun', date: '2026-05-05' },
    { type: 'innkollun', date: '2026-04-28' },
    { type: 'gjaldthrot_beidni', date: '2026-03-02' },
  ] },
  '1111111111': { notices: [{ type: 'gjaldthrot_beidni', date: '2026-03-02' }] },
  '2222222222': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-01-10' },
    { type: 'innkollun', date: '2026-02-10' },
    { type: 'skiptalok', date: '2026-06-01' },
  ] },
  '3333333333': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-05-04' },
    { type: 'innkollun', date: '2026-05-06' },
  ] },
  '4444444444': { notices: [
    { type: 'gjaldthrot_beidni', date: '2026-01-01' },
    { type: 'felagsslit', date: '2026-03-01' },
  ] },
};
const gj = (kt, date = '2026-05-06') => ({ id: `gjaldthrot-116-2026-${kt}`, type: 'gjaldthrot', date });

test('threadKey extracts the 10-digit kt from gjaldþrot ids; null otherwise', () => {
  assert.equal(threadKey(gj('4102160270')), '4102160270');
  assert.equal(threadKey({ id: 'domur-lr-545-2026', type: 'domur' }), null);
  assert.equal(threadKey({ id: 'gjaldthrot-116-2026-123', type: 'gjaldthrot' }), null);
  assert.equal(threadKey({ id: 'vika-2026-07-20', type: 'vika' }), null);
  assert.equal(threadKey(null), null);
});

test('caseThread returns null below the 2-notice gate / no kt / kt absent', () => {
  assert.equal(caseThread(gj('1111111111'), BYKT), null);
  assert.equal(caseThread(gj('9999999999'), BYKT), null);
  assert.equal(caseThread({ id: 'vika-x', type: 'vika', date: '2026-01-01' }, BYKT), null);
});

test('caseThread orders steps oldest→newest with verbatim labels', () => {
  const t = caseThread(gj('4102160270'), BYKT);
  assert.equal(t.kt, '4102160270');
  assert.equal(t.n, 3);
  assert.deepEqual(t.steps.map((s) => s.dags), ['2026-03-02', '2026-04-28', '2026-05-05']);
  assert.equal(t.steps[0].titill, 'Gjaldþrotaskiptabeiðni');
  assert.equal(t.steps[1].titill, 'Innköllun þrotabús (kröfulýsing)');
  assert.equal(t.steps[0].birt, '2.3.2026');
});

test('exactly one step is current — nearest item date, ties → newest', () => {
  const t = caseThread(gj('4102160270', '2026-05-06'), BYKT);
  assert.equal(t.steps.filter((s) => s.current).length, 1);
  assert.equal(t.steps[2].current, true);
  const tie = caseThread(gj('3333333333', '2026-05-05'), BYKT);
  assert.equal(tie.steps.filter((s) => s.current).length, 1);
  assert.equal(tie.steps[1].current, true);
});

test('status: terminal notice → done + label; else Í ferli', () => {
  assert.deepEqual(caseThread(gj('2222222222'), BYKT).status, { done: true, label: 'Lauk með skiptalokum 1.6.2026' });
  assert.deepEqual(caseThread(gj('4444444444'), BYKT).status, { done: true, label: 'Félagsslit 1.3.2026' });
  assert.deepEqual(caseThread(gj('4102160270'), BYKT).status, { done: false, label: 'Í ferli' });
});

const tl = (kt, date = '2026-06-02') => ({ id: 'throtlok-' + kt, type: 'throtlok', date });

test('threadKey recognizes the throtlok type', () => {
  assert.equal(threadKey(tl('4102160270')), '4102160270');
  assert.equal(threadKey({ id: 'throtlok-123', type: 'throtlok' }), null);
  assert.equal(threadKey(gj('4102160270')), '4102160270');
  assert.equal(threadKey({ id: 'vika-x', type: 'vika' }), null);
});

test('caseThread on a throtlok item → done/Lokið with the skiptalok step current', () => {
  const t = caseThread(tl('2222222222', '2026-06-02'), BYKT);
  assert.equal(t.status.done, true);
  assert.equal(t.status.label, 'Lauk með skiptalokum 1.6.2026');
  assert.equal(t.steps.find((s) => s.current).titill, 'Skiptalok þrotabús');
});
