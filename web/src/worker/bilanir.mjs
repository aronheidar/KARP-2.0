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
const _BL_VAKT_DAGAR = 3;         // föllnum gagnakeyrslum eldri en þetta er sleppt (hávaði, ekki frétt)
// ⚠ ci.yml og cto.yml eru sótt SÉR hér að neðan — annars tvítilkynntust þau.
const _BL_EIGIN = ['ci.yml', 'cto.yml'];

/**
 * Föllnu GAGNAKEYRSLURNAR — allt annað en ci/cto. Eitt stak per vinnuflæði (nýjasta fallið).
 *
 * ⚠⚠ AF HVERJU ÞETTA VAR BÆTT VIÐ (17.9.2026). Hrafn vaktaði AÐEINS ci.yml og cto.yml. Næturkráðið
 * á tengslagrunninum skrifaði núll heila nótt af því RSK-áskriftin fór að skila 403, og þótt keyrslan
 * hefði orðið rauð hefði hún hvergi sést — enginn horfir á GitHub. Það er nákvæmlega ástæðan fyrir
 * því að numbeo-skrapið gat legið dautt í ÞRJÁR VIKUR (sjá build_heilsa.mjs). Vakt sem enginn les er
 * engin vakt.
 */
export function fallnarVaktir(runs, nu) {
  const mark = (Number.isFinite(nu) ? nu : Math.floor(Date.now() / 1000)) - _BL_VAKT_DAGAR * 86400;
  const sed = new Set();
  const ut = [];
  for (const r of (Array.isArray(runs) ? runs : [])) {
    if (!r || r.conclusion !== 'failure') continue;
    const skra = String(r.path || '').split('/').pop();
    if (!skra || _BL_EIGIN.includes(skra)) continue;   // ci/cto eiga sín eigin stök
    if (sed.has(skra)) continue;                       // aðeins nýjasta fallið per vinnuflæði
    const sidan = _blSek(r.created_at);
    if (sidan < mark) continue;                        // gamalt fall er ekki frétt
    sed.add(skra);
    ut.push({ uppspretta: 'Vakt', lysing: (r.name || skra) + ' féll', sidan, alvarleiki: 'hatt', slod: r.html_url });
  }
  return ut;
}

const _BL_STRAUMUR_KLST = 24;       // straumur sem hefur ekkert skilað svona lengi fer á spjald Hrafns
const _BL_STRAUMUR_HATT_DAGAR = 7;  // … og í forstofuna eftir viku
const _BL_INNLESTUR_KLST = 12;      // cron keyrir á 3 klst fresti: eldri skrá = fjórar keyrslur skráðu ekkert
// Færslur sem koma EKKI frá GitHub (D1 og ferskleikaskráin): reiknaðar ferskar í hvert sinn.
const _BL_D1_UPPSPRETTUR = ['Straumur', 'Innlestur', 'Gögn'];
const _BL_FERSKLEIKI_FROSIN_DAGAR = 3;   // refresh-data keyrir daglega: eldri skrá = vörnin hefur ekki keyrt

/**
 * Gagnasöfn sem hafa staðnað: nýjasta tímabil eldra en eðlilegt er m.v. útgáfutakt heimildarinnar.
 * Skráin kemur úr skriptur/build_heilsa.mjs (web/public/gogn/heilsa.json, lykillinn timabil).
 *
 * ⚠⚠ AF HVERJU (22.9.2026): fimm gagnasöfn stóðu í allt að þrjá mánuði meðan dagleg keyrsla var
 * græn. Atvinnuleysið á forsíðunni stóð í maí af því að skriptan las skrá sem enginn endurnýjaði.
 * Útgangskóðinn mældi ekkert af því; aldur nýjasta tímabils gerir það.
 * ⚠ Frosin skrá er verri en engin (sama regla og thagnadirStraumar): hafi vörnin ekki keyrt í
 *   þrjá daga kemur EIN færsla um það og engin um einstök söfn.
 */
