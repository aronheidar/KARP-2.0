import { greinaSql, GREINAR } from './src/lib/greinar.mjs';
import { CAT, sectionOfType, asciiId } from './src/lib/frettavel-cat.mjs';
import { buildTimalina } from './src/lib/firma-timalina.mjs';
import { aggregateFirma } from './src/lib/firma-greining.mjs';
import { canon as kycCanon, hash as kycHash, signalEvents as kycSignalEvents, deriveRisk as kycDeriveRisk } from './src/lib/kyc.mjs';
import { traceUbo as kycTraceUbo } from './src/lib/ubo-core.mjs';   // hrein obeint/endanlegt UBO-rakning
import { accountId, tierFields } from './src/lib/account.mjs';   // firma-account (sæta-sameign v1) — resolver + tierFields
import { EMAIL_TYPES, resolveEmail, renderEmail, validateEmail } from './src/lib/emails.mjs';   // póst-sniðmát: skrá + yfirskriftir stjórnanda
import { matchItem, matchKeyword, matchNews, feedFor, newSince, ALL_SECTORS } from './src/lib/lobbyvakt.mjs';   // Lobbývakt — hrein rökvél (síun/röðun/nýtt-síðan/taxonomy) + matchNews (efnisvakt-fréttir)
import { byggMatch, rankMovement, ratingMovement, criticalDrop, criticalNotice, noticeRef } from './src/lib/vaktir-signals.mjs';   // Byggingar-vöktun + greina-vöktun + einkunn-átt + strax-viðvaranir (eftirlit/gjaldþrot)
import { sectorsFromMap, herfindahl, toppNShare, sectorForIsat } from './src/lib/atvinnugrein.mjs';   // Atvinnugreinar v1 — hrein rökvél (hópun map→greinar, HHI, topp-N) + sectorForIsat (grein-rank)
import { leikurHandler } from '../src/lib/leikur/server.mjs';   // RÁS-Leikurinn (kennsluleikur) — /api/leikur/*
import { _ajson, _b64u, _cdata, _dget, _emailOvSet, _emailTpl, _esc, _fjson, _fromB64, _hmac, _te, _tokenHex, ddmmyyyy, erLogadili, htmlEsc, isoDate, ktSep, repAll, sendGmail, sjson } from './src/worker/felag.mjs';
import { REPORT_QUOTA, _U_BLOBS, _acctOfUid, _freeAll, _inviteEligible, _ktwatchCap, _monthStr, _nextMonth, _prefGet, _prefSet, _seatsCap, _sendVerifyEmail, _svcOk, accountOwner, authForgotHandler, authLoginHandler, authLogoutHandler, authRegisterHandler, authResendVerifyHandler, authResetHandler, authSaveKtHandler, authVerifyHandler, grantReportD1, grantSubD1, readSession, trialUsedD1, userPayload } from './src/worker/auth.mjs';
import { askellSessionHandler, askellWebhookHandler, payCallbackHandler, payCheckoutHandler, payReturnHandler, stakCheckoutHandler, stakConfirmHandler, sub2CheckoutHandler, sub2ConfirmHandler, subCancelHandler } from './src/worker/greidslur.mjs';
import { RSK_ROT, _isStem, _kycAfterEvents, _kycRunDiff, _lobbyGate, atvinnugreinHandler, computeGreinRank, greinRankHandler, kycHandler, leiHandler, leyfiHandler, lobbyvaktHandler, loftforHandler, newsSince, roadsSectorsHandler, rskErFyrirtaeki, rskHandler, rskProxyHandler, sanctionsHandler, tengslStatsHandler, tengslanetHandler, topplistarHandler, vanskilHandler } from './src/worker/veitur.mjs';
import { FRETTA_TYPES, _mentions, _rssItems, digestRun, eftirlitCriticalCron, fetchNews, kycCriticalCron, kycDiffCron, logbirtingCriticalCron, newsIngest, newsSearch } from './src/worker/cron.mjs';
import { adminEmailHandler, adminOverviewHandler, adminRefreshHandler, adminSendHandler, adminSetTypeHandler, adminSyncHandler, adminUserHandler } from './src/worker/stjornbord.mjs';
import { augGet } from './src/worker/felag.mjs';
import { _kycGate, _searchVariants, rg } from './src/worker/veitur.mjs';
import { authMeHandler, karpUserId } from './src/worker/auth.mjs';
import { firmaHandler, ordsporCron } from './src/worker/cron.mjs';
import { _isAdmin } from './src/worker/stjornbord.mjs';
export { maskaKortSvar, tengslGrunnurEnrich, topplistaBody, topplistaEntitled } from './src/worker/veitur.mjs';   // endur-export: prófin flytja inn úr worker.js
// karp21 Worker (LOTA 13): þjónar static-assets ÁFRAM en bætir við smá-proxy-um
// fyrir lifandi gögn sem hafa ekki CORS fyrir karp.is. Skyndiminni í caches.default.
const PROXIES = {
  // ✈️ OpenSky: lifandi flug yfir Íslandi (bbox). 5-mín cache heldur okkur innan kvóta.
  '/api/flug': {
    url: 'https://opensky-network.org/api/states/all?lamin=62.5&lomin=-26&lamax=67.5&lomax=-12',
    ttl: 300,
  },
  // 📋 Útboðsvefur (WP REST): nýjustu útboð — 30 mín cache
  '/api/utbod': {
    url: 'https://utbodsvefur.is/wp-json/wp/v2/posts?per_page=20&_fields=id,date,title,link',
    ttl: 1800,
  },
  // 🌍 Google News: Ísland í erlendum miðlum (RSS) — 15 mín cache
  '/api/erlent': {
    url: 'https://www.bing.com/news/search?q=Iceland&format=rss',
    ttl: 900,
    type: 'text/xml; charset=utf-8',
  },
  // 📄 TED: EES-útboð á Íslandi — POST í uppruna, GET út — 60 mín cache
  '/api/ted': {
    url: 'https://api.ted.europa.eu/v3/notices/search',
    ttl: 3600,
    post: JSON.stringify({ query: 'place-of-performance IN (ISL) SORT BY publication-date DESC', fields: ['publication-number', 'notice-title', 'publication-date'], limit: 20 }),
  },
  // 🏛️ Alþingi: lifandi málalisti þingsins (XML) — 10 mín cache
  '/api/thingmal': {
    url: 'https://www.althingi.is/altext/xml/thingmalalisti/?lthing=157',
    ttl: 600,
    type: 'text/xml; charset=utf-8',
  },
  // 💬 Samráðsgátt: nýjustu mál í samráði — opin GraphQL-gátt island.is — 30 mín cache
  '/api/samrad': {
    url: 'https://island.is/api/graphql',
    ttl: 1800,
    post: JSON.stringify({ query: 'query { consultationPortalGetCases(input: {pageSize: 15, pageNumber: 0}) { total cases { id caseNumber name statusName typeName institutionName adviceCount created processEnds } } }' }),
  },
};

// ⚖️ Dómavakt: Hæstiréttur + Landsréttur bera nýjustu dóma í __NEXT_DATA__ á
// /domar/-síðunum (sama Next.js-vél). Sótt samhliða, aðeins visibleVerdicts
// skilað (örfá KB í stað ~850 KB á síðu). 45 mín cache.
const DOMAR = [
  { key: 'hr', url: 'https://www.haestirettur.is/domar/' },
  { key: 'lr', url: 'https://www.landsrettur.is/domar-og-urskurdir/' },
];
function extractVerdicts(html) {
  const i = html.indexOf('__NEXT_DATA__');
  if (i < 0) return [];
  const m = html.slice(i).match(/>({[\s\S]*?})<\/script>/);
  if (!m) return [];
  let j;
  try { j = JSON.parse(m[1]); } catch (e) { return []; }
  const find = (o, d) => {
    if (!o || typeof o !== 'object' || d > 12) return null;
    if (Array.isArray(o.visibleVerdicts)) return o.visibleVerdicts;
    for (const k of Object.keys(o)) { const r = find(o[k], d + 1); if (r) return r; }
    return null;
  };
  return (find(j.props, 0) || []).map((v) => ({
    id: v.id, nr: v.caseNumber, titill: v.title, dags: v.verdictDate,
    efnisord: (v.keywords || []).slice(0, 4),
    um: String(v.presentings || '').slice(0, 220),
  }));
}
// 🤖 Spyrðu Karp: grundað spjall — svarar EINGÖNGU úr samhengispakka síðunnar
// (web/public/gogn/spyrdu_context.json, bakaður úr gogn/ við hverja byggingu).
// Lykill er CF-secret (ANTHROPIC_API_KEY) — sé hann ósettur svarar veitan
// {error:'unconfigured'} og framendinn birtir „í gangsetningu". 20 svör/dag/IP.
let SPYRDU_CTX = null;
// Fuzzy nafna-samsvörun sem þolir íslenskar beygingar — ber saman FORSKEYTI orða (6 stafir)
// svo „Guðlaugi Þór Þórðarsyni" (þáguf.) passi við „Guðlaugur Þór Þórðarson" (nefnif.).
function nmScore(ql, nafn) {
  const stems = String(nafn || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 5).map((w) => w.slice(0, Math.min(w.length, 6)));
  return stems.filter((st) => ql.includes(st)).length;
}
function nmBest(ql, arr, key) { let best = null, bs = 0; for (const x of arr || []) { const s = nmScore(ql, key ? x[key] : x); if (s > bs) { bs = s; best = x; } } return bs > 0 ? best : null; }
const AUG = [
  { rx: /sjóð|stefni/i, file: 'sjodir.json', pg: '/markadir/', fn: (j) => {
    const f = (j.funds || []).slice().sort((a, b) => (b.chg1y || -99) - (a.chg1y || -99));
    if (!f.length) return '';
    return 'SJÓÐIR STEFNIS (' + f.length + ' sjóðir, gengi ' + (f[0].date || '') + '): bestu sl. 12 mán: '
      + f.slice(0, 5).map((x) => x.name + ' ' + (x.chg1y > 0 ? '+' : '') + x.chg1y + '%').join('; ')
      + '. Lökustu: ' + f.slice(-2).map((x) => x.name + ' ' + (x.chg1y > 0 ? '+' : '') + x.chg1y + '%').join('; ') + '.';
  } },
  { rx: /kortagengi|kortaálag|gengi|evr(a|u|an)|dollar|pund|gjaldmiðl/i, file: 'gjaldmidlar.json', pg: '/markadir/', fn: (j) => {
    const s = j.sources || {}, bank = ((s.Bank || {}).rates || []), cb = ((s.CentralBank || {}).rates || []), kort = ((s.Credit || {}).rates || []);
    const pick = (arr, c) => arr.find((r) => r.c === c) || {};
    const line = (c) => { const b = pick(bank, c), m = pick(cb, c), k = pick(kort, c); const alag = k.sell && m.buy ? ' (kortaálag +' + ((k.sell / m.buy - 1) * 100).toFixed(1) + '%)' : ''; return c + ': kaup ' + b.buy + ' / sala ' + b.sell + ', SÍ-viðmið ' + m.buy + ', kort ' + (k.sell || '–') + alag; };
    return 'GENGISTÖFLUR ARION (' + ((s.Bank || {}).date || '') + ', kr per einingu): ' + ['USD', 'EUR', 'GBP', 'DKK'].map(line).join(' · ');
  } },
  { rx: /stýrivext|meginvext|dráttarvext|vaxtaferil|verðbólg|gengisvísit|reibor|peningamag|raunvext|vaxtaákv|seðlabank|\bvext|vaxta|krón(an|unnar|una)/i, file: 'sedlabanki.json', pg: '/vextir/', fn: (j) => {
    const h = j.headline || {}, d = j.datasets || {}, parts = [];
    if (h.meginvextir) parts.push('Meginvextir (stýrivextir) ' + h.meginvextir.value + '% frá ' + h.meginvextir.date);
    if (h.verdbolga) parts.push('12-mán verðbólga ' + h.verdbolga.value + '% (' + h.verdbolga.date + ')');
    if (h.meginvextir && h.verdbolga) parts.push('raunstýrivextir ~' + (h.meginvextir.value - h.verdbolga.value).toFixed(1) + '%');
    if (h.gengisvisitala) parts.push('gengisvísitala ' + Math.round(h.gengisvisitala.value * 10) / 10 + ' (hærri=veikari króna)');
    if (h.evra) parts.push('EUR ' + h.evra.value + ' kr');
    if (h.dollari) parts.push('USD ' + h.dollari.value + ' kr');
    const dv = ((d.drattarvextir || {}).series || [])[0], dvp = dv && dv.points.length ? dv.points[dv.points.length - 1][1] : null;
    if (dvp) parts.push('dráttarvextir ' + dvp + '%');
    const pv = (d.parvextir || {}).series || [], lastId = (id) => { const s = pv.find((x) => x.id === id); return s && s.points.length ? s.points[s.points.length - 1][1] : null; };
    const o10 = lastId(30103), v10 = lastId(30106);
    if (o10 != null && v10 != null) parts.push('10-ára ríkisvextir óvtr ' + o10 + '% / vtr ' + v10 + '% → verðbólguálag markaðar ~' + (o10 - v10).toFixed(1) + '%');
    return 'SEÐLABANKI ÍSLANDS (' + (h.meginvextir ? h.meginvextir.date : (j.updated || '').slice(0, 10)) + '): ' + parts.join('; ') + '.';
  } },
  { rx: /fasteign|íbúðaverð|fermetr|húsnæðisverð|kaupverð/i, file: 'fasteignir.json', pg: '/fasteignir/', fn: (j, q) => {
    const m = (j.months || [])[j.months.length - 1];
    let out = m ? 'FASTEIGNAVERÐ (' + m.m + ', miðgildi): höfuðborgarsvæði ' + m.hbsv.vp + ' m.kr (' + m.hbsv.m2 + ' þ.kr/m², ' + m.hbsv.n + ' kaup); landsbyggð ' + m.land.vp + ' m.kr (' + m.land.m2 + ' þ.kr/m²).' : '';
    const ql = q.toLowerCase();
    for (const sv of Object.keys(j.byMuni || {})) {
      const root = sv.toLowerCase().replace(/(borg|bær|kaupstaður|hreppur)$/i, '');
      if ([root, root.slice(0, -1), root.slice(0, -2)].some((r) => r && r.length >= 4 && ql.includes(r))) {
        const b = j.byMuni[sv];
        out += ' Í ' + sv + ' (12 mán): miðgildi ' + b.m2 + ' þ.kr/m² (fjórðungabil ' + b.p25 + '–' + b.p75 + ', ' + b.n + ' kaup)' + (b.types ? Object.entries(b.types).map(([t, v]) => '; ' + t + ' ' + v.m2 + ' þ/m²').join('') : '') + '.';
        break;
      }
    }
    return out;
  } },
  { rx: /uppboð|nauðungar/i, file: 'uppbod.json', pg: '/vaktir/', fn: (j) => {
    const r = (j.rows || []);
    if (!r.length) return '';
    const today = new Date().toISOString().slice(0, 10);
    const naestu = r.filter((x) => x.d >= today && !/lokið/i.test(x.teg || '')).slice(0, 3);
    const lokid = r.filter((x) => /lokið/i.test(x.teg || '')).length;
    return 'NAUÐUNGARSÖLUR (opinberar auglýsingar sýslumanna, ' + r.length + ' á skrá, þar af ' + lokid + ' merktar „Sölu lokið“): '
      + (naestu.length ? 'framundan: ' + naestu.map((x) => x.a + ' (' + x.teg + ' ' + x.d + ')').join('; ') : 'engin auglýst framundan í augnablikinu — nýjar auglýsingar birtast þegar sýslumenn setja þær fram') + '.';
  } },
  { rx: /dóm(ur|a|ar|s|i)|hæstarétt|hæstirétt|landsrétt/i, file: 'domar_ai.json', pg: '/vaktir/', fn: (j) => {
    const e = Object.entries(j.byNr || {}).sort((a, b) => String(b[1].d).localeCompare(String(a[1].d))).slice(0, 3);
    if (!e.length) return '';
    return 'NÝJUSTU DÓMAR (á mannamáli): ' + e.map(([k, v]) => (k.startsWith('hr') ? 'Hæstiréttur' : 'Landsréttur') + ' ' + k.split(':')[1] + ' (' + v.svid + '): ' + v.einfalt).join(' · ');
  } },
  { rx: /könnun|fylgi|skoðanakönnun/i, file: 'polls.json', pg: '/kannanir/', fn: (j) => {
    const p = (j.polls || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!p.length) return '';
    const nm = j.parties || {};
    const line = (k) => Object.entries(k.v || {}).sort((a, b) => b[1] - a[1]).map(([f, v]) => (nm[f] && nm[f].n ? nm[f].n : f) + ' ' + v + '%').join(', ');
    return 'NÝJASTA KÖNNUN (' + p[0].pollster + ' ' + p[0].date + '): ' + line(p[0]) + (p[1] ? '. Þar á undan (' + p[1].pollster + ' ' + p[1].date + '): ' + line(p[1]) : '') + '.';
  } },
  // ── LOTA 61: sveitarstjórar/bæjarstjórar ──
  { rx: /(bæjar|sveitar|borgar)stjór|oddvit|hver stjórnar|hver ræður.*(bæ|sveitarfélag)/i, file: 'sveitarstjorar.json', pg: '/sveitarfelog/', fn: (j, q) => {
    const bn = j.byName || {}, ql = q.toLowerCase();
    for (const [name, v] of Object.entries(bn)) {
      const root = name.toLowerCase().replace(/(borg|bær|kaupstaður|hreppur|byggð|bæjar)$/i, '');
      if (ql.includes(name.toLowerCase()) || (root.length >= 4 && ql.includes(root))) {
        return 'SVEITARSTJÓRI ' + name + ': ' + (v.stjoriTitill || 'Sveitarstjóri') + ' er ' + v.stjori + (v.radhus ? ' (ráðhús ' + v.radhus + ')' : '') + (v.vefur ? ', ' + v.vefur : '') + '.';
      }
    }
    const big = ['Reykjavíkurborg', 'Kópavogsbær', 'Hafnarfjörður', 'Reykjanesbær', 'Akureyrarbær', 'Garðabær'].map((n) => bn[n]).filter(Boolean);
    return 'SVEITARSTJÓRAR (dæmi, Karp á öll ' + Object.keys(bn).length + '): ' + big.map((v) => v.nafn + ': ' + v.stjori).join('; ') + '. Nefndu tiltekið sveitarfélag.';
  } },
  // ── ráðherrar / ríkisstjórn ──
  { rx: /ráðherra|ríkisstjórn|forsætis|ráðuneyt|hverjir stjórna landinu|í stjórn landsins/i, file: 'cabinet.json', pg: '/rikisstjorn/', fn: (j, q) => {
    const arr = Array.isArray(j) ? j : [], ql = q.toLowerCase();
    const byName = nmBest(ql, arr, 'nafn');
    if (byName) return 'RÁÐHERRA ' + byName.nafn + ' (' + (byName.flokur || byName.flok || '') + '): ' + (byName.emb || []).join(', ') + (byName.sidan ? ', frá ' + byName.sidan : '') + '.';
    const portf = ['forsætis', 'fjármála', 'heilbrigðis', 'utanríkis', 'dóms', 'mennta', 'barnamál', 'háskóla', 'umhverfis', 'orku', 'loftslags', 'innviða', 'atvinnuvega', 'matvæla', 'félags', 'húsnæðis', 'menningar'];
    const p = portf.find((x) => ql.includes(x));
    if (p) { const m = arr.find((mm) => (mm.emb || []).some((e) => e.toLowerCase().includes(p))); if (m) return (m.emb.join('/')) + ' er ' + m.nafn + ' (' + (m.flokur || m.flok) + ')' + (m.sidan ? ', frá ' + m.sidan : '') + '.'; }
    return 'RÍKISSTJÓRNIN (' + arr.length + ' ráðherrar): ' + arr.map((m) => (m.emb || []).join('/') + ' — ' + m.nafn + ' (' + (m.flokur || m.flok) + ')').join('; ') + '.';
  } },
  // ── þingmenn ──
  { rx: /þingm(a|e)nn|þingmað|alþingismað|á þingi|kjördæm/i, file: 'althingi.json', pg: '/althingi/thingmenn/', fn: (j, q) => {
    const arr = Array.isArray(j) ? j : [], ql = q.toLowerCase();
    const hit = nmBest(ql, arr, 'nafn');
    if (hit) return 'ÞINGMAÐUR ' + hit.nafn + ': ' + hit.flokkur + ', ' + hit.kjordaemi + (hit.aldur ? ', ' + hit.aldur + ' ára' : '') + (hit.adalmadur === false ? ' (varamaður)' : '') + (hit.fjoldiThinga ? ', hefur setið ' + hit.fjoldiThinga + ' þing' : '') + '.';
    const kj = arr.map((m) => m.kjordaemi).filter((v, i, a) => a.indexOf(v) === i).find((k) => { const kl = k.toLowerCase(); return kl.split(/\s+/).some((w) => w.length >= 5 && ql.includes(w.replace('kjördæmi', '').slice(0, 6))); });
    if (kj) { const inK = arr.filter((m) => m.kjordaemi === kj); return 'ÞINGMENN Í ' + kj + ' (' + inK.length + '): ' + inK.slice(0, 12).map((m) => m.nafn + ' (' + m.flokkur + ')').join(', ') + '.'; }
    return 'ALÞINGI: 63 þingmenn í 6 kjördæmum. Nefndu þingmann eða kjördæmi. Sjá /althingi/thingmenn/.';
  } },
  // ── frumvörp / þingmál (m/AI-samantektum) ──
  { rx: /frumvarp|frumvörp|þingmál|lagafrumvarp|lagabreyting|greidd.*atkvæði|hvernig kaus/i, file: 'frumvorp.json', pg: '/thingmal/', fn: (j, q) => {
    const arr = Array.isArray(j) ? j : (j.rows || []), ql = q.toLowerCase();
    const words = ql.replace(/[^a-záðéíóúýþæö ]/g, ' ').split(/\s+/).filter((w) => w.length >= 5);
    const hit = arr.find((b) => words.some((w) => (b.titill || '').toLowerCase().includes(w)));
    if (hit) return 'ÞINGMÁL „' + hit.titill + '" (' + hit.teg + (hit.d ? ', ' + hit.d : '') + ')' + (hit.ja != null ? ' — atkvæði: ' + hit.ja + ' já, ' + hit.nei + ' nei, ' + hit.fj + ' sátu hjá' : '') + (hit.sam ? '. ' + hit.sam : '') + '.';
    return 'ÞINGMÁL: Karp fylgist með ' + arr.length + ' málum þessa löggjafarþings með AI-samantektum og atkvæðagreiðslum. Nefndu efni málsins. Sjá /thingmal/.';
  } },
  // ── atvinnuleysi ──
  { rx: /atvinnuleys|atvinnulaus|án vinnu|vinnumarkað/i, file: 'atvinnuleysi.json', pg: '/vinnumarkadur/', fn: (j, q) => {
    const ql = q.toLowerCase();
    let out = 'ATVINNULEYSI: ' + j.latest + '% skráð (' + (j.updated || '') + ')' + (j.totalRegistered ? ', ' + j.totalRegistered + ' á skrá' : '') + '.';
    for (const [muni, v] of Object.entries(j.byMuni || {})) { const root = muni.toLowerCase().replace(/(borg|bær|kaupstaður|hreppur)$/i, ''); if (root.length >= 4 && ql.includes(root)) { out += ' Í ' + muni + ': ' + (v.rate != null ? v.rate + '%' : v) + (v.n ? ' (' + v.n + ' skráðir)' : '') + '.'; break; } }
    return out;
  } },
  // ── orka / raforka ──
  { rx: /rafork|orkuframleið|virkjun|vatnsafl|jarðvarm|vindork|græn.*orka|orkuskipt/i, file: 'orka.json', pg: '/orka/', fn: (j) => {
    const r = (j.rows || []).slice(-1)[0]; if (!r) return '';
    const ren = ((r.hydro + r.geo + (r.wind || 0)) / r.total * 100).toFixed(1);
    return 'RAFORKUFRAMLEIÐSLA (' + r.y + '): ' + Math.round(r.total) + ' GWh alls — vatnsafl ' + Math.round(r.hydro) + ', jarðvarmi ' + Math.round(r.geo) + ', vindur ' + (r.wind || 0) + ', eldsneyti ' + (r.fuel || 0) + '. Endurnýjanlegt ' + ren + '%.';
  } },
  // ── afbrot ──
  { rx: /afbrot|glæp|ofbeld|innbrot|refsi|brotaflokk|auðgunarbrot|fíkniefnabrot/i, file: 'glaepir.json', pg: '/afbrot/', fn: (j) => {
    const c = (j.national || {}).cats || {};
    return 'AFBROT (' + j.year + ', tilkynnt brot per 10.000 íbúa): hegningarlagabrot ' + j.national.hegn + ' — ofbeldi ' + c.ofbeldi + ', auðgunarbrot ' + c.audgun + ', fíkniefni ' + c.fikni + ', kynferðisbrot ' + c.kynf + ', umferðarlög ' + c.umferd + '. Heimild: Ríkislögreglustjóri.';
  } },
  // ── leiga ──
  { rx: /leigu|\bleiga\b|leigumarkað|leiguverð|leigjend/i, file: 'leiga.json', pg: '/fasteignir/', fn: (j, q) => {
    const l = j.latest || {}, ql = q.toLowerCase();
    let out = 'LEIGUVERÐ (' + (l.q || '') + ', miðgildi): ' + l.medM2 + ' kr/m² (' + l.n + ' þinglýstir samningar).';
    for (const [muni, v] of Object.entries(j.byMuni || {})) { const root = muni.toLowerCase().replace(/(borg|bær|kaupstaður|hreppur)$/i, ''); if (root.length >= 4 && ql.includes(root)) { out += ' Í ' + muni + ': ' + v.medM2 + ' kr/m²' + (v.medRent ? ', miðgildi leigu ' + v.medRent.toLocaleString('is') + ' kr' : '') + '.'; break; } }
    return out;
  } },
  // ── markaðir / hlutabréf ──
  { rx: /hlutabréf|úrvalsvísital|omxi|kauphöll|hlutafé|verð á bréf|gengi.*félag/i, file: 'markadir.json', pg: '/markadir/', fn: (j, q) => {
    const ql = q.toLowerCase();
    const idx = (j.indices || []).map((i) => i.name.split(' —')[0] + ' ' + i.price + ' (' + (i.chgPct > 0 ? '+' : '') + i.chgPct + '%)').join(', ');
    const stk = (j.stocks || []).find((s) => ql.includes((s.sym || '').toLowerCase())) || nmBest(ql, j.stocks || [], 'name');
    if (stk) return 'HLUTABRÉF ' + stk.name + ' (' + stk.sym + '): ' + stk.price + ' ' + (stk.cur || 'ISK') + ' (' + (stk.chgPct > 0 ? '+' : '') + stk.chgPct + '%). Vísitölur: ' + idx + '.';
    const mv = (j.stocks || []).slice().sort((a, b) => (b.chgPct || 0) - (a.chgPct || 0));
    return 'ÍSLENSKUR MARKAÐUR (' + (j.updated || '') + '): ' + idx + (mv[0] ? '. Mest upp: ' + mv[0].name + ' ' + (mv[0].chgPct > 0 ? '+' : '') + mv[0].chgPct + '%; mest niður: ' + mv[mv.length - 1].name + ' ' + mv[mv.length - 1].chgPct + '%' : '') + '.';
  } },
  // ── ívilnanir / styrkir ──
  { rx: /ívilnun|ívilnan|\bstyrk|endurgreiðsl|skattaafslát|opinber.*stuðning/i, file: 'ivilnanir.json', pg: '/ivilnanir/', fn: (j, q) => {
    const arr = Array.isArray(j) ? j : [], ql = q.toLowerCase();
    const hit = arr.find((x) => (x.nafn || '').toLowerCase().split(/\s+/).some((w) => w.length >= 5 && ql.includes(w)));
    if (hit) return 'ÍVILNUN „' + hit.nafn + '" (' + hit.flokkur + ', ' + hit.stada + (hit.fra ? ', frá ' + hit.fra : '') + '): ' + (hit.lysing || '').slice(0, 200) + '.';
    return 'ÍVILNANIR: Karp fylgist með ' + arr.length + ' opinberum ívilnunum og styrkjum (kvikmyndir, nýsköpun, grænar fjárfestingar, o.fl.). Sjá /ivilnanir/.';
  } },
  // ── útboð ──
  { rx: /útboð|bjóða í verk|opinber verkefni|tender/i, file: 'utbod.json', pg: '/utbod/', fn: (j) => {
    const t = j.tenders || j.rows || []; if (!t.length) return '';
    return 'OPINBER ÚTBOÐ: ' + (j.n || t.length) + ' virk í safni Karp. Nýjust: ' + t.slice(0, 3).map((x) => '„' + (x.t || '').slice(0, 50) + '"' + (x.buyer ? ' (' + x.buyer + ')' : '')).join('; ') + '. Leit, flokkar og vaktir á /utbod/.';
  } },
  // ── birgjar / greiðslur ríkisins ──
  { rx: /birgj|greiðsl.*rík|ríkið greið|hver fær.*greitt|opinber.*reikning|stærsti birgir/i, file: 'birgjar.json', pg: '/birgjar/', fn: (j, q) => {
    const v = j.vendors || [], ql = q.toLowerCase();
    const mk = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' ma.kr' : Math.round(n / 1e6) + ' m.kr');
    const hit = nmBest(ql, v, 'n');
    if (hit) return 'GREIÐSLUR RÍKISINS til ' + hit.n + ': ' + mk(hit.t) + ' (' + (j.fra || '') + '–' + (j.til || '') + ')' + (hit.o ? ', stærsti kaupandi ' + hit.o : '') + '.';
    return 'STÆRSTU BIRGJAR RÍKISINS (' + (j.fra || '') + '–' + (j.til || '') + '): ' + v.slice(0, 5).map((x) => x.n + ' ' + mk(x.t)).join('; ') + '. Alls: ' + mk(j.grandTotal || 0) + '. Sjá /birgjar/.';
  } },
];
async function augment(env, q) {
  const parts = [];
  for (const a of AUG) {
    if (parts.length >= 3) break;
    if (!a.rx.test(q)) continue;
    const j = await augGet(env, a.file);
    if (!j) continue;
    try { const t = a.fn(j, q); if (t) parts.push(t.slice(0, 900) + ' (sjá ' + a.pg + ')'); } catch (e) {}
  }
  return parts;
}

