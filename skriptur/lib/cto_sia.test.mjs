import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bannAstaeda, slodirUrNumstat, hattulegurHamur, metaPatch, vidvorun, vidkvaemarSlodir } from './cto_sia.mjs';

const SIA = fileURLToPath(new URL('./cto_sia.mjs', import.meta.url));

test('bannAstaeda: web/ og skriptur/ leyfð, en hvorki flutningar, bindingar, pakkar, greiðslur né sían sjálf', () => {
  for (const s of ['web/src/pages/fasteignaverd.astro', 'web/src/lib/stjorn/vika.mjs', 'skriptur/build_leiga.js', 'web/public/gogn/x.json']) assert.equal(bannAstaeda(s), null, s);
  const bann = {
    'web/migrations/0018_x.sql': 'gagnagrunnsflutningur',
    'web/wrangler.toml': 'wrangler.toml',
    'web/package.json': 'pakkaskrá', 'package-lock.json': 'pakkaskrá', 'skriptur/markadsefni/package.json': 'pakkaskrá',
    'web/.npmrc': 'pakkastilling',
    'web/src/worker/greidslur.mjs': 'greiðslukóði', 'web/src/lib/Askell.mjs': 'greiðslukóði',
    'web/.astro/types.d.ts': 'byggingarskrá',
    'skriptur/lib/cto_sia.mjs': 'sían sjálf', 'skriptur/lib/cto_sia.test.mjs': 'sían sjálf',
    // rýnin 22.9
    'web/wrangler.json': 'wrangler-stilling', 'web/wrangler.jsonc': 'wrangler-stilling', 'web/wrangler.toml': 'wrangler-stilling',
    'web/pnpm-lock.yaml': 'pakkaskrá', 'yarn.lock': 'pakkaskrá', 'web/.yarnrc.yml': 'pakkastilling',
    'skriptur/lib/cto_verkflaedi.mjs': 'sían sjálf', 'skriptur/lib/cto_verkflaedi.test.mjs': 'sían sjálf',
    'skriptur/ci_worker_bindings.mjs': 'CI-hlið', 'skriptur/check_links.js': 'CI-hlið',
    'web/src/lib/stripe.mjs': 'greiðslukóði', 'web/src/worker/greidsla_ny.mjs': 'greiðslukóði',
    '.github/workflows/cto.yml': 'utan web/ og skriptur/', 'gogn/x.json': 'utan web/ og skriptur/', 'README.md': 'utan web/ og skriptur/',
    'web/../.github/x': 'ógild slóð', '/etc/passwd': 'ógild slóð', 'web\\x': 'ógild slóð', '': 'ógild slóð',
    'web/a\npr=https://evil.example': 'ógild slóð', 'web/a\rb': 'ógild slóð',
  };
  for (const [s, a] of Object.entries(bann)) assert.ok(String(bannAstaeda(s)).startsWith(a), s + ' → ' + bannAstaeda(s));
});

test('slodirUrNumstat: endurnefning telur BÁÐAR slóðir, líka tvíundarskrár', () => {
  assert.deepEqual(slodirUrNumstat('3\t1\tweb/a.mjs\0-\t-\tweb/mynd.png\0'), ['web/a.mjs', 'web/mynd.png']);
  assert.deepEqual(slodirUrNumstat('0\t0\t\0web/a.mjs\0gogn/a.mjs\0'), ['web/a.mjs', 'gogn/a.mjs']);
  assert.deepEqual(slodirUrNumstat(''), []);
});

test('hattulegurHamur + metaPatch: tenglar, undireiningar og tómur patch falla', () => {
  assert.equal(hattulegurHamur(' create mode 120000 web/leid'), 'táknrænn tengill (symlink)');
  assert.equal(hattulegurHamur(' create mode 160000 web/undir'), 'undireining (submodule)');
  assert.equal(hattulegurHamur(' create mode 100644 web/a.mjs'), null);
  assert.deepEqual(metaPatch({ numstat: '1\t0\tweb/a.mjs\0', summary: '' }), { ok: true, slodir: ['web/a.mjs'], hafnad: [], vidvaranir: [] });
  assert.equal(metaPatch({ numstat: '', summary: '' }).ok, false, 'ekkert að gera');
  const r = metaPatch({ numstat: '1\t0\tweb/a.mjs\0' + '0\t0\t\0web/b.mjs\0.github/b.mjs\0', summary: '' });
  assert.deepEqual(r.hafnad, [{ slod: '.github/b.mjs', astaeda: 'utan web/ og skriptur/' }], 'að flytja skrá út af svæðinu er breyting á henni');
});

