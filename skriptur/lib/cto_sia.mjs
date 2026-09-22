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
  // ⚠ Rýnin 22.9: .json og .jsonc eru líka gild Wrangler-stilling, og forgangurinn fer eftir útgáfu
  [/^web\/wrangler\.(toml|json|jsonc)$/, 'wrangler-stilling (bindingar og leyndarmál)'],
  [/(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/, 'pakkaskrá (ný háð keyrir í byggingu Cloudflare eftir merge)'],
  [/(^|\/)\.(npmrc|yarnrc(\.yml)?)$/, 'pakkastilling'],
  [/(greidsl|askell|teya|stripe|paypal|valitor|borgun|rapyd)/i, 'greiðslukóði'],
  [/^web\/\.astro\//, 'byggingarskrá'],
  // Hliðin sjálf: sían, reglurnar um verkflæðið og CI-athuganirnar. Veikti patch þau næði það til
  // allra síðari keyrslna, jafnvel þótt þessi keyrsla noti grunnútgáfuna.
  [/^skriptur\/lib\/cto_(sia|verkflaedi)(\.test)?\.mjs$/, 'sían sjálf'],
  [/^skriptur\/(ci_worker_bindings\.mjs|check_links\.js)$/, 'CI-hlið'],
];

// Leyfðar skrár sem Aron á að lesa SÉRSTAKLEGA: auðkenning, admin-leiðir, póstur, og allt sem keyrir í
// byggingu Cloudflare eftir merge (stillingaskrár). Patchinum er beitt, en PR-ið og samantektin segja frá.
const VIDVORUN = [
  [/^web\/worker\.js$/, 'leiðaval workersins'],
  [/^web\/src\/worker\/(auth|felag|hjalp_agent|stjornbord|gmail_intake|moot|sigrun_vinna)\.mjs$/, 'auðkenning, admin-leiðir eða póstur'],
  [/(^|\/)[^/]*\.config\.[cm]?[jt]s$/, 'keyrir í byggingu eftir merge'],
  [/^web\/src\/middleware/, 'millilag sem sér hverja beiðni'],
];

/** Ástæða til að lesa skrána sérstaklega, eða null. */
export function vidvorun(slod) {
  for (const [m, a] of VIDVORUN) if (m.test(String(slod || ''))) return a;
  return null;
}

/** null ef slóðin er leyfð, annars ástæða. */
export function bannAstaeda(slod) {
  const s = String(slod || '');
  // Stýristafir: með `-z` koma slóðir óbreyttar, og skráarnafn með línuskilum gæti annars laumað línu
  // inn í $GITHUB_OUTPUT þar sem slóðin er nefnd.
  if (!s || /[\x00-\x1f\x7f]/.test(s) || s.includes('\\') || s.split('/').includes('..') || s.startsWith('/')) return 'ógild slóð';
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

/** Heildarmat: { ok, slodir, hafnad: [{slod, astaeda}], vidvaranir: [{slod, astaeda}] }.
 *  Tómur patch er EKKI leyfður (ekkert að gera). */
export function metaPatch({ numstat, summary }) {
  const slodir = [...new Set(slodirUrNumstat(numstat))];
  const hafnad = [], vidvaranir = [];
  const hamur = hattulegurHamur(summary);
  if (hamur) hafnad.push({ slod: '*', astaeda: hamur });
  for (const s of slodir) {
    const a = bannAstaeda(s);
    if (a) hafnad.push({ slod: s, astaeda: a });
    else { const v = vidvorun(s); if (v) vidvaranir.push({ slod: s, astaeda: v }); }
  }
  if (!slodir.length) hafnad.push({ slod: '*', astaeda: 'tómur patch' });
  return { ok: !hafnad.length, slodir, hafnad, vidvaranir };
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
  const r = villa ? { ok: false, slodir: [], hafnad: [{ slod: '*', astaeda: 'patch á ekki við grunninn: ' + villa }], vidvaranir: [] } : metaPatch({ numstat, summary });
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