export function stadnadGogn(skra, nuIso) {
  if (!skra || !Array.isArray(skra.gogn)) return [];
  const nu = Date.parse(nuIso || new Date().toISOString().slice(0, 10));
  const upp = Date.parse(skra.updated);
  if (Number.isFinite(upp) && nu - upp > _BL_FERSKLEIKI_FROSIN_DAGAR * 864e5) {
    return [{ uppspretta: 'Gögn', lysing: 'Ferskleikavörnin hefur ekki keyrt síðan ' + skra.updated, sidan: upp / 1000, alvarleiki: 'midlungs', slod: '' }];
  }
  const ut = [];
  for (const g of skra.gogn) {
    if (!g || g.stada === 'ok') continue;
    if (g.stada === 'olesanlegt') {
      ut.push({ uppspretta: 'Gögn', lysing: g.nafn + ': nýjasta tímabil ólesanlegt, skráin vantar eða sniðið breyttist', sidan: Number.isFinite(upp) ? upp / 1000 : 0, alvarleiki: 'midlungs', slod: '' });
      continue;
    }
    ut.push({
      uppspretta: 'Gögn',
      lysing: g.nafn + ': nýjasta tímabil ' + g.timabil + ' er ' + g.aldur + ' daga gamalt (eðlilegt hámark ' + g.hamark + ', ' + g.takt + ')',
      sidan: Date.parse(g.lok) / 1000 + g.hamark * 86400,
      alvarleiki: g.aldur > 2 * g.hamark ? 'hatt' : 'midlungs',
      slod: '',
    });
  }
  return ut;
}
const _BL_STRAUMUR_ASTAEDA = {
  http: (s) => 'HTTP ' + s.status + (s.hindrun ? ', Cloudflare-lokun hjá miðlinum' : ''),
  net: () => 'tenging brást',
  timamork: () => 'svarar ekki',
  snid: () => 'engin frétt þáttaðist, sniðið hefur breyst',
  urelt: () => 'aðeins gamlar fréttir',
};

/**
 * Fréttastraumar sem hafa þagnað. Skráin er skrifuð í hverjum innlestri (cron.mjs, newsIngest).
 *
 * ⚠⚠ AF HVERJU (21.9.2026). VB-straumurinn skilaði engu í 18 daga og Fiskifréttir aldrei neinu, og
 * hvorugt sást, því bilunin varð inni í workernum þar sem GitHub-uppspretturnar hér að ofan ná ekki
 * til. Miðlungs eftir sólarhring (spjald Hrafns), hátt eftir viku (forstofan).
 * ⚠ Dagafjöldinn er MÆLDUR frá því skráning hófst, ekki frá raunverulegu upphafi bilunar.
 * ⚠ Frosin skrá er verri en engin: allt-í-lagi mynd þegði að eilífu, og bilaður straumur héldi áfram
 *   að telja daga eftir að hann lagaðist. Hætti innlesturinn að skrá kemur því EIN færsla um það og
 *   engin um einstaka strauma.
 */
export function thagnadirStraumar(skra, nu) {
  const n = Number.isFinite(nu) ? nu : Math.floor(Date.now() / 1000);
  if (!skra || typeof skra !== 'object') return [];
  const ts = Number(skra.ts) || 0;
  if (ts && ts <= n - _BL_INNLESTUR_KLST * 3600) {
    return [{ uppspretta: 'Innlestur', lysing: 'Fréttainnlesturinn hefur ekkert skráð síðan ' + _blDags(ts), sidan: ts, alvarleiki: 'hatt', slod: '' }];
  }
  const ut = [];
  const inn = Number(skra.innsetningBilunFra) || 0;
  if (inn && inn <= n - _BL_STRAUMUR_KLST * 3600) {
    ut.push({
      uppspretta: 'Innlestur',
      lysing: 'Fréttir berast en innsetning í grunninn hefur brugðist í ' + _blDagar(n - inn) + (skra.batchMelding ? ' (' + String(skra.batchMelding).slice(0, 80) + ')' : ''),
      sidan: inn,
      alvarleiki: _blAlvarleiki(inn, n),
      slod: '',
    });
  }
  const straumar = (skra.straumar && typeof skra.straumar === 'object') ? skra.straumar : {};
  // Miðill með fleiri en einn straum (mbl.is ber þrjá) fær slóðina með, annars birtust eins raðir.
  const fjoldi = {};
  for (const s of Object.values(straumar)) if (s && s.src) fjoldi[s.src] = (fjoldi[s.src] || 0) + 1;
  for (const url of Object.keys(straumar)) {
    const s = straumar[url] || {};
    const fra = Number(s.bilunFra) || 0;
    if (!fra || fra > n - _BL_STRAUMUR_KLST * 3600) continue;
    const astaeda = _BL_STRAUMUR_ASTAEDA[s.villa] ? _BL_STRAUMUR_ASTAEDA[s.villa](s) : (s.villa || 'óþekkt');
    const nafn = (s.src || url) + (s.src && fjoldi[s.src] > 1 ? ' (' + _blSlodarhluti(url) + ')' : '');
    ut.push({
      uppspretta: 'Straumur',
      lysing: nafn + ' hefur ekkert skilað í ' + _blDagar(n - fra) + ' (' + astaeda + ')',
      sidan: fra,
      alvarleiki: _blAlvarleiki(fra, n),
      slod: url,
    });
  }
  return ut;
}

