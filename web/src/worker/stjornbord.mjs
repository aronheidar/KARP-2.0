// stjornbord.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

import { _monthStr, _sendVerifyEmail, readSession } from './auth.mjs';
import { _ajson, _emailOvSet, _emailTpl, _tokenHex, sendGmail } from './felag.mjs';
import { EMAIL_TYPES, renderEmail, resolveEmail, validateEmail } from '../lib/emails.mjs';

export async function _isAdmin(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

async function _audit(env, byUid, target, action, detail) {
  try {
    const now = Math.floor(Date.now() / 1000);
    let by = byUid || '?';
    if (byUid) { const a = await env.TENGSL.prepare('SELECT email FROM users WHERE id=?').bind(byUid).first().catch(() => null); if (a && a.email) by = a.email; }
    const row = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='audit'").first().catch(() => null);
    let log = []; try { log = JSON.parse((row && row.v) || '[]'); if (!Array.isArray(log)) log = []; } catch (e) { log = []; }
    log.push({ ts: now, by, target: target || null, action: String(action || '').slice(0, 40), detail: String(detail == null ? '' : detail).slice(0, 100) });
    if (log.length > 200) log = log.slice(-200);
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k,v,updated) VALUES ('audit',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").bind(JSON.stringify(log), now).run().catch(() => {});
  } catch (e) {}
}

export async function adminOverviewHandler(request, env) {
  // Aðgangur: annaðhvort innskráður admin (vafri) EÐA X-Admin-Key leyndarmál (Node-stjórnborð, server-til-server).
  const key = request.headers.get('X-Admin-Key');
  const bySecret = key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY;
  if (!bySecret && !(await _isAdmin(env, request))) return _ajson({ ok: false, error: 'admin' });
  const now = Math.floor(Date.now() / 1000);
  const users = (await env.TENGSL.prepare('SELECT id,email,username,name,is_admin,email_verified,kt,tier,tier_until,created,free_access,nemandi FROM users ORDER BY created DESC LIMIT 1000').all().catch(() => ({ results: [] }))).results || [];
  const subs = (await env.TENGSL.prepare('SELECT user_id,service,until,askell_id FROM sub_service WHERE until>?').bind(now).all().catch(() => ({ results: [] }))).results || [];
  const reps = (await env.TENGSL.prepare('SELECT user_id,report_key,granted FROM reports_granted').all().catch(() => ({ results: [] }))).results || [];
  // Prufu-aðgangar eru TEKNIR ÚR samantektinni (stats) — birtast samt í notendalistanum (merktir).
  // Stýrt EINGÖNGU úr stjórnborði: kvikur listi notanda-id í stjorn_sync k='test_ids' (⚙-reitur per notanda).
  const _testRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='test_ids'").first().catch(() => null);
  let _dynTest = []; try { _dynTest = JSON.parse((_testRow && _testRow.v) || '[]'); if (!Array.isArray(_dynTest)) _dynTest = []; } catch (e) { _dynTest = []; }
  const testIds = new Set(_dynTest.map(Number).filter(Boolean));
  const subByUser = {}, repByUser = {};
  for (const s of subs) (subByUser[s.user_id] = subByUser[s.user_id] || []).push(s.service);
  for (const r of reps) repByUser[r.user_id] = (repByUser[r.user_id] || 0) + 1;
  const uList = users.map((u) => ({ id: u.id, email: u.email, name: u.name || u.username || '', admin: u.is_admin === 1, free: u.free_access === 1, nemandi: u.nemandi === 1, verified: u.email_verified === 1, kt: u.kt || null, tier: (u.tier && u.tier_until > now) ? u.tier : null, tierUntil: u.tier_until || 0, subs: subByUser[u.id] || [], reports: repByUser[u.id] || 0, created: u.created, test: testIds.has(u.id) }));
  // Síuð sett fyrir samantektina (án prufu-aðganga) — notendalistinn `uList` er ósíaður.
  const sUsers = users.filter((u) => !testIds.has(u.id));
  const sUList = uList.filter((u) => !u.test);
  const sSubs = subs.filter((x) => !testIds.has(x.user_id));
  const sReps = reps.filter((x) => !testIds.has(x.user_id));
  const byService = {}; for (const s of sSubs) byService[s.service] = (byService[s.service] || 0) + 1;
  const byReport = {}; for (const r of sReps) { const t = String(r.report_key).split(':')[0]; byReport[t] = (byReport[t] || 0) + 1; }
  const day = 86400, recent = (n) => sUsers.filter((u) => u.created > now - n * day).length;
  // Tekjur (áætlaðar): virkar þjónustu-áskriftir + þrep (mán) + keyptar skýrslur (einskiptis 990).
  const PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 };
  const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
  let mrr = 0;
  for (const s of sSubs) mrr += PRICE_SVC[s.service] || 0;
  for (const u of sUList) if (u.tier) mrr += PRICE_TIER[u.tier] || 0;
  // Virkni: notendur með einhverja vakt / digest á (úr user_prefs).
  const watchRows = (await env.TENGSL.prepare("SELECT DISTINCT user_id FROM user_prefs WHERE k IN ('leitvakt','firmavakt','fastvakt','follows','ktwatch')").all().catch(() => ({ results: [] }))).results || [];
  const digestRows = (await env.TENGSL.prepare("SELECT user_id FROM user_prefs WHERE k='digest' AND v LIKE '%\"on\":true%'").all().catch(() => ({ results: [] }))).results || [];
  // Nýleg umsvif: síðustu skýrslukaup (með netfangi).
  const recentReps = (await env.TENGSL.prepare('SELECT rg.report_key, rg.granted, u.email FROM reports_granted rg LEFT JOIN users u ON u.id=rg.user_id ORDER BY rg.granted DESC LIMIT 12').all().catch(() => ({ results: [] }))).results || [];
  // S2b: rekstrar-samantekt Node-stjórnborðsins (samþykktir/tickets/herferðir/ledger) ef ýtt hefur verið.
  const syncRow = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='summary'").first().catch(() => null);
  let stjorn = null; if (syncRow) { try { stjorn = Object.assign(JSON.parse(syncRow.v), { syncedAt: syncRow.updated }); } catch (e) {} }
  // ── Endurnýjunarvakt: áskriftir/þrep sem renna út næstu 7/30 daga (án prufu) + brottfall (nýlega útrunnið). ──
  const soon7 = now + 7 * day, soon30 = now + 30 * day;
  const expSubList = sSubs.filter((s) => s.until <= soon30).map((s) => ({ kind: 'service', id: s.user_id, what: s.service, until: s.until }));
  const expTierList = sUList.filter((u) => u.tier && u.tierUntil && u.tierUntil <= soon30).map((u) => ({ kind: 'tier', id: u.id, what: u.tier, until: u.tierUntil }));
  const _emailById = new Map(sUsers.map((u) => [u.id, u.email]));
  const expiringList = [...expSubList, ...expTierList].sort((a, b) => a.until - b.until).slice(0, 40).map((x) => ({ kind: x.kind, what: x.what, until: x.until, email: _emailById.get(x.id) || '' }));
  const expiring = { d7: [...expSubList, ...expTierList].filter((x) => x.until <= soon7).length, d30: expSubList.length + expTierList.length };
  // Brottfall: nýlega útrunnin áskriftar-ígildi (síðustu 90 daga) → gróft endurnýjunarhlutfall.
  const _lapsSub = await env.TENGSL.prepare('SELECT COUNT(*) AS c FROM sub_service WHERE until < ? AND until > ?').bind(now, now - 90 * day).first().catch(() => null);
  const _lapsTier = await env.TENGSL.prepare('SELECT COUNT(*) AS c FROM users WHERE tier IS NOT NULL AND tier_until < ? AND tier_until > ?').bind(now, now - 90 * day).first().catch(() => null);
  const lapsed90 = ((_lapsSub && _lapsSub.c) || 0) + ((_lapsTier && _lapsTier.c) || 0);
  const _active = sSubs.length + sUList.filter((u) => u.tier).length;
  const churn = { lapsed90, renewalRate: (_active + lapsed90) > 0 ? Math.round(_active / (_active + lapsed90) * 100) : null };
  // ── MRR-þróun: daglegt snapshot í stjorn_sync k='mrr_history' (idempotent per dagur; safnast við admin-heimsóknir). ──
  const paying = sUList.filter((u) => u.tier || (u.subs && u.subs.length)).length;
  const _today = new Date(now * 1000).toISOString().slice(0, 10);
  const _mhRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='mrr_history'").first().catch(() => null);
  let mrrHistory = []; try { mrrHistory = JSON.parse((_mhRow && _mhRow.v) || '[]'); if (!Array.isArray(mrrHistory)) mrrHistory = []; } catch (e) { mrrHistory = []; }
  if (!mrrHistory.some((p) => p.d === _today)) {
    mrrHistory.push({ d: _today, mrr, paying, users: sUsers.length, reports: sReps.length });
    if (mrrHistory.length > 180) mrrHistory = mrrHistory.slice(-180);
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k,v,updated) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated').bind('mrr_history', JSON.stringify(mrrHistory), now).run().catch(() => {});
  }
  // Umbreytingar-trekt (án prufu): nýskráning → staðfest → virkjað (skýrsla/áskrift/þrep) → borgandi.
  const funnel = { signups: sUsers.length, verified: sUsers.filter((u) => u.email_verified === 1).length, activated: sUList.filter((u) => u.reports > 0 || (u.subs && u.subs.length) || u.tier).length, paying };
  // Innri nótur (per notanda-id) + audit-skrá (síðustu admin-aðgerðir) úr stjorn_sync.
  const _notesRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='notes'").first().catch(() => null);
  let notes = {}; try { notes = JSON.parse((_notesRow && _notesRow.v) || '{}'); if (typeof notes !== 'object' || Array.isArray(notes)) notes = {}; } catch (e) { notes = {}; }
  const _emailRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='email_templates'").first().catch(() => null);
  let emailOv = {}; try { emailOv = JSON.parse((_emailRow && _emailRow.v) || '{}'); if (!emailOv || typeof emailOv !== 'object' || Array.isArray(emailOv)) emailOv = {}; } catch (e) { emailOv = {}; }
  const _auditRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='audit'").first().catch(() => null);
  let audit = []; try { audit = JSON.parse((_auditRow && _auditRow.v) || '[]'); if (!Array.isArray(audit)) audit = []; } catch (e) { audit = []; }
  audit = audit.slice(-50).reverse();
  return _ajson({
    stjorn,
    ok: true, now,
    users: uList,
    stats: {
      total: sUsers.length, verified: sUsers.filter((u) => u.email_verified === 1).length, admins: sUsers.filter((u) => u.is_admin === 1).length,
      new7: recent(7), new30: recent(30),
      tierUsers: sUList.filter((u) => u.tier).length, activeSubs: sSubs.length, subsByService: byService,
      reportsTotal: sReps.length, reportsByType: byReport,
      mrr, reportRevenue: sReps.length * 990,
      watchers: watchRows.filter((r) => !testIds.has(r.user_id)).length, digestSubs: digestRows.filter((r) => !testIds.has(r.user_id)).length,
      excludedTest: testIds.size, expiring, churn, funnel,
    },
    recentReports: recentReps.map((r) => ({ key: r.report_key, email: r.email || '', granted: r.granted })),
    expiringList,
    mrrHistory,
    notes,
    audit,
    // Póst-skrá: skilgreining hverrar tegundar + NÚGILDANDI sniðmát (sjálfgefið eða yfirskrifað).
    emails: EMAIL_TYPES.map((t) => Object.assign(
      { id: t.id, label: t.label, hopur: t.hopur, flokkur: t.flokkur, hvenaer: t.hvenaer, vidtakandi: t.vidtakandi, ritanlegt: t.ritanlegt, breytur: t.breytur, krafist: t.krafist, ath: t.ath || '' },
      resolveEmail(t.id, emailOv),
    )),
  });
}

