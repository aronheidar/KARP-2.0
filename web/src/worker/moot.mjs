// moot.mjs (worker) — MOOT: ráðsfundur persónanna (Sigrún, Hrafn, Elín, Bjarki, Unnur, Kári, Hildur, Egill) um EITT
// ticket. Kári stýrir, þau sem eiga við taka til máls, Kári dregur saman tillögu + atkvæði; Aron greiðir lokaatkvæði
// á /stjorn/. Hrein rökfræði (prompt, þáttun, þak, kostnaður) er í ../lib/moot_logic.mjs (prófuð) — hér er aðeins I/O.
//
// GAGNALÍKAN: engin ný tafla — allt í ticket_msgs (0015) með dir='moot' um logMsg():
//   sent_by=<persónu-id>  innlegg, meta {moot, rod}           · sent_by='moot'      niðurstaða Kára, meta {moot, fundarmenn, nidurstada, model, usage, usd, ms, stada_tha}
//   sent_by='moot_fall'   kall kostaði en gaf ekkert nothæft   · sent_by='aron'      atkvæði Arons, meta {moot, atkvaedi, adgerd, texti, fylgdi_tillogu, by, stada_tha}
// ÖRYGGI: Moot breytir ALDREI tickets.stada, sendir ALDREI póst, kallar ALDREI processNewTicket/sendSvar/_dispatchCto.
// Eina hliðarverkunin er ticket_msgs-raðir (+ tickets.updated um logMsg) og stjorn_sync 'moot_dagur' (dagteljari).
// 'atkvaedi' krefst innskráðrar admin-lotu (X-Admin-Key hafnað) — UI keyrir svo fyrirliggjandi /api/admin/ticket-aðgerð.
// Kökulotu-POST fer um adminCsrfVilla (Sec-Fetch-Site/Origin/content-type) — X-Admin-Key-leiðin ekki (skriptur, CI).
// KOSTNAÐARÞAK: 1 Moot/ticket/klst (mistök telja), dagþak MOOT_DAG_MAX, max_tokens 3500, thinking slökkt, EITT kall
// (+ EITT Haiku-fall við 404/429/5xx/529). Neyðarrofinn hjalp_agent_off snertir Moot ekki (sendir engan póst).
// SAMHLIÐA: þökin eru TEKIN FRÁ áður en fetch fer af stað — lás-lykill stjorn_sync 'moot_lock_<id>' (INSERT … ON CONFLICT
// … WHERE v < nú-bil, meta.changes=0 → 'bid') og dagteljari n+1 strax; tvö samtímis 'halda' kosta því EITT kall.
// VISTUN: skrifist niðurstöðuröðin ekki (logMsg.ok=false) skilar halda error 'vistun' — aldrei fundargerð sem hvergi er til.
// MINNI: fyrri niðurstaða + afstaða Arons (Nei-rökstuðningur) fara í <samhengi> næsta fundar (mootFyrriLina).
// CI-GÁTT (ci_worker_bindings): öll column-0 nöfn hér eru forskeytt MOOT_/_moot nema útfluttu handler-nöfnin;
// staðbundnar breytur heita mt* svo þær rekist ekki á nafnarými annarra worker-skráa.
import { logMsg, adminCsrfVilla } from './hjalp_agent.mjs';
import { _ajson } from './felag.mjs';
import { readSession } from './auth.mjs';
import { PERSONA_IDS, MOOT_ADGERDIR, veljaFundarmenn } from '../lib/personur.mjs';
import { mootAfmarka, mootPrompt, mootUser, parseMoot, mootKostnadur, mootRateOk } from '../lib/moot_logic.mjs';
export { mootAfmarka, mootPrompt, mootUser, parseMoot, mootKostnadur, mootRateOk };

const MOOT_MODEL = (env) => env.MOOT_MODEL || 'claude-sonnet-5';
const MOOT_MODEL_FALL = (env) => env.MOOT_MODEL_FALL || 'claude-haiku-4-5-20251001';
const MOOT_DAG_MAX = (env) => parseInt(env.MOOT_DAG_MAX, 10) || 25;
const MOOT_BIL_SEK = (env) => parseInt(env.MOOT_BIL_SEK, 10) || 3600;
const MOOT_FALL_STATUS = [404, 429, 500, 502, 503, 529];   // fyrsta kall bregst svona → EINN endurtekningur á Haiku
const MOOT_API = 'https://api.anthropic.com/v1/messages';
const _mootNow = () => Math.floor(Date.now() / 1000);

