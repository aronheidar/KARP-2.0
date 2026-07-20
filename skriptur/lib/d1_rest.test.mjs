import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeD1, loadCreds } from './d1_rest.mjs';

const savedFetch = globalThis.fetch;
const savedTok = process.env.CLOUDFLARE_API_TOKEN;
const savedAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
function restore() {
  globalThis.fetch = savedFetch;
  if (savedTok === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = savedTok;
  if (savedAcc === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = savedAcc;
}

test('loadCreds: reads from env', () => {
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
  try {
    const c = loadCreds('/nonexistent/web');
    assert.equal(c.token, 'tok');
    assert.equal(c.account, 'acc');
  } finally { restore(); }
});

test('loadCreds: falls back to web/.dev.vars file', () => {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd1t-'));
  fs.writeFileSync(path.join(dir, '.dev.vars'), '# comment\nCLOUDFLARE_API_TOKEN="filetok"\nCLOUDFLARE_ACCOUNT_ID=fileacc\nOTHER=x\n');
  try {
    const c = loadCreds(dir);
    assert.equal(c.token, 'filetok');
    assert.equal(c.account, 'fileacc');
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('makeD1: throws when creds missing', () => {
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    assert.throws(() => makeD1('/nonexistent/web'), /Vantar CLOUDFLARE_API_TOKEN/);
  } finally { restore(); }
});

test('query: posts correct request and parses rows', async () => {
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc123';
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    seen = { url, opts };
    return { status: 200, json: async () => ({ success: true, result: [{ results: [{ n: 42 }], success: true }] }) };
  };
  try {
    const d1 = makeD1('/nonexistent/web');
    const rows = await d1.query('SELECT COUNT(*) n FROM felog', []);
    assert.deepEqual(rows, [{ n: 42 }]);
    assert.ok(seen.url.includes('/accounts/acc123/d1/database/'), 'url has account');
    assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
    assert.equal(JSON.parse(seen.opts.body).sql, 'SELECT COUNT(*) n FROM felog');
  } finally { restore(); }
});

test('query: throws on success:false', async () => {
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
  globalThis.fetch = async () => ({ status: 200, json: async () => ({ success: false, errors: [{ message: 'bad sql' }] }) });
  try {
    const d1 = makeD1('/nonexistent/web');
    await assert.rejects(() => d1.query('SELECT bogus'), /bad sql/);
  } finally { restore(); }
});

test('query: retries on HTTP 500 then succeeds', async () => {
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return { status: 500, json: async () => ({}) };
    return { status: 200, json: async () => ({ success: true, result: [{ results: [] }] }) };
  };
  try {
    const d1 = makeD1('/nonexistent/web');
    const rows = await d1.query('INSERT INTO x VALUES (1)');
    assert.deepEqual(rows, []);
    assert.equal(calls, 2, 'retried once');
  } finally { restore(); }
});
