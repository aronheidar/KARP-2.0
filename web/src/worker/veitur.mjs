// veitur.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

import { _freeAll, _prefGet, accountOwner, readSession, userPayload } from './auth.mjs';
import { _ajson, _emailTpl, htmlEsc, sendGmail, sjson } from './felag.mjs';
import { accountId } from '../lib/account.mjs';
import { herfindahl, sectorForIsat, sectorsFromMap, toppNShare } from '../lib/atvinnugrein.mjs';
import { renderEmail } from '../lib/emails.mjs';
import { GREINAR, greinaSql } from '../lib/greinar.mjs';
import { canon as kycCanon, deriveRisk as kycDeriveRisk, hash as kycHash, signalEvents as kycSignalEvents } from '../lib/kyc.mjs';
import { vikuForgangur as kycVikuForgangur } from '../lib/kyc-digest.mjs';
import { feedFor, matchNews, matchRaeda } from '../lib/lobbyvakt.mjs';
import { traceUbo as kycTraceUbo } from '../lib/ubo-core.mjs';
import { byggjaVisitolu, flokkaNofn, sancNorm, skimunarNidurstada } from '../lib/refsilistar.mjs';
import { augGet } from './felag.mjs';
import { karpUserId } from './auth.mjs';

export const RSK_ROT = 'https://www.skatturinn.is';

