// tickets.mjs — 🎫 Þjónustuborðs-agentarnir (12.9.2026). Flæðið:
//
//   notandi (/hjalp/) → hjalpHandler (worker.js) sendir póst á hjalp@ EINS OG ÁÐUR
//     → ticketIntake: D1-röð + ÞJÓNUSTUFULLTRÚI (Haiku) svarar notanda og flokkar erindið
//     → tæknileg mál: repository_dispatch 'ticket-cto' → CTO-AGENT (Opus, cto.yml) rannsakar
//       repo-ið, leggur til lagfæringu á grein ticket/<id> og skilar á /api/ticket/tillaga
//     → stjórnandi fær póst með já/nei-hlekkjum (HMAC á SESSION_SECRET, einnota gegnum stöðu)
//     → já: repository_dispatch 'ticket-merge' (ticket-merge.yml) sameinar við main
//     → /api/ticket/lagad: þjónustufulltrúinn tilkynnir notandanum að málið sé leyst.
//
// Hönnun: docs/superpowers/specs/2026-09-12-hjalp-agentar-design.md
// Mjúk föll: án ANTHROPIC_API_KEY eða tickets-töflunnar hegðar /api/hjalp sér nákvæmlega eins
// og áður (aðeins póstur á hjalp@). Án GITHUB_DISPATCH_TOKEN stoppar flæðið í 'mottekid' —
// notandinn fékk samt móttökusvar og manneskjan alla beiðnina í pósti.
// CI-endapunktar (gogn/tillaga/lagad) auðkenna með env.KARP_TICKET_SECRET í haus x-karp-lykill.

import { _emailTpl, _esc, _hmac, _tokenHex, sendGmail, sjson } from './felag.mjs';
import { renderEmail } from '../lib/emails.mjs';

const REPO = 'aronheidar/KARP-2.0';
export const TICKET_STODUR = ['nytt', 'mottekid', 'cto', 'tillaga', 'greint', 'samthykkt', 'hafnad', 'lagad', 'villa'];

// Flokkarnir sem MEGA fara sjálfkrafa til CTO-agentsins. Greiðslur & innskráning fara ALLTAF
// til manneskju (peningar og aðgangsmál eru ábyrgðarmál, ekki sjálfvirknimál) — módelið fær
// ekki að ákveða annað: ákvörðun þess er gátuð hér, ekki treyst.
export const TICKET_FLOKKAR_CTO = ['Villa í gögnum', 'Leiðrétting', 'Annað'];
export const leidGuard = (flokkur, leid) => (TICKET_FLOKKAR_CTO.includes(String(flokkur)) && String(leid) === 'cto' ? 'cto' : 'madur');

/** JSON úr AI-svari: þolir ```json-girðingar og texta í kringum hlutinn. null ef ónothæft. */
export function parseAiJson(s) {
  const t = String(s == null ? '' : s).replace(/```json|```/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(t.slice(a, b + 1));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (e) { return null; }
}

/** Já/nei-hlekkir stjórnanda — HMAC bundið við ticket+aðgerð; einnota gegnum stöðu-gátun. */
export async function afgreidsluHlekkir(env, origin, id) {
  const mk = async (a) => origin + '/api/ticket/afgreidsla?id=' + encodeURIComponent(id) + '&a=' + a + '&t=' + encodeURIComponent(await _hmac(env, 'ticket|' + id + '|' + a));
  return { ja: await mk('patcha'), nei: await mk('hafna') };
}

const nyttId = () => 'K-' + _tokenHex().slice(0, 6).toUpperCase();
const now = () => new Date().toISOString();
const ciOk = (request, env) => !!(env.KARP_TICKET_SECRET && request.headers.get('x-karp-lykill') === env.KARP_TICKET_SECRET);

async function tGet(env, id) {
  try { return await env.TENGSL.prepare('SELECT * FROM tickets WHERE id=?').bind(id).first(); } catch (e) { return null; }
}

async function tSet(env, id, fields, atburdur) {
  const t = await tGet(env, id);
  if (!t) return null;
  let atb = [];
  try { atb = JSON.parse(t.atburdir || '[]'); } catch (e) {}
  if (atburdur) atb.push({ t: now(), a: atburdur });
  const f = { ...fields, updated: now(), atburdir: JSON.stringify(atb.slice(-40)) };
  const keys = Object.keys(f);
  try {
    await env.TENGSL.prepare('UPDATE tickets SET ' + keys.map((k) => k + '=?').join(',') + ' WHERE id=?')
      .bind(...keys.map((k) => f[k]), id).run();
  } catch (e) { return null; }
  return { ...t, ...f };
}

async function dispatch(env, type, payload) {
  if (!env.GITHUB_DISPATCH_TOKEN) return false;
  try {
    const r = await fetch('https://api.github.com/repos/' + REPO + '/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: type, client_payload: payload }),
    });
    return r.status === 204;
  } catch (e) { return false; }
}

