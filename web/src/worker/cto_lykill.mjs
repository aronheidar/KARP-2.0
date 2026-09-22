// cto_lykill.mjs (worker) — lykill CTO-keyrslunnar: gildir fyrir EINA beiðni í tvær klukkustundir.
//
// ⚠⚠ AF HVERJU (22.9.2026). cto.yml keyrir líkan á texta sem hver sem er getur sent á hjalp@, í
//    OPNU repo. GitHub prentar `env:`-gildi hvers skrefs efst í keyrsluskrána, og job-úttak fer um
//    `env:` — svo beiðnin fór í opinbera skrá (90 daga) hvort sem hún lá í úttaki eða artifact.
//    Nú sækir vél líkansins beiðnina SJÁLF á karp.is með þessum lykli, sem workerinn setur í
//    repository_dispatch-farminn. Farmurinn er á vélinni í $GITHUB_EVENT_PATH og prentast hvergi.
//    Lykillinn opnar aðeins beiðnina sem hann var gefinn út fyrir, og aðeins til að LESA hana og
//    skila drögum um hana. Líkanið sér hann — það má það, því það hefur beiðnina hvort eð er.
// Hrein HMAC-leið (SESSION_SECRET, með forskeyti sem engin lotukaka getur borið).
import { _ajson, _hmac } from './felag.mjs';

const GILDI_SEK = 2 * 3600;
const UPSERT_DROG = 'INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated';
const _ctoNu = () => Math.floor(Date.now() / 1000);
const _ctoSkilabod = (id, exp) => 'cto-lykill:' + Number(id) + ':' + Number(exp);

/** Lykill fyrir beiðni `id`: `<exp>.<hmac>`. */
export async function ctoLykill(env, id, nu = _ctoNu()) {
  const exp = Number(nu) + GILDI_SEK;
  return exp + '.' + await _hmac(env, _ctoSkilabod(id, exp));
}

function _ctoJafnt(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/** Gildir lykillinn fyrir ÞESSA beiðni, núna? Rangt snið, útrunninn, of langt fram í tímann eða ekki
 *  gefinn út fyrir þetta númer → nei. Aldrei kast. */
export async function ctoLykillGildur(env, id, lykill, nu = _ctoNu()) {
  const m = /^(\d{9,11})\.([A-Za-z0-9_-]{20,100})$/.exec(String(lykill || ''));
  if (!m || !(Number(id) > 0) || !Number.isInteger(Number(id))) return false;
  const exp = Number(m[1]);
  if (exp < Number(nu) || exp > Number(nu) + GILDI_SEK + 60) return false;
  const rett = await _hmac(env, _ctoSkilabod(id, exp)).catch(() => null);
  return _ctoJafnt(rett, m[2]);
}

/**
 * /api/cto/beidni?id=N (GET) — aðeins það sem promptið þarf: flokkur, tegund, lýsing, cto_brief
 *   greiningarinnar og verkbeiðni Hrafns úr Moot (ef Aron sagði Já).
 * /api/cto/drog (POST {id, svar, hali}) — tillagan að svari og hali loggsins, geymd þar til cto_result
 *   kemur og skeytir þeim við samantektina (ctoDrogTaka).
 * Lykillinn fer í hausinn X-CTO-Lykill. `lesaMoot` er mootVerkbeidni úr moot.mjs, gefið stöðubundið
 * (moot.mjs flytur inn hjalp_agent.mjs, sem flytur inn þessa skrá).
 */
export async function ctoHandler(request, env, lesaMoot) {
  const url = new URL(request.url);
  const lykill = request.headers.get('X-CTO-Lykill') || '';
  if (url.pathname === '/api/cto/beidni' && request.method === 'GET') {
    const id = parseInt(url.searchParams.get('id') || '', 10);
    if (!(await ctoLykillGildur(env, id, lykill))) return _ajson({ ok: false, error: 'lykill' });
    const t = await env.TENGSL.prepare('SELECT id, flokkur, tegund, lysing, ai_greining FROM tickets WHERE id=?').bind(id).first().catch(() => null);
    if (!t) return _ajson({ ok: false, error: 'notfound' });
    let g = {}; try { g = JSON.parse(t.ai_greining || '{}') || {}; } catch { g = {}; }
    const moot = typeof lesaMoot === 'function' ? await lesaMoot(env, id).catch(() => '') : '';
    return _ajson({ ok: true, beidni: { id: Number(t.id), flokkur: String(t.flokkur || ''), tegund: String(t.tegund || ''), lysing: String(t.lysing || ''),
      cto_brief: typeof g.cto_brief === 'string' ? g.cto_brief : '', moot: String(moot || '') } });
  }
  if (url.pathname === '/api/cto/drog' && request.method === 'POST') {
    const b = (await request.json().catch(() => null)) || {};
    const id = parseInt(b.id, 10);
    if (!(await ctoLykillGildur(env, id, lykill))) return _ajson({ ok: false, error: 'lykill' });
    const drog = { svar: String(b.svar || '').slice(0, 900), hali: String(b.hali || '').slice(0, 1500), ts: _ctoNu() };
    const ok = await env.TENGSL.prepare(UPSERT_DROG).bind('cto_drog:' + id, JSON.stringify(drog), drog.ts).run().then(() => true).catch(() => false);
    return _ajson({ ok });
  }
  return _ajson({ ok: false, error: 'method' });
}

/** cto_result sækir drögin og eyðir þeim: þau eiga aðeins við þessa einu keyrslu. */
export async function ctoDrogTaka(env, id) {
  const k = 'cto_drog:' + Number(id);
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(k).first().catch(() => null);
  if (!r) return null;
  await env.TENGSL.prepare('DELETE FROM stjorn_sync WHERE k=?').bind(k).run().catch(() => {});
  try { const j = JSON.parse(r.v); return j && typeof j === 'object' ? j : null; } catch { return null; }
}
