// ─────────────────────────────────────────────────────────────
// build_birgjar.js — Hverjir fá greitt frá ríkinu? (LOTA 18, #8)
// opnirreikningar.is (Fjársýslan): /rest/csvExport skilar XLSX (zip) fyrir
// gefið tímabil (DD.MM.YYYY). Sótt mánuð fyrir mánuð aftur 12 mánuði frá
// /rest/max_time_period, samandregið í topplista birgja/stofnana/tegunda
// + mánaðaröð. Úttak: gogn/birgjar.json (lítið). Keyrt vikulega í Action.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const H = { 'User-Agent': 'KARP build (karp.is; aronheidars@gmail.com)', 'X-Requested-With': 'XMLHttpRequest' };
const dd = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

async function month(fra, til, agg) {
  const url = `https://opnirreikningar.is/rest/csvExport?vendor_id=&type_id=&org_id=&timabil_fra=${dd(fra)}&timabil_til=${dd(til)}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) { console.log('  ! ', dd(fra), '→', r.status); return 0; }
  const buf = Buffer.from(await r.arrayBuffer());
  let wb;
  try { wb = XLSX.read(buf, { type: 'buffer', dense: true }); } catch (e) { console.log('  ! les ekki xlsx', dd(fra), String(e).slice(0, 60)); return 0; }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) return 0;
  if (!agg.cols) {
    const keys = Object.keys(rows[0]);
    const find = (rx) => keys.find((k) => rx.test(k)) || null;
    agg.cols = {
      org: find(/kaupandi|stofnun|org/i), vendor: find(/birgi|seljandi|vendor/i),
      amount: find(/upphæð|fjárhæð|amount|greiðsla/i), type: find(/tegund|type/i), date: find(/dags|date/i),
    };
    console.log('  dálkar:', JSON.stringify(keys.slice(0, 10)), '→ vörpun:', JSON.stringify(agg.cols));
  }
  const C = agg.cols;
  let n = 0;
  for (const row of rows) {
    const v = C.vendor ? row[C.vendor] : null;
    const o = C.org ? row[C.org] : null;
    let a = C.amount ? row[C.amount] : null;
    if (typeof a === 'string') a = parseFloat(a.replace(/\./g, '').replace(',', '.'));
    if (!v || a == null || isNaN(a)) continue;
    n++;
    agg.total += a;
    const V = (agg.vendors[v] = agg.vendors[v] || { t: 0, n: 0, orgs: {}, m: {} });
    V.t += a; V.n++;
    V.m[agg.curMonth] = (V.m[agg.curMonth] || 0) + a; // LOTA 23: mánaðaröð per birgi
    if (o) V.orgs[o] = (V.orgs[o] || 0) + a;
    if (o) {
      const O = (agg.orgs[o] = agg.orgs[o] || { t: 0, n: 0, vendors: {} });
      O.t += a; O.n++;
      O.vendors[v] = (O.vendors[v] || 0) + a; // LOTA 23: topp-birgjar per stofnun
    }
    const ty = C.type ? row[C.type] : null;
    if (ty) { agg.types[ty] = (agg.types[ty] || 0) + a; }
  }
  return n;
}

async function main() {
  const mt = (await (await fetch('https://opnirreikningar.is/rest/max_time_period', { headers: H })).text()).trim();
  const maxD = /^\d{4}-\d{2}-\d{2}$/.test(mt) ? new Date(mt + 'T12:00:00Z') : new Date();
  console.log('Gögn til:', mt);
  const agg = { total: 0, vendors: {}, orgs: {}, types: {}, months: [], cols: null, curMonth: '' };
  // 12 mánuðir aftur á bak, elsti fyrst
  for (let i = 11; i >= 0; i--) {
    const y = maxD.getUTCFullYear(), m = maxD.getUTCMonth() - i;
    const fra = new Date(Date.UTC(y, m, 1, 12));
    let til = new Date(Date.UTC(y, m + 1, 0, 12));
    if (til > maxD) til = maxD;
    const before = agg.total;
    const label = `${fra.getUTCFullYear()}-${String(fra.getUTCMonth() + 1).padStart(2, '0')}`;
    agg.curMonth = label;
    const n = await month(fra, til, agg);
    agg.months.push({ m: label, total: Math.round(agg.total - before), n });
    console.log(' ', label, '→', n, 'færslur ·', Math.round((agg.total - before) / 1e6), 'm.kr');
  }
  const topOrg = (V) => { let b = null, bv = -Infinity; for (const [k, x] of Object.entries(V.orgs)) if (x > bv) { bv = x; b = k; } return b; };
  const monthLabels = agg.months.map((x) => x.m);
  const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
  const out = {
    updated: new Date().toISOString().slice(0, 10),
    fra: agg.months[0].m, til: mt, grandTotal: Math.round(agg.total),
    rows: agg.months.reduce((s, x) => s + x.n, 0),
    months: agg.months,
    // LOTA 23: drilldown-gögn — mánaðaröð + topp-kaupendur per birgi, topp-birgjar per stofnun
    vendors: Object.entries(agg.vendors).map(([n, v]) => ({
      n, t: Math.round(v.t), c: v.n, o: topOrg(v),
    })).sort((a, b) => b.t - a.t).slice(0, 200),
    vendorDetail: Object.fromEntries(Object.entries(agg.vendors)
      .sort((a, b) => b[1].t - a[1].t).slice(0, 200)
      .map(([n, v]) => [n, { m: monthLabels.map((ml) => Math.round(v.m[ml] || 0)), orgs: topN(v.orgs, 8) }])),
    orgs: Object.entries(agg.orgs).map(([n, v]) => ({ n, t: Math.round(v.t), c: v.n }))
      .sort((a, b) => b.t - a.t).slice(0, 60),
    orgDetail: Object.fromEntries(Object.entries(agg.orgs)
      .sort((a, b) => b[1].t - a[1].t).slice(0, 60)
      .map(([n, v]) => [n, { vendors: topN(v.vendors, 12) }])),
    types: Object.entries(agg.types).map(([n, t]) => ({ n, t: Math.round(t) }))
      .sort((a, b) => b.t - a.t).slice(0, 12),
  };
  fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'birgjar.json'), JSON.stringify(out));
  // LOTA 23: líka sem static asset — drilldown-eyjan á /birgjar/ sækir latínt
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'birgjar.json'), JSON.stringify(out));
  console.log('Skrifað: gogn/birgjar.json ·', out.rows, 'færslur ·', Math.round(out.grandTotal / 1e9), 'ma.kr ·', out.vendors.length, 'birgjar ·', Object.keys(out.orgDetail).length, 'stofnana-drilldown ·', Math.round(fs.statSync(path.join(__dirname, '..', 'gogn', 'birgjar.json')).size / 1024), 'KB');
}
main().catch((e) => { console.error(e); process.exit(1); });