/** Admin-lota → uid, annars 0 (afrit af _isAdminUid-mynstrinu í hjalp_agent.mjs). */
async function _mootAdminUid(env, request) {
  const mtUid = await readSession(env, request);
  if (!mtUid || !env.TENGSL) return 0;
  const mtRow = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(mtUid).first().catch(() => null);
  return (mtRow && mtRow.is_admin === 1) ? mtUid : 0;
}

/** Dagteljari úr stjorn_sync k='moot_dagur' → {d, n, usd}; nýr UTC-dagur → n=0. */
async function _mootDagLesa(env) {
  const mtRow = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='moot_dagur'").first().catch(() => null);
  let mtDag = {};
  try { mtDag = JSON.parse((mtRow && mtRow.v) || '{}') || {}; } catch (e) { mtDag = {}; }
  const mtDagur = new Date().toISOString().slice(0, 10);
  if (mtDag.d !== mtDagur) mtDag = { d: mtDagur, n: 0, usd: 0 };
  return { d: mtDag.d, n: Number(mtDag.n) || 0, usd: Number(mtDag.usd) || 0 };
}

/** Skrifar dagteljarann: n = mtDag.n + mtInc, usd += mtUsd — sama INSERT … ON CONFLICT-mynstur og 'hjalp_agent_off'.
 *  Kallað TVISVAR per Moot: (1) mtInc=1 STRAX eftir gátun (taka frá áður en fetch fer af stað) · (2) mtInc=0 með kostnaði eftir kall. */
async function _mootDagSkrifa(env, mtDag, mtUsd, mtInc) {
  mtDag.n = (Number(mtDag.n) || 0) + (Number(mtInc) || 0);
  mtDag.usd = +((Number(mtDag.usd) || 0) + (Number(mtUsd) || 0)).toFixed(6);
  const mtV = JSON.stringify({ d: mtDag.d, n: mtDag.n, usd: mtDag.usd });
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('moot_dagur', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated").bind(mtV, _mootNow()).run().catch(() => {});
}

/** Klukkustundar-LÁS per ticket, tekinn ÁÐUR en Claude-kallið fer (check-then-act-gatið var 20–80 s):
 *  stjorn_sync k='moot_lock_<id>', v=ts. INSERT … ON CONFLICT DO UPDATE … WHERE gamla v < nú−bil → meta.changes=1 = lásinn er okkar;
 *  0 = annar Moot um sama ticket er í gangi eða var haldinn innan bilsins → 'bid'. Bilar D1 (undefined meta) → leyft (þakið MAX(ts) stendur). */
async function _mootLas(env, mtTicketId, mtNow, mtBil) {
  const mtR = await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated WHERE CAST(stjorn_sync.v AS INTEGER) < ?')
    .bind('moot_lock_' + mtTicketId, String(mtNow), mtNow, mtNow - mtBil).run().catch(() => null);
  if (!mtR || !mtR.meta || typeof mtR.meta.changes !== 'number') return true;
  return mtR.meta.changes > 0;
}

/** Kallið kostaði en skilaði ekki nothæfu → EIN 'moot_fall'-röð + kostnaður á dagteljara (n var talið fyrir kallið). */
async function _mootFall(env, mtTicketId, mtMoot, mtDag, mtMeta) {
  await logMsg(env, mtTicketId, { dir: 'moot', sent_by: 'moot_fall', efni: 'Moot féll', texti: 'Moot féll: ' + mtMeta.error, meta: Object.assign({ moot: mtMoot }, mtMeta) });
  await _mootDagSkrifa(env, mtDag, mtMeta.usage ? mootKostnadur(mtMeta.usage, mtMeta.model) : 0, 0);
}

/** EITT fetch á api.anthropic.com (+ EITT Haiku-fall). ENGIN temperature/top_p/top_k, enginn prefill, ekkert
 *  output_config (Sonnet 5 → 400). Haiku 4.5 tekur ekki thinking:{type:'disabled'} → lykillinn fjarlægður í falli. */
async function _mootKalla(env, mtSystem, mtUser) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'lykill' };
  const mtHeaders = { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
  const mtBody = { model: MOOT_MODEL(env), max_tokens: 3500, thinking: { type: 'disabled' }, system: mtSystem, messages: [{ role: 'user', content: mtUser }] };
  const mtPost = (mtB, mtTimeout) => fetch(MOOT_API, { method: 'POST', headers: mtHeaders, body: JSON.stringify(mtB), signal: AbortSignal.timeout(mtTimeout) })
    .catch(() => ({ ok: false, status: 0, _timi: true }));
  let mtRes = await mtPost(mtBody, 55000);
  if (mtRes._timi) return { ok: false, error: 'timi', model: mtBody.model };
  if (!mtRes.ok) {
    if (!MOOT_FALL_STATUS.includes(mtRes.status)) return { ok: false, error: 'ai ' + mtRes.status, model: mtBody.model };
    delete mtBody.thinking;
    mtBody.model = MOOT_MODEL_FALL(env);
    mtRes = await mtPost(mtBody, 30000);
    if (mtRes._timi) return { ok: false, error: 'timi', model: mtBody.model };
    if (!mtRes.ok) return { ok: false, error: 'ai ' + mtRes.status, model: mtBody.model };
  }
  const mtJson = await mtRes.json().catch(() => null);
  if (!mtJson || typeof mtJson !== 'object') return { ok: false, error: 'ai json', model: mtBody.model };
  const mtText = (Array.isArray(mtJson.content) ? mtJson.content : []).map((mtB) => (mtB && mtB.text) || '').join('');
  const mtUsage = { in: (mtJson.usage && mtJson.usage.input_tokens) | 0, out: (mtJson.usage && mtJson.usage.output_tokens) | 0 };
  return { ok: true, text: mtText, model: mtJson.model || mtBody.model, usage: mtUsage, stop: mtJson.stop_reason || null };
}