export async function vanskilHandler(request, ctx) {
  const kt = ((new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, ''));
  if (kt.length !== 10) return sjson({ error: 'kt' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/vanskil?kt=' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  const H = { 'User-Agent': 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)' };
  const nu = new Date().getUTCFullYear();
  const hits = [], skodud = [];
  try {
    for (const ar of [nu - 2, nu - 1]) {
      skodud.push(ar);
      const up = await fetch(RSK_ROT + '/fyrirtaekjaskra/arsreikningaskra/felog-i-vanskilum/ar/' + ar + '?kennitala=' + kt, { headers: H });
      if (!up.ok) continue;
      const html = await up.text();
      const m = html.match(new RegExp('leit/kennitala/' + kt + '"[^>]*>' + kt + '</a></td>\\s*<td>([^<]*)</td>\\s*<td>([^<]*)</td>'));
      if (m) hits.push({ ar, nafn: m[1].trim(), vanskil: m[2].trim() });
    }
  } catch (e) { return sjson({ error: 'upstream' }); }
  res = new Response(JSON.stringify({ kt, ar: hits, skodud }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

let SANCTIONS_IDX = null;

async function sanctionsIndex(env) {
  if (SANCTIONS_IDX) return SANCTIONS_IDX;
  const j = await augGet(env, 'sanctions.json');
  if (!j || !j.names) return { sterk: new Map(), veik: new Map(), updated: null };   // ekki memo-a bilun → reynir aftur síðar
  const { sterk, veik } = byggjaVisitolu(j.names);
  SANCTIONS_IDX = { sterk, veik, updated: j.updated || null };
  return SANCTIONS_IDX;
}

export async function sanctionsHandler(request, env, ctx) {
  const names = (new URL(request.url).searchParams.get('names') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const { sterk, veik, updated } = await sanctionsIndex(env);
  // flokkaNofn (refsilistar.mjs) — ein prófuð leið fyrir sterk/veik skiptingu, sjá kommenta þar.
  // ALDREI sameina: hits keyrir critical-atburð, 'Há'-áhættu, póst og lánshæfis-þak.
  const { sterkar, veikar } = flokkaNofn({ sterk, veik }, names, { dedup: true });
  return sjson({ hits: sterkar, veikar, updated, n: sterk.size, nVeik: veik.size });
}

let KYC_PEP_IDX = null;

async function kycPepIndex(env) {
  if (KYC_PEP_IDX) return KYC_PEP_IDX;
  const idx = new Map();
  const arr = await augGet(env, 'pep.json').catch(() => null);
  for (const p of (Array.isArray(arr) ? arr : (arr?.pep || arr?.results || []))) {
    const nafn = p.nafn || p.name || p.fulltNafn; if (!nafn) continue;
    idx.set(sancNorm(nafn), { nafn, tegund: p.tegund || p.embaetti || 'PEP' });
  }
  KYC_PEP_IDX = idx; return idx;
}

async function _kycNames(env, kt) {
  // Nöfn sem eru skimuð: félagið sjálft + virkir eigendur + virk stjórn (RCA v1 = beinir tengdir).
  // ⚠ D1-bilun má EKKI líta eins út og „engir eigendur": þá myndar diff-vélin removed_ubo fyrir hvern
  // einasta eiganda og status_change fyrir félagið — falskar háviðvaranir úr skammvinnri 7403/7429-villu.
  // Hver fyrirspurn ber því sitt ok-flagg. `felag === null` án villu er hins vegar gild niðurstaða.
  const ok = { felag: true, owners: true, board: true };
  const felag = await env.TENGSL.prepare('SELECT nafn,stada,gjaldthrot,afskrad,gjaldthol FROM felog WHERE kt=?').bind(kt).first().catch(() => { ok.felag = false; return null; });
  const owners = (await env.TENGSL.prepare(
    "SELECT e.eigandi_key AS key, e.hlutur AS hlutur, COALESCE(p.nafn,f.nafn,e.eigandi_key) AS nafn " +
    "FROM eign e LEFT JOIN folk p ON p.person_key=e.eigandi_key LEFT JOIN felog f ON f.kt=e.eigandi_key " +
    "WHERE e.felag_kt=? AND e.seen_last IS NULL").bind(kt).all().catch(() => { ok.owners = false; return { results: [] }; })).results || [];
  const board = (await env.TENGSL.prepare(
    "SELECT h.person_key AS key, h.hlutverk AS hlutverk, COALESCE(p.nafn,h.person_key) AS nafn " +
    "FROM hlutverk h LEFT JOIN folk p ON p.person_key=h.person_key " +
    "WHERE h.felag_kt=? AND h.seen_last IS NULL").bind(kt).all().catch(() => { ok.board = false; return { results: [] }; })).results || [];
  return { felag, owners, board, ok };
}

async function _kycUbo(env, kt) {
  const NODE_CAP = 200, DEPTH_CAP = 8;
  const ownersByKt = new Map();        // félags-kt -> [{ key, hlutur, isCompany, nafn }]
  const seen = new Set([kt]);
  const queue = [kt];
  while (queue.length && ownersByKt.size < NODE_CAP) {
    const cur = queue.shift();
    const rows = (await env.TENGSL.prepare(
      "SELECT e.eigandi_key AS key, e.hlutur AS hlutur, e.eigandi_tegund AS tegund, " +
      "COALESCE(p.nafn,f.nafn,e.eigandi_key) AS nafn, f.kt AS felkt " +
      "FROM eign e LEFT JOIN folk p ON p.person_key=e.eigandi_key LEFT JOIN felog f ON f.kt=e.eigandi_key " +
      "WHERE e.felag_kt=? AND e.seen_last IS NULL").bind(cur).all().catch(() => ({ results: [] }))).results || [];
    const owners = rows.map((r) => ({
      key: r.key, hlutur: r.hlutur, nafn: r.nafn,
      isCompany: (r.tegund === 'felag') || (r.felkt != null),   // eigandi_tegund EÐA félagaskrár-aðild
    }));
    ownersByKt.set(cur, owners);
    for (const o of owners) {
      if (o.isCompany && !seen.has(o.key) && seen.size < NODE_CAP) { seen.add(o.key); queue.push(o.key); }
    }
  }
  const graph = { getOwners: (k) => ownersByKt.get(k) || [] };
  const { beneficial, incompleteChain } = kycTraceUbo(graph, kt, { depthCap: DEPTH_CAP, nodeCap: NODE_CAP });
  return { beneficial, incompleteChain };
}

async function kycScreenKt(env, kt) {
  // `na` merkir heimildir sem SVÖRUÐU EKKI. Þær eru sleppt í diff-inu og lækka ekki áhættustigið —
  // tóm niðurstaða úr bilaðri heimild er ekki „hreint", hún er „ekki vitað".
  const na = {};
  const { felag, owners, board, ok } = await _kycNames(env, kt);
  if (!ok.owners) na.ubo = true;
  if (!ok.board) na.board = true;
  if (!ok.felag) na.status = true;
  const uboX = await _kycUbo(env, kt).catch(() => { na.ubo = true; return { beneficial: [], incompleteChain: false }; });
  const nameList = [felag?.nafn, ...owners.map((o) => o.nafn), ...board.map((b) => b.nafn)].filter(Boolean);
  // sanctions — tvö lög um refsilistar.mjs. hits = fjöl-orða samsvörun (critical-atburður,
  // 'Há'-áhætta, tafarlaus póstur). veikar = eins-orðs, óstaðfest — sér-svið sem kyc.mjs
  // les EKKI, því eins-orðs nafnasamsvörun á íslenskum félagsnöfnum er nær alltaf fölsk
  // (mæling 31.7.2026: 17 af 17 falskar). Ekki sameina þessi tvö.
  const { sterk: sSterk, veik: sVeik } = await sanctionsIndex(env);
  if (!sSterk || !sSterk.size) na.sanctions = true;   // tóm vísitala = ónothæf skimun, ekki „engar samsvaranir"
  const sanctions = skimunarNidurstada({ sterk: sSterk, veik: sVeik }, nameList);
  // pep
  const pIdx = await kycPepIndex(env);
  if (!pIdx || !pIdx.size) na.pep = true;
  const pMatches = [];
  for (const nm of nameList) { const m = pIdx.get(sancNorm(nm)); if (m) pMatches.push({ name: nm, tegund: m.tegund }); }
  // legal (Lögbirting) — bökuð, kt-lyklað
  const lb = await augGet(env, 'logbirting.json').catch(() => null);
  if (!lb) na.legal = true;
  const notices = [];
  const lbRows = Array.isArray(lb) ? lb : (lb?.faerslur || lb?.results || []);
  for (const r of lbRows) {
    if (String(r.kt || '').replace(/\D/g, '') !== kt) continue;
    const teg = /gjaldþrot|þrotabú|bankrupt/i.test(r.tegund || r.flokkur || '') ? 'bankruptcy'
      : /innköllun/i.test(r.tegund || '') ? 'innkollun'
        : /nauðung/i.test(r.tegund || '') ? 'nauthungarsala' : 'legal';
    notices.push({ ref: String(r.id || r.ref || (r.dags + '|' + (r.tegund || ''))), type: teg, dags: r.dags || r.date || '' });
  }
  // media (íhaldssamt: nákvæmt nafn-token match í sentiment.json titlum; info-only)
  const titles = [];
  const sent = await augGet(env, 'sentiment.json').catch(() => null);
  if (!sent) na.media = true;
  const felagNafn = (felag?.nafn || '').trim();
  if (felagNafn.length >= 4) {
    const rows = Array.isArray(sent) ? sent : (sent?.results || sent?.greinar || []);
    for (const a of rows) {
      const t = a.title || a.titill || ''; if (!t) continue;
      if ((a.sent ?? a.sentiment ?? 0) < 0 && t.includes(felagNafn)) titles.push({ h: kycHash(t), title: t.slice(0, 200) });
    }
  }
  // fatf — FATF-flokkað adverse media (10. merkið). CI-skriptið build_adverse_media.mjs flokkar
  // og skrifar í FROSNU töfluna kyc_adverse; hér er hún AÐEINS lesin (ekkert LLM í worker).
  // Lestrarbilun = na.fatf (heimild svaraði ekki), aldrei lesin sem „engar flokkanir".
  let fatfHits = [];
  try {
    const r = await env.TENGSL.prepare('SELECT url,title,source,dags,flokkur,stada,alvarleiki FROM kyc_adverse WHERE kt=? ORDER BY dags DESC LIMIT 200').bind(kt).all();
    fatfHits = (r.results || []).map((x) => ({ h: kycHash(String(x.url || '')), url: x.url, title: x.title, source: x.source, dags: x.dags, flokkur: x.flokkur, stada: x.stada, alvarleiki: x.alvarleiki }));
  } catch (e) { na.fatf = true; }
  // skil (ársreikningaskil) — endurnýtir vanskilHandler (opinn RSK-vanskilalisti, 24h caches.default).
  // kycScreenKt hefur engan ctx (ólíkt handler-um sem eru kallaðir beint úr fetch()) → stubbur sem
  // hendir waitUntil-cache-put-inu (skaðlaust: cache.put keyrir samt, bara óbeðið). .catch() ver
  // alla skimunina ef upstream-sæki mistekst — aldrei brotin heild vegna eins merkis.
  const skilD = await vanskilHandler(new Request('https://k.internal/api/vanskil?kt=' + kt), { waitUntil() {} })
    .then((r) => r.json()).catch(() => { na.skil = true; return { ar: [] }; });
  return { na, states: {
    ubo: { owners: owners.map((o) => ({ key: o.key, nafn: o.nafn, hlutur: o.hlutur })), beneficial: uboX.beneficial, incompleteChain: uboX.incompleteChain },
    board: { members: board.map((b) => ({ key: b.key, nafn: b.nafn, hlutverk: b.hlutverk })) },
    sanctions,
    pep: { matches: pMatches },
    status: { stada: felag?.stada || '', gjaldthrot: felag?.gjaldthrot || 0, afskrad: felag?.afskrad || 0, gjaldthol: felag?.gjaldthol || 0 },
    legal: { notices },
    skil: { years: (skilD.ar || []).map((x) => ({ ar: x.ar, vanskil: x.vanskil })) }, // ársreikningaskil-vanskil (opið, óleyfisskylt) — sjá vanskilHandler
    tax: { claims: [] }, // v1: engin áreiðanleg vanskilaskrá (bíður leyfis #36) — stubbur, engin atburðamyndun.
    media: { titles },
    fatf: { hits: fatfHits },
  } };
}

const KYC_SIGNALS = ['ubo', 'board', 'sanctions', 'pep', 'status', 'legal', 'skil', 'tax', 'media', 'fatf'];

export const _kycGate = (u, now) => !!(u && (_freeAll(u) || (u.tier === 'fyrirtaeki_plus' && u.tier_until > now)));

const _kycWatchCap = (u, now) => (_freeAll(u) ? -1 : (u.tier === 'fyrirtaeki_plus' && u.tier_until > now ? 100 : 0));

async function _kycSnapshotWrite(env, kt, states, ts, na) {
  const stmts = [];
  const p = env.TENGSL.prepare('INSERT INTO kyc_snapshot (kt,signal,state_hash,state_json,computed_at) VALUES (?,?,?,?,?) ON CONFLICT(kt,signal) DO NOTHING');
  // Heimild sem svaraði ekki fær ENGA grunnlínu — annars yrði tómið að viðmiðinu og fyrsta heppnaða
  // skimun á eftir kastaði hverri fyrirliggjandi samsvörun fram sem splunkunýrri.
  for (const sig of KYC_SIGNALS) { if (na && na[sig]) continue; const st = states[sig] || {}; const j = kycCanon(st); stmts.push(p.bind(kt, sig, kycHash(j), j, ts)); }
  for (let i = 0; i < stmts.length; i += 40) await env.TENGSL.batch(stmts.slice(i, i + 40)).catch(() => {});
}

export async function kycHandler(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/kyc/, '');
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const u = await env.TENGSL.prepare('SELECT id,email,is_admin,tier,tier_until,parent_account_id,free_access FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const owner = await accountOwner(env, u);   // meðlimur erfir þrep/þak eiganda (audit-actor helst u.email)
  if (!_kycGate(owner, now)) return _ajson({ ok: false, error: 'tier' });
  const acct = accountId(u);   // Task 5: deild KYC-gögn (kyc_watch/kyc_audit/kyc_ack) á account-eigandanum; actor helst u.email
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/watch') {
    if (request.method === 'GET') {
      const rows = (await env.TENGSL.prepare(
        "SELECT w.kt,w.nafn,w.risk,w.status,w.reviewed_at, (SELECT COUNT(*) FROM kyc_event e WHERE e.kt=w.kt AND NOT EXISTS (SELECT 1 FROM kyc_ack a WHERE a.owner_id=w.owner_id AND a.event_id=e.id AND a.status IN ('resolved','dismissed'))) AS opnar " +
        "FROM kyc_watch w WHERE w.owner_id=? AND w.status='active' ORDER BY w.added_at DESC").bind(acct).all().catch(() => ({ results: [] }))).results || [];
      return _ajson({ ok: true, cap: _kycWatchCap(owner, now), watch: rows });
    }
    if (request.method === 'POST') {
      const kt = String(body.kt || '').replace(/\D/g, '');
      if (kt.length !== 10) return _ajson({ ok: false, error: 'kt' });
      const cap = _kycWatchCap(owner, now);
      const cnt = (await env.TENGSL.prepare("SELECT COUNT(*) AS n FROM kyc_watch WHERE owner_id=? AND status='active'").bind(acct).first().catch(() => ({ n: 0 }))).n || 0;
      const exists = await env.TENGSL.prepare('SELECT id,status FROM kyc_watch WHERE owner_id=? AND kt=?').bind(acct, kt).first().catch(() => null);
      if (!exists && cap >= 0 && cnt >= cap) return _ajson({ ok: false, error: 'cap', cap });
      // Upphafs-CDD: skima strax, geyma grunnlínu-snapshot, skrá initial_cdd.
      const { states, na } = await kycScreenKt(env, kt);
      const risk = kycDeriveRisk(states, na);   // null = ófullnægjandi skimun → ekkert stig skráð
      const felagNafn = (await env.TENGSL.prepare('SELECT nafn FROM felog WHERE kt=?').bind(kt).first().catch(() => null))?.nafn || kt;
      await env.TENGSL.prepare('INSERT INTO kyc_watch (owner_id,kt,nafn,risk,status,added_at,reviewed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,kt) DO UPDATE SET status=\'active\', reviewed_at=excluded.reviewed_at')
        .bind(acct, kt, felagNafn, risk, 'active', now, now).run().catch(() => {});
      await _kycSnapshotWrite(env, kt, states, now, na);
      // Ófáanlegar heimildir eru SKRÁÐAR í úttektarslóðina — annars sæist ekki að CDD-in var ófullnægjandi.
      const findings = { sanctions: (states.sanctions.hits || []).length, pep: (states.pep.matches || []).length, gjaldthrot: states.status.gjaldthrot ? 1 : 0, risk, ofaanlegt: Object.keys(na) };
      await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)')
        .bind(acct, kt, now, u.email || String(uid), 'initial_cdd', 'Upphafleg áreiðanleikakönnun', JSON.stringify(findings)).run().catch(() => {});
      return _ajson({ ok: true, kt, nafn: felagNafn, risk });
    }
    if (request.method === 'DELETE') {
      const kt = String((url.searchParams.get('kt') || body.kt || '')).replace(/\D/g, '');
      await env.TENGSL.prepare("UPDATE kyc_watch SET status='archived' WHERE owner_id=? AND kt=?").bind(acct, kt).run().catch(() => {});
      await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)')
        .bind(acct, kt, now, u.email || String(uid), 'note', 'Viðskiptavinur færður í geymslu (archived)', '{}').run().catch(() => {});
      return _ajson({ ok: true });
    }
  }
  if (path === '/file') {
    const kt = String(url.searchParams.get('kt') || '').replace(/\D/g, '');
    const w = await env.TENGSL.prepare('SELECT kt,nafn,risk,risk_reason,status,added_at,reviewed_at FROM kyc_watch WHERE owner_id=? AND kt=?').bind(acct, kt).first().catch(() => null);
    if (!w) return _ajson({ ok: false, error: 'notfound' });
    const snaps = (await env.TENGSL.prepare('SELECT signal,state_json,computed_at FROM kyc_snapshot WHERE kt=?').bind(kt).all().catch(() => ({ results: [] }))).results || [];
    const states = {}; for (const s of snaps) { try { states[s.signal] = JSON.parse(s.state_json); } catch (e) {} }
    const audit = (await env.TENGSL.prepare('SELECT ts,actor,action,summary,detail_json FROM kyc_audit WHERE owner_id=? AND kt=? ORDER BY ts DESC LIMIT 200').bind(acct, kt).all().catch(() => ({ results: [] }))).results || [];
    const events = (await env.TENGSL.prepare(
      "SELECT e.id,e.signal,e.kind,e.severity,e.detail_json,e.detected_at, COALESCE(a.status,'open') AS ack " +
      "FROM kyc_event e LEFT JOIN kyc_ack a ON a.event_id=e.id AND a.owner_id=? " +
      "WHERE e.kt=? ORDER BY e.detected_at DESC LIMIT 100").bind(acct, kt).all().catch(() => ({ results: [] }))).results || [];
    // Nýjasta áhættumats-greinargerðin (drög) — samhengi+túlkun; HTML-ið er smíðað client-megin
    // úr SÖMU hreinu einingu (kyc-greinargerd.mjs) og CI notar → einn sannleikur um sniðmátið.
    const grein = await env.TENGSL.prepare('SELECT state_hash,samhengi_json,tulkun,generated_at FROM kyc_greinargerd WHERE kt=? ORDER BY generated_at DESC LIMIT 1').bind(kt).first().catch(() => null);
    return _ajson({ ok: true, watch: w, states, audit, events, grein: grein || null });
  }
  if (request.method === 'POST' && path === '/risk') {
    const kt = String(body.kt || '').replace(/\D/g, ''); const risk = String(body.risk || ''); const reason = String(body.reason || '').slice(0, 500);
    if (risk !== '' && !['Lág', 'Venjuleg', 'Há'].includes(risk)) return _ajson({ ok: false, error: 'risk' });   // '' = hreinsa mat
    const w = await env.TENGSL.prepare("SELECT 1 FROM kyc_watch WHERE owner_id=? AND kt=? AND status='active'").bind(acct, kt).first().catch(() => null);
    if (!w) return _ajson({ ok: false, error: 'notwatched' });
    await env.TENGSL.prepare('UPDATE kyc_watch SET risk=?, risk_reason=?, reviewed_at=? WHERE owner_id=? AND kt=?').bind(risk || null, reason, now, acct, kt).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(acct, kt, now, u.email || String(uid), 'risk_set', 'Áhætturating: ' + risk, JSON.stringify({ risk, reason })).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/ack') {
    const eid = parseInt(body.event_id, 10); const status = ['resolved', 'dismissed', 'open'].includes(body.status) ? body.status : 'resolved';
    const ev = await env.TENGSL.prepare("SELECT e.kt FROM kyc_event e JOIN kyc_watch w ON w.kt=e.kt AND w.owner_id=? AND w.status='active' WHERE e.id=?").bind(acct, eid).first().catch(() => null);
    if (!ev) return _ajson({ ok: false, error: 'event' });
    await env.TENGSL.prepare('INSERT INTO kyc_ack (owner_id,event_id,status,note,by,at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id,event_id) DO UPDATE SET status=excluded.status, note=excluded.note, by=excluded.by, at=excluded.at')
      .bind(acct, eid, status, String(body.note || '').slice(0, 500), u.email || String(uid), now).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(acct, ev.kt, now, u.email || String(uid), 'ack', 'Viðvörun ' + status, JSON.stringify({ event_id: eid, status })).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/note') {
    const kt = String(body.kt || '').replace(/\D/g, ''); const note = String(body.note || '').slice(0, 1000);
    if (!note) return _ajson({ ok: false, error: 'empty' });
    const w = await env.TENGSL.prepare("SELECT 1 FROM kyc_watch WHERE owner_id=? AND kt=? AND status='active'").bind(acct, kt).first().catch(() => null);
    if (!w) return _ajson({ ok: false, error: 'notwatched' });
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(acct, kt, now, u.email || String(uid), 'note', note, '{}').run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (request.method === 'POST' && path === '/rescreen') {
    const kt = String(body.kt || '').replace(/\D/g, '');
    const w = await env.TENGSL.prepare("SELECT 1 FROM kyc_watch WHERE owner_id=? AND kt=? AND status='active'").bind(acct, kt).first().catch(() => null);
    if (!w) return _ajson({ ok: false, error: 'notwatched' });
    const res = await _kycRunDiff(env, kt, null);
    await _kycAfterEvents(env, kt, res, true);
    await env.TENGSL.prepare('UPDATE kyc_watch SET reviewed_at=? WHERE owner_id=? AND kt=?').bind(now, acct, kt).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(acct, kt, now, u.email || String(uid), 'screening', 'Handvirk endurskimun', JSON.stringify({ risk: res.risk, changes: res.newEvents.length })).run().catch(() => {});
    return _ajson({ ok: true, risk: res.risk, changes: res.newEvents.length });
  }
  return _ajson({ ok: false, error: 'notfound' });
}

export async function _kycRunDiff(env, kt, onlySignals) {
  const now = Math.floor(Date.now() / 1000);
  const { states, na } = await kycScreenKt(env, kt);
  const prevRows = (await env.TENGSL.prepare('SELECT signal,state_json FROM kyc_snapshot WHERE kt=?').bind(kt).all().catch(() => ({ results: [] }))).results || [];
  const prev = {}; for (const r of prevRows) { try { prev[r.signal] = JSON.parse(r.state_json); } catch (e) {} }
  const sigs = onlySignals || KYC_SIGNALS;
  const evStmt = env.TENGSL.prepare('INSERT INTO kyc_event (kt,signal,kind,severity,detail_json,detected_at) VALUES (?,?,?,?,?,?)');
  const snapStmt = env.TENGSL.prepare('INSERT INTO kyc_snapshot (kt,signal,state_hash,state_json,computed_at) VALUES (?,?,?,?,?) ON CONFLICT(kt,signal) DO UPDATE SET state_hash=excluded.state_hash, state_json=excluded.state_json, computed_at=excluded.computed_at');
  const writes = []; const newEvents = [];
  const sleppt = [];
  for (const sig of sigs) {
    // Heimild sem svaraði ekki er SLEPPT — hvorki atburðir né snapshot-yfirskrift. Annars myndi tóma
    // svarið (a) mynda falskar „horfið/breyttist"-viðvaranir og (b) þurrka grunnlínuna, svo NÆSTA
    // heppnaða keyrsla endurtæki hverja fyrirliggjandi samsvörun sem splunkunýjan critical-atburð.
    if (na[sig]) { sleppt.push(sig); continue; }
    const cur = states[sig] || {};
    const evs = kycSignalEvents(sig, Object.prototype.hasOwnProperty.call(prev, sig) ? prev[sig] : null, cur);
    for (const e of evs) { writes.push(evStmt.bind(kt, sig, e.kind, e.severity, JSON.stringify(e.detail || {}), now)); newEvents.push(e); }
    const j = kycCanon(cur); writes.push(snapStmt.bind(kt, sig, kycHash(j), j, now));
  }
  for (let i = 0; i < writes.length; i += 40) await env.TENGSL.batch(writes.slice(i, i + 40)).catch(() => {});
  return { newEvents, risk: kycDeriveRisk(states, na), sleppt };
}

async function _kycOwnersOf(env, kt) {
  return ((await env.TENGSL.prepare("SELECT DISTINCT owner_id FROM kyc_watch WHERE kt=? AND status='active'").bind(kt).all().catch(() => ({ results: [] }))).results || []).map((r) => r.owner_id);
}

export async function _kycAfterEvents(env, kt, res, critical) {
  if (!res.newEvents.length) return;
  const now = Math.floor(Date.now() / 1000);
  const owners = await _kycOwnersOf(env, kt);
  for (const oid of owners) {
    const stmts = [];
    for (const e of res.newEvents) {
      stmts.push(env.TENGSL.prepare('INSERT INTO kyc_audit (owner_id,kt,ts,actor,action,summary,detail_json) VALUES (?,?,?,?,?,?,?)').bind(oid, kt, now, 'system', 'change_detected', e.kind, JSON.stringify(e.detail || {})));
    }
    for (let i = 0; i < stmts.length; i += 40) await env.TENGSL.batch(stmts.slice(i, i + 40)).catch(() => {});
    // opnar viðvaranir eru sóttar úr kyc_event↔kyc_ack (default 'open'); kritísk merki senda strax póst.
      const crit = res.newEvents.filter((e) => e.severity === 'critical');
      if (crit.length) { const em = (await env.TENGSL.prepare('SELECT email FROM users WHERE id=?').bind(oid).first().catch(() => null))?.email; if (em) await kycSendAlert(env, em, kt, crit).catch(() => {}); }
  }
}

async function kycSendAlert(env, email, kt, crit) {
  const lines = crit.map((e) => '• ' + e.kind + (e.detail?.name ? ' — ' + e.detail.name : '')).join('\n');
  const tpl = await _emailTpl(env, 'kyc_alert');
  const subject = renderEmail(tpl.subject, { kt });
  const text = renderEmail(tpl.intro, { kt }) + '\n\n' + lines + '\n\n' + renderEmail(tpl.footer, { kt });
  await sendGmail(env, { to: email, subject, text }); // sendGmail (worker.js:3247) er secret-gated: skilar {unconfigured:true} án Gmail-secrets, brotnar ekki.
}

// 🗂️ COMPLIANCE-MORGUNFUNDURINN — mánudags-cron: viku-forgangsröðun vaktaðra félaga per eiganda.
// VILJANDI EKKERT LLM (rýni 2026-08-01): röðun og aðgerðatillögur eru deterministic úr
// lib/kyc-digest.mjs — ekkert hallucination-rými, enginn API-kostnaður, alltaf rekjanlegt.
// „N án breytinga"-línan er ekki uppfylling: hún er skjalfesting samfelldrar vöktunar (FME).
export async function kycVikuDigest(env) {
  if (!env.TENGSL) return { sent: 0 };
  const now = Math.floor(Date.now() / 1000);
  const owners = ((await env.TENGSL.prepare("SELECT DISTINCT owner_id FROM kyc_watch WHERE status='active'").all().catch(() => ({ results: [] }))).results || []).map((r) => r.owner_id);
  let sent = 0;
  for (const oid of owners) {
    const watches = ((await env.TENGSL.prepare("SELECT kt,nafn FROM kyc_watch WHERE owner_id=? AND status='active'").bind(oid).all().catch(() => ({ results: [] }))).results || []);
    if (!watches.length) continue;
    const marks = watches.map(() => '?').join(',');
    const events = ((await env.TENGSL.prepare(
      "SELECT e.kt,e.kind,e.severity,e.detail_json,e.detected_at, COALESCE(a.status,'open') AS ack " +
      'FROM kyc_event e LEFT JOIN kyc_ack a ON a.event_id=e.id AND a.owner_id=? ' +
      'WHERE e.kt IN (' + marks + ') AND e.detected_at >= ?')
      .bind(oid, ...watches.map((w) => w.kt), now - 7 * 86400).all().catch(() => ({ results: [] }))).results || []);
    const vf = kycVikuForgangur(watches, events);
    if (!vf.radad.length && !vf.obreytt) continue;
    const em = (await env.TENGSL.prepare('SELECT email FROM users WHERE id=?').bind(oid).first().catch(() => null))?.email;
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) continue;
    const SEV = { critical: '🔴', high: '🟠', info: '🔵' };
    const blokkir = vf.radad.map((f, i) =>
      `<div style="margin:0 0 14px;padding:10px 12px;border-left:3px solid ${f.severity === 'critical' ? '#d33' : f.severity === 'high' ? '#e90' : '#69c'};background:#f7f8fa">` +
      `<b>${i + 1}. ${htmlEsc(f.nafn)}</b> <span style="color:#777">(${htmlEsc(f.kt)})</span><br>` +
      f.atburdir.map((a) => `${SEV[a.severity] || '·'} ${htmlEsc(a.lina)}<br><span style="color:#555;font-size:13px">→ ${htmlEsc(a.adgerd)}</span>`).join('<br>') +
      (f.fleiri ? `<br><span style="color:#777;font-size:13px">… og ${f.fleiri} atburðir til viðbótar í möppunni</span>` : '') +
      '</div>').join('');
    const tpl = await _emailTpl(env, 'kyc_digest');
    const vars = { fjoldi: String(vf.radad.length), obreytt: String(vf.obreytt) };
    const html = '<p>' + htmlEsc(renderEmail(tpl.intro, vars)) + '</p>' + blokkir +
      `<p style="color:#555">✅ ${vf.obreytt} af ${vf.n} vöktuðum félögum: engar breytingar í vikunni.</p>` +
      '<p style="color:#777;font-size:13px">' + htmlEsc(renderEmail(tpl.footer, vars)) + '</p>';
    const r = await sendGmail(env, { to: em, subject: renderEmail(tpl.subject, vars), html }).catch(() => null);
    if (r && r.ok) sent++;
  }
  return { sent, owners: owners.length };
}

export async function leiHandler(request, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, lei: null });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/lei?kt=' + kt);
  const hit = await cache.match(cacheKey); if (hit) return hit;
  let out = { kt, lei: null };
  try {
    const r = await fetch('https://api.gleif.org/api/v1/lei-records?filter[entity.registeredAs]=' + kt, { headers: { 'Accept': 'application/vnd.api+json', 'User-Agent': 'KARP (karp.is)' } });
    if (r.ok) {
      const d = ((await r.json()).data || [])[0];
      if (d) {
        const a = d.attributes || {}, rel = d.relationships || {};
        out = {
          kt, lei: a.lei || null, nafn: (a.entity && a.entity.legalName && a.entity.legalName.name) || null,
          status: (a.entity && a.entity.status) || null,
          regStatus: (a.registration && a.registration.status) || null,
          nextRenewal: (a.registration && a.registration.nextRenewalDate) ? a.registration.nextRenewalDate.slice(0, 10) : null,
          hasParent: !!(rel['ultimate-parent'] && rel['ultimate-parent'].links && rel['ultimate-parent'].links['relationship-record']),
        };
      }
    }
  } catch (e) {}
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export async function leyfiHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, holdur: false, leyfi: [] });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/leyfi?kt=' + kt);
  const hit = await cache.match(cacheKey); if (hit) return hit;
  const [rek, ferda, apo] = await Promise.all([augGet(env, 'rekstrarleyfi.json'), augGet(env, 'ferdaleyfi.json'), augGet(env, 'apotek.json')]);
  const list = [];
  for (const x of ((rek && rek.byKt && rek.byKt[kt]) || [])) list.push({ teg: x.teg, undir: x.undir, flokkur: x.flokkur, stadur: x.stadur, afengi: x.afengi, hop: 'Sýslumenn' });
  for (const x of ((ferda && ferda.byKt && ferda.byKt[kt]) || [])) list.push({ teg: x.teg, undir: null, flokkur: null, stadur: x.stadur, afengi: false, hop: 'Ferðamálastofa' });
  for (const x of ((apo && apo.byKt && apo.byKt[kt]) || [])) list.push({ teg: x.teg, undir: null, flokkur: null, stadur: x.stadur, afengi: false, hop: 'Lyfjastofnun' });
  const out = { kt, holdur: list.length > 0, n: list.length, afengi: list.some((x) => x.afengi), leyfi: list.slice(0, 16), heimild: 'Sýslumenn (island.is) + Ferðamálastofa + Lyfjastofnun' };
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=43200' } });
  if (rek || ferda || apo) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export const _lobbyGate = (u, now) => !!(u && (_freeAll(u) || (u.tier === 'fyrirtaeki_plus' && u.tier_until > now)));