// LOTA 80: draga fyrirtækjanafn/kt úr spurningu — orða-sía (\b virkar ekki á íslenska stafi í JS)
const FIRMA_STOP = new Set(['hver', 'hverjir', 'hvað', 'hvaða', 'á', 'eiga', 'er', 'eru', 'sé', 'séu', 'eigandi', 'eigendur', 'raunverulegir', 'raunverulegur', 'raunveruleg', 'í', 'vanskilum', 'vanskil', 'vanskilaskrá', 'með', 'fyrirtækið', 'fyrirtækinu', 'félagið', 'félaginu', 'fyrirtæki', 'félag', 'kennitala', 'kennitölu', 'kt', 'hjá', 'um', 'the', 'og', 'eða', 'skuldar', 'skuld', 'skuldir', 'stjórn', 'forráðamaður', 'forráðamenn', 'skráðir', 'það', 'þetta', 'hlutafé', 'hluthafar', 'ársreikning', 'ársreikninga', 'ársreikningi', 'ársreikningum', 'ársreikninginn', 'ársreikningana', 'ársreikningaskil', 'skil', 'skilað', 'hvort', 'núna', 'nú', 'borgar', 'greiðir', 'atvinnugrein', 'heimilisfang', 'stofnað', 'stofnaður', 'hvenær', 'aflamark', 'aflamarki', 'kvóti', 'kvóta', 'kvótann', 'aflaheimild', 'aflaheimildir', 'veiðiheimild', 'gjaldþrota', 'gjaldþrot', 'þrot', 'þroti', 'vörumerki', 'vörumerkið', 'vörumerkjum', 'einkaleyfi', 'starfsleyfi', 'leyfi', 'eftirlit', 'eftirliti', 'loftför', 'loftfar', 'flugvél', 'flugvélar', 'þyrla', 'skip', 'skipa', 'bát', 'bátur', 'refsilista', 'refsilistum', 'þvingunar', 'mikið', 'mikinn', 'mikla', 'mörg', 'margar', 'marga', 'skráð', 'skráða', 'hefur', 'hafa', 'fær', 'fékk', 'hversu', 'hve', 'til']);
function firmaNafn(q) {
  const kt = (String(q).match(/\b(\d{6}-?\d{4})\b/) || [])[1];
  if (kt) return kt.replace('-', '');
  return String(q).toLowerCase().replace(/[?.!,]/g, ' ').split(/\s+/).filter((w) => w && !FIRMA_STOP.has(w)).join(' ').trim();
}
// lifandi fyrirtækja-uppfletting fyrir Spyrðu Karp (eigendur, vanskil, grunnur — sömu veitur og /fyrirtaeki)
async function firmaLookup(q, ctx, env) {
  const nafn = firmaNafn(q);
  if (nafn.length < 2) return null;
  const call = async (kt_or_nafn) => { const r = await fyrirtaekiHandler(new Request('https://k.internal/api/fyrirtaeki?q=' + encodeURIComponent(kt_or_nafn)), env, ctx); return r.json().catch(() => null); };
  let d = await call(nafn);
  let f = d && d.felag;
  if (!f && d && d.hits && d.hits.length) {
    // velja BESTA treffið (nákvæm nafn-samsvörun), ekki hits[0] — „brim" → Brim hf, ekki „BBF 2014 ehf"
    const nn = (s) => String(s || '').toLowerCase().replace(/\b(ehf|hf|slhf|ohf|sf|slf|bs)\b\.?/g, '').replace(/[^a-záðéíóúýþæö0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const qn = nn(nafn);
    const best = d.hits.find((h) => nn(h.nafn) === qn) || d.hits.find((h) => nn(h.nafn).startsWith(qn + ' ')) || d.hits[0];
    const d2 = await call(best.kt); f = d2 && d2.felag;
  }
  if (!f) return null;
  const bits = ['FYRIRTÆKI ' + f.nafn + ' (kt. ' + f.kt + ')' + (f.afskrad ? ' — AFSKRÁÐ' : '') + (f.form ? ', ' + f.form : '') + (f.logheimili ? ', ' + f.logheimili : '') + '.'];
  if (f.eigendur && f.eigendur.length) bits.push('Raunverulegir eigendur: ' + f.eigendur.map((e) => e.nafn + (e.hlutur ? ' (' + e.hlutur + ')' : '') + (e.tegund ? ' – ' + e.tegund : '')).join('; ') + '.');
  else if (f.eigendurTomt) bits.push('Enginn einstaklingur skráður með raunverulegt eignarhald >25% (dæmigert fyrir skráð félög/dreift eignarhald).');
  if ((f.radamenn || []).length) bits.push('Forráðamaður: ' + f.radamenn.join(', ') + '.');
  if (f.isat && f.isat.length) bits.push('Atvinnugrein (ÍSAT): ' + f.isat.slice(0, 2).join('; ') + '.');
  try {
    const vr = await vanskilHandler(new Request('https://k.internal/api/vanskil?kt=' + f.kt), ctx);
    const vd = await vr.json().catch(() => null);
    if (vd && Array.isArray(vd.ar) && vd.ar.length) bits.push('⚠ Í vanskilum með ársreikningaskil: ' + vd.ar.map((x) => x.ar + ' (' + x.vanskil + ')').join(', ') + '.');
    else if (vd && Array.isArray(vd.ar)) bits.push('Engin vanskil á ársreikningaskilum (rekstrarár ' + (vd.skodud || []).join('/') + ').');
  } catch (e) {}
  // Opinberir styrkir (úthlutanir sjóða) — aðeins þegar spurt er um styrki/sjóði (forðast óþarfa
  // lestur á stórri skrá). ENGIN heimild birtir kt → matchStyrkir tengir á opinbera RSK-nafninu.
  try {
    if (env && /styrk|ívilnun|sjóð|úthlut/i.test(q)) {
      const sd = await augGet(env, 'styrkir.json');
      const mm = sd ? matchStyrkir(f.nafn, sd) : { idx: [] };
      if (mm.idx.length) {
        const rs = mm.idx.map((i) => sd.styrkir[i]).filter(Boolean);
        const tot = rs.reduce((a, r) => a + (r.upphaed || 0), 0);
        const bySj = {}; rs.forEach((r) => { bySj[r.sjodur] = (bySj[r.sjodur] || 0) + 1; });
        const topp = rs.slice().sort((a, b) => (b.ar - a.ar) || (b.upphaed - a.upphaed)).slice(0, 4)
          .map((r) => r.sjodur + ' ' + r.ar + ' ' + styrkKr(r.upphaed) + (r.verkefni ? ' („' + String(r.verkefni).slice(0, 40) + '“)' : ''));
        bits.push('Opinberir styrkir' + (mm.naemi === 'nafn' ? ' (nafnatenging)' : '') + ': ' + rs.length + ' úthlutanir, samtals ~' + styrkKr(tot)
          + ' úr ' + Object.keys(bySj).length + ' sjóðum (' + Object.entries(bySj).map(([s, c]) => s + ' ' + c).join(', ') + '). Dæmi: ' + topp.join('; ') + '.');
      }
    }
  } catch (e) {}
  // ── Efnis-gátaðar auðganir (aðeins þegar spurt er um efnið → forðast óþörf handler-köll) ──
  try {
    if (/gjaldþrot|þrot|innköll|skipt|lögbirt|félagsslit|nauðasamn|árangurslaus|fjárnám/i.test(q)) {
      const ld = await (await logbirtingHandler(new Request('https://k.internal/api/logbirting?kt=' + f.kt), env, ctx)).json().catch(() => null);
      if (ld && ld.holdur && (ld.tilkynningar || []).length) {
        const mx = ld.tilkynningar.reduce((m, n) => Math.max(m, n.alvarleiki || 0), 0);
        bits.push((mx >= 2 ? '⚠ ' : '') + 'Lögbirtingablaðið: ' + ld.count + ' tilkynning' + (ld.count > 1 ? 'ar' : '') + ' — ' + ld.tilkynningar.slice(0, 3).map((n) => n.tegundHeiti + (n.dagsetning ? ' ' + n.dagsetning : '')).join('; ') + '.');
      } else bits.push('Engar tilkynningar í Lögbirtingablaðinu (gjaldþrot/innkallanir/félagsslit).');
    }
  } catch (e) {}
  try {
    if (/aflamark|kvóti|kvóta|aflaheimild|aflahlutdeild|veiðiheimild|þorskígild/i.test(q)) {
      const kd = await (await kvotiHandler(new Request('https://k.internal/api/kvoti?kt=' + f.kt), env, ctx)).json().catch(() => null);
      if (kd && kd.holdur && kd.torskigildi) {
        const tn = (kg) => Math.round(kg / 1000).toLocaleString('is-IS') + ' t';
        bits.push('Aflamark (fiskveiðiár ' + String(kd.timabil || '').replace(/(\d\d)(\d\d)/, '20$1/20$2') + '): þorskígildi ' + tn(kd.torskigildi.aflamark) + ' aflamark, ' + tn(kd.torskigildi.stada) + ' eftir — ' + (kd.nTeg || 0) + ' tegundir' + (kd.nSkip ? ', ' + kd.nSkip + ' skip' : '') + '.');
      }
    }
  } catch (e) {}
  try {
    if (/vörumerk|trademark|einkaleyf|hugverk/i.test(q)) {
      const vd = await (await vorumerkiHandler(new Request('https://k.internal/api/vorumerki?kt=' + f.kt + '&nafn=' + encodeURIComponent(f.nafn)), ctx)).json().catch(() => null);
      if (vd && vd.holdur) bits.push('Skráð vörumerki (Hugverkastofa): ' + vd.n + ' — ' + (vd.merki || []).slice(0, 4).map((m) => m.titill || m.id).join(', ') + '.');
    }
  } catch (e) {}
  try {
    if (/starfsleyf|eftirlit|matvælaeftirlit|heilbrigðiseftirlit|\bmast\b|\bleyfi\b/i.test(q)) {
      const md = await (await mastHandler(new Request('https://k.internal/api/mast?nafn=' + encodeURIComponent(f.nafn)), ctx)).json().catch(() => null);
      if (md && md.holdur) bits.push('MAST starfsleyfi/eftirlit (landsdekkandi): ' + md.n + ' starfsstöðvar — ' + (md.stodvar || []).slice(0, 3).map((s) => s.baer || s.nr).filter(Boolean).join(', ') + '.');
    }
  } catch (e) {}
  return bits.join(' ').slice(0, 1200) + ' (sjá /fyrirtaeki/)';
}

async function spyrduHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' });
  if (!env.ANTHROPIC_API_KEY) return sjson({ error: 'unconfigured' });
  let q = '', hist = [];
  try {
    const body = (await request.json()) || {};
    q = String(body.q || '').trim();
    // LOTA 51: allt að ÞRJÁR umferðir af samtalssögu ({q,a}-pör); prev = eldra lagið
    const raw = Array.isArray(body.hist) ? body.hist : (body.prev && body.prev.q && body.prev.a ? [body.prev] : []);
    hist = raw.filter((x) => x && x.q && x.a).slice(-3).map((x) => ({ q: String(x.q).slice(0, 300), a: String(x.a).slice(0, 1200) }));
  } catch (e) { return sjson({ error: 'body' }); }
  if (q.length < 3 || q.length > 300) return sjson({ error: 'lengd' });
  // 🆘 Hjálpar-regla: beiðni um aðstoð / „virkar ekki" / vandamál / villa → vísa beint
  // á /hjalp/ (ekkert AI-kall, engin kvóta-notkun). Linkify í framendanum gerir /hjalp/ smellanlegt.
  if (/virkar ekki|virkar illa|virki ekki|bilun|bilað|hrundi|hrynur|kemur villa|villa (í|á|kom|kemur|við)|villu(r)? (í|á)|vandamál|vandræð|kvörtun|kvarta|endurgreiðsl|get ekki (skráð|innskráð|logga|greitt|borgað|opnað)|kemst ekki inn|hafa samband|samband við (ykkur|karp)|tala við (ykkur|manneskju|einhvern|starfsmann)|þarf (aðstoð|hjálp)|fá (aðstoð|hjálp)|biðja um (aðstoð|hjálp)|hjálpar?síð|^\s*(hjálp|help|aðstoð)[!.?\s]*$/i.test(q)) {
    return sjson({ svar: 'Hljómar eins og þú þurfir aðstoð frá okkur mannfólkinu. 🐟 Sendu okkur línu á /hjalp/ — lýstu vandamálinu þar og við svörum á netfangið þitt, yfirleitt samdægurs. Ef spurningin var um gögnin sjálf máttu líka spyrja mig aftur með öðru orðalagi.' });
  }
  // Dagskvóti á IP (cache-byggt, per-gagnaver — gróft en heiðarlegt öryggisnet)
  const cache = caches.default;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const ipKey = new Request('https://cache.karp.internal/spyrdu-ip/' + day + '/' + encodeURIComponent(ip));
  const qhit = await cache.match(ipKey);
  const n = qhit ? parseInt(await qhit.text(), 10) || 0 : 0;
  if (n >= 20) return sjson({ error: 'kvoti' });
  ctx.waitUntil(cache.put(ipKey, new Response(String(n + 1), { headers: { 'cache-control': 'public, max-age=86400' } })));
  if (!SPYRDU_CTX) {
    try { SPYRDU_CTX = await (await env.ASSETS.fetch(new Request('https://karp.internal/gogn/spyrdu_context.json'))).json(); } catch (e) { SPYRDU_CTX = { text: '', pages: '', updated: '' }; }
  }
  const aug = await augment(env, q);
  // LOTA 80: lifandi fyrirtækja-uppfletting (eigendur/vanskil/grunnur) þegar spurt er um félag
  if (aug.length < 3 && /(eigend|eigandi|hver á|hvað á|raunveruleg|vanskil|kennitöl|ehf|ohf|\bhf\b|félag[ií]|fyrirtæk|forráðamað|hlutafé|aflamark|kvót|aflaheimild|gjaldþrot|þrot|vörumerk|einkaleyf|starfsleyf|matvælaeftirlit|heilbrigðiseftirlit|refsilist|þvingunar)/i.test(q)) {
    try { const t = await firmaLookup(q, ctx, env); if (t) aug.push(t); } catch (e) {}
  }
  // ✈️ Loftfaraleit í spjallinu — TF-númer eða nafn/eigandi → island.is aircraftRegistryAllAircrafts
  if (aug.length < 3 && /\btf-?\s?[a-záðéíóúýþæö]{2,4}\b|loftfar|flugvél|þyrl/i.test(q)) {
    try {
      const m = q.toUpperCase().match(/TF-?\s?([A-ZÁÐÉÍÓÚÝÞÆÖ]{2,4})/);
      const term = m ? 'TF-' + m[1] : firmaNafn(q);
      if (term && term.replace(/\W/g, '').length >= 2) {
        const ld = await (await loftforHandler(new Request('https://k.internal/api/loftfor?q=' + encodeURIComponent(term)), env, ctx)).json().catch(() => null);
        const acs = (ld && ld.loftfor) || [];
        if (acs.length) {
          const a0 = acs[0], eig = (a0.eigendur || []).map((e) => e.nafn).join(', ');
          aug.push('LOFTFAR ' + (a0.skrnr || term) + (a0.tegund ? ' (' + a0.tegund + (a0.argerd ? ', árg. ' + a0.argerd : '') + ')' : '') + (eig ? ' — skráður eigandi: ' + eig : '') + (acs.length > 1 ? '. Alls ' + acs.length + ' loftför fundust í leitinni' : '') + '. (sjá /okutaeki-skip/?t=loft)');
        }
      }
    } catch (e) {}
  }
  const sys = 'Þú ert „Karp“, aðstoðarmaður á íslenska hagvísavefnum karp.is. Svaraðu á íslensku, skýrt og hnitmiðað (að hámarki ~170 orð); notaðu stutta upptalningu þegar bornar eru saman tölur. Notaðu EINGÖNGU staðreyndirnar og lifandi tölurnar hér að neðan og vísaðu alltaf á viðeigandi undirsíðu vefjarins (t.d. /verdlag/). Ef svarið er ekki í gögnunum: segðu það hreinskilnislega og bentu á líklegustu síðu til að skoða. Aldrei giska á tölur. Þú veitir hvorki fjármála- né lögfræðiráðgjöf.\n\nSTAÐREYNDIR KARP (' + (SPYRDU_CTX.updated || '') + '):\n' + SPYRDU_CTX.text
    + (aug.length ? '\n\nLIFANDI TÖLUR SEM EIGA VIÐ SPURNINGUNA:\n' + aug.join('\n') : '')
    + '\n\nSÍÐUR VEFJARINS:\n' + SPYRDU_CTX.pages;
  try {
    const msgs = [];
    hist.forEach((h) => { msgs.push({ role: 'user', content: h.q }); msgs.push({ role: 'assistant', content: h.a }); });
    msgs.push({ role: 'user', content: q });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 700, system: sys, messages: msgs }),
    });
    if (!res.ok) return sjson({ error: 'ai', status: res.status });
    const j = await res.json();
    const text = (j.content || []).map((b) => b.text || '').join('').trim();
    return sjson({ svar: text });
  } catch (e) {
    return sjson({ error: 'ai' });
  }
}

// 🆘 Hjálparbeiðnir (/hjalp/ ticket-formið) → tölvupóstur á hjalp@karp.is um sendGmail
// (Gmail API, F5 — WP-leiðin er farin). Vörn: honeypot, gild gögn, 1 beiðni/mín + 8/dag
// per IP (cache-byggt eins og spyrdu-dagskvótinn — gróft per-gagnaver en nóg gegn rusli).
// Bregðist sending → 'send'-villa og formið bendir á að senda beint á hjalp@karp.is.
const HJALP_FLOKKAR = ['Greiðslur & áskrift', 'Innskráning & aðgangur', 'Villa í gögnum', 'Leiðrétting', 'Annað'];
async function hjalpHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' }, 405);
  let b = null;
  try { b = (await request.json()) || {}; } catch (e) { return sjson({ error: 'body' }, 400); }
  // Honeypot útfylltur = vélmenni → þykjumst taka við (ekkert sent, engin vísbending)
  if (String(b.hp || '').trim() !== '') return sjson({ ok: true });
  const nafn = String(b.nafn || '').trim().slice(0, 120);
  const netfang = String(b.netfang || '').trim().slice(0, 160);
  const flokkur = HJALP_FLOKKAR.indexOf(String(b.flokkur || '')) !== -1 ? String(b.flokkur) : 'Annað';
  const lysing = String(b.lysing || '').trim();
  if (!nafn || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(netfang)) return sjson({ error: 'gogn' }, 400);
  if (lysing.length < 20 || lysing.length > 4000) return sjson({ error: 'gogn' }, 400);
  const cache = caches.default;
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const minKey = new Request('https://cache.karp.internal/hjalp-min/' + encodeURIComponent(ip));
  if (await cache.match(minKey)) return sjson({ error: 'rate' }, 429);
  const day = new Date().toISOString().slice(0, 10);
  const dayKey = new Request('https://cache.karp.internal/hjalp-dag/' + day + '/' + encodeURIComponent(ip));
  const dh = await cache.match(dayKey);
  const n = dh ? parseInt(await dh.text(), 10) || 0 : 0;
  if (n >= 8) return sjson({ error: 'rate' }, 429);
  ctx.waitUntil(cache.put(minKey, new Response('1', { headers: { 'cache-control': 'public, max-age=60' } })));
  ctx.waitUntil(cache.put(dayKey, new Response(String(n + 1), { headers: { 'cache-control': 'public, max-age=86400' } })));
  // F5: hjálparbeiðni send með Gmail (áður WP wp_mail). Reply-To = notandinn svo svar fer beint.
  const fra = String(b.fra || '').slice(0, 300);
  const html = '<div style="font-family:system-ui,Arial,sans-serif;color:#222;max-width:560px">'
    + '<h3 style="color:#8a5e00;margin:0 0 10px">Ný hjálparbeiðni — ' + _esc(flokkur) + '</h3>'
    + '<p style="margin:4px 0"><b>Nafn:</b> ' + _esc(nafn) + '<br><b>Netfang:</b> ' + _esc(netfang) + '</p>'
    + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px;margin:14px 0">' + _esc(lysing) + '</p>'
    + '<p style="color:#999;font-size:12px">Frá: ' + _esc(fra || '—') + ' · innskráð: ' + (b.innskraning === true ? 'já' : 'nei') + ' · IP: ' + _esc(ip) + '</p></div>';
  const htpl = await _emailTpl(env, 'hjalp');
  const r = await sendGmail(env, { to: env.HJALP_TO || 'hjalp@karp.is', replyTo: netfang, subject: renderEmail(htpl.subject, { flokkur, nafn }), html });
  return r.ok ? sjson({ ok: true }) : sjson({ error: 'send' }, 502);
}

