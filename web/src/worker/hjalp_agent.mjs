// hjalp_agent.mjs (worker) — þjónustufulltrúa-flæðið: ticket í D1 → Claude-greining → staðfesting á notanda
// (sniðmát) → forsamið KB-svar EÐA tillaga sem bíður Arons → innri tilkynning → /api/admin/ticket fyrir /stjorn/.
// Hrein rökfræði (flokkun, gátun, KB, efnislínur) er í ../lib/hjalp_agent.mjs (prófuð); hér er aðeins I/O.
//
// Reglur: agentinn sendir sjálfur AÐEINS staðfestingu og orðrétt KB-svar. Allt sem AI semur bíður Arons.
// Neyðarrofi: stjorn_sync k='hjalp_agent_off' = '1' → engin AI-greining og enginn sjálfvirkur póstur á notanda
// (ticket skráist samt og innri tilkynning fer). CTO-dispatch (Fasi 2) = repository_dispatch 'cto' með ticket-nr.
import { _ajson, _emailTpl, _esc, sendGmail } from './felag.mjs';
import { renderEmail } from '../lib/emails.mjs';
import { readSession } from './auth.mjs';
import { OPNAR_STODUR, TICKET_STODUR, ackVars, efniUrLysingu, flokkaFallback, greiningPrompt, greiningUser, kbSjalfvirkt, parseGreining, ticketSubject } from '../lib/hjalp_agent.mjs';

const MODEL = 'claude-haiku-4-5-20251001';
const _nowSek = () => Math.floor(Date.now() / 1000);
const ADMIN_TO = (env) => env.HJALP_TO || 'hjalp@karp.is';

async function _isAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}
async function _rofiOff(env) {
  const r = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='hjalp_agent_off'").first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

/** Skráir ticket + fyrsta skilaboð (inn). Skilar ticket-hlut með id. */
export async function createTicket(env, t) {
  const ts = _nowSek();
  const efni = String(t.efni || '').trim().slice(0, 160) || efniUrLysingu(t.lysing);
  const r = await env.TENGSL.prepare(
    'INSERT INTO tickets (created, updated, uppruni, nafn, netfang, user_id, flokkur, efni, lysing, stada, gmail_thread, gmail_msgid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(ts, ts, t.uppruni || 'form', t.nafn || null, t.netfang, t.user_id || null, t.flokkur || null, efni, String(t.lysing).slice(0, 8000), 'nytt', t.gmail_thread || null, t.gmail_msgid || null).run();
  const id = r && r.meta ? r.meta.last_row_id : null;
  await logMsg(env, id, { dir: 'in', sent_by: 'notandi', fra: t.netfang, til: ADMIN_TO(env), efni, texti: t.lysing, gmail_msgid: t.gmail_msgid || null });
  return Object.assign({ id, created: ts, updated: ts, stada: 'nytt', efni }, t);
}

export async function logMsg(env, ticketId, m) {
  if (!ticketId) return;
  await env.TENGSL.prepare('INSERT INTO ticket_msgs (ticket_id, ts, dir, sent_by, fra, til, efni, texti, gmail_msgid, meta) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(ticketId, _nowSek(), m.dir, m.sent_by, m.fra || null, m.til || null, m.efni || null, String(m.texti || '').slice(0, 20000), m.gmail_msgid || null, m.meta ? JSON.stringify(m.meta).slice(0, 2000) : null).run().catch(() => {});
  await env.TENGSL.prepare('UPDATE tickets SET updated=? WHERE id=?').bind(_nowSek(), ticketId).run().catch(() => {});
}

async function setTicket(env, id, fields) {
  const keys = Object.keys(fields).filter((k) => /^[a-z_]+$/.test(k));
  if (!keys.length) return;
  const sql = 'UPDATE tickets SET ' + keys.map((k) => k + '=?').join(', ') + ', updated=? WHERE id=?';
  await env.TENGSL.prepare(sql).bind(...keys.map((k) => fields[k]), _nowSek(), id).run().catch(() => {});
}

/** Claude-greining (Haiku) → gátað JSON; fellur á lykilorða-flokkun ef lykill vantar/villa. */
export async function greinaTicket(env, t) {
  const fb = flokkaFallback(t.flokkur, t.lysing);
  if (!env.ANTHROPIC_API_KEY) return Object.assign({ samantekt: '', svar: '', cto_brief: '', kb: null, model: 'fallback' }, fb);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      // 2000 tókar: cto_brief + svar á íslensku fóru yfir 900 í fyrstu prufu → klippt JSON → þáttun brást.
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: greiningPrompt(), messages: [{ role: 'user', content: greiningUser(t) }] }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error('ai ' + res.status);
    const j = await res.json();
    const text = (j.content || []).map((b) => b.text || '').join('');
    const g = parseGreining(text);
    if (!g) { const e = new Error('parse'); e.raw = text.slice(0, 400); e.stop = j.stop_reason; throw e; }
    return Object.assign(g, { model: MODEL });
  } catch (e) {
    // raw/stop geymast í ai_greining svo hægt sé að sjá HVERS VEGNA þáttun brást (klipping vs rusl)
    return Object.assign({ samantekt: '', svar: '', cto_brief: '', kb: null, model: 'fallback:' + String(e.message || e).slice(0, 40), raw: e.raw || undefined, stop: e.stop || undefined }, fb);
  }
}

/** Staðfesting á notanda — sniðmát `ticket_ack` (ritanlegt á /stjorn/), aldrei AI-texti. */
export async function sendAck(env, t) {
  const tpl = await _emailTpl(env, 'ticket_ack');
  const vars = ackVars(t);
  const subject = renderEmail(tpl.subject, vars);
  const html = renderEmail(tpl.html, Object.assign({}, vars, { nafn: _esc(vars.nafn), efni: _esc(vars.efni) }));
  const r = await sendGmail(env, { to: t.netfang, subject, html, replyTo: ADMIN_TO(env) });
  await logMsg(env, t.id, { dir: 'out', sent_by: 'agent', fra: ADMIN_TO(env), til: t.netfang, efni: subject, texti: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), meta: r });
  if (r.ok) await setTicket(env, t.id, { ack_sent: _nowSek() });
  return r;
}