/** Les allar dir='moot'-raðir ticketsins, hópar á meta.moot og skilar NÝJASTA fundinum (sá sem á 'moot'- eða
 *  'moot_fall'-röð). Skemmd meta-röð → sleppt. Raðir persóna án niðurstöðu = hálfnaður fundur, birtast ekki. */
async function _mootLesa(env, mtTicketId) {
  const mtRaw = await env.TENGSL.prepare("SELECT id, ts, sent_by, texti, meta FROM ticket_msgs WHERE ticket_id=? AND dir='moot' ORDER BY ts, id").bind(mtTicketId).all().catch(() => ({ results: [] }));
  const mtRows = [];
  for (const mtR of (mtRaw.results || [])) {
    let mtMeta = null;
    try { mtMeta = JSON.parse(mtR.meta || 'null'); } catch (e) { mtMeta = null; }
    if (!mtMeta || typeof mtMeta !== 'object' || !(Number(mtMeta.moot) > 0)) continue;
    mtRows.push({ id: Number(mtR.id) || 0, ts: Number(mtR.ts) || 0, sent_by: String(mtR.sent_by || ''), texti: mtR.texti, meta: mtMeta, moot: Number(mtMeta.moot) });
  }
  let mtM = null, mtLastTs = 0;
  for (const mtR of mtRows) {
    if (mtR.sent_by !== 'moot' && mtR.sent_by !== 'moot_fall') continue;
    if (mtM === null || mtR.moot > mtM) mtM = mtR.moot;
    if (mtR.ts > mtLastTs) mtLastTs = mtR.ts;
  }
  const mtOut = { moot: mtM, ts: null, fundarmenn: [], innlegg: [], nidurstada: null, fall: null, atkvaedi_arons: null, fyrri: new Set(mtRows.map((mtR) => mtR.moot)).size, lastTs: mtLastTs, model: null, usage: null, usd: null, ms: null, stada_tha: null };
  if (mtM === null) return mtOut;
  const mtMine = mtRows.filter((mtR) => mtR.moot === mtM);
  const mtNid = mtMine.find((mtR) => mtR.sent_by === 'moot');
  const mtFallRow = mtMine.find((mtR) => mtR.sent_by === 'moot_fall');
  const mtAtkv = mtMine.find((mtR) => mtR.sent_by === 'aron');
  mtOut.ts = mtNid ? mtNid.ts : (mtFallRow ? mtFallRow.ts : null);
  mtOut.innlegg = mtMine.filter((mtR) => PERSONA_IDS.includes(mtR.sent_by))
    .sort((mtA, mtB) => ((Number(mtA.meta.rod) || 0) - (Number(mtB.meta.rod) || 0)) || (mtA.id - mtB.id))
    .map((mtR) => ({ persona: mtR.sent_by, texti: mtR.texti }));
  if (mtNid) {
    mtOut.fundarmenn = Array.isArray(mtNid.meta.fundarmenn) ? mtNid.meta.fundarmenn : [];
    mtOut.nidurstada = (mtNid.meta.nidurstada && typeof mtNid.meta.nidurstada === 'object') ? mtNid.meta.nidurstada : null;
    mtOut.model = mtNid.meta.model || null;
    mtOut.usage = (mtNid.meta.usage && typeof mtNid.meta.usage === 'object') ? mtNid.meta.usage : null;   // „N/M tókar“ líka í sögulegri skoðun
    mtOut.usd = mtNid.meta.usd ?? null;
    mtOut.ms = mtNid.meta.ms ?? null;
    mtOut.stada_tha = mtNid.meta.stada_tha || null;
  }
  if (mtFallRow) mtOut.fall = { error: mtFallRow.meta.error || 'fall', ts: mtFallRow.ts };
  if (mtAtkv) mtOut.atkvaedi_arons = { val: mtAtkv.meta.atkvaedi, adgerd: mtAtkv.meta.adgerd, texti: mtAtkv.meta.texti || '', ts: mtAtkv.ts, fylgdi_tillogu: !!mtAtkv.meta.fylgdi_tillogu };
  return mtOut;
}