// 💸 Greiðsluvakt: opnirreikningar.is (Fjársýslan) — DataTables-bakendinn svarar
// GET /data_pagination_search sé FULLT DataTables-sett sent OG tímabil (DD.MM.YYYY;
// tómt tímabil → 500). Glugginn reiknast af /rest/max_time_period. 3 klst cache.
function dtQuery(fra, til) {
  const cols = ['org_name', 'check_date', 'vendor_name', 'invoice_amount', 'check_amount', '5'];
  const P = new URLSearchParams();
  P.set('draw', '1');
  cols.forEach((c, i) => {
    P.set(`columns[${i}][data]`, c);
    P.set(`columns[${i}][name]`, '');
    P.set(`columns[${i}][searchable]`, 'true');
    P.set(`columns[${i}][orderable]`, i < 5 ? 'true' : 'false');
    P.set(`columns[${i}][search][value]`, '');
    P.set(`columns[${i}][search][regex]`, 'false');
  });
  P.set('order[0][column]', '1'); P.set('order[0][dir]', 'desc');
  P.set('start', '0'); P.set('length', '20');
  P.set('search[value]', ''); P.set('search[regex]', 'false');
  P.set('vendor_id', ''); P.set('type_id', ''); P.set('org_id', '');
  P.set('timabil_fra', fra); P.set('timabil_til', til);
  return P.toString();
}
async function greidslurHandler(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/greidslur');
  let res = await cache.match(cacheKey);
  if (res) return res;
  try {
    const H = { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
    let maxD = new Date();
    try {
      const mt = (await (await fetch('https://opnirreikningar.is/rest/max_time_period', { headers: H })).text()).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(mt)) maxD = new Date(mt + 'T12:00:00Z');
    } catch (e) {}
    const fraD = new Date(maxD.getTime() - 45 * 86400000);
    const up = await fetch('https://opnirreikningar.is/data_pagination_search?' + dtQuery(ddmmyyyy(fraD), ddmmyyyy(maxD)), { headers: H });
    const j = up.ok ? await up.json() : null;
    const rows = ((j && j.data) || []).map((r) => ({
      stofnun: r.org_name, birgir: r.vendor_name, dags: r.check_date,
      upph: r.invoice_amount, lysing: String(r.invoice_description || '').slice(0, 90),
    }));
    res = new Response(JSON.stringify({ til: maxD.toISOString().slice(0, 10), rows }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=10800' },
    });
    if (rows.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream' }), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
  }
}
async function domarHandler(ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/domar');
  let res = await cache.match(cacheKey);
  if (res) return res;
  const out = { updated: new Date().toISOString() };
  let anyOk = false;
  await Promise.all(DOMAR.map(async (c) => {
    try {
      const up = await fetch(c.url, { headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' } });
      const list = up.ok ? extractVerdicts(await up.text()) : [];
      out[c.key] = list;
      if (list.length) anyOk = true;
    } catch (e) { out[c.key] = []; }
  }));
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=2700' },
  });
  if (anyOk) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// 🩺 Villu-beacon (LOTA 23): framendinn sendir client-villur hingað; þær fara í
// console.error → sjást í Cloudflare Live Logs / wrangler tail. Engin geymsla,
// engin persónugögn — bara skilaboð, slóð og user-agent-stytting. 5/mín/IP.
async function villaHandler(request, ctx) {
  if (request.method !== 'POST') return sjson({ ok: false });
  try {
    const cache = caches.default;
    const ip = request.headers.get('cf-connecting-ip') || 'x';
    const min = new Date().toISOString().slice(0, 16);
    const k = new Request('https://cache.karp.internal/villa/' + encodeURIComponent(ip) + '/' + min);
    const prev = await cache.match(k);
    const n = prev ? parseInt(await prev.text(), 10) || 0 : 0;
    if (n >= 5) return sjson({ ok: false });
    ctx.waitUntil(cache.put(k, new Response(String(n + 1), { headers: { 'cache-control': 'public, max-age=60' } })));
    const b = (await request.json()) || {};
    console.error('[karp-villa]', JSON.stringify({ m: String(b.m || '').slice(0, 300), u: String(b.u || '').slice(0, 120), ua: (request.headers.get('user-agent') || '').slice(0, 80) }));
    return sjson({ ok: true });
  } catch (e) { return sjson({ ok: false }); }
}

// 📺 YouTube-fyrirtækjagreining (LOTA 33): rásatölfræði fyrir Umfjöllun —
// ALLT ÁN LYKLA: RSS ber áhorf + likes (starRating) per myndband, rásarsíðan
// ber áskrifendafjölda. Valfrjáls YOUTUBE_API_KEY (CF-secret) bætir við
// nákvæmum tölum + fjölda ummæla (videos.list). 6 klst cache per fyrirtæki.
const YTCO = {
  // Eimskip á TVÆR rásir: virka (nýtt efni 2026, fáir subs) + gömlu aðalrásina
  // (21,9þ subs, þögul síðan 2022) — samanlagt gefur rétta markaðsmynd.
  'Eimskip': ['UCiPZhGeTpFL9wvvVR9uFQgA', 'UCJKK3LJ0Fs6UcWs6QMRWs8g'],
  'Icelandair': 'UC0auMGlERL_q9IfaYPysb1Q',
  'Play': 'UCHGNsNarIoZP3QuBzuqtHqg',
  'Landsvirkjun': 'UC9VZ9wDIJJ4LSXlK7Vgnjsw',
  'Síminn': 'UC9-sEuaG0dXpbcr0wScvMvg',
  'Nova': 'UCRijU8XCs80USak_fB7KziA',
  'Arion banki': 'UC3R4Nvk_EL7BODeuoYv0Q9w',
  'Íslandsbanki': 'UCvKAwqQCubhM-Hwayvcd2bA',
  'Ölgerðin': 'UCtTyhVmndlpjloldBtguR6Q',
  'Össur': 'UClVW7BGbRvC5-0kowu8quhw',
};
function parseSubs(s) {
  const m = String(s || '').match(/([\d.,]+)\s*([KM])?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(n * (m[2] === 'M' || m[2] === 'm' ? 1e6 : m[2] ? 1e3 : 1));
}
async function ytstatsHandler(request, env, ctx) {
  const co = new URL(request.url).searchParams.get('co') || '';
  const mapped = YTCO[co];
  if (!mapped) return sjson({ channel: null });
  const ids = Array.isArray(mapped) ? mapped : [mapped];
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/ytstats/v2/' + encodeURIComponent(co));
  let res = await cache.match(cacheKey);
  if (res) return res;
  const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; karp.is dashboard; aronheidars@gmail.com)' };
  const out = { channel: { id: ids[0], subs: null, subsRaw: '', chans: ids.length }, videos: [], api: false };
  try {
    let subsSum = 0, subsAny = false;
    await Promise.all(ids.map(async (chId) => {
      const [rssR, pageR] = await Promise.all([
        fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + chId, { headers: UA }),
        fetch('https://www.youtube.com/channel/' + chId + '/about', { headers: { ...UA, 'Accept-Language': 'en' } }),
      ]);
      if (rssR.ok) {
        const xml = await rssR.text();
        for (const entry of xml.split('<entry>').slice(1)) {
          const t = (entry.match(/<title>([^<]+)<\/title>/) || [])[1];
          const u = (entry.match(/<link rel="alternate" href="([^"]+)"/) || [])[1];
          const d = ((entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '').slice(0, 10);
          const views = +((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || 0);
          const likes = +((entry.match(/<media:starRating count="(\d+)"/) || [])[1] || 0);
          const vid = (entry.match(/<yt:videoId>([^<]+)/) || [])[1] || '';
          if (t && u) out.videos.push({ id: vid, t, u, d, views, likes });
        }
      }
      if (pageR.ok) {
        const html = await pageR.text();
        const raw = (html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || html.match(/([\d.,]+[KM]?) subscribers/) || [])[1] || '';
        const n = parseSubs(raw.replace(/ subscribers?/i, ''));
        if (n != null) { subsSum += n; subsAny = true; }
      }
    }));
    out.videos.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    if (subsAny) {
      out.channel.subs = subsSum;
      out.channel.subsRaw = (subsSum >= 1e6 ? (Math.round(subsSum / 1e5) / 10).toString().replace('.', ',') + ' m' : subsSum >= 1000 ? (Math.round(subsSum / 100) / 10).toString().replace('.', ',') + ' þús.' : String(subsSum)) + (ids.length > 1 ? ' (samanlagt á ' + ids.length + ' rásum)' : '');
    }
    // Valfrjáls nákvæmni: opinbert Data API (frír lykill) → ummæli + nákvæm like
    if (env.YOUTUBE_API_KEY && out.videos.length) {
      try {
        const ids = out.videos.slice(0, 15).map((v) => v.id).filter(Boolean).join(',');
        const ar = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' + ids + '&key=' + env.YOUTUBE_API_KEY);
        if (ar.ok) {
          const aj = await ar.json();
          const st = {}; (aj.items || []).forEach((it) => { st[it.id] = it.statistics || {}; });
          out.videos.forEach((v) => { const s = st[v.id]; if (s) { v.views = +s.viewCount || v.views; v.likes = +s.likeCount || v.likes; v.comments = s.commentCount != null ? +s.commentCount : undefined; } });
          out.api = true;
        }
      } catch (e) {}
    }
  } catch (e) {}
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=21600' },
  });
  if (out.videos.length || out.channel.subs != null) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// 📢 Kauphallartilkynningar (LOTA 48) — opinbera OMX-fréttaveitan (api.news.eu.nasdaq.com)
// per félag, 30 mín skyndiminni. Sama veita og nasdaqomxnordic.com notar sjálf.
async function tilkynningarHandler(request, env, ctx) {
  const co = (new URL(request.url).searchParams.get('co') || '').trim().slice(0, 60);
  if (co.length < 2) return sjson({ error: 'co' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/tilkynningar?co=' + encodeURIComponent(co.toLowerCase()));
  let res = await cache.match(cacheKey);
  if (res) return res;
  const u = 'https://api.news.eu.nasdaq.com/news/query.action?type=json&showAttachments=false&showCnsSpecific=false&countResults=false'
    + '&freeText=' + encodeURIComponent(co) + '&globalGroup=exchangeNotice&globalName=NordicMainMarkets&displayLanguage=is'
    + '&timeZone=CET&dateMask=yyyy-MM-dd+HH%3Amm%3Ass&limit=10&start=0&dir=DESC';
  let items = [];
  try {
    const up = await fetch(u, { headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' } });
    if (up.ok) {
      const j = await up.json();
      items = (((j || {}).results || {}).item || []).map((x) => ({
        t: x.headline, co: x.company, d: (x.published || '').slice(0, 16), lang: x.language,
        u: x.messageUrl || ('https://view.news.eu.nasdaq.com/view?id=b' + x.disclosureId + '&lang=' + (x.language || 'is')),
      }));
      // freeText matchar líka meginmál → þrengja á útgefandann sjálfan sé það hægt
      const eigin = items.filter((x) => (x.co || '').toLowerCase().includes(co.toLowerCase()));
      if (eigin.length) items = eigin;
    }
  } catch (e) {}
  res = new Response(JSON.stringify({ co, items }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=1800' } });
  if (items.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// 🌐 Google-vefleit (LOTA 46) — Custom Search JSON API um proxy m/6 klst skyndiminni per
// leitarorð (frí kvótinn er 100 leitir/dag → skyndiminnið teygir hann margfalt).
// Lykill = env.YOUTUBE_API_KEY (sami Google Cloud lykill — Custom Search API þarf að vera
// virkjað á projectinu). cx = auðkenni Programmable Search Engine (opinbert, má standa í kóða).
const CSE_CX = '9070a65a9e3194023'; // „Karp vefleit" — íslensk lén, Region: Iceland (programmablesearchengine.google.com)
async function gleitHandler(request, env, ctx) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return sjson({ error: 'q' });
  const H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' };
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/gleit?q=' + encodeURIComponent(q.toLowerCase()));
  let res = await cache.match(cacheKey);
  if (res) return res;
  let items = null, total = null;
  // LOTA 56: Brave Search API gengur fyrir (Google lokaði Custom Search JSON fyrir ný verkefni 2026).
  // Frítt: 2.000 leitir/mán — 6 klst skyndiminnið teygir það margfalt. env.BRAVE_SEARCH_KEY.
  if (env.BRAVE_SEARCH_KEY) {
    try {
      // ATH: search_lang/country styðja EKKI 'is' hjá Brave (422) — fyrirspurnin sjálf
      // er á íslensku svo niðurstöðurnar verða það líka.
      const up = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(q) + '&count=10', { headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_KEY } });
      if (up.ok) {
        const j = await up.json();
        items = (((j.web || {}).results) || []).map((x) => ({ t: x.title, l: x.url, src: (x.meta_url && x.meta_url.hostname) || (x.url || '').replace(/^https?:\/\//, '').split('/')[0], sn: String(x.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') }));
      } else {
        // segja SATT um Brave-villuna (401=rangur lykill, 429=kvóti, 422=beiðni) í stað þess að þegja
        res = new Response(JSON.stringify({ error: 'brave', status: up.status, detail: (await up.text()).slice(0, 160) }), { status: 200, headers: { ...H, 'cache-control': 'public, max-age=120' } });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      }
    } catch (e) {}
  }
  // Google CSE til vara (virkar sé projectið með aðgang)
  if (!items) {
    const cx = env.GOOGLE_CSE_CX || CSE_CX;
    const gkey = env.GOOGLE_CSE_KEY || env.YOUTUBE_API_KEY;
    if (!gkey || !cx) return sjson({ error: 'unconfigured' });
    const up = await fetch('https://www.googleapis.com/customsearch/v1?key=' + gkey + '&cx=' + encodeURIComponent(cx) + '&q=' + encodeURIComponent(q) + '&gl=is&hl=is&num=10');
    if (!up.ok) {
      res = new Response(JSON.stringify({ error: up.status === 429 || up.status === 403 ? 'quota' : 'upstream', status: up.status }), { status: 200, headers: { ...H, 'cache-control': 'public, max-age=600' } });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }
    const j = await up.json();
    items = (j.items || []).map((x) => ({ t: x.title, l: x.link, src: x.displayLink, sn: (x.snippet || '').replace(/\s+/g, ' ') }));
    total = (j.searchInformation && j.searchInformation.totalResults) || null;
  }
  res = new Response(JSON.stringify({ q, total, items }), { status: 200, headers: { ...H, 'cache-control': 'public, max-age=21600' } });
  if (items && items.length) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// 🏢 Fyrirtækjaskrá (LOTA 57b) — ókeypis uppfletting í fyrirtækjaskrá RSK
// (skatturinn.is/fyrirtaekjaskra/leit, Eplica CMS — engin JS-krafa, enginn lykill).
// Eitt treff 302-ar beint á /leit/kennitala/NNNNNNNNNN; mörg treff skila töflu
// (kt-hlekkur + nafn + heimilisfang í sömu <tr>, class="inactive" = afskráð).
// Á detail-síðunni kemur leitarFORMIÐ neðar í DOM en gögnin — þáttað er frá
// 'class="company box"' (h1 "Nafn (kt)", gagnatafla, ÍSAT, VSK, ársreikningar).
// 24 klst skyndiminni per q.
const rskText = (s) => String(s == null ? '' : s)
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').replace(/\s,/g, ',').trim();
function rskListi(html) {
  const hits = [];
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const m = row.match(/href="[^"]*\/leit\/kennitala\/(\d{10})"/i);
    if (!m) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    const nafn = rskText((cells[1] || '').replace(/<em>[\s\S]*?<\/em>/gi, ''));
    if (!nafn) continue;
    const afskrad = /^[^>]*inactive/.test(row) || /afskráð/i.test(cells[1] || '');
    hits.push({ kt: m[1], nafn, heimili: rskText(cells[2]) || null, ...(afskrad ? { afskrad: true } : {}) });
    if (hits.length >= 40) break;
  }
  return hits;
}
function rskFelag(html) {
  const i = html.indexOf('class="company box"');
  if (i < 0) return null;
  const seg = html.slice(i, i + 20000);
  const h1 = seg.match(/<h1>\s*([\s\S]*?)\s*\((\d{10})\)\s*<\/h1>/);
  if (!h1) return null;
  const f = { nafn: rskText(h1[1]), kt: h1[2] };
  if (/Félag afskráð/i.test(seg.slice(0, 3000))) f.afskrad = true;
  f.skrad = (seg.match(/Stofnað\/Skráð:\s*([\d.]+)/) || [])[1] || null;
  const t = seg.match(/<th>Póstfang<\/th>[\s\S]*?<tbody>\s*<tr>([\s\S]*?)<\/tr>/i);
  if (t) {
    const c = [...t[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => rskText(x[1]));
    f.postfang = c[0] || null; f.logheimili = c[1] || null; f.svf = c[2] || null; f.form = c[3] || null;
  }
  const ul = (heading) => {
    const m = seg.match(new RegExp('<h3>' + heading + '[^<]*</h3>\\s*<ul>([\\s\\S]*?)</ul>', 'i'));
    return m ? [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((x) => rskText(x[1])).filter(Boolean) : [];
  };
  f.radamenn = ul('Forráðamaður');
  f.isat = ul('ÍSAT');
  const cn = seg.match(/<ul class="companynames">([\s\S]*?)<\/ul>/i);
  const heiti = cn ? [...cn[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((x) => rskText(x[1])).filter(Boolean) : [];
  if (heiti.length) f.heiti = heiti;
  f.vsk = [];
  const vm = seg.match(/<h3>Virðisaukaskattsnúmer<\/h3>\s*<table[\s\S]*?<tbody>([\s\S]*?)<\/table>/i);
  if (vm) for (const r of vm[1].split(/<tr\b/i).slice(1)) {
    const c = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => rskText(x[1]));
    if (c[1] && /^\d+$/.test(c[1])) f.vsk.push({ nr: c[1], skrad: c[2] || null, afskrad: c[3] || null, isat: c[4] || null });
    if (f.vsk.length >= 12) break;
  }
  const am = seg.match(/<th>Rek\. ár<\/th>[\s\S]*?<tbody>([\s\S]*?)<\/table>/i);
  if (am) {
    f.arsreikningar = [];
    for (const r of am[1].split(/<tr\b/i).slice(1)) {
      const c = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => rskText(x[1]));
      if (c[0] && /^\d{4}/.test(c[0])) f.arsreikningar.push({ ar: c[0], skil: c[2] || null, teg: c[4] || null });
      if (f.arsreikningar.length >= 8) break;
    }
  }
  // Raunverulegir eigendur (LOTA 74) — birt OPINN á detail-síðunni (var talið API-bundið!).
  // Hvert nafn í <h4>, svo tafla: fæðingarár/mán · búseta · ríkisfang · eignarhlutur · tegund.
  const iE = html.indexOf('Raunverulegir eigendur');
  if (iE >= 0) {
    let eseg = html.slice(iE, iE + 9000);
    const end = eseg.search(/Leit í fyrirtækjaskrá|<h3/i);
    if (end > 40) eseg = eseg.slice(0, end);
    const eig = [];
    for (const p of eseg.split(/<h4>/i).slice(1)) {
      const nafn = rskText((p.match(/^([\s\S]*?)<\/h4>/) || [])[1] || '');
      if (!nafn) continue;
      const tb = p.match(/<tbody>([\s\S]*?)<\/tbody>/i);
      const c = tb ? [...tb[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => rskText(x[1])) : [];
      eig.push({ nafn, faeding: c[0] || null, buseta: (c[1] || '').replace(/\.$/, '') || null, rikisfang: c[2] || null, hlutur: c[3] && c[3] !== '-' ? c[3] : null, tegund: (c[4] || '').replace(/[,\s]+$/, '') || null });
      if (eig.length >= 20) break;
    }
    if (eig.length) f.eigendur = eig;
    else f.eigendurTomt = true;   // svæðið til en enginn skráður (>25%) → aðgreint frá "ekki flett upp"
  }
  return f;
}
// ⚠ VANSKIL Á ÁRSREIKNINGASKILUM (LOTA 73) — opinber listi ársreikningaskrár RSK
// (felog-i-vanskilum, ársbundinn m/kt-leit). /api/vanskil?kt=XXXXXXXXXX →
// { kt, ar: [{ar, nafn, vanskil}], skodud: [...] } — tómt ar = í skilum. 24 klst cache.
// ATH: leit ÁN árs gildir aðeins nýjasta árið → skoðum tvö nýjustu rekstrarárin.
// ── AFLAHEIMILDIR / KVÓTI (LOTA 84) — Gagnavefur Fiskistofu opinn GraphQL (Azure) ──
// SamtalaFyrirtaekis(kt) → kvótastaða útgerðar per fisktegund + þorskígildi. Tengt /fyrirtaeki/ um kt.
// ⚠ Gamla Azure-APIð (samtalaFyrirtaekis) er AF NETINU. Nú: aflamark um OPNU island.is-gáttina
// (fiskistofaGetShipStatusForTimePeriod, per skip) — island.is heldur Fiskistofu-skilríkjunum → enginn JWT.
// Sjá kvotiHandler + memory/iceland-fiskistofa-api.md.
function fiskveidiTimabil() {
  const d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth();   // fiskveiðiár hefst 1. sept
  const s = m >= 8 ? y : y - 1;
  return String(s % 100).padStart(2, '0') + String((s + 1) % 100).padStart(2, '0');
}
// ── Vörumerki (Hugverkastofan, api.hugverk.is — opið leitar-API) → /fyrirtaeki/ flís ──
// kt+nafn → vörumerkjasafn félags (kt-tengt, nafn-fallback). Fyrirmynd: kvotiHandler.
// Sjá memory/iceland-hugverkastofa-api.md. Prófað lifandi: Icelandair 62 merki, allt kt.
const HUG_API = 'https://api.hugverk.is';
function nafnToken(nafn) { return String(nafn || '').replace(/\s*[.,]?\s*\b(ehf|hf|ohf|opinbert hlutafélag|slf|slhf|sf|ses|hses|bs|svf)\.?\s*$/i, '').trim(); }
const vmNorm = (s) => String(s || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
const vmDstr = (d) => (d && !/^0001/.test(d) ? String(d).slice(0, 10) : '');
async function fetchVorumerki(kt, nafn) {
  kt = String(kt || '').replace(/\D/g, '');
  const out = { kt, holdur: false, ok: false, nafn: nafn || null, merki: [], n: 0 };
  const token = nafnToken(nafn);
  if (kt.length !== 10 || token.length < 2) return out;
  const nfNorm = vmNorm(nafn);
  let names;
  try {
    const ac = await fetch(`${HUG_API}/umbraco/api/search/searchtrademarkowner?name=${encodeURIComponent(token)}`, { headers: { accept: 'application/json' } });
    if (!ac.ok) return out;
    names = await ac.json();
  } catch (e) { return out; }
  if (!Array.isArray(names)) return out;
  if (!names.length) { out.ok = true; return out; }               // staðfest: 0 eigendur passa (má cache-a)
  const tk = vmNorm(token);
  let cands = names.filter((nm) => vmNorm(nm).startsWith(tk));
  if (!cands.length) cands = names.slice(0, 25);
  cands = cands.slice(0, 25);
  const seen = new Set();
  let reached = false;
  for (let page = 1; page <= 4; page++) {
    let j;
    try {
      const r = await fetch(`${HUG_API}/umbraco/api/search/searchtrademarks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ textfield: '', owner: cands, agent: [], type: [], status: [], category: [], page }),
      });
      if (!r.ok) break;
      j = await r.json();
    } catch (e) { break; }
    reached = true;
    const res = (j && j.results) || [];
    for (const it of res) {
      const d = it.document || {};
      const owns = d.owner || [];
      const ssns = owns.map((o) => String(o.ownerSsn || '').replace(/\D/g, ''));
      const bySsn = ssns.includes(kt);                            // ★ kjölfesta: kt í eigendum
      const hasAnyKt = ssns.some((s) => s.length === 10);
      const byName = !bySsn && !hasAnyKt && owns.some((o) => vmNorm(o.ownerName) === nfNorm); // fallback: merki án kt
      if (!bySsn && !byName) continue;
      if (seen.has(d.identifier)) continue;
      seen.add(d.identifier);
      out.merki.push({
        id: d.identifier, titill: d.titleUnchanged || d.title || '', tegund: d.type || '',
        stada: d.detailStatus || d.status || '', flokkar: d.category || [],
        umsokn: vmDstr(d.applicationDate), skrad: vmDstr(d.registrationDate), gildirTil: vmDstr(d.expirationDate),
        mynd: d.imagePath || '', url: 'https://www.hugverk.is/leit/trademark/' + d.identifier,
        visst: bySsn ? 'kt' : 'nafn',
      });
    }
    if (res.length < 50) break;
  }
  out.ok = reached;
  out.merki.sort((a, b) => (b.umsokn || '').localeCompare(a.umsokn || ''));
  out.n = out.merki.length;
  out.holdur = out.n > 0;
  return out;
}
async function vorumerkiHandler(request, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const nafn = u.searchParams.get('nafn') || '';
  if (kt.length !== 10) return sjson({ kt, holdur: false, merki: [], n: 0 });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/vorumerki?kt=' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  let out;
  try { out = await fetchVorumerki(kt, nafn); }
  catch (e) { return sjson({ kt, holdur: false, merki: [], n: 0 }); }
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=604800' },
  });
  if (out && out.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));  // cache-a AÐEINS staðfest svar (7 dagar)
  return res;
}
// ── Eftirlitsstaða (Heilbrigðiseftirlit Reykjavíkur, her.reykjavik.is — opinn uppflettivefur) ──
// kt → opinber matvæla-/heilbrigðiseftirlits-einkunn 0–5 (0 verst). ⚠ AÐEINS Reykjavík.
// parseHER-þáttari sannreyndur á live-gögnum (5/5 SEED-kt). Sjá memory/iceland-her-eftirlit-api.md.
const HER_BASE = 'https://her.reykjavik.is';
const HER_LABEL = { 5: 'Kröfur uppfylltar / fáeinar ábendingar', 4: 'Fáein frávik / ábendingar', 3: 'Frávik / ábendingar', 2: 'Aðkallandi frávik / ábendingar', 1: 'Starfsemi takmörkuð / stöðvuð að hluta', 0: 'Starfsemi stöðvuð' };
const HER_MON = { 'janúar': 1, 'febrúar': 2, 'mars': 3, 'apríl': 4, 'maí': 5, 'júní': 6, 'júlí': 7, 'ágúst': 8, 'september': 9, 'október': 10, 'nóvember': 11, 'desember': 12 };
function herToISO(is) { const m = (is || '').match(/(\d{1,2})\.\s*([a-záðéíóúýþæö]+)\s*(\d{4})/i); if (!m || !HER_MON[m[2].toLowerCase()]) return null; return `${m[3]}-${String(HER_MON[m[2].toLowerCase()]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }
function parseHER(html, wantKt) {
  const out = [];
  const parts = html.split('card-title">').slice(1);
  for (const raw of parts) {
    const seg = raw.split('card-title">')[0];
    const name = ((seg.match(/^([^<]+)</) || [])[1] || '').trim();
    const km = seg.match(/\((\d{6})-(\d{4})\)/);
    const kt = km ? km[1] + km[2] : null;
    if (!kt) continue;
    let street = null, postnr = null, city = null;
    const sub = seg.match(/card-subtitle[^>]*>([\s\S]*?)<\/h6>/);
    if (sub) {
      const s = sub[1].replace(/<br\s*\/?>/gi, '|').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const m = s.match(/^(.*?)\|?\s*(\d{3})\s+(.+)$/);
      if (m) { street = m[1].replace(/\|/g, ' ').replace(/,\s*$/, '').trim(); postnr = m[2]; city = m[3].trim(); }
      else street = s.replace(/\|/g, ' ').trim();
    }
    const rs = seg.match(/text-right">\s*<span>(\d)<\/span>/) || seg.match(/<span>(\d)<\/span>\s*<i class="fas/);
    const rating = rs ? +rs[1] : null;
    const dt = ((seg.match(/Síðasta eftirlit:<\/strong>\s*([^<]+?)\s*<\/?/) || seg.match(/Síðasta eftirlit:\s*([^<]+?)</) || [])[1] || '').trim() || null;
    const uuid = (seg.match(/\/embed\/([0-9a-f-]{36})\//) || [])[1] || null;
    out.push({ name, kt, street, postnr, city, rating, ratingLabel: rating != null ? HER_LABEL[rating] : null, lastInspection: dt, lastInspectionISO: herToISO(dt), uuid, reportUrl: uuid ? `${HER_BASE}/embed/${uuid}/` : null });
  }
  return wantKt ? out.filter((x) => x.kt === wantKt) : out;
}
async function fetchEftirlit(kt) {
  kt = String(kt || '').replace(/\D/g, '');
  const out = { kt, holdur: false, ok: false, nafn: null, stadir: [], n: 0 };
  if (kt.length !== 10) return out;
  let html;
  try {
    const r = await fetch(`${HER_BASE}/?o=name&q=${kt}`, { headers: { 'user-agent': 'KarpBot/1.0 (+https://karp.is)', 'accept-language': 'is', referer: 'https://reykjavik.is/' } });
    if (r.status !== 200) return out;                                  // þrenging/villa → ok:false (ekki cache-a)
    html = await r.text();
  } catch (e) { return out; }
  out.ok = true;
  const rated = parseHER(html, kt).filter((s) => s.rating != null).sort((a, b) => (b.lastInspectionISO || '').localeCompare(a.lastInspectionISO || ''));
  out.stadir = rated;
  out.n = rated.length;
  out.holdur = rated.length > 0;
  if (rated.length) out.nafn = rated[0].name;
  return out;
}
async function eftirlitHandler(request, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, holdur: false, stadir: [], n: 0 });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/eftirlit?kt=' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  let out;
  try { out = await fetchEftirlit(kt); }
  catch (e) { return sjson({ kt, holdur: false, stadir: [], n: 0 }); }
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  if (out && out.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));  // 24 klst, aðeins staðfest svar
  return res;
}
// ── Ökutækjaleit (island.is/api/graphql publicVehicleSearch, @BypassAuth — opið) ──
// bílnúmer → tegund/árgerð/litur/staða/næsta skoðun/þyngd/CO₂/VIN. ⚠ eigandi/veðbönd læst.
// Sjá memory/iceland-okutaeki-api.md. Per-IP dagskvóti + 24h cache (öryggisnet gegn fjöldaflettingu).
const OKUTAEKI_Q = 'query($input: GetPublicVehicleSearchInput!){ publicVehicleSearch(input:$input){ permno regno vin make vehicleCommercialName color newRegDate firstRegDate vehicleStatus nextVehicleMainInspection co2 weightedCo2 co2WLTP mass massLaden typeNumber } }';
async function okutaekiHandler(request, ctx) {
  const num = (new URL(request.url).searchParams.get('numer') || '').toUpperCase().replace(/[^A-Z0-9ÁÐÉÍÓÚÝÞÆÖ]/g, '').slice(0, 6);
  if (num.length < 2) return sjson({ error: 'numer' });
  const cache = caches.default;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const ipKey = new Request('https://cache.karp.internal/okutaeki-ip/' + day + '/' + encodeURIComponent(ip));
  const qhit = await cache.match(ipKey);
  const usedN = qhit ? parseInt(await qhit.text(), 10) || 0 : 0;
  if (usedN >= 50) return sjson({ error: 'kvoti' });
  const cacheKey = new Request('https://cache.karp.internal/api/okutaeki?n=' + encodeURIComponent(num));
  let res = await cache.match(cacheKey);
  if (res) return res;
  ctx.waitUntil(cache.put(ipKey, new Response(String(usedN + 1), { headers: { 'cache-control': 'public, max-age=86400' } })));
  let out = { numer: num, fannst: false };
  try {
    const r = await fetch('https://island.is/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' },
      body: JSON.stringify({ query: OKUTAEKI_Q, variables: { input: { search: num } } }),  // ⚠ EKKI operationName (fyrirspurn nafnlaus → 400)
    });
    const j = await r.json().catch(() => null);
    const v = j && j.data && j.data.publicVehicleSearch;
    if (v && (v.make || v.vin)) {
      const iso = (d) => (d ? String(d).slice(0, 10) : null);
      out = {
        numer: num, fannst: true, tegund: v.make || null, undirheiti: v.vehicleCommercialName || null,
        argerd: ((v.firstRegDate || v.newRegDate || '') + '').slice(0, 4) || null,
        litur: v.color || null, stada: v.vehicleStatus || null,
        fyrstSkrad: iso(v.firstRegDate), nyskrad: iso(v.newRegDate), naestaSkodun: iso(v.nextVehicleMainInspection),
        co2: v.co2 != null ? v.co2 : (v.co2WLTP != null ? v.co2WLTP : null),
        thyngd: v.mass != null ? v.mass : null, heildarthyngd: v.massLaden != null ? v.massLaden : null,
        vin: v.vin || null, fastanumer: v.permno || null,
      };
    }
  } catch (e) { return sjson(out); }
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  if (out.fannst) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
// island.is OPNA gáttin: skipnr + fiskveiðiár → aflamark per tegund (úthlutað/aflamark/afli/staða/þorskígildi).
// allocation=úthlutað aflamark · catchQuota=aflamark (eftir millifærslur) · catch=afli · status=eftirstöðvar.
// ⚠ EKKI operationName (nafnlaus fyrirspurn). id===0 / "Þorskígildi" = samtala í þorskígildum.
const ISLAND_GQL = 'https://island.is/api/graphql';
const AFLA_Q = 'query($input: FiskistofaGetShipStatusForTimePeriodInput!){ fiskistofaGetShipStatusForTimePeriod(input:$input){ fiskistofaShipStatus { catchQuotaCategories { id name allocation catchQuota catch status } } } }';
async function fetchAflamarkSkip(regno, timabil) {
  try {
    const r = await fetch(ISLAND_GQL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: AFLA_Q, variables: { input: { shipNumber: regno, timePeriod: timabil } } }) });
    const j = await r.json().catch(() => null);
    const st = j && j.data && j.data.fiskistofaGetShipStatusForTimePeriod && j.data.fiskistofaGetShipStatusForTimePeriod.fiskistofaShipStatus;
    return (st && st.catchQuotaCategories) || null;
  } catch (e) { return null; }
}
// Fyrirtæki-kt → skip_owners.json (flotavísir) → per skip aflamark um island.is → samlagning þorskígildis + tegunda.
async function kvotiHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'kt' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/kvoti?kt=' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  const timabil = fiskveidiTimabil();
  const out = { kt, holdur: false, timabil };
  const idx = await augGet(env, 'skip_owners.json');
  if (!idx) return sjson(out);                          // flotavísir ekki til enn → tómt, ekki cache-a
  const skip = (idx.byKt && idx.byKt[kt]) || [];
  if (skip.length) {
    const cap = skip.slice(0, 40);                       // öryggisnet (Brim/Samherji ~15-25 skip)
    const perShip = [];                                  // lotur af 8 → hófleg samhliðni (island.is throttlar stórar sprengjur)
    for (let i = 0; i < cap.length; i += 8) {
      const rs = await Promise.all(cap.slice(i, i + 8).map((s) => fetchAflamarkSkip(s.regno, timabil).then((c) => [s, c])));
      perShip.push(...rs);
    }
    const agg = new Map();                               // tegund → samlagt {t, aflamark, afli, stada}
    let ti = null; const skipMed = [];
    for (const [s, cats] of perShip) {
      if (!cats) continue;
      skipMed.push({ regno: s.regno, nafn: s.nafn });
      for (const c of cats) {
        const aflamark = +c.catchQuota || 0, afli = +c.catch || 0, stada = +c.status || 0, uthlutad = +c.allocation || 0;
        if (c.id === 0 || /Þorskígildi/i.test(c.name || '')) {
          ti = ti || { aflamark: 0, afli: 0, stada: 0, uthlutad: 0 };
          ti.aflamark += aflamark; ti.afli += afli; ti.stada += stada; ti.uthlutad += uthlutad;
        } else if (aflamark || afli) {
          const g = agg.get(c.name) || { t: c.name, aflamark: 0, afli: 0, stada: 0 };
          g.aflamark += aflamark; g.afli += afli; g.stada += stada; agg.set(c.name, g);
        }
      }
    }
    const teg = [...agg.values()].sort((a, b) => b.aflamark - a.aflamark);
    if (teg.length || ti) Object.assign(out, { holdur: true, nafn: null, torskigildi: ti, tegundir: teg.slice(0, 20), nTeg: teg.length, nSkip: skipMed.length, skip: skipMed.slice(0, 12) });
  }
  res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ── Kvótavaktin (premium): eigendahópur útgerðar ──
// GET /api/kvoti/hopur?kt= — rekur EIGENDAHÓP útgerðar (rót + lögaðilar úr eignarhaldstré hennar,
// sama félagamengi og tengslanet notar) og leggur saman kvóta-hlutdeild hópsins úr gogn/kvoti.json
// (byggt vikulega af build_kvoti.mjs). Kjarna-differentiator vörunnar: „tengd félög halda X% samtals".
// ⚠ ÁÆTLUN — ekki lagalegur úrskurður um „tengda aðila" skv. lögum nr. 116/2006; birt með fyrirvara.
// Innskráðir eingöngu (premium virði); login-gátt Á UNDAN cache-treffi (sama gildra og tengslanet).
async function kvotiHopurHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10 || !rskErFyrirtaeki(kt)) return sjson({ kt, error: 'kt' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/api/kvoti-hopur?kt=' + kt);
  const hit = await cache.match(ck); if (hit) return hit;
  const kv = await augGet(env, 'kvoti.json');
  if (!kv || !kv.leit) return sjson({ kt, error: 'gogn' });   // pípan ekki keyrð enn → framendi sýnir „í vinnslu"
  // hópur = rót + lögaðilar úr eignarhaldstrénu (ef byggt — annars aðeins rótin sjálf)
  const felogSet = new Set([kt]);
  let treTil = false;
  try {
    const tr = await env.ASSETS.fetch(new Request('https://karp.internal/gogn/eigendur/' + kt + '.json'));
    if (tr.ok) {
      treTil = true;
      const t = await tr.json();
      for (const nd of ((t.net && t.net.nodes) || [])) {
        const k = String(nd.kt || '').replace(/\D/g, '');
        if (k.length === 10 && rskErFyrirtaeki(k)) felogSet.add(k);
      }
    }
  } catch (e) {}
  const heildTi = (kv.heild && kv.heild.ti_kg) || 0;
  const felog = [];
  let samtals = 0;
  for (const k of [...felogSet].slice(0, 40)) {
    const l = kv.leit[k];
    if (!l) { if (k === kt) felog.push({ kt: k, nafn: null, ti_kg: 0, pct: 0 }); continue; }
    felog.push({ kt: k, nafn: l[0], ti_kg: +l[1] || 0, pct: +l[2] || 0 });
    samtals += (+l[1] || 0);
  }
  felog.sort((a, b) => b.ti_kg - a.ti_kg);
  const samtalsPct = heildTi ? +(samtals / heildTi * 100).toFixed(2) : 0;
  const out = {
    kt, nafn: (kv.leit[kt] && kv.leit[kt][0]) || null, treTil,
    felog: felog.slice(0, 20), samtals_ti_kg: Math.round(samtals), samtals_pct: samtalsPct,
    nalaegt_thaki: samtalsPct >= 10,   // 12% er lögbundið hámark heildar-þorskígilda — vörum við frá 10%
    heimild: 'Áætlun Karps: eignarhaldstré úr opinberum skrám + aflamark Fiskistofu — ekki úrskurður um tengda aðila skv. lögum nr. 116/2006',
  };
  if (!treTil) {
    // SJÁLFHEILUN (rýni-atriði #1): tré ekki byggt enn → kveikja á on-demand byggingunni (sama flæði
    // og eigenda-skýrslan notar) og skila ÓCACHE-uðu svari svo endurtilraun eftir ~2 mín fái fullan hóp.
    ctx.waitUntil(fetch('https://karp.is/api/eigendur/request?kt=' + kt, { method: 'POST' }).catch(() => {}));
    return sjson({ ...out, byggja: true });
  }
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=43200' } });
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}

// ── TEYA/BORGUN SECUREPAY (RPG hýst greiðslusíða, LOTA 97) — „kaupa skýrslu" ──
// PCI-öruggt: worker undirritar pöntun (checkhash) og skilar form-reitum; framendi POST-ar á
// hýstu greiðslusíðu Teya sem vinnur kortið — við snertum ALDREI kortagögn.
// ÓVIRKT þar til secrets eru sett: TEYA_MERCHANT_ID, TEYA_GATEWAY_ID, TEYA_SECRET_KEY.
// ⚠ ÖRYGGISROFI: greiðslur eru AÐEINS virkar ef TEYA_LIVE='1' (eins og karp_paywall) — annars
// falla þær á ókeypis prentleiðina. Kveiktu á TEYA_LIVE þegar Fasi 2 (entitlement) er tilbúinn.
// Verð: PRICE_FYRIRTAEKI / PRICE_FASTEIGN (ISK heiltala, sjálfgefið 990).
// TEYA_ENV=dev → test.borgun.is (prófun); annars securepay.borgun.is (raun).
// checkhash = HMAC_SHA256(SecretKey, MerchantId|ReturnUrlSuccess|ReturnUrlSuccessServer|OrderId|Amount|Currency) → hex
// orderhash (staðfesting) = HMAC_SHA256(SecretKey, OrderId|Amount|Currency) → hex
// ── Prufuvörn ──────────────────────────────────────────────────────────────
// Hefur notandinn (uid, auðkenndur í karpUserId) þegar nýtt frípróf á þessari vöru? WP geymir
// karp_sub_<svc>_trial_used / karp_tier_trial_used PER USER-ID (ekki kt → kt-skipti duga ekki).
// Fail-open (false) ef WP/secret vantar: grant þarf hvort eð er WP, svo bilun blokkar ekki löglega nýja.
// Rás/verð ÁN fríprófs fyrir endurkomu-notanda (Aron stillir valfrjálst í Áskell). null → blokka.

// Kaupandi lendir hér (POST frá SecurePay eftir greiðslu/afbókun) → 302 á /kaup/ (GET, Astro-síða)

// Server-til-server staðfesting (POST frá SecurePay) → sannreyna orderhash. FASI 2: skrá entitlement í WP.

// ── Áskell áskriftar-vefkrókur (LOTA 110) — endurtekin Karp+ áskrift gegnum Áskell (kort-á-skrá) ──
// Áskell rukkar kortið mánaðarlega SJÁLFT + sendir vefkrók við hverja greiðslu. Við sannreynum
// Hook-HMAC (HMAC-SHA512 base64 af hráum body) → framlengjum aðgang (karp-user.php /sub/grant, kt-lykill,
// idempotent á greiðslu-id). Afbókun = engar fleiri greiðslur → aðgangur rennur út (engin sér-afturköllun).
// ⚠ ÓVIRKT þar til ASKELL_WEBHOOK_SECRET er sett. ⚠ Body-lyklar (kennitala/plan/id) SANNPRÓFAST í sandbox.

// ── Uppsögn áskriftar: POST /api/sub/cancel {service?} — innskráður notandi segir upp sinni áskrift ──
// Flæði: karpUserId → askell_id + kt + vara úr D1 → Áskell cancel
// (v2 contract cancel_at_period_end, fallback legacy) → áskrift lifir út greitt tímabil (until óbreytt).


// ── Áskell v2 embedded checkout — stofna checkout-session (LOTA 110d) ──
// Framendinn kallar hér þegar notandi vill gerast áskrifandi → worker stofnar v2 checkout-session
// með PRIVATE key (server-hlið) → skilar { token } sem framendinn setur í Askell.mountCheckout (askell.js).
// Áskell-widgetinn sér um kortainnslátt + 3DS INNI á karp.is. customer_reference = kt bindur áskriftina.
// ⚠ ÓVIRKT þar til ASKELL_PRIVATE_KEY er sett (rása-slug frettir/utbod eru hardkóðuð sjálfgildi).
// Flettir upp verð-ID einskiptisvöru í Áskell V2-katalógnum eftir vöru-TILVÍSUN (reference).
// Varfærin þáttun (svar-snið óskjalfest í smáatriðum): vörulisti → id→reference kort, verðlisti →
// fyrsta verð vörunnar (one_time í forgangi). Cache 1h per tilvísun. Skilar id eða null.
// recurring=true → skilar ENDURTEKNA verðinu (áskriftir); annars one_time í forgangi (stök skýrsla)

// ── Stakar skýrslur um ÁSKELL V1 (einskiptisgreiðsla, innfellt kortaform) ──
// V2 embedded checkout getur EKKI selt staka einskiptisvöru (sannað 11.7: quote/ hafnar bæði
// items m/one-time verði („One-time prices cannot be attached to contracts") og initial_items
// einu sér („Provide exactly one checkout input mode")). Þess í stað V1-leið Áskell:
//   1) POST /api/checkouts/ {payment_processor, currency, capture_only:true, allowed_origin}
//      → checkout_url sem er HANNAÐ fyrir iframe (CSP frame-ancestors karp.is) — kort + 3DS á síðunni
//   2) framendinn pollar POST /api/stak/confirm → workerinn reynir að tengja kortið við viðskiptavin
//      (POST /customers/paymentmethod/) — tekst fyrst þegar korti hefur verið slegið inn
//   3) þá POST /api/payments/ {customer_reference:kt, amount, reference:stak-lykill} (async)
//   4) polling heldur áfram þar til state=settled → grant á WP (kt-lyklað, sama og vefkrókur)
// Upphæð ALLTAF server-hlið (aldrei frá vafra). Public-lykil þarf hvergi — allt um secret-lykilinn.

// ── Áskriftir um ÁSKELL V1-FLÆÐI (framhjá V2 embedded widget) ──
// V2 widget getur EKKI tengt viðskiptavin sem er þegar til („A customer with this reference already exists")
// OG Áskell sendir ENGAN vefkrók við trial-contract-stofnun (sannað 12.7) → widget-leiðin veitir aldrei aðgang.
// Þess í stað: sama iframe-kortaform og stökin (V1 hosted checkout) → server-megin stofnum við
// V2 subscription-contract OG veitum aðgang STRAX á /sub/grant (ekki beðið eftir rukkunar-vefkrók).
// slug = þrep (grunnur/fyrirtaeki/fyrirtaeki_plus) EÐA þjónusta (utbod/frettir/fasteign) = vöru-tilvísun í Áskell.


// ── Götumynd af eign (LOTA 111): Google Street View milliliður ──
// Framendinn (fasteignaskýrsla) kallar /api/streetview?lat=&lng=. Workerinn geymir Google-lykilinn sem
// LEYNDAN Cloudflare Secret (GMAPS_KEY) — birtist ALDREI í opinbera kóðanum/vafranum — sækir myndina og
// cache-ar hana (30 daga) svo hvert heimilisfang kostar aðeins EINA Google-köllun. Metadata-köll eru ókeypis
// hjá Google → athuga fyrst hvort götumynd sé til (404 ef ekki → framendi fellur á kort í fullri breidd).
async function streetviewHandler(request, env, ctx) {
  if (!env.GMAPS_KEY) return new Response('unconfigured', { status: 503 });
  const u = new URL(request.url);
  const lat = parseFloat(u.searchParams.get('lat')), lng = parseFloat(u.searchParams.get('lng'));
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return new Response('bad', { status: 400 });
  const loc = lat.toFixed(6) + ',' + lng.toFixed(6);
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/streetview?l=' + loc);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    const meta = await fetch('https://maps.googleapis.com/maps/api/streetview/metadata?location=' + encodeURIComponent(loc) + '&key=' + env.GMAPS_KEY).then((r) => r.json()).catch(() => null);
    if (!meta || meta.status !== 'OK') return new Response('no-imagery', { status: 404, headers: { 'access-control-allow-origin': '*' } });
    const g = await fetch('https://maps.googleapis.com/maps/api/streetview?size=640x440&location=' + encodeURIComponent(loc) + '&fov=78&pitch=8&source=outdoor&key=' + env.GMAPS_KEY);
    if (!g.ok) return new Response('upstream', { status: 502 });
    const resp = new Response(g.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=2592000', 'access-control-allow-origin': '*' } });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) { return new Response('upstream', { status: 502 }); }
}

// ── On-demand ársreikninga-scraping (LOTA 99R) — dispatchar GitHub Action ──
// /fyrirtaeki/ kallar hér þegar keypt/skoðuð skýrsla hefur engan scrapaðan ársreikning. Worker sendir
// repository_dispatch { kt } → .github/workflows/arsreikningur.yml scrapar RSK-PDF → web/public/gogn/
// arsreikningar/<kt>.json (puppeteer+pdfplumber, keyrir EKKI í worker). ÓVIRKT þar til GITHUB_DISPATCH_TOKEN
// secret er sett (PAT m/ repo/contents+actions). Aðeins innskráðir (kaupendur) → dregur úr misnotkun.
async function arsreikningurRequestHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'kt' });
  if (!env.GITHUB_DISPATCH_TOKEN) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'arsreikningur', client_payload: { kt } }),
    });
    return r.status === 204 ? sjson({ ok: true, kt }) : sjson({ error: 'dispatch', status: r.status });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ── On-demand endanlegir eigendur (UBO) — dispatchar GitHub Action ──
// /fyrirtaeki/ kallar hér þegar keypt eigenda-skýrsla hefur enga byggða JSON. Worker sendir
// repository_dispatch { kt } → .github/workflows/eigendur.yml byggir UBO-tré (build_eigendur.mjs,
// puppeteer+pdfplumber) → web/public/gogn/eigendur/<kt>.json. Speglar ársreikninginn. Aðeins kaupendur.
async function eigendurRequestHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'kt' });
  if (!env.GITHUB_DISPATCH_TOKEN) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'eigendur', client_payload: { kt } }),
    });
    return r.status === 204 ? sjson({ ok: true, kt }) : sjson({ error: 'dispatch', status: r.status });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ── On-demand stjórn — dispatchar GitHub Action (speglar ársreikning/eigendur) ──
// /fyrirtaeki/ kallar hér þegar skýrsla hefur enga byggða stjórn. repository_dispatch { kt } →
// .github/workflows/stjorn.yml → web/public/gogn/stjorn/<kt>.json. Aðeins innskráðir → gegn misnotkun.
async function stjornRequestHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'kt' });
  if (!env.GITHUB_DISPATCH_TOKEN) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'stjorn', client_payload: { kt } }),
    });
    return r.status === 204 ? sjson({ ok: true, kt }) : sjson({ error: 'dispatch', status: r.status });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ── /fyrirtaeki/<kt>/ — indexeranleg opinber félagssíða (worker-SSR, SEO) ──
