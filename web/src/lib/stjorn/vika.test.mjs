import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vikuByrjun, isoVika, sidastaFullaVika, vikuBil } from './vika.mjs';

const ts = (s) => Math.floor(Date.parse(s + 'Z') / 1000);

test('vikuByrjun: mánudagur 00:00 UTC, líka á sunnudagskvöldi og á mánudagsmorgni', () => {
  assert.equal(vikuByrjun(ts('2026-09-21T00:00:00')), ts('2026-09-21T00:00:00'));   // mánudagur sjálfur
  assert.equal(vikuByrjun(ts('2026-09-27T23:59:59')), ts('2026-09-21T00:00:00'));   // sunnudagskvöld
  assert.equal(vikuByrjun(ts('2026-09-17T18:05:00')), ts('2026-09-14T00:00:00'));   // fimmtudagur
});

test('isoVika: ISO 8601 vikunúmer, þar með talin áramótin sem flestir rugla', () => {
  assert.deepEqual(isoVika(ts('2026-09-21T12:00:00')).vika, 39);
  // 1. jan 2027 er föstudagur → tilheyrir viku 53 árið 2026
  const a = isoVika(ts('2027-01-01T12:00:00'));
  assert.equal(a.ar, 2026); assert.equal(a.vika, 53);
  // 4. jan er ALLTAF í viku 1
  const b = isoVika(ts('2027-01-04T12:00:00'));
  assert.equal(b.ar, 2027); assert.equal(b.vika, 1);
  // 29. des 2025 (mánudagur) er vika 1 árið 2026
  const c = isoVika(ts('2025-12-29T12:00:00'));
  assert.equal(c.ar, 2026); assert.equal(c.vika, 1);
});

test('isoVika: fra með, til án — atburður á sunnudagskvöldi lendir í réttri viku', () => {
  const v = isoVika(ts('2026-09-24T12:00:00'));
  assert.equal(v.til - v.fra, 7 * 86400);
  assert.ok(ts('2026-09-27T23:59:59') < v.til);
  assert.ok(ts('2026-09-28T00:00:00') >= v.til);
});

test('sidastaFullaVika: föst alla vikuna, skiptir á mánudegi kl. 00:00', () => {
  const man = sidastaFullaVika(ts('2026-09-21T00:00:00'));
  const sun = sidastaFullaVika(ts('2026-09-27T23:59:59'));
  assert.deepEqual(man, sun, 'sama samantekt frá mánudegi til sunnudags');
  assert.equal(man.vika, 38);
  assert.equal(sidastaFullaVika(ts('2026-09-28T00:00:00')).vika, 39, 'skiptir á mánudegi');
});

test('vikuBil: innan mánaðar og yfir mánaðamót', () => {
  assert.equal(vikuBil(isoVika(ts('2026-09-16T12:00:00'))), '14.–20. september');
  assert.equal(vikuBil(isoVika(ts('2026-09-30T12:00:00'))), '28. september – 4. október');
});