/** Verkbeiðni Hrafns úr nýjasta Moot, fyrir CTO-keyrsluna: AÐEINS þegar niðurstaðan ber cto_brief og Aron
 *  sagði Já. Annars tómur strengur. Sama regla og cto.yml beitti áður á /api/admin/moot-svarið. */
export async function mootVerkbeidni(env, mtId) {
  const mtL = await _mootLesa(env, mtId);
  const mtB = mtL && mtL.nidurstada && typeof mtL.nidurstada.cto_brief === 'string' ? mtL.nidurstada.cto_brief.trim() : '';
  return mtB && mtL.atkvaedi_arons && mtL.atkvaedi_arons.val === 'ja' ? mtB.slice(0, 4000) : '';
}

/** Svar-snið GET og 'halda' (sama form): nýjasti Moot + bið-staða + hnappamerkimiðar. */
function _mootSvar(env, mtId, mtL, mtTicket) {
  return {
    ok: true, id: mtId, stada: mtTicket ? mtTicket.stada : null,
    moot: mtL.moot, ts: mtL.ts, fundarmenn: mtL.fundarmenn, innlegg: mtL.innlegg, nidurstada: mtL.nidurstada, fall: mtL.fall,
    atkvaedi_arons: mtL.atkvaedi_arons, fyrri: mtL.fyrri, model: mtL.model, usage: mtL.usage, usd: mtL.usd, ms: mtL.ms, stada_tha: mtL.stada_tha,
    bid: { ok: mootRateOk(mtL.lastTs, _mootNow(), MOOT_BIL_SEK(env)), naest: mtL.lastTs ? mtL.lastTs + MOOT_BIL_SEK(env) : null },
    adgerdir: MOOT_ADGERDIR,
  };
}

/** Heldur EINN Moot um ticket (full röð úr tickets). Skref: klst-þak → dagþak → lykill → LÁS+dagteljari (tekið frá) →
 *  gagnapakki (m/ fyrri Moot) → EITT kall → þáttun → vistun (innlegg í röð, svo niðurstaða) → kostnaður. Ticket-staða ÓBREYTT. */