/** Efnislegt svar á notanda (KB orðrétt, Aron eða samþykkt tillaga). */
export async function sendSvar(env, t, texti, sentBy) {
  const subject = ticketSubject(t.id, t.efni);
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:560px;white-space:pre-wrap">' + _esc(texti) + '</div>'
    + '<p style="color:#999;font-size:12px;margin-top:22px">Karp · hjalp@karp.is · svaraðu þessum pósti ef eitthvað er óljóst</p>';
  const r = await sendGmail(env, { to: t.netfang, subject, html, replyTo: ADMIN_TO(env) });
  await logMsg(env, t.id, { dir: 'out', sent_by: sentBy || 'aron', fra: ADMIN_TO(env), til: t.netfang, efni: subject, texti, meta: r });
  if (r.ok) await setTicket(env, t.id, { svar_sent: _nowSek(), stada: 'svarad' });
  return r;
}

/** Innri tilkynning á hjalp@ (= pósthólf Arons) með greiningu og hlekk á /stjorn/. */
async function notifyIntern(env, t, g, auto) {
  const link = 'https://karp.is/stjorn/#ticket-' + t.id;
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:600px">'
    + '<h3 style="color:#8a5e00;margin:0 0 10px">🎫 Ticket #' + t.id + ' — ' + _esc(t.efni || '') + '</h3>'
    + '<p style="margin:4px 0"><b>' + _esc(t.nafn || '—') + '</b> &lt;' + _esc(t.netfang) + '&gt; · ' + _esc(t.flokkur || 'Annað') + ' · uppruni: ' + _esc(t.uppruni || 'form') + '</p>'
    + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px;margin:14px 0">' + _esc(t.lysing) + '</p>'
    + '<p style="margin:12px 0;padding:10px 12px;background:#faf6ea;border-radius:8px"><b>🤖 Greining:</b> ' + _esc(g.tegund) + ' · forgangur ' + g.forgangur
    + (g.samantekt ? '<br>' + _esc(g.samantekt) : '')
    + (auto ? '<br><b>Sjálfvirkt svar sent:</b> KB „' + _esc(auto.id) + '"' : (g.svar ? '<br><b>Svar-tillaga bíður þín</b>' : ''))
    + (g.cto_brief ? '<br><b>CTO-brief:</b> ' + _esc(g.cto_brief).slice(0, 600) : '') + '</p>'
    + '<p><a href="' + link + '" style="background:#8a5e00;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Opna á /stjorn/</a></p></div>';
  return sendGmail(env, { to: ADMIN_TO(env), replyTo: t.netfang, subject: '[Hjálp #' + t.id + '] ' + (g.tegund || '') + ' · ' + (t.efni || '').slice(0, 60), html });
}