export async function adminUserHandler(request, env, ctx) {
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'post' });
  const byUid = await _isAdmin(env, request);
  if (!byUid) return _ajson({ ok: false, error: 'admin' });
  const b = (await request.json().catch(() => null)) || {};
  const id = +b.id, action = String(b.action || '');
  if (!id || !action) return _ajson({ ok: false, error: 'input' });
  const now = Math.floor(Date.now() / 1000);
  const u = await env.TENGSL.prepare('SELECT id,email,name,is_admin,email_verified FROM users WHERE id=?').bind(id).first().catch(() => null);
  if (!u) return _ajson({ ok: false, error: 'nouser' });
  const DUR = Math.min(60, Math.max(1, +b.months || 12)) * 30 * 86400;   // grant-lengd (mán → sek), sjálfgefið 1 ár
  const _det = action === 'tier' ? ('tier=' + (b.tier || 'clear')) : action === 'service' ? (b.service + '=' + (b.on ? 'on' : 'off')) : action === 'test' ? (b.on ? 'on' : 'off') : '';
  ctx.waitUntil(_audit(env, byUid, id, action, _det));   // audit-skrá (aðgerð + hver + á hvern)

  if (action === 'tier') {
    const tier = b.tier ? String(b.tier) : null;
    if (tier && !['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].includes(tier)) return _ajson({ ok: false, error: 'tier' });
    await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, updated=? WHERE id=?').bind(tier, tier ? now + DUR : 0, now, id).run().catch(() => {});
    return _ajson({ ok: true, tier, until: tier ? now + DUR : 0 });
  }
  if (action === 'service') {
    const service = String(b.service || ''); const on = !!b.on;
    if (!service) return _ajson({ ok: false, error: 'service' });
    if (on) await env.TENGSL.prepare('INSERT INTO sub_service (user_id,service,until,askell_id) VALUES (?,?,?,?) ON CONFLICT(user_id,service) DO UPDATE SET until=excluded.until, askell_id=excluded.askell_id').bind(id, service, now + DUR, 'admin-grant').run().catch(() => {});
    else await env.TENGSL.prepare('DELETE FROM sub_service WHERE user_id=? AND service=?').bind(id, service).run().catch(() => {});
    return _ajson({ ok: true, service, on });
  }
  if (action === 'reset_reports') {
    await env.TENGSL.prepare('UPDATE users SET reports_used=0, reports_month=?, updated=? WHERE id=?').bind(_monthStr(now), now, id).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (action === 'verify') {
    await env.TENGSL.prepare('UPDATE users SET email_verified=1, updated=? WHERE id=?').bind(now, id).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (action === 'resend_verify') {
    if (u.email_verified === 1) return _ajson({ ok: true, already: true });
    ctx.waitUntil(_sendVerifyEmail(env, u.id, u.email, now));
    return _ajson({ ok: true });
  }
  if (action === 'reset_pw') {
    const token = _tokenHex();
    await env.TENGSL.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires) VALUES (?,?,?,?)').bind(token, u.id, 'reset', now + 3600).run().catch(() => {});
    const link = 'https://karp.is/endurstilla/?token=' + token;
    const t = await _emailTpl(env, 'reset_admin');
    ctx.waitUntil(sendGmail(env, { to: u.email, subject: renderEmail(t.subject, { hlekkur: link }), html: renderEmail(t.html, { hlekkur: link }) }));
    return _ajson({ ok: true });
  }
  if (action === 'test') {
    const on = !!b.on;
    const row = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='test_ids'").first().catch(() => null);
    let ids = []; try { ids = JSON.parse((row && row.v) || '[]'); if (!Array.isArray(ids)) ids = []; } catch (e) { ids = []; }
    ids = ids.filter((x) => +x !== id); if (on) ids.push(id);
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k,v,updated) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated').bind('test_ids', JSON.stringify(ids), now).run().catch(() => {});
    return _ajson({ ok: true, test: on });
  }
  if (action === 'note') {
    const note = String(b.note || '').slice(0, 500);
    const row = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='notes'").first().catch(() => null);
    let notes = {}; try { notes = JSON.parse((row && row.v) || '{}'); if (typeof notes !== 'object' || Array.isArray(notes)) notes = {}; } catch (e) { notes = {}; }
    if (note) notes[id] = note; else delete notes[id];
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k,v,updated) VALUES ('notes',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").bind(JSON.stringify(notes), now).run().catch(() => {});
    return _ajson({ ok: true });
  }
  return _ajson({ ok: false, error: 'action' });
}

export async function adminEmailHandler(request, env, ctx) {
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'post' });
  const byUid = await _isAdmin(env, request);
  if (!byUid) return _ajson({ ok: false, error: 'admin' });
  const b = (await request.json().catch(() => null)) || {};
  const id = String(b.id || '');
  if (!id) return _ajson({ ok: false, error: 'input' });
  const now = Math.floor(Date.now() / 1000);
  const row = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='email_templates'").first().catch(() => null);
  let all = {}; try { all = JSON.parse((row && row.v) || '{}'); if (!all || typeof all !== 'object' || Array.isArray(all)) all = {}; } catch (e) { all = {}; }
  if (b.reset) { delete all[id]; }
  else {
    const patch = (b.patch && typeof b.patch === 'object') ? b.patch : null;
    if (!patch) return _ajson({ ok: false, error: 'input' });
    const v = validateEmail(id, patch);
    if (!v.ok) return _ajson({ ok: false, error: 'validation', villa: v.villa });
    all[id] = Object.assign({}, all[id], patch);
  }
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k,v,updated) VALUES ('email_templates',?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").bind(JSON.stringify(all), now).run().catch(() => {});
  _emailOvSet(all);   // uppfæra cache STRAX svo næsti póstur noti nýja sniðmátið
  ctx.waitUntil(_audit(env, byUid, null, b.reset ? 'email-reset' : 'email-edit', id));
  return _ajson({ ok: true, tpl: resolveEmail(id, all) });
}

