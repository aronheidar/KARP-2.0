// gmail_intake.mjs (worker) — I/O-hlutinn af innlestri pósts sem berst BEINT á hjalp@karp.is:
// Gmail-API → þáttun (../lib/gmail_intake.mjs) → nýtt ticket (processNewTicket: staðfesting + greining)
// eða ný lína í fyrirliggjandi þræði. Keyrir á 3-tíma cron og handvirkt af /stjorn/ („📥 Sækja póst").
//
// ⚠ ÞRJÁR LYKKJUVARNIR — hver ein sem bregst framkallar endalausa staðfestingar-keðju:
//   (1) leitarstrengurinn útilokar -from:hjalp@ og -from:noreply@ (okkar eigin sendingar + WP-tilkynningar)
//   (2) erEiginn() hafnar sama netfangi í kóðanum þótt leitin skili því samt
//   (3) gmail_msgid er lyklað í BÁÐUM töflum (tickets UNIQUE + ticket_msgs) → sami póstur aldrei tvílesinn
// ⚠ SJÁLFVIRK SVÖR (fjarvistir, póstlistar, mailer-daemon) eru sleppt — erSjalfvirkur().
// ⚠ Lesheimild: `gmail.send` ein dugir EKKI. Vanti hana skilar Gmail 403 og við skilum error:'scope'
//   með skilaboðum Google — það er merkið um að Aron þurfi einskiptis-samþykki, ekki þögul bilun.
import { _ajson, _esc, _gmailToken, sendGmail } from './felag.mjs';
import { adminCsrfVilla, createTicket, logMsg, processNewTicket, setTicket } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { parseTicketNr } from '../lib/hjalp_agent.mjs';
import { erEiginn, erSjalfvirkur, gmailLeit, hausaMap, hreinsaTilvitnun, netfangUrFra, textiUrPayload } from '../lib/gmail_intake.mjs';

const _giNow = () => Math.floor(Date.now() / 1000);
const _giHjalp = (env) => env.HJALP_TO || 'hjalp@karp.is';
/** Netföng sem við sendum SJÁLF frá — GMAIL_FROM er á forminu „Karp <hjalp@karp.is>". */
function _giEigin(env) {
  const fra = netfangUrFra(env.GMAIL_FROM || '').netfang;
  return [...new Set([_giHjalp(env), 'noreply@karp.is', fra].filter(Boolean).map((e) => e.toLowerCase()))];
}
/** Stöður þar sem nýr póstur frá notanda þýðir að málið þarf athygli aftur. CTO-pípan (cto/tillaga/samthykkt)
 *  er EKKI opnuð aftur — hún er í gangi og staðan þar segir hvar málið stendur. */
const GI_ENDURVAKNAR = ['svarad', 'lagad', 'lokad', 'hafnad'];

async function _giAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

async function _giGet(env, slod, tok) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + slod, {
    headers: { authorization: 'Bearer ' + tok },
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, d: null };
  const d = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, d };
}

/** Hefur þessi Gmail-póstur ÞEGAR verið lesinn inn? Lyklað í báðum töflum (ticket = fyrsta erindi, msg = svör). */
async function _giThekkt(env, msgid) {
  const a = await env.TENGSL.prepare('SELECT id FROM tickets WHERE gmail_msgid=?').bind(msgid).first().catch(() => null);
  if (a) return true;
  const b = await env.TENGSL.prepare('SELECT id FROM ticket_msgs WHERE gmail_msgid=?').bind(msgid).first().catch(() => null);
  return !!b;
}

/** Innri tilkynning þegar notandi SVARAR fyrirliggjandi máli — ekkert sjálfvirkt svar fer til baka
 *  (annars gætu tvö kerfi svarað hvort öðru); Aron sér nýju línuna á /stjorn/. */
async function _giTilkynnaSvar(env, t, nafn, netfang, texti) {
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:600px">'
    + '<h3 style="color:#8a5e00;margin:0 0 10px">📥 Nýtt svar við #' + t.id + ' — ' + _esc(t.efni || '') + '</h3>'
    + '<p style="margin:4px 0"><b>' + _esc(nafn || '—') + '</b> &lt;' + _esc(netfang) + '&gt; · fyrri staða: ' + _esc(t.stada) + '</p>'
    + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px;margin:14px 0">' + _esc(String(texti).slice(0, 2000)) + '</p>'
    + '<p><a href="https://karp.is/stjorn/#ticket-' + t.id + '" style="background:#8a5e00;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Opna á /stjorn/</a></p></div>';
  return sendGmail(env, { to: _giHjalp(env), replyTo: netfang, subject: '[Hjálp #' + t.id + '] Nýtt svar frá ' + (nafn || netfang), html });
}

