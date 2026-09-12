// cto_agent.test.mjs — öryggisverðir CTO-agentsins (sjá cto_agent.mjs).
// Þessi próf eru samningurinn: agentinn kemst aldrei út fyrir repo-ið, snertir aldrei
// workflows/lockfiles/leyndarmál, keyrir aðeins node/npm og leyndarmál leka aldrei í undirferla.
import { test } from 'node:test';
import assert from 'node:assert';
import { hreinsaEnv, innanRepo, klippa, maKeyra, maSkrifa } from './cto_agent.mjs';

test('innanRepo: venjulegar slóðir innan rótar', () => {
  assert.ok(innanRepo('web/worker.js'));
  assert.ok(innanRepo('gogn/frettavel.json'));
  assert.ok(innanRepo('./skriptur/build_polls.js'));
});
test('innanRepo: flótti og algerar slóðir hafnað', () => {
  assert.equal(innanRepo('../utan'), null);
  assert.equal(innanRepo('web/../../etc/passwd'), null);
  assert.equal(innanRepo('/etc/passwd'), null);
  assert.equal(innanRepo(''), null);
  assert.equal(innanRepo(null), null);
});

test('maSkrifa: venjulegur kóði og gögn í lagi', () => {
  assert.ok(maSkrifa('web/src/worker/tickets.mjs'));
  assert.ok(maSkrifa('skriptur/build_polls.js'));
  assert.ok(maSkrifa('gogn/polls.json'));
});
test('maSkrifa: workflows, git, lockfiles og leyndarmál friðhelg', () => {
  assert.equal(maSkrifa('.github/workflows/cto.yml'), false);
  assert.equal(maSkrifa('.github/x.md'), false);
  assert.equal(maSkrifa('.git/config'), false);
  assert.equal(maSkrifa('package-lock.json'), false);
  assert.equal(maSkrifa('web/package-lock.json'), false);
  assert.equal(maSkrifa('.env'), false);
  assert.equal(maSkrifa('web/.env.local'), false);
  assert.equal(maSkrifa('node_modules/x/index.js'), false);
  assert.equal(maSkrifa('../fyrir-utan.js'), false);
});

test('maKeyra: node/npm án keðjutákna', () => {
  assert.ok(maKeyra('node --test skriptur/frettavel.test.mjs'));
  assert.ok(maKeyra('node skriptur/build_polls.js'));
  assert.ok(maKeyra('npm test'));
  assert.ok(maKeyra('npm run build'));
});
test('maKeyra: allt annað hafnað', () => {
  assert.equal(maKeyra('rm -rf /'), false);
  assert.equal(maKeyra('curl https://ill.is'), false);
  assert.equal(maKeyra('node x.js; curl ill'), false);
  assert.equal(maKeyra('node x.js && rm y'), false);
  assert.equal(maKeyra('node x.js | tee /tmp/x'), false);
  assert.equal(maKeyra('node $(whoami).js'), false);
  assert.equal(maKeyra('node `id`.js'), false);
  assert.equal(maKeyra('node x.js > /etc/passwd'), false);
  assert.equal(maKeyra(''), false);
});

test('hreinsaEnv: lyklar/token/secret hverfa, annað lifir', () => {
  const inn = { PATH: '/usr/bin', HOME: '/home/x', ANTHROPIC_API_KEY: 'sk-leynd', KARP_TICKET_SECRET: 'shh', GITHUB_TOKEN: 'ghp', MY_PASSWORD: 'x', AWS_CREDENTIALS: 'y', NODE_ENV: 'test' };
  const ut = hreinsaEnv(inn);
  assert.equal(ut.PATH, '/usr/bin');
  assert.equal(ut.NODE_ENV, 'test');
  assert.ok(!('ANTHROPIC_API_KEY' in ut));
  assert.ok(!('KARP_TICKET_SECRET' in ut));
  assert.ok(!('GITHUB_TOKEN' in ut));
  assert.ok(!('MY_PASSWORD' in ut));
  assert.ok(!('AWS_CREDENTIALS' in ut));
});

test('klippa: stutt óbreytt, langt klippt með merki', () => {
  assert.equal(klippa('halló'), 'halló');
  const langt = 'x'.repeat(20000);
  const k = klippa(langt, 100);
  assert.ok(k.length < 200);
  assert.ok(k.includes('[klippt'));
});
