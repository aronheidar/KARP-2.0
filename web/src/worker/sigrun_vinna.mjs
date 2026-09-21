// sigrun_vinna.mjs (worker) — I/O fyrir Sigrúnu sem starfsmann á /stjorn/: vikutölurnar hennar,
// tillaga hennar um að loka miðum, samtal hennar við Aron og lokun margra miða í einu.
// Rökfræðin er í ../lib/stjorn/sigrun_vinna.mjs (prófuð); hér er aðeins D1 og fetch.
// Kallað úr adminTicketHandler (hjalp_agent.mjs), sem sér um aðgang og CSRF á undan.
import { OPNAR_STODUR, fixJsonStrings } from '../lib/hjalp_agent.mjs';
import { lokunarKandidatar, vikuTolur, spjallPrompt, spjallGogn, spjallSkilabod, thattaSpjall, tillagaLid } from '../lib/stjorn/sigrun_vinna.mjs';
import { isoVika, sidastaFullaVika } from '../lib/stjorn/vika.mjs';
import { eintala } from '../lib/stjorn/vikutexti.mjs';
import { samantektLaerdoms, stillFra } from '../lib/stjorn/laerdomur.mjs';
import { KB_LAGMARK, KB_ID, kbKandidatar, klasaPrompt, klasaGogn, thattaKlasa, greinPrompt, greinGogn, thattaGrein, hreinsaGrein, kbLykill, kbUrRodum } from '../lib/stjorn/hjalpargreinar.mjs';
import { vikupostur } from '../lib/stjorn/vikupostur.mjs';
import { sendGmail } from './felag.mjs';

// Sama líkan og miðagreiningin hennar notar; env.SIGRUN_MODEL yfirtekur án þess að snerta kóða.
const MODEL = 'claude-haiku-4-5-20251001';
const _nu = () => Math.floor(Date.now() / 1000);
const TEGUNDIR_ATB = ['lokad', 'hafnad', 'cto'];
const VILLA = Symbol('d1-villa');

// ── ATBURÐASKRÁ. Lokun skráir hvorki hver lokaði né hvenær: `stada`-aðgerðin breytir aðeins
//    `tickets.stada`, og `updated` færist líka þegar nóta er skrifuð. Vikutalan „lokað" væri því
//    ágiskun. Hér er hver lokun, höfnun og afhending til Hrafns skráð með tíma, í stjorn_sync
//    (lykill `atb:<tegund>:<id>`, `updated` = tíminn) — ENGIN breyting á gagnagrunninum, og fordæmi
//    fyrir lykli á hvern miða er `moot_lock_<id>`. `atb_byrjun` geymir hvenær skráningin hófst, svo
//    vikur á undan henni noti áætlun í stað þess að sýna núll.
// ⚠ SKRÁNING MÁ ALDREI BRJÓTA AÐGERÐINA SEM HÚN SKRÁIR. Fyrsta útgáfan notaði `batch()`, sem kastar
//   SAMSTUNDIS þar sem það er ekki til — áður en `.catch` festist — og það kast kom á eftir að GitHub-
//   sendingin til Hrafns hafði þegar tekist, svo aðgerðin skilaði villu um eitthvað sem gerðist.
//   Nú: tvær stakar skipanir, allt innan try, og hvor um sig gleypir eigin villu.
export async function skraAtburd(env, tegund, id) {
  try {
    if (!env || !env.TENGSL || !TEGUNDIR_ATB.includes(tegund) || !Number.isInteger(Number(id))) return;
    const ts = _nu();
    await env.TENGSL.prepare("INSERT OR IGNORE INTO stjorn_sync (k, v, updated) VALUES ('atb_byrjun', ?, ?)").bind(String(ts), ts).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
      .bind('atb:' + tegund + ':' + Number(id), tegund, ts).run().catch(() => {});
  } catch { /* skráning er aukaatriði; aðgerðin sjálf hefur þegar tekist */ }
}

