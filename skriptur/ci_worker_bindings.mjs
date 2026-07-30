// ci_worker_bindings.mjs — CI-hlið (úttekt C10): staðfestir að worker-klofningurinn skilji engin nöfn eftir „í lausu lofti": fyrir hverja skrá
// (worker.js + web/src/worker/*.mjs) — hvaða nöfn úr sameiginlega nafnarýminu notar hún
// án þess að lýsa þeim yfir eða flytja þau inn? Slíkt er ReferenceError á keyrslutíma
// (hvorki node --check né esbuild grípa það). Skilar exit 1 ef eitthvað finnst.
import { readFileSync, readdirSync } from 'node:fs';

const FILES = ['web/worker.js', ...readdirSync('web/src/worker').filter((f) => f.endsWith('.mjs')).map((f) => 'web/src/worker/' + f)];
const info = new Map();
for (const f of FILES) {
  const t = readFileSync(f, 'utf8');
  const decl = new Set(), imp = new Set(), exp = new Set();
  for (const m of t.matchAll(/^(?:export )?(?:async function |function |const |let |var )(\w+)/gm)) decl.add(m[1]);
  for (const m of t.matchAll(/^export (?:async function |function |const |let )(\w+)/gm)) exp.add(m[1]);
  for (const m of t.matchAll(/^import\s*\{([^}]+)\}/gm)) for (let n of m[1].split(',')) { n = n.trim(); if (n) imp.add(n.split(/\s+as\s+/).pop().trim()); }
  info.set(f, { t, decl, imp, exp });
}
// sameiginlegt nafnarými = allt sem einhver skrá lýsir yfir
const universe = new Set();
for (const { decl } of info.values()) for (const n of decl) universe.add(n);

let bad = 0;
for (const [f, { t, decl, imp }] of info) {
  const missing = [];
  for (const n of universe) {
    if (decl.has(n) || imp.has(n)) continue;
    // telja notkun utan import-lína, athugasemda og strengja (annars falsk jákvæð:
    // SQL-alias „rg" í streng, nöfn nefnd í // athugasemdum o.s.frv.)
    const body = t.split(/\r?\n/).filter((l) => !/^import\s/.test(l) && !/^export\s.*\sfrom\s/.test(l)).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
    const hits = (body.match(new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
    if (hits) missing.push(n + '×' + hits);
  }
  if (missing.length) {
    bad += missing.length;
    console.log('✗ ' + f + ' notar ' + missing.length + ' óskilgreind nöfn:');
    console.log('   ' + missing.sort().join(' '));
    // hvar búa þau?
    const where = {};
    for (const mm of missing) { const n = mm.split('×')[0]; for (const [g, i2] of info) if (i2.decl.has(n)) { (where[g] = where[g] || []).push(n + (i2.exp.has(n) ? '' : ' ⚠óútflutt')); } }
    for (const [g, ns] of Object.entries(where)) console.log('   → býr í ' + g + ': ' + ns.join(' '));
  }
}
console.log(bad ? '\n❌ ' + bad + ' vandamál — laga áður en deployað er.' : '✅ Öll nöfn leyst — engin laus tenging.');
process.exit(bad ? 1 : 0);