// Sækir byggða Astro-skel (skel-fyrirtaeki) úr ASSETS og skiptir %%KARP_*%%
// tókum út fyrir per-félag efni. Öll gögn koma úr fyrirtaekiHandler (RSK).

function orgJsonLd(f, kt, canonical) {
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: f.nafn, identifier: kt, taxID: kt, url: canonical };
  const addr = f.postfang || f.logheimili;
  if (addr) ld.address = { '@type': 'PostalAddress', streetAddress: addr, ...(f.svf ? { addressLocality: f.svf } : {}), addressCountry: 'IS' };
  if (Array.isArray(f.heiti) && f.heiti.length) ld.alternateName = f.heiti.slice(0, 6);
  if (f.form) ld.additionalType = f.form;
  const fd = isoDate(f.skrad);
  if (fd) ld.foundingDate = fd;
  if (f.vsk && f.vsk[0] && f.vsk[0].nr) ld.vatID = 'IS' + f.vsk[0].nr;
  return ld;
}

function felagMainHtml(f, kt) {
  const e = htmlEsc;
  const virk = f.afskrad ? '<span class="kf-chip b">Afskráð</span>' : `<span class="kf-chip g">${e(f.stada || 'Virk skráning')}</span>`;
  const chips = [virk, f.form ? `<span class="kf-chip">${e(f.form)}</span>` : '', (f.isat && f.isat[0]) ? `<span class="kf-chip">${e(f.isat[0])}</span>` : ''].filter(Boolean).join('');
  const cell = (l, v) => (v ? `<div class="kf-cell"><span class="kf-l">${e(l)}</span><span class="kf-v">${e(v)}</span></div>` : '');
  const grid = [
    cell('Heimilisfang', f.postfang || f.logheimili),
    cell('Sveitarfélag', f.svf),
    cell('Rekstrarform', f.form),
    cell('Stofnað / skráð', f.skrad),
    cell('Hlutafé', f.hlutafe ? `${String(f.hlutafe).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${f.mynt ? ' ' + f.mynt : ''}` : ''),
    cell('VSK-númer', f.vsk && f.vsk[0] ? f.vsk[0].nr : ''),
  ].filter(Boolean).join('');
  const isatSec = (f.isat && f.isat.length) ? `<div class="kf-sec"><h2>ÍSAT atvinnugrein</h2><div class="kf-links">${f.isat.map((x) => e(x)).join('<br>')}</div></div>` : '';
  const nFyrirsvar = Array.isArray(f.fyrirsvar) && f.fyrirsvar.length ? f.fyrirsvar.length : (f.radamenn || []).length;
  const fyrirsvarSec = nFyrirsvar ? `<div class="kf-sec"><h2>Fyrirsvar</h2><div class="kf-note" style="border:0;padding:0;margin:0">${nFyrirsvar} skráðir fyrirsvarsmenn (stjórn/prókúra). Nöfn og hlutverk í fyrirtækjaskýrslunni.</div></div>` : '';
  const ars = (f.arsreikningar || []).slice(0, 8);
  const arsSec = ars.length ? `<div class="kf-sec"><h2>Skil ársreikninga</h2><table class="kf-tbl"><tr><th>Ár</th><th>Skil</th><th>Tegund</th></tr>${ars.map((a) => `<tr><td>${e(a.ar)}</td><td>${e(a.skil || '—')}</td><td>${e(a.teg || '—')}</td></tr>`).join('')}</table></div>` : '';
  const nEig = Array.isArray(f.eigendur) ? f.eigendur.length : 0;
  const eigTeaser = `<div class="kf-sec"><h2>Endanlegir eigendur</h2><div class="kf-note" style="border:0;padding:0;margin:0 0 10px">${nEig ? `${nEig} raunverulegir eigendur skráðir (>25%).` : (f.eigendurTomt ? 'Enginn með >25% skráður.' : 'Eigendagreining í boði.')} Fullt eignarhald, þrepaskipting og félagakeðja í eigendaskýrslunni.</div></div>`;
  const cta = `<div class="kf-cta">
    <a class="kf-cta-main" href="/fyrirtaeki/?q=${e(kt)}">🛒 Fyrirtækjaskýrsla — 990 kr</a>
    <a class="kf-cta-sec" href="/eigendur/?kt=${e(kt)}">Endanlegir eigendur — 990 kr</a>
    <a class="kf-cta-sec" href="/lausnir/fyrirtaekjavaktin/">Fyrirtækjavaktin</a>
  </div>`;
  const links = `<p class="kf-links">Sjá einnig: <a href="/fyrirtaeki/?q=${e(kt)}">lifandi uppfletting</a> · <a href="/birgjar/">greiðslur ríkisins</a> · <a href="/frettir/">fjölmiðlaumfjöllun</a> · <a href="/utbod/">útboð</a></p>`;
  const timalinaSec = `<div class="kf-sec"><h2>🕑 Atburða-tímalína</h2><div id="fb-timalina" class="kf-tl" data-kt="${e(kt)}" data-nafn="${e(f.nafn)}"><div class="kf-note" style="border:0;padding:0;margin:0">Sæki atburði…</div></div></div>`;
  return `<p class="kf-links"><a href="/fyrirtaeki/">← Fyrirtækjaskrá</a></p>
    <h1 class="kf-h1">${e(f.nafn)}</h1>
    <div class="kf-kt">kt. ${e(ktSep(kt))}</div>
    <div class="kf-chips">${chips}</div>
    <div class="kf-grid">${grid}</div>
    ${isatSec}${fyrirsvarSec}${arsSec}${timalinaSec}${eigTeaser}${cta}${links}
    <p class="kf-note">Grunngögn úr opinberri fyrirtækjaskrá Skattsins (skatturinn.is), sótt lifandi. Ekki vottorð. Formleg fyrirtækjaskýrsla og eigendaskýrsla fást keyptar hér að ofan.</p>`;
}