/** Opnir miðar með síðustu skilaboðum — grunnurinn að samtalinu og lokunartillögunni. */
export async function opnirMidar(env) {
  const ph = OPNAR_STODUR.map(() => '?').join(',');
  const r = await env.TENGSL.prepare(
    'SELECT t.id, t.efni, t.stada, t.tegund, t.forgangur, t.created, '
    + "(SELECT MAX(m.ts) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir IN ('in','out')) AS sidast, "
    + "(SELECT m.dir FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir IN ('in','out') ORDER BY m.ts DESC, m.id DESC LIMIT 1) AS sidastaAtt, "
    + "(SELECT substr(m.texti, 1, 300) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir='in' ORDER BY m.ts DESC, m.id DESC LIMIT 1) AS sidastaInnTexti, "
    + "(SELECT COUNT(*) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir='out' AND IFNULL(m.efni,'') NOT LIKE '%Móttekið:%') AS svorFraOkkur "
    + 'FROM tickets t WHERE t.stada IN (' + ph + ') ORDER BY t.created LIMIT 60',
  ).bind(...OPNAR_STODUR).all().catch(() => ({ results: [] }));
  return (r && r.results) || [];
}

/**
 * Vikan hennar. Reiknuð EINU SINNI þegar hún er liðin og síðan geymd: lestrarþak D1 hefur sprungið
 * áður (1.9.2026) og boot() á /stjorn/ keyrir eftir hverja aðgerð. Aðeins fullnaðar ISO-vikur.
 * ⚠ IFNULL í öllum samanburði: `NULL <> 'stjorn'` er NULL í SQL, ekki satt, og myndi þegja burt
 *   hvern miða sem ber engan uppruna.
 */
export async function sigrunVika(env, fra, til) {
  const nu = _nu();
  const v = isoVika(Number(fra));
  if (!Number.isFinite(Number(fra)) || v.fra !== Number(fra) || v.til !== Number(til) || v.til > nu) return { ok: false, error: 'vika' };
  const D = env.TENGSL;
  const lykill = 'sigrun_vika:' + v.ar + '-' + v.vika;
  const geymt = await D.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
  if (geymt && geymt.v) { try { return { ok: true, geymt: true, vika: v, tolur: JSON.parse(geymt.v) }; } catch { /* reikna aftur */ } }

  const EKKI_STJORN = "IFNULL(t.uppruni,'')<>'stjorn'";
  const EKKI_STADFESTING = "IFNULL(m.efni,'') NOT LIKE '%Móttekið:%'";   // staðfestingin er ekki svar
  const a = [v.fra, v.til];
  const q = (sql, ...b) => D.prepare(sql).bind(...b);
  const [barust, henni, aroni, svor, teg, byrjun, atb] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM tickets t WHERE t.created>=? AND t.created<? AND ' + EKKI_STJORN, ...a).first(),
    q("SELECT COUNT(DISTINCT m.ticket_id) AS n FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='out' AND m.sent_by='agent' AND m.ts>=? AND m.ts<? AND " + EKKI_STADFESTING + ' AND ' + EKKI_STJORN, ...a).first(),
    q("SELECT COUNT(DISTINCT m.ticket_id) AS n FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='out' AND m.sent_by='aron' AND m.ts>=? AND m.ts<? AND " + EKKI_STJORN, ...a).first(),
    // svartími = FYRSTA raunverulega svar hvers miða, og aðeins miðar þar sem það svar féll í vikunni
    q("SELECT t.created AS c, MIN(m.ts) AS f FROM tickets t JOIN ticket_msgs m ON m.ticket_id=t.id WHERE m.dir='out' AND " + EKKI_STADFESTING + ' AND ' + EKKI_STJORN + ' GROUP BY t.id HAVING f>=? AND f<?', ...a).all(),
    q('SELECT t.tegund AS tegund, COUNT(*) AS n FROM tickets t WHERE t.created>=? AND t.created<? AND ' + EKKI_STJORN + ' GROUP BY t.tegund', ...a).all(),
    q("SELECT updated FROM stjorn_sync WHERE k='atb_byrjun'").first(),
    q("SELECT v, COUNT(*) AS n FROM stjorn_sync WHERE k>='atb:' AND k<'atb;' AND updated>=? AND updated<? GROUP BY v", ...a).all(),
  ].map((p) => p.catch(() => VILLA)));
  // ⚠ Rýnin 21.9 sannaði: ein misheppnuð COUNT varð null → 0 og var GEYMD að eilífu (barust: 0 þegar
  //   rétt tala var 5). Nálægt lestrarþakinu falla fyrirspurnir af handahófi — einmitt þá. Nú:
  //   ef EIN fyrirspurn brást er ekkert geymt og kallandinn fær villu.
  if ([barust, henni, aroni, svor, teg, byrjun, atb].some((x) => x === VILLA)) return { ok: false, error: 'd1' };

  // Lokað/hafnað/til Hrafns: nákvæmt úr atburðaskránni ef hún náði yfir ALLA vikuna, annars áætlað
  // út frá `updated` á miðum sem standa í þeirri stöðu nú (rekst aðeins á ef miði var snertur aftur).
  const skradFra = byrjun && Number(byrjun.updated);
  const nakvaemt = !!skradFra && skradFra <= v.fra;
  let tal = { lokad: 0, hafnad: 0, cto: 0 };
  if (nakvaemt) {
    for (const r of (atb && atb.results) || []) if (r.v in tal) tal[r.v] = Number(r.n) || 0;
  } else {
    const r = await q("SELECT CASE WHEN stada IN ('cto','tillaga','samthykkt','lagad') THEN 'cto' ELSE stada END AS s, COUNT(*) AS n "
      + "FROM tickets WHERE stada IN ('lokad','hafnad','cto','tillaga','samthykkt','lagad') AND updated>=? AND updated<? GROUP BY s", ...a).all().catch(() => VILLA);
    if (r === VILLA) return { ok: false, error: 'd1' };
    for (const x of (r && r.results) || []) if (x.s in tal) tal[x.s] = Number(x.n) || 0;
  }
  const tolur = Object.assign(vikuTolur({
    barust: barust && barust.n,
    svaradHenni: henni && henni.n,
    svaradAroni: aroni && aroni.n,
    svortimar: ((svor && svor.results) || []).map((r) => Number(r.f) - Number(r.c)),
    tegundir: (teg && teg.results) || [],
    lokad: tal.lokad, hafnad: tal.hafnad, tilHrafns: tal.cto,
  }), { aaetlad: !nakvaemt });

  await D.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
    .bind(lykill, JSON.stringify(tolur), nu).run().catch(() => {});
  return { ok: true, geymt: false, vika: v, tolur };
}