export async function lobbyvaktHandler(request, env, ctx) {
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const u = await env.TENGSL.prepare('SELECT id,email,is_admin,free_access,tier,tier_until,parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const owner = await accountOwner(env, u);   // reglu-lag er account-based (meðlimur erfir þrep eiganda)
  const entitled = _lobbyGate(owner, now);
  // Sameinuð efnisvakt: lobbyvakt_ord + gömlu leitvakt.ord (union) → fréttir (frí) OG þingmál/samráð (Fyrirtæki+).
  const greinar = await _prefGet(env, uid, 'lobbyvakt_greinar', []);
  const lobbyOrd = await _prefGet(env, uid, 'lobbyvakt_ord', []);
  const lv = await _prefGet(env, uid, 'leitvakt', {});
  const gArr = Array.isArray(greinar) ? greinar : [];
  const oArr = [...new Set([...(Array.isArray(lobbyOrd) ? lobbyOrd : []), ...((lv && Array.isArray(lv.ord)) ? lv.ord : [])].map((w) => String(w == null ? '' : w).toLowerCase().trim()).filter(Boolean))];
  if (!gArr.length && !oArr.length) return _ajson({ ok: true, entitled, greinar: [], ord: [], frettir: [], reglur: [], needsSetup: true });
  // Fréttir (frí): leitarorð → nýlegar fréttir úr D1.
  const news = await newsSince(env, 30, 500).catch(() => []);
  const frettir = news.filter((n) => matchNews(n, oArr)).slice(0, 30).map((n) => ({ title: n.title, url: n.url, source: n.source, date: n.date }));
  // Hlaðvörp (frí, eins og fréttirnar): leitarorð → þættir (umritanir + lýsigögn).
  const hladvorp = await hladLeit(env, oArr, 21, 20).catch(() => []);
  // Ræður á Alþingi (frí): opinberar umritanir sl. daga (raedur_nylegar.json, build_raedur_nylegar.mjs) → leitarorð
  // í málsheiti/nafni ræðumanns/textabroti (matchRaeda). Tómt í þinghléi — það er gilt.
  let raedur = [];
  try {
    const rj = await augGet(env, 'raedur_nylegar.json');
    raedur = ((rj && rj.raedur) || []).filter((r) => matchRaeda(r, oArr)).slice(0, 30)
      .map((r) => ({ id: r.id, nafn: r.nafn, embaetti: r.embaetti, dags: r.dags, malsheiti: r.malsheiti, brot: r.brot, hlekkur: r.hlekkur, ord: oArr.filter((w) => `${r.malsheiti || ''} ${r.nafn || ''} ${r.brot || ''}`.toLowerCase().includes(w)) }));
  } catch (e) {}
  // Reglur (Fyrirtæki+): þingmál/samráð eftir greinum + orðum.
  let reglur = [], updated = null;
  if (entitled) {
    const data = await augGet(env, 'lobbyvakt.json').catch(() => null);
    reglur = feedFor((data && data.items) || [], { greinar: gArr, ord: oArr });
    updated = (data && data.updated) || null;
  }
  return _ajson({ ok: true, entitled, greinar: gArr, ord: oArr, frettir, hladvorp, raedur, reglur, updated, needsSetup: false });
}

export async function loftforHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, holdur: false, loftfor: [] });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/loftfor?kt=' + kt);
  const hit = await cache.match(cacheKey); if (hit) return hit;
  const data = await augGet(env, 'loftfor.json');
  const virk = (((data && data.byKt && data.byKt[kt]) || [])).filter((x) => !x.afskrad);
  const out = { kt, holdur: virk.length > 0, n: virk.length, loftfor: virk.slice(0, 20), heimild: 'Loftfaraskrá Samgöngustofu (island.is)' };
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=43200' } });
  if (data) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export function rskErFyrirtaeki(kt) { const dd = parseInt(String(kt).slice(0, 2), 10); return dd >= 41 && dd <= 71; }
