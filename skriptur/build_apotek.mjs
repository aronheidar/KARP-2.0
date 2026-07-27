#!/usr/bin/env node
// build_apotek.mjs — Lyfjastofnun: leyfisskyld starfsemi, apótek og lyfjasölur.
// Opin HTML-síða (WP-kort „apotek__item", EKKI tafla) → gogn/apotek.json (byKt). Áfangi 1 leyfaskrár (KYC), kt-lyklað
// beint úr „Rekstraraðili"-reit hvers korts (engin nafna-samsvörun). Sjá build_ferdaleyfi.mjs fyrir sama mynstur.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'apotek.json');
const URL_APOTEK = 'https://www.lyfjastofnun.is/leyfisskyld-starfsemi/apotek/';
const UA = { 'User-Agent': 'Mozilla/5.0 (KARP dashboard build; karp.is)' };

const cell = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#160;/g, ' ').replace(/\s+/g, ' ').trim();

async function scrape() {
  const r = await fetch(URL_APOTEK, { headers: UA });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  // Hvert apótek er eitt „<div class="apotek__item" …>" kort — engin <table>. Skiptum á kortamerkinu.
  const blocks = html.split('<div class="apotek__item"').slice(1);
  const out = [];
  for (const b of blocks) {
    const nafn = (b.match(/<button class="apotek__item__button">([^<]*)<\/button>/) || [])[1];
    const svaedi = (b.match(/<span class="apotek__title--region">([^<]*)<\/span>/) || [])[1];
    const heimilisfang = (b.match(/<strong>Heimilisfang:<\/strong>([\s\S]*?)<\/li>/) || [])[1];
    const postfang = (b.match(/<strong>Póstfang:<\/strong>([\s\S]*?)<\/li>/) || [])[1];
    const rekBlock = (b.match(/<strong>Rekstraraðili:<\/strong>([\s\S]*?)<\/li>/) || [])[1];
    if (!rekBlock) continue;                              // ekkert rekstraraðili-svæði → engin kt-lyklun möguleg
    const m = rekBlock.match(/kt\.\s*(\d{6})-?(\d{4})/);
    if (!m) continue;
    const kt = m[1] + m[2];
    out.push({
      kt,
      teg: 'Apótek',
      nafn: nafn ? cell(nafn) : null,
      svaedi: svaedi ? cell(svaedi) : null,
      stadur: [heimilisfang, postfang].map((x) => (x ? cell(x) : null)).filter(Boolean).join(', ') || null,
    });
  }
  return out;
}

(async () => {
  console.log('sæki Lyfjastofnun apótek…');
  const rows = await scrape();
  const total = rows.length;
  if (total < 20) throw new Error('Grunsamlega fá apótek (' + total + ') — hætti');
  const byKt = {};
  for (const r of rows) (byKt[r.kt] = byKt[r.kt] || []).push({ teg: r.teg, nafn: r.nafn, svaedi: r.svaedi, stadur: r.stadur });
  const data = { updated: new Date().toISOString().slice(0, 10), source: 'Lyfjastofnun — leyfisskyld starfsemi: apótek og lyfjasölur', n: total, felog: Object.keys(byKt).length, byKt };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('apotek.json | leyfi:', total, '| félög:', data.felog, '| bytes:', fs.statSync(OUT).size);
  // sanngæfa: dæmi um keðju (fleiri en eitt apótek á sömu kt)
  const dæmi = Object.entries(byKt).find(([k, v]) => v.length > 1);
  if (dæmi) console.log('  dæmi (fjölútibú):', dæmi[0], '→', dæmi[1].map((x) => x.nafn).join(' · '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
