// Byggir web/public/sitemap-fyrirtaeki.xml úr gogn/felagaskra.json.
//
// ⚠ Áður safnaði þessi skripta kennitölum sjálf úr gogn/arsreikningar/, gogn/eigendur/
// og logbirting.byKt. TVÆR FYRRI SLÓÐIRNAR VORU RANGAR: ársreikningar og eigendur eru
// í web/public/gogn/, svo gogn/arsreikningar/ geymdi eina skrá og gogn/eigendur/ enga.
// Sitemap taldi því 1.085 slóðir sem komu ALLAR úr lögbirtingu — ~1.100 félög með
// ársreikning vantaði (SEO-úttekt 13.9.2026).
//
// Nú er söfnunin á einum stað (skriptur/build_felagaskra.mjs) og knýr BÆÐI þetta
// sitemap OG stafrófsskrána á /fyrirtaeki/skra/ — þau geta ekki farið í sundur.
// ⚠ Keyrðu build_felagaskra.mjs Á UNDAN þessari.
//
// Stafrófsskrár-síðurnar sjálfar (/fyrirtaeki/skra/…) koma í sitemap-0.xml frá
// @astrojs/sitemap eins og aðrar stöðusíður — þarf ekki að telja þær hér.
// ⚠ birgjar.json 't' er EKKI kennitala (obfuskerað) → EKKI notað.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { erLogadili } from '../web/src/lib/fyrirtaeki-slod.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let skra;
try {
  skra = JSON.parse(readFileSync(join(ROOT, 'gogn', 'felagaskra.json'), 'utf8'));
} catch (e) {
  console.error('sitemap-fyrirtaeki: gogn/felagaskra.json vantar — keyrðu build_felagaskra.mjs fyrst. Sitemap ÓBREYTT.');
  process.exit(0);   // fail-soft: betra að halda fyrra sitemap en að skrifa tómt
}

const kts = [...new Set((skra.felog || []).map((f) => f.kt).filter(erLogadili))].sort();
if (!kts.length) {
  console.error('sitemap-fyrirtaeki: engar gildar kennitölur í felagaskra.json — sitemap ÓBREYTT.');
  process.exit(0);
}

// lastmod er marktækt fyrir Google; changefreq er hunsað og því sleppt.
const lastmod = (skra.generated || new Date().toISOString()).slice(0, 10);
const urls = kts.map((kt) => `  <url><loc>https://karp.is/fyrirtaeki/${kt}/</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(ROOT, 'web', 'public', 'sitemap-fyrirtaeki.xml'), xml);
console.log(`sitemap-fyrirtaeki.xml: ${kts.length} kt (lastmod ${lastmod})`);