/** „Taktu til" — lokunarhæfir miðar eftir föstum reglum. Enginn Claude-kall: þetta er tölvuvinna. */
export async function sigrunTillaga(env) {
  const k = lokunarKandidatar(await opnirMidar(env), _nu());
  if (!k.length) return { ok: true, svar: 'Ég sé ekkert sem má loka núna.', tillaga: null };
  return {
    ok: true,
    svar: 'Ég fann ' + k.length + ' ' + (eintala(k.length) ? 'beiðni' : 'beiðnir') + ' sem má loka. Taktu hakið af þeim sem þú vilt halda opnum.',
    tillaga: { adgerd: 'loka', midar: k.map(tillagaLid) },
  };
}

/** Samtal. Hún sér opna miða, lokunarhæfa og síðustu viku — og má aðeins leggja til númer af þeim lista. */
export async function sigrunSpjall(env, b) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'unconfigured' };
  const texti = String((b && b.texti) || '').trim().slice(0, 2000);
  if (texti.length < 2) return { ok: false, error: 'texti' };
  const nu = _nu();
  const midar = await opnirMidar(env);
  const kandidatar = lokunarKandidatar(midar, nu);
  const sv = sidastaFullaVika(nu);
  const vr = await sigrunVika(env, sv.fra, sv.til).catch(() => null);
  const ph = OPNAR_STODUR.map(() => '?').join(',');
  const alls = await env.TENGSL.prepare('SELECT COUNT(*) AS n FROM tickets WHERE stada IN (' + ph + ')').bind(...OPNAR_STODUR).first().catch(() => null);
  const gogn = spjallGogn({ midar, kandidatar, vika: vr && vr.ok ? { vika: sv.vika, tolur: vr.tolur } : null, nu, opnirAlls: alls && alls.n });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.SIGRUN_MODEL || MODEL, max_tokens: 700, system: spjallPrompt(), messages: spjallSkilabod({ saga: b && b.saga, texti, gogn }) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, error: 'ai ' + res.status };
    const j = await res.json();
    const r = thattaSpjall((j.content || []).map((x) => x.text || '').join(''), kandidatar, fixJsonStrings);
    if (!r.svar && !r.tillaga) return { ok: false, error: 'tomt' };
    return { ok: true, svar: r.svar || 'Þessar má loka.', tillaga: r.tillaga };
  } catch {
    return { ok: false, error: 'ai' };
  }
}

