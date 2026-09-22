// hjalp_agent.mjs (worker) — þjónustufulltrúa-flæðið: ticket í D1 → Claude-greining → staðfesting á notanda
// (sniðmát) → forsamið KB-svar EÐA tillaga sem bíður Arons → innri tilkynning → /api/admin/ticket fyrir /stjorn/.
// Hrein rökfræði (flokkun, gátun, KB, efnislínur) er í ../lib/hjalp_agent.mjs (prófuð); hér er aðeins I/O.
//
// Reglur: agentinn sendir sjálfur AÐEINS staðfestingu og orðrétt KB-svar. Allt sem AI semur bíður Arons.
// Neyðarrofi: stjorn_sync k=<lykill> = '1' → engin AI-greining og enginn sjálfvirkur póstur á notanda
// (ticket skráist samt og innri tilkynning fer). Rofar eru NÚ PER STARFSMAÐUR — lykillinn kemur úr
// rofiLykill() í ../lib/personur.mjs (Sigrún='hjalp_agent_off', Hrafn='rofi_hrafn', …), sjá _rofiOff/_rofiA.
// CTO-dispatch (Fasi 2) = repository_dispatch 'cto' með ticket-nr.
import { _ajson, _emailTpl, _esc, sendGmail } from './felag.mjs';
import { renderEmail } from '../lib/emails.mjs';
import { readSession } from './auth.mjs';
import { OPNAR_STODUR, TICKET_STODUR, ackVars, drogUrGrein, efniUrLysingu, flokkaFallback, greiningPrompt, greiningUser, kbAllt, kbSjalfvirkt, kbVistudDrog, parseGreining, svarUppfaersla, ticketSubject } from '../lib/hjalp_agent.mjs';
import { hreinsaDrogUt } from '../lib/stjorn/laerdomur.mjs';   // setningar sem Aron tekur alltaf út fara úr drögunum hjá ÞJÓNINUM
import { persona, rofiLykill, veljaFundarmenn } from '../lib/personur.mjs';   // 🛟 Sigrún skrifar undir öll póst-samskipti við notendur; fundarmenn f. Moot-forsýn
import { thurfHjalp } from '../lib/stjorn/hjalparbeidni.mjs';   // 🙋 „ég þarf þig á þessari" — reiknað hér, þar sem lýsingin er
import { ctoLykill, ctoDrogTaka } from './cto_lykill.mjs';   // 🛠️ lykill CTO-keyrslunnar: ein beiðni, 2 klst, aldrei um opinbera skrá
import { skraAtburd, sigrunVika, sigrunTillaga, sigrunSpjall, lokaMargt, sigrunThekking, sigrunLaerdomur, sigrunKbLeita, sigrunGreinDrog, sigrunGreinVista, sigrunGreinHafna, sigrunGreinEyda, sigrunVikupostur } from './sigrun_vinna.mjs';   // Sigrún sem starfsmaður

const MODEL = 'claude-haiku-4-5-20251001';
const _nowSek = () => Math.floor(Date.now() / 1000);
const ADMIN_TO = (env) => env.HJALP_TO || 'hjalp@karp.is';

async function _isAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

/** CSRF-gát fyrir KÖKULOTU-leið admin-POSTa (ekki X-Admin-Key). karp_session er Domain=.karp.is → systkina-undirlén
 *  (wp.karp.is) eru same-site og SameSite=Lax stoppar þau ekki; `<form enctype=text/plain>` gæti sent JSON-líkt bodý.
 *  Reglur: Sec-Fetch-Site til og ≠ same-origin/none → hafna · Origin til og ≠ eigin origin/https://karp.is → hafna ·
 *  content-type verður að byrja á application/json. Skilar villukóða eða null. Flutt út f. adminMootHandler. */
