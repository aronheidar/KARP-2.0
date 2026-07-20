// d1_rest.mjs — D1 aðgangur gegnum Cloudflare REST API (hrein `fetch`, ENGINN wrangler CLI).
// Ástæða: `npx wrangler` HRYNUR undir Windows Task Scheduler (enginn console/window-station →
// libuv `src\win\async.c` assertion, 0xC0000409). REST API notar bara node-fetch → virkar bakgrunns.
// Þarf CLOUDFLARE_API_TOKEN (D1:edit) + CLOUDFLARE_ACCOUNT_ID — úr env EÐA web/.dev.vars (KEY=VALUE, gitignored).
import fs from 'node:fs';
import path from 'node:path';

const DB_ID = process.env.D1_DATABASE_ID || '6b1672e6-13da-4d14-b45a-0d83a15ccef4';
const API = 'https://api.cloudflare.com/client/v4';

// Les KEY=VALUE úr dotfile (t.d. web/.dev.vars) — hunsar athugasemdir/tómar línur, strípar gæsalappir.
function parseDotfile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// Sækir token+account úr env, annars úr <webDir>/.dev.vars, annars <repoRoot>/.d1-creds.
export function loadCreds(webDir) {
  let token = process.env.CLOUDFLARE_API_TOKEN;
  let account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const files = [webDir && path.join(webDir, '.dev.vars'), webDir && path.join(webDir, '..', '.d1-creds')].filter(Boolean);
  for (const f of files) {
    if (token && account) break;
    try {
      if (!fs.existsSync(f)) continue;
      const kv = parseDotfile(fs.readFileSync(f, 'utf8'));
      token = token || kv.CLOUDFLARE_API_TOKEN;
      account = account || kv.CLOUDFLARE_ACCOUNT_ID;
    } catch { /* höldum áfram */ }
  }
  return { token, account };
}

// Býr til D1-viðskiptavin. webDir = slóð á web/ (finnur .dev.vars). Kastar ef vantar skilríki.
export function makeD1(webDir) {
  const { token, account } = loadCreds(webDir);
  if (!token || !account) {
    throw new Error('Vantar CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (env eða web/.dev.vars). Sjá d1_rest.mjs haus.');
  }
  const url = `${API}/accounts/${account}/d1/database/${DB_ID}/query`;
  // Keyrir SQL (ein EÐA fleiri setningar með ; á milli — D1 þáttar strengja-bókstafi rétt). Skilar
  // röðum FYRSTU setningar (fyrir SELECT). params = bundnar breytur (?). Endurreynir tímabundnar villur.
  async function query(sql, params = []) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
      let r;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, params }),
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) { lastErr = e; continue; }              // net/timeout → endurreyna
      if (r.status === 429 || r.status >= 500) { lastErr = new Error('D1 HTTP ' + r.status); continue; }
      let j;
      try { j = await r.json(); } catch (e) { throw new Error('D1 REST: ógilt JSON-svar (HTTP ' + r.status + ')'); }
      if (!j.success) throw new Error('D1 REST villa: ' + JSON.stringify(j.errors || j.messages || j));
      return (j.result && j.result[0] && j.result[0].results) || [];
    }
    throw lastErr || new Error('D1 REST: mistókst eftir endurtekningar');
  }
  return { query };
}