/** Allt flæðið eftir að ticket er til: greining → staðfesting → KB-svar eða bið → innri tilkynning. */
export async function processNewTicket(env, t) {
  const off = await _rofiOff(env);
  const g = off ? Object.assign({ samantekt: '', svar: '', cto_brief: '', kb: null, model: 'off' }, flokkaFallback(t.flokkur, t.lysing)) : await greinaTicket(env, t);
  await setTicket(env, t.id, { tegund: g.tegund, forgangur: g.forgangur, ai_greining: JSON.stringify(g).slice(0, 6000) });
  let auto = null;
  if (!off) {
    await sendAck(env, t);
    auto = kbSjalfvirkt(g);
    if (auto) await sendSvar(env, t, 'Sæl/Sæll' + (t.nafn ? ' ' + t.nafn.split(' ')[0] : '') + ',\n\n' + auto.svar + '\n\nBestu kveðjur,\nKarp', 'agent');
    else await setTicket(env, t.id, { stada: 'stadfest' });
  }
  await notifyIntern(env, t, g, auto);
  return { g, auto: auto ? auto.id : null, off };
}

async function _dispatchCto(env, t) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'cto', client_payload: { ticket: t.id } }),
  }).catch(() => null);
  return { ok: !!(r && r.status === 204), status: r ? r.status : 0 };
}

