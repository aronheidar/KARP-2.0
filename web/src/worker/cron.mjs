// cron.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

import { _prefSet, accountOwner } from './auth.mjs';
import { _cdata, _dget, _emailTpl, _esc, _fjson, sendGmail } from './felag.mjs';
import { _isStem, _kycAfterEvents, _kycRunDiff, _lobbyGate, computeGreinRank, newsSince } from './veitur.mjs';
import { renderEmail } from '../lib/emails.mjs';
import { aggregateFirma } from '../lib/firma-greining.mjs';
import { reputationScore, toneAlert } from '../lib/ordspor.mjs';
import { CAT } from '../lib/frettavel-cat.mjs';
import { matchItem, matchKeyword, newSince } from '../lib/lobbyvakt.mjs';
import { byggMatch, criticalDrop, criticalNotice, noticeRef, rankMovement, ratingMovement } from '../lib/vaktir-signals.mjs';
import { augGet } from './felag.mjs';
import { _searchVariants } from './veitur.mjs';
import { leikurPruneOld } from '../../../src/lib/leikur/server.mjs';   // RÁS-Leikurinn: varðveislutakmörkun (sama eining og /api/leikur)

// 🎮 RÁS-LEIKURINN — varðveislutakmörkun (vikul., mánud. 08:10 UTC með digestinu). Leikur-töflurnar bera engin
// notanda-auðkenni, en liðsheiti er frjáls texti (getur borið nöfn) og fram að þessu lifði allt að eilífu í D1.
// Reglan (leikurPruneOld í src/lib/leikur/server.mjs): LOKNIR leikir (phase='ended') stofnaðir fyrir >90 dögum +
// YFIRGEFNIR leikir (ekki-ended, stofnaðir fyrir >180 dögum) eyðast með öllu tengdu (lið/ákvarðanir/uppgjör).
// (Mælt frá `created` — leikur_games hefur engan loka-tímastimpil; leikur stendur að jafnaði innan einnar kennslustundar.)
// Skjöl sem LÝSA þessari reglu og verða að haldast samræmd: docs/personuvernd/DPA-skolar-RAS-leikurinn.md (11. gr.),
// DPIA-RAS-leikurinn-skolar.md (2.4), web/src/data/skilmalar.json (#15) og web/src/pages/leikur/personuvernd.astro.
// Leikur í gangi yngri en 180 daga er aldrei snertur. Idempotent; talning logguð svo keyrslan sjáist í wrangler tail.
export const LEIKUR_RETENTION_DAYS = 90;
export async function leikurPruneCron(env) {
  if (!env || !env.TENGSL) return null;
  const n = await leikurPruneOld(env, { days: LEIKUR_RETENTION_DAYS }).catch((e) => { console.log('[leikur-prune] villa: ' + (e && e.message)); return null; });
  if (n) console.log(`[leikur-prune] days=${LEIKUR_RETENTION_DAYS} eytt: leikir=${n.games} lið=${n.teams} ákvarðanir=${n.decisions} uppgjör=${n.results}`);
  return n;
}

export async function kycDiffCron(env) {
  const kts = ((await env.TENGSL.prepare("SELECT DISTINCT kt FROM kyc_watch WHERE status='active'").all().catch(() => ({ results: [] }))).results || []).map((r) => r.kt);
  for (const kt of kts) { const res = await _kycRunDiff(env, kt, null).catch(() => ({ newEvents: [] })); await _kycAfterEvents(env, kt, res, false).catch(() => {}); }
}

export async function kycCriticalCron(env) {
  const kts = ((await env.TENGSL.prepare("SELECT DISTINCT kt FROM kyc_watch WHERE status='active'").all().catch(() => ({ results: [] }))).results || []).map((r) => r.kt);
  // 'fatf' er með: CI skrifar nýjar FATF-flokkanir á nóttunni → critical-flokkarnir
  // (þvætti/þvinganir) berast vaktara innan ≤3 klst í stað næsta dags.
  for (const kt of kts) { const res = await _kycRunDiff(env, kt, ['sanctions', 'legal', 'fatf']).catch(() => ({ newEvents: [] })); await _kycAfterEvents(env, kt, res, true).catch(() => {}); }
}