/**
 * Loka mörgum. Aðeins miðar sem ENN uppfylla lokunarregluna Á ÞESSARI STUNDU.
 * ⚠ Rýnin 21.9: tillagan lifir í flipanum eins lengi og hann er opinn. Ef notandi skrifar aftur á
 *   milli tillögu og smells færir póstinnlesturinn miðann í 'stadfest' — sem er lokanleg staða — og
 *   eldri útgáfa lokaði honum. Nýi pósturinn hefði horfið úr „bíður þín", því lokun sendir engan
 *   póst. Nú er reglan metin aftur og það sem hefur breyst er skilað sem sleppt.
 * setTicket gleypir villur, svo lesið er AFTUR eftir lokun og aðeins það talið sem stendur 'lokad'.
 * `vista` er setTicket úr hjalp_agent.mjs, gefið stöðubundið (CI-tengingaprófið les nöfn með mynstri).
 */
export async function lokaMargt(env, b, vista) {
  const hrein = [...new Set((Array.isArray(b && b.ids) ? b.ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!hrein.length) return { ok: false, error: 'ids' };
  const ph = hrein.map(() => '?').join(',');
  const fyrir = await env.TENGSL.prepare('SELECT id, stada, notur FROM tickets WHERE id IN (' + ph + ')').bind(...hrein).all().catch(() => null);
  const radir = (fyrir && fyrir.results) || [];
  const enn = new Set(lokunarKandidatar(await opnirMidar(env), _nu()).map((k) => k.id));
  const loka = hrein.filter((id) => enn.has(id));
  const sleppa = hrein.filter((id) => !enn.has(id));
  const stimpill = new Date().toISOString().slice(0, 16);
  for (const id of loka) {
    const t = radir.find((x) => Number(x.id) === id) || {};
    await vista(env, id, { stada: 'lokad', notur: ((t.notur ? t.notur + '\n' : '') + '[' + stimpill + '] Lokað að tillögu Sigrúnar').slice(-6000) });
  }
  const eftir = loka.length
    ? await env.TENGSL.prepare('SELECT id, stada FROM tickets WHERE id IN (' + loka.map(() => '?').join(',') + ')').bind(...loka).all().catch(() => null)
    : { results: [] };
  const lokad = ((eftir && eftir.results) || []).filter((r) => r.stada === 'lokad').map((r) => Number(r.id)).sort((x, y) => x - y);
  for (const id of lokad) await skraAtburd(env, 'lokad', id);
  const mistokst = loka.filter((id) => !lokad.includes(id));
  return { ok: true, lokad, sleppt: sleppa.concat(mistokst).sort((x, y) => x - y) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Þekking hennar: vistaðar hjálpargreinar, það sem hún hefur lært af breytingum Arons, og tillögur
// að nýjum greinum. Allt í stjorn_sync — ENGIN gagnagrunnsbreyting (D1-flutningar eru handvirkir).
//   kb:<id>              vistuð grein {um, svar, vistad, heimild}
//   sigrun_still         það sem fer inn í greiningar-promptið (lib/stjorn/laerdomur.mjs → stillFra)
//   sigrun_kb_tillogur   {ts, hopar:[{efni, ids}]} úr síðustu leit
//   sigrun_kb_lokid      númer sem Aron hefur afgreitt, svo sama tillaga komi ekki aftur
// ══════════════════════════════════════════════════════════════════════════════════════════════

const _til = (env) => env.HJALP_TO || 'hjalp@karp.is';   // pósthólf Arons; póstinnlesturinn sleppir -from:hjalp@
// ⚠ json_valid á undan json_extract: ai_greining er klippt á 6000 stafi við vistun og getur verið brotið
//   JSON, og json_extract á brotnu JSON fellir alla fyrirspurnina (sama vörn og í ticketsOverview).
const _jx = (p) => "CASE WHEN json_valid(ai_greining) THEN json_extract(ai_greining,'" + p + "') END";
const UPSERT = 'INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated';

async function _skrifaJson(env, k, gildi) {
  return env.TENGSL.prepare(UPSERT).bind(k, JSON.stringify(gildi), _nu()).run().then(() => true).catch(() => false);
}

/** Eitt D1-kall fyrir allt sem greiningin og spjaldið þurfa. Bilun → tómt, aldrei kast: án vistaðra
 *  greina sendir hún FÆRRI sjálfvirk svör, sem er örugga áttin. `villa` segir kallanda frá því. */
export async function sigrunThekking(env) {
  const tomt = { auka: [], still: null, tillogur: [], lokid: [], villa: false };
  if (!env || !env.TENGSL) return Object.assign(tomt, { villa: true });
  const r = await env.TENGSL.prepare("SELECT k, v FROM stjorn_sync WHERE (k>='kb:' AND k<'kb;') OR k IN ('sigrun_still','sigrun_kb_tillogur','sigrun_kb_lokid')")
    .all().catch(() => VILLA);
  if (r === VILLA) return Object.assign(tomt, { villa: true });
  const radir = (r && r.results) || [];
  const les = (k, sjalfgefid) => { const x = radir.find((y) => y.k === k); if (!x) return sjalfgefid; try { return JSON.parse(x.v); } catch { return sjalfgefid; } };
  const lokid = les('sigrun_kb_lokid', []);
  const t = les('sigrun_kb_tillogur', null);
  const buid = new Set(Array.isArray(lokid) ? lokid.map(Number) : []);
  return {
    auka: kbUrRodum(radir.filter((x) => String(x.k).startsWith('kb:'))),
    still: les('sigrun_still', null),
    // tillaga sem Aron hefur þegar afgreitt hverfur, líka þótt síðasta leit sé eldri en afgreiðslan
    tillogur: (t && Array.isArray(t.hopar) ? t.hopar : []).filter((h) => h && Array.isArray(h.ids) && !h.ids.some((n) => buid.has(Number(n)))),
    lokid: [...buid],
    villa: false,
  };
}

/** Claude-kall sem skilar texta eða null. Sama líkan og greiningin; env.SIGRUN_MODEL yfirtekur. */
async function _kalla(env, system, user, max) {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.SIGRUN_MODEL || MODEL, max_tokens: max, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.content || []).map((x) => x.text || '').join('');
  } catch { return null; }
}

// ── HÚN LÆRIR AF ÞÉR ─────────────────────────────────────────────────────────────────────────

/**
 * Fyrsta svar Arons á hverja beiðni á bilinu, með drögunum sem hún skrifaði. Seinni svör í sama
 * þræði svara framhaldi og eiga ekkert við upphaflegu drögin.
 * ⚠ Beiðnir þar sem Aron kaus í Moot á undan svarinu eru SLEPPTAR: þá setti ráðið sín drög í
 *   svarreitinn, og samanburður við drög Sigrúnar mældi ráðið en ekki Aron.
 */
async function laerdomsPor(env, fra, til) {
  const r = await env.TENGSL.prepare(
    'SELECT t.id AS id, t.ai_greining AS g, m.texti AS sent FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id '
    + "WHERE m.dir='out' AND m.sent_by='aron' AND m.ts>=? AND m.ts<? AND IFNULL(t.uppruni,'')<>'stjorn' "
    + "AND NOT EXISTS (SELECT 1 FROM ticket_msgs a WHERE a.ticket_id=m.ticket_id AND a.dir='out' AND a.sent_by='aron' AND (a.ts<m.ts OR (a.ts=m.ts AND a.id<m.id))) "
    + "AND NOT EXISTS (SELECT 1 FROM ticket_msgs v WHERE v.ticket_id=m.ticket_id AND v.dir='moot' AND v.sent_by='aron' AND v.ts<=m.ts) "
    + 'ORDER BY m.ts LIMIT 200',
  ).bind(fra, til).all().catch(() => VILLA);
  if (r === VILLA) return VILLA;
  const ut = [];
  for (const x of (r && r.results) || []) {
    let g = null; try { g = JSON.parse(x.g || 'null'); } catch { g = null; }
    if (!g || typeof g.svar !== 'string' || !g.svar.trim() || g.model === 'stjorn' || g.model === 'off') continue;
    ut.push({ id: Number(x.id), drog: g.svar, sent: String(x.sent || '') });
  }
  return ut;
}

/** Lærdómur fullnaðar viku — reiknaður EINU SINNI og geymdur, eins og sigrunVika. Bilun er aldrei geymd. */
export async function sigrunLaerdomur(env, fra, til) {
  const v = isoVika(Number(fra));
  if (!Number.isFinite(Number(fra)) || v.fra !== Number(fra) || v.til !== Number(til) || v.til > _nu()) return { ok: false, error: 'vika' };
  const lykill = 'sigrun_laerdomur:' + v.ar + '-' + v.vika;
  const geymt = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
  if (geymt && geymt.v) { try { return { ok: true, geymt: true, laerdomur: JSON.parse(geymt.v) }; } catch { /* reikna aftur */ } }
  const por = await laerdomsPor(env, v.fra, v.til);
  if (por === VILLA) return { ok: false, error: 'd1' };
  const laerdomur = samantektLaerdoms(por);
  await _skrifaJson(env, lykill, laerdomur);
  return { ok: true, geymt: false, laerdomur };
}

/** Síðustu 30 dagar → `sigrun_still`, sem greiningin les. Bilun skrifar EKKERT yfir fyrri stíl. */
export async function sigrunStillUppfaera(env) {
  const nu = _nu();
  const por = await laerdomsPor(env, nu - 30 * 86400, nu);
  if (por === VILLA) return VILLA;
  const still = stillFra(samantektLaerdoms(por));
  await _skrifaJson(env, 'sigrun_still', still);
  return still;
}

// ── HJÁLPARGREINAR ───────────────────────────────────────────────────────────────────────────

/** Leitar að spurningum sem hafa borist þrisvar eða oftar síðustu 60 daga. Eitt Claude-kall, og aðeins
 *  ef nógu margar beiðnir koma til greina — annars er niðurstaðan tómur listi án kalls. */
export async function sigrunKbLeita(env) {
  const th = await sigrunThekking(env);
  if (th.villa) return { ok: false, error: 'd1' };
  const nu = _nu();
  const r = await env.TENGSL.prepare(
    'SELECT id, efni, tegund, uppruni, ' + _jx('$.samantekt') + ' AS g_samantekt, ' + _jx('$.kb.id') + ' AS g_kb, '
    + _jx('$.kb.vissa') + ' AS g_vissa FROM tickets WHERE created>=? ORDER BY created DESC LIMIT 150',
  ).bind(nu - 60 * 86400).all().catch(() => VILLA);
  if (r === VILLA) return { ok: false, error: 'd1' };
  const kandidatar = kbKandidatar((r && r.results) || [], { lokid: th.lokid });
  let hopar = [];
  if (kandidatar.length >= KB_LAGMARK) {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'unconfigured' };
    const svar = await _kalla(env, klasaPrompt(), klasaGogn(kandidatar), 900);
    if (svar == null) return { ok: false, error: 'ai' };
    hopar = thattaKlasa(svar, kandidatar, fixJsonStrings);
  }
  await _skrifaJson(env, 'sigrun_kb_tillogur', { ts: nu, hopar });
  return { ok: true, hopar, skodadar: kandidatar.length };
}

/** Tillagan sem ber ÖLL umbeðin númer — annars er ekkert að skrifa. Líkanið velur aldrei hvaða miðar. */
function _tillagaMed(tillogur, ids) {
  const beidni = [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (beidni.length < KB_LAGMARK) return null;
  return (tillogur || []).find((h) => beidni.every((n) => h.ids.map(Number).includes(n))) || null;
}

/** Drög að grein upp úr svörunum sem Aron sendi á beiðnirnar í tillögunni. Vistar EKKERT. */
export async function sigrunGreinDrog(env, b) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'unconfigured' };
  const th = await sigrunThekking(env);
  if (th.villa) return { ok: false, error: 'd1' };
  const h = _tillagaMed(th.tillogur, b && b.ids);
  if (!h) return { ok: false, error: 'tillaga' };
  const ids = h.ids.map(Number).slice(0, 12);
  const ph = ids.map(() => '?').join(',');
  const [midar, svor] = await Promise.all([
    env.TENGSL.prepare('SELECT id, efni, ' + _jx('$.samantekt') + ' AS g_samantekt FROM tickets WHERE id IN (' + ph + ')').bind(...ids).all(),
    env.TENGSL.prepare("SELECT texti FROM ticket_msgs WHERE ticket_id IN (" + ph + ") AND dir='out' AND sent_by='aron' ORDER BY ts LIMIT 12").bind(...ids).all(),
  ].map((p) => p.catch(() => VILLA)));
  if (midar === VILLA || svor === VILLA) return { ok: false, error: 'd1' };
  const svorin = ((svor && svor.results) || []).map((x) => String(x.texti || '')).filter(Boolean);
  if (!svorin.length) return { ok: false, error: 'engin_svor' };   // án svara Arons hefur hún ekkert að byggja á
  const texti = await _kalla(env, greinPrompt(), greinGogn({
    efni: h.efni,
    midar: ((midar && midar.results) || []).map((m) => ({ id: m.id, texti: m.g_samantekt || m.efni })),
    svor: svorin,
  }), 900);
  if (texti == null) return { ok: false, error: 'ai' };
  const grein = thattaGrein(texti, fixJsonStrings);
  return grein ? { ok: true, grein, ids } : { ok: false, error: 'tomt' };
}

