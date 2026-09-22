// Prufuhamurinn keyrir alla fréttavélina á raungögnum en MÁ EKKERT SKRIFA. Án lykils: bakgrunnur án ritunar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Flutt inn (ekki keyrt beint) => aðeins föllin; main() keyrir ekki og ekkert er skrifað.
const { synishornUrSafni, vorumerkjaKt, prufukeyrsla } = require('./build_frettavel.js');
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

// Upphafsdagur skorts (lyfFyrst) er reiknaður í lyf_detect.js ásamt grunni lyfjafrétta; prófin eru í lyf_detect.test.mjs.

// Safnið geymir ekki kt, en persónuverndarvörnin hvílir á henni (5 af 7 vörumerkjasýnishornum 22.9 voru einstaklingar).
test('sýnishorn úr safninu fá kt (gjaldþrot úr id, vörumerki úr skránni) og birtingardag', () => {
  const vmKt = vorumerkjaKt({ byKt: { '0101801234': [{ id: 'V1', titill: 'JÓN' }], '5501692829': [{ id: 'V2', titill: 'DAGAR' }] } });
  const items = [
    { id: 'gjaldthrot-116-2026-6209230600', type: 'gjaldthrot', date: '2026-09-10', facts: { felag: 'X ehf.' }, title: 't', text: 'x' },
    { id: 'vorumerki-V1', type: 'vorumerki', date: '2026-09-08', facts: { merki: 'JÓN', eigandi: 'Jón Jónsson', bakgrunnur: { gamall: 1 } }, title: 't', text: 'x' },
    { id: 'vorumerki-V9', type: 'vorumerki', date: '2026-09-07', facts: { merki: 'HORFIÐ', eigandi: 'Óþekkt' }, title: 't', text: 'x' },
    { id: 'urslit-1', type: 'urslit', date: '2026-09-05', facts: { sigurvegarar: ['Dagar hf.'] }, title: 't', text: 'x' },
    { id: 'mark-gamalt', type: 'mark', date: '2026-01-01', facts: { felag: 'Siminn hf' }, title: 't', text: 'x' },
  ];
  const s = synishornUrSafni(items, 10, { studdar: ['gjaldthrot', 'vorumerki', 'urslit', 'mark'], markMork: '2026-09-20', vmKt });
  const eftirId = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.equal(eftirId['prufa-gjaldthrot-116-2026-6209230600'].kt, '6209230600');
  assert.equal(eftirId['prufa-vorumerki-V1'].kt, '0101801234');
  assert.equal(eftirId['prufa-vorumerki-V9'].kt, undefined, 'finnst ekki í skránni: engin kt (og þar með enginn bakgrunnur)');
  assert.equal(eftirId['prufa-urslit-1'].kt, undefined);
  assert.equal(eftirId['prufa-mark-gamalt'], undefined, 'markaðsfrétt eldri en mörkin');
  assert.equal(eftirId['prufa-vorumerki-V1'].birt, '2026-09-08');
  assert.equal(eftirId['prufa-vorumerki-V1'].facts.bakgrunnur, undefined, 'gamall bakgrunnur fjarlægður');
});

test('prufuhamur prentar hverja frétt um leið og hún er tilbúin, líka í GITHUB_STEP_SUMMARY, og hefur ekkert fjöldaþak', async () => {
  const skra = path.join(os.tmpdir(), 'frettavel-samantekt-' + process.pid + '.md');
  writeFileSync(skra, '');
  const fyrriSkra = process.env.GITHUB_STEP_SUMMARY, fyrriLog = console.log;
  const iSamantekt = [];
  const GOTT = JSON.stringify({ title: 'Síminn lækkar um 7,3%', text: 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.' });
  const client = { messages: { create: async () => {
    iSamantekt.push(readFileSync(skra, 'utf8'));   // hvað stóð í samantektinni þegar þessi frétt var send
    return { content: [{ type: 'text', text: GOTT }], stop_reason: 'end_turn' };
  } } };
  const ev = Array.from({ length: 35 }, (_, i) => ({ id: 'mark-' + i, type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 }, title: 'gamall', text: 'gamall texti' }));
  const log = [];
  process.env.GITHUB_STEP_SUMMARY = skra;
  console.log = (...a) => log.push(a.join(' '));
  try { await prufukeyrsla(ev, {}, { client }); }
  finally {
    console.log = fyrriLog;
    if (fyrriSkra === undefined) delete process.env.GITHUB_STEP_SUMMARY; else process.env.GITHUB_STEP_SUMMARY = fyrriSkra;
  }
  const lok = readFileSync(skra, 'utf8');
  rmSync(skra, { force: true });
  assert.equal(iSamantekt.length, 35, 'ekkert fjöldaþak: allar 35 skrifaðar þótt HAMARK sé 30');
  assert.match(iSamantekt[1], /### mark · mark-0\n/, 'fyrsta fréttin var komin í samantektina áður en sú næsta var send');
  assert.doesNotMatch(iSamantekt[1], /### mark · mark-1\n/);
  assert.equal((lok.match(/^### mark · /gm) || []).length, 35, 'hver frétt prentast einu sinni');
  assert.match(lok, /Tölfræði: \{"skrifadar":35/);
  assert.match(log.join('\n'), /===== PRUFUKEYRSLA/);
});
