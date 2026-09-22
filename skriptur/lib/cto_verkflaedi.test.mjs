// Les .github/workflows/cto.yml og staðfestir öryggismörkin. js-yaml kemur með web/node_modules (Astro
// dregur það inn); vanti það fellur prófið VILJANDI, svo athugunin hverfi ekki í þögn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ctoBrot } from './cto_verkflaedi.mjs';

const rot = fileURLToPath(new URL('../../', import.meta.url));
const yaml = createRequire(rot + 'web/package.json')('js-yaml');
const lesa = (f) => yaml.load(readFileSync(rot + f, 'utf8'));

test('cto.yml stenst öryggismörkin', () => {
  const wf = lesa('.github/workflows/cto.yml');
  assert.deepEqual(ctoBrot(wf), []);
  // og hefur þau job sem mörkin byggja á: annars stæðist tómt verkflæði prófið
  assert.deepEqual(Object.keys(wf.jobs).sort(), ['laga', 'profa', 'skila']);
  assert.ok(JSON.stringify(wf.jobs.laga).includes('claude -p'), 'líkanið keyrir í laga');
  assert.deepEqual(wf.jobs.skila.needs, ['laga', 'profa'], 'skila bíður prófanna');
  // lykillinn og texti beiðnarinnar koma úr atburðaskránni, aldrei úr env (sem prentast)
  assert.ok(JSON.stringify(wf.jobs.laga).includes('GITHUB_EVENT_PATH'));
  // athugasemd skila-jobbsins getur nefnt skráarnöfn sem líkanið valdi: hún fer um skrá, ekki skrefaúttak í env
  assert.ok(!JSON.stringify(wf.jobs.skila).includes('outputs.note'), 'athugasemdin fer ekki um env');
});

// Hönnunin sem var í notkun 21.9: eitt job, skrifaðgangur á workflow-stigi, vistuð skilríki, og admin-
// lykillinn á skrefi Á EFTIR líkaninu. Prófið verður að fella hana — annars sannar það ekkert.
const GAMLA = {
  permissions: { contents: 'write', 'pull-requests': 'write' },
  jobs: {
    laga: {
      env: { ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}' },
      steps: [
        { uses: 'actions/checkout@v7', with: { 'fetch-depth': 0 } },
        { name: 'Sækja', env: { KARP_ADMIN_KEY: '${{ secrets.KARP_ADMIN_KEY }}' }, run: 'curl -H "X-Admin-Key: $KARP_ADMIN_KEY" https://karp.is/api/admin/ticket' },
        { run: 'npm ci', 'working-directory': 'web' },
        { run: 'claude -p "$(cat cto_prompt.txt)" --permission-mode bypassPermissions' },
        { run: 'npm test' },
        { env: { GH_TOKEN: '${{ github.token }}' }, run: 'git push -u origin "$BR" --force' },
        { env: { KARP_ADMIN_KEY: '${{ secrets.KARP_ADMIN_KEY }}' }, run: 'node -e "fetch(...)"' },
      ],
    },
  },
};

test('prófið fellir gömlu hönnunina — á öllum mörkunum sem hún braut', () => {
  const b = ctoBrot(GAMLA);
  for (const vaent of ['skrifaðgangur á workflow-stigi', 'líkanið keyrir í job með leyndarmálinu KARP_ADMIN_KEY', 'líkanið keyrir í job með skrifaðgang', 'checkout vistar git-skilríki'])
    assert.ok(b.some((x) => x.includes(vaent)), vaent + ' — fékk: ' + b.join(' | '));
});

test('einstök brot greinast hvert fyrir sig', () => {
  const grunnur = () => JSON.parse(JSON.stringify({ permissions: {}, jobs: {
    profa: { permissions: { contents: 'read' }, steps: [{ uses: 'actions/checkout@v7', with: { 'persist-credentials': false } }, { run: 'node skriptur/lib/cto_sia.mjs "$P"\ngit apply --index "$P"' }, { run: 'npm test' }] },
    skila: { permissions: { contents: 'write' }, env: { K: '${{ secrets.KARP_ADMIN_KEY }}' }, steps: [{ uses: 'actions/checkout@v7' }, { run: 'SIA=$(node skriptur/lib/cto_sia.mjs "$P")\ngit apply --index "$P"\ngit push' }] },
  } }));
  assert.deepEqual(ctoBrot(grunnur()), []);
  const a = grunnur(); a.jobs.profa.env = { X: '${{ secrets.POSTIZ_API_KEY }}' };
  assert.match(ctoBrot(a).join(), /profa: kóði úr repo-inu keyrir í job með leyndarmálinu POSTIZ_API_KEY/);
  const b = grunnur(); b.jobs.skila.steps.push({ run: 'npm ci' });
  assert.match(ctoBrot(b).join(), /skila: kóði úr repo-inu keyrir í job með leyndarmálinu KARP_ADMIN_KEY/);
  assert.match(ctoBrot(b).join(), /skila: kóði úr repo-inu keyrir í job með skrifaðgang/);
  const c = grunnur(); c.jobs.skila.steps[1].run = 'git apply --index "$P"\nnode skriptur/lib/cto_sia.mjs "$P"';
  assert.match(ctoBrot(c).join(), /patchinu beitt áður en sían keyrir/);
  const d = grunnur(); d.jobs.skila.steps.push({ run: 'node web/skriptur/eitthvad.mjs' });
  assert.match(ctoBrot(d).join(), /skila: kóði úr repo-inu keyrir í job með leyndarmálinu KARP_ADMIN_KEY/, 'aðeins grunnútgáfa síunnar má keyra þar');
  const e = grunnur(); e.jobs.profa.steps.push({ run: 'echo "${{ github.event.client_payload.verk }}"' });
  assert.match(ctoBrot(e).join(), /\$\{\{ \}\} inni í run/);
  const f = grunnur(); delete f.permissions;
  assert.match(ctoBrot(f).join(), /engin permissions á workflow-stigi/);
});