/** Aron afgreiðir tillögu: númerin fara á „lokið"-listann og tillagan hverfur. */
async function _afgreida(env, th, ids) {
  const buid = new Set(th.lokid.map(Number));
  for (const n of ids) buid.add(Number(n));
  const nytt = [...buid].slice(-1000);
  const eftir = th.tillogur.filter((h) => !h.ids.some((n) => buid.has(Number(n))));
  const a = await _skrifaJson(env, 'sigrun_kb_lokid', nytt);
  const t = await _skrifaJson(env, 'sigrun_kb_tillogur', { ts: _nu(), hopar: eftir });
  return a && t;
}

/** Aron vistar grein. Textinn er hreinsaður HÉR, óháð því hvað vafrinn sendi. */
export async function sigrunGreinVista(env, b) {
  const g = hreinsaGrein(b);
  if (!g) return { ok: false, error: 'grein' };
  const th = await sigrunThekking(env);
  if (th.villa) return { ok: false, error: 'd1' };
  const h = _tillagaMed(th.tillogur, b && b.ids);
  const id = kbLykill(g.um, th.auka.map((k) => k.id));
  const ok = await _skrifaJson(env, 'kb:' + id, Object.assign({}, g, { vistad: _nu(), heimild: h ? h.ids.map(Number) : [] }));
  if (!ok) return { ok: false, error: 'd1' };
  if (h) await _afgreida(env, th, h.ids);
  return { ok: true, id };
}