// 📉 ORÐSPORSVAKT — varar við þegar tónn fréttaumfjöllunar um vaktað félag snarversnar.
// Sama mynstur og eftirlitCriticalCron: (1) meta EINU SINNI per félag, (2) einn póstur per
// notanda með ÖLLUM hans viðvörunum, (3) merkja stöðuna SÍÐAST svo fyrsti notandi loki ekki
// á hina sem vakta sama félag. Einkunnin kemur úr lib/ordspor.mjs — SAMA og skýrslan sýnir.
export async function ordsporCron(env) {
  if (!env.TENGSL) return { sent: 0, reason: 'no-d1' };
  // vaktendur: félag (kt+nafn) → netföng. Fréttaleit er NAFNA-byggð, því þarf nafnið.
  const rows = ((await env.TENGSL.prepare("SELECT p.v AS v, u.email AS email FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='firmavakt'").all().catch(() => ({ results: [] }))).results) || [];
  const byKt = {}, nafnAf = {};
  for (const r of rows) {
    if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) continue;
    try {
      const fv = JSON.parse(r.v);
      if (!fv || !fv.on || !Array.isArray(fv.felog)) continue;
      for (const co of fv.felog) {
        if (!co || !co.kt || !co.nafn) continue;               // án nafns er ekkert hægt að leita
        const k = String(co.kt).replace(/\D/g, '');
        (byKt[k] || (byKt[k] = new Set())).add(r.email);
        nafnAf[k] = co.nafn;
      }
    } catch (e) {}
  }
  const kts = Object.keys(byKt).slice(0, 250);                  // þak: verndar gegn D1-sprengingu
  if (!kts.length) return { sent: 0, users: 0 };
  const now = Math.floor(Date.now() / 1000);
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS ordspor_vakt (kt TEXT PRIMARY KEY, score INTEGER, ts INTEGER)').run().catch(() => {});

  // 1) meta hvert félag EINU SINNI
  const vidv = {}, sedir = [];
  let mistokst = 0;
  for (const kt of kts) {
    const nafn = nafnAf[kt];
    // ⚠ BILUÐ LEIT ER EKKI „ENGAR FRÉTTIR". Áður varð hvort tveggja að [] og félagið datt þegjandi úr
    // vöktun þá keyrslu — og skilagildi cron-sins er hvergi lesið, svo enginn gat séð það. Ein
    // endurtilraun (D1 er þekkt fyrir skammvinnar 7403/7429), annars talið og skráð í Live Logs.
    let items = await newsSearch(env, [nafn], 21, 400).catch(() => null);   // 3 vikur dugar f. 7-daga glugga + samanburð
    if (items == null) items = await newsSearch(env, [nafn], 21, 400).catch(() => null);
    if (items == null) { mistokst++; continue; }
    if (!items.length) continue;
    const scored = items.map((x) => ({ ts: x.ts, sent: (x.sent_ai != null ? x.sent_ai : (x.sent != null ? x.sent : _tone(x.body || x.title))) }));
    const a = toneAlert(scored, { now, windowDays: 7 });
    sedir.push({ kt, score: a.now.score });
    if (!a.alert || a.now.score == null) continue;
    // ⚠ ekki senda sömu viðvörun aftur: aðeins ef einkunnin hefur FALLIÐ frá síðustu sendingu.
    const fyrra = await env.TENGSL.prepare('SELECT score FROM ordspor_vakt WHERE kt=?').bind(kt).first().catch(() => null);
    if (fyrra && Number.isFinite(fyrra.score) && a.now.score >= fyrra.score - 5) continue;
    vidv[kt] = { kt, nafn, score: a.now.score, fyrri: a.prev.score, drop: a.drop, n: a.now.n, neg: a.now.neg, reason: a.reason };
  }
  // Þögul vakt er verri en engin vakt: systematísk leitar-bilun á að sjást (worker.js:542-rásin).
  if (mistokst) console.error('[karp-villa]', JSON.stringify({ m: 'ordsporCron: fréttaleit brást', felog: mistokst, af: kts.length }));
  if (!Object.keys(vidv).length) {
    for (const s of sedir) if (s.score != null) await env.TENGSL.prepare('INSERT INTO ordspor_vakt (kt,score,ts) VALUES (?,?,?) ON CONFLICT(kt) DO UPDATE SET score=excluded.score, ts=excluded.ts').bind(s.kt, s.score, now).run().catch(() => {});
    return { sent: 0, alerts: 0, mistokst };
  }

  // 2) fan-out — einn póstur per notanda
  const perEmail = {};
  for (const kt of Object.keys(vidv)) for (const email of (byKt[kt] || [])) (perEmail[email] || (perEmail[email] = [])).push(vidv[kt]);
  let sent = 0;
  for (const email of Object.keys(perEmail)) {
    const list = perEmail[email];
    const lines = list.map((d) => '• ' + d.nafn + ' — orðspors-einkunn ' + d.score + (d.fyrri != null ? ' (var ' + d.fyrri + ')' : '')
      + ' · ' + d.n + ' fréttir sl. viku, þar af ' + d.neg + ' neikvæðar').join('\n');
    const tpl = await _emailTpl(env, 'ordspor_vakt');
    const vars = { fjoldi: list.length, lysing: list.length === 1 ? 'umfjöllun um ' + list[0].nafn + ' hefur versnað' : list.length + ' félög á vaktinni með versnandi umfjöllun' };
    const r = await sendGmail(env, {
      to: email,
      subject: renderEmail(tpl.subject, vars),
      text: renderEmail(tpl.intro, vars) + '\n\n' + lines + '\n\n' + renderEmail(tpl.footer, vars),
    });
    if (r && r.ok) sent++;
  }
  // 3) merkja LOKS
  for (const s of sedir) if (s.score != null) await env.TENGSL.prepare('INSERT INTO ordspor_vakt (kt,score,ts) VALUES (?,?,?) ON CONFLICT(kt) DO UPDATE SET score=excluded.score, ts=excluded.ts').bind(s.kt, s.score, now).run().catch(() => {});
  return { sent, alerts: Object.keys(vidv).length, mistokst };
}

export async function eftirlitCriticalCron(env) {
  if (!env.TENGSL) return { sent: 0, reason: 'no-d1' };
  const eft = await _dget(env, '/gogn/eftirlit.json').catch(() => null);
  const stadir = (eft && eft.stadir) || [];
  if (!stadir.length) return { sent: 0, reason: 'no-data' };
  // vaktendur: kt → netföng (krefst fv.on)
  const rows = ((await env.TENGSL.prepare("SELECT p.v AS v, u.email AS email FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='firmavakt'").all().catch(() => ({ results: [] }))).results) || [];
  const byKt = {};
  for (const r of rows) {
    if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) continue;
    try {
      const fv = JSON.parse(r.v);
      if (!fv || !fv.on || !Array.isArray(fv.felog)) continue;
      for (const co of fv.felog) { if (co && co.kt) { const k = String(co.kt).replace(/\D/g, ''); (byKt[k] || (byKt[k] = new Set())).add(r.email); } }
    } catch (e) {}
  }
  if (!Object.keys(byKt).length) return { sent: 0, users: 0 };
  const now = Math.floor(Date.now() / 1000);
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS eftirlit_crit (uuid TEXT PRIMARY KEY, kt TEXT, rating INTEGER, ts INTEGER)').run().catch(() => {});
  // 1) greina föll EINU SINNI (global per uuid) — svo enginn notandi „steli" viðvörun frá öðrum
  const drops = {}, seen = [];
  for (const s of stadir) {
    if (!s || !s.uuid || !Number.isFinite(s.rating)) continue;
    const kt = String(s.kt || '').replace(/\D/g, '');
    if (!kt || !byKt[kt]) continue;
    const prev = await env.TENGSL.prepare('SELECT rating FROM eftirlit_crit WHERE uuid=?').bind(s.uuid).first().catch(() => null);
    const mv = criticalDrop(prev && Number.isFinite(prev.rating) ? prev.rating : null, s.rating);
    if (mv) (drops[kt] || (drops[kt] = [])).push({ kt, name: s.name, street: s.street, from: mv.from, to: mv.to, ratingLabel: s.ratingLabel });
    seen.push({ uuid: s.uuid, kt, rating: s.rating });
  }
  // 2) fan-out: einn póstur per notanda með ÖLLUM hans föllum
  let sent = 0;
  const perEmail = {};
  for (const kt of Object.keys(drops)) for (const email of (byKt[kt] || [])) (perEmail[email] || (perEmail[email] = [])).push(...drops[kt]);
  for (const email of Object.keys(perEmail)) {
    const list = perEmail[email];
    const lines = list.map((d) => '• ' + (d.name || d.kt) + (d.street ? ' (' + d.street + ')' : '') + ' — féll úr ' + d.from + ' í ' + d.to + (d.ratingLabel ? ' (' + d.ratingLabel + ')' : '')).join('\n');
    const tpl = await _emailTpl(env, 'eftirlit_crit');
    const vars = { fjoldi: list.length, lysing: (list.length === 1 ? 'félag á vaktinni féll' : list.length + ' staðir á vaktinni féllu') };
    const subject = renderEmail(tpl.subject, vars);
    const text = renderEmail(tpl.intro, vars) + '\n\n' + lines + '\n\n' + renderEmail(tpl.footer, vars);
    const r = await sendGmail(env, { to: email, subject, text });
    if (r && r.ok) sent++;
  }
  // 3) merkja LOKS (eftir fan-out) — annars lokaði fyrsti notandi á hina sem vakta sama stað
  for (const s of seen) await env.TENGSL.prepare('INSERT INTO eftirlit_crit (uuid,kt,rating,ts) VALUES (?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET kt=excluded.kt,rating=excluded.rating,ts=excluded.ts').bind(s.uuid, s.kt, s.rating, now).run().catch(() => {});
  return { sent, drops: Object.keys(drops).length };
}

