#!/usr/bin/env node
// build_ferdaleyfi.mjs — Ferðamálastofu leyfishafar (ferðaskrifstofur + dagsferðasalar).
// Opnar HTML-töflur (kt í dálki) → gogn/ferdaleyfi.json (byKt). Áfangi 1 leyfaskrár (KYC), kt-lyklað.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'ferdaleyfi.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };

const SOURCES = [
  { teg: 'Ferðaskrifstofa', url: 'https://www.ferdamalastofa.is/is/leyfi/utgefin-leyfi/ferdaskrifstofur-utgefin-leyfi' },
  { teg: 'Dagsferðasali', url: 'https://www.ferdamalastofa.is/is/leyfi/utgefin-leyfi/utgefin-leyfi' },
];
const cell = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function scrape(src) {
  const r = await fetch(src.url, { headers: UA });
  if (!r.ok) throw new Error(src.teg + ' HTTP ' + r.status);
  const html = await r.text();
  const ti = html.indexOf('<table'); if (ti < 0) throw new Error(src.teg + ' engin tafla');
  const seg = html.slice(ti, html.indexOf('</table>', ti) + 8);
  const out = [];
  for (const tr of [...seg.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1])) {
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cell(m[1]));
    if (td.length < 7) continue;                       // sleppa haus (<th>) + tómum
    const kt = (td[1].match(/(\d{6})-?(\d{4})/) || []).slice(1).join('');
    if (kt.length !== 10) continue;
    out.push({ kt, leyfisnr: td[0] || null, nafn: td[2] || null, hjaheiti: td[3] || null, stadur: [td[4], td[5]].filter(Boolean).join(', ') || null, utgefid: td[6] || null, teg: src.teg });
  }
  return out;
}

(async () => {
  const byKt = {}; const meta = [];
  for (const src of SOURCES) {
    try {
      const rows = await scrape(src);
      for (const r of rows) (byKt[r.kt] = byKt[r.kt] || []).push(r);
      meta.push({ teg: src.teg, n: rows.length });
      console.log('  ', src.teg, ':', rows.length);
    } catch (e) { console.error('  VILLA', src.teg, e.message); meta.push({ teg: src.teg, villa: e.message }); }
  }
  const total = Object.values(byKt).reduce((s, a) => s + a.length, 0);
  if (total < 200) throw new Error('Grunsamlega fá leyfi (' + total + ') — hætti');
  const data = { updated: new Date().toISOString().slice(0, 10), source: 'Ferðamálastofa — útgefin leyfi (ferðaskrifstofur + dagsferðasalar)', n: total, felog: Object.keys(byKt).length, flokkar: meta, byKt };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('ferdaleyfi.json | leyfi:', total, '| félög:', data.felog, '| bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