export function adminCsrfVilla(request) {
  const sfs = request.headers.get('Sec-Fetch-Site');
  if (sfs && sfs !== 'same-origin' && sfs !== 'none') return 'origin';
  const origin = request.headers.get('Origin');
  if (origin) {
    let own = ''; try { own = new URL(request.url).origin; } catch (e) { own = ''; }
    if (origin !== own && origin !== 'https://karp.is') return 'origin';
  }
  const ct = String(request.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('application/json')) return 'content_type';
  return null;
}
async function _rofiOff(env) {
  const r = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='hjalp_agent_off'").first().catch(() => null);
  return !!(r && String(r.v) === '1');
}

/** Almennur rofa-lestur: k='hjalp_agent_off' | 'rofi_hrafn' | … Skilar true þegar SLÖKKT er. */
async function _rofiA(env, lykill) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
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

/** Skráir röð í ticket_msgs. Skilar {ok, ts}: ok=false ef INSERT brást (D1 lestrarþak/7403 gleypt áður þögult) —
 *  Moot notar það til að fella fundinn á 'vistun' í stað þess að sýna fundargerð sem hvergi er til. ts = það sem skrifaðist. */
export async function logMsg(env, ticketId, m) {
  if (!ticketId) return { ok: false, ts: 0 };
  const ts = _nowSek();
  const ok = await env.TENGSL.prepare('INSERT INTO ticket_msgs (ticket_id, ts, dir, sent_by, fra, til, efni, texti, gmail_msgid, meta) VALUES (?,?,?,?,?,?,?,?,?,?)')
    // meta-þak 8000: niðurstöðuröð Moot (dir='moot', sent_by='moot') ber alla nidurstada-hlutinn (≤ ~4500 stafir).
    .bind(ticketId, ts, m.dir, m.sent_by, m.fra || null, m.til || null, m.efni || null, String(m.texti || '').slice(0, 20000), m.gmail_msgid || null, m.meta ? JSON.stringify(m.meta).slice(0, 8000) : null).run().then(() => true).catch(() => false);
  await env.TENGSL.prepare('UPDATE tickets SET updated=? WHERE id=?').bind(_nowSek(), ticketId).run().catch(() => {});
  return { ok, ts };
}

export async function setTicket(env, id, fields) {
  const keys = Object.keys(fields).filter((k) => /^[a-z_]+$/.test(k));
  if (!keys.length) return;
  const sql = 'UPDATE tickets SET ' + keys.map((k) => k + '=?').join(', ') + ', updated=? WHERE id=?';
  await env.TENGSL.prepare(sql).bind(...keys.map((k) => fields[k]), _nowSek(), id).run().catch(() => {});
}

/** Claude-greining (Haiku) → gátað JSON; fellur á lykilorða-flokkun ef lykill vantar/villa.
 *  `auka` = hjálpargreinar sem Aron hefur vistað · `still` = það sem hún hefur lært af breytingum hans
 *  (bæði úr sigrunThekking). Hvort tveggja má vanta: þá greinir hún eins og áður. */