async function firmaTimalinaHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const nafn = (u.searchParams.get('nafn') || '').trim().slice(0, 120);
  if (kt.length !== 10 && !nafn) return sjson({ atburdir: [], n: 0 });
  const [lb, vm, st, arch] = await Promise.all([
    augGet(env, 'logbirting.json').catch(() => null),
    augGet(env, 'vorumerki_nyskrad.json').catch(() => null),
    augGet(env, 'styrkir.json').catch(() => null),
    augGet(env, 'frettavel_archive.json').catch(() => null),
  ]);
  const logbirting = (kt.length === 10 && lb && lb.byKt && lb.byKt[kt] && lb.byKt[kt].notices) || [];
  const vorumerki = (kt.length === 10 && vm && vm.byKt && vm.byKt[kt]) || [];
  let styrkir = [];
  if (st && nafn) { const mm = matchStyrkir(nafn, st); styrkir = (mm.idx || []).map((i) => st.styrkir[i]).filter(Boolean); }
  let frettir = [];
  if (arch && arch.items && nafn) {
    const core = nafn.replace(/\s+(ehf|hf|ohf|slhf|sf|ses)\.?$/i, '').toLowerCase();
    if (core.length >= 3) frettir = arch.items.filter((x) => (((x.title || '') + ' ' + (x.text || '')).toLowerCase().indexOf(core) >= 0));
  }
  const atburdir = buildTimalina({ logbirting, vorumerki, styrkir, frettir });
  return sjson({ updated: new Date().toISOString(), kt, nafn, n: atburdir.length, aggreidanleiki: { kt: ['gjaldthrot', 'vorumerki'], nafn: ['styrkur', 'frett'] }, atburdir });
}

async function fyrirtaekiSidaHandler(request, env, ctx) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/fyrirtaeki\/(\d{10})\/?$/);
  if (!m) return env.ASSETS.fetch(request);
  const kt = m[1];
  if (!url.pathname.endsWith('/')) return Response.redirect(url.origin + '/fyrirtaeki/' + kt + '/', 301);
  if (!erLogadili(kt)) return env.ASSETS.fetch(request);   // einstaklingar → 404 (persónuvernd)
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/pg/fyrirtaeki/' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  const dr = await fyrirtaekiHandler(new Request('https://k.internal/api/fyrirtaeki?q=' + kt), env, ctx);
  const d = await dr.json().catch(() => null);
  const f = d && d.felag;
  if (!f || !f.nafn) return env.ASSETS.fetch(request);      // ekkert raunfélag → 404, EKKI tóm 200
  const canonical = 'https://karp.is/fyrirtaeki/' + kt + '/';
  const title = htmlEsc(f.nafn) + ' (' + ktSep(kt) + ') — ársreikningur, eigendur, kennitala | Karp';
  const dParts = [f.form, f.isat && f.isat[0], f.postfang || f.logheimili, f.afskrad ? 'Afskráð' : (f.stada || 'Virk skráning')].filter(Boolean).join(' · ');
  const desc = htmlEsc((f.nafn + ' — kt. ' + ktSep(kt) + '. ' + dParts + '. Ársreikningar, endanlegir eigendur, tengsl og umfjöllun á Karp.').slice(0, 280));
  const ld = JSON.stringify(orgJsonLd(f, kt, canonical)).replace(/</g, '\\u003c');
  let html = await (await env.ASSETS.fetch(new Request('https://karp.internal/skel-fyrirtaeki/'))).text();
  html = html.replace(/<meta name="robots"[^>]*>\s*/i, '');   // gera indexeranlegt
  html = repAll(html, '%%KARP_TITLE%%', title);
  html = repAll(html, '%%KARP_OGTITLE%%', htmlEsc(f.nafn + ' — ' + ktSep(kt)));
  html = repAll(html, '%%KARP_DESC%%', desc);
  html = repAll(html, '%%KARP_CANON%%', canonical);
  html = repAll(html, '"%%KARP_JSONLD%%"', ld);
  html = repAll(html, '%%KARP_MAIN%%', felagMainHtml(f, kt));
  res = new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function fyrirtaekiHandler(request, env, ctx) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2) return sjson({ error: 'q' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/fyrirtaeki?q=' + encodeURIComponent(q.toLowerCase()));
  let res = await cache.match(cacheKey);
  if (res) return res;
  const H = { 'User-Agent': 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)' };
  const kt = q.replace(/[\s.-]/g, '');
  let out = null;
  try {
    let detailUrl = /^\d{10}$/.test(kt) ? RSK_ROT + '/fyrirtaekjaskra/leit/kennitala/' + kt : null;
    if (!detailUrl) {
      const up = await fetch(RSK_ROT + '/fyrirtaekjaskra/leit?nafn=' + encodeURIComponent(q), { headers: H, redirect: 'manual' });
      if (up.status >= 300 && up.status < 400) {
        // EITT treff → redirect beint á detail-síðuna
        const m = (up.headers.get('location') || '').match(/\/leit\/kennitala\/(\d{10})/);
        if (m) detailUrl = RSK_ROT + '/fyrirtaekjaskra/leit/kennitala/' + m[1];
      } else if (up.ok) {
        const html = await up.text();
        const hits = rskListi(html);
        // heildarfjöldi raða á síðunni (RSK sýnir allt að ~100) — hits þakið við 40
        const alls = (html.match(/\/leit\/kennitala\/\d{10}/g) || []).length;
        out = { q, hits, ...(alls > hits.length ? { alls } : {}) };
      }
    }
    if (detailUrl) {
      const up = await fetch(detailUrl, { headers: H });
      if (up.ok) out = { q, felag: rskFelag(await up.text()), rsk: detailUrl };
    }
  } catch (e) {}
  if (!out) return sjson({ error: 'upstream' });
  // ── Auðgun úr OPINBERA RSK-API-inu (Fasi 2a) — API aðal, skrap heldur sínu ef API tómt/óvirkt.
  // felag.rsk = fullur hreinsaður hlutur (afskraning/gjaldþrot, hlutafé, tengsl…). Overlay á lykilreiti.
  if (out.felag && /^\d{10}$/.test(out.felag.kt || kt)) {
    try {
      const rr = await rskHandler(new Request('https://k.internal/api/rsk?kt=' + (out.felag.kt || kt)), env, ctx);
      const rd = await rr.json().catch(() => null);
      if (rd && rd.holdur) {
        const f = out.felag;
        f.rsk = rd;
        if (rd.stada) f.stada = rd.stada;                       // opinber staða ("Virk skráning")
        if (rd.tilgangur) f.tilgangur = rd.tilgangur;
        if (rd.form) f.form = rd.form;                          // API-form áreiðanlegra en skrap
        if (rd.afskraning) f.afskraning = rd.afskraning;        // NÝTT: gjaldþrot/gjaldþol + dags → KYC
        if (rd.hlutafe) { f.hlutafe = rd.hlutafe; f.mynt = rd.mynt || null; }
        if (rd.undirskrift) f.undirskrift = rd.undirskrift;
        if (rd.atkvaedi) f.atkvaedi = rd.atkvaedi;
        if (Array.isArray(rd.tengsl) && rd.tengsl.length) f.fyrirsvar = rd.tengsl;   // structured fyrirsvar (aðal)
      }
    } catch (e) {}
  }
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ── Skipaleit (island.is/api/graphql shipRegistryShipSearch — opið, óauðkennt) ──
// skipaskrárnúmer EÐA nafn → tegund/smíðaár/stærð/heimahöfn/umdæmi/staða + EIGENDUR m/kt.
// regno == Fiskistofu-skipnr (→ aflamark). ⚠ vél/afl + kallmerki eru X-Road-læst (ekki í opna módelinu).
// Sjá memory/iceland-skipaskra-api.md. Per-IP dagskvóti + 24h cache (öryggisnet), eins og ökutæki.
// ⚠ EKKI operationName í body — fyrirspurnin er nafnlaus (annars 400, sama gildra og publicVehicleSearch).
const SKIP_Q = 'query($input: ShipRegistryShipSearchInput!){ shipRegistryShipSearch(input:$input){ ships{ shipName shipType regno region portOfRegistry regStatus grossTonnage length manufactionYear manufacturer opid owners{ name nationalId sharePercentage } } } }';
// Íslensk kennitala lögaðila: fyrstu 2 stafir = stofndagur + 40 (41–71); einstaklingar 01–31.
const skipErFyrirtaeki = (kt) => /^\d{10}$/.test(kt || '') && +String(kt).slice(0, 2) >= 41 && +String(kt).slice(0, 2) <= 71;
function skipMap(s) {
  return {
    skipaskrarnumer: s.regno ?? null,        // == Fiskistofu-skipnr → join við aflamark
    nafn: s.shipName || null,
    tegund: s.shipType || null,              // "FISKISKIP" eða stigskipt "FISKISKIP -> SKUTTOGARI"
    umdaemi: s.region || null,
    heimahofn: s.portOfRegistry || null,
    stada: s.regStatus || null,              // t.d. "Á aðalskipaskrá"
    bruttotonn: s.grossTonnage ?? null,
    lengd: s.length ?? null,                 // skráningarlengd (m)
    smidaar: s.manufactionYear ? (Number(s.manufactionYear) || s.manufactionYear) : null,
    smidastod: s.manufacturer || null,
    opinnBatur: s.opid === 'Já' ? true : s.opid === 'Nei' ? false : null,
    eigendur: (s.owners || []).map((o) => ({
      nafn: o.name || null,
      kt: o.nationalId || null,
      hlutur: o.sharePercentage,             // eignaprósenta (getur verið 0 — gagnasérviska)
      erFyrirtaeki: skipErFyrirtaeki(o.nationalId), // false = einstaklingur (persónuvernd á einkabátum)
    })),
  };
}
async function skipHandler(request, ctx) {
  const u = new URL(request.url);
  const qs = (u.searchParams.get('numer') || u.searchParams.get('q') || u.searchParams.get('nafn') || '').trim().slice(0, 64);
  if (qs.length < 2) return sjson({ error: 'q', ships: [] });
  const cache = caches.default;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'x';
  const ipKey = new Request('https://cache.karp.internal/skip-ip/' + day + '/' + encodeURIComponent(ip));
  const qhit = await cache.match(ipKey);
  const usedN = qhit ? parseInt(await qhit.text(), 10) || 0 : 0;
  if (usedN >= 60) return sjson({ error: 'kvoti', ships: [] });
  const cacheKey = new Request('https://cache.karp.internal/api/skip?qs=' + encodeURIComponent(qs.toLowerCase()));
  let res = await cache.match(cacheKey);
  if (res) return res;
  ctx.waitUntil(cache.put(ipKey, new Response(String(usedN + 1), { headers: { 'cache-control': 'public, max-age=86400' } })));
  let out = { qs, count: 0, ships: [] };
  try {
    const r = await fetch('https://island.is/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' },
      body: JSON.stringify({ query: SKIP_Q, variables: { input: { qs } } }),  // ⚠ EKKI operationName (nafnlaus → 400)
    });
    const j = await r.json().catch(() => null);
    const d = j && j.data && j.data.shipRegistryShipSearch;
    const all = ((d && d.ships) || []).map(skipMap);
    out = { qs, count: all.length, ships: all.slice(0, 50), ...(all.length > 50 ? { alls: all.length } : {}) };
  } catch (e) { return sjson(out); }
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  if (out.count) ctx.waitUntil(cache.put(cacheKey, res.clone()));  // aðeins svar með niðurstöðum cache-að
  return res;
}

// ── LOTA 94: Opinberir styrkir (úthlutanir opinberra sjóða) → „Styrkir sem félagið fékk" ──
// ENGIN uppspretta birtir kt → tenging á NAFNI. styrkNorm speglar normNafn í build_styrkir.js.
// Gögn: gogn/styrkir.json → web/public/gogn (ASSETS, augGet). Sjá memory/iceland-styrkir-api.md.
function styrkNorm(n) {
  return String(n == null ? '' : n).toLowerCase()
    .replace(/\(félag afskráð\)/gi, '')
    .replace(/\b(ehf|ohf|hf|slf|sf|ses|hses|bs|svf)\.?/g, '')
    .replace(/[.,;:()"'/\-–]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const styrkKr = (v) => v >= 1e6
  ? (Math.round(v / 1e5) / 10).toFixed(1).replace('.', ',') + ' m.kr'
  : String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' kr';
// Samsvörun: 1) NÁKVÆMT (eins normaliserað nafn — leysir langflest, virkar þvert á sjóði);
//   2) ÁÆTLAÐ: fyrirtækjanafnið er heil-tóka-hlutmengi lengra styrkþega-nafns MEÐ sterku
//   sérkennis-ankeri (sameiginlegur tóki ≥6 stafir, eða ≥2 sameiginlegir ≥5) → forðast falskar
//   jákvæðar á algengum orðum. ⚠ tóka-JAFNGILDI krafist (ekki forskeyti) svo „íslensk" og
//   „íslenskar" gefa EKKI samsvörun. Skilar {idx, naemi:'nákvæmt'|'nafn'|null}.
function matchStyrkir(rawNafn, data) {
  const byNafn = (data && data.byNafn) || {};
  const qn = styrkNorm(rawNafn);
  if (qn.length < 2) return { idx: [], naemi: null };
  if (byNafn[qn]) return { idx: byNafn[qn].slice(), naemi: 'nákvæmt' };
  const qt = qn.split(' ').filter(Boolean);
  const seen = new Set(), out = [];
  for (const k in byNafn) {
    if (k === qn) continue;
    const kt2 = k.split(' ').filter(Boolean);
    const [s, l] = qt.length <= kt2.length ? [qt, kt2] : [kt2, qt];
    const L = new Set(l);
    if (!s.every((t) => L.has(t))) continue;
    if (s.length === 1 && s[0] !== l[0]) continue;   // eins-tóka: aðeins ef nafnið er HAUS lengra nafns („Samherji"→„Samherji Ísland"), ekki mið-/enda-orð
    const shared = s.filter((t) => t.length >= 5);
    if (!(shared.some((t) => t.length >= 6) || (s.length >= 2 && shared.length >= 1))) continue;
    for (const i of byNafn[k]) if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return { idx: out, naemi: out.length ? 'nafn' : null };
}
async function styrkirHandler(request, env, ctx) {
  const u = new URL(request.url);
  let nafn = (u.searchParams.get('nafn') || '').trim().slice(0, 80);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  // aðeins kt gefið → leysa opinbert nafn úr RSK-leit (EITT félag á view-tíma; ALDREI fjöldakall).
  if (!nafn && kt.length === 10) {
    try {
      const r = await fyrirtaekiHandler(new Request('https://k.internal/api/fyrirtaeki?q=' + kt), env, ctx);
      const d = await r.json().catch(() => null);
      if (d && d.felag && d.felag.nafn) nafn = d.felag.nafn;
    } catch (e) {}
  }
  const tomt = { nafn: nafn || '', holdur: false, n: 0, total: 0, sjodir: [], styrkir: [] };
  if (!nafn) return sjson(tomt);
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/styrkir?n=' + encodeURIComponent(styrkNorm(nafn)));
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const data = await augGet(env, 'styrkir.json');
  let out = tomt;
  if (data) {
    const m = matchStyrkir(nafn, data);
    if (m.idx.length) {
      const rs = m.idx.map((i) => data.styrkir[i]).filter(Boolean)
        .sort((a, b) => (b.ar - a.ar) || (b.upphaed - a.upphaed));
      const total = rs.reduce((a, r) => a + (r.upphaed || 0), 0);
      const sjMap = {};
      for (const r of rs) { const s = sjMap[r.sjodur] || (sjMap[r.sjodur] = { sjodur: r.sjodur, count: 0, total: 0 }); s.count++; s.total += r.upphaed || 0; }
      out = {
        nafn, holdur: true, naemi: m.naemi, n: rs.length, total,
        sjodir: Object.values(sjMap).sort((a, b) => b.total - a.total),
        styrkir: rs.slice(0, 30).map((r) => ({ sjodur: r.sjodur, flokkur: r.flokkur || null, upphaed: r.upphaed, ar: r.ar, verkefni: r.verkefni || null, vilyrdi: !!r.vilyrdi, heimild: r.heimild })),
      };
    }
  }
  const res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  if (data) ctx.waitUntil(cache.put(cacheKey, res.clone()));  // cache-a aðeins þegar gagnaskrá hlóðst (ekki tímabundna bilun)
  return res;
}
// ── LOTA 95: Lögbirtingablaðið — opinberar LÖGFORMLEGAR tilkynningar FÉLAGA eftir kt ──
// Les forbyggða logbirting.json úr ASSETS (augGet; build_logbirting.py → build_ragcopy) og sneiðir
// eftir kt. ⚠ Per-auglýsing/kt-leit HJÁ BLAÐINU er áskriftarlæst (401) → forbygging = eina opna leiðin.
// AÐEINS lögaðilar (gjaldþrot/innköllun/skiptalok/félagsslit); einstaklingar/sakamál/nauðungarsölur
// síuð út í build-skriptu (persónuvernd, lög nr. 90/2018). Sjá memory/iceland-logbirtingabladid-api.md.
async function logbirtingHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, holdur: false, count: 0, tilkynningar: [] });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/logbirting?kt=' + kt);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const data = await augGet(env, 'logbirting.json');
  const labels = (data && data.typeLabels) || {}, sev = (data && data.severity) || {};
  const ent = data && (data.byKt || {})[kt];
  const notices = ent ? ent.notices : [];
  const out = {
    kt, nafn: (ent && ent.name) || null, holdur: notices.length > 0,
    heimild: 'Lögbirtingablaðið', heimildUrl: 'https://logbirtingablad.is', count: notices.length,
    // ⚠ Endurbirting háð skilyrðum skv. lögum nr. 90/2018 → flísin vísar ávallt á opinbera tölublaðið.
    tilkynningar: notices.map((n) => ({
      tegund: n.type, tegundHeiti: labels[n.type] || n.type, alvarleiki: sev[n.type] != null ? sev[n.type] : 0,
      dagsetning: n.date || null, domstoll: n.court || null,
      dagsThinghald: n.when || null, frestur: n.deadline || null,
      tolublad: n.issue != null ? n.issue : null, ar: n.year != null ? n.year : null, hlekkur: n.url || null,
    })),
  };
  const res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=21600' },
  });
  if (data) ctx.waitUntil(cache.put(cacheKey, res.clone()));  // cache-a aðeins þegar gögn hlóðust
  return res;
}

