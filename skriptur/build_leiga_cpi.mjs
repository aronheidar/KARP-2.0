// build_leiga_cpi.mjs — Hagstofa VNV undirvísitala CP041 „Greidd húsaleiga" (VIS01300) → núverandi 12-mán leigu-breyting.
// Leysir af stöðnuðu HMS-leiguskrána (þinglýsingarskylda leigusamninga féll niður með húsaleigulögum 2024 → skráin fraus 2024F1).
// CPI-undirvísitalan heldur áfram mánaðarlega. Skrifar gogn/leiga_cpi.json (+ web/public). Létt — ein PxWeb-sókn.
import { px, sel, num, writeSnapshot, loadPrev, today } from './_pxlib.mjs';

const TABLE = 'Efnahagur/visitolur/1_vnv/2_undirvisitolur/VIS01300.px';
const prev = loadPrev('leiga_cpi');
try {
  // sæki alla mánuði sem taflan hefur (metadata GET) → vísitölu CP041
  const meta = await (await fetch('https://px.hagstofa.is/pxis/api/v1/is/' + TABLE)).json();
  const months = meta.variables.find((v) => /mánuð|manud/i.test(v.code)).values;
  const res = await px(TABLE, [
    sel('Undirvísitala', 'item', ['CP041']),
    sel('Liður', 'item', ['index']),
    sel('Mánuður', 'item', months),
  ]);
  const rows = res.data
    .map((d) => ({ m: d.key.find((k) => /^\d{4}M\d{2}$/.test(k)), v: num(d.values[0]) }))
    .filter((r) => r.m && r.v != null)
    .sort((a, b) => a.m.localeCompare(b.m));
  const idx = Object.fromEntries(rows.map((r) => [r.m, r.v]));
  const series = [];
  for (const r of rows) {
    const [y, mm] = r.m.split('M');
    const p = (y - 1) + 'M' + mm;
    if (idx[p]) series.push({ m: r.m, yoy: +(100 * (r.v / idx[p] - 1)).toFixed(2) });
  }
  const latest = series[series.length - 1] || null;
  if (!latest) throw new Error('engin 12-mán röð reiknuð');
  const out = { updated: today(), source: 'Hagstofa VNV undirvísitala CP041 „Greidd húsaleiga" (VIS01300)', latest, series };
  writeSnapshot('leiga_cpi', out);
  console.log('leiga_cpi:', `${latest.m}: ${latest.yoy}% (12-mán leiga)`);
} catch (e) {
  console.log('build_leiga_cpi villa (held fyrri):', e.message);
  if (prev && prev.latest) writeSnapshot('leiga_cpi', prev); // seigla
  process.exit(0); // ekki fella CI
}