// ⚠ APIð skilar PascalCase ("NationalId","Deregistration"…) þótt skjölin sýni camelCase → case-óháð lesning.
export function rg(o, name) {
  if (!o || typeof o !== 'object') return undefined;
  if (name in o) return o[name];
  const lo = name.toLowerCase();
  for (const k in o) if (k.toLowerCase() === lo) return o[k];
  return undefined;
}

function rskClean(kt, d, keepPersonKt) {
  const nafn = rg(d, 'name'), natid = rg(d, 'nationalId');
  if (!d || typeof d !== 'object' || !(nafn || natid)) return { kt, holdur: false };
  const der = rg(d, 'deregistration') || {};
  const aoa = rg(d, 'articlesOfAssociation') || {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const dstr = (v) => (v ? String(v).slice(0, 10) : null);
  // keepPersonKt: AÐEINS innri notkun (tengslanetHandler ber saman einstaklinga þvert á félög með kt
  // server-hlið) — út á við fer kt einstaklinga ALDREI (rskHandler kallar án flaggsins).
  const tengsl = arr(rg(d, 'relationships')).map((r) => {
    const rk = String(rg(r, 'nationalId') || '').replace(/\D/g, '');
    const isCo = rk.length === 10 && rskErFyrirtaeki(rk);
    return { nafn: rg(r, 'name') || null, kt: (isCo || (keepPersonKt && rk.length === 10)) ? rk : null, einst: !isCo && rk.length === 10, tegund: rg(r, 'type') || null, hlutverk: rg(r, 'position') || null, stada: rg(r, 'status') || null };
  }).slice(0, 40);
  return {
    kt, holdur: true,
    nafn: nafn || null,
    aukanafn: rg(d, 'additionalName') || null,
    tilgangur: rg(d, 'purposeOfEntity') || null,
    stada: rg(d, 'status') || null,
    skraning: dstr(rg(d, 'registered')),
    form: (rg(rg(d, 'legalForm'), 'name')) || null,
    afskraning: {
      afskrad: !!rg(der, 'deregistered'), dags: dstr(rg(der, 'deregistrationDate')),
      gjaldthrot: !!rg(der, 'bankrupcy'), gjaldthrotDags: dstr(rg(der, 'bankrupcyDate')),
      gjaldthol: !!rg(der, 'insolvency'), gjaldtholDags: dstr(rg(der, 'insolvencyDate')),
    },
    hlutafe: rg(aoa, 'shareCapital') || null, mynt: rg(aoa, 'shareCapitalCurrency') || null,
    undirskrift: rg(aoa, 'signatures') || null, atkvaedi: rg(aoa, 'votingRights') || null,
    isat: arr(rg(d, 'activityCode')).map((a) => ({ id: rg(a, 'id') || null, nafn: rg(a, 'name') || null })).slice(0, 6),
    vsk: arr(rg(d, 'vat')).map((v) => ({ nr: rg(v, 'vatNumber') || null, skrad: dstr(rg(v, 'registered')), afskrad: dstr(rg(v, 'deRegistered')) })).slice(0, 8),
    heiti: arr(rg(d, 'registeredNames')).map((n) => rg(n, 'name')).filter(Boolean).slice(0, 8),
    tengsl,
    heimild: 'Fyrirtækjaskrá (opinbert API, Skatturinn)',
  };
}

export async function rskHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  // (?debug=1 fjarlægt 30.7.2026 — hjáveitti jaðar-cache á mælt/hraðatakmarkað APIM-uppstreymi, ógáttað.)
  if (kt.length !== 10) return sjson({ kt, holdur: false });
  if (!env.RSK_KEY) return sjson({ kt, holdur: false, unconfigured: true });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/rsk?kt=' + kt);
  const hit = await cache.match(cacheKey); if (hit) return hit;
  let out = { kt, holdur: false };
  try {
    const r = await fetch('https://api.skattur.cloud/legalentities/v2.1/' + kt + '?language=is', {
      headers: { 'Ocp-Apim-Subscription-Key': env.RSK_KEY, 'Accept': 'application/json' },
    });
    const body = await r.text();
    if (r.ok) {
      let d = null; try { d = JSON.parse(body); } catch (e) {}
      if (d && typeof d === 'object') out = rskClean(kt, d);
    } else {
      out = { kt, holdur: false, status: r.status };
    }
  } catch (e) {}
  // ⚠ Neikvæð svör ALDREI cache-uð (annars festist tímabundin 404/villa á jaðri í 24h).
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': out.holdur ? 'public, max-age=86400' : 'no-store' } });
  if (out.holdur) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function rskFetchRaw(kt, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/rsk-raw?kt=' + kt);
  const hit = await cache.match(cacheKey);
  if (hit) { try { const j = await hit.json(); return j.holdur ? j : null; } catch (e) {} }
  try {
    const r = await fetch('https://api.skattur.cloud/legalentities/v2.1/' + kt + '?language=is', {
      headers: { 'Ocp-Apim-Subscription-Key': env.RSK_KEY, 'Accept': 'application/json' },
    });
    const out = r.ok ? rskClean(kt, await r.json(), true) : { kt, holdur: false };
    // jákvæð svör 24h; NEIKVÆÐ stutt (10 mín) svo endurtekin köll á sama kt hamri ekki mælda APIð
    const res = new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + (out.holdur ? 86400 : 600) } });
    ctx.waitUntil(cache.put(cacheKey, res));
    return out.holdur ? out : null;
  } catch (e) { return null; }
}

