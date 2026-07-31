#!/usr/bin/env node
// =============================================================================
//  build_midlavog.mjs — FJÖLMIÐLAVOG: mælir tón-hlutdrægni miðla, LEIÐRÉTT fyrir efnisvali.
// -----------------------------------------------------------------------------
//  Aðferð (sjá web/src/lib/midlavog.mjs): fyrir hvert efni sem ≥2 miðlar fjalla um er
//  reiknað frávik hvers miðils frá meðaltóni ALLRA um sama efni. Þannig er borið saman
//  epli við epli — hrár meðaltónn mælir efnisval, ekki hlutdrægni.
//
//  ⚠ Krefst AI-tónsins (news.sent_ai) — lexíkon-tónninn var 80% núll og gagnslaus í þetta.
//
//  KEYRSLA: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node skriptur/build_midlavog.mjs
//  ÚTKOMA: web/public/gogn/midlavog.json  →  /frettir/ birtir vogina.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outletBias } from '../web/src/lib/midlavog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_ACCT = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const DB_ID = process.env.CLOUDFLARE_D1_ID || '6b1672e6-13da-4d14-b45a-0d83a15ccef4';
const DAYS = +(process.env.VOG_DAYS || 180);
const MIN_CELL = +(process.env.VOG_MIN_CELL || 3);

if (!CF_TOKEN || !CF_ACCT) { console.error('✗ CLOUDFLARE_API_TOKEN/ACCOUNT_ID vantar — sleppi.'); process.exit(0); }

async function q(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CF_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.success) throw new Error('D1: ' + JSON.stringify(j && j.errors).slice(0, 180));
  return (j.result && j.result[0] && j.result[0].results) || [];
}

// Aðilar = sömu listar og /frettir/ notar (ein uppspretta, ekkert harðkóðað hér)
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const efni = [];
try {
  for (const c of rd('web/src/data/fyrirtaeki.json')) if (c && c.n) efni.push({ n: c.n, a: (c.a && c.a.length ? c.a : [c.n]) });
} catch (e) {}
try {
  for (const x of rd('web/src/data/stofnanir_umf.json')) if (x && x.n) efni.push({ n: x.n, a: (x.a && x.a.length ? x.a : [x.n]) });
} catch (e) {}
try {
  for (const c of rd('gogn/cabinet.json')) if (c && c.nafn) efni.push({ n: c.nafn, a: [c.nafn] });
} catch (e) {}
if (!efni.length) { console.error('✗ engir aðilar fundust — sleppi.'); process.exit(0); }

// Aðila-skrá fyrir /frettir/<slug>/ (worker les hana úr ASSETS með _dget). Gefin út HÉR því
// þetta skript les hvort sem er sömu lista → hún helst sjálfkrafa í takt við þá.
{
  const { adiliSlug } = await import('../web/src/lib/frettaadili.mjs');
  const skra = efni.map((e) => ({ n: e.n, a: e.a, slug: adiliSlug(e.n) })).filter((x) => x.slug);
  const seen = new Set();
  const einkvaem = skra.filter((x) => (seen.has(x.slug) ? false : (seen.add(x.slug), true)));   // slug VERÐUR einkvæmt
  fs.writeFileSync(path.join(ROOT, 'web', 'public', 'gogn', 'frettaadilar.json'),
    JSON.stringify({ updated: new Date().toISOString().slice(0, 10), adilar: einkvaem }, null, 1));
  // Sitemap fyrir SSR-síðurnar (Astro-sitemap sér þær ekki — þær eru ekki til á byggingartíma).
  const urls = einkvaem.map((a) => `  <url><loc>https://karp.is/frettir/${a.slug}/</loc><changefreq>daily</changefreq></url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'web', 'public', 'sitemap-frettaadilar.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  console.log(`  frettaadilar.json + sitemap → ${einkvaem.length} aðilar${skra.length !== einkvaem.length ? ' (' + (skra.length - einkvaem.length) + ' tvítekin slug felld)' : ''}`);
}

const since = Math.floor(Date.now() / 1000) - DAYS * 86400;
const cells = [];
let skodud = 0;
for (const e of efni) {
  // sömu leitarorð og fréttaleitin notar; takmörkum við 6 samheiti svo SQL-ið verði ekki risavaxið
  const vars = [...new Set(e.a)].slice(0, 6).filter((s) => s && s.length >= 3).map((s) => '%' + s.toLowerCase() + '%');
  if (!vars.length) continue;
  const clauses = vars.map(() => 'lower(body) LIKE ?').join(' OR ');
  const rows = await q(
    `SELECT source, COUNT(*) AS n, AVG(sent_ai) AS tone FROM news
      WHERE ts>=? AND sent_ai IS NOT NULL AND (${clauses})
      GROUP BY source HAVING n >= ?`,
    [since, ...vars, MIN_CELL],
  ).catch(() => []);
  for (const r of rows) if (r.source) cells.push({ source: r.source, entity: e.n, n: r.n, tone: r.tone });
  skodud++;
  if (skodud % 25 === 0) process.stdout.write(`\r  skoðuð efni: ${skodud}/${efni.length} · frumur: ${cells.length}`);
}

const vog = outletBias(cells, { minCell: MIN_CELL, minEntities: 5 });
const out = {
  updated: new Date().toISOString().slice(0, 10),
  days: DAYS,
  efniSkodud: skodud,
  ...vog,
};
const dest = path.join(ROOT, 'web', 'public', 'gogn', 'midlavog.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`\n✔ midlavog.json → ${vog.outlets.length} miðlar · ${vog.entities} sameiginleg efni · ${cells.length} frumur`);
for (const o of vog.outlets.slice(0, 12)) {
  console.log(`   ${String(o.bias > 0 ? '+' + o.bias : o.bias).padStart(4)}  ${o.s.padEnd(24)} (hrár ${o.rawTone > 0 ? '+' : ''}${o.rawTone} · ${o.n} fréttir · ${o.entities} efni)`);
}
