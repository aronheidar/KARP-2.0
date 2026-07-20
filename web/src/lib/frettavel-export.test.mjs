import { test } from 'node:test';
import assert from 'node:assert';
import { hasExport, exportJson, exportCsv, chartSvg } from './frettavel-export.mjs';

const FACTS = { id: 'verdbolga-2026-06-01', date: '2026-06-01', type: 'verdbolga', title: 'Verðbólga eykst: 5,2%', text: 'Ársverðbólga…', url: '/verdlag/', facts: { verdbolga: 5.2, meginvextir: 7.75 }, spark: [6.3, 6, 5.4, 5.1, 4.8, 5.2] };
const TEXTONLY = { id: 'gjaldthrot-x', date: '2026-06-01', type: 'gjaldthrot', title: 'Gjaldþrot Alfa ehf.', text: 'Beiðni', url: '/logbirting/' };
const SERIESONLY = { id: 'mark-1', date: '2026-06-01', type: 'mark', title: 'Marel', text: '', url: '/markadir/', spark: [1, 2, 3, 4, 5] };

test('hasExport: true for facts, true for series≥4, false for text-only', () => {
  assert.equal(hasExport(FACTS), true);
  assert.equal(hasExport(SERIESONLY), true);
  assert.equal(hasExport(TEXTONLY), false);
  assert.equal(hasExport({ spark: [1, 2, 3] }), false);   // <4
  assert.equal(hasExport(null), false);
});

test('exportJson: shape, asciiId permalink slug, facts + series carried, license present', () => {
  const j = exportJson(FACTS);
  assert.equal(j.slod, 'https://karp.is/frettavel/verdbolga-2026-06-01/');
  assert.equal(j.flokkur, 'Verðbólga');            // from catOf(verdbolga).label
  assert.deepEqual(j.facts, { verdbolga: 5.2, meginvextir: 7.75 });
  assert.equal(j.rod.gildi.length, 6);
  assert.equal(j.leyfi, 'Frjáls til notkunar með tilvísun í Karp (karp.is)');
  assert.equal(exportJson(TEXTONLY).facts, null);
  assert.equal(exportJson(TEXTONLY).rod, null);
});

test('exportCsv: escapes ; and ", uses comma decimals, has facts + series sections', () => {
  const csv = exportCsv({ ...FACTS, title: 'A;B "C"' });
  assert.ok(csv.startsWith('reitur;gildi'));
  assert.ok(csv.includes('"A;B ""C"""'));           // title escaped
  assert.ok(csv.includes('verdbolga;5,2'));         // comma decimal
  assert.ok(/\nnr;gildi\n1;6,3/.test(csv));          // series section
});

test('chartSvg: labeled SVG for series, null without series', () => {
  const svg = chartSvg(FACTS);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('Heimild: Karp'));
  assert.ok(svg.includes('Verðbólga'));             // category label
  assert.equal(chartSvg(TEXTONLY), null);
});
