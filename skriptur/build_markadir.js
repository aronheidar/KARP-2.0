// Markaðir: stocks + indices from Yahoo Finance (.IC), government bond yields from lanamal.is.
// Build-time snapshot (Yahoo is ~15-min delayed / EOD; not real-time) → markadir.json (baked).
const fs = require('fs');
const path = require('path');
// __dirname-afstæð slóð: virkar bæði local og í CI (harðkóðaða OneDrive-slóðin
// braust hljóðlaust á ubuntu → markadir.json uppfærðist ALDREI í næturkeyrslunni)
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
async function yf(sym) {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=1y', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json(); const res = j.chart && j.chart.result && j.chart.result[0]; if (!res) return null;
    const m = res.meta, q = res.indicators.quote[0] || {}, ts = res.timestamp || [], closes = (q.close || []).filter(x => x != null);
    if (!closes.length && m.regularMarketPrice == null) return null;
    // use the daily CLOSES consistently (price = last close, prev = prior close) so the change
    // matches the sparkline and isn't skewed by intraday/corporate-action regularMarketPrice.
    // Indices have no usable history → fall back to meta (regularMarketPrice vs chartPreviousClose).
    let price, prev;
    if (closes.length > 1) { price = closes[closes.length - 1]; prev = closes[closes.length - 2]; }
    else { price = m.regularMarketPrice; prev = m.chartPreviousClose != null ? m.chartPreviousClose : (m.previousClose != null ? m.previousClose : price); }
    return { name: (m.longName || m.shortName || sym).replace(/\s+(hf\.|Hf\.|Ltd\.|Group hf\.)$/, ''), price: price, prev: prev, cur: m.currency || 'ISK', closes: closes, q: q, ts: ts };
  } catch (e) { return null; }
}
async function pool(items, n, fn) { const out = []; let i = 0; async function w() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } } await Promise.all(Array.from({ length: n }, w)); return out; }
const round = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };

(async () => {
  const INDICES = [['^OMXI15', 'OMXI15 — Úrvalsvísitala'], ['^OMXIPI', 'OMXIPI — Heildarvísitala']];
  const STOCKS = ['ARION.IC', 'ISB.IC', 'KVIKA.IC', 'BRIM.IC', 'EIM.IC', 'FESTI.IC', 'HAGA.IC', 'ICEAIR.IC', 'NOVA.IC', 'REITIR.IC', 'SIMINN.IC', 'SJOVA.IC', 'VIS.IC', 'EIK.IC', 'ALVO.IC', 'SKEL.IC', 'HAMP.IC', 'AMRQ.IC', 'SVN.IC', 'KALD.IC', 'SYN.IC', 'SOLID.IC'];

  const idxRaw = await pool(INDICES.map(x => x[0]), 4, yf);
  const indices = INDICES.map((x, i) => { const d = idxRaw[i]; if (!d) return null; return { sym: x[0], name: x[1], price: round(d.price, 2), chgPct: round((d.price / d.prev - 1) * 100, 2), hist: d.closes.map(c => round(c, 1)) }; }).filter(Boolean);

  const stkRaw = await pool(STOCKS, 5, yf);
  const stocks = STOCKS.map((s, i) => {
    const d = stkRaw[i]; if (!d) return null;
    // OHLCV fyrir kertarit: byggja [dags, o, h, l, c, v] fyrir gilda daga, halda síðustu 60.
    const o = d.q.open || [], h = d.q.high || [], l = d.q.low || [], cl = d.q.close || [], v = d.q.volume || [], ts = d.ts || [];
    const cand = [];
    for (let k = 0; k < cl.length; k++) {
      if (cl[k] == null || o[k] == null || h[k] == null || l[k] == null) continue;
      cand.push([ts[k] ? new Date(ts[k] * 1000).toISOString().slice(0, 10) : '', round(o[k], 2), round(h[k], 2), round(l[k], 2), round(cl[k], 2), Math.round(v[k] || 0)]);
    }
    const last = cand.slice(-60);
    return { sym: s.replace('.IC', ''), name: d.name, price: round(d.price, 2), chgPct: round((d.price / d.prev - 1) * 100, 2), cur: d.cur,
      hist: d.closes.slice(-40).map(c => round(c, 2)),
      ohlc: last.map(r => [r[1], r[2], r[3], r[4]]), dates: last.map(r => r[0]), vol: last.map(r => r[5]) };
  }).filter(Boolean);
  stocks.sort((a, b) => b.chgPct - a.chgPct);

  // Government bonds from lanamal.is (yield curve)
  let bonds = { nominal: [], indexed: [] };
  try {
    const ht = await (await fetch('https://www.lanamal.is/', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const num = s => { const m = strip(s).match(/-?\d{1,3}(?:\.\d{3})*,\d+|-?\d+,\d+/); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : null; };
    [...ht.matchAll(/<table[\s\S]*?<\/table>/g)].forEach(tb => {
      const isNom = /Óverðtryggt/i.test(tb[0]), isIdx = /Verðtryggt/i.test(tb[0]); if (!isNom && !isIdx) return;
      [...tb[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].forEach(r => {
        const cells = [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => strip(c[1]));
        const nm = (cells[0] || '').match(/(RIKB|RIKS)\s?(\d{2})\s?\d{4}/); if (!nm) return;
        const yld = num(cells[cells.length - 1]); if (yld == null) return;
        const yr = 2000 + parseInt(nm[2], 10);
        (isNom ? bonds.nominal : bonds.indexed).push({ nafn: cells[0], yr: yr, yield: yld });
      });
    });
    bonds.nominal.sort((a, b) => a.yr - b.yr); bonds.indexed.sort((a, b) => a.yr - b.yr);
  } catch (e) { console.log('bond ERR', e.message); }

  const out = { updated: new Date().toISOString().slice(0, 10), indices: indices, stocks: stocks, bonds: bonds };
  fs.writeFileSync(DIR + 'markadir.json', JSON.stringify(out));
  console.log('indices:', indices.length, '| stocks:', stocks.length, '| bonds: nom', bonds.nominal.length, 'idx', bonds.indexed.length);
  console.log('OMXI15:', indices[0] && indices[0].price, '(' + (indices[0] && indices[0].chgPct) + '%)');
  console.log('top mover:', stocks[0] && (stocks[0].name + ' ' + stocks[0].chgPct + '%'), '| bond curve:', bonds.nominal.map(b => b.yr + ':' + b.yield).join(' '));
})().catch(e => console.log('ERR', e.message));