export async function haldaMoot(env, ticket) {
  const mtT0 = Date.now();
  const mtNow = _mootNow();
  const mtBil = MOOT_BIL_SEK(env);
  const mtLast = await env.TENGSL.prepare("SELECT MAX(ts) ts FROM ticket_msgs WHERE ticket_id=? AND dir='moot' AND sent_by IN ('moot','moot_fall')").bind(ticket.id).first().catch(() => null);
  const mtLastTs = Number(mtLast && mtLast.ts) || 0;
  if (!mootRateOk(mtLastTs, mtNow, mtBil)) return { ok: false, error: 'bid', sidast: mtLastTs, naest: mtLastTs + mtBil };
  const mtDag = await _mootDagLesa(env);
  if (mtDag.n >= MOOT_DAG_MAX(env)) return { ok: false, error: 'dagthak', n: mtDag.n, max: MOOT_DAG_MAX(env) };
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'lykill' };   // ENGIN röð skrifuð — kostaði ekkert
  // TAKA FRÁ áður en fetch fer af stað: lásinn per ticket (samhliða 'halda' → eitt kall) og dagteljarinn n+1.
  if (!(await _mootLas(env, ticket.id, mtNow, mtBil))) return { ok: false, error: 'bid', sidast: mtLastTs || mtNow, naest: (mtLastTs || mtNow) + mtBil };
  await _mootDagSkrifa(env, mtDag, 0, 1);

  // Gagnapakki — PII-lágmarkaður í mootUser (fornafn, efni, lýsing, síðustu 6 in/out, greining, nótur; ENGIN netfang/kt).
  const mtMsgsRaw = await env.TENGSL.prepare("SELECT ts, dir, sent_by, texti FROM ticket_msgs WHERE ticket_id=? AND dir IN ('in','out') ORDER BY ts DESC, id DESC LIMIT 6").bind(ticket.id).all().catch(() => ({ results: [] }));
  const mtMsgs = (mtMsgsRaw.results || []).slice().reverse();
  let mtG = {};
  try { mtG = JSON.parse(ticket.ai_greining || '{}') || {}; } catch (e) { mtG = {}; }
  const mtFundarmenn = veljaFundarmenn(ticket.tegund || mtG.tegund || 'annad', (ticket.efni || '') + ' ' + (ticket.lysing || ''));
  // MINNI: fyrri niðurstaða + afstaða Arons (Nei-rökstuðningur) → <samhengi> (mootFyrriLina) — ráðið endurtekur ekki tillögu sem Aron hafnaði.
  const mtFyrri = await _mootLesa(env, ticket.id);

  const mtKall = await _mootKalla(env, mootPrompt(mtFundarmenn), mootUser(ticket, mtG, mtMsgs, mtFundarmenn, mtFyrri));
  const mtMs = Date.now() - mtT0;
  if (!mtKall.ok) {
    if (mtKall.error === 'lykill') return { ok: false, error: 'lykill' };
    await _mootFall(env, ticket.id, mtNow, mtDag, { error: mtKall.error, usage: mtKall.usage || null, model: mtKall.model || null, ms: mtMs });
    return { ok: false, error: mtKall.error, moot: mtNow };
  }
  const mtDiag = [];
  const mtParsed = parseMoot(mtKall.text, mtFundarmenn, mtDiag);
  if (!mtParsed) {
    const mtErr = mtKall.stop === 'max_tokens' ? 'max_tokens' : 'parse';
    // raw allt að 2000 + ástæða gátunar (mtDiag) — fyrsta live-Moot féll á „parse" með 400 stöfum af raw og engri ástæðu; ógreinanlegt.
    await _mootFall(env, ticket.id, mtNow, mtDag, { error: mtErr, astaeda: mtDiag.join('; ').slice(0, 300), raw: String(mtKall.text || '').slice(0, 2000), stop: mtKall.stop, usage: mtKall.usage, model: mtKall.model, ms: mtMs, fundarmenn: mtFundarmenn });
    return { ok: false, error: mtErr, astaeda: mtDiag.join('; ').slice(0, 300), moot: mtNow };
  }

  for (let mtI = 0; mtI < mtParsed.innlegg.length; mtI++) {
    await logMsg(env, ticket.id, { dir: 'moot', sent_by: mtParsed.innlegg[mtI].persona, efni: 'Moot ' + mtNow, texti: mtParsed.innlegg[mtI].texti, meta: { moot: mtNow, rod: mtI } });
  }
  const mtUsd = mootKostnadur(mtKall.usage, mtKall.model);
  const mtNid = await logMsg(env, ticket.id, { dir: 'moot', sent_by: 'moot', efni: 'Niðurstaða Moot', texti: mtParsed.nidurstada.tillaga, meta: { moot: mtNow, fundarmenn: mtFundarmenn, nidurstada: mtParsed.nidurstada, model: mtKall.model, usage: mtKall.usage, usd: mtUsd, ms: mtMs, stada_tha: ticket.stada } });
  await _mootDagSkrifa(env, mtDag, mtUsd, 0);
  // Niðurstöðuröðin skrifaðist EKKI (D1 lestrarþak/7403 gleypt í logMsg) → engin fundargerð er til að kjósa um; UI má ekki sýna fund sem hvergi er.
  if (!mtNid.ok) return { ok: false, error: 'vistun', moot: mtNow, usage: mtKall.usage, usd: mtUsd };
  // ts = það sem RAUNVERULEGA skrifaðist (kallið tók 20–80 s) — klst-þakið mælir MAX(ts) raðanna, svo „Næst kl.“ er samkvæmt þjóninum.
  return { ok: true, moot: mtNow, ts: mtNid.ts, fundarmenn: mtFundarmenn, innlegg: mtParsed.innlegg, nidurstada: mtParsed.nidurstada, fall: null, atkvaedi_arons: null, fyrri: (Number(mtFyrri.fyrri) || 0) + 1, stada_tha: ticket.stada, model: mtKall.model, usage: mtKall.usage, usd: mtUsd, ms: mtMs, bid: { ok: false, naest: mtNid.ts + mtBil } };
}

