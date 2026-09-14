// bilanir.mjs — bilanalisti Hrafns: hvað er brotið sem enginn kvartaði yfir.
//
// Flest sem bilar á karp.is kvartar enginn notandi yfir: tvær CI-keyrslur féllu 14.9 og enginn tók
// eftir, og karp2-byggingin fellur við hvert einasta push. Hér eru þessar uppsprettur sóttar í GitHub
// og settar á einn lista sem Hrafn getur verið sendur á.
//
// ⚠ 10 mínútna fyrning í stjorn_sync: /stjorn/ má hvorki hægja á sér né hamra GitHub-kvótann.
// ⚠ GitHub niðri má ALDREI fella spjaldið — þá stendur síðasti þekkti listi og villan er merkt.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';

const _blNow = () => Math.floor(Date.now() / 1000);
const _blRepo = 'aronheidar/KARP-2.0';
const _BL_FYRNING = 600;          // sek
const _BL_PR_DAGAR = 7;           // opinn PR eldri en þetta telst gleymdur

async function _blGh(env, slod) {
  const r = await fetch('https://api.github.com/repos/' + _blRepo + '/' + slod, {
    headers: { Authorization: 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'karp21-worker' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('gh ' + r.status);
  return r.json();
}
const _blSek = (iso) => Math.floor(new Date(iso || 0).getTime() / 1000) || 0;

async function _blAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

async function _blGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='bilanir'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

/** Snyrtir listann fyrir geymslu. ⚠ Klippt er AFTAN AF LISTANUM, aldrei á miðju JSON-i: hálft JSON
 *  þáttast ekki og þá hyrfi síðasti þekkti listi einmitt þegar GitHub er niðri og hans er mest þörf. */
function _blSnyrta(bilanir) {
  const snyrt = bilanir.slice(0, 40).map((b) => ({
    uppspretta: String(b.uppspretta || '').slice(0, 40),
    lysing: String(b.lysing || '').slice(0, 200),
    sidan: Number(b.sidan) || 0,
    alvarleiki: b.alvarleiki,
    slod: String(b.slod || '').slice(0, 300),
  }));
  while (snyrt.length > 1 && JSON.stringify({ bilanir: snyrt }).length > 8000) snyrt.pop();
  return snyrt;
}

/** Sækir bilanalistann (eða skilar geymdum innan fyrningar). */
export async function saekjaBilanir(env, { thvinga = false } = {}) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  const geymt = await _blGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _blNow() - _BL_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);

  const bilanir = [];
  let vantar = [];
  try {
    const [ci, cto, checks, prs] = (await Promise.allSettled([
      _blGh(env, 'actions/workflows/ci.yml/runs?branch=main&per_page=5'),
      _blGh(env, 'actions/workflows/cto.yml/runs?per_page=5'),
      _blGh(env, 'commits/main/check-runs'),
      _blGh(env, 'pulls?state=open'),
    ])).map((r) => (r.status === 'fulfilled' ? r.value : null));
    vantar = [['CI', ci], ['CTO', cto], ['Bygging', checks], ['PR', prs]].filter(([, v]) => v === null).map(([n]) => n);
    if (vantar.length === 4) throw new Error('allar uppsprettur');

    if (ci) {
      const sidasta = ((ci && ci.workflow_runs) || [])[0];
      if (sidasta && sidasta.conclusion === 'failure') {
        bilanir.push({ uppspretta: 'CI', lysing: 'main er rautt — síðasta keyrsla féll', sidan: _blSek(sidasta.created_at), alvarleiki: 'hatt', slod: sidasta.html_url });
      }
    }
    if (checks) {
      for (const c of ((checks && checks.check_runs) || [])) {
        if (c.conclusion !== 'failure') continue;
        bilanir.push({ uppspretta: 'Bygging', lysing: c.name + ' fellur á main', sidan: _blSek(c.completed_at), alvarleiki: 'midlungs', slod: c.details_url });
      }
    }
    if (cto) {
      const ctoFell = ((cto && cto.workflow_runs) || []).filter((r) => r.conclusion === 'failure')[0];
      if (ctoFell) {
        bilanir.push({ uppspretta: 'CTO', lysing: 'síðasta CTO-keyrsla féll', sidan: _blSek(ctoFell.created_at), alvarleiki: 'lagt', slod: ctoFell.html_url });
      }
    }
    if (prs) {
      const markPr = _blNow() - _BL_PR_DAGAR * 86400;
      for (const p of (Array.isArray(prs) ? prs : [])) {
        const stofnad = _blSek(p.created_at);
        if (stofnad > markPr) continue;
        bilanir.push({ uppspretta: 'PR', lysing: 'PR #' + p.number + ' hefur staðið opinn: ' + (p.title || ''), sidan: stofnad, alvarleiki: 'midlungs', slod: p.html_url });
      }
    }
  } catch (e) {
    // Síðasti þekkti listi stendur; spjaldið segir frá því að hann sé ekki ferskur.
    return Object.assign({ ok: true, villa: 'github', sott: geymt ? geymt.uppfaert : 0 }, (geymt && geymt.gogn) || { bilanir: [] });
  }

  const snyrt = _blSnyrta(bilanir);
  const gogn = { bilanir: snyrt };
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('bilanir', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
    .bind(JSON.stringify(gogn), _blNow()).run().catch(() => {});
  const skil = { ok: true, sott: _blNow(), bilanir: snyrt };
  if (vantar.length) { skil.villa = 'hluti'; skil.vantar = vantar; }
  return skil;
}

/** /api/admin/bilanir — GET listinn · POST {verk} ræsir Hrafn á frjálsu verkefni.
 *  Auth: GET má með X-Admin-Key; POST KREFST lotu — það ræsir kóðabreytingu í framleiðslu. */
export async function adminBilanirHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _blAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });
  if (request.method === 'GET') {
    const thvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    return _ajson(await saekjaBilanir(env, { thvinga }));
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  if (!uid) return _ajson({ ok: false, error: 'lota' });   // X-Admin-Key má lesa en ekki ræsa kóðabreytingu
  const verk = String(b.verk || '').trim().slice(0, 2000);
  if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
  const d = await _ghDispatch(env, 'cto', { verk });
  return _ajson({ ok: d.ok, dispatch: d });
}