export async function rskProxyHandler(request, env) {
  if (!env.RSK_KEY || request.headers.get('X-Karp-Proxy') !== env.RSK_KEY) return new Response('forbidden', { status: 403 });
  const u = new URL(request.url);
  // ── API-hamur (?api=<kt>): Azure LegalEntities. Worker-egress er hreint; lykill bætt SERVER-HLIÐ.
  // ⚠ ENGIN `cf: {cacheTtl}` hér — Azure APIM 403-ar köll með þeim valkosti (sannreynt 17.7); rskHandler
  //    (án cf) skilar 200/404 eðlilega. Azure-svör eru no-store hvort eð er svo þetta er ferskt.
  const apiKt = (u.searchParams.get('api') || '').replace(/\D/g, '');
  if (apiKt.length === 10) {
    try {
      const r = await fetch('https://api.skattur.cloud/legalentities/v2.1/' + apiKt + '?language=is', {
        headers: { 'Ocp-Apim-Subscription-Key': env.RSK_KEY, 'Accept': 'application/json' },
      });
      const body = await r.text();
      return new Response(body, { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    } catch (e) { return new Response('{}', { status: 502 }); }
  }
  // ── Skrap-hamur (?p=/fyrirtaekjaskra/...): www.skatturinn.is HTML.
  const p = u.searchParams.get('p') || '';
  if (!/^\/fyrirtaekjaskra\//.test(p)) return new Response('bad path', { status: 400 });   // SSRF-vörn
  try {
    const r = await fetch('https://www.skatturinn.is' + p, {
      headers: { 'User-Agent': 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)' }, cf: { cacheTtl: 0 },
    });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) { return new Response('upstream error', { status: 502 }); }
}

export async function tengslStatsHandler(request, env) {
  if (!env.RSK_KEY || request.headers.get('X-Karp-Proxy') !== env.RSK_KEY) return new Response('forbidden', { status: 403 });
  if (!env.TENGSL) return sjson({ error: 'no-d1' });
  const one = (sql) => env.TENGSL.prepare(sql).first().then((r) => (r ? r.n : null)).catch(() => null);
  const many = (sql) => env.TENGSL.prepare(sql).all().then((r) => r.results).catch(() => []);
  const [felog, folk, hlutverk, eign, hlutverk_virk, queue, sweep] = await Promise.all([
    one('SELECT COUNT(*) n FROM felog'), one('SELECT COUNT(*) n FROM folk'),
    one('SELECT COUNT(*) n FROM hlutverk'), one('SELECT COUNT(*) n FROM eign'),
    one('SELECT COUNT(*) n FROM hlutverk WHERE seen_last IS NULL'),
    many('SELECT status, COUNT(*) n FROM crawl_queue GROUP BY status'),
    many('SELECT done, COUNT(*) n FROM sweep_state GROUP BY done'),
  ]);
  return sjson({ felog, folk, hlutverk, hlutverk_virk, eign, queue, sweep, ts: new Date().toISOString() });
}

const TOPP_RADAD = { sala: 'sala', hagnadur: 'hagnadur', eignir: 'eignir', efe: 'eigid_fe' };

export async function topplistarHandler(request, env, ctx) {
  const u = new URL(request.url);
  const grein = u.searchParams.get('grein') || 'island';
  const radadKey = u.searchParams.get('radad') || 'sala';
  const filter = greinaSql(grein);
  const col = Object.hasOwn(TOPP_RADAD, radadKey) ? TOPP_RADAD[radadKey] : null;
  if (filter === null || !col) return sjson({ error: 'bad-params' }, 400);
  if (!env.TENGSL) return sjson({ error: 'unconfigured' });
  // entitlement: admin EÐA virk Karp+-áskrift (sama og userPayload.tierActive)
  const uid = await karpUserId(request, env);
  let entitled = false;
  if (uid) {
    const urow = await env.TENGSL.prepare('SELECT tier, tier_until, is_admin, parent_account_id, free_access FROM users WHERE id=?').bind(uid).first().catch(() => null);
    const now = Math.floor(Date.now() / 1000);
    entitled = topplistaEntitled(await accountOwner(env, urow), now);   // meðlimur erfir þrep eiganda
  }
  const cacheKey = new Request('https://cache.karp.internal/api/topplistar?g=' + grein + '&r=' + radadKey + '&e=' + (entitled ? 1 : 0) + '&v=2');
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) { const h = new Response(hit.body, hit); h.headers.set('cache-control', 'private, max-age=300'); return h; }
  const whereFilter = filter ? (filter + ' AND ') : '';
  const rows = (await env.TENGSL.prepare(
    `SELECT f.kt, f.nafn, fj.sala, fj.hagnadur, fj.eignir, fj.eigid_fe, fj.ar
     FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt
     WHERE ${whereFilter}fj.sala IS NOT NULL
     ORDER BY fj.${col} DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }))).results;
  // coverage: greind (fjarhagur með veltu) af öllum í greininni
  const covWhere = filter ? ('WHERE ' + filter) : '';
  const alls = (await env.TENGSL.prepare(`SELECT COUNT(*) n FROM felog f ${covWhere}`).first().catch(() => ({ n: 0 }))).n;
  const greind = (await env.TENGSL.prepare(`SELECT COUNT(*) n FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt WHERE ${whereFilter}fj.sala IS NOT NULL`).first().catch(() => ({ n: 0 }))).n;
  const body = { grein, radad: radadKey, ...topplistaBody(rows, entitled, rows.length), coverage: { greind, alls } };
  const payload = JSON.stringify(body);
  const baseHdr = { 'content-type': 'application/json; charset=utf-8' };
  const cached = new Response(payload, { status: 200, headers: { ...baseHdr, 'cache-control': 'public, max-age=300' } });
  ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  return new Response(payload, { status: 200, headers: { ...baseHdr, 'cache-control': 'private, max-age=300' } });
}

const _atvinnuGate = (u, now) => !!(u && (_freeAll(u) || (u.tier === 'fyrirtaeki_plus' && u.tier_until > now)));

export async function atvinnugreinHandler(request, env, ctx) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const u = await env.TENGSL.prepare('SELECT id,email,is_admin,free_access,tier,tier_until,parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const owner = await accountOwner(env, u);   // meðlimur erfir þrep eiganda → gátt er account-based
  if (!_atvinnuGate(owner, now)) return _ajson({ ok: false, error: 'tier' });
  // grein úr bökuðum viðmiðum (slug validerað gegn sectorsFromMap — enginn frjáls-texti í SQL)
  const sk = await augGet(env, 'sector_kpi.json').catch(() => null);
  const sec = sk && sk.map ? sectorsFromMap(sk.map).find((s) => s.slug === slug) : null;
  if (!sec) return _ajson({ ok: false, error: 'notfound' });
  // cache: aðeins réttindahafar komast hingað → lykill ber e=1 (engin leki til ó-réttindahafa)
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/atvinnugrein?slug=' + encodeURIComponent(slug) + '&e=1');
  const hit = await cache.match(cacheKey);
  if (hit) { const h = new Response(hit.body, hit); h.headers.set('cache-control', 'private, max-age=300'); return h; }
  // D1-sía: mis-löng forskeyti per ÍSAT-kóða (substr 1..LEN); undanskilningar → AND NOT. Kóðar bundnir (?)
  // — aðeins heiltölu-lengdin (c.length) fer inn í SQL-strenginn, og hún kemur úr okkar eigin JSON.
  const binds = [];
  const isatClause = sec.isats.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
  let where = '(' + isatClause + ')';
  if (sec.excl && sec.excl.length) {
    const exClause = sec.excl.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
    where += ' AND NOT (' + exClause + ')';
  }
  const rows = (env.TENGSL ? (await env.TENGSL.prepare(
    `SELECT f.kt, f.nafn, fj.sala, fj.hagnadur, fj.eignir, fj.eigid_fe
     FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt
     WHERE ${where} AND fj.sala IS NOT NULL
     ORDER BY fj.sala DESC LIMIT 100`
  ).bind(...binds).all().catch(() => ({ results: [] }))).results : []) || [];
  const staerd_heild = rows.reduce((a, r) => a + (r.sala || 0), 0);
  const body = {
    ok: true, slug, label: sec.label, isats: sec.isats, vidmid: sec.kpi, heild: sk.heild,
    topFelog: rows.slice(0, 25),
    samthjoppun: { HHI: herfindahl(rows.map((r) => r.sala)), toppN_hlutdeild: toppNShare(rows, 5) },
    staerd_heild, n: rows.length, coverage: rows.length,
  };
  const payload = JSON.stringify(body);
  const baseHdr = { 'content-type': 'application/json; charset=utf-8' };
  const cached = new Response(payload, { status: 200, headers: { ...baseHdr, 'cache-control': 'public, max-age=300' } });
  ctx.waitUntil(cache.put(cacheKey, cached.clone()));
  return new Response(payload, { status: 200, headers: { ...baseHdr, 'cache-control': 'private, max-age=300' } });
}

export async function computeGreinRank(env, kt) {
  if (!env || !env.TENGSL || !kt) return { slug: null, label: null, rank: null, total: null, sala: null };
  const felag = await env.TENGSL.prepare('SELECT isat_primary FROM felog WHERE kt=?').bind(kt).first().catch(() => null);
  const sk = await augGet(env, 'sector_kpi.json').catch(() => null);
  const sec = (felag && felag.isat_primary && sk && sk.map) ? sectorForIsat(sectorsFromMap(sk.map), felag.isat_primary) : null;
  if (!sec) return { slug: null, label: null, rank: null, total: null, sala: null };
  // greinar-sía (eins og atvinnugreinHandler): mis-löng forskeyti + útilokun, kóðar bundnir (?), aðeins c.length í streng
  const binds = [];
  const isatClause = sec.isats.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
  let where = '(' + isatClause + ')';
  if (sec.excl && sec.excl.length) {
    const exClause = sec.excl.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
    where += ' AND NOT (' + exClause + ')';
  }
  const me = await env.TENGSL.prepare('SELECT sala FROM fjarhagur WHERE kt=? AND sala IS NOT NULL ORDER BY ar DESC LIMIT 1').bind(kt).first().catch(() => null);
  const sala = (me && me.sala != null) ? me.sala : null;
  const cnt = await env.TENGSL.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN fj.sala > ? THEN 1 ELSE 0 END) higher
     FROM felog f JOIN (SELECT kt, sala, MAX(ar) ar FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj ON fj.kt=f.kt
     WHERE ${where}`
  ).bind(sala == null ? -1 : sala, ...binds).first().catch(() => null);
  const total = (cnt && cnt.total != null) ? cnt.total : null;
  const rank = (sala != null && cnt && cnt.higher != null) ? cnt.higher + 1 : null;
  return { slug: sec.slug, label: sec.label, rank, total, sala };
}

export async function greinRankHandler(request, env, ctx) {
  const url = new URL(request.url);
  const kt = (url.searchParams.get('kt') || '').replace(/\D/g, '');
  if (!kt) return _ajson({ ok: false, error: 'kt' });
  if (!env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/grein-rank?kt=' + kt);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const r = await computeGreinRank(env, kt);
  const payload = JSON.stringify({ ok: true, kt, slug: r.slug, label: r.label, rank: r.rank, total: r.total, sala: r.sala });
  const resp = new Response(payload, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

export async function roadsSectorsHandler(request, env, ctx) {
  if (!env.TENGSL) return sjson({ error: 'unconfigured', greinar: [] });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/roads/atvinnuvegir?v=1');
  const hit = await cache.match(cacheKey); if (hit) return hit;
  // nýjasta ár per félag (SQLite: ber dálkur með MAX() skilar röð hámarks-árs), samandregið á ÍSAT-2
  const rows = (await env.TENGSL.prepare(
    `SELECT substr(f.isat_primary,1,2) isat2, COUNT(*) n, SUM(fj.sala) sala, SUM(fj.hagnadur) hagnadur, SUM(fj.eignir) eignir
     FROM felog f JOIN (SELECT kt, sala, hagnadur, eignir, MAX(ar) ar FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj ON fj.kt=f.kt
     WHERE f.isat_primary IS NOT NULL
     GROUP BY isat2`
  ).all().catch(() => ({ results: [] }))).results;
  const bySector = {}; let heild = 0;
  for (const r of rows) {
    const g = GREINAR.find((x) => x.isat && x.isat.includes(r.isat2));   // ÍSAT-2 → grein (greinarnar skarast ekki)
    if (!g) continue;
    const s = bySector[g.slug] || (bySector[g.slug] = { slug: g.slug, nafn: g.nafn, n: 0, sala: 0, hagnadur: 0, eignir: 0 });
    s.n += r.n; s.sala += r.sala || 0; s.hagnadur += r.hagnadur || 0; s.eignir += r.eignir || 0;
    heild += r.sala || 0;
  }
  const greinar = Object.values(bySector).map((s) => ({
    slug: s.slug, nafn: s.nafn, n: s.n, sala: Math.round(s.sala),
    hlutur: heild ? +(100 * s.sala / heild).toFixed(1) : 0,
    framlegd: s.sala ? +(100 * s.hagnadur / s.sala).toFixed(1) : null,
  })).sort((a, b) => b.sala - a.sala);
  const body = { greinar, heild_sala: Math.round(heild), n_felog: greinar.reduce((a, s) => a + s.n, 0),
    heimild: 'Ársreikningar (RSK) — nýjasta ár per félag, ISK. Vaxandi úrtak.' };
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=3600' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export async function tengslanetHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const kort = u.searchParams.get('kort') === '1';   // 🕸️ kort-hamur: strangari nafna-felun (sjá maskaKortSvar)
  if (kt.length !== 10 || !rskErFyrirtaeki(kt)) return sjson({ kt, holdur: false });   // aðeins lögaðila-kt í mælda APIð
  if (!env.RSK_KEY) return sjson({ kt, holdur: false, unconfigured: true });
  // Innskráðir eingöngu (hluti keyptu eigendaskýrslunnar; ver líka mælda APIð gegn opinni upptalningu).
  // ⚠ VERÐUR að standa Á UNDAN cache-treffinu — annars þjónaði jaðarinn óinnskráðum úr cache.
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ kt, holdur: false, error: 'login' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/tengslanet?kt=' + kt + (kort ? '&kort=1' : ''));
  const hit = await cache.match(cacheKey); if (hit) return hit;
  // félagamengi: rót + félög úr eignarhaldstrénu (ef byggt)
  let felog = [kt];
  try {
    const tr = await env.ASSETS.fetch(new Request('https://karp.internal/gogn/eigendur/' + kt + '.json'));
    if (tr.ok) {
      const t = await tr.json();
      for (const nd of ((t.net && t.net.nodes) || [])) {
        const k = String(nd.kt || '').replace(/\D/g, '');
        if (k.length === 10 && rskErFyrirtaeki(k) && felog.indexOf(k) < 0) felog.push(k);
      }
    }
  } catch (e) {}
  felog = felog.slice(0, 12);
  const raw = (await Promise.all(felog.map((k) => rskFetchRaw(k, env, ctx)))).filter(Boolean);
  const rot = raw.find((r) => r.kt === kt);
  let out = { kt, holdur: false };
  if (rot) {
    const SLEPPA = /^(endursko.andi|stofnandi)/i;
    const label = (t) => t.hlutverk || t.tegund || 'fyrirsvar';
    const folk = new Map();   // einstaklings-kt -> { nafn, roles: [{felagKt, felagNafn, label}] }
    for (const co of raw) {
      for (const t of (co.tengsl || [])) {
        if (!t.einst || !t.kt || SLEPPA.test(t.tegund || '') || /l.st/i.test(t.stada || '')) continue;
        const p = folk.get(t.kt) || { nafn: t.nafn, kt: t.kt, roles: [] };
        p.roles.push({ felagKt: co.kt, felagNafn: co.nafn, label: label(t) });
        folk.set(t.kt, p);
      }
    }
    const stjornendur = [], krossar = [];
    for (const p of folk.values()) {
      const rotRoles = p.roles.filter((r) => r.felagKt === kt);
      const onnurMap = new Map();   // félag -> hlutverkslisti (sameina prókúru+stjórn í eina flís)
      for (const r of p.roles) {
        if (r.felagKt === kt) continue;
        const o = onnurMap.get(r.felagKt) || { kt: r.felagKt, nafn: r.felagNafn, labels: [] };
        if (o.labels.indexOf(r.label) < 0) o.labels.push(r.label);
        onnurMap.set(r.felagKt, o);
      }
      const onnur = [...onnurMap.values()].map((o) => ({ kt: o.kt, nafn: o.nafn, hlutverk: o.labels.join(' · ') })).slice(0, 12);
      if (rotRoles.length) {
        stjornendur.push({ nafn: p.nafn, _kt: p.kt, hlutverk_rot: [...new Set(rotRoles.map((r) => r.label))], onnur });
      } else if (onnurMap.size >= 2) {
        krossar.push({ nafn: p.nafn, felog: [...onnurMap.values()].map((o) => ({ kt: o.kt, nafn: o.nafn })).slice(0, 6) });
      }
    }
    // rótarfyrirsvar fremst í sömu röð og RSK skilar; fólk með tengsl í öðrum félögum efst innan hóps
    stjornendur.sort((a, b) => (b.onnur.length ? 1 : 0) - (a.onnur.length ? 1 : 0));
    out = { kt, holdur: true, n_felog: raw.length, felog: raw.map((r) => ({ kt: r.kt, nafn: r.nafn })), stjornendur: stjornendur.slice(0, 20), krossar: krossar.slice(0, 12), heimild: 'Fyrirtækjaskrá Skattsins (opinbert API) — fyrirsvar þvert á greint eignarhaldsnet' };
  }
  // net óbyggt (n_felog=1) → stutt TTL svo fullbyggt tré taki fljótt við; fullt net → 12h
  const ttl = out.holdur ? (out.n_felog > 1 ? 43200 : 900) : 0;
  if (out.holdur) out = await tengslGrunnurEnrich(env, out, kt);   // 🕸️ landsvísu-auðgun (null-þolið; strippar _kt)
  const body = kort ? maskaKortSvar(out) : out;   // 🕸️ nafna-felun aðeins í kort-ham
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': ttl ? 'public, max-age=' + ttl : 'no-store' } });
  if (ttl) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ── Hlaðvarpsvaktin (22.8.2026): leitarorð → þættir. Tvö lög — (a) lýsigögn (hladvorp.json, alltaf til):
// titill+lýsing um matchNews; (b) umritanir í D1-töflunni `hladvorp` (build_hladvorp.mjs, gated á lykla):
// LIKE-leit per orð MEÐ SQL-hliðar brot-útdrætti (±120 stafir) svo 60KB-textarnir ferðist aldrei í svarið —
// aðeins brotið. Höfundaréttar-varfærni: aldrei birt meira en brotið + hlekkur á þáttinn sjálfan.
// Skilar [{ show, title, url, date, brot?, ord }] — dedup á url, umritunar-treff á undan (dýpri heimild).
export async function hladLeit(env, ordArr, days, limit) {
  const ord = [...new Set((Array.isArray(ordArr) ? ordArr : []).map((w) => String(w == null ? '' : w).toLowerCase().trim()).filter((w) => w.length >= 3))].slice(0, 12);
  if (!ord.length) return [];
  const out = new Map();
  // (b) umritanir — per orð; tafla gæti vantað (fyrsta keyrsla) → catch → []
  if (env.TENGSL) {
    const fra = Math.floor(Date.now() / 1000) - (days || 14) * 86400;
    for (const w of ord) {
      const rows = await env.TENGSL.prepare(
        "SELECT url, show, title, ts, substr(texti, max(1, instr(lower(texti), ?1) - 120), 300) AS brot FROM hladvorp WHERE ts > ?2 AND (instr(lower(title), ?1) > 0 OR instr(lower(texti), ?1) > 0) ORDER BY ts DESC LIMIT 8"
      ).bind(w, fra).all().then((r) => (r && r.results) || []).catch(() => []);
      for (const r of rows) {
        const cur = out.get(r.url);
        if (cur) { if (!cur.ord.includes(w)) cur.ord.push(w); continue; }
        out.set(r.url, { show: r.show, title: r.title, url: r.url, date: r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : '', brot: String(r.brot || '').replace(/\s+/g, ' ').trim(), ord: [w], dypt: 'umritun' });
      }
    }
  }
  // (a) lýsigögn — matchNews á titil+lýsingu (grípur þætti sem eru ekki (enn) umritaðir)
  try {
    const meta = await augGet(env, 'hladvorp.json');
    for (const t of (meta && meta.thaettir) || []) {
      if (out.size >= (limit || 20)) break;
      if (out.has(t.url)) continue;
      const treff = ord.filter((w) => ((t.title || '') + ' ' + (t.lysing || '')).toLowerCase().includes(w));
      if (treff.length) out.set(t.url, { show: t.show, title: t.title, url: t.url, date: t.d, ord: treff, dypt: 'lysing' });
    }
  } catch (e) {}
  return [...out.values()].sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, limit || 20);
}

export async function newsSince(env, days, limit) {
  if (!env.TENGSL) return [];
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const r = await env.TENGSL.prepare('SELECT title, url, source, ts, body FROM news WHERE ts>=? ORDER BY ts DESC LIMIT ?').bind(since, Math.min(limit || 60, 2000)).all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => ({ title: x.title, url: x.url, source: x.source, date: new Date(x.ts * 1000).toISOString().slice(0, 10), ts: x.ts, body: x.body || x.title }));
}

const _ISUF = ['innar', 'arnir', 'irnir', 'inum', 'anum', 'anna', 'unum', 'inni', 'ana', 'ins', 'ans', 'nir', 'nar', 'num', 'inn', 'in', 'ið', 'ur', 'ns', 'na', 'um', 's', 'i', 'a'];

export function _isStem(lc) { if (/\s/.test(lc) || lc.length < 7) return null; for (const suf of _ISUF) { if (lc.endsWith(suf) && lc.length - suf.length >= 5) return lc.slice(0, -suf.length); } return null; }
export function _searchVariants(t) {
  const lc = String(t).toLowerCase().trim();
  if (lc.length < 3) return [];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pats = new Set(['%' + lc + '%']);                 // grunnmynd hvar sem er
  if (cap(lc) !== lc) pats.add('%' + cap(lc) + '%');       // ísl. upphafsstafur (Í/Ö/Þ/Æ)
  const st = _isStem(lc);
  if (st && st.length >= 5 && st !== lc) for (const s of (cap(st) !== st ? [st, cap(st)] : [st])) { pats.add('% ' + s + '%'); pats.add(s + '%'); }
  return [...pats];
}

export function maskaKortSvar(out) {
  if (!out || !out.holdur) return out;
  const krossar = (out.krossar || []).map((p, i) => ({ token: 'E' + (i + 1), maskad: true, felog: p.felog || [] }));
  return { ...out, krossar, kort: true };
}

export async function tengslGrunnurEnrich(env, out, rotKt) {
  if (!env || !env.TENGSL || !out || !out.holdur) { if (out && out.stjornendur) for (const p of out.stjornendur) delete p._kt; return out; }
  const rkt = String(rotKt || '').replace(/\D/g, '');
  for (const p of (out.stjornendur || [])) {
    const pkt = p._kt; delete p._kt;
    if (!pkt) continue;
    try {
      const q = await env.TENGSL.prepare(
        "SELECT h.felag_kt AS kt, f.nafn AS nafn, h.hlutverk AS hlutverk FROM hlutverk h JOIN felog f ON f.kt=h.felag_kt WHERE h.person_key=? AND h.seen_last IS NULL AND h.felag_kt<>? LIMIT 40"
      ).bind(pkt, rkt).all();
      const rows = (q && q.results) || [];
      const have = new Set((p.onnur || []).map((o) => o.kt));
      for (const r of rows) {
        if (have.has(r.kt)) { const ex = p.onnur.find((o) => o.kt === r.kt); if (ex) ex.grunnur = true; continue; }
        (p.onnur = p.onnur || []).push({ kt: r.kt, nafn: r.nafn, hlutverk: r.hlutverk || '', grunnur: true });
        have.add(r.kt);
      }
      p.onnur = (p.onnur || []).slice(0, 30);
    } catch (e) {}
  }
  return out;
}

export function topplistaBody(rows, entitled, total) {
  return entitled ? { radir: rows, total, locked: false } : { radir: rows.slice(0, 3), total, locked: true };
}

export function topplistaEntitled(urow, nowSec) {
  return !!(urow && (_freeAll(urow) || (urow.tier && urow.tier_until > nowSec)));
}