export async function sigrunGreinHafna(env, b) {
  const th = await sigrunThekking(env);
  if (th.villa) return { ok: false, error: 'd1' };
  const h = _tillagaMed(th.tillogur, b && b.ids);
  if (!h) return { ok: false, error: 'tillaga' };
  return (await _afgreida(env, th, h.ids)) ? { ok: true } : { ok: false, error: 'd1' };
}

/** Eyðir vistaðri grein. Greinar í kóðanum (lib/hjalp_agent.mjs) eru ekki í stjorn_sync og verða ekki snertar. */
export async function sigrunGreinEyda(env, b) {
  const id = String((b && b.kb) || '');
  if (!KB_ID.test(id)) return { ok: false, error: 'id' };
  const ok = await env.TENGSL.prepare('DELETE FROM stjorn_sync WHERE k=?').bind('kb:' + id).run().then(() => true).catch(() => false);
  return ok ? { ok: true } : { ok: false, error: 'd1' };
}

// ── VIKUPÓSTURINN ────────────────────────────────────────────────────────────────────────────

/**
 * Mánudagspósturinn (cron `10 8 * * 1`) og „Senda mér þetta í pósti" á spjaldinu (`thvinga`).
 * `yfirlit` er ticketsOverview úr hjalp_agent.mjs, gefið stöðubundið: það flytti annars inn skrá sem
 * flytur þessa inn, og CI-tengingaprófið les nöfn með mynstri.
 * ⚠ Einu sinni á viku: kröfu er slegið í stjorn_sync með einkvæmu tákni og lesin aftur, svo tvær
 *   keyrslur sendi ekki tvo pósta. Mistakist sendingin er krafan tekin aftur.
 */
