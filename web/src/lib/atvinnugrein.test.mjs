import { test } from 'node:test';
import assert from 'node:assert';
import {
  slugify, vsHeild, herfindahl, toppNShare, fmtKr, fmtRatio, fmtPct, RATIO_META, RATIO_ORDER,
} from './atvinnugrein.mjs';

// ── herfindahl ──────────────────────────────────────────────────────────────
test('herfindahl: two equal shares → ~5000', () => {
  assert.equal(herfindahl([50, 50]), 5000);
});

test('herfindahl: single entry (100% share) → 10000', () => {
  assert.equal(herfindahl([100]), 10000);
});

test('herfindahl: empty array → 0', () => {
  assert.equal(herfindahl([]), 0);
});

test('herfindahl: ignores non-positive and non-finite values', () => {
  assert.equal(herfindahl([50, 50, -30]), 5000);
  assert.equal(herfindahl([50, 50, 0, NaN, Infinity, -Infinity]), 5000);
});

test('herfindahl: three equal shares → ~3333.33 (not rounded)', () => {
  const hhi = herfindahl([1, 1, 1]);
  assert.ok(Math.abs(hhi - 3333.333333) < 0.001, `got ${hhi}`);
});

test('herfindahl: non-array input → 0 (defensive)', () => {
  assert.equal(herfindahl(null), 0);
  assert.equal(herfindahl(undefined), 0);
});

// ── toppNShare ──────────────────────────────────────────────────────────────
test('toppNShare: top-3 of a known, unsorted set', () => {
  const felog = [{ sala: 10 }, { sala: 40 }, { sala: 20 }, { sala: 30 }]; // total 100, unsorted
  assert.equal(toppNShare(felog, 3), 90); // 40+30+20 = 90 / 100
});

test('toppNShare: does not assume pre-sorted input (same result regardless of order)', () => {
  const a = [{ sala: 10 }, { sala: 40 }, { sala: 20 }, { sala: 30 }];
  const b = [{ sala: 40 }, { sala: 30 }, { sala: 20 }, { sala: 10 }];
  assert.equal(toppNShare(a, 2), toppNShare(b, 2));
  assert.equal(toppNShare(a, 2), 70); // 40+30 / 100
});

test('toppNShare: empty array → 0', () => {
  assert.equal(toppNShare([], 5), 0);
});

test('toppNShare: zero/invalid total → 0 (guard)', () => {
  assert.equal(toppNShare([{ sala: 0 }, { sala: 0 }], 3), 0);
  assert.equal(toppNShare(null, 3), 0);
});

test('toppNShare: n >= length → 100', () => {
  assert.equal(toppNShare([{ sala: 10 }, { sala: 20 }], 10), 100);
});

test('toppNShare: n = 0 → 0', () => {
  assert.equal(toppNShare([{ sala: 10 }, { sala: 20 }], 0), 0);
});

// ── vsHeild ───────────────────────────────────────────────────────────────
test('vsHeild: val clearly above heild → yfir', () => {
  assert.deepEqual(vsHeild(120, 100), { pct: 20, dir: 'yfir' });
});

test('vsHeild: val clearly below heild → undir', () => {
  assert.deepEqual(vsHeild(80, 100), { pct: -20, dir: 'undir' });
});

test('vsHeild: val ~= heild → jafnt', () => {
  assert.deepEqual(vsHeild(100, 100), { pct: 0, dir: 'jafnt' });
  assert.deepEqual(vsHeild(101, 100), { pct: 1, dir: 'jafnt' });
});

test('vsHeild: boundary at exactly ±2% is still jafnt (strict >2 / <-2)', () => {
  assert.deepEqual(vsHeild(102, 100), { pct: 2, dir: 'jafnt' });
  assert.deepEqual(vsHeild(98, 100), { pct: -2, dir: 'jafnt' });
  assert.equal(vsHeild(103, 100).dir, 'yfir');
  assert.equal(vsHeild(97, 100).dir, 'undir');
});

test('vsHeild: guards heildVal 0/NaN/null/undefined → {pct:0, dir:jafnt}', () => {
  assert.deepEqual(vsHeild(50, 0), { pct: 0, dir: 'jafnt' });
  assert.deepEqual(vsHeild(50, NaN), { pct: 0, dir: 'jafnt' });
  assert.deepEqual(vsHeild(50, null), { pct: 0, dir: 'jafnt' });
  assert.deepEqual(vsHeild(50, undefined), { pct: 0, dir: 'jafnt' });
});

// ── slugify ─────────────────────────────────────────────────────────────
test('slugify: strips trailing "(ÍSAT nr. …)" and transliterates Icelandic → ascii', () => {
  assert.equal(
    slugify('Matvælaframleiðsla, án fiskvinnslu (ÍSAT nr. 10, án 102)'),
    'matvaelaframleidsla-an-fiskvinnslu',
  );
});

