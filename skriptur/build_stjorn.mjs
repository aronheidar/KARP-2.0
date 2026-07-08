#!/usr/bin/env node
// =============================================================================
//  build_stjorn.mjs — Sækir OPINBERT "Gjaldfrjálst yfirlit" (RSK typeid 9) og
//  þáttar STJÓRN/prókúru/framkvæmdastjóra/endurskoðanda í gogn/stjorn/<kt>.json.
//  🔒 Geymir AÐEINS {nafn, hlutverk} — ALDREI kennitölur/heimilisföng einstaklinga.
//  ⚠ ON-DEMAND (eitt félag við skoðun). ALDREI fjöldakall. Speglar build_arsreikningar.mjs.
//  Notkun: node skriptur/build_stjorn.mjs <kt> [<kt> ...]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchStjorn } from './lib/rsk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'web', 'public', 'gogn', 'stjorn'); // þjónað af /gogn/stjorn/<kt>.json

async function buildForKt(kt) {
  const r = await fetchStjorn(kt);
  const dest = path.join(OUTDIR, `${kt}.json`);
  const sott = new Date().toISOString().slice(0, 10);
  if (!r.stjorn.length) {
    console.log(`  ${kt} ${r.nafn || ''}: engin skráð stjórn þáttaðist — skrifa merki-JSON`);
    fs.writeFileSync(dest, JSON.stringify({ kt, nafn: r.nafn, sott, engin: true, astaeda: 'Engin skráð stjórn fannst í gjaldfrjálsu yfirliti fyrirtækjaskrár (t.d. nýskráð eða óvenjulegt snið).' }, null, 1));
    return;
  }
  const out = { kt, nafn: r.nafn, sott, heimild: 'RSK fyrirtækjaskrá — Gjaldfrjálst yfirlit (gjaldfrjálst)', firmaritun: r.firmaritun, dags: r.dags, stjorn: r.stjorn };
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`  -> ${path.relative(ROOT, dest)}  (${r.stjorn.length} aðilar)`);
}

const kts = process.argv.slice(2).map((a) => a.replace(/\D/g, '')).filter((a) => a.length === 10);
if (!kts.length) { console.log('Notkun: node build_stjorn.mjs <kt> [<kt> ...]'); process.exit(0); }
fs.mkdirSync(OUTDIR, { recursive: true });
console.log(`Stjórn RSK -> gogn/stjorn/  (${kts.length} félög)`);
for (const kt of kts) {
  try { await buildForKt(kt); await new Promise((x) => setTimeout(x, 1200)); } // hófsemi gagnvart RSK
  catch (e) { console.error(`  ${kt}: VILLA — ${e.message}`); }
}