export async function adminRefreshHandler(request, env, ctx) {
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'post' });
  const byUid = await _isAdmin(env, request);
  if (!byUid) return _ajson({ ok: false, error: 'admin' });
  if (!env.GITHUB_DISPATCH_TOKEN) return _ajson({ ok: false, error: 'unconfigured' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'refresh' }),
    });
    if (r.status === 204) { ctx.waitUntil(_audit(env, byUid, null, 'refresh-data', 'handræst')); return _ajson({ ok: true }); }
    return _ajson({ ok: false, error: 'dispatch', status: r.status });
  } catch (e) { return _ajson({ ok: false, error: 'net' }); }
}

export async function adminSendHandler(request, env) {
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'post' });
  const key = request.headers.get('X-Admin-Key');
  const okAuth = (key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY) || (await _isAdmin(env, request));
  if (!okAuth) return _ajson({ ok: false, error: 'admin' });
  const b = (await request.json().catch(() => null)) || {};
  const to = String(b.to || '').trim();
  const subject = String(b.subject || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !subject) return _ajson({ ok: false, error: 'input' });
  const r = await sendGmail(env, { to, subject, html: b.html, text: b.text, replyTo: b.replyTo, inReplyTo: b.inReplyTo });
  return _ajson({ ok: !!r.ok, error: r.ok ? undefined : (r.unconfigured ? 'unconfigured' : (r.error || 'send')) });
}