/** Sækir ólesin erindi á hjalp@ og skráir þau. Skilar talningu + lista yfir hvað varð um hvern póst. */
export async function gmailIntake(env, { dagar = 7, max = 10, nyjarMax = 5 } = {}) {
  if (!env.TENGSL) return { ok: false, error: 'db' };
  const tok = await _gmailToken(env);
  if (!tok) return { ok: false, error: 'token' };   // GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN vantar
  const eigin = _giEigin(env);
  const leit = gmailLeit({ netfang: _giHjalp(env), dagar, eigin });
  const listi = await _giGet(env, 'messages?maxResults=' + Math.max(1, Math.min(50, max)) + '&q=' + encodeURIComponent(leit), tok);
  if (!listi.ok) {
    const msg = String((listi.d && listi.d.error && listi.d.error.message) || '').slice(0, 300);
    // 403 = tokeninn hefur AÐEINS send-heimild → Aron þarf að samþykkja gmail.readonly einu sinni.
    return { ok: false, error: listi.status === 403 ? 'scope' : 'gmail', status: listi.status, skilabod: msg, leit };
  }
  const mal = [];
  let ny = 0, svor = 0;
  // Elsti fyrst: Gmail skilar nýjustu efst, en erindin eiga að raðast í tímaröð í D1.
  for (const m of ((listi.d && listi.d.messages) || []).slice().reverse()) {
    if (!m || !m.id) continue;
    if (await _giThekkt(env, m.id)) { mal.push({ id: m.id, hvad: 'thekkt' }); continue; }
    if (ny >= nyjarMax) { mal.push({ id: m.id, hvad: 'bidur_naestu_lotu' }); continue; }
    const g = await _giGet(env, 'messages/' + m.id + '?format=full', tok);
    if (!g.ok || !g.d) { mal.push({ id: m.id, hvad: 'villa', status: g.status }); continue; }
    const h = hausaMap(g.d.payload);
    const { nafn, netfang } = netfangUrFra(h.from);
    if (!netfang) { mal.push({ id: m.id, hvad: 'ekkert_netfang' }); continue; }
    if (erEiginn(netfang, eigin)) { mal.push({ id: m.id, hvad: 'eigin_postur' }); continue; }
    if (erSjalfvirkur(h)) { mal.push({ id: m.id, hvad: 'sjalfvirkur' }); continue; }
    const efni = String(h.subject || '').trim().slice(0, 160);
    const texti = hreinsaTilvitnun(textiUrPayload(g.d.payload)) || String(g.d.snippet || '').trim();
    if (texti.length < 2) { mal.push({ id: m.id, hvad: 'tomur' }); continue; }

    // Svar við fyrirliggjandi máli? [Karp #N] í efnislínu OG sama netfang og á ticketinu.
    // ⚠ Netfangs-gátin er vörn: hver sem er getur skrifað „[Karp #3]" í efnislínu og annars lent í þræði
    //   annars notanda. Stemmi það ekki verður til NÝTT erindi (ekkert týnist).
    const nr = parseTicketNr(efni);
    const t = nr ? await env.TENGSL.prepare('SELECT * FROM tickets WHERE id=?').bind(nr).first().catch(() => null) : null;
    if (t && String(t.netfang || '').toLowerCase() === netfang) {
      await logMsg(env, t.id, { dir: 'in', sent_by: 'notandi', fra: netfang, til: _giHjalp(env), efni, texti, gmail_msgid: m.id });
      if (GI_ENDURVAKNAR.includes(t.stada)) await setTicket(env, t.id, { stada: 'stadfest' });
      await _giTilkynnaSvar(env, t, nafn, netfang, texti);
      svor++; mal.push({ id: m.id, hvad: 'svar', ticket: t.id });
      continue;
    }
    const nyr = await createTicket(env, {
      uppruni: 'gmail', nafn, netfang, efni, lysing: texti,
      gmail_thread: g.d.threadId || null, gmail_msgid: m.id,
    });
    if (!nyr || !nyr.id) { mal.push({ id: m.id, hvad: 'vistun_brast' }); continue; }
    await processNewTicket(env, nyr).catch(() => null);   // greining + staðfesting + innri tilkynning
    ny++; mal.push({ id: m.id, hvad: 'nytt', ticket: nyr.id, stemmdi_ekki: nr ? nr : undefined });
  }
  return { ok: true, skodud: ((listi.d && listi.d.messages) || []).length, ny, svor, mal };
}

/** Cron-/hnappa-umgjörð: keyrir innlestur, geymir síðustu niðurstöðu í stjorn_sync (sést á /stjorn/)
 *  og ver gegn því að tveir smellir (eða cron ofan í smell) lesi sama hólf samtímis. */
export async function gmailIntakeCron(env, { dagar = 2, max = 10, thvinga = false } = {}) {
  if (!env.TENGSL) return { ok: false, error: 'db' };
  const fyrri = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='gmail_intake'").first().catch(() => null);
  if (!thvinga && fyrri && Number(fyrri.updated) > _giNow() - 60) {
    let sidast = null; try { sidast = JSON.parse(fyrri.v); } catch (e) { sidast = null; }
    return { ok: true, bid: true, sidast };
  }
  const r = await gmailIntake(env, { dagar, max }).catch((e) => ({ ok: false, error: 'villa', skilabod: String((e && e.message) || e).slice(0, 200) }));
  const skra = { ts: _giNow(), ok: !!r.ok, ny: r.ny || 0, svor: r.svor || 0, skodud: r.skodud || 0, error: r.error || null, skilabod: r.skilabod || null };
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('gmail_intake', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
    .bind(JSON.stringify(skra).slice(0, 2000), _giNow()).run().catch(() => {});
  return r;
}

/** /api/admin/gmail — GET: síðasta keyrsla · POST {dagar?, max?}: sækja núna.
 *  Auth: admin-lota EÐA X-Admin-Key (cron-jafngildi; aðgerðin skapar engin óafturkræf áhrif utan pósthólfsins). */
export async function adminGmailHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _giAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });
  if (request.method === 'GET') {
    const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='gmail_intake'").first().catch(() => null);
    let sidast = null; try { sidast = r ? JSON.parse(r.v) : null; } catch (e) { sidast = null; }
    return _ajson({ ok: true, sidast, uppfaert: r ? Number(r.updated) : null });
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  const r = await gmailIntakeCron(env, { dagar: Math.max(1, Math.min(30, parseInt(b.dagar, 10) || 7)), max: Math.max(1, Math.min(50, parseInt(b.max, 10) || 10)) });
  return _ajson(r);
}
