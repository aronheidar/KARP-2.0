import test from 'node:test';
import assert from 'node:assert/strict';
import { promptLine, parseScores, updateStmt } from './sentiment-ai.mjs';

test('promptLine bætir lýsingu við en tvítekur ekki fyrirsögnina', () => {
  const r = { title: 'Brim tapar', body: 'Brim tapar 300 milljónum á fyrsta ársfjórðungi' };
  const l = promptLine(r, 0);
  assert.match(l, /^1\. Brim tapar — 300 milljónum/);
  assert.equal((l.match(/Brim tapar/g) || []).length, 1);   // ekki tvítekið
});

test('promptLine þolir tómt/vantandi body', () => {
  assert.equal(promptLine({ title: 'Bara fyrirsögn' }, 4), '5. Bara fyrirsögn');
  assert.equal(promptLine({}, 0), '1. ');
});

test('parseScores les hreint JSON-fylki', () => {
  assert.deepEqual(parseScores('[1,0,-1]', 3), [1, 0, -1]);
});

test('parseScores les fylki innan úr ```json-blokk og texta', () => {
  assert.deepEqual(parseScores('Hér eru stigin:\n```json\n[0, 1]\n```\n', 2), [0, 1]);
});

test('parseScores HAFNAR röngum fjölda — annars lendir tónn á RANGRI frétt', () => {
  assert.equal(parseScores('[1,0]', 3), null);
  assert.equal(parseScores('[1,0,-1,1]', 3), null);
});

test('parseScores hafnar rusli', () => {
  assert.equal(parseScores('ekkert fylki hér', 2), null);
  assert.equal(parseScores('[1,"x"]', 2), null);
  assert.equal(parseScores('', 1), null);
  assert.equal(parseScores(null, 1), null);
});

test('parseScores klemmir gildi í -1|0|1', () => {
  assert.deepEqual(parseScores('[5,-9,0.4,-0.2]', 4), [1, -1, 1, -1]);
});

test('updateStmt býr til eina bundna setningu (engin innskeyting)', () => {
  const rows = [{ url: 'a' }, { url: 'b' }];
  const u = updateStmt(rows, [1, -1]);
  assert.match(u.sql, /^UPDATE news SET sent_ai = CASE url WHEN \? THEN \? WHEN \? THEN \? END WHERE url IN \(\?,\?\)$/);
  assert.deepEqual(u.binds, ['a', 1, 'b', -1, 'a', 'b']);
});

test('updateStmt skilar null við ósamræmi (verndar gegn skakkri skrift)', () => {
  assert.equal(updateStmt([{ url: 'a' }], [1, 0]), null);
  assert.equal(updateStmt([], []), null);
  assert.equal(updateStmt(null, null), null);
});