export async function adminSyncHandler(request, env) {
  const key = request.headers.get('X-Admin-Key');
  const okAuth = (key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY) || (await _isAdmin(env, request));
  if (!okAuth) return _ajson({ ok: false, error: 'admin' });
  if (request.method === 'POST') {
    const b = (await request.json().catch(() => null)) || {};
    const k = String(b.k || '').slice(0, 40); const v = String(b.v || '');
    if (!k || v.length > 200000) return _ajson({ ok: false, error: 'input' });
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated').bind(k, v, Math.floor(Date.now() / 1000)).run().catch(() => {});
    return _ajson({ ok: true });
  }
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='summary'").first().catch(() => null);
  let data = null; if (r) { try { data = JSON.parse(r.v); } catch (e) {} }
  return _ajson({ ok: true, data, updated: r ? r.updated : 0 });
}

export async function adminSetTypeHandler(request, env) {
  const uid = await _isAdmin(env, request);           // panel gate = is_admin only
  if (!uid) return _ajson({ ok: false, error: 'admin' }, 403);
  const b = await request.json().catch(() => ({}));
  const targetId = parseInt(b && b.id, 10);
  const type = String((b && b.type) || '');
  if (!targetId || !['admin', 'free', 'user', 'nemandi'].includes(type)) return _ajson({ ok: false, error: 'bad-params' }, 400);
  const isAdmin = type === 'admin' ? 1 : 0;
  const freeAccess = type === 'free' ? 1 : 0;
  const nemandi = type === 'nemandi' ? 1 : 0;
  // öryggi: aldrei fjarlægja SÍÐASTA admin (self-lockout vörn)
  if (type !== 'admin') {
    const tgt = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(targetId).first().catch(() => null);
    if (tgt && tgt.is_admin === 1) {
      const n = await env.TENGSL.prepare('SELECT COUNT(*) c FROM users WHERE is_admin=1').first().catch(() => ({ c: 0 }));
      if ((n.c || 0) <= 1) return _ajson({ ok: false, error: 'last-admin' }, 409);
    }
  }
  await env.TENGSL.prepare('UPDATE users SET is_admin=?, free_access=?, nemandi=?, updated=? WHERE id=?')
    .bind(isAdmin, freeAccess, nemandi, Math.floor(Date.now() / 1000), targetId).run().catch(() => null);
  await _audit(env, uid, targetId, 'set-type', type);
  return _ajson({ ok: true, id: targetId, type });
}