// F9 — þvingunaraðgerða-skimun: nafna-index opinberra refsilista (ESB+SÞ+OFAC) úr sanctions.json.
// first+last-token samsvörun (eins og PEP) → „möguleg samsvörun, staðfestu" (nafnasamsvörun, ekki úrskurður).

// ── Áreiðanleikavaktin: server-hlið skimun + merkja-lesari (v1). Sjá spec 2026-07-26. ──
// Obeint/endanlegt eignarhald (UBO): afmörkuð BFS UPP eign-netið (EIN D1-fyrirspurn á hnút), svo
// hrein traceUbo (ubo-core.mjs) margfaldar keðjur og safnar á einstaklinga með virkt eignarhald ≥25%.
// Þök (dýpt 8 / 200 hnútar) binda dagleg cron-kostnað; blindgötur/hringir → incompleteChain=true.
// ⚠ eign.hlutur er geymt sem STRENGUR ('60%' o.fl.) → hlutFrac þáttar; eigandi_tegund/felog-aðild
// skilgreinir félag vs einstakling (uncrawlað félag = félag, verður blindgata, EKKI ranglega einstaklingur).

// ── KYC v1 (Áreiðanleikavaktin) — vöktunarlisti per eiganda, tier-gátaður, upphafs-CDD við skráningu ──


// ── KYC v1 vöktunar-cron (Task 7): dagleg full-skimun (kycDiffCron) + 3-tíma kritísk skimun (kycCriticalCron) ──

// ── 🚨 Heilbrigðiseftirlit: STRAX-viðvörun við falli í 0-1 (stöðvun/takmörkun) — 3-tíma rásin ──
// „Strax" er bundið af gagnapípunni: eftirlit.json er skrapað daglega (~06:00 UTC, skilar ~07:00-07:30),
// svo þessi rás nær fallinu innan ~2 klst frá því gögnin lenda — sama morgun í stað mánudags.
// Dedup í EIGIN töflu (eftirlit_crit) svo vikulega eftirlit_last-díffið raskist ekki.
// Gátt: firmavakt.on (vaktin sjálf er samþykkið, eins og kycCriticalCron) — ÓHÁÐ digest.on.

// ── ⚖️ Lögbirting: STRAX-viðvörun við GJALDÞROTI á vöktuðu félagi — 3-tíma rásin ──
// Kveikja = tilkynning með alvarleika >=2 skv. severity-korti GAGNANNA sjálfra (build_logbirting.py:
// gjaldthrot_beidni=2, skiptabeidni=2) OG birt síðustu 14 daga. Dagsetningar-glugginn ver gegn
// sprengingu af gömlum málum ef dedup-taflan er tóm; dedup per tilkynningar-lykil (noticeRef).
// ⚠ „Árangurslaust fjárnám" er EKKI í þessum gögnum — það birtist ekki í Lögbirtingablaðinu heldur
// í vanskilaskrá, sem er leyfisskyld starfsemi (fjárhagsupplýsingastofa, Persónuvernd — todo #36).
// /api/vanskil er ANNAÐ: vanskil á ársreikningaskilum hjá RSK.

// LEI (GLEIF opið API) — alþjóðlegt lögaðila-auðkenni eftir kt (registeredAs). 5.500+ íslensk félög.

// Leyfaskrár (áfangi 1) — kt-lyklað, sameinar Sýslumenn (rekstrarleyfi) + Ferðamálastofu (ferðaleyfi) + Lyfjastofnun (apótek).

// ── Lobbývakt v1 — persónulegur straumur þingmála/samráðsmála eftir atvinnugrein (Fyrirtæki+ gátaður) ──
// Tier-gátt speglar _kycGate (account-eigandi erfir þrep). greina-val er PER-NOTANDA pref (uid) eins og frettavakt;
// gögnin (lobbyvakt.json) eru nætur-flokkuð í CI. Svör: HTTP 200 + {ok:false,error} skv. KARP-venjum.

// Loftför (Loftfaraskrá Samgöngustofu um OPNU island.is-gáttina) — kt → loftför sem félagið á/rekur.
// build_loftfor.mjs → gogn/loftfor.json byKt (aðeins lögaðilar). Sjá memory/iceland-islandis-graphql-audit.md.

// ── RSK Fyrirtækjaskrá — OPINBERT API (Skatturinn, api.skattur.cloud/legalentities/v2.1) ──
// Server-hlið lykill env.RSK_KEY (Ocp-Apim-Subscription-Key). Mælt/gjaldfært → harð-cache 24h.
// ⚠ PII: relationships[] bera kennitölur EINSTAKLINGA → aldrei birtar. Fyrirtækja-kt (dagur 41–71)
// haldið sem tengill milli félaga; einstaklings-kt (01–31) fjarlægt. Secret-gated: án lykils → unconfigured.

// Innri RAW-sækjari á RSK-API (heldur einstaklings-kt í minni fyrir kt-samsvörun) með eigin
// jaðar-cache (24h) svo tengslanet endurnýti köll milli róta. Skilar hreinsuðum hlut eða null.

// ── 🕸️ Kort-hamur: server-hlið nafna-felun (DPIA leið A) ─────────────────────
// Tengslakortið (?kort=1) birtir AÐEINS nöfn rót-tengds fólks. „krossar" = fólk með
// hlutverk í ≥2 net-félögum EN EKKI í rótinni → fjarlægir aðilar. Nöfn þeirra eru
// KLIPPT ÚR svarinu (fara aldrei í vafrann); þeir bera aðeins stöðugt token 'E'+n.
// Félög (lögaðilar) og rót-fyrirsvar (stjornendur) halda nöfnum — sama KYC-gildi og listinn.

// 🔀 RSK-proxy (LOTA — tengslagrunnur): Cloudflare-worker-egress er EKKI throttlað af
// www.skatturinn.is við magn (sannreynt: 32/40 köll m/≥100 treff, ekkert cutoff — öfugt við
// GitHub-runner sem deyr við ~30). Því beinir næturlegi crawlerinn skrapinu HINGAÐ og fær
// landsdekkun á vikum í stað mánaða. GATT: X-Karp-Proxy === RSK_KEY (til á báðum hliðum, ekkert
// nýtt secret). SSRF-vörn: aðeins /fyrirtaekjaskra/-slóðir á www.skatturinn.is. Skilar hráu HTML.

// 📊 Tengslagrunns-tölfræði (gátað: X-Karp-Proxy===RSK_KEY). Aðeins samtölur (engin PII) svo Aron/ég
// getum fylgst með framvindu crawl-sins hvenær sem er. GET /api/tengsl-stats.

// 🕸️ Landsdekkandi auðgun úr tengslagrunni (D1). Null-þolið: án env.TENGSL → óbreytt.
// Bætir landsvísu-félögum rót-tengds fólks í onnur[]. Persónu-kt (out.stjornendur[]._kt,
// server-hlið eingöngu) er notað sem D1-lykill og STRIPPAÐ hér áður en svarið fer út.

// 📊 Topplistar fyrirtækja (Karp+-læst). Pure gátun: entitled → fullt; annars topp-3 agn.
// _freeAll: notandi fær ALLT frítt — admin (panel+frítt) EÐA free_access (frítt en ekki admin). Aðeins réttinda-gátt, EKKI panel.
// pure: réttindi = admin EÐA virk Karp+-áskrift (tier og ekki útrunnið). nowSec = Unix-sekúndur.

// ── 🏢 Atvinnugreinar v1 — gátuð djúp-skýrsla per ÍSAT-deild (Fyrirtæki+) ─────────────────────
// GET /api/atvinnugrein?slug=<grein> → röðuð stærstu félög + samþjöppun LIFANDI úr D1 (felog⋈fjarhagur),
// grunduð í bökuðu sector_kpi.json viðmiðunum. Grein = eitt einkvæmt label (sjá sectorsFromMap): nær yfir
// LISTA ÍSAT-kóða (mis-langir: 2/3/4 stafir) mínus „án X"-undanskilningar. Tier-gátt speglar _kycGate/_lobbyGate
// (account-eigandi erfir þrep). Svör: HTTP 200 + {ok:false,error} skv. KARP-venjum; D1 tómt/óvirkt → tóm skýrsla.

// ── 🏭 Grein-rank: röðun félags í atvinnugrein sinni (OPIÐ, úr opinberum ársreikningum) ──
// GET /api/grein-rank?kt= → { rank, total, slug, label, sala }. Nýjasta ár per kt (dedup), engin gátt.
// Reiknar röð félags í atvinnugrein sinni (deilt af greinRankHandler + digest greina-vöktun).

// ── 🏭 ROADS: raunveruleg samsetning atvinnuvega úr ársreikningum (D1) ─────────────────────────
// GET /api/roads/atvinnuvegir → grundar þjóðhags-herminn í raun-fyrirtækjagögnum: fyrir hverja ÍSAT-grein
// heildarvelta, hlutur af heild, framlegð (hagnaður/velta), fjöldi greindra félaga. Nýjasta ár PER kt
// (MAX(ar)) svo fjölár tvítelji ekki. Opinbert samandregið (engin fyrirtæki nafngreind), cache 1klst.

// ── 🪑 Tengslanet (F10): fyrirsvarsmenn þvert á félög eignarhaldsnetsins ─────────────────────
// GET /api/tengslanet?kt= → { stjornendur: [rótarfyrirsvar + hlutverk í öðrum net-félögum],
// krossar: [fólk í ≥2 net-félögum án hlutverks í rót] }. Félagamengið = rót + félags-hnútar úr
// UBO-trénu (gogn/eigendur/<kt>.json), þak 12 (mælt API). Samsvörun með einstaklings-kt SERVER-HLIÐ;
// út fara AÐEINS nöfn + hlutverk + félags-kt (aldrei kt einstaklinga). Endurskoðendur/stofnendur/
// látnir síaðir frá (suð, sögulegt).

// ══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE-NATIVE AUÐKENNING (F2) — leysir WordPress/wp.karp.is af hólmi.
// Notendur/réttindi í D1 (env.TENGSL); lotur = undirritaðar HttpOnly-kökur (SESSION_SECRET).
// F1: lykilorðs-auth ÁN póst-staðfestingar (email_verified=1 við nýskráningu). F5 bætir póst-verify.
// ══════════════════════════════════════════════════════════════════════════
// D1 notandi → KARP_USER-lögun (sama snið og WP /me skilaði svo auth.js þurfi engar breytingar á lögun).

// ── F4: Áskell-grant + réttindi í D1 (leysir WP /sub/grant + /reports/grant af hólmi) ──
// Hrátt session/URL-uid (t.d. kaupandi úr checkout-slóð) → accountId eiganda. Task 5: kaup gagnast allri stofunni (ekki bara kaupandanum sjálfum).
// Áskrift (þjónusta eða þrep) → D1. Idempotent á ref. Setur trial_used (prufuvörn).
// Stök skýrsla → D1 (varanlegt grant, idempotent á user+key).
// Prufuvörn úr D1 (leysir WP /sub/trialstatus af hólmi).
// F4: vista kt á innskráðan notanda (bindur Áskell customer_reference → webhook finnur notanda).
// Leysir WP /sub/subscribe (sem vistaði karp_kt) af hólmi. Framendinn kallar á undan checkout.

// ══════════════════════════════════════════════════════════════════════════
// F5: TÖLVUPÓSTUR gegnum Gmail REST API (OAuth refresh-token) — leysir WP wp_mail af hólmi.
// Secret-gated: án GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN skilar sendGmail {unconfigured:true}
// og kallendur falla mjúkt. Notað fyrir: gleymt-lykilorð (/api/auth/forgot+reset) og /api/hjalp.
// ══════════════════════════════════════════════════════════════════════════
// Póst-sniðmát: les yfirskriftir stjórnanda (stjorn_sync k='email_templates') og bræðir við sjálfgefið.
// 60s minni-cache svo fan-out (digest/vaktir á marga notendur) valdi ekki D1-lestri per póst.
// NULL-ÞOLIÐ: villa/vöntun → sjálfgefið sniðmát úr emails.mjs (hegðun ÓBREYTT).
// Gleymt lykilorð — biður um endurstillingar-hlekk. Alltaf {ok:true} (engin notenda-upptalning).
// Setur nýtt lykilorð úr endurstillingar-tóken → skráir inn (staðfestir netfang um leið).
// F5: staðfesting netfangs. Sendir staðfestingar-póst (auth_tokens kind='verify', 24 klst). Endurnýtir sömu töflu og reset.
// GET-hlekkur úr staðfestingar-pósti → staðfestir netfang, skráir inn og sendir á Mitt svæði.
// Endursenda staðfestingar-póst fyrir óstaðfestan aðgang. Alltaf {ok:true} (engin notenda-upptalning).

