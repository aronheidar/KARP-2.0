// cto_sia.mjs — hvaða skrár má patch frá Hrafni (CTO-keyrslunni) snerta?
//
// cto.yml keyrir líkan sem les texta frá notendum og má keyra kóða. Það sem líkanið skilar er því
// ÓTRAUST: það fer sem patch úr einu job-i í annað, og þessi sía ræður hvort því er beitt. Hún keyrir
// úr GRUNNÚTGÁFUNNI (main, eins og hún var þegar keyrslan hófst) ÁÐUR en patchinu er beitt, svo patch
// getur hvorki breytt reglunum fyrir sína eigin keyrslu né komið þeim framhjá. Og hún bannar patch að
// snerta sjálfa sig, svo reglurnar veikist ekki heldur við næstu keyrslu.
//
// Notkun í cto.yml:  node skriptur/lib/cto_sia.mjs <patch>   → JSON á stdout, útgangskóði 0 = leyft.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LEYFT = /^(web|skriptur)\//;
// Hver regla: [mynstur, ástæða]. Fyrsta regla sem passar ræður.
const BANNAD = [
  [/^web\/migrations\//, 'gagnagrunnsflutningur (keyrður handvirkt, aldrei úr keyrslu)'],
  [/^web\/wrangler\.toml$/, 'wrangler.toml (bindingar og leyndarmál)'],
  [/(^|\/)package(-lock)?\.json$/, 'pakkaskrá (ný háð keyrir í byggingu Cloudflare eftir merge)'],
  [/(^|\/)\.npmrc$/, '.npmrc'],
  [/(greidslur|askell|teya)/i, 'greiðslukóði'],
  [/^web\/\.astro\//, 'byggingarskrá'],
  [/^skriptur\/lib\/cto_sia(\.test)?\.mjs$/, 'sían sjálf'],
];

/** null ef slóðin er leyfð, annars ástæða. */
export function bannAstaeda(slod) {
  const s = String(slod || '');
  if (!s || s.includes('\\') || s.split('/').includes('..') || s.startsWith('/')) return 'ógild slóð';
  for (const [m, a] of BANNAD) if (m.test(s)) return a;
  if (!LEYFT.test(s)) return 'utan web/ og skriptur/';
  return null;
}

/**
 * Slóðir úr `git apply --numstat -z`. Venjuleg lína er „bætt\tfjarlægt\tslóð\0"; endurnefning er
 * „bætt\tfjarlægt\t\0gamla\0nýja\0" — BÁÐAR slóðirnar teljast, því að flytja skrá út af leyfðu svæði
 * er líka breyting á henni.
 */
export function slodirUrNumstat(z) {
  const bitar = String(z || '').split('\0');
  const ut = [];
  for (let i = 0; i < bitar.length; i++) {
    const b = bitar[i];
    if (!b) continue;
    const m = b.match(/^(-|\d+)\t(-|\d+)\t(.*)$/s);
    if (!m) { ut.push(b); continue; }                 // brot sem passar ekki: telst slóð og fer í síuna
    if (m[3]) ut.push(m[3]);
    else { if (bitar[i + 1]) ut.push(bitar[i + 1]); if (bitar[i + 2]) ut.push(bitar[i + 2]); i += 2; }
  }
  return ut;
}

/** Tenglar (120000) og undireiningar (160000) eiga ekkert erindi í lagfæringu. */
export function hattulegurHamur(summary) {
  const s = String(summary || '');
  if (/\b120000\b/.test(s)) return 'táknrænn tengill (symlink)';
  if (/\b160000\b/.test(s)) return 'undireining (submodule)';
  return null;
}

/** Heildarmat: { ok, slodir, hafnad: [{slod, astaeda}] }. Tómur patch er EKKI leyfður (ekkert að gera). */
export function metaPatch({ numstat, summary }) {
  const slodir = [...new Set(slodirUrNumstat(numstat))];
  const hafnad = [];
  const hamur = hattulegurHamur(summary);
  if (hamur) hafnad.push({ slod: '*', astaeda: hamur });
  for (const s of slodir) { const a = bannAstaeda(s); if (a) hafnad.push({ slod: s, astaeda: a }); }
  if (!slodir.length) hafnad.push({ slod: '*', astaeda: 'tómur patch' });
  return { ok: !hafnad.length, slodir, hafnad };
}

// ── Keyrt beint úr cto.yml ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const patch = process.argv[2];
  let numstat = '', summary = '', villa = null;
  try {
    // --check fyrst: patch sem á ekki við grunninn fellur hér, ekki í miðri beitingu
    execFileSync('git', ['apply', '--check', patch], { stdio: ['ignore', 'pipe', 'pipe'] });
    numstat = execFileSync('git', ['apply', '--numstat', '-z', patch], { encoding: 'utf8' });
    summary = execFileSync('git', ['apply', '--summary', patch], { encoding: 'utf8' });
  } catch (e) {
    villa = String((e && e.stderr) || (e && e.message) || e).slice(0, 400);
  }
  const r = villa ? { ok: false, slodir: [], hafnad: [{ slod: '*', astaeda: 'patch á ekki við grunninn: ' + villa }] } : metaPatch({ numstat, summary });
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