export async function greinaTicket(env, t, auka = [], still = null) {
  const fb = flokkaFallback(t.flokkur, t.lysing);
  if (!env.ANTHROPIC_API_KEY) return Object.assign({ samantekt: '', svar: '', cto_brief: '', kb: null, model: 'fallback' }, fb);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      // 2000 tókar: cto_brief + svar á íslensku fóru yfir 900 í fyrstu prufu → klippt JSON → þáttun brást.
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: greiningPrompt(auka, still), messages: [{ role: 'user', content: greiningUser(t) }] }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error('ai ' + res.status);
    const j = await res.json();
    const text = (j.content || []).map((b) => b.text || '').join('');
    const g = parseGreining(text, auka);
    if (!g) { const e = new Error('parse'); e.raw = text.slice(0, 400); e.stop = j.stop_reason; throw e; }
    // Vistuð grein sem greiningin valdi fer í svarreitinn. Hún sendist ALDREI sjálf (kbSjalfvirkt, lib),
    // og drögin eru þá greinin en ekki hún: lærdómurinn sleppir þeim (`greinDrog`).
    const grein = kbVistudDrog(g, auka);
    if (grein) return Object.assign(g, { svar: drogUrGrein(grein, t.nafn), greinDrog: grein.id, model: MODEL });
    // Það sem hún hefur lært: setningar sem Aron tekur alltaf út. Þjónninn fjarlægir þær, líkanið sér þær
    // aldrei. Það sem var tekið er skráð (`fjarlaegt`), annars sæi lærdómurinn ekki lengur að Aron vill
    // það burt og stíllinn þurrkaðist út á mánuði (rýnin 22.9).
    const h = hreinsaDrogUt(g.svar, still);
    g.svar = h.texti;
    if (h.fjarlaegt.length) g.fjarlaegt = h.fjarlaegt.slice(0, 10).map((s) => String(s).slice(0, 200));
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
    + '<p style="color:#999;font-size:12px;margin-top:22px">' + _esc(persona('sigrun').undirskrift) + ' · hjalp@karp.is · svaraðu þessum pósti ef eitthvað er óljóst</p>';
  const r = await sendGmail(env, { to: t.netfang, subject, html, replyTo: ADMIN_TO(env) });
  await logMsg(env, t.id, { dir: 'out', sent_by: sentBy || 'aron', fra: ADMIN_TO(env), til: t.netfang, efni: subject, texti, meta: r });
  if (r.ok) await setTicket(env, t.id, svarUppfaersla(t.stada, _nowSek()));   // ekki aftur í 'svarad' úr cto/tillaga/samthykkt/…
  return r;
}

/** Innri tilkynning á hjalp@ (= pósthólf Arons) með greiningu og hlekk á /stjorn/. */
async function notifyIntern(env, t, g, auto) {
  const link = 'https://karp.is/stjorn/#ticket-' + t.id;
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:600px">'
    + '<h3 style="color:#8a5e00;margin:0 0 10px">🎫 Ticket #' + t.id + ' — ' + _esc(t.efni || '') + '</h3>'
    + '<p style="margin:4px 0"><b>' + _esc(t.nafn || '—') + '</b> &lt;' + _esc(t.netfang) + '&gt; · ' + _esc(t.flokkur || 'Annað') + ' · uppruni: ' + _esc(t.uppruni || 'form') + '</p>'
    + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px;margin:14px 0">' + _esc(t.lysing) + '</p>'
    + '<p style="margin:12px 0;padding:10px 12px;background:#faf6ea;border-radius:8px"><b>🛟 Greining Sigrúnar (þjónustufulltrúi, AI):</b> ' + _esc(g.tegund) + ' · forgangur ' + g.forgangur
    + (g.samantekt ? '<br>' + _esc(g.samantekt) : '')
    + (auto ? '<br><b>Sjálfvirkt svar sent:</b> KB „' + _esc(auto.id) + '"' : (g.svar ? '<br><b>Svar-tillaga bíður þín</b>' : ''))
    + (g.cto_brief ? '<br><b>CTO-brief:</b> ' + _esc(g.cto_brief).slice(0, 600) : '') + '</p>'
    + '<p><a href="' + link + '" style="background:#8a5e00;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Opna á /stjorn/</a></p>'
    + '<p style="color:#999;font-size:12px;margin-top:18px">' + _esc(persona('sigrun').undirskrift) + ' · hjalp@karp.is</p></div>';
  return sendGmail(env, { to: ADMIN_TO(env), replyTo: t.netfang, subject: '[Hjálp #' + t.id + '] ' + (g.tegund || '') + ' · ' + (t.efni || '').slice(0, 60), html });
}

