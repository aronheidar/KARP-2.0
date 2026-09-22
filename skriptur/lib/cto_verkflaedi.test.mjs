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
  assert.deepEqual(Object.keys(wf.jobs).sort(), ['laga', 'profa', 'saekja', 'skila']);
  assert.ok(JSON.stringify(wf.jobs.laga).includes('claude -p'), 'líkanið keyrir í laga');
  assert.deepEqual(wf.jobs.skila.needs, ['saekja', 'laga', 'profa'], 'skila bíður prófanna');
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
  assert.match(ctoBrot(d).join(), /keyrir skriptu úr repo-inu: web\/skriptur\/eitthvad\.mjs/);
  const e = grunnur(); e.jobs.profa.steps.push({ run: 'echo "${{ github.event.client_payload.verk }}"' });
  assert.match(ctoBrot(e).join(), /\$\{\{ \}\} inni í run/);
  const f = grunnur(); delete f.permissions;
  assert.match(ctoBrot(f).join(), /engin permissions á workflow-stigi/);
});
