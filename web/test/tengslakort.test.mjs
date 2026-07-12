import { test } from 'node:test';
import assert from 'node:assert';
import { buildElements } from '../src/lib/tengslakort.mjs';

const eignData = {
  kt: '5555555555',
  net: {
    nodes: [
      { id: 'root', kt: '5555555555', nafn: 'Rót ehf.', tegund: 'felag', er_rot: true },
      { id: 'valafel', kt: '4444444444', nafn: 'Vala hf.', tegund: 'felag' },
      { id: 'jon', kt: null, nafn: 'Jón Jónsson', tegund: 'einst', faeding: '1970' },
    ],
    edges: [
      { fra: 'valafel', til: 'root', hlutur: 80, band: '51' },
      { fra: 'jon', til: 'valafel', hlutur: 100, band: '51' },
    ],
  },
};
const nodesOf = (els) => els.filter((e) => !e.data.source);
const edgesOf = (els) => els.filter((e) => e.data.source);

test('buildElements: ownership-only graph when stjornData is null', () => {
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData: null });
  assert.equal(nodesOf(els).length, 3);
  assert.equal(edgesOf(els).length, 2);
  const root = nodesOf(els).find((n) => n.data.rot);
  assert.equal(root.data.id, 'c:5555555555');
  assert.equal(root.data.tegund, 'felag');
  assert.ok(edgesOf(els).every((e) => e.data.tegund === 'eign'));
  assert.ok(nodesOf(els).every((n) => !n.data.maskad));
  // ownership edge points owner -> company
  const oe = edgesOf(els).find((e) => e.data.target === 'c:5555555555');
  assert.equal(oe.data.source, 'c:4444444444');
  assert.equal(oe.data.label, '80%');
});

test('buildElements: named stjornandi adds a governance edge to root', () => {
  const stjornData = { holdur: true, felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }], stjornendur: [{ nafn: 'Anna Ansdóttir', hlutverk_rot: ['stjórn'], onnur: [] }], krossar: [] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  const anna = nodesOf(els).find((n) => n.data.nafn === 'Anna Ansdóttir');
  assert.ok(anna, 'named stjornandi node present');
  assert.equal(anna.data.maskad, false);
  const gov = edgesOf(els).find((e) => e.data.source === anna.data.id && e.data.tegund === 'stjorn');
  assert.ok(gov, 'governance edge present');
  assert.equal(gov.data.target, 'c:5555555555');
});

test('buildElements: masked krossar person carries a token, never a name', () => {
  const stjornData = { holdur: true, felog: [{ kt: '5555555555', nafn: 'Rót ehf.' }], stjornendur: [], krossar: [{ token: 'E1', maskad: true, felog: [{ kt: '4444444444', nafn: 'Vala hf.' }, { kt: '3333333333', nafn: 'Beta ehf.' }] }] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  const masked = nodesOf(els).filter((n) => n.data.maskad);
  assert.equal(masked.length, 1);
  assert.equal(masked[0].data.nafn, null);
  assert.equal(masked[0].data.label, 'E1');
  assert.ok(masked[0].data.id.startsWith('p:tok:'));
  assert.ok(edgesOf(els).some((e) => e.data.source === masked[0].data.id && e.data.target === 'c:3333333333' && e.data.tegund === 'stjorn'));
});

test('buildElements: a company shared by both datasets appears once', () => {
  const stjornData = { holdur: true, felog: [{ kt: '4444444444', nafn: 'Vala hf.' }], stjornendur: [], krossar: [] };
  const els = buildElements({ rotKt: '5555555555', eignData, stjornData });
  assert.equal(nodesOf(els).filter((n) => n.data.id === 'c:4444444444').length, 1);
});

test('buildElements: tolerates empty/missing eignData.net', () => {
  const els = buildElements({ rotKt: '5555555555', eignData: {}, stjornData: null });
  assert.deepEqual(els, []);
});