/** Allt flæðið eftir að ticket er til: greining → staðfesting → KB-svar eða bið → innri tilkynning. */
export async function processNewTicket(env, t) {
  const off = await _rofiOff(env);
  const th = off ? null : await sigrunThekking(env);
  const g = off ? Object.assign({ samantekt: '', svar: '', cto_brief: '', kb: null, model: 'off' }, flokkaFallback(t.flokkur, t.lysing)) : await greinaTicket(env, t, th.auka, th.still);
  await setTicket(env, t.id, { tegund: g.tegund, forgangur: g.forgangur, ai_greining: JSON.stringify(g).slice(0, 6000) });
  let auto = null;
  if (!off) {
    await sendAck(env, t);
    auto = kbSjalfvirkt(g);   // aðeins greinar í kóðanum sendast sjálfar; vistuð grein er komin í drögin
    // Endar á „Bestu kveðjur,“ — sendSvar bætir undirskrift Sigrúnar við í fótinn (annars nafnið tvisvar í sama pósti).
    if (auto) await sendSvar(env, t, 'Sæl/Sæll' + (t.nafn ? ' ' + t.nafn.split(' ')[0] : '') + ',\n\n' + auto.svar + '\n\nBestu kveðjur,', 'agent');
    else await setTicket(env, t.id, { stada: 'stadfest' });
  }
  await notifyIntern(env, t, g, auto);
  return { g, auto: auto ? auto.id : null, off };
}

/** Atburðir sem rofi starfsmanns stöðvar. ⚠ `cto_merge` er VÍSVITANDI ekki hér: það er merge á tillögu
 *  sem liggur þegar fyrir og krefst innskráðrar lotu Arons (ákvörðun skráð 14.9, negld með prófi). Rofinn
 *  ver gegn því að agent vinni upp á sitt eindæmi, ekki gegn Aroni sjálfum. */
const _ROFI_ATBURDIR = { cto: 'rofi_hrafn', markadsefni: 'rofi_bjarki' };

/** repository_dispatch á KARP-2.0. Hvort atburður stöðvast fer eftir kortinu `_ROFI_ATBURDIR` fyrir ofan —
 *  alhæft svo enginn kallstaður (hjalp_agent.mjs, markadsefni.mjs, …) geti gleymt gátuninni sem sértilvik.
 *  ⚠ `cto_merge` er VÍSVITANDI EKKI í kortinu: það er merge á tillögu sem liggur þegar fyrir og krefst
 *  innskráðrar lotu Arons (`samthykkja` hafnar X-Admin-Key). Rofinn ver gegn því að agentinn vinni upp á
 *  sitt eindæmi, ekki gegn Aroni sjálfum. */
export async function _ghDispatch(env, eventType, payload) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  const rofiL = _ROFI_ATBURDIR[eventType];
  if (rofiL && await _rofiA(env, rofiL)) return { ok: false, error: 'rofi' };
  const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  }).catch(() => null);
  return { ok: !!(r && r.status === 204), status: r ? r.status : 0 };
}
const _CTO_PR_RE = /^https:\/\/github\.com\/aronheidar\/KARP-2\.0\/pull\/\d+$/;