export async function logbirtingCriticalCron(env) {
  if (!env.TENGSL) return { sent: 0, reason: 'no-d1' };
  const lb = await augGet(env, 'logbirting.json').catch(() => null);
  const byKtData = (lb && lb.byKt) || null;
  if (!byKtData) return { sent: 0, reason: 'no-data' };
  const sev = (lb && lb.severity) || {}, labels = (lb && lb.typeLabels) || {};
  const rows = ((await env.TENGSL.prepare("SELECT p.v AS v, u.email AS email FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='firmavakt'").all().catch(() => ({ results: [] }))).results) || [];
  const watchers = {};
  for (const r of rows) {
    if (!r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) continue;
    try {
      const fv = JSON.parse(r.v);
      if (!fv || !fv.on || !Array.isArray(fv.felog)) continue;
      for (const co of fv.felog) { if (co && co.kt) { const k = String(co.kt).replace(/\D/g, ''); (watchers[k] || (watchers[k] = new Set())).add(r.email); } }
    } catch (e) {}
  }
  const watched = Object.keys(watchers);
  if (!watched.length) return { sent: 0, users: 0 };
  const now = Math.floor(Date.now() / 1000);
  const since = new Date((now - 14 * 86400) * 1000).toISOString().slice(0, 10);
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS logbirting_crit (ref TEXT PRIMARY KEY, kt TEXT, ts INTEGER)').run().catch(() => {});
  // 1) greina EINU SINNI (global per tilkynningar-lykil) — svo enginn notandi „steli" viðvörun frá öðrum
  const hits = {}, seen = [];
  for (const kt of watched) {
    const ent = byKtData[kt];
    for (const n of ((ent && ent.notices) || [])) {
      if (!criticalNotice(n, sev, since)) continue;
      const ref = noticeRef(kt, n);
      seen.push({ ref, kt });
      const prev = await env.TENGSL.prepare('SELECT ref FROM logbirting_crit WHERE ref=?').bind(ref).first().catch(() => null);
      if (prev) continue;
      (hits[kt] || (hits[kt] = [])).push({ kt, nafn: (ent && ent.name) || kt, teg: labels[n.type] || n.type, dags: String(n.date || '').slice(0, 10), domstoll: n.court || '' });
    }
  }
  // 2) fan-out: einn póstur per notanda með ÖLLUM hans málum
  let sent = 0;
  const perEmail = {};
  for (const kt of Object.keys(hits)) for (const email of (watchers[kt] || [])) (perEmail[email] || (perEmail[email] = [])).push(...hits[kt]);
  for (const email of Object.keys(perEmail)) {
    const list = perEmail[email];
    const lines = list.map((h) => '• ' + h.nafn + ' — ' + h.teg + (h.dags ? ' (' + h.dags + ')' : '') + (h.domstoll ? ' · ' + h.domstoll : '')).join('\n');
    const tpl = await _emailTpl(env, 'logbirting_crit');
    const vars = { lysing: (list.length === 1 ? 'gjaldþrotamál á félagi á vaktinni' : list.length + ' gjaldþrotamál á félögum á vaktinni'), kt: ((list[0] && list[0].kt) ? list[0].kt : '') };
    const subject = renderEmail(tpl.subject, vars);
    const text = renderEmail(tpl.intro, vars) + '\n\n' + lines + '\n\n' + renderEmail(tpl.footer, vars);
    const r = await sendGmail(env, { to: email, subject, text });
    if (r && r.ok) sent++;
  }
  // 3) merkja LOKS (eftir fan-out)
  for (const s of seen) await env.TENGSL.prepare('INSERT OR IGNORE INTO logbirting_crit (ref,kt,ts) VALUES (?,?,?)').bind(s.ref, s.kt, now).run().catch(() => {});
  return { sent, hits: Object.keys(hits).length };
}

const NEWS_FEEDS = [
  ['https://www.mbl.is/feeds/fp/', 'mbl.is'], ['https://www.mbl.is/feeds/innlent/', 'mbl.is'], ['https://www.mbl.is/feeds/vidskipti/', 'mbl.is'],
  ['https://www.ruv.is/rss/frettir', 'RÚV'], ['https://www.ruv.is/rss/innlent', 'RÚV'],
  ['https://www.visir.is/rss/frettir', 'Vísir'], ['https://www.visir.is/rss/vidskipti', 'Vísir'],
  ['https://heimildin.is/rss/', 'Heimildin'], ['https://vb.is/rss/', 'Viðskiptablaðið'],
  // ➕ 20.8.2026 (ósk notanda um breiðari fjölmiðlavakt): lands- og landshlutamiðlar. Hver slóð SANNREYND með
  // KarpBot-UA (200 + item-fjöldi + ferskur pubDate) áður en hún fór inn — Feykir/Vikublaðið nota Moya-CMS
  // (/is/rss, /is/feed), Austurfrétt Joomla (?format=feed). BB.is (CF-challenge), Víkurfréttir og Eyjafréttir
  // (403 á botta) og Mannlíf (feed dautt síðan mars 2025) virka EKKI — endurskoða síðar.
  ['https://www.dv.is/feed/', 'DV'], ['https://nutiminn.is/feed/', 'Nútíminn'], ['https://grapevine.is/feed/', 'Grapevine'],
  ['https://skessuhorn.is/feed.xml', 'Skessuhorn'], ['https://www.feykir.is/is/rss', 'Feykir'],
  ['https://trolli.is/feed/', 'Trölli'], ['https://www.vikubladid.is/is/feed', 'Vikublaðið'],
  ['https://austurfrett.is/frettir?format=feed&type=rss', 'Austurfrétt'], ['https://sunnlenska.is/feed/', 'Sunnlenska'],
];