test('rýnin 22.9: líkanið greinist í öllum myndum, og pakkastjórar aðrir en npm líka', () => {
  const med = (run) => ({ permissions: {}, jobs: { j: { permissions: { contents: 'write' }, steps: [{ uses: 'actions/checkout@v7', with: { 'persist-credentials': false } }, { run }] } } });
  for (const run of ['claude  --print "x"', 'claude --permission-mode bypassPermissions -p x', 'npx @anthropic-ai/claude-code -p x'])
    assert.match(ctoBrot(med(run)).join(), /líkanið keyrir í job með skrifaðgang/, run);
  for (const run of ['pnpm test', 'yarn build', 'bun run x', 'node skriptur/build.mjs'])
    assert.match(ctoBrot(med(run)).join(), /kóði úr repo-inu keyrir í job með skrifaðgang/, run);
  // án kóða á vélinni keyrir node aðeins það sem skrefið skrifaði sjálft
  const saekja = { permissions: {}, jobs: { s: { permissions: {}, env: { K: '${{ secrets.KARP_ADMIN_KEY }}' }, steps: [{ run: 'cat > p.cjs <<EOF\nEOF\nnode p.cjs' }] } } };
  assert.deepEqual(ctoBrot(saekja), []);
  // rýnin 22.9: klón í stað checkout er líka kóði á vélinni, og pakkastjóri keyrir kóða hvar sem er
  const klon = { permissions: {}, jobs: { k: { permissions: { contents: 'write' }, env: { K: '${{ secrets.KARP_ADMIN_KEY }}' }, steps: [{ run: 'git clone https://github.com/x/y && cd y && npm ci && npm test' }] } } };
  assert.match(ctoBrot(klon).join(), /k: kóði úr repo-inu keyrir í job með leyndarmálinu KARP_ADMIN_KEY/);
  const python = { permissions: {}, jobs: { k: { permissions: { contents: 'write' }, steps: [{ uses: 'actions/download-artifact@v4' }, { run: 'python3 skripta.py' }] } } };
  assert.match(ctoBrot(python).join(), /k: kóði úr repo-inu keyrir í job með skrifaðgang/);
});

test('rýnin 22.9: farmur atburðarins í env prentast í opinbera skrá — aðeins númerið má standa þar', () => {
  const med = (env, stig = 'job') => ({ permissions: {}, env: stig === 'wf' ? env : undefined, jobs: { j: { permissions: {}, env: stig === 'job' ? env : undefined, steps: [{ run: 'echo x', env: stig === 'step' ? env : undefined }] } } });
  assert.deepEqual(ctoBrot(med({ TICKET: '${{ github.event.client_payload.ticket }}' }, 'wf')), []);
  assert.match(ctoBrot(med({ L: '${{ github.event.client_payload.lykill }}' }, 'wf')).join(), /workflow: github\.event\.client_payload\.lykill í env/);
  assert.match(ctoBrot(med({ V: '${{ github.event.client_payload.verk }}' }, 'job')).join(), /j: github\.event\.client_payload\.verk/);
  assert.match(ctoBrot(med({ V: '${{ inputs.verk }}' }, 'step')).join(), /j: inputs\.verk/);
  assert.match(ctoBrot(med({ P: '${{ toJson(github.event) }}' }, 'step')).join(), /toJson\(github\.event\)/);
  assert.match(ctoBrot(med({ P: '${{ github.event.client_payload }}' }, 'step')).join(), /github\.event\.client_payload í env/);
  // úttak annars job-s í env prentast líka — svona fór beiðnin í opinbera skrá í fyrstu skiptingunni
  assert.match(ctoBrot(med({ P: '${{ needs.saekja.outputs.prompt }}' }, 'step')).join(), /needs\.saekja\.outputs\.prompt/);
  assert.deepEqual(ctoBrot(med({ L: '${{ needs.laga.result }}' }, 'job')), [], 'niðurstaða job-s er ekki gögn');
});