async function _baetaNotu(env, t, n) {
  await setTicket(env, t.id, { notur: ((t.notur ? t.notur + '\n' : '') + '[' + new Date().toISOString().slice(0, 16) + '] ' + n).slice(-6000) });
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
      const msgs = await env.TENGSL.prepare('SELECT id, ts, dir, sent_by, fra, til, efni, texti, meta FROM ticket_msgs WHERE ticket_id=? ORDER BY ts, id').bind(id).all().catch(() => ({ results: [] }));
      return _ajson({ ok: true, ticket: t, msgs: msgs.results || [] });
    }
    const opin = url.searchParams.get('allir') ? '' : ' WHERE stada IN (' + OPNAR_STODUR.map(() => '?').join(',') + ')';
    const rows = await env.TENGSL.prepare('SELECT id, created, updated, uppruni, nafn, netfang, flokkur, tegund, forgangur, efni, stada, ack_sent, svar_sent, cto_pr FROM tickets' + opin + ' ORDER BY forgangur, created DESC LIMIT 200').bind(...(opin ? OPNAR_STODUR : [])).all().catch(() => ({ results: [] }));
    const off = await _rofiOff(env);
    return _ajson({ ok: true, tickets: rows.results || [], off });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }   // kökulotu-leið: same-origin + JSON
  const b = (await request.json().catch(() => null)) || {};
  const action = String(b.action || '');
  if (action === 'rofi') {
    // Sjálfgefið Sigrún: eldri kallendur (og vistuð bókamerki) sendu engan starfsmann.
    const lykill = rofiLykill(b.starfsmadur ? String(b.starfsmadur) : 'sigrun');
    if (!lykill) return _ajson({ ok: false, error: 'starfsmadur' });
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated').bind(lykill, b.off ? '1' : '0', _nowSek()).run().catch(() => {});
    return _ajson({ ok: true, lykill, off: !!b.off });
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
  // 🙋 Sigrún sem starfsmaður — aðgerðir án einnar miðatölu, svo þær koma á undan id-gátinni.
  //    ⚠ AÐEINS kökulota Arons, ALDREI X-Admin-Key (sama vörn og samthykkja). Rýnin 21.9: CTO-keyrslan
  //    (cto.yml) ber lykilinn og les texta sem NOTENDUR skrifuðu. Miði með innskotnum fyrirmælum mætti
  //    ekki geta lokað 50 miðum án smells eða eytt Claude-kvóta á spjall. Enginn þjónn kallar þessar.
  //    Hjálpargreinarnar bætast í sama hóp: vistuð grein fer inn í greiningar-promptið og í svarreit
  //    Arons, og innskotinn texti í miða má aldrei geta skrifað hana. Sama vörn er á /api/admin/sync
  //    (stjornbord.mjs): lykilleiðin þar skrifar aðeins rekstrar-samantektina.
  if (['sigrun_vika', 'sigrun_tillaga', 'sigrun_spjall', 'loka_margt', 'sigrun_vikupostur',
    'sigrun_kb_leita', 'sigrun_grein_drog', 'sigrun_grein_vista', 'sigrun_grein_hafna', 'sigrun_grein_eyda'].includes(action)) {
    if (byKey) return _ajson({ ok: false, error: 'lota' });
    if (action === 'sigrun_vika') {
      // Vikan og það sem hún lærði í henni. Lærdómurinn má bregðast án þess að vikan falli.
      const r = await sigrunVika(env, Number(b.fra), Number(b.til));
      if (r.ok) {
        const l = await sigrunLaerdomur(env, Number(b.fra), Number(b.til)).catch(() => null);
        if (l && l.ok) r.laerdomur = l.laerdomur;
        r.still = (await sigrunThekking(env)).still;
      }
      return _ajson(r);
    }
    if (action === 'sigrun_tillaga') return _ajson(await sigrunTillaga(env));
    if (action === 'sigrun_spjall') return _ajson(await sigrunSpjall(env, b));
    if (action === 'sigrun_vikupostur') return _ajson(await sigrunVikupostur(env, ticketsOverview, { thvinga: true }));
    if (action === 'sigrun_kb_leita') return _ajson(await sigrunKbLeita(env));
    if (action === 'sigrun_grein_drog') return _ajson(await sigrunGreinDrog(env, b));
    if (action === 'sigrun_grein_vista') return _ajson(await sigrunGreinVista(env, b));
    if (action === 'sigrun_grein_hafna') return _ajson(await sigrunGreinHafna(env, b));
    if (action === 'sigrun_grein_eyda') return _ajson(await sigrunGreinEyda(env, b));
    return _ajson(await lokaMargt(env, b, setTicket));
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
    // atburður aðeins ef staðan BREYTIST: endurlokun lokaðs miða færði annars atburðinn í nýja viku
    if ((s === 'lokad' || s === 'hafnad') && t.stada !== s) await skraAtburd(env, s, id);
    return _ajson({ ok: true });
  }
  if (action === 'greina') {
    // Endurkeyra AI-greiningu á til ticket — sendir ENGAN póst (nýtist í prófunum og þegar módel/prompt breytist).
    const th = await sigrunThekking(env);
    const g = await greinaTicket(env, t, th.auka, th.still);
    await setTicket(env, id, { tegund: g.tegund, forgangur: g.forgangur, ai_greining: JSON.stringify(g).slice(0, 6000) });
    return _ajson({ ok: true, greining: g });
  }
  if (action === 'nota') {
    await _baetaNotu(env, t, String(b.texti || '').trim().slice(0, 2000));
    return _ajson({ ok: true });
  }
  if (action === 'cto') {
    // Lykillinn gildir fyrir ÞESSA beiðni í 2 klst: vél líkansins sækir beiðnina með honum (cto_lykill.mjs),
    // svo textinn fari aldrei um opinbera keyrsluskrá. Farmurinn prentast hvergi. Staðan fer FYRST á 'cto':
    // lykillinn virkar aðeins meðan hún er þar, og vélin má ekki koma að beiðninni á undan henni.
    await setTicket(env, id, { stada: 'cto' });
    const r = await _ghDispatch(env, 'cto', { ticket: t.id, lykill: await ctoLykill(env, t.id) });
    if (!r.ok) await setTicket(env, id, { stada: t.stada });
    else if (t.stada !== 'cto') await skraAtburd(env, 'cto', id);
    return _ajson(r);
  }
  if (action === 'samthykkja') {
    // Samþykki Arons á CTO-tillögu = merge + deploy + lokapóstur — allt í cto_merge.yml (GitHub Actions bíður deploysins,
    // worker getur það ekki). Krefst INNSKRÁÐRAR admin-lotu eins og atkvæði í Moot: X-Admin-Key má lesa og skrá en
    // ekki taka ákvörðun um kóða í framleiðslu. Staðan verður 'samthykkt' þótt dispatch bregðist (merge þá handvirkt).
    if (byKey) return _ajson({ ok: false, error: 'lota' });
    if (!_CTO_PR_RE.test(String(t.cto_pr || ''))) return _ajson({ ok: false, error: 'engin_pr' });
    if (!OPNAR_STODUR.includes(t.stada)) return _ajson({ ok: false, error: 'stada' });
    await setTicket(env, id, { stada: 'samthykkt', samthykkt_by: uid, samthykkt_at: _nowSek() });
    const d = await _ghDispatch(env, 'cto_merge', { ticket: t.id, pr: t.cto_pr });
    await _baetaNotu(env, t, d.ok ? 'Samþykkt — merge+deploy ræst (cto_merge) á ' + t.cto_pr : 'Samþykkt en cto_merge fór EKKI af stað (' + (d.error || d.status) + ') — merge-a PR handvirkt');
    return _ajson({ ok: true, merge: d });
  }
  if (action === 'cto_result') {
    // Frá CTO-workflow (X-Admin-Key): PR-slóð + samantekt → staða 'tillaga' og Aron fær póst.
    // Tillagan að svari og hali loggsins komu BEINT frá keyrslunni (/api/cto/drog), ekki um opinbera skrá.
    const drog = await ctoDrogTaka(env, id);
    const grunnur = String(b.samantekt || '');
    const samantekt = (grunnur + (drog && drog.svar ? '\n\n## Tillaga að svari\n' + String(drog.svar) : '')
      + (drog && drog.hali && /skilaði engri samantekt|Engin samantekt/.test(grunnur) ? '\n\n## Lok keyrslunnar\n' + String(drog.hali).slice(-600) : '')).slice(0, 4000);
    await setTicket(env, id, { stada: 'tillaga', cto_pr: String(b.pr || '').slice(0, 300), cto_branch: String(b.branch || '').slice(0, 120), cto_samantekt: samantekt });
    ctx.waitUntil(sendGmail(env, { to: ADMIN_TO(env), subject: '[Hjálp #' + id + '] CTO-tillaga tilbúin', html: '<p>Tillaga að lagfæringu fyrir ticket #' + id + ' (' + _esc(t.efni || '') + '):</p><p style="white-space:pre-wrap">' + _esc(samantekt) + '</p><p><a href="' + _esc(String(b.pr || '')) + '">Skoða PR</a> · <a href="https://karp.is/stjorn/#ticket-' + id + '">Samþykkja á /stjorn/</a></p>' }));
    return _ajson({ ok: true });
  }
  if (action === 'lagad') {
    // Lagfæring komin í loftið (webhook/CTO): notandi fær lokapóst, ticket lokað.
    await setTicket(env, id, { stada: 'lagad' });
    const r = await sendSvar(env, Object.assign({}, t, { efni: t.efni }), 'Sæl/Sæll' + (t.nafn ? ' ' + t.nafn.split(' ')[0] : '') + ',\n\nmálið sem þú bentir okkur á (#' + id + ') hefur verið lagað og breytingin er komin í loftið á karp.is. Takk fyrir að láta vita — það hjálpar okkur að gera vefinn betri.\n\nBestu kveðjur,', 'agent');
    await setTicket(env, id, { stada: 'lokad' });
    await skraAtburd(env, 'lokad', id);
    return _ajson({ ok: r.ok });
  }
  return _ajson({ ok: false, error: 'action' });
}