const _blDagar = (sek) => { const d = Math.max(1, Math.floor(sek / 86400)); return d + ' ' + (d === 1 ? 'dag' : 'daga'); };
const _blAlvarleiki = (fra, n) => (fra <= n - _BL_STRAUMUR_HATT_DAGAR * 86400 ? 'hatt' : 'midlungs');
const _blSlodarhluti = (url) => { try { return new URL(url).pathname; } catch (e) { return String(url); } };
// Ísland er á UTC allt árið, svo UTC-klukkan er staðartími.
function _blDags(ts) {
  const d = new Date(ts * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/** Straumafærslurnar úr D1. Reiknaðar UTAN GitHub-blokkarinnar: útrunninn GitHub-lykill má ekki fela þær. */
async function _blStraumar(env) {
  const r = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='frettastraumar'").first().catch(() => null);
  try { return thagnadirStraumar(r ? JSON.parse(r.v) : null, _blNow()); } catch (e) { return []; }   // skemmd skrá fellir ekki listann
}

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
/**
 * Tímabilsmælingin úr gagnaheilsunni (web/public/gogn/heilsa.json → `timabil`, skriptur/build_heilsa.mjs).
 * Vanti ASSETS eða skrána → engar færslur (aldrei villa).
 */
async function _blFerskleiki(env) {
  if (!env.ASSETS) return [];
  try {
    const r = await env.ASSETS.fetch(new Request('https://karp.internal/gogn/heilsa.json'));
    if (!r.ok) return [];
    const h = await r.json();
    return stadnadGogn({ updated: String(h.builtAt || '').slice(0, 10), gogn: h.timabil }, new Date(_blNow() * 1000).toISOString().slice(0, 10));
  } catch (e) { return []; }
}

export async function saekjaBilanir(env, { thvinga = false } = {}) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  const geymt = await _blGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _blNow() - _BL_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);

  // Utan GitHub-blokkarinnar: útrunninn GitHub-lykill má ekki fela þessar færslur.
  const straumar = (await _blStraumar(env)).concat(await _blFerskleiki(env));
  const bilanir = [];
  let vantar = [];
  try {
    const [ci, cto, checks, prs, vaktir] = (await Promise.allSettled([
      _blGh(env, 'actions/workflows/ci.yml/runs?branch=main&per_page=5'),
      _blGh(env, 'actions/workflows/cto.yml/runs?per_page=5'),
      _blGh(env, 'commits/main/check-runs'),
      _blGh(env, 'pulls?state=open'),
      _blGh(env, 'actions/runs?status=failure&per_page=20'),
    ])).map((r) => (r.status === 'fulfilled' ? r.value : null));
    vantar = [['CI', ci], ['CTO', cto], ['Bygging', checks], ['PR', prs], ['Vaktir', vaktir]].filter(([, v]) => v === null).map(([n2]) => n2);
    if (vantar.length === 5) throw new Error('allar uppsprettur');

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
    if (vaktir) {
      // Gagnakeyrslur (nætur-crawl, refresh-data, on-demand byggingar) sem féllu — sjá fallnarVaktir.
      for (const b of fallnarVaktir((vaktir && vaktir.workflow_runs) || [], _blNow())) bilanir.push(b);
    }
    for (const b of straumar) bilanir.push(b);   // þagnaðir fréttastraumar — sjá thagnadirStraumar
    if (prs) {
      const markPr = _blNow() - _BL_PR_DAGAR * 86400;
      for (const p of (Array.isArray(prs) ? prs : [])) {
        const stofnad = _blSek(p.created_at);
        if (stofnad > markPr) continue;
        bilanir.push({ uppspretta: 'PR', lysing: 'PR #' + p.number + ' hefur staðið opinn: ' + (p.title || ''), sidan: stofnad, alvarleiki: 'midlungs', slod: p.html_url });
      }
    }
  } catch (e) {
    // Síðasti þekkti listi stendur; spjaldið segir frá því að hann sé ekki ferskur. D1-færslurnar eru
    // hins vegar ferskar, svo gömlu eintökin þeirra víkja fyrir nýjum í stað þess að tvítelja.
    const gamalt = (geymt && geymt.gogn && Array.isArray(geymt.gogn.bilanir) ? geymt.gogn.bilanir : [])
      .filter((b) => !_BL_D1_UPPSPRETTUR.includes(b && b.uppspretta));
    return { ok: true, villa: 'github', sott: geymt ? geymt.uppfaert : 0, bilanir: _blSnyrta(gamalt.concat(straumar)) };
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
