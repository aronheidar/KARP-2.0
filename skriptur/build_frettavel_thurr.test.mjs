// Prufuhamurinn keyrir alla fréttavélina á raungögnum en MÁ EKKERT SKRIFA. Án lykils: bakgrunnur án ritunar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAKTADAR = ['gogn/frettavel.json', 'gogn/frettavel_state.json', 'gogn/frettavel_seen.json', 'gogn/frettavel_archive.json',
  'web/public/frettavel.xml', 'web/public/gogn/frettavel.json', 'web/public/gogn/frettavel_archive.json'];
const fingrafar = () => Object.fromEntries(VAKTADAR.map((f) => {
  const p = path.join(ROT, f);
  return [f, existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : null];
}));

test('--thurr skrifar ekkert og sýnir bakgrunn á sýnishornum úr safninu', { timeout: 120000 }, () => {
  const fyrir = fingrafar();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; delete env.GITHUB_STEP_SUMMARY; delete env.KARP_FRETTAVEL_NYTT;
  const r = spawnSync(process.execPath, ['skriptur/build_frettavel.js', '--thurr', '--endurskrifa', '12'], { cwd: ROT, env, encoding: 'utf8', timeout: 110000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /===== PRUFUKEYRSLA/);
  assert.match(r.stdout, /_Bakgrunnur:_ `\{/, 'a.m.k. eitt sýnishorn fær bakgrunn úr raungögnum');
  assert.deepEqual(fingrafar(), fyrir, 'prufuhamur má ekki snerta birt gögn');
});