/** /api/admin/moot — GET ?id=N (nýjasti Moot) · POST {action:'halda'|'atkvaedi', id, val?, texti?}.
 *  Auth: admin-lota EÐA X-Admin-Key; 'atkvaedi' krefst lotu (aðeins innskráður admin kýs). */
export async function adminMootHandler(request, env, ctx) {
  const mtKey = request.headers.get('X-Admin-Key');
  const mtByKey = !!(mtKey && env.ADMIN_API_KEY && mtKey === env.ADMIN_API_KEY);
  const mtUid = mtByKey ? 0 : await _mootAdminUid(env, request);
  if (!mtByKey && !mtUid) return _ajson({ ok: false, error: 'admin' });
  if (request.method === 'GET') {
    const mtUrl = new URL(request.url);
    const mtId = parseInt(mtUrl.searchParams.get('id') || '', 10);
    if (!mtId) return _ajson({ ok: false, error: 'id' });
    const mtTicket = await env.TENGSL.prepare('SELECT id, stada FROM tickets WHERE id=?').bind(mtId).first().catch(() => null);
    if (!mtTicket) return _ajson({ ok: false, error: 'notfound' });
    return _ajson(_mootSvar(env, mtId, await _mootLesa(env, mtId), mtTicket));
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  // Kökulotu-leið (ekki X-Admin-Key): same-origin + application/json — karp_session er Domain=.karp.is svo systkina-undirlén
  // (wp.karp.is) eru same-site; 'halda' er GJALDFÆRT kall og 'atkvaedi' fölsuð aron-röð sem læsir rétta atkvæðið úti ('kosid').
  if (!mtByKey) { const mtCsrf = adminCsrfVilla(request); if (mtCsrf) return _ajson({ ok: false, error: mtCsrf }); }
  const mtBody = (await request.json().catch(() => null)) || {};
  const mtAction = String(mtBody.action || '');
  const mtId = parseInt(mtBody.id, 10);
  if (!mtId) return _ajson({ ok: false, error: 'id' });
  const mtTicket = await env.TENGSL.prepare('SELECT * FROM tickets WHERE id=?').bind(mtId).first().catch(() => null);
  if (!mtTicket) return _ajson({ ok: false, error: 'notfound' });
  if (mtAction === 'halda') {
    const mtR = await haldaMoot(env, mtTicket);
    return _ajson(Object.assign({ id: mtId, stada: mtTicket.stada, adgerdir: MOOT_ADGERDIR }, mtR));
  }
  if (mtAction === 'atkvaedi') {
    if (!mtUid) return _ajson({ ok: false, error: 'lota' });   // X-Admin-Key HAFNAÐ — Aron kýs sjálfur, innskráður
    const mtVal = String(mtBody.val || '');
    if (mtVal !== 'ja' && mtVal !== 'nei') return _ajson({ ok: false, error: 'val' });
    const mtL = await _mootLesa(env, mtId);
    if (!mtL.nidurstada) return _ajson({ ok: false, error: 'engin_nidurstada' });
    if (mtL.atkvaedi_arons) return _ajson({ ok: false, error: 'kosid' });
    const mtAdgerd = mtL.nidurstada.adgerd;
    const mtTexti = String(mtBody.texti || '').trim().slice(0, 500);
    await logMsg(env, mtId, {
      dir: 'moot', sent_by: 'aron', efni: 'Atkvæði Moot',
      texti: mtVal === 'ja' ? 'Já — ' + (MOOT_ADGERDIR[mtAdgerd] || mtAdgerd) : 'Nei' + (mtTexti ? ' — ' + mtTexti : ''),
      meta: { moot: mtL.moot, atkvaedi: mtVal, adgerd: mtAdgerd, texti: mtTexti, fylgdi_tillogu: mtVal === 'ja', by: mtUid, stada_tha: mtTicket.stada },
    });
    // BREYTIR EKKI tickets.stada — UI keyrir fyrirliggjandi /api/admin/ticket-aðgerð (svara/cto/stada) eftir adgerd.
    return _ajson({ ok: true, moot: mtL.moot, val: mtVal, adgerd: mtAdgerd, fylgdi_tillogu: mtVal === 'ja', breytt_stada: !!(mtL.stada_tha && mtL.stada_tha !== mtTicket.stada) });
  }
  return _ajson({ ok: false, error: 'action' });
}