// ── Þjónustufulltrúinn (Haiku — ódýrt módel, þröngt hlutverk) ────────────────────────────────
// Skilar EINGÖNGU JSON; svarið er móttökukvittun, ekki loforð. Sama grunnregla og annars staðar
// í Karp: ekkert skáldað, engin loforð um tíma eða niðurstöðu, heiðarlegt um að þetta sé vél.
const FULLTRUI_SYS = 'Þú ert sjálfvirkur þjónustufulltrúi á karp.is, íslenskum gagna- og hagvísavef. Þér berst hjálparbeiðni af /hjalp/-forminu. Skilaðu EINGÖNGU gildum JSON-hlut, engum öðrum texta:\n'
  + '{"svar": "...", "leid": "cto"|"madur", "verkbeining": "..."}\n'
  + '- svar: 2–4 setningar á íslensku til notandans: staðfestu móttöku, endursegðu erindið í EINNI setningu svo notandinn sjái að það var skilið, og segðu hvað gerist næst (tæknileg mál: „málið fer beint í tæknirýni"; önnur mál: „starfsmaður les erindið og svarar á netfangið þitt"). ALDREI lofa niðurstöðu eða tímasetningu, ALDREI fullyrða neitt um vefinn sem ekki stendur í beiðninni, engin skáldskapur.\n'
  + '- leid: "cto" AÐEINS ef erindið lýsir líklegri villu eða rangindum í gögnum/virkni vefjarins sem lagfæring í kóða eða gögnum gæti leyst. Allt annað (greiðslur, áskrift, innskráning, almennar spurningar, óskýrt erindi, beiðni um manneskju): "madur".\n'
  + '- verkbeining: aðeins þegar leid="cto" — hnitmiðuð verklýsing fyrir tæknimann á íslensku: hvað virðist bilað, á hvaða síðu/gagnasetti, og hvernig má sannreyna það. Annars tómur strengur.';

async function fulltrui(env, id) {
  const t = await tGet(env, id);
  if (!t || t.stada !== 'nytt') return;
  let svar = '', leid = 'madur', verkbeining = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.KARP_FULLTRUI_MODEL || 'claude-haiku-4-5',
        max_tokens: 1000,
        system: FULLTRUI_SYS,
        messages: [{ role: 'user', content: 'Flokkur: ' + t.flokkur + '\nNafn: ' + t.nafn + '\nInnskráð(ur): ' + (t.innskraning ? 'já' : 'nei') + '\nSíða: ' + (t.fra || '—') + '\n\nErindi:\n' + t.lysing }],
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const o = parseAiJson((j.content || []).map((b) => b.text || '').join(''));
      if (o) {
        svar = String(o.svar || '').slice(0, 1200);
        leid = leidGuard(t.flokkur, o.leid);
        verkbeining = leid === 'cto' ? String(o.verkbeining || '').slice(0, 2000) : '';
      }
    }
  } catch (e) {}
  // AI brást → heiðarlegt sjálfgefið svar (sniðmátstexti, sama mynstur og fréttavélin)
  if (!svar) svar = 'Erindið þitt er móttekið og komið í farveg hjá okkur. Starfsmaður les öll erindi og svarað verður á netfangið þitt.';
  const sentCto = leid === 'cto' && await dispatch(env, 'ticket-cto', { id });
  await tSet(env, id, { svar, leid, verkbeining, stada: sentCto ? 'cto' : 'mottekid' },
    sentCto ? 'þjónustufulltrúi svaraði · sent á CTO-agent' : 'þjónustufulltrúi svaraði · bíður manneskju');
  const tpl = await _emailTpl(env, 'ticket_mottaka');
  await sendGmail(env, {
    to: t.netfang, replyTo: env.HJALP_TO || 'hjalp@karp.is',
    subject: renderEmail(tpl.subject, { ticket: id }),
    html: renderEmail(tpl.html, { ticket: id, nafn: _esc(t.nafn), svar: _esc(svar).replace(/\n/g, '<br>') }),
  });
}