test('vidvorun: auðkenning, póstur og stillingar sem keyra í byggingu eru leyfðar en merktar', () => {
  assert.equal(vidvorun('web/src/worker/auth.mjs'), 'auðkenning, admin-leiðir eða póstur');
  assert.equal(vidvorun('web/worker.js'), 'leiðaval workersins');
  assert.equal(vidvorun('web/astro.config.mjs'), 'keyrir í byggingu eftir merge');
  assert.equal(vidvorun('web/src/pages/fasteignaverd.astro'), null);
  const r = metaPatch({ numstat: '2\t1\tweb/src/worker/hjalp_agent.mjs\0' + '1\t0\tweb/src/lib/a.mjs\0', summary: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.vidvaranir, [{ slod: 'web/src/worker/hjalp_agent.mjs', astaeda: 'auðkenning, admin-leiðir eða póstur' }]);
});

test('vidkvaemarSlodir: rýnin 22.9 — innihald ræður, ekki aðeins nafnið (bilanir.mjs athugar lykilinn)', () => {
  const patch = 'diff --git a/web/src/worker/bilanir.mjs b/web/src/worker/bilanir.mjs\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n'
    + 'diff --git a/web/src/lib/x.mjs b/web/src/lib/x.mjs\n@@ -1 +1 @@\n-// gamalt\n+if (req.headers.get("X-Admin-Key")) ok();\n'
    + 'diff --git a/web/src/lib/y.mjs b/web/src/lib/y.mjs\n@@ -1 +1 @@\n-a\n+b\n';
  const grunnar = { 'web/src/worker/bilanir.mjs': 'const k = env.KARP_ADMIN_KEY;', 'web/src/lib/y.mjs': 'export const y = 1;' };
  assert.deepEqual([...vidkvaemarSlodir(patch, (s) => grunnar[s] || '')].sort(), ['web/src/lib/x.mjs', 'web/src/worker/bilanir.mjs'],
    'bilanir.mjs af grunninum, x.mjs af breytingunni, y.mjs hvorugt');
  const r = metaPatch({ numstat: '1\t1\tweb/src/worker/bilanir.mjs\0', summary: '', vidkvaemar: new Set(['web/src/worker/bilanir.mjs']) });
  assert.deepEqual(r.vidvaranir, [{ slod: 'web/src/worker/bilanir.mjs', astaeda: 'snertir auðkenningu, lykla eða póst' }]);
});

// Raunverulegt git-repo: sían er keyrð nákvæmlega eins og cto.yml keyrir hana.
function nyttRepo() {
  const d = mkdtempSync(join(tmpdir(), 'cto-sia-'));
  const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.email', 'p@p.is'); git('config', 'user.name', 'p'); git('config', 'core.autocrlf', 'false');
  mkdirSync(join(d, 'web'), { recursive: true }); mkdirSync(join(d, '.github'), { recursive: true });
  writeFileSync(join(d, 'web', 'a.mjs'), 'export const a = 1;\n');
  writeFileSync(join(d, '.github', 'w.yml'), 'x: 1\n');
  git('add', '-A'); git('commit', '-qm', 'grunnur');
  const patch = (breyta) => { breyta(d); git('add', '-A'); const p = git('diff', '--cached', '--binary', 'HEAD'); git('reset', '-q', '--hard', 'HEAD'); git('clean', '-qfd'); const f = join(d, '..', 'p-' + Math.random().toString(36).slice(2) + '.patch'); writeFileSync(f, p); return f; };
  const sia = (f) => { const r = spawnSync(process.execPath, [SIA, f], { cwd: d, encoding: 'utf8' }); return { kodi: r.status, j: JSON.parse(r.stdout || '{}') }; };
  return { d, patch, sia, lok: () => rmSync(d, { recursive: true, force: true }) };
}

test('cto_sia (skipun): leyfð breyting fer í gegn, .github og tenglar falla, og patch sem á ekki við fellur', (t) => {
  const r = nyttRepo();
  t.after(r.lok);
  const gott = r.patch((d) => writeFileSync(join(d, 'web', 'a.mjs'), 'export const a = 2;\n'));
  assert.deepEqual(r.sia(gott), { kodi: 0, j: { ok: true, slodir: ['web/a.mjs'], hafnad: [], vidvaranir: [] } });
  const vont = r.patch((d) => { writeFileSync(join(d, 'web', 'a.mjs'), 'export const a = 3;\n'); writeFileSync(join(d, '.github', 'w.yml'), 'x: 2\n'); });
  const v = r.sia(vont);
  assert.equal(v.kodi, 1);
  assert.deepEqual(v.j.hafnad, [{ slod: '.github/w.yml', astaeda: 'utan web/ og skriptur/' }], 'EIN óleyfileg skrá fellir allan patchinn');
  let tengill = null;
  try { tengill = r.patch((d) => symlinkSync('/etc/passwd', join(d, 'web', 'leid'))); } catch { tengill = null; }   // Windows án réttinda: sleppt
  if (tengill) assert.equal(r.sia(tengill).j.hafnad[0].astaeda, 'táknrænn tengill (symlink)');
  writeFileSync(join(r.d, 'web', 'a.mjs'), 'export const a = 99;\n');   // grunnurinn hefur breyst: patchinn á ekki lengur við
  execFileSync('git', ['commit', '-qam', 'annað'], { cwd: r.d });
  const g = r.sia(gott);
  assert.equal(g.kodi, 1);
  assert.match(g.j.hafnad[0].astaeda, /^patch á ekki við grunninn/);
});