/** Samantekt fyrir /api/admin/overview → /stjorn/-spjöld. */
export async function ticketsOverview(env) {
  // lysing sótt AÐEINS til að reikna fundarmenn (Moot-forsýn á /stjorn/) og hvort Sigrún þurfi Aron á
  // beiðninni — fer EKKI í svarið (listinn er léttur, og lýsingin er persónuupplýsingar).
  // ⚠ json_valid á undan json_extract: ai_greining er klippt á 6000 stafi við vistun, svo löng greining
  //   getur verið BROTIÐ JSON — og json_extract á brotnu JSON fellir ALLA fyrirspurnina, ekki bara röðina.
  const jx = (p) => "CASE WHEN json_valid(t.ai_greining) THEN json_extract(t.ai_greining,'" + p + "') END";
  const rows = await env.TENGSL.prepare('SELECT t.id, t.created, t.updated, t.uppruni, t.nafn, t.netfang, t.flokkur, t.tegund, t.forgangur, t.efni, t.lysing, t.stada, t.ack_sent, t.svar_sent, t.cto_pr, '
    + jx('$.model') + ' AS g_model, ' + jx('$.kb.id') + ' AS g_kb, ' + jx('$.kb.vissa') + ' AS g_vissa, '
    // nýjustu skilaboð notanda, AÐEINS þar sem beiðnin bíður okkar: CASE sleppir undirfyrirspurninni á hinum
    + "CASE WHEN t.stada IN ('nytt','stadfest') THEN (SELECT substr(m.texti, 1, 1500) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir='in' ORDER BY m.ts DESC, m.id DESC LIMIT 1) END AS sidastaInn "
    + 'FROM tickets t ORDER BY t.created DESC LIMIT 60').all().catch(() => null);
  const th = await sigrunThekking(env);
  const kb = kbAllt(th.auka);
  // ⚠ Rýnin 22.9: bilun hér varð að tómum lista og vikupósturinn sagði „Engin er opin núna" með
  //   beiðni um endurgreiðslu í bið. `villa` segir kallandanum að listinn sé EKKI tómur heldur ólesinn.
  const lesVilla = !rows;
  const radir = (rows && rows.results) || [];
  const list = radir.map((t) => {
    const o = Object.assign({}, t, { fundarmenn: veljaFundarmenn(t.tegund || 'annad', (t.efni || '') + ' ' + (t.lysing || '')) });
    const h = thurfHjalp(t, { listi: radir, kb });
    if (h) o.hjalp = h;
    for (const k of ['lysing', 'sidastaInn', 'g_model', 'g_kb', 'g_vissa']) delete o[k];
    return o;
  });
  const by = {}; for (const t of list) by[t.stada] = (by[t.stada] || 0) + 1;
  const off = await _rofiOff(env);
  const opnar = ' AND t.stada IN (' + OPNAR_STODUR.map(() => '?').join(',') + ')';
  // 🏛️ moot_bida: OPIÐ ticket sem á Moot-niðurstöðu (sent_by='moot') án nýrra atkvæðis Arons (sent_by='aron') — EIN fyrirspurn.
  //   Síað á OPNAR_STODUR svo talan „N mál bíða atkvæðis“ og dropdown-inn (sama sía) stangist ekki á.
  const mtb = await env.TENGSL.prepare("SELECT m.ticket_id, MAX(CASE WHEN m.sent_by='moot' THEN m.ts END) t_moot, MAX(CASE WHEN m.sent_by='aron' THEN m.ts END) t_atkv FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='moot'" + opnar + ' GROUP BY m.ticket_id').bind(...OPNAR_STODUR).all().catch(() => ({ results: [] }));
  const moot_bida = (mtb.results || []).filter((x) => x.t_moot && (!x.t_atkv || x.t_atkv < x.t_moot)).map((x) => x.ticket_id);
  // ✉ moot_osent: Aron sagði Já við svara/meira (drög opnuð) en ekkert svar hefur farið síðan (svar_sent < atkvæði) — „samþykkt en ósent“.
  const mto = await env.TENGSL.prepare("SELECT m.ticket_id, m.ts, m.meta, t.svar_sent FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='moot' AND m.sent_by='aron'" + opnar + ' ORDER BY m.ts DESC, m.id DESC').bind(...OPNAR_STODUR).all().catch(() => ({ results: [] }));
  const osentSeen = new Set(), moot_osent = [];
  for (const x of (mto.results || [])) {
    if (osentSeen.has(x.ticket_id)) continue;   // aðeins NÝJASTA atkvæði per ticket ræður
    osentSeen.add(x.ticket_id);
    let meta = null; try { meta = JSON.parse(x.meta || 'null'); } catch (e) { meta = null; }
    if (!meta || meta.atkvaedi !== 'ja' || !['svara', 'meira'].includes(meta.adgerd)) continue;
    if (!x.svar_sent || Number(x.svar_sent) < Number(x.ts)) moot_osent.push(x.ticket_id);
  }
  // „Leyst án þín": mál sem fékk EFNISLEGT svar (svar_sent er aðeins sett af sendSvar) og Aron skrifaði
  // ekkert í. ⚠ Ekki telja dir='out' AND sent_by='agent' — sjálfvirka STAÐFESTINGIN ber sömu merkingu og
  // fer á hvert einasta mál, svo sú talning hefði nánast jafngilt heildarfjölda beiðna.
  const sjalfv = await env.TENGSL.prepare(
    "SELECT COUNT(*) n FROM tickets t WHERE t.svar_sent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir='out' AND m.sent_by='aron')",
  ).first().catch(() => null);
  // 🛑 Rofa-staðan hvers starfsmanns (spjöldin þurfa að vita hvort slökkt sé) — EIN fyrirspurn fyrir báða
  // lykla. Eins og allar hinar hér má hún aldrei fella yfirlitið þótt hún bregðist (t.d. töfluleysi).
  const rofaRadir = await env.TENGSL.prepare("SELECT k, v FROM stjorn_sync WHERE k IN ('hjalp_agent_off','rofi_hrafn')").all().catch(() => ({ results: [] }));
  const rofar = {}; for (const r of (rofaRadir.results || [])) rofar[r.k] = String(r.v) === '1';
  // 📚 Þekkingarsafnið hennar: vistaðar greinar (Aron getur eytt) og tillögur að nýjum. Sama lestur og
  //    greiningin notar, sótt einu sinni ofar í fallinu.
  const kb_greinar = th.auka.map((k) => ({ id: k.id, um: k.um, svar: k.svar, vistad: k.vistad }));
  return Object.assign({ list, open: list.filter((t) => OPNAR_STODUR.includes(t.stada)).length, by, off, moot_bida, moot_osent, sjalfvirk: Number(sjalfv && sjalfv.n) || 0, rofar, kb_greinar, kb_tillogur: th.tillogur },
    lesVilla ? { villa: 'd1' } : {});
}
