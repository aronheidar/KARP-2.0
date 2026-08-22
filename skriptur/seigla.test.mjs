// Próf fyrir _seigla.js — seiglu-hjálpar build-skripta (sjá tjónið 22.8.2026: althingi.is 429 → tómar skrár committaðar)
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mod from './_seigla.js';
const { writeJsonUnlessEmpty, fetchText, loadPrev } = mod;

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seigla-')), 'x.json');
const quiet = { log: () => {} };
const isEmptyArr = d => !Array.isArray(d) || d.length === 0;
const hdr = (o = {}) => ({ get: k => (k in o ? o[k] : null) });

test('loadPrev: skilar undefined ef skrá vantar eða er ógild JSON', () => {
  assert.equal(loadPrev(path.join(os.tmpdir(), 'seigla-finnst-ekki.json')), undefined);
  const f = tmpFile(); fs.writeFileSync(f, '{ekki json');
  assert.equal(loadPrev(f), undefined);
});

test('writeJsonUnlessEmpty: tóm niðurstaða + fyrri skrá með efni → HELDUR fyrri skrá og varar við', () => {
  const f = tmpFile(); fs.writeFileSync(f, JSON.stringify([{ id: 1, nafn: 'A' }]));
  const logs = [];
  const r = writeJsonUnlessEmpty(f, [], { isEmpty: isEmptyArr, label: 'cabinet.json', logger: { log: m => logs.push(m) } });
  assert.equal(r.kept, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), [{ id: 1, nafn: 'A' }]);
  assert.ok(logs.some(m => m.includes('SEIGLA') && m.includes('cabinet.json')), 'varar við með SEIGLA-merki + skráarnafni');
});

test('writeJsonUnlessEmpty: niðurstaða með efni → skrifar', () => {
  const f = tmpFile(); fs.writeFileSync(f, JSON.stringify([{ id: 1 }]));
  const r = writeJsonUnlessEmpty(f, [{ id: 2 }], { isEmpty: isEmptyArr, logger: quiet });
  assert.equal(r.kept, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), [{ id: 2 }]);
});

test('writeJsonUnlessEmpty: tómt + engin fyrri skrá → skrifar tómt (ekkert að halda í)', () => {
  const f = tmpFile();
  const r = writeJsonUnlessEmpty(f, [], { isEmpty: isEmptyArr, logger: quiet });
  assert.equal(r.kept, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), []);
});

test('writeJsonUnlessEmpty: tómt + fyrri skrá líka tóm/ógild → skrifar', () => {
  const f = tmpFile(); fs.writeFileSync(f, '[]');
  assert.equal(writeJsonUnlessEmpty(f, [], { isEmpty: isEmptyArr, logger: quiet }).kept, false);
  fs.writeFileSync(f, 'rusl');
  assert.equal(writeJsonUnlessEmpty(f, [], { isEmpty: isEmptyArr, logger: quiet }).kept, false);
});

test('writeJsonUnlessEmpty: sérsniðið isEmpty (dagatal: plenary EÐA meetings 0 = tómt)', () => {
  const f = tmpFile(); fs.writeFileSync(f, JSON.stringify({ plenary: 130, meetings: 534, days: 145 }));
  const isEmptyDag = d => !d || !(d.plenary > 0) || !(d.meetings > 0);
  const hollow = { range: [undefined, undefined], days: 0, plenary: 0, meetings: 0, dates: {} };
  assert.equal(writeJsonUnlessEmpty(f, hollow, { isEmpty: isEmptyDag, logger: quiet }).kept, true);
  assert.equal(writeJsonUnlessEmpty(f, { plenary: 3, meetings: 0, days: 3 }, { isEmpty: isEmptyDag, logger: quiet }).kept, true, 'hálf-tómt = grunsamlegt');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).plenary, 130);
  assert.equal(writeJsonUnlessEmpty(f, { plenary: 131, meetings: 540, days: 146 }, { isEmpty: isEmptyDag, logger: quiet }).kept, false);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).plenary, 131);
});

test('fetchText: 2xx → skilar texta', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, headers: hdr(), text: async () => '<xml/>' });
  assert.equal(await fetchText('u', { fetchImpl, sleep: async () => {}, logger: quiet }), '<xml/>');
});

test('fetchText: HTTP 429 → reynir aftur með bakslagi og skilar þegar tekst', async () => {
  let n = 0; const waits = [];
  const fetchImpl = async () => (++n < 3
    ? { ok: false, status: 429, headers: hdr() }
    : { ok: true, status: 200, headers: hdr(), text: async () => 'OK' });
  const t = await fetchText('u', { fetchImpl, sleep: async ms => { waits.push(ms); }, backoffMs: [10, 20, 30], logger: quiet });
  assert.equal(t, 'OK');
  assert.equal(n, 3);
  assert.deepEqual(waits, [10, 20]);
});

test('fetchText: viðvarandi 429 → HENDIR villu (aldrei þáttað sem „0 niðurstöður")', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: false, status: 429, headers: hdr() }; };
  await assert.rejects(fetchText('https://x/y', { fetchImpl, sleep: async () => {}, retries: 2, logger: quiet }), /HTTP 429 .*https:\/\/x\/y/);
  assert.equal(n, 3, 'upphafleg tilraun + 2 endurtekningar');
});

test('fetchText: netvilla (fetch hendir) → reynir aftur, hendir að lokum', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; throw new Error('ECONNRESET'); };
  await assert.rejects(fetchText('u', { fetchImpl, sleep: async () => {}, retries: 1, logger: quiet }), /ECONNRESET/);
  assert.equal(n, 2);
});

test('fetchText: virðir Retry-After haus (sek) ef lengri en bakslag, þak 60s', async () => {
  let n = 0; const waits = [];
  const fetchImpl = async () => (++n === 1
    ? { ok: false, status: 429, headers: hdr({ 'retry-after': '7' }) }
    : { ok: true, status: 200, headers: hdr(), text: async () => 'OK' });
  await fetchText('u', { fetchImpl, sleep: async ms => { waits.push(ms); }, backoffMs: [2000], logger: quiet });
  assert.deepEqual(waits, [7000]);
  n = 0; waits.length = 0;
  const fetch2 = async () => (++n === 1
    ? { ok: false, status: 503, headers: hdr({ 'retry-after': '3600' }) }
    : { ok: true, status: 200, headers: hdr(), text: async () => 'OK' });
  await fetchText('u', { fetchImpl: fetch2, sleep: async ms => { waits.push(ms); }, backoffMs: [2000], logger: quiet });
  assert.deepEqual(waits, [60000]);
});

test('fetchText: sendir User-Agent haus (althingi.is hafnar án hans)', async () => {
  let seen;
  const fetchImpl = async (u, o) => { seen = o; return { ok: true, status: 200, headers: hdr(), text: async () => '' }; };
  await fetchText('u', { fetchImpl, logger: quiet });
  assert.ok(seen.headers['User-Agent']);
});