export function _rssItems(xml, source) {
  const out = [];
  for (const b of String(xml).split(/<item[\s>]/i).slice(1)) {
    const title = _cdata((b.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
    if (!title) continue;
    const link = _cdata((b.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
    const desc = _cdata((b.match(/<description>([\s\S]*?)<\/description>/i) || [])[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600);
    const p = ((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '').trim();
    let date = ''; if (p) { const dt = new Date(p); if (!isNaN(dt.getTime())) date = dt.toISOString().slice(0, 10); }
    out.push({ title, url: link, date, source, desc });
  }
  return out;
}

export async function fetchNews() {
  const wkDate = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const lists = await Promise.all(NEWS_FEEDS.map(async ([u, src]) => {
    try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (KarpBot; +https://karp.is)' }, cf: { cacheTtl: 900 } }); return r.ok ? _rssItems(await r.text(), src) : []; } catch (e) { return []; }
  }));
  const seen = new Set(), out = [];
  for (const arr of lists) for (const it of arr) { if (it.date && it.date < wkDate) continue; const k = it.title.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
}

export const FRETTA_TYPES = new Set(Object.keys(CAT));

async function digestShared(env) {
  const now = Math.floor(Date.now() / 1000);
  const wkDate = new Date((now - 7 * 86400) * 1000).toISOString().slice(0, 10);
  const sh = { tolur: [], kaup7: [], mp: {}, utbod: {}, news: [], vm: {} };
  const [ctx, ks, al, ut, fv, vm, media] = await Promise.all([
    _dget(env, '/gogn/spyrdu_context.json'), _dget(env, '/gogn/kaupskra_nyjast.json'),
    _dget(env, '/gogn/althingi.json'), _dget(env, '/gogn/utbod.json'),
    _dget(env, '/gogn/frettavel.json'), _dget(env, '/gogn/vorumerki_nyskrad.json'),
    newsSince(env, 7, 500).then((r) => r.length ? r : fetchNews()),   // D1 frétta-safn (þrautavari: lifandi RSS)
  ]);
  if (ctx && ctx.text) for (const line of String(ctx.text).split('\n')) for (const k of ['VERÐBÓLGA', 'GENGI', 'STÝRIVEXTIR']) if (line.indexOf(k) === 0) sh.tolur.push(line.trim());
  for (const x of ((ks && ks.rows) || [])) if (x && String(x.d || '') >= wkDate) sh.kaup7.push(x);
  for (const m of (Array.isArray(al) ? al : [])) if (m && m.id != null) sh.mp[String(m.id)] = String(m.nafn || '');
  for (const t of ((ut && ut.tenders) || [])) if (t && t.u) sh.utbod[String(t.u)] = { t: String(t.t || ''), b: String(t.buyer || '') };
  // Fréttasafn: fjölmiðla-fyrirsagnir (RSS) + Karp-fréttavél atburðir (bæði síðustu 7 daga).
  const fvNews = ((fv && fv.items) || []).filter((x) => x && String(x.date || '') >= wkDate).map((x) => ({ title: String(x.title || ''), text: String(x.text || ''), url: String(x.url || ''), source: 'Karp fréttavél' }));
  sh.news = (Array.isArray(media) ? media.map((x) => ({ title: x.title, text: '', url: x.url, source: x.source })) : []).concat(fvNews);
  sh.vm = (vm && vm.byKt) || {};
  sh.lobbyvakt = await augGet(env, 'lobbyvakt.json').catch(() => null);   // Lobbývakt: nætur-flokkuð þingmál/samráðsmál (kafli „Reglur í pípunni" hér að neðan)
  sh.wkDate = wkDate;
  // Eftirlit (heilbrigðiseftirlit RVK) — byKt fyrir firmavakt-pörun.
  const _eft = await _dget(env, '/gogn/eftirlit.json');
  sh.eftByKt = {};
  for (const s of ((_eft && _eft.stadir) || [])) { if (s && s.kt) { const k = String(s.kt).replace(/\D/g, ''); (sh.eftByKt[k] || (sh.eftByKt[k] = [])).push(s); } }
  // Byggingarleyfi RVK — nýleg mál (7 dagar) fyrir fastvakt-pörun; a/pn samnefni svo byggMatch+li virki.
  const _bygg = await _dget(env, '/gogn/byggingarleyfi_vakt.json');
  sh.bygg7 = (((_bygg && _bygg.recent) || []).filter((x) => x && String(x.date || '').slice(0, 10) >= wkDate).map((x) => ({ ...x, a: x.addr, pn: x.postnr })));
  // Greina-vöktun: röð-hreyfing vöktaðra félaga (firmavakt) í grein sinni (grein_rank_last viku-díff).
  sh.rankMoves = {};
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS grein_rank_last (kt TEXT PRIMARY KEY, slug TEXT, label TEXT, rank INTEGER, total INTEGER, sala INTEGER, ts INTEGER)').run().catch(() => {});
  const _watchKts = new Set();
  for (const row of (((await env.TENGSL.prepare("SELECT v FROM user_prefs WHERE k='firmavakt'").all().catch(() => ({ results: [] }))).results) || [])) {
    try { const fv = JSON.parse(row.v); if (fv && Array.isArray(fv.felog)) for (const co of fv.felog) { if (co && co.kt) _watchKts.add(String(co.kt).replace(/\D/g, '')); } } catch (e) {}
  }
  // Einkunn-átt: heilbrigðiseftirlit vöktaðra félaga — geymd einkunn per starfsstöð (uuid) → hækkaði/lækkaði.
  sh.eftMoves = {};
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS eftirlit_last (uuid TEXT PRIMARY KEY, kt TEXT, rating INTEGER, ts INTEGER)').run().catch(() => {});
  for (const kt of _watchKts) {
    for (const s of (sh.eftByKt[kt] || [])) {
      if (!s || !s.uuid || !Number.isFinite(s.rating)) continue;
      const prevR = await env.TENGSL.prepare('SELECT rating FROM eftirlit_last WHERE uuid=?').bind(s.uuid).first().catch(() => null);
      const mv = ratingMovement(prevR && Number.isFinite(prevR.rating) ? prevR.rating : null, s.rating);
      if (mv) (sh.eftMoves[kt] || (sh.eftMoves[kt] = [])).push({ ...mv, name: s.name, street: s.street, ratingLabel: s.ratingLabel, reportUrl: s.reportUrl });
      await env.TENGSL.prepare('INSERT INTO eftirlit_last (uuid,kt,rating,ts) VALUES (?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET kt=excluded.kt,rating=excluded.rating,ts=excluded.ts').bind(s.uuid, kt, s.rating, now).run().catch(() => {});
    }
  }
  for (const kt of _watchKts) {
    const cur = await computeGreinRank(env, kt);
    if (cur.rank == null) continue;
    const prev = await env.TENGSL.prepare('SELECT rank, total FROM grein_rank_last WHERE kt=?').bind(kt).first().catch(() => null);
    const mv = rankMovement(prev, cur);
    if (mv) sh.rankMoves[kt] = { ...mv, slug: cur.slug, label: cur.label, total: cur.total };
    await env.TENGSL.prepare('INSERT INTO grein_rank_last (kt,slug,label,rank,total,sala,ts) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kt) DO UPDATE SET slug=excluded.slug,label=excluded.label,rank=excluded.rank,total=excluded.total,sala=excluded.sala,ts=excluded.ts').bind(kt, cur.slug, cur.label, cur.rank, cur.total, cur.sala, now).run().catch(() => {});
  }
  return sh;
}

function _newsHits(news, word, limit) {
  const w = String(word || '').toLowerCase(); if (!w) return { n: 0, rows: [] };
  const rows = news.filter((x) => (x.title + ' ' + x.text).toLowerCase().indexOf(w) >= 0);
  return { n: rows.length, rows: rows.slice(0, limit) };
}

function digestBuild(name, prefs, sh) {
  const dIS = (d) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? (+m[3]) + '.' + (+m[2]) + '.' + m[1] : ''; };
  const mkr = (v) => (Number(v || 0) / 1000).toLocaleString('is-IS', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m.kr';
  const H = (ico, txt) => '<tr><td style="padding:18px 20px 4px;color:#f6b13b;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.05em">' + ico + ' ' + _esc(txt) + '</td></tr>';
  const _u = (u) => !u ? '' : (/^https?:\/\//.test(u) ? u : 'https://karp.is' + (u[0] === '/' ? u : '/' + u));
  const li = (main, sub, url) => { const t = url ? '<a href="' + _esc(url) + '" style="color:#eaf1fb;font-size:14.5px;text-decoration:none;font-weight:600">' + _esc(main) + '</a>' : '<span style="color:#eaf1fb;font-size:14.5px;font-weight:600">' + _esc(main) + '</span>'; return '<tr><td style="padding:8px 20px;border-bottom:1px solid #1d2733">' + t + (sub ? '<br><span style="color:#8a93a8;font-size:12px">' + _esc(sub) + '</span>' : '') + '</td></tr>'; };
  let rows = '', personal = false;
  if (sh.tolur.length) {
    rows += H('📊', 'Vikan í tölum');
    let chips = '';
    for (const line of sh.tolur) { const p = line.split(':'); const head = p.shift(); chips += '<span style="display:inline-block;background:#141c2b;border:1px solid #263349;border-radius:9px;padding:6px 10px;margin:3px 4px 3px 0;color:#cdd6e6;font-size:12px"><b style="color:#f6b13b">' + _esc(head.trim()) + '</b> ' + _esc(p.join(':').trim()) + '</span>'; }
    rows += '<tr><td style="padding:6px 20px 10px">' + chips + '</td></tr>';
  }
  // (Leitarorð → fréttir færð í sameinaða „🏛️ Lobbývaktin þín"-kaflann að neðan — Lobbývakt 2.0.)
  const fl = Array.isArray(prefs.follows) ? prefs.follows : [];
  if (fl.length) {
    let sec = '', done = 0;
    for (const key of fl) { if (done >= 12) break; let nafn = ''; const k = String(key); if (k.indexOf('mp:') === 0) nafn = sh.mp[k.slice(3)] || ''; else if (k.indexOf('co:') === 0) nafn = k.slice(3).trim(); else if (!/^\d{7,10}$/.test(k)) nafn = k; if (!nafn) continue; done++; const hit = _newsHits(sh.news, nafn, 1); if (!hit.n) continue; const top = hit.rows[0]; sec += li(nafn + ' — ' + hit.n + ' ' + (hit.n === 1 ? 'frétt' : 'fréttir'), top ? top.title.slice(0, 88) : '', 'https://karp.is/frettir/'); }
    if (sec) { rows += H('⭐', 'Þau sem þú fylgist með — vikan í fréttum') + sec; personal = true; }
  }
  const fv = prefs.fastvakt;
  if (fv && fv.on && Array.isArray(fv.vaktir) && fv.vaktir.length && sh.kaup7.length) {
    const match = (x, sv, q) => { if (sv && String(x.sv || '') !== sv) return false; if (!q) return true; if (/^\d{3}$/.test(q)) return String(x.pn || '') === q; return String(x.a || '').toLowerCase().indexOf(String(q).toLowerCase()) === 0; };
    let sec = '', n = 0;
    for (const x of sh.kaup7) for (const w of fv.vaktir) { if (match(x, String(w.sv || ''), String(w.q || ''))) { n++; if (n <= 8) { const fm = Number(x.fm || 0); sec += li(String(x.a || '') + ' — ' + mkr(x.v || 0), (dIS(x.d) + ' · ' + String(fm).replace('.', ',') + ' m²' + (fm > 0 ? ' · ' + Math.round(Number(x.v || 0) / fm) + ' þ/m²' : '') + ' · ' + String(x.pn || '') + ' ' + String(x.sv || '')).trim(), 'https://karp.is/fasteignavakt/'); } break; } }
    if (n) { rows += H('🏠', 'Fasteignavaktin — ' + n + ' þinglýst' + (n === 1 ? ' sala' : 'ar sölur') + ' í vikunni') + sec; if (n > 8) rows += li('… og ' + (n - 8) + ' til viðbótar', '', 'https://karp.is/fasteignavakt/'); personal = true; }
  }
  const uv = prefs.utbodvakt;
  if (uv && uv.on && uv.seen && Object.keys(uv.seen).length && Object.keys(sh.utbod).length) {
    const wkTs = Math.floor(Date.now() / 1000) - 7 * 86400;
    let sec = '', n = 0;
    for (const url of Object.keys(uv.seen)) { if (Number(uv.seen[url]) < wkTs || !sh.utbod[url]) continue; n++; if (n <= 6) { const t = sh.utbod[url]; sec += li(t.t, t.b, url); } }
    if (n) { rows += H('📋', 'Útboðsvaktin — ' + n + ' ' + (n === 1 ? 'nýtt útboð' : 'ný útboð') + ' í vikunni') + sec; personal = true; }
  }
  const fmv = prefs.firmavakt;
  if (fmv && fmv.on && Array.isArray(fmv.felog) && fmv.felog.length && Object.keys(sh.vm).length) {
    let sec = '', nvm = 0;
    for (const co of fmv.felog) { if (!co || !co.kt) continue; const kt = String(co.kt).replace(/\D/g, ''); const list = sh.vm[kt]; if (!Array.isArray(list) || !list.length) continue; const nafn = co.nafn || kt; for (const m of list.slice(0, 4)) { nvm++; if (nvm <= 10) { const ti = m.titill || m.id || ''; const sub = nafn + ' · ' + (m.tegund || 'vörumerki') + (m.skrad ? ' · skráð ' + m.skrad : ''); sec += li('🅡 ' + ti, sub, 'https://www.hugverk.is/leit/trademark/' + encodeURIComponent(m.id || '')); } } }
    if (sec) { rows += H('🅡', 'Ný vörumerki hjá félögum á vaktinni') + sec; personal = true; }
  }
  // ── 🍽️ Heilbrigðiseftirlit — ÁTTAVÍS einkunna-breyting hjá vökuðum félögum (firmavakt → eftirlit_last díff) ──
  // Kveikja = einkunnin BREYTTIST (hækkaði/lækkaði), ekki „ný skoðun" — endur-skoðun með sömu einkunn þegir.
  const fmvE = prefs.firmavakt;
  if (fmvE && fmvE.on && Array.isArray(fmvE.felog) && fmvE.felog.length && sh.eftMoves && Object.keys(sh.eftMoves).length) {
    let sec = '', n = 0;
    for (const co of fmvE.felog) {
      if (!co || !co.kt) continue;
      const kt = String(co.kt).replace(/\D/g, '');
      for (const mv of (sh.eftMoves[kt] || [])) {
        n++; if (n > 10) break;
        const bad = (mv.to != null && mv.to <= 1);
        sec += li((bad ? '⚠️ ' : '') + (mv.name || co.nafn || kt) + ' — ' + mv.badge + (mv.ratingLabel ? ' (' + mv.ratingLabel + ')' : ''), (co.nafn || '') + (mv.street ? ' · ' + mv.street : ''), mv.reportUrl || '');
      }
      if (n > 10) break;
    }
    if (sec) { rows += H('🍽️', 'Heilbrigðiseftirlit — einkunn breyttist hjá félögum á vaktinni') + sec; personal = true; }
  }
  // ── 🏗️ Byggingarleyfi — ný mál á vökuðum svæðum (fastvakt → bygg eftir póstnr/götu) ──
  const fvB = prefs.fastvakt;
  if (fvB && fvB.on && Array.isArray(fvB.vaktir) && fvB.vaktir.length && Array.isArray(sh.bygg7) && sh.bygg7.length) {
    let sec = '', n = 0; const seen = new Set();
    for (const x of sh.bygg7) {
      if (!(fvB.vaktir.some((w) => w && byggMatch(x, w.q)))) continue;
      const key = x.caseNo || (String(x.a || '') + x.date);
      if (seen.has(key)) continue; seen.add(key);
      n++; if (n <= 8) sec += li((x.a || x.addr || '') + (x.desc ? ' — ' + String(x.desc).slice(0, 70) : ''), (dIS(x.date) + (x.hverfi ? ' · ' + x.hverfi : '') + (x.decisionCode ? ' · ' + x.decisionCode : '')).trim(), 'https://karp.is/eftirlit-byggingar/?t=bygging');
    }
    if (n) { rows += H('🏗️', 'Ný byggingarleyfi á svæðum á vaktinni') + sec; if (n > 8) rows += li('… og ' + (n - 8) + ' til viðbótar', '', 'https://karp.is/eftirlit-byggingar/?t=bygging'); personal = true; }
  }
  // ── 🏭 Röð í atvinnugrein — vöktað félag færðist til (firmavakt → grein_rank_last díff) ──
  const fmvR = prefs.firmavakt;
  if (fmvR && fmvR.on && Array.isArray(fmvR.felog) && fmvR.felog.length && sh.rankMoves && Object.keys(sh.rankMoves).length) {
    let sec = '';
    for (const co of fmvR.felog) {
      if (!co || !co.kt) continue;
      const mv = sh.rankMoves[String(co.kt).replace(/\D/g, '')];
      if (!mv) continue;
      sec += li('🏭 ' + (co.nafn || co.kt) + ' — ' + mv.badge, 'færðist úr #' + mv.fromRank + ' í #' + mv.toRank + ' af ' + mv.total + ' í ' + (mv.label || 'greininni'), 'https://karp.is/atvinnugreinar/' + (mv.slug ? mv.slug + '/' : ''));
    }
    if (sec) { rows += H('🏭', 'Röð í atvinnugrein breyttist') + sec; personal = true; }
  }
  // ── 🏛️ Lobbývaktin þín (sameinuð efnisvakt): fréttir (öllum) + reglur (Fyrirtæki+, reiknað+gátað í digestRun) ──
  const efniOrd = [...new Set([
    ...((prefs.leitvakt && Array.isArray(prefs.leitvakt.ord)) ? prefs.leitvakt.ord : []),
    ...(Array.isArray(prefs.lobbyvakt_ord) ? prefs.lobbyvakt_ord : []),
  ].map((w) => String(w == null ? '' : w).toLowerCase().trim()).filter(Boolean))];
  const lobbyNew = Array.isArray(prefs._lobbyNew) ? prefs._lobbyNew : [];   // aðeins Fyrirtæki+ (digestRun gátar)
  {
    let sec = '';
    for (const w of efniOrd.slice(0, 12)) { const hit = _newsHits(sh.news, w, 2); if (!hit.n) continue; sec += li('🔎 „' + w + '" — ' + hit.n + ' ' + (hit.n === 1 ? 'frétt' : 'fréttir') + ' í vikunni', '', 'https://karp.is/frettir/'); for (const r of hit.rows) sec += li('· ' + r.title.slice(0, 90), r.source || '', _u(r.url)); }
    const stigCol = (s) => ({ 'Mikil': '#ff6b6b', 'Miðlungs': '#f6b13b', 'Lítil': '#7fb2ff' }[s] || '#f6b13b');
    for (const it of lobbyNew) {
      const badge = '<span style="display:inline-block;background:#141c2b;border:1px solid ' + stigCol(it.stig) + ';border-radius:7px;padding:1px 7px;margin-right:6px;color:' + stigCol(it.stig) + ';font-size:11px;font-weight:700">' + _esc(it.stig || 'Miðlungs') + '</span>';
      const bits = [];
      if (it.frestur) bits.push('Frestur ' + dIS(it.frestur));
      if (it.stada) bits.push(_esc(it.stada));
      const title = '<a href="' + _esc(_u(it.hlekkur)) + '" style="color:#eaf1fb;font-size:14.5px;text-decoration:none;font-weight:600">' + (it.kind === 'samrad' ? '💬 ' : '📜 ') + _esc(it.titill) + '</a>';
      sec += '<tr><td style="padding:8px 20px;border-bottom:1px solid #1d2733">' + title + '<br>' + badge + (bits.length ? '<span style="color:#8a93a8;font-size:12px">' + bits.join(' · ') + '</span>' : '') + (it.brief ? '<div style="color:#b6c0d4;font-size:12.5px;margin-top:5px;line-height:1.5">' + _esc(it.brief) + '</div>' : '') + '</td></tr>';
    }
    if (sec) {
      rows += H('🏛️', 'Lobbývaktin þín') + sec;
      if (lobbyNew.length) rows += '<tr><td style="padding:0 20px 12px;color:#5c6678;font-size:11px;line-height:1.5">⚠ Sjálfvirk túlkun (gervigreind) á reglum, ekki lögfræðiráðgjöf.</td></tr>';
      personal = true;
    }
  }
  if (!personal && !sh.tolur.length) return '';
  if (!personal) rows += '<tr><td style="padding:14px 20px;color:#8a93a8;font-size:13px;line-height:1.6">Engin persónuleg treff í vikunni — settu upp <a href="https://karp.is/lobbyvakt/" style="color:#f6b13b">leitarorða-, útboðs- eða fasteignavakt</a> eða fylgstu með fyrirtækjum og þingmönnum til að fá vikuna þína hér.</td></tr>';
  const nm = name ? _esc(name) : '';
  return '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden"><div style="padding:22px 24px 8px"><div style="color:#f6b13b;font-weight:800;font-size:13px;letter-spacing:1px">🐟 KARP VIKUYFIRLIT</div><div style="color:#eaf1fb;font-size:21px;font-weight:800;margin-top:6px">' + (nm ? 'Vikan þín, ' + nm : 'Vikan þín á Karp') + '</div><div style="color:#8a93a8;font-size:13.5px;margin-top:4px">Það sem gerðist í vikunni á vöktunum þínum og hjá þeim sem þú fylgist með.</div></div><table style="width:100%;border-collapse:collapse;margin-top:6px">' + rows + '</table><div style="padding:18px 24px 24px"><a href="https://karp.is/mitt-svaedi/" style="display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Opna Mitt svæði →</a><div style="color:#5c6678;font-size:12px;margin-top:18px;line-height:1.5">Þú færð þennan póst því vikuyfirlitið er virkt á aðganginum þínum. Slökktu á <a href="https://karp.is/lobbyvakt/" style="color:#8a93a8">karp.is/vaktir</a> — „📬 Vikuyfirlitið".</div></div></div></div>';
}

export async function digestRun(env) {
  if (!env.TENGSL) return { sent: 0, reason: 'no-d1' };
  const rows = await env.TENGSL.prepare("SELECT DISTINCT p.user_id AS uid, u.email, u.name, u.is_admin, u.free_access, u.tier, u.tier_until, u.parent_account_id FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='digest' AND p.v LIKE '%\"on\":true%'").all().catch(() => ({ results: [] }));
  const users = rows.results || [];
  if (!users.length) return { sent: 0, users: 0 };
  const now = Math.floor(Date.now() / 1000);
  const sh = await digestShared(env);
  let sent = 0, built = 0, gmail = null;
  for (const u of users) {
    if (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) continue;
    const pr = {};
    const pres = await env.TENGSL.prepare("SELECT k, v FROM user_prefs WHERE user_id=? AND k IN ('leitvakt','follows','fastvakt','utbodvakt','firmavakt','lobbyvakt_greinar','lobbyvakt_ord','lobbyvakt_seen')").bind(u.uid).all().catch(() => ({ results: [] }));
    for (const row of (pres.results || [])) { try { pr[row.k] = JSON.parse(row.v); } catch (e) {} }
    // Lobbývakt: reikna ný mál (sinceTs=0 + seen — dags er í MS en digest-tíð í sek; sjá lobbyvakt.mjs newSince); slice svo fyrsta digest flæði ekki yfir. Leitarorð (ord) ofan á greinar.
    let lobbyNew = [];
    const entitled = _lobbyGate(await accountOwner(env, { id: u.uid, is_admin: u.is_admin, free_access: u.free_access, tier: u.tier, tier_until: u.tier_until, parent_account_id: u.parent_account_id }), now);
    const lgrein = Array.isArray(pr.lobbyvakt_greinar) ? pr.lobbyvakt_greinar : [];
    const lord = Array.isArray(pr.lobbyvakt_ord) ? pr.lobbyvakt_ord : [];
    if (entitled && sh.lobbyvakt && (lgrein.length || lord.length)) {
      const lseen = Array.isArray(pr.lobbyvakt_seen) ? pr.lobbyvakt_seen : [];
      lobbyNew = newSince((sh.lobbyvakt.items) || [], 0, lseen).filter((it) => matchItem(it, lgrein) || matchKeyword(it, lord)).slice(0, 12);
      pr._lobbyNew = lobbyNew;
    }
    const html = digestBuild(u.name, pr, sh);
    if (!html) continue;
    built++;
    const dtpl = await _emailTpl(env, 'digest');
    const r = await sendGmail(env, { to: u.email, subject: renderEmail(dtpl.subject, { nafn: u.name || '' }), html });
    gmail = r;
    if (r && r.ok) sent++;
    if (r && r.ok && lobbyNew.length) {   // merkja aðeins birt mál sem seen (og aðeins ef pósturinn fór) — annars birtast þau aftur næst
      const lseen = Array.isArray(pr.lobbyvakt_seen) ? pr.lobbyvakt_seen : [];
      await _prefSet(env, u.uid, 'lobbyvakt_seen', [...lobbyNew.map((it) => it.id), ...lseen].slice(0, 500));
    }
  }
  return { sent, users: users.length, built, tolur: sh.tolur.length, news: sh.news.length, gmail };
}

export async function newsIngest(env) {
  if (!env.TENGSL) return { kept: 0 };
  const items = await fetchNews();
  const now = Math.floor(Date.now() / 1000);
  const stmt = env.TENGSL.prepare('INSERT OR IGNORE INTO news (url, title, source, ts, body, sent) VALUES (?,?,?,?,?,?)');
  const batch = [];
  for (const it of items) {
    if (!it.url || !it.title) continue;
    const ts = it.date ? Math.floor(new Date(it.date + 'T12:00:00Z').getTime() / 1000) || now : now;
    const body = (String(it.title) + ' ' + String(it.desc || '')).slice(0, 800);
    batch.push(stmt.bind(String(it.url).slice(0, 400), String(it.title).slice(0, 300), it.source || '', ts, body, _tone(body)));
  }
  for (let i = 0; i < batch.length; i += 40) await env.TENGSL.batch(batch.slice(i, i + 40)).catch(() => {});
  await env.TENGSL.prepare('DELETE FROM news WHERE ts < ?').bind(now - 400 * 86400).run().catch(() => {});   // 400 daga geymsla (heilt ár+ f. yearreview/firma)
  return { fetched: items.length, batched: batch.length };
}

export function _mentions(hay, al) {
  for (const a of al) {
    if (hay.includes(a)) return true;
    const st = _isStem(a);
    if (st && st.length >= 5) { let i = hay.indexOf(st); while (i >= 0) { if (i === 0 || hay[i - 1] === ' ') return true; i = hay.indexOf(st, i + 1); } }
  }
  return false;
}

export async function newsSearch(env, terms, days, limit) {
  if (!env.TENGSL || !terms || !terms.length) return [];
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const vars = [...new Set(terms.flatMap(_searchVariants))].slice(0, 60);
  if (!vars.length) return [];
  const clauses = vars.map(() => 'body LIKE ?').join(' OR ');
  // sent_ai = AI-mat (Claude Haiku, build_sentiment_ai.mjs); sent = lexíkon-tónn við innlestur.
  const r = await env.TENGSL.prepare('SELECT title, url, source, ts, body, sent, sent_ai FROM news WHERE ts>=? AND (' + clauses + ') ORDER BY ts DESC LIMIT ?')
    .bind(since, ...vars, Math.min(limit || 500, 4000)).all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => ({ title: x.title, url: x.url, source: x.source, date: new Date(x.ts * 1000).toISOString().slice(0, 10), ts: x.ts, body: x.body || x.title, sent: x.sent, sent_ai: x.sent_ai }));
}

const _SENT_POS = ['vöxt', 'hagnað', 'aukning', 'aukn', 'sterk', 'jákvæð', 'styrk', 'samning', 'fjárfest', 'útrás', 'stækk', 'bætir', 'árangur', 'verðlaun', 'vinnur', 'ágóð', 'uppgang', 'kaupir', 'nýr samningur'];

const _SENT_NEG = ['tap', 'gjaldþrot', 'uppsögn', 'uppsagn', 'samdrátt', 'lækk', 'veik', 'neikvæð', 'vandræð', 'sekt', 'deila', 'rannsókn', 'kæra', 'svik', 'lokun', 'rift', 'vanskil', 'tjón', 'mistök', 'gagnrýn', 'afskrá'];

function _tone(title) { const t = String(title).toLowerCase(); let p = 0, n = 0; for (const w of _SENT_POS) if (t.includes(w)) p++; for (const w of _SENT_NEG) if (t.includes(w)) n++; return p - n; }
// /api/firma?q=nafn[,samheiti]&days= → { ready, total, items, timeline:[{d,n,idx}], sentiment:{idx,scored,pos,neg} }
export async function firmaHandler(request, env) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const days = Math.min(+(url.searchParams.get('days') || 365) || 365, 365);
  if (q.length < 3) return _fjson({ ready: true, total: 0, items: [], timeline: [], sentiment: {} }, 300);
  const terms = q.split(',').map((s) => s.trim()).filter((s) => s.length >= 3);
  const LIMIT = 800;
  const items = await newsSearch(env, terms, days, LIMIT);   // SQL-leit í öllu safninu
  // ⚠ Áður: `_tone(it.title)` reiknað UPP Á NÝTT við hverja fyrirspurn — og AÐEINS úr fyrirsögn,
  //   sem er lakara en geymda gildið (lexíkon á titil+lýsingu) og hunsaði AI-matið alveg.
  //   Nú: AI-mat ef til (sent_ai), annars geymdur lexíkon-tónn, annars reiknað í neyð.
  for (const it of items) {
    it._t = (it.sent_ai != null) ? it.sent_ai : (it.sent != null ? it.sent : _tone(it.body || it.title));
  }
  // ⚠ `total` var áður items.length = AFSKORIN lengd → sýndi „800" þótt raunfjöldi væri 1142.
  //   Sækjum RAUNTÖLUNA sér þegar þakið næst svo KPI-talan sé sönn.
  const capped = items.length >= LIMIT;
  const heild = capped ? await newsCount(env, terms, days) : items.length;
  // Samantektin (scored-talning, miðlar, tónn per miðil, perDay) er hrein + prófuð eining.
  const agg = aggregateFirma(items, { days, capped });
  const { sentiment, stats } = agg;
  // 🏅 Orðspors-einkunn (0-100) úr AI-tóninum. SAMA eining og orðsporsvaktin notar → talan
  //    verður aldrei önnur milli fyrirtækjaskýrslu og viðvörunar. Fá gögn ⇒ dregst að 50.
  const ordspor = reputationScore(items.map((x) => ({ ts: x.ts, sent: x._t })), { days: Math.min(days, 90) });
  const wk = {};
  for (const it of items) { const d = new Date(it.ts * 1000); const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const key = mon.toISOString().slice(0, 10); const b = (wk[key] = wk[key] || { d: key, n: 0, tone: 0 }); b.n++; b.tone += it._t || 0; }
  const timeline = Object.values(wk).sort((a, b) => a.d < b.d ? -1 : 1).map((w) => ({ d: w.d, n: w.n, idx: w.n ? Math.round(w.tone / w.n * 20) : 0 }));
  return _fjson({
    ready: true,
    total: heild,                 // RAUNFJÖLDI (ekki afskorinn); `capped` segir hvort sýnið var takmarkað
    capped, sample: items.length, // sýnið sem tónn/miðla-dreifing byggir á
    items: items.slice(0, 20).map((n) => ({ title: n.title, link: n.url, source: n.source, date: n.date })),
    timeline, sentiment, stats,   // sentiment: {idx,scored,pos,neg,bySource} · stats: {sources,perDay,days,sourceCount}
    ordspor,                      // {score 0-100|null, tone, trend, n, conf, label} — sjá lib/ordspor.mjs
  }, 300);
}

async function newsCount(env, terms, days) {
  if (!env.TENGSL || !terms || !terms.length) return 0;
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const vars = [...new Set(terms.flatMap(_searchVariants))].slice(0, 60);
  if (!vars.length) return 0;
  const clauses = vars.map(() => 'body LIKE ?').join(' OR ');
  const r = await env.TENGSL.prepare('SELECT COUNT(*) AS c FROM news WHERE ts>=? AND (' + clauses + ')')
    .bind(since, ...vars).first().catch(() => null);
  return (r && r.c) || 0;
}
