// Byggir web/public/sitemap-fyrirtaeki.xml úr ÖLLUM kt-lykluðum Karp-gögnum.
// Uppsprettur (allar valkvæðar — CI-byggðar): arsreikningar/, eigendur/, logbirting.byKt.
// ⚠ birgjar.json 't' er EKKI kennitala (obfuskerað) → EKKI notað.
// Aðeins gild lögaðila-kt (10 tölur, fyrstu 2 í 41–71).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gogn = (p) => join(ROOT, 'gogn', p);
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +kt.slice(0, 2) >= 41 && +kt.slice(0, 2) <= 71;

const kts = new Set();
const addDir = (dir) => { try { if (existsSync(gogn(dir))) for (const f of readdirSync(gogn(dir))) { const kt = f.replace(/\.json$/, ''); if (erLogadili(kt)) kts.add(kt); } } catch {} };
addDir('arsreikningar');
addDir('eigendur');
try { const lb = JSON.parse(readFileSync(gogn('logbirting.json'), 'utf8')); for (const kt of Object.keys(lb.byKt || {})) if (erLogadili(kt)) kts.add(kt); } catch {}

const list = [...kts].sort();
const urls = list.map((kt) => `  <url><loc>https://karp.is/fyrirtaeki/${kt}/</loc><changefreq>monthly</changefreq></url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(ROOT, 'web', 'public', 'sitemap-fyrirtaeki.xml'), xml);
console.log(`sitemap-fyrirtaeki.xml: ${list.length} kt`);