// ══════════════════════════════════════════════════════════════════════════
// F6: PERÍFERU NOTENDA-GÖGN — allt undir /api/u/* (leysir WP user-meta af hólmi).
// Vakt-/stillinga-blobbar → user_prefs; kvóti → users.reports_used + sub_service.used;
// samfélag (atkvæði/spár/kannanir) → deildar töflur með aggregate. KARP_API=/api/u í framhlið.
// ══════════════════════════════════════════════════════════════════════════
// ── firma-account (sæta-sameign v1): resolve account-eiganda + sjálf-tenging meðlima ──
// Er u boðið af ownerId (email á team-lista + eigandi virkur + laust sæti)? Skilar owner-röð eða null.
// Fyrsta gilda boðið f. u sem er EKKI hafnað; null ef ekkert. Tengir EKKI.
async function _pollsPayload(env, uid) {
  const ps = await env.TENGSL.prepare('SELECT id, spurning, valkostir FROM polls WHERE virk=1 ORDER BY created DESC').all().catch(() => ({ results: [] }));
  const out = [];
  for (const p of (ps.results || [])) {
    const vs = await env.TENGSL.prepare('SELECT opt, COUNT(*) c FROM poll_votes WHERE poll_id=? GROUP BY opt').bind(p.id).all().catch(() => ({ results: [] }));
    const mine = uid ? await env.TENGSL.prepare('SELECT opt FROM poll_votes WHERE poll_id=? AND user_id=?').bind(p.id, uid).first().catch(() => null) : null;
    let valk = []; try { valk = JSON.parse(p.valkostir); } catch (e) {}
    out.push({ id: p.id, q: p.spurning, valkostir: valk, votes: valk.map((_, i) => { const f = (vs.results || []).find((v) => v.opt === i); return f ? f.c : 0; }), mine: mine ? mine.opt : null });
  }
  return { polls: out };
}
async function userDataHandler(request, env) {
  if (!env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/u/, '');   // '/leitvakt', '/reports/open', ...
  const method = request.method;
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  const body = method === 'POST' ? ((await request.json().catch(() => null)) || {}) : {};
  if (method === 'POST' && !uid) return _ajson({ ok: false, error: 'login' });   // allar skriftir krefjast innskráningar

  // ── Fréttavakt (merge-safe; verndar seenIds/lastSent gegn framenda) ──
  if (path === '/frettavakt') {
    const cur = await _prefGet(env, uid, 'frettavakt', { on: false, flokkar: [], cadence: 'daglegt', lastSent: 0, seenIds: [] });
    if (method === 'POST') {
      const merged = frettavaktMerge(cur, body, FRETTA_TYPES);
      await _prefSet(env, uid, 'frettavakt', merged);
      return _ajson({ ok: true, on: merged.on, flokkar: merged.flokkar, cadence: merged.cadence });
    }
    return _ajson({ on: cur.on, flokkar: cur.flokkar, cadence: cur.cadence });   // never echo seenIds/lastSent
  }

  // ── Lobbývakt: greina-val (persónuleg vakt-stilling per uid, eins og frettavakt; gátt liggur á /api/lobbyvakt) ──
  if (path === '/lobbyvakt-greinar') {
    if (method === 'POST') {
      let greinar, ord;
      if (Array.isArray(body.greinar)) {
        greinar = body.greinar.filter((g) => ALL_SECTORS.includes(g));
        await _prefSet(env, uid, 'lobbyvakt_greinar', greinar);
      }
      if (Array.isArray(body.ord)) {
        ord = [...new Set(body.ord.map((w) => String(w == null ? '' : w).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
        await _prefSet(env, uid, 'lobbyvakt_ord', ord);
      }
      if (greinar === undefined) greinar = await _prefGet(env, uid, 'lobbyvakt_greinar', []);
      if (ord === undefined) ord = await _prefGet(env, uid, 'lobbyvakt_ord', []);
      return _ajson({ ok: true, greinar, ord });
    }
    return _ajson({ greinar: await _prefGet(env, uid, 'lobbyvakt_greinar', []), ord: await _prefGet(env, uid, 'lobbyvakt_ord', []) });
  }

  // ── Blobb-endapunktar (geymdu-og-echo) ──
  const bk = path.slice(1);
  if (_U_BLOBS.indexOf(bk) >= 0) {
    if (method === 'POST') { await _prefSet(env, uid, bk, body); return _ajson(Object.assign({ ok: true }, body)); }
    return _ajson(await _prefGet(env, uid, bk, {}));
  }

  // ── Fylgja (array-blobb; birtist líka í /me.follows) — account-scoped (Task 5: deilt með stofunni) ──
  if (path === '/follows' && method === 'POST') {
    const f = Array.isArray(body.follows) ? body.follows.map((x) => String(x)).slice(0, 500) : [];
    const fu = await env.TENGSL.prepare('SELECT id, parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
    await _prefSet(env, accountId(fu) || uid, 'follows', f);
    return _ajson({ follows: f });
  }

  // ── Prófíll (nafn) ──
  if (path === '/profile' && method === 'POST') {
    const name = String(body.name || '').trim().slice(0, 80);
    await env.TENGSL.prepare('UPDATE users SET name=?, updated=? WHERE id=?').bind(name || null, now, uid).run().catch(() => {});
    return _ajson({ ok: true, name });
  }

  // ── Keyptar/veittar skýrslur ──
  if (path === '/reports' && method === 'GET') {
    if (!uid) return _ajson({ reports: [] });
    const ru = await env.TENGSL.prepare('SELECT id, parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
    const racct = accountId(ru) || uid;   // account-scoped (samræmi við /me.reports)
    const r = await env.TENGSL.prepare('SELECT report_key, granted FROM reports_granted WHERE user_id=? ORDER BY granted DESC').bind(racct).all().catch(() => ({ results: [] }));
    const rows = r.results || [];
    // Auðga með félagsnafni (úr felog) fyrir kt-lyklaðar skýrslur → „nafn + tegund" á Mitt svæði
    // (fyrirtaeki:/eigendur:/areidanleiki:/fjolmidlar: bera 10-stafa kt í lyklinum).
    const ktOf = (k) => { const i = String(k).indexOf(':'); const id = i < 0 ? '' : String(k).slice(i + 1); return /^\d{10}$/.test(id) ? id : null; };
    const kts = [...new Set(rows.map((x) => ktOf(x.report_key)).filter(Boolean))];
    const nafnBy = {};
    if (kts.length) {
      const nr = await env.TENGSL.prepare('SELECT kt,nafn FROM felog WHERE kt IN (' + kts.map(() => '?').join(',') + ')').bind(...kts).all().catch(() => ({ results: [] }));
      for (const f of (nr.results || [])) nafnBy[f.kt] = f.nafn;
    }
    return _ajson({ reports: rows.map((x) => ({ key: x.report_key, nafn: nafnBy[ktOf(x.report_key)] || null, granted: x.granted || null })) });
  }

  // ── Skýrslu-kvóti þreps: /reports/open ──
  if (path === '/reports/open' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    if (_freeAll(u)) return _ajson({ owned: true });
    const acct = accountId(u);                       // grant + kvóta-teljari á account-eiganda (revenue-leak vörn)
    const owner = await accountOwner(env, u);
    if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(acct, key).first().catch(() => null)) return _ajson({ owned: true });
    const quota = REPORT_QUOTA[tierFields(u, owner, now).effectiveTier] || 0;   // þak skv. account-þrepi (effectiveTier, sama og /me)
    const used = (owner.reports_month === _monthStr(now)) ? (owner.reports_used || 0) : 0;
    if (quota > 0 && used < quota) {
      await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id,report_key,granted) VALUES (?,?,?)').bind(acct, key, now).run().catch(() => {});
      await env.TENGSL.prepare('UPDATE users SET reports_used=?, reports_month=?, updated=? WHERE id=?').bind(used + 1, _monthStr(now), now, acct).run().catch(() => {});
      return _ajson({ granted: true, remaining: quota - used - 1 });
    }
    return _ajson({ needPay: true });
  }

  // ── Þingmannaskýrslu-kvóti (thingskyrslur-áskrift, 20/mán): /thing/open ──
  if (path === '/thing/open' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT id, is_admin, parent_account_id, free_access FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    if (_freeAll(u)) return _ajson({ owned: true });
    const acct = accountId(u);                       // áskrift + grant + kvóti á account-eiganda
    if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(acct, key).first().catch(() => null)) return _ajson({ owned: true });
    const s = await env.TENGSL.prepare('SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?').bind(acct, 'thingskyrslur', now).first().catch(() => null);
    if (!s) return _ajson({ error: 'nosub' });
    const used = (s.used_month === _monthStr(now)) ? (s.used || 0) : 0;
    if (used < 20) {
      await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id,report_key,granted) VALUES (?,?,?)').bind(acct, key, now).run().catch(() => {});
      await env.TENGSL.prepare('UPDATE sub_service SET used=?, used_month=? WHERE user_id=? AND service=?').bind(used + 1, _monthStr(now), acct, 'thingskyrslur').run().catch(() => {});
      return _ajson({ granted: true, remaining: 20 - used - 1 });
    }
    return _ajson({ needPay: true, resets: _nextMonth(now) });
  }

  // ── Fasteignamats-kvóti (fasteign-áskrift, 20/mán; endurmat sama fangs frítt): /fasteign/meta ──
  if (path === '/fasteign/meta' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT id, is_admin, parent_account_id, free_access FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    const acct = accountId(u);                       // fasteign-áskrift + kvóti á account-eiganda (fasteign_done-pref = Task 5)
    const done = await _prefGet(env, acct, 'fasteign_done', []);
    if (_freeAll(u)) { if (done.indexOf(key) < 0) { done.push(key); await _prefSet(env, acct, 'fasteign_done', done); } return _ajson({ granted: true, owned: false, remaining: -1 }); }
    const s = await env.TENGSL.prepare('SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?').bind(acct, 'fasteign', now).first().catch(() => null);
    const used = (s && s.used_month === _monthStr(now)) ? (s.used || 0) : 0;
    if (done.indexOf(key) >= 0) return _ajson({ granted: true, owned: true, remaining: s ? Math.max(0, 20 - used) : 0 });
    if (!s) return _ajson({ error: 'nosub' });
    if (used < 20) {
      done.push(key); await _prefSet(env, acct, 'fasteign_done', done);
      await env.TENGSL.prepare('UPDATE sub_service SET used=?, used_month=? WHERE user_id=? AND service=?').bind(used + 1, _monthStr(now), acct, 'fasteign').run().catch(() => {});
      return _ajson({ granted: true, owned: false, remaining: 20 - used - 1 });
    }
    return _ajson({ needPay: true, resets: _nextMonth(now) });
  }

  // ── Viðskiptamannavakt (kt-listi) + Teymi (sæti) ──
  if (path === '/ktwatch') {
    const u = uid ? await env.TENGSL.prepare('SELECT is_admin, tier, tier_until, parent_account_id, free_access FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const cap = u ? _ktwatchCap(await accountOwner(env, u), now) : 0;   // þak skv. account-eiganda (ktwatch-listi = Task 5)
    const acct = u ? accountId(u) : uid;                                // deildur kt-listi á account-eigandanum (Task 5)
    let list = await _prefGet(env, acct, 'ktwatch', []);
    if (method === 'POST') {
      const kt = String(body.kt || '').replace(/\D/g, '');
      if (kt.length === 10) {
        if (body.action === 'remove') list = list.filter((x) => x !== kt);
        else if (list.indexOf(kt) < 0) { if (cap >= 0 && list.length >= cap) return _ajson({ ok: false, error: 'cap', kt: list, cap }); list.push(kt); }
        await _prefSet(env, acct, 'ktwatch', list);
      }
      return _ajson({ ok: true, kt: list, cap });
    }
    return _ajson({ kt: list, cap });
  }
  if (method === 'POST' && path === '/invite/accept') {
    if (!uid) return _ajson({ ok: false, error: 'login' });
    const u = await env.TENGSL.prepare('SELECT id,email,parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ ok: false, error: 'login' });
    if (u.parent_account_id) return _ajson({ ok: false, error: 'already' });
    const owner = await _inviteEligible(env, u, parseInt(body.owner_id, 10), now);
    if (!owner) return _ajson({ ok: false, error: 'invalid' });
    await env.TENGSL.prepare('UPDATE users SET parent_account_id=? WHERE id=?').bind(owner.id, uid).run().catch(() => {});
    return _ajson({ ok: true, owner: owner.name || owner.email });
  }
  if (method === 'POST' && path === '/invite/decline') {
    if (!uid) return _ajson({ ok: false, error: 'login' });
    const ownerId = parseInt(body.owner_id, 10);
    const declined = await _prefGet(env, uid, 'invite_declined', []);
    if (declined.indexOf(ownerId) < 0) { declined.push(ownerId); await _prefSet(env, uid, 'invite_declined', declined); }
    return _ajson({ ok: true });
  }
  if (path === '/team') {
    const u = uid ? await env.TENGSL.prepare('SELECT is_admin, tier, tier_until, parent_account_id, free_access FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const cap = u ? _seatsCap(u, now) : 1;
    let members = await _prefGet(env, uid, 'team', []);
    if (method === 'POST') {
      if (u && u.parent_account_id) return _ajson({ ok: false, error: 'member' });   // meðlimur má ekki stjórna team-i (aðeins eigandi)
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (body.action === 'remove') members = members.filter((x) => x !== email);
        else if (members.indexOf(email) < 0) { if (cap >= 0 && members.length >= cap) return _ajson({ ok: false, error: 'cap', members, cap }); members.push(email); }
        await _prefSet(env, uid, 'team', members);
      }
      return _ajson({ ok: true, members, cap });
    }
    const activeSet = new Set(((await env.TENGSL.prepare('SELECT email FROM users WHERE parent_account_id=?').bind(uid).all().catch(() => ({ results: [] }))).results || []).map((r) => (r.email || '').toLowerCase()));
    const status = {}; for (const e of members) status[e] = activeSet.has(e) ? 'active' : 'pending';
    return _ajson({ members, cap, status });
  }

  // ── Kortalausar prufur (bráðabirgða launch-flæði) ──
  if (path === '/plus/trial' && method === 'POST') {
    const u = await env.TENGSL.prepare('SELECT tier_trial_used FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u || u.tier_trial_used) return _ajson({ ok: false, error: 'used' });
    await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, tier_trial_used=1, updated=? WHERE id=?').bind('grunnur', now + 30 * 86400, now, uid).run().catch(() => {});
    return _ajson({ ok: true });
  }
  if (path === '/sub/trial' && method === 'POST') {
    const service = String(body.service || '');
    if (!_svcOk(service)) return _ajson({ ok: false, error: 'input' });
    if (await trialUsedD1(env, uid, 'service', service)) return _ajson({ ok: false, error: 'used' });
    await env.TENGSL.prepare('INSERT INTO sub_service (user_id,service,until,trial_used) VALUES (?,?,?,1) ON CONFLICT(user_id,service) DO UPDATE SET until=excluded.until, trial_used=1').bind(uid, service, now + 30 * 86400).run().catch(() => {});
    return _ajson({ ok: true });
  }

  // ── Samfélag: spár, þingmála-atkvæði, kannanir (opinberar tölur; skrif krefjast innskr.) ──
  if (path === '/spa') {
    const topic = (method === 'POST' ? String(body.topic || '') : String(url.searchParams.get('topic') || '')).slice(0, 80);
    if (!topic) return _ajson({});
    if (method === 'POST') { const val = Number(body.value); if (isFinite(val)) await env.TENGSL.prepare('INSERT INTO spa_votes (topic,user_id,val,updated) VALUES (?,?,?,?) ON CONFLICT(topic,user_id) DO UPDATE SET val=excluded.val, updated=excluded.updated').bind(topic, uid, val, now).run().catch(() => {}); return _ajson({ ok: true }); }
    const agg = await env.TENGSL.prepare('SELECT AVG(val) a, COUNT(*) c FROM spa_votes WHERE topic=?').bind(topic).first().catch(() => null);
    const mine = uid ? await env.TENGSL.prepare('SELECT val FROM spa_votes WHERE topic=? AND user_id=?').bind(topic, uid).first().catch(() => null) : null;
    return _ajson({ avg: agg && agg.a != null ? Math.round(agg.a * 100) / 100 : null, count: agg ? agg.c : 0, mine: mine ? mine.val : null });
  }
  if (path === '/vote') {
    const bill = (method === 'POST' ? String(body.bill || '') : String(url.searchParams.get('bill') || '')).slice(0, 120);
    if (!bill) return _ajson({});
    if (method === 'POST') { const c = String(body.choice || ''); if (c === 'ja' || c === 'nei') await env.TENGSL.prepare('INSERT INTO bill_votes (bill,user_id,choice,updated) VALUES (?,?,?,?) ON CONFLICT(bill,user_id) DO UPDATE SET choice=excluded.choice, updated=excluded.updated').bind(bill, uid, c, now).run().catch(() => {}); }
    const agg = await env.TENGSL.prepare("SELECT SUM(choice='ja') ja, SUM(choice='nei') nei FROM bill_votes WHERE bill=?").bind(bill).first().catch(() => null);
    const mine = uid ? await env.TENGSL.prepare('SELECT choice FROM bill_votes WHERE bill=? AND user_id=?').bind(bill, uid).first().catch(() => null) : null;
    return _ajson({ ja: agg && agg.ja ? agg.ja : 0, nei: agg && agg.nei ? agg.nei : 0, mine: mine ? mine.choice : '' });
  }
  if (path === '/polls' && method === 'GET') return _ajson(await _pollsPayload(env, uid));
  if (path === '/pollvote' && method === 'POST') {
    const id = String(body.id || ''); const opt = Number(body.option);
    if (id && isFinite(opt)) await env.TENGSL.prepare('INSERT INTO poll_votes (poll_id,user_id,opt,updated) VALUES (?,?,?,?) ON CONFLICT(poll_id,user_id) DO UPDATE SET opt=excluded.opt, updated=excluded.updated').bind(id, uid, opt, now).run().catch(() => {});
    return _ajson(await _pollsPayload(env, uid));
  }

  // 📊 Umferð (admin) — Cloudflare zone-analytics í stað WP Burst Statistics.
  if (path === '/burst' && method === 'GET') {
    const u = uid ? await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    if (!u || u.is_admin !== 1) return _ajson({ available: false, error: 'admin' });
    return _ajson(await burstStats(env));
  }

  // Handvirk digest-kveikja (admin) — til prófunar; cron keyrir annars sjálfkrafa.
  if (path === '/digest-run' && method === 'POST') {
    const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u || u.is_admin !== 1) return _ajson({ ok: false, error: 'admin' });
    return _ajson(await digestRun(env));
  }
  // Handvirkur frétta-innlestur (admin) — prime-ar/uppfærir news-safnið; cron keyrir á 3 klst fresti.
  if (path === '/news-ingest' && method === 'POST') {
    const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u || u.is_admin !== 1) return _ajson({ ok: false, error: 'admin' });
    return _ajson(await newsIngest(env));
  }

  return _ajson({ ok: false, error: 'unknown' });
}

// ══════════════════════════════════════════════════════════════════════════
// F6: VIKU-DIGEST (worker cron) — leysir WP-cron karp_weekly_digest af hólmi.
// Gögn: opnar karp.is JSON (tölur/kaupskrá/althingi/útboð/frettavel/vörumerki).
// Notendur+vaktir úr D1 (user_prefs digest=on). Sendir með Gmail (sendGmail).
// ⚠ v1: orðaleit notar frettavel-feed (minna en gamla WP-fréttasafnið); firmavakt-
// staða (vanskil/afskráning) sleppt (þarf CF-snapshot) — vörumerki-hlutinn heldur sér.
// ══════════════════════════════════════════════════════════════════════════
// Les eigin static-eign (gogn/*.json) gegnum ASSETS-binding — EKKI HTTP self-subrequest
// (sama-svæðis fetch endur-kallar workerinn og skilar tómu). Fellur á global fetch ef ASSETS vantar.
// Íslenskir fjölmiðla-RSS (port úr karp-frettir.php) — fullt fréttasafn f. digest-orðaleit.
// ── Fréttavaktir (news alerts) ────────────────────────────────────────────────
export const MAX_PER_EMAIL = 30;
export function frettavaktMatch(feedItems, newsRows, ctx) {
  const flokkar = new Set(ctx.flokkar || []);
  const ord = (ctx.ord || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const seen = new Set(ctx.seenIds || []);
  const hitsOrd = (hay) => { const h = String(hay || '').toLowerCase(); return ord.some((w) => h.indexOf(w) >= 0); };
  const out = new Map();                                        // id → item (dedup + union)
  for (const it of feedItems || []) {
    if (!it || !it.id || seen.has(it.id)) continue;
    if (flokkar.has(it.type) || (ord.length && hitsOrd((it.title || '') + ' ' + (it.text || '')))) out.set(it.id, it);
  }
  if (ord.length) for (const n of newsRows || []) {
    if (!n || !n.url || seen.has(n.url) || out.has(n.url)) continue;
    if (hitsOrd((n.title || '') + ' ' + (n.body || ''))) out.set(n.url, { id: n.url, date: (n.ts ? new Date(n.ts * 1000).toISOString().slice(0, 10) : ''), type: 'frett', title: n.title, text: '', url: n.url, source: n.source });
  }
  return [...out.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, MAX_PER_EMAIL);
}
export function frettavaktDue(cadence, lastSent, now) {
  if (!lastSent) return true;
  const dt = now - lastSent;
  if (cadence === 'strax') return true;
  if (cadence === 'vikulegt') return dt >= 6.5 * 86400;
  return dt >= 20 * 3600;                                       // daglegt (default)
}
export function frettavaktMerge(existing, body, validTypes) {
  const e = existing || {}; const b = body || {};
  const flokkar = (Array.isArray(b.flokkar) ? b.flokkar : []).filter((t) => validTypes.has(t)).slice(0, 60);
  const cadence = ['strax', 'daglegt', 'vikulegt'].indexOf(b.cadence) >= 0 ? b.cadence : (e.cadence || 'daglegt');
  return { on: !!b.on, flokkar, cadence, lastSent: e.lastSent || 0, seenIds: Array.isArray(e.seenIds) ? e.seenIds : [] };
}
export function frettavaktEmail(matches) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const bySec = new Map();
  for (const m of matches) { const sec = m.type === 'frett' ? { key: 'frett', label: 'Fjölmiðlar' } : sectionOfType(m.type); const a = bySec.get(sec.label) || []; a.push(m); bySec.set(sec.label, a); }
  const rows = [...bySec.entries()].map(([label, items]) => {
    const li = items.map((m) => {
      const href = m.type === 'frett' ? esc(m.url) : ('https://karp.is/frettavel/' + esc(asciiId(m.id)) + '/');
      const badge = m.type === 'frett' ? (m.source || 'frétt') : ((CAT[m.type] || {}).label || m.type);
      return `<li style="margin:0 0 8px"><a href="${href}" style="color:#8a5e00;text-decoration:none;font-weight:600">${esc(m.title)}</a> <span style="color:#888;font-size:12px">· ${esc(badge)}</span></li>`;
    }).join('');
    return `<h3 style="font-size:14px;margin:16px 0 6px;color:#4a3a1e">${esc(label)}</h3><ul style="padding-left:18px;margin:0">${li}</ul>`;
  }).join('');
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;color:#222">
    <p style="font-size:15px">Ný mál á vöktunum þínum hjá Karp:</p>
    ${rows}
    <p style="margin-top:22px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px">
      <a href="https://karp.is/mitt-svaedi/#p-still" style="color:#8a5e00">Stilla vaktir</a> · Fréttavél Karp — sjálfvirkt fundið úr opinberum gögnum.
    </p></div>`;
}
export const SEEN_CAP = 300;
export async function frettavaktCron(env) {
  if (!env || !env.TENGSL) return;
  const now = Math.floor(Date.now() / 1000);
  const feed = await _dget(env, '/gogn/frettavel.json').catch(() => null);
  const items = (feed && feed.items) || [];
  const news = await newsSince(env, 2, 500).catch(() => []);
  const subs = await env.TENGSL.prepare("SELECT user_id, v FROM user_prefs WHERE k='frettavakt' AND v LIKE '%\"on\":true%'").all().catch(() => null);
  for (const row of (subs && subs.results) || []) {
    try {
      const sub = JSON.parse(row.v);
      if (!sub.on || !frettavaktDue(sub.cadence, sub.lastSent, now)) continue;
      // Byggja leitarorð úr núverandi vöktum: leitvakt.ord + nöfn úr follows ("co:<nafn>").
      const lv = await _prefGet(env, row.user_id, 'leitvakt', {});
      const fl = await _prefGet(env, row.user_id, 'follows', []);
      const ord = [].concat(Array.isArray(lv.ord) ? lv.ord : [], (Array.isArray(fl) ? fl : []).filter((x) => String(x).indexOf('co:') === 0).map((x) => String(x).slice(3))).filter(Boolean);
      const matches = frettavaktMatch(items, news, { flokkar: sub.flokkar || [], ord, seenIds: sub.seenIds || [] });
      if (!matches.length) continue;
      const u = await env.TENGSL.prepare('SELECT email, name FROM users WHERE id=?').bind(row.user_id).first().catch(() => null);
      if (!u || !u.email) continue;
      const ftpl = await _emailTpl(env, 'frettavakt');
      const fvars = { fjoldi: matches.length, lysing: (matches.length === 1 ? '1 nýtt mál' : matches.length + ' ný mál') };
      const r = await sendGmail(env, { to: u.email, subject: renderEmail(ftpl.subject, fvars), html: frettavaktEmail(matches) });
      if (!r.ok) continue;                                       // óstillt/villa → reyna aftur næst (ekki uppfæra stöðu)
      const seen = [...matches.map((m) => m.id), ...(sub.seenIds || [])].slice(0, SEEN_CAP);
      await _prefSet(env, row.user_id, 'frettavakt', Object.assign({}, sub, { seenIds: seen, lastSent: now }));
    } catch (e) { /* eins notanda villa fellir ekki hina */ }
  }
}

// 📊 Umferðartölfræði úr Cloudflare zone-analytics (GraphQL) — leysir WP Burst Statistics af hólmi.
// Secret-gated: án CF_ANALYTICS_TOKEN skilar {available:false} (búnaðurinn sýnir „ekki uppsett").
// Þarf API-tóka m/ Zone Analytics:Read + CF_ZONE_ID (eða token m/Zone:Read → fletti upp karp.is).
async function _cfZoneId(env) {
  if (env.CF_ZONE_ID) return env.CF_ZONE_ID;
  const r = await fetch('https://api.cloudflare.com/client/v4/zones?name=karp.is', { headers: { authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN } }).then((x) => x.json()).catch(() => null);
  return (r && r.result && r.result[0] && r.result[0].id) || null;
}
async function burstStats(env) {
  if (!env.CF_ANALYTICS_TOKEN) return { available: false };
  const zone = await _cfZoneId(env);
  if (!zone) return { available: false };
  const today = new Date().toISOString().slice(0, 10);
  const wk = new Date(Date.now() - 6 * 86400 * 1000).toISOString().slice(0, 10);
  const q = 'query($z:String!,$today:String!,$wk:String!){viewer{zones(filter:{zoneTag:$z}){today:httpRequests1dGroups(filter:{date:$today},limit:1){sum{pageViews}uniq{uniques}} wk:httpRequests1dGroups(filter:{date_geq:$wk},limit:7){sum{pageViews}uniq{uniques}}}}}';
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { z: zone, today, wk } }) }).then((x) => x.json()).catch(() => null);
  const z = r && r.data && r.data.viewer && r.data.viewer.zones && r.data.viewer.zones[0];
  if (!z) return { available: false };
  const tday = (z.today && z.today[0]) || { sum: {}, uniq: {} };
  let wkPv = 0, wkUq = 0;
  for (const d of (z.wk || [])) { wkPv += (d.sum && d.sum.pageViews) || 0; wkUq += (d.uniq && d.uniq.uniques) || 0; }
  return { available: true, today: { pageviews: (tday.sum && tday.sum.pageViews) || 0, visitors: (tday.uniq && tday.uniq.uniques) || 0 }, week: { pageviews: wkPv, visitors: wkUq }, top: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// F7: GAGNA-ENDAPUNKTAR úr WP í worker — frétta-safn (D1), fyrirtækja-umfjöllun,
// markaðir (Yahoo), orka (Landsnet), umferð (Vegagerðin). Leysir karp-frettir/
// markadir/orka/umferd.php af hólmi svo síðurnar virki eftir WP-eyðingu.
// ══════════════════════════════════════════════════════════════════════════
// Frétta-safn: cron les RSS → D1 (dedup á slóð), grisjar > 90 daga.
// SQL-leit í öllu safninu (51k+) eftir orðum — pushar síuna á D1 svo greiningar noti heilt ár.
// SQLite LIKE case-fold-ar aðeins ASCII → leitum bæði lágstöfum OG hástafs-fyrsta (nær ísl. Íslandsbanki/Össur).
// + ÍSLENSK BEYGING: fyrir einyrt, nógu-langt nafn bætum við ORÐAMÖRKUÐUM stofni (bil-á-undan '% stofn' EÐA
// texta-byrjun 'stofn%') svo beygðar myndir finnist (Landsbankinn/Landsbankans/Landsbankanum/Landsbanka → 'landsbank').
// Orðamörkin verja gegn samsetningar-árekstri: '% landsbank' passar EKKI 'Íslandsbanka'. Grunnmyndin er höfð áfram
// óbreytt (ber '%nafn%') svo ekkert recall tapist fyrir óbeygjanleg/stutt nöfn (Marel, Icelandair, Össur).
// JS-hliðstæða _searchVariants fyrir per-grein eigna-mörkun (firmagraph/agenda co-occurrence): grunnmynd (includes)
// EÐA orðamarkaður stofn (byrjun eða bil-á-undan) — sama orðamörk og SQL svo 'landsbank' passi ekki 'íslandsbanka'.
// /api/frettir?efni=&q=&fjoldi= → { efni, items:[{title,link,date,source}] } (frétta-stika + /frettir/)
async function frettirHandler(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');
  const fjoldi = Math.min(+(url.searchParams.get('fjoldi') || 30) || 30, 60);
  let items;
  if (q) { items = await newsSearch(env, String(q).split(',').map((s) => s.trim()).filter((s) => s.length >= 3), 366, fjoldi); }   // fyrirtækja-fréttir: allt árið
  else { items = await newsSince(env, 14, 300); if (!items.length) items = await fetchNews(); }
  return _fjson({ efni: url.searchParams.get('efni') || 'allt', items: items.slice(0, fjoldi).map((n) => ({ title: n.title, link: n.url, date: n.date, source: n.source })) }, 600);
}
// Léttur íslenskur tónn-lexíkon (fyrirtækja-umfjöllun). Ekki AI — nægir fyrir grænt/rautt merki.
// Raunfjöldi frétta sem passa við leitina (án LIMIT) — svo KPI sýni ekki þakið sem heildartölu.
// ── Premium-greining úr D1-frétta-safni (port úr karp-frettir.php). Sparsara en WP meðan safnið vex. ──
function _entCos(list) {   // [{n,a:[...]}] → [{name, al:[lágstafir≥3]}]
  const cos = [];
  for (const e of (list || []).slice(0, 120)) {
    const nm = String((e && e.n) || '').trim(); if (!nm) continue;
    const al = ((e.a && e.a.length) ? e.a : [nm]).map((a) => String(a).trim().toLowerCase()).filter((a) => a.length >= 3);
    if (al.length) cos.push({ name: nm, al });
  }
  return cos;
}
async function _graphCompute(env, cos, days) {   // co-occurrence í frétta-body → { nodes, links }
  const all = await newsSearch(env, cos.flatMap((c) => c.al), days, 4000);   // aðeins greinar sem nefna einhvern aðilann
  const counts = {}, pair = {};
  for (const nw of all) {
    const hay = (nw.body || nw.title).toLowerCase();
    const hit = [];
    for (const c of cos) if (_mentions(hay, c.al)) hit.push(c.name);
    if (!hit.length) continue;
    for (const nm of hit) counts[nm] = (counts[nm] || 0) + 1;
    if (hit.length >= 2) { hit.sort(); for (let i = 0; i < hit.length; i++) for (let j = i + 1; j < hit.length; j++) { const k = hit[i] + '|@|' + hit[j]; pair[k] = (pair[k] || 0) + 1; } }
  }
  const allow = {}, nodes = [];
  for (const nm in counts) if (counts[nm] >= 2) { nodes.push({ name: nm, val: counts[nm] }); allow[nm] = 1; }
  const links = [];
  for (const k in pair) { const p = k.split('|@|'); if (allow[p[0]] && allow[p[1]]) links.push({ source: p[0], target: p[1], value: pair[k] }); }
  nodes.sort((a, b) => b.val - a.val); links.sort((a, b) => b.value - a.value);
  return { nodes, links };
}
// /api/firmagraph (GET/POST body{entities:[{n,a}],days}) → {ready,days,nodes,links}
async function firmagraphHandler(request, env) {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? ((await request.json().catch(() => null)) || {}) : {};
  const days = Math.min(365, Math.max(7, +(body.days || url.searchParams.get('days') || 180) || 180));
  const cos = _entCos(body.entities);
  if (cos.length < 2) return _fjson({ ready: true, days, nodes: [], links: [] }, 300);
  return _fjson({ ready: true, days, ...(await _graphCompute(env, cos, days)) }, 300);
}
// /api/agenda POST body{topics:[{n,a}],days} → {ready,weekKeys,topics:[{n,total,recent,prior,weeks}]}
async function agendaHandler(request, env) {
  const body = (await request.json().catch(() => null)) || {};
  const days = Math.min(365, Math.max(28, +(body.days || 180) || 180));
  const cos = _entCos(body.topics);
  if (!cos.length) return _fjson({ ready: true, topics: [], weekKeys: [] }, 300);
  const all = await newsSearch(env, cos.flatMap((c) => c.al), days, 4000);   // aðeins greinar sem nefna eitthvert þema
  const now = Math.floor(Date.now() / 1000), cut30 = now - 30 * 86400, cut60 = now - 60 * 86400;
  const wk = {}, r30 = {}, p30 = {}, tot = {}, allWeeks = {};
  for (const nw of all) {
    const hay = (nw.body || nw.title).toLowerCase();
    const mon = nw.ts - ((new Date(nw.ts * 1000).getUTCDay() + 6) % 7) * 86400;
    const wkk = new Date(mon * 1000).toISOString().slice(0, 10);
    for (const c of cos) {
      if (!_mentions(hay, c.al)) continue;
      const nm = c.name;
      (wk[nm] = wk[nm] || {})[wkk] = (wk[nm][wkk] || 0) + 1;
      allWeeks[wkk] = 1; tot[nm] = (tot[nm] || 0) + 1;
      if (nw.ts >= cut30) r30[nm] = (r30[nm] || 0) + 1; else if (nw.ts >= cut60) p30[nm] = (p30[nm] || 0) + 1;
    }
  }
  const weekKeys = Object.keys(allWeeks).sort();
  const topics = cos.filter((c) => tot[c.name]).map((c) => ({ n: c.name, total: tot[c.name], recent: r30[c.name] || 0, prior: p30[c.name] || 0, weeks: weekKeys.map((k) => (wk[c.name] && wk[c.name][k]) || 0) })).sort((a, b) => b.total - a.total);
  return _fjson({ ready: true, weekKeys, topics, days }, 300);
}
// /api/yearreview → {ready,year,total,scored,months,bySource} (nær aftur til upphafs safnsins; vex með tíma)
async function yearreviewHandler(request, env) {
  if (!env.TENGSL) return _fjson({ ready: true, year: 2026, total: 0, months: [], bySource: [] }, 300);
  const since = Math.floor(Date.now() / 1000) - 366 * 86400;
  // Mánaðar-magn + heimildir: SQL-aggregation yfir ALLT safnið (ekki sótt í minni).
  // Mánaðar-magn + NÁKVÆMUR tónn (AVG(sent)) + heimildir — allt í SQL yfir heilt safn (geymdur tónn, dálkur sent).
  const moR = (await env.TENGSL.prepare("SELECT strftime('%Y-%m', ts, 'unixepoch') m, COUNT(*) n, AVG(sent) t FROM news WHERE ts>=? GROUP BY m ORDER BY m").bind(since).all().catch(() => ({ results: [] }))).results || [];
  const srcR = (await env.TENGSL.prepare('SELECT source, COUNT(*) n FROM news WHERE ts>=? GROUP BY source ORDER BY n DESC LIMIT 12').bind(since).all().catch(() => ({ results: [] }))).results || [];
  const total = moR.reduce((s, x) => s + x.n, 0);
  const months = moR.map((x) => ({ m: x.m, n: x.n, scored: x.n, idx: x.t != null ? Math.round(x.t * 20) : 0 }));
  const bySource = srcR.map((x) => ({ s: x.source, n: x.n }));
  return _fjson({ ready: true, year: 2026, total, scored: total, months, bySource, best: null, worst: null }, 300);
}
// /api/topwords?days= → {ready,words:[{w,n}]} — algengustu orð í fyrirsögnum (Í umræðunni)
const _STOP = new Set('eftir verður vegna fyrir með milli þegar aðeins mikið einnig þeirra hafði mundi verið meðal komið gæti þeim þessi þetta þessa hvað þarna síðan höfðu einn hafa munu ekki þess sína sínum sinni yfir undir gegn þrátt gerir enginn allir aðrir öllum sagði kemur komu koma nýtt nýja fram fékk fara farið meira miklu margir margar mjög allt öllu þau þær þeir þar þangað þaðan segir gera'.split(' '));
async function topwordsHandler(request, env) {
  const url = new URL(request.url);
  const days = Math.min(120, Math.max(3, +(url.searchParams.get('days') || 30) || 30));
  const all = await newsSince(env, days, 6000);
  const wc = {};
  for (const nw of all) for (const w of nw.title.toLowerCase().split(/[^\p{L}0-9]+/u)) { if (w.length < 4 || _STOP.has(w)) continue; wc[w] = (wc[w] || 0) + 1; }
  const words = Object.entries(wc).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([w, n]) => ({ w, n }));
  return _fjson({ ready: true, days, words }, 300);
}
// /api/erlent → erlendar fréttir (RSS). {efni,items}
const _ERLENT_FEEDS = [['https://www.mbl.is/feeds/erlent/', 'mbl.is'], ['https://www.ruv.is/rss/erlent', 'RÚV'], ['https://www.visir.is/rss/erlent', 'Vísir']];
async function erlentHandler(request, env) {
  const lists = await Promise.all(_ERLENT_FEEDS.map(async ([u, src]) => {
    try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (KarpBot)' }, cf: { cacheTtl: 900 } }); return r.ok ? _rssItems(await r.text(), src) : []; } catch (e) { return []; }
  }));
  const seen = new Set(), items = [];
  for (const arr of lists) for (const it of arr) { const k = it.title.toLowerCase(); if (seen.has(k)) continue; seen.add(k); items.push({ title: it.title, link: it.url, date: it.date, source: it.source }); }
  return _fjson({ efni: 'erlent', items: items.slice(0, 40) }, 900);
}
// /api/markadir → Yahoo Finance (port úr karp-markadir.php). {updated,live,indices,stocks,fx,crypto,metals}
const _MKT = {
  indices: { '^OMXIPI': 'OMXIPI — Heildarvísitala', '^OMXI15': 'OMXI15 — Úrvalsvísitala' },
  stocks: { ARION: 'Arion banki', ISB: 'Íslandsbanki', KVIKA: 'Kvika banki', ALVO: 'Alvotech', AMRQ: 'Amaroq Minerals', BRIM: 'Brim', EIM: 'Eimskip', EIK: 'Eik fasteignafélag', FESTI: 'Festi', HAGA: 'Hagar', HAMP: 'Hampiðjan', ICEAIR: 'Icelandair', KALD: 'Kaldalón', NOVA: 'Nova', REITIR: 'Reitir', SJOVA: 'Sjóvá', SKEL: 'Skel', SIMINN: 'Síminn', SOLID: 'Solid Clouds', SVN: 'Síldarvinnslan', SYN: 'Sýn', VIS: 'VÍS' },
  fx: { 'EURISK=X': 'Evra (EUR)', 'USDISK=X': 'Bandaríkjadalur (USD)', 'GBPISK=X': 'Sterlingspund (GBP)', 'DKKISK=X': 'Dönsk króna (DKK)', 'NOKISK=X': 'Norsk króna (NOK)', 'SEKISK=X': 'Sænsk króna (SEK)' },
  crypto: { 'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', 'XRP-USD': 'XRP', 'SOL-USD': 'Solana', 'DOGE-USD': 'Dogecoin', 'ADA-USD': 'Cardano' },
  metals: { 'GC=F': 'Gull', 'SI=F': 'Silfur', 'PL=F': 'Platína' },
};
async function _yahoo(ysym) {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ysym) + '?range=1mo&interval=1d', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0)', accept: 'application/json' }, cf: { cacheTtl: 300 } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    const meta = (res && res.meta) || {};
    const price = meta.regularMarketPrice;
    if (price == null) return null;
    const hist = ((res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || []).filter((v) => v != null).map((v) => Math.round(v * 10000) / 10000);
    let prev = meta.previousClose;
    if (prev == null && hist.length >= 2) prev = hist[hist.length - 2];
    if (prev == null) prev = meta.chartPreviousClose;
    const chg = (prev && prev != 0) ? Math.round((price - prev) / prev * 10000) / 100 : 0;
    return { price: +price, chgPct: chg, cur: meta.currency || 'ISK', hist };
  } catch (e) { return null; }
}
async function markadirHandler(request, env, ctx) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/api/markadir-v1');
  const hit = await cache.match(ck);
  if (hit) return hit;
  const out = { updated: new Date().toISOString(), live: true, indices: [], stocks: [], fx: [], crypto: [], metals: [] };
  const jobs = [];
  for (const [cat, map] of Object.entries(_MKT)) for (const [sym, name] of Object.entries(map)) {
    const ysym = cat === 'stocks' ? sym + '.IC' : sym;
    jobs.push(_yahoo(ysym).then((d) => { if (d) out[cat].push({ sym, name, price: d.price, chgPct: d.chgPct, cur: cat === 'fx' ? 'ISK' : d.cur, hist: d.hist }); }));
  }
  await Promise.all(jobs);
  const ttl = out.stocks.length >= 4 ? 1200 : 180;
  const res = _fjson(out, ttl);
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
// /api/orka → Landsnet raforkuvinnsla. {hydro,geothermal,oil,timestamp}
async function orkaHandler(request, env, ctx) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/api/orka-v1');
  const hit = await cache.match(ck);
  if (hit) return hit;
  const j = await fetch('https://amper.landsnet.is/generation/api/Values', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0)', accept: 'application/json' }, cf: { cacheTtl: 300 } }).then((r) => r.ok ? r.json() : null).catch(() => null);
  const out = j ? { hydro: j.hydro != null ? Math.round(j.hydro * 10) / 10 : null, geothermal: j.geothermal != null ? Math.round(j.geothermal * 10) / 10 : null, oil: j.oil != null ? Math.round(j.oil * 10) / 10 : 0, timestamp: new Date().toISOString() } : { error: 'unavailable' };
  const res = _fjson(out, 300);
  if (j) ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}
// /api/umferd → Vegagerðin WFS umferðarteljarar. {total_today,counters,days,busiest,updated}
async function umferdHandler(request, env, ctx) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/api/umferd-v1');
  const hit = await cache.match(ck);
  if (hit) return hit;
  const j = await fetch('https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=gis:test_umferdteljarar&outputFormat=application/json', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; KARP-Hagvisir/1.0)', accept: 'application/json' }, cf: { cacheTtl: 600 } }).then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!j || !j.features) return _fjson({ error: 'unavailable' }, 60);
  let total_today = 0, counters = 0;
  const byName = {}, dayTot = [0, 0, 0, 0, 0, 0, 0, 0], dayDate = [null, null, null, null, null, null, null, null];
  for (const f of j.features) {
    const p = f.properties || {};
    const td = +(p.UMF_I_DAG || 0);
    if (td > 0) { total_today += td; counters++; const nm = String(p.NAFN || '?').trim(); byName[nm] = (byName[nm] || 0) + td; }
    for (let d = 1; d <= 7; d++) { const k = 'UMF_DAGUR' + d; if (p[k] != null) { dayTot[d] += +p[k]; if (!dayDate[d] && p['DAGS_DAGUR' + d]) dayDate[d] = String(p['DAGS_DAGUR' + d]).slice(0, 10); } }
  }
  const busiest = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([nafn, umf]) => ({ nafn, umf }));
  const WD = ['Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau'];
  const days = [];
  for (let d = 7; d >= 1; d--) { const dt = dayDate[d]; const lab = dt ? (WD[new Date(dt + 'T00:00:00Z').getUTCDay()] + ' ' + (+dt.slice(8, 10)) + '.') : ('d' + d); days.push({ label: lab, date: dt, total: dayTot[d] }); }
  const res = _fjson({ total_today, counters, days, busiest, updated: new Date().toISOString() }, 600);
  ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}

// ══════════════════════════════════════════════════════════════════════════
// STJÓRNBORÐ (admin-bakendi karp.is) — S1: yfirlit notenda/áskrifta/skýrslna/tekna.
// Admin-gátað (users.is_admin). Hýbríð: agentarnir keyra á Node en lesa sömu D1.
// ══════════════════════════════════════════════════════════════════════════
// Stjórnborð audit-skrá: geymir síðustu ~200 admin-aðgerðir í stjorn_sync k='audit' (hver: ts/by/target/action/detail).
// Stjórnborð: aðgerðir á STÖKUM notanda (aðgangs-veiting + stuðningur + prufu-flagg). Aðeins innskráður admin.
// body: { id, action, ...}. action ∈ tier | service | reset_reports | verify | resend_verify | reset_pw | test.
// Stjórnborð: póst-sniðmát. GET-hlutinn kemur í /api/admin/overview; hér er VISTUN/ENDURSTILLING.
// body: { id, patch:{subject?,html?,intro?,footer?} } eða { id, reset:true }. Gátað með validateEmail
// (m.a. skyldu-breytur eins og {{hlekkur}}) svo ritvilla brjóti ekki nýskráningu/lykilorðs-endurheimt.
// Stjórnborð: ræsir daglegu gagna-uppfærslu-pípuna (refresh-data.yml) á EFTIRSPURN — repository_dispatch
// (sama mynstur og on-demand ársreikningar). event_name != schedule → þvingar líka vikulegu veiturnar (kvóti).
// Póstsending fyrir Node-stjórnborðið gegnum worker Gmail REST (S4 — sameinar á OAuth, ekkert app-lykilorð).
// Aðgangur: X-Admin-Key EÐA innskráður admin. Body: {to, subject, html|text, replyTo?, inReplyTo?}.
// S2b: Node-stjórnborðið ýtir rekstrar-samantekt í D1 (X-Admin-Key). Body: {k, v}. GET les.
// Setja notanda-tegund (admin/free/user/nemandi) — stjórnborð S1 „Tegund"-dálkur. Panel-gátt = is_admin ONLY (_isAdmin).

export default {
  // Cron: viku-digest (mánud. 08:10) + frétta-innlestur í D1-safn (á 3 klst fresti).
  async scheduled(event, env, ctx) {
    if (event.cron === '10 8 * * 1') ctx.waitUntil(digestRun(env));
    // Orðsporsvaktin fylgir DAGLEGA cron-inum (ekki 3-tíma): tón-þróun er dagamælikvarði,
    // og daglegt þak ver bæði gegn hávaða í pósthólfi og D1-álagi (ein fréttaleit per vaktað félag).
    else if (event.cron === '30 6 * * *') ctx.waitUntil(kycDiffCron(env).then(() => ordsporCron(env)));
    else ctx.waitUntil(newsIngest(env).then(() => frettavaktCron(env)).then(() => kycCriticalCron(env)).then(() => eftirlitCriticalCron(env)).then(() => logbirtingCriticalCron(env)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // LEIÐ A (lénaflutningur): app.karp.is og www.karp.is 301-a á karp.is —
    // SEO-flutningurinn sjálfur. Gamla WP-mælaborðið fær möppun á forsíðuna.
    if (url.hostname === 'app.karp.is' || url.hostname === 'www.karp.is') {
      url.hostname = 'karp.is';
      return Response.redirect(url.toString(), 301);
    }
    if (/^\/hagvisir\/?$/.test(url.pathname)) return Response.redirect('https://karp.is/', 301);
    // ── Cloudflare-native auðkenning (F2) — leysir wp.karp.is /me + innskráningu af hólmi ──
    if (url.pathname === '/api/auth/me') return authMeHandler(request, env);
    if (url.pathname === '/api/auth/register') return authRegisterHandler(request, env);
    if (url.pathname === '/api/auth/login') return authLoginHandler(request, env);
    if (url.pathname === '/api/auth/logout') return authLogoutHandler();
    if (url.pathname === '/api/auth/kt') return authSaveKtHandler(request, env);
    if (url.pathname === '/api/auth/forgot') return authForgotHandler(request, env, ctx);
    if (url.pathname === '/api/auth/reset') return authResetHandler(request, env);
    if (url.pathname === '/api/auth/verify') return authVerifyHandler(request, env);   // F5: staðfesta netfang (GET-hlekkur úr pósti)
    if (url.pathname === '/api/auth/resend-verify') return authResendVerifyHandler(request, env, ctx);
    if (url.pathname.startsWith('/api/u/')) return userDataHandler(request, env);   // F6: períferu notenda-gögn
    if (url.pathname.startsWith('/api/leikur')) {   // RÁS-Leikurinn (kennsluleikur)
      const luid = await readSession(env, request);
      const lu = luid ? await env.TENGSL.prepare('SELECT is_admin, nemandi FROM users WHERE id=?').bind(luid).first().catch(() => null) : null;
      const gameUser = { uid: luid || 0, isAdmin: !!(lu && lu.is_admin === 1), nemandi: !!(lu && lu.nemandi === 1) };
      return leikurHandler(request, env, ctx, gameUser);
    }
    if (url.pathname.startsWith('/api/kyc/')) return kycHandler(request, env, ctx);   // KYC v1: Áreiðanleikavaktin
    if (url.pathname === '/api/lobbyvakt') return lobbyvaktHandler(request, env, ctx);   // Lobbývakt v1: reglur í pípunni (Fyrirtæki+)
    if (url.pathname === '/api/frettir') return frettirHandler(request, env);   // F7: gagna-endapunktar úr WP
    if (url.pathname === '/api/firma') return firmaHandler(request, env);
    if (url.pathname === '/api/markadir') return markadirHandler(request, env, ctx);
    if (url.pathname === '/api/orka') return orkaHandler(request, env, ctx);
    if (url.pathname === '/api/umferd') return umferdHandler(request, env, ctx);
    if (url.pathname === '/api/firmagraph') return firmagraphHandler(request, env);   // F7b: premium-greining
    if (url.pathname === '/api/agenda') return agendaHandler(request, env);
    if (url.pathname === '/api/yearreview') return yearreviewHandler(request, env);
    if (url.pathname === '/api/topwords') return topwordsHandler(request, env);
    if (url.pathname === '/api/erlent') return erlentHandler(request, env);
    if (url.pathname === '/api/admin/overview') return adminOverviewHandler(request, env);   // stjórnborð S1
    if (url.pathname === '/api/admin/send') return adminSendHandler(request, env);   // stjórnborð S4: póstur um Gmail REST
    if (url.pathname === '/api/admin/sync') return adminSyncHandler(request, env);   // stjórnborð S2b: rekstrar-samantekt
    if (url.pathname === '/api/admin/set-type') return adminSetTypeHandler(request, env);   // stjórnborð S1: setja notanda-tegund (admin/free/user/nemandi)
    if (url.pathname === '/api/admin/user') return adminUserHandler(request, env, ctx);   // stjórnborð: aðgangs-veiting + stuðningur + prufu-flagg per notanda
    if (url.pathname === '/api/admin/refresh') return adminRefreshHandler(request, env, ctx);   // stjórnborð: ræsa gagna-uppfærslu (refresh-data.yml)
    if (url.pathname === '/api/admin/email') return adminEmailHandler(request, env, ctx);   // stjórnborð: vista/endurstilla póst-sniðmát
    if (url.pathname === '/api/villa') return villaHandler(request, ctx);
    if (url.pathname === '/api/domar') return domarHandler(ctx);
    if (url.pathname === '/api/greidslur') return greidslurHandler(ctx);
    if (url.pathname === '/api/spyrdu') return spyrduHandler(request, env, ctx);
    if (url.pathname === '/api/hjalp') return hjalpHandler(request, env, ctx);
    if (url.pathname === '/api/ytstats') return ytstatsHandler(request, env, ctx);
    if (url.pathname === '/api/gleit') return gleitHandler(request, env, ctx);
    if (url.pathname === '/api/tilkynningar') return tilkynningarHandler(request, env, ctx);
    if (url.pathname === '/api/firma-timalina') return firmaTimalinaHandler(request, env, ctx);
    if (url.pathname === '/api/fyrirtaeki') return fyrirtaekiHandler(request, env, ctx);
    if (url.pathname === '/api/vanskil') return vanskilHandler(request, ctx);
    if (url.pathname === '/api/kvoti') return kvotiHandler(request, env, ctx);
    if (url.pathname === '/api/kvoti/hopur') return kvotiHopurHandler(request, env, ctx);
    if (url.pathname === '/api/loftfor') return loftforHandler(request, env, ctx);
    if (url.pathname === '/api/vorumerki') return vorumerkiHandler(request, ctx);
    if (url.pathname === '/api/eftirlit') return eftirlitHandler(request, ctx);
    if (url.pathname === '/api/styrkir') return styrkirHandler(request, env, ctx);
    if (url.pathname === '/api/okutaeki') return okutaekiHandler(request, ctx);
    if (url.pathname === '/api/skip') return skipHandler(request, ctx);
    if (url.pathname === '/api/logbirting') return logbirtingHandler(request, env, ctx);
    if (url.pathname === '/api/sanctions') return sanctionsHandler(request, env, ctx);
    if (url.pathname === '/api/lei') return leiHandler(request, ctx);
    if (url.pathname === '/api/rsk') return rskHandler(request, env, ctx);
    if (url.pathname === '/api/tengslanet') return tengslanetHandler(request, env, ctx);
    if (url.pathname === '/api/topplistar') return topplistarHandler(request, env, ctx);
    if (url.pathname === '/api/atvinnugrein') return atvinnugreinHandler(request, env, ctx);   // Atvinnugreinar v1: gátuð djúp-skýrsla per deild (Fyrirtæki+)
    if (url.pathname === '/api/grein-rank') return greinRankHandler(request, env, ctx);   // grein-rank: röðun félags í grein (opið)
    if (url.pathname === '/api/roads/atvinnuvegir') return roadsSectorsHandler(request, env, ctx);
    if (url.pathname === '/api/rskproxy') return rskProxyHandler(request, env);
    if (url.pathname === '/api/tengsl-stats') return tengslStatsHandler(request, env);
    if (url.pathname === '/api/leyfi') return leyfiHandler(request, env, ctx);
    if (url.pathname === '/api/pay/checkout') return payCheckoutHandler(request, env, ctx);
    if (url.pathname === '/api/pay/return') return payReturnHandler(request, env, ctx);
    if (url.pathname === '/api/pay/callback') return payCallbackHandler(request, env, ctx);
    if (url.pathname === '/api/askell/webhook') return askellWebhookHandler(request, env, ctx);
    // (#20) /api/askell/last debug-endapunktur fjarlægður — geymdi hrátt vefkróks-payload (PII).
    if (url.pathname === '/api/sub/checkout-session') return askellSessionHandler(request, env, ctx);
    if (url.pathname === '/api/sub/cancel') return subCancelHandler(request, env, ctx);
    if (url.pathname === '/api/stak/checkout') return stakCheckoutHandler(request, env, ctx);
    if (url.pathname === '/api/stak/confirm') return stakConfirmHandler(request, env, ctx);
    if (url.pathname === '/api/sub2/checkout') return sub2CheckoutHandler(request, env, ctx);
    if (url.pathname === '/api/sub2/confirm') return sub2ConfirmHandler(request, env, ctx);
    if (url.pathname === '/api/streetview') return streetviewHandler(request, env, ctx);
    if (url.pathname === '/api/arsreikningur/request') return arsreikningurRequestHandler(request, env, ctx);
    if (url.pathname === '/api/stjorn/request') return stjornRequestHandler(request, env, ctx);
    if (url.pathname === '/api/eigendur/request') return eigendurRequestHandler(request, env, ctx);
    const proxy = PROXIES[url.pathname];
    if (proxy) {
      const cache = caches.default;
      const cacheKey = new Request('https://cache.karp.internal' + url.pathname);
      let res = await cache.match(cacheKey);
      if (!res) {
        try {
          const up = await fetch(proxy.url, {
            method: proxy.post ? 'POST' : 'GET',
            headers: { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)', ...(proxy.post ? { 'Content-Type': 'application/json' } : {}) },
            body: proxy.post || undefined,
          });
          const body = await up.text();
          res = new Response(up.ok ? body : JSON.stringify({ error: up.status }), {
            status: 200,
            headers: {
              'content-type': proxy.type || 'application/json; charset=utf-8',
              'access-control-allow-origin': '*',
              'cache-control': `public, max-age=${proxy.ttl}`,
            },
          });
          if (up.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
        } catch (e) {
          res = new Response(JSON.stringify({ error: 'upstream' }), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
        }
      }
      return res;
    }
    if (/^\/fyrirtaeki\/\d{10}\/?$/.test(url.pathname)) return fyrirtaekiSidaHandler(request, env, ctx);
    // GÁTT: greidd skýrslu-gögn (/gogn/{eigendur,arsreikningar,stjorn}/<kt>.json) = persónuupplýsingar + 990 kr vara.
    // Aðeins admin eða notandi með reports_granted fyrir viðkomandi skýrslu (nákvæm spegilmynd client-paywall/hasReport).
    // Sýnishorn (_synishorn.json + ?syni hardkóðað) og SSR-forskoðun (karp.internal-undirbeiðnir) fara EKKI hér um.
    {
      const gm = url.pathname.match(/^\/gogn\/(eigendur|arsreikningar|stjorn)\/(\d{6,10})\.json$/);
      if (gm) {
        const gkey = gm[1] === 'eigendur' ? 'eigendur:' + gm[2] : 'fyrirtaeki:' + gm[2];
        const guid = await readSession(env, request);
        let gok = false;
        if (guid && env.TENGSL) {
          const gu = await env.TENGSL.prepare('SELECT id, is_admin, parent_account_id, free_access FROM users WHERE id=?').bind(guid).first().catch(() => null);
          if (_freeAll(gu)) gok = true;
          else if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(accountId(gu) || guid, gkey).first().catch(() => null)) gok = true;   // account-heimild (accountId eiganda)
        }
        if (!gok) return new Response(JSON.stringify({ error: 'locked', key: gkey }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' } });
        const gres = await env.ASSETS.fetch(request);
        const gh = new Headers(gres.headers); gh.set('cache-control', 'private, no-store');
        return new Response(gres.body, { status: gres.status, headers: gh });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