export async function sigrunVikupostur(env, yfirlit, { thvinga = false } = {}) {
  if (!env || !env.TENGSL) return { ok: false, error: 'd1' };
  const D = env.TENGSL;
  const rofi = await D.prepare("SELECT v FROM stjorn_sync WHERE k='hjalp_agent_off'").first().catch(() => VILLA);
  if (rofi === VILLA) return { ok: false, error: 'd1' };
  if (rofi && String(rofi.v) === '1') return { ok: false, error: 'rofi' };
  const nu = _nu();
  const v = sidastaFullaVika(nu);
  const lykill = 'sigrun_vikupostur:' + v.ar + '-' + v.vika;
  const adur = await D.prepare('SELECT v, updated FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => VILLA);
  if (adur === VILLA) return { ok: false, error: 'd1' };
  if (adur && !thvinga) return { ok: true, sent: false, adur: true };
  if (adur && thvinga && nu - Number(adur.updated) < 300) return { ok: false, error: 'nylega' };

  const vr = await sigrunVika(env, v.fra, v.til);
  if (!vr.ok) return { ok: false, error: vr.error || 'd1' };
  // Stíllinn fyrst: textinn lofar „svo nú hef ég drögin styttri" aðeins ef það stendur í promptinu.
  let still = await sigrunStillUppfaera(env).catch(() => VILLA);
  if (still === VILLA) still = (await sigrunThekking(env)).still;
  const lr = await sigrunLaerdomur(env, v.fra, v.til).catch(() => null);
  // Mánudagskeyrslan leitar að nýjum tillögum; hnappurinn notar þær sem til eru (ekkert auka Claude-kall).
  let greinar = [];
  if (!thvinga) { const k = await sigrunKbLeita(env).catch(() => null); greinar = k && k.ok ? k.hopar : (await sigrunThekking(env)).tillogur; }
  else greinar = (await sigrunThekking(env)).tillogur;
  const ov = typeof yfirlit === 'function' ? await yfirlit(env).catch(() => null) : null;
  const listi = ov && Array.isArray(ov.list) ? ov.list : [];
  const bida = listi.filter((t) => t && (t.stada === 'nytt' || t.stada === 'stadfest'));
  const bidTimi = (t) => Number(t.updated) || Number(t.created) || 0;
  const elst = bida.reduce((a, t) => (!a || bidTimi(t) < bidTimi(a) ? t : a), null);
  const p = vikupostur({
    vika: v, tolur: vr.tolur,
    lifandi: { opnir: Number(ov && ov.open) || 0, lengstOpinn: elst ? { id: elst.id, dagar: Math.floor((nu - bidTimi(elst)) / 86400) } : null },
    laerdomur: lr && lr.ok ? lr.laerdomur : null, still,
    hjalp: bida.filter((t) => t.hjalp && t.hjalp.texti).map((t) => ({ id: t.id, texti: t.hjalp.texti })),
    greinar,
  });

  const takn = 'sendi:' + nu + ':' + Math.random().toString(36).slice(2, 10);
  const krafa = thvinga ? UPSERT : 'INSERT OR IGNORE INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?)';
  await D.prepare(krafa).bind(lykill, takn, nu).run().catch(() => {});
  const eigin = await D.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
  if (!eigin || eigin.v !== takn) return { ok: true, sent: false, adur: true };   // önnur keyrsla var á undan
  const s = await sendGmail(env, { to: _til(env), subject: p.efni, html: p.html }).catch(() => ({ ok: false }));
  if (!s || !s.ok) {
    await D.prepare('DELETE FROM stjorn_sync WHERE k=? AND v=?').bind(lykill, takn).run().catch(() => {});
    return { ok: false, error: 'send' };
  }
  return { ok: true, sent: true, efni: p.efni };
}