/** /api/admin/ticket — GET (listi eða ?id=) og POST {action,...}. Admin-lota EÐA X-Admin-Key (server-til-server). */
export async function adminTicketHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _isAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const id = parseInt(url.searchParams.get('id') || '', 10);
    if (id) {
      const t = await env.TENGSL.prepare('SELECT * FROM tickets WHERE id=?').bind(id).first().catch(() => null);
      if (!t) return _ajson({ ok: false, error: 'notfound' });
      const msgs = await env.TENGSL.prepare('SELECT id, ts, dir, sent_by, fra, til, efni, texti FROM ticket_msgs WHERE ticket_id=? ORDER BY ts, id').bind(id).all().catch(() => ({ results: [] }));
      return _ajson({ ok: true, ticket: t, msgs: msgs.results || [] });
    }
    const opin = url.searchParams.get('allir') ? '' : ' WHERE stada IN (' + OPNAR_STODUR.map(() => '?').join(',') + ')';
    const rows = await env.TENGSL.prepare('SELECT id, created, updated, uppruni, nafn, netfang, flokkur, tegund, forgangur, efni, stada, ack_sent, svar_sent, cto_pr FROM tickets' + opin + ' ORDER BY forgangur, created DESC LIMIT 200').bind(...(opin ? OPNAR_STODUR : [])).all().catch(() => ({ results: [] }));
    const off = await _rofiOff(env);
    return _ajson({ ok: true, tickets: rows.results || [], off });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  const b = (await request.json().catch(() => null)) || {};
  const action = String(b.action || '');
  if (action === 'rofi') {
    await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('hjalp_agent_off', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").bind(b.off ? '1' : '0', _nowSek()).run().catch(() => {});
    return _ajson({ ok: true, off: !!b.off });
  }
  if (action === 'create') {
    // Innlestur utan frá (t.d. Gmail-vakt um X-Admin-Key) eða nýr póstur saminn á /stjorn/ (uppruni 'stjorn').
    const netfang = String(b.netfang || '').trim().slice(0, 160);
    const lysing = String(b.lysing || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(netfang) || lysing.length < 2) return _ajson({ ok: false, error: 'gogn' });
    if (b.gmail_msgid) {
      const dup = await env.TENGSL.prepare('SELECT id FROM tickets WHERE gmail_msgid=?').bind(String(b.gmail_msgid)).first().catch(() => null);
      if (dup) return _ajson({ ok: true, id: dup.id, dup: true });
    }
    const t = await createTicket(env, { uppruni: String(b.uppruni || 'gmail').slice(0, 12), nafn: String(b.nafn || '').slice(0, 120), netfang, flokkur: b.flokkur || null, efni: b.efni, lysing, gmail_thread: b.gmail_thread || null, gmail_msgid: b.gmail_msgid || null });
    if (b.uppruni === 'stjorn') {
      // Aron semur póst á /stjorn/: sendist strax, ticket verður „svarad" með fullum þræði.
      await setTicket(env, t.id, { tegund: 'annad', ai_greining: JSON.stringify({ model: 'stjorn' }) });
      const r = await sendSvar(env, t, lysing, 'aron');
      return _ajson({ ok: r.ok, id: t.id, send: r });
    }
    ctx.waitUntil(processNewTicket(env, t));
    return _ajson({ ok: true, id: t.id });
  }
  const id = parseInt(b.id, 10);
  if (!id) return _ajson({ ok: false, error: 'id' });
  const t = await env.TENGSL.prepare('SELECT * FROM tickets WHERE id=?').bind(id).first().catch(() => null);
  if (!t) return _ajson({ ok: false, error: 'notfound' });
  if (action === 'svara') {
    const texti = String(b.texti || '').trim();
    if (texti.length < 2) return _ajson({ ok: false, error: 'texti' });
    const r = await sendSvar(env, t, texti, byKey ? 'agent' : 'aron');
    return _ajson({ ok: r.ok, send: r });
  }
  if (action === 'stada') {
    const s = String(b.stada || '');
    if (!TICKET_STODUR.includes(s)) return _ajson({ ok: false, error: 'stada' });
    const extra = s === 'samthykkt' ? { samthykkt_by: uid || null, samthykkt_at: _nowSek() } : {};
    await setTicket(env, id, Object.assign({ stada: s }, extra));
    return _ajson({ ok: true });
  }
  if (action === 'greina') {
    // Endurkeyra AI-greiningu á til ticket — sendir ENGAN póst (nýtist í prófunum og þegar módel/prompt breytist).
    const g = await greinaTicket(env, t);
    await setTicket(env, id, { tegund: g.tegund, forgangur: g.forgangur, ai_greining: JSON.stringify(g).slice(0, 6000) });
    return _ajson({ ok: true, greining: g });
  }
  if (action === 'nota') {
    const n = String(b.texti || '').trim().slice(0, 2000);
    await setTicket(env, id, { notur: ((t.notur ? t.notur + '\n' : '') + '[' + new Date().toISOString().slice(0, 16) + '] ' + n).slice(-6000) });
    return _ajson({ ok: true });
  }
  if (action === 'cto') {
    const r = await _dispatchCto(env, t);
    if (r.ok) await setTicket(env, id, { stada: 'cto' });
    return _ajson(r);
  }
  if (action === 'cto_result') {
    // Frá CTO-workflow (X-Admin-Key): PR-slóð + samantekt → staða 'tillaga' og Aron fær póst.
    await setTicket(env, id, { stada: 'tillaga', cto_pr: String(b.pr || '').slice(0, 300), cto_branch: String(b.branch || '').slice(0, 120), cto_samantekt: String(b.samantekt || '').slice(0, 4000) });
    ctx.waitUntil(sendGmail(env, { to: ADMIN_TO(env), subject: '[Hjálp #' + id + '] CTO-tillaga tilbúin', html: '<p>Tillaga að lagfæringu fyrir ticket #' + id + ' (' + _esc(t.efni || '') + '):</p><p style="white-space:pre-wrap">' + _esc(String(b.samantekt || '')) + '</p><p><a href="' + _esc(String(b.pr || '')) + '">Skoða PR</a> · <a href="https://karp.is/stjorn/#ticket-' + id + '">Samþykkja á /stjorn/</a></p>' }));
    return _ajson({ ok: true });
  }
  if (action === 'lagad') {
    // Lagfæring komin í loftið (webhook/CTO): notandi fær lokapóst, ticket lokað.
    await setTicket(env, id, { stada: 'lagad' });
    const r = await sendSvar(env, Object.assign({}, t, { efni: t.efni }), 'Sæl/Sæll' + (t.nafn ? ' ' + t.nafn.split(' ')[0] : '') + ',\n\nmálið sem þú bentir okkur á (#' + id + ') hefur verið lagað og breytingin er komin í loftið á karp.is. Takk fyrir að láta vita — það hjálpar okkur að gera vefinn betri.\n\nBestu kveðjur,\nKarp', 'agent');
    await setTicket(env, id, { stada: 'lokad' });
    return _ajson({ ok: r.ok });
  }
  return _ajson({ ok: false, error: 'action' });
}

/** Samantekt fyrir /api/admin/overview → /stjorn/-spjöld. */
export async function ticketsOverview(env) {
  const rows = await env.TENGSL.prepare('SELECT id, created, updated, uppruni, nafn, netfang, flokkur, tegund, forgangur, efni, stada, ack_sent, svar_sent, cto_pr FROM tickets ORDER BY created DESC LIMIT 60').all().catch(() => ({ results: [] }));
  const list = rows.results || [];
  const by = {}; for (const t of list) by[t.stada] = (by[t.stada] || 0) + 1;
  const off = await _rofiOff(env);
  return { list, open: list.filter((t) => OPNAR_STODUR.includes(t.stada)).length, by, off };
}