test('slugify: transliterates the full Icelandic letter set', () => {
  assert.equal(slugify('Þjónusta Ögn Ævi Álfur Únaldur Ísafold Órar Édda'), 'thjonusta-ogn-aevi-alfur-unaldur-isafold-orar-edda');
});

test('slugify: two similar labels (shared long prefix, different tail) give distinct slugs', () => {
  const a = slugify('Önnur sérfræðileg starfsemi, dýralækningar (ÍSAT nr. 75)');
  const b = slugify('Önnur sérfræðileg starfsemi, vísindi (ÍSAT nr. 74)');
  assert.notEqual(a, b);
  assert.equal(a, 'onnur-serfraedileg-starfsemi-dyralaekningar');
  assert.equal(b, 'onnur-serfraedileg-starfsemi-visindi');
});

test('slugify: collapses punctuation/whitespace runs into single dashes, trims edges', () => {
  assert.equal(slugify('  Veitur (ÍSAT nr. 35-36)  '), 'veitur');
  assert.equal(slugify('Trjá- og pappírsiðnaður (ÍSAT nr. 16-17)'), 'trja-og-pappirsidnadur');
});

test('slugify: guards null/empty input', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});

// ── fmtKr / fmtRatio / fmtPct ───────────────────────────────────────────────
test('fmtKr: millions, grouped (Icelandic "." thousands separator)', () => {
  assert.equal(fmtKr(850_000_000), '850 m.kr');
  assert.equal(fmtKr(45_000_000), '45 m.kr');
});

test('fmtKr: >=1000 m.kr switches to "ma.kr" with 1 decimal (comma)', () => {
  assert.equal(fmtKr(1_200_000_000), '1,2 ma.kr');
});

test('fmtKr: guards null/NaN → "–"', () => {
  assert.equal(fmtKr(null), '–');
  assert.equal(fmtKr(undefined), '–');
  assert.equal(fmtKr(NaN), '–');
});

test('fmtRatio: 2-decimal Icelandic comma format', () => {
  assert.equal(fmtRatio(1.183), '1,18');
  assert.equal(fmtRatio(1.3421), '1,34');
});

test('fmtRatio: guards null → "–"', () => {
  assert.equal(fmtRatio(null), '–');
  assert.equal(fmtRatio(NaN), '–');
});

test('fmtPct: fraction → percent string with 1 decimal (comma)', () => {
  assert.equal(fmtPct(0.4177), '41,8%');
  assert.equal(fmtPct(0.0235), '2,4%');
});

test('fmtPct: guards null → "–"', () => {
  assert.equal(fmtPct(null), '–');
  assert.equal(fmtPct(NaN), '–');
});

// ── RATIO_META / RATIO_ORDER ────────────────────────────────────────────────
test('RATIO_ORDER: exactly the 8 sector_kpi ratio keys, in display order', () => {
  assert.deepEqual(RATIO_ORDER, [
    'framlegd', 'hagnadarhlutfall', 'ebit_hlutfall', 'eiginfjarhlutfall',
    'skuldahlutfall_DE', 'eignavelta', 'launahlutfall', 'tekjur_pr_starfsm_mkr',
  ]);
});

test('RATIO_META: has all 8 keys with heiti/fmt/betra', () => {
  assert.equal(Object.keys(RATIO_META).length, 8);
  for (const key of RATIO_ORDER) {
    const m = RATIO_META[key];
    assert.ok(m, `missing RATIO_META.${key}`);
    assert.equal(typeof m.heiti, 'string');
    assert.ok(['pct', 'num', 'kr_mkr'].includes(m.fmt), `${key}.fmt=${m.fmt}`);
    assert.ok(['haerra', 'laegra'].includes(m.betra), `${key}.betra=${m.betra}`);
  }
});

test('RATIO_META: spot-check specific entries (fmt + betra direction)', () => {
  assert.deepEqual(RATIO_META.framlegd, { heiti: 'Framlegð', fmt: 'pct', betra: 'haerra' });
  assert.deepEqual(RATIO_META.skuldahlutfall_DE, { heiti: 'Skuldir/eigið fé', fmt: 'num', betra: 'laegra' });
  assert.deepEqual(RATIO_META.eignavelta, { heiti: 'Eignavelta', fmt: 'num', betra: 'haerra' });
  assert.deepEqual(RATIO_META.launahlutfall, { heiti: 'Launahlutfall', fmt: 'pct', betra: 'laegra' });
  assert.deepEqual(RATIO_META.tekjur_pr_starfsm_mkr, { heiti: 'Tekjur á starfsmann', fmt: 'kr_mkr', betra: 'haerra' });
});