/** Kallað úr hjalpHandler EFTIR gátun og póstsendingu. Skilar málsnúmeri strax (AI keyrir í waitUntil). */
export async function ticketIntake(env, ctx, { nafn, netfang, flokkur, lysing, innskraning, fra }) {
  if (!env.TENGSL || !env.ANTHROPIC_API_KEY || env.TICKETS_OFF === '1') return null;
  const id = nyttId(), t = now();
  try {
    await env.TENGSL.prepare('INSERT INTO tickets (id,created,nafn,netfang,flokkur,lysing,innskraning,fra,stada,atburdir) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, t, nafn, netfang, flokkur, lysing, innskraning ? 1 : 0, String(fra || '').slice(0, 300), 'nytt', JSON.stringify([{ t, a: 'stofnað af /hjalp/' }])).run();
  } catch (e) { return null; }   // taflan ekki til (migration óhlaupin) → mjúkt fall í gamla ferlið
  ctx.waitUntil(fulltrui(env, id).catch(() => {}));
  return id;
}

// ── CI-endapunktar (cto.yml + ticket-merge.yml) ──────────────────────────────────────────────

/** GET /api/ticket/gogn?id=K-XXXXXX — CTO-workflow sækir ticketið (PII fer aðeins í CI-skrá, ekki logg). */
export async function ticketGognHandler(request, env) {
  if (!ciOk(request, env)) return sjson({ error: 'unconfigured' }, 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  const t = await tGet(env, id);
  return t ? sjson({ ok: true, ticket: t }) : sjson({ error: 'finnst ekki' }, 404);
}

/** POST /api/ticket/tillaga — CTO-workflow skilar niðurstöðu: tillaga (patch á grein) / greint / villa. */
export async function ticketTillagaHandler(request, env, ctx) {
  if (!ciOk(request, env)) return sjson({ error: 'unconfigured' }, 401);
  let b = null;
  try { b = (await request.json()) || {}; } catch (e) { return sjson({ error: 'body' }, 400); }
  const id = String(b.id || '');
  const stada = ['tillaga', 'greint', 'villa'].includes(b.stada) ? b.stada : 'greint';
  const t = await tSet(env, id, {
    stada,
    greining: String(b.greining || '').slice(0, 6000),
    notendasvar: String(b.notendasvar || '').slice(0, 2000),
    branch: String(b.branch || '').slice(0, 120),
    diffstat: String(b.diffstat || '').slice(0, 3000),
    ahaetta: String(b.ahaetta || '').slice(0, 20),
  }, 'CTO-agent skilaði: ' + stada);
  if (!t) return sjson({ error: 'finnst ekki' }, 404);
  const til = env.HJALP_TO || 'hjalp@karp.is';
  const brHlekkur = t.branch ? 'https://github.com/' + REPO + '/compare/main...' + t.branch : '';
  if (stada === 'tillaga') {
    const h = await afgreidsluHlekkir(env, new URL(request.url).origin, id);
    const tpl = await _emailTpl(env, 'ticket_tillaga');
    await sendGmail(env, {
      to: til,
      subject: renderEmail(tpl.subject, { ticket: id, flokkur: t.flokkur }),
      html: renderEmail(tpl.html, {
        ticket: id, flokkur: _esc(t.flokkur), nafn: _esc(t.nafn), lysing: _esc(t.lysing).replace(/\n/g, '<br>'),
        greining: _esc(t.greining).replace(/\n/g, '<br>'), diffstat: _esc(t.diffstat), ahaetta: _esc(t.ahaetta || '—'),
        hlekkur_ja: h.ja, hlekkur_nei: h.nei, hlekkur_diff: brHlekkur,
      }),
    });
  } else {
    const tpl = await _emailTpl(env, stada === 'villa' ? 'ticket_villa' : 'ticket_greint');
    await sendGmail(env, {
      to: til,
      subject: renderEmail(tpl.subject, { ticket: id }),
      html: renderEmail(tpl.html, {
        ticket: id, flokkur: _esc(t.flokkur), nafn: _esc(t.nafn), lysing: _esc(t.lysing).replace(/\n/g, '<br>'),
        greining: _esc(t.greining || String(b.villa || '')).replace(/\n/g, '<br>'),
      }),
    });
  }
  return sjson({ ok: true, stada });
}

// ── Stjórnandinn: já/nei-hlekkur úr póstinum ─────────────────────────────────────────────────

const SIDA = (titill, body) => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
  + '<title>' + _esc(titill) + ' — Karp</title>'
  + '<body style="margin:0;background:#070b16;color:#eaf1fb;font-family:system-ui,Arial,sans-serif;display:grid;place-items:center;min-height:100vh">'
  + '<div style="max-width:460px;padding:32px 20px;text-align:center"><h1 style="color:#f6b13b;font-size:22px;margin:0 0 12px">' + _esc(titill) + '</h1>'
  + '<p style="line-height:1.6;color:#9fb0c8;margin:0">' + body + '</p></div>',
  { headers: { 'content-type': 'text/html; charset=utf-8' } });

/** GET /api/ticket/afgreidsla?id&a=patcha|hafna&t=HMAC — einnota gegnum stöðu-gátun ('tillaga' → …). */
export async function ticketAfgreidslaHandler(request, env, ctx) {
  const u = new URL(request.url);
  const id = u.searchParams.get('id') || '', a = u.searchParams.get('a') || '', tok = u.searchParams.get('t') || '';
  if (!['patcha', 'hafna'].includes(a)) return SIDA('Óþekkt aðgerð', 'Hlekkurinn er ekki gildur.');
  let von = '';
  try { von = await _hmac(env, 'ticket|' + id + '|' + a); } catch (e) { return SIDA('Ekki stillt', 'SESSION_SECRET vantar á workerinn.'); }
  if (tok !== von) return SIDA('Ógildur hlekkur', 'Undirskrift hlekkjarins stemmir ekki.');
  const t = await tGet(env, id);
  if (!t) return SIDA('Finnst ekki', 'Ekkert ticket með númerinu ' + _esc(id) + '.');
  if (t.stada !== 'tillaga') return SIDA('Þegar afgreitt', 'Ticket ' + _esc(id) + ' er í stöðunni „' + _esc(t.stada) + '" — hlekkurinn er einnota og hefur þegar verið notaður (eða tillagan er fallin úr gildi).');
  if (a === 'patcha') {
    const sent = await dispatch(env, 'ticket-merge', { id, branch: t.branch });
    if (!sent) return SIDA('Dispatch brást', 'Náði ekki að ræsa ticket-merge — er GITHUB_DISPATCH_TOKEN settur? Reyndu hlekkinn aftur.');
    await tSet(env, id, { stada: 'samthykkt' }, 'stjórnandi samþykkti — merge ræstur');
    return SIDA('Samþykkt ✓', 'Lagfæringin fyrir ' + _esc(id) + ' er á leið inn í main (ticket-merge keyrir prófin fyrst). Notandinn fær sjálfkrafa póst þegar sameiningin er staðfest.');
  }
  await tSet(env, id, { stada: 'hafnad' }, 'stjórnandi hafnaði tillögunni');
  return SIDA('Hafnað', 'Tillögunni fyrir ' + _esc(id) + ' var hafnað — engu var breytt. Málið er núna hjá þér: svaraðu notandanum beint (Reply-To í upphaflega hjálparpóstinum er netfangið hans). Ticket-greinin á GitHub stendur óhreyfð ef þú vilt skoða hana.');
}

/** POST /api/ticket/lagad — ticket-merge skilar lokastöðu; þjónustufulltrúinn lokar hringnum við notandann. */
export async function ticketLagadHandler(request, env, ctx) {
  if (!ciOk(request, env)) return sjson({ error: 'unconfigured' }, 401);
  let b = null;
  try { b = (await request.json()) || {}; } catch (e) { return sjson({ error: 'body' }, 400); }
  const id = String(b.id || '');
  const t = await tGet(env, id);
  if (!t) return sjson({ error: 'finnst ekki' }, 404);
  const til = env.HJALP_TO || 'hjalp@karp.is';
  if (b.ok !== true) {
    await tSet(env, id, { stada: 'villa' }, 'merge/próf brást');
    const tpl = await _emailTpl(env, 'ticket_villa');
    await sendGmail(env, {
      to: til, subject: renderEmail(tpl.subject, { ticket: id }),
      html: renderEmail(tpl.html, { ticket: id, flokkur: _esc(t.flokkur), nafn: _esc(t.nafn), lysing: _esc(t.lysing).replace(/\n/g, '<br>'), greining: _esc(String(b.villa || 'merge/próf féllu — sjá Actions-logg')).replace(/\n/g, '<br>') }),
    });
    return sjson({ ok: true, stada: 'villa' });
  }
  await tSet(env, id, { stada: 'lagad' }, 'sameinað við main — notanda tilkynnt');
  const svar = t.notendasvar || 'Villan sem þú bentir á hefur verið lagfærð. Takk fyrir að láta okkur vita — ábendingar eins og þín gera vefinn betri.';
  const tpl = await _emailTpl(env, 'ticket_lagad');
  await sendGmail(env, {
    to: t.netfang, replyTo: til,
    subject: renderEmail(tpl.subject, { ticket: id }),
    html: renderEmail(tpl.html, { ticket: id, nafn: _esc(t.nafn), svar: _esc(svar).replace(/\n/g, '<br>') }),
  });
  // Kvittun á þjónustuborðið (innri, ekki sniðmát): hringnum er lokað.
  await sendGmail(env, { to: til, subject: '[Ticket] ' + id + ' leyst og notanda tilkynnt', text: 'Ticket ' + id + ' (' + t.flokkur + ' — ' + t.nafn + ') var sameinað við main og notandinn fékk lokasvar.\n\n' + svar });
  return sjson({ ok: true, stada: 'lagad' });
}
