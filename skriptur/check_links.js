// ─────────────────────────────────────────────────────────────
// check_links.js — innri hlekkjatékk á dist/ (LOTA 23, keyrt í CI).
// Skannar allar byggðar HTML-síður, safnar href/src sem byrja á "/" og
// staðfestir að skráin/sían sé til í dist. Brotinn hlekkur = exit 1.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'web', 'dist');

const htmls = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmls.push(p);
  }
})(DIST);

const exists = (url) => {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return true;
  const p = path.join(DIST, clean);
  return fs.existsSync(p) || fs.existsSync(path.join(p, 'index.html')) || fs.existsSync(p + '.html');
};

const broken = {};
let checked = 0;
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  const urls = [...new Set([...t.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]))]
    .filter((u) => !u.startsWith('//') && !/^\/(api|wp-json)\//.test(u)) // worker-rútur ekki í dist
    .filter((u) => !u.includes('${')); // template-strengir í inline-JS = runtime-hlekkir
  for (const u of urls) {
    checked++;
    if (!exists(u)) (broken[u] = broken[u] || []).push(path.relative(DIST, f));
  }
}

const keys = Object.keys(broken);
console.log(`Hlekkjatékk: ${htmls.length} síður · ${checked} innri hlekkir · ${keys.length} brotnir`);
if (keys.length) {
  keys.slice(0, 20).forEach((u) => console.log('  ✗', u, '← t.d.', broken[u][0], `(${broken[u].length} síður)`));
  process.exit(1);
}
console.log('✓ Allir innri hlekkir eiga skotmark.');
