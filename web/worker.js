import { greinaSql } from './src/lib/greinar.mjs';
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
const sjson = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://karp.is' },
});
// ── Mini-RAG (LOTA 51): efnisorð spurningar → viðeigandi gogn-JSON úr ASSETS ──
// (sama gagnaver, ekkert net — kostar ekkert). Hám. 2 blokkir per spurningu.
const AUG_CACHE = {};
async function augGet(env, file) {
  if (AUG_CACHE[file] !== undefined) return AUG_CACHE[file];
  try { AUG_CACHE[file] = await (await env.ASSETS.fetch(new Request('https://karp.internal/gogn/' + file))).json(); } catch (e) { AUG_CACHE[file] = null; }
  return AUG_CACHE[file];
}
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

// 🆘 Hjálparbeiðnir (/hjalp/ ticket-formið) → tölvupóstur á hjalp@karp.is.
// Workerinn getur ekki sent SMTP sjálfur → áframsendir á WP REST /karp/v1/hjalp
// (karp-user.php) sem wp_mail-ar um FluentSMTP/Gmail — SAMA sendileið og vaktirnar.
// Vörn hér (fyrsta lag): honeypot, gild gögn, 1 beiðni/mín + 8/dag per IP
// (cache-byggt eins og spyrdu-dagskvótinn — gróft per-gagnaver en nóg gegn rusli).
// WP-hlið (annað lag): X-Karp-Secret (KARP_GRANT_SECRET, sé það stillt) + eigin
// honeypot/lengdar/transient-vörn. Sé WP-endapunkturinn ekki límdur enn → 'send'-villa
// og formið bendir fólki á að senda beint á hjalp@karp.is (ekkert týnist hljóðlaust).
const HJALP_FLOKKAR = ['Greiðslur & áskrift', 'Innskráning & aðgangur', 'Villa í gögnum', 'Annað'];
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
  const r = await sendGmail(env, { to: env.HJALP_TO || 'hjalp@karp.is', replyTo: netfang, subject: '[Hjálp] ' + flokkur + ' — ' + nafn, html });
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
const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
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
const RSK_ROT = 'https://www.skatturinn.is';
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
async function vanskilHandler(request, ctx) {
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
async function teyaHmacHex(secret, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function teyaOrderId() {
  // ≤12 alstafa, engir extended stafir (krafa SecurePay)
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  return (t + r).slice(-12).toUpperCase().replace(/[^0-9A-Z]/g, '0');
}
function teyaConfigured(env) { return !!(env.TEYA_MERCHANT_ID && env.TEYA_GATEWAY_ID && env.TEYA_SECRET_KEY); }
// Auðkennir kaupanda: framsendir innskráningar-kökuna á WP /me → WP userid (0 ef óinnskráð/villa).
// Kakan lifir á .karp.is (COOKIE_DOMAIN) svo hún berst til worker-sins með credentials:'include'.
// F4: notanda-auðkenni úr WORKER-lotu (karp_session, D1) — leysir WP /me af hólmi.
async function karpUserId(request, env) {
  return await readSession(env, request);
}
// ── Prufuvörn ──────────────────────────────────────────────────────────────
// Hefur notandinn (uid, auðkenndur í karpUserId) þegar nýtt frípróf á þessari vöru? WP geymir
// karp_sub_<svc>_trial_used / karp_tier_trial_used PER USER-ID (ekki kt → kt-skipti duga ekki).
// Fail-open (false) ef WP/secret vantar: grant þarf hvort eð er WP, svo bilun blokkar ekki löglega nýja.
async function trialUsedFor(env, uid, kind, slug) {   // F4: prufuvörn úr D1 (ekki WP)
  return await trialUsedD1(env, uid, kind, slug);
}
// Rás/verð ÁN fríprófs fyrir endurkomu-notanda (Aron stillir valfrjálst í Áskell). null → blokka.
const notrialChannel = (env, slug) => env['ASKELL_CHANNEL_' + String(slug).toUpperCase() + '_NOTRIAL'] || null;
async function payCheckoutHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' });
  // óuppsett (engin secrets) EÐA öryggisrofi óvirkur → framendi notar ókeypis prentleiðina
  if (!teyaConfigured(env) || env.TEYA_LIVE !== '1') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);   // þarf innskráningu svo kaupið vistist á Mitt svæði
  if (!uid) return sjson({ error: 'login' });
  let b = {}; try { b = (await request.json()) || {}; } catch (e) {}
  const kind = ['fyrirtaeki', 'eigendur', 'fasteign', 'thingmadur'].includes(b.kind) ? b.kind : 'fasteign';
  const ref = String(b.ref || '').slice(0, 80);
  const key = String(b.key || (kind + ':' + ref)).slice(0, 80);
  const price = Math.round(+(kind === 'fyrirtaeki' ? env.PRICE_FYRIRTAEKI : kind === 'eigendur' ? env.PRICE_EIGENDUR : kind === 'thingmadur' ? env.PRICE_THINGMADUR : env.PRICE_FASTEIGN) || 990);
  if (!(price > 0)) return sjson({ error: 'free' });
  const amount = String(price);   // ISK heiltala
  const currency = 'ISK';
  const orderid = teyaOrderId();
  const origin = 'https://karp.is';
  // amount+currency fest í skila-slóðina (hluti af checkhash → traust, ekki hægt að falsa) svo callback
  // geti sannreynt orderhash=HMAC(orderid|amount|currency) — SecurePay skilar EKKI amount/currency í POST.
  const q = '?o=' + encodeURIComponent(orderid) + '&k=' + encodeURIComponent(key) + '&t=' + kind + '&u=' + uid + '&a=' + encodeURIComponent(amount) + '&cur=' + currency;
  const returnurlsuccess = origin + '/api/pay/return' + q;
  const returnurlsuccessserver = origin + '/api/pay/callback' + q;
  const returnurlcancel = origin + '/api/pay/return' + q + '&x=1';
  const merchantid = env.TEYA_MERCHANT_ID;
  // checkhash — bætin verða að stemma NÁKVÆMLEGA við reitina sem sendir eru (sömu strengir)
  const msg = [merchantid, returnurlsuccess, returnurlsuccessserver, orderid, amount, currency].join('|');
  const checkhash = await teyaHmacHex(env.TEYA_SECRET_KEY, msg);
  const action = (env.TEYA_ENV === 'dev' ? 'https://test.borgun.is' : 'https://securepay.borgun.is') + '/SecurePay/default.aspx';
  const desc = kind === 'fyrirtaeki' ? 'Karp fyrirtaekjaskyrsla' : kind === 'eigendur' ? 'Karp eigendaskyrsla' : kind === 'thingmadur' ? 'Karp thingmannaskyrsla' : 'Karp verdmatsskyrsla';
  // Reitir speglaðir eftir virkri WooCommerce-Teya viðbót: SecurePay krefst lína-liða + pagetype/skipreceiptpage.
  // checkhash nær AÐEINS yfir merchantid|url|url|orderid|amount|currency → lína-liðir/pagetype breyta honum ekki.
  return sjson({
    ok: true, action,
    fields: {
      merchantid, paymentgatewayid: env.TEYA_GATEWAY_ID, orderid, amount, currency, language: 'IS',
      checkhash, returnurlsuccess, returnurlsuccessserver, returnurlcancel, returnurlerror: returnurlcancel,
      reference: orderid, pagetype: '0', skipreceiptpage: '0',
      itemdescription_0: desc, itemcount_0: '1', itemunitamount_0: amount, itemamount_0: amount,
    },
  });
}

// Kaupandi lendir hér (POST frá SecurePay eftir greiðslu/afbókun) → 302 á /kaup/ (GET, Astro-síða)
async function payReturnHandler(request, env, ctx) {
  const u = new URL(request.url);
  const o = u.searchParams.get('o') || '', k = u.searchParams.get('k') || '', t = u.searchParams.get('t') || '';
  // Árangur vs afbókun ræðst af SLÓÐINNI (x=1 = cancel/error), EKKI af POST-status: „Til baka í verslun"
  // (Confirmation-skref) sendir ekki alltaf status='Ok' → lenti ranglega á cancel-síðunni.
  const ok = u.searchParams.get('x') !== '1';
  const dest = '/kaup/?s=' + (ok ? 'ok' : 'cancel') + '&o=' + encodeURIComponent(o) + '&k=' + encodeURIComponent(k) + '&t=' + encodeURIComponent(t);
  return new Response(null, { status: 302, headers: { location: dest } });
}

// Server-til-server staðfesting (POST frá SecurePay) → sannreyna orderhash. FASI 2: skrá entitlement í WP.
async function payCallbackHandler(request, env, ctx) {
  if (!teyaConfigured(env)) return new Response('unconfigured', { status: 200 });
  const u = new URL(request.url);
  const orderid = u.searchParams.get('o') || '';
  const amount = u.searchParams.get('a') || '';        // úr skila-slóð — SecurePay skilar EKKI amount/currency í POST
  const currency = u.searchParams.get('cur') || 'ISK';
  let orderhash = '';
  try { const fd = await request.formData(); orderhash = String(fd.get('orderhash') || ''); } catch (e) {}
  // Gilt orderhash = staðfest greiðsla (Teya kallar successserver AÐEINS við árangur) → treystum því,
  // ekki status-reit (casing/step ótraust; gæti hafa blokkað grant áður). orderhash = svindl-vörnin.
  const expect = await teyaHmacHex(env.TEYA_SECRET_KEY, [orderid, amount, currency].join('|'));
  if (!orderhash || orderhash.toLowerCase() !== expect) return new Response('badhash', { status: 400 });
  // Replay-vörn (#7): orderhash þekur aðeins orderid|amount|currency — EKKI u/k. Bindum því hverja orderid
  // við EINA veitingu (atómískt INSERT OR IGNORE); endurspilun sömu orderid (t.d. með öðru k) → idempotent skil.
  if (orderid && env.TENGSL) {
    const ins = await env.TENGSL.prepare('INSERT OR IGNORE INTO granted_refs (ref, created) VALUES (?,?)').bind('teya:' + orderid, Math.floor(Date.now() / 1000)).run().catch(() => null);
    if (!ins || !ins.meta || ins.meta.changes === 0) return new Response('ok', { status: 200 });   // orderid þegar unnin → engin ný grant
  }
  // ✓ Greiðsla staðfest → skrá entitlement í WP (server-til-server m/ sameiginlegu leyndarmáli).
  const uid = u.searchParams.get('u') || '';
  const key = u.searchParams.get('k') || '';
  if (uid && key && env.TENGSL) {   // F7: grant→D1 á kaupanda-uid (leysir WP af hólmi)
    ctx.waitUntil(env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)').bind(+uid, key, Math.floor(Date.now() / 1000)).run().catch(() => {}));
  }
  if (uid && key && env.KARP_GRANT_SECRET) {   // WP-varaleið meðan hún tórir
    ctx.waitUntil(fetch('https://wp.karp.is/wp-json/karp/v1/reports/grant', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userid: +uid, key, orderid, secret: env.KARP_GRANT_SECRET }),
    }).catch(() => {}));
  }
  return new Response('ok', { status: 200 });
}

// ── Áskell áskriftar-vefkrókur (LOTA 110) — endurtekin Karp+ áskrift gegnum Áskell (kort-á-skrá) ──
// Áskell rukkar kortið mánaðarlega SJÁLFT + sendir vefkrók við hverja greiðslu. Við sannreynum
// Hook-HMAC (HMAC-SHA512 base64 af hráum body) → framlengjum aðgang (karp-user.php /sub/grant, kt-lykill,
// idempotent á greiðslu-id). Afbókun = engar fleiri greiðslur → aðgangur rennur út (engin sér-afturköllun).
// ⚠ ÓVIRKT þar til ASKELL_WEBHOOK_SECRET er sett. ⚠ Body-lyklar (kennitala/plan/id) SANNPRÓFAST í sandbox.
async function askellWebhookHandler(request, env, ctx) {
  if (!env.ASKELL_WEBHOOK_SECRET) return new Response('unconfigured', { status: 200 });
  const raw = await request.text();
  const sig = request.headers.get('Hook-HMAC') || '';
  const event = request.headers.get('Hook-Event') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ASKELL_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const macBuf = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let bin = ''; for (let i = 0; i < macBuf.length; i++) bin += String.fromCharCode(macBuf[i]);
  const expect = btoa(bin);
  let diff = sig.length === expect.length ? 0 : 1;
  for (let i = 0; i < sig.length && i < expect.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  const sigOk = diff === 0 && sig.length === expect.length;   // fastatíma-samanburður (svindl-vörn)
  if (!sigOk) return new Response('badsig', { status: 401 });
  let body = {}; try { body = JSON.parse(raw); } catch (e) {}
  const ev = String(body.event || event || '');
  const d = body.data || body;   // Áskell pakkar í {event,sender,data:{...}}
  // Áskrift: subscription.* (v1) OG subscription_contract.* (v2). customer_reference = kt (VIÐ settum),
  //   þrep úr metadata.tier (áreiðanlegt — við setjum í session) EÐA vöru-nafni; aðgangur TIL period-loka.
  // ⚠ Nákvæm v2-svið staðfestast með raun test-greiðslu; les því mörg möguleg heiti varlega.
  if (ev.indexOf('subscription') >= 0 || ev.indexOf('contract') >= 0) {   // F4: grant→D1 (KARP_GRANT_SECRET óþarft)
    const sub = d.subscription || d.contract || d.subscription_contract || {};
    const cust = d.customer || sub.customer || {};
    const kt = String(d.customer_reference || d.customerReference || sub.customer_reference || cust.reference || cust.customer_reference || '').replace(/\D/g, '');
    let meta = d.metadata || d.meta || sub.metadata || sub.meta || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }   // v1 sýnir "meta":"{}" (strengur)
    const nameBlob = (JSON.stringify(d.plan || d.items || d.product || d.bundle || sub.plan || sub.product || '') + ' ' + String(d.reference || sub.reference || '')).toLowerCase();
    // Sér þjónustu-áskrift (Útboðsvaktin o.fl.): metadata.service áreiðanlegt (VIÐ setjum í session);
    // vöru-nafn til vara. Slík áskrift veitir karp_sub_<svc>_until í WP — EKKI þrep.
    const ms = String(meta.service || '');
    const service = ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti'].indexOf(ms) >= 0 ? ms
      : (nameBlob.indexOf('útboð') >= 0 || nameBlob.indexOf('utbod') >= 0 ? 'utbod'
        : (nameBlob.indexOf('thingskyrsl') >= 0 || nameBlob.indexOf('þingmannaskýrsl') >= 0 ? 'thingskyrslur'
          : (nameBlob.indexOf('kvótavakt') >= 0 || nameBlob.indexOf('kvotavakt') >= 0 ? 'kvoti' : '')));
    const mt = String(meta.tier || '');
    const tier = ['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].indexOf(mt) >= 0 ? mt
      : (nameBlob.indexOf('plus') >= 0 ? 'fyrirtaeki_plus' : (nameBlob.indexOf('fyrirt') >= 0 ? 'fyrirtaeki' : 'grunnur'));   // metadata.tier áreiðanlegt; nafn til vara
    const now = Math.floor(Date.now() / 1000);
    const endStr = d.active_until || d.current_period_end || d.next_billing_at || d.period_end || (d.current_period && d.current_period.end) || sub.active_until || sub.current_period_end || (sub.current_period && sub.current_period.end) || '';
    let until = endStr ? Math.floor(new Date(endStr).getTime() / 1000) : 0;
    if (!until || until < now) until = now + 32 * 86400;   // ⚠ vara: ef period-lok finnst ekki í v2-payloadi → mánuður frá núna (grant klárast; fínstillt þegar raun-payload sést)
    if (kt.length === 10) {   // F4: grant → D1 (ekki WP)
      const _aid = String(sub.id || d.id || '');
      const _ref = String(d.id || d.token || d.uuid || sub.id || sub.uuid || '') + '_' + until;
      ctx.waitUntil(grantSubD1(env, service ? { kt, service, until, askellId: _aid, ref: _ref } : { kt, tier, until, askellId: _aid, ref: _ref }));
    }
  }
  // ── Stakar skýrslur um Áskell (einskiptisvara): session-metadata {service:'stak', key:'fyrirtaeki:kt'…} ──
  // Hlustum vítt (payment/billing_run/contract) — nákvæmt event-heiti er óskjalfest og staðfestist í sandbox.
  // Grant er idempotent á lykli (WP dedupe) svo tvöföld event eru skaðlaus. userid leyst af kt (karp_kt).
  if (ev.indexOf('payment') >= 0 || ev.indexOf('billing_run') >= 0 || ev.indexOf('contract') >= 0) {   // F4: stök skýrsla→D1
    try {
      const sub2 = d.subscription || d.contract || d.subscription_contract || {};
      let meta2 = d.metadata || d.meta || sub2.metadata || sub2.meta || {};
      if (typeof meta2 === 'string') { try { meta2 = JSON.parse(meta2); } catch (e) { meta2 = {}; } }
      // V2-leið: session-metadata {service:'stak', key} · V1-leið (stakgreiðsla um /api/payments/):
      // engin metadata en reference-svið greiðslunnar BER stak-lykilinn sjálfan
      // reference = '<lykill>|<token-forskeyti>' (tvírukkunar-vörn) → klippa '|…' af fyrir grant-lykilinn
      const ref0 = String(d.reference || '').split('|')[0];
      const refKey = /^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/.test(ref0) ? ref0 : '';
      const viaMeta = String(meta2.service || '') === 'stak';
      const stakKey = viaMeta ? String(meta2.key || '') : refKey;
      const st2 = String(d.state || d.status || '');
      // V1-stakgreiðsla: veita AÐEINS við settled (pending/retrying bíða); V2: útiloka villustöður
      const okState = viaMeta ? !/fail|error|cancel/i.test(st2) : /settled/i.test(st2);
      // ⚠ V1-greiðslu-objekt ber EKKERT customer_reference (sannað 11.7) — kaupanda-kt býr aftan við '|' í reference
      const ktUrRef = (String(d.reference || '').split('|')[1] || '').replace(/\D/g, '');
      const kt2 = (String(d.customer_reference || (d.customer && d.customer.reference) || sub2.customer_reference || '').replace(/\D/g, '')) || ktUrRef;
      if (stakKey && okState && /^[a-z]+:[\w .,ÁÉÍÓÚÝÞÆÖáéíóúýþæö-]+$/.test(stakKey) && kt2.length === 10) {
        ctx.waitUntil(grantReportD1(env, kt2, stakKey));   // F4: skýrslu-grant → D1
      }
    } catch (e) {}
  }
  return new Response('ok', { status: 200 });
}

// ── Uppsögn áskriftar: POST /api/sub/cancel {service?} — innskráður notandi segir upp sinni áskrift ──
// Flæði: karpUserId → WP /sub/cancelinfo (askellId, varið KARP_GRANT_SECRET) → Áskell cancel
// (v2 contract cancel_at_period_end, fallback legacy) → áskrift lifir út greitt tímabil (until óbreytt).
async function subCancelHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.KARP_GRANT_SECRET) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  let body = {}; try { body = await request.json(); } catch (e) {}
  const svc = ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti'].indexOf(String(body.service || '')) >= 0 ? String(body.service) : '';
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  // Segir upp EINUM Áskell-samningi: v2 cancel_at_period_end (aðgangur helst út greitt tímabil), legacy til vara.
  const cancelById = async (id) => {
    let r = await fetch('https://askell.is/api/v2/subscription-contracts/' + encodeURIComponent(id) + '/cancel/', { method: 'POST', headers: H, body: JSON.stringify({ cancel_at_period_end: true }) });
    if (!r.ok) r = await fetch('https://askell.is/api/subscriptions/' + encodeURIComponent(id) + '/cancel/', { method: 'POST', headers: H });
    return r.ok;
  };
  try {
    // F4: askell_id + kt + vara úr D1 (ekki WP /sub/cancelinfo).
    const urow = env.TENGSL ? await env.TENGSL.prepare('SELECT kt, tier, tier_askell FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const kt = String((urow && urow.kt) || '').replace(/\D/g, '');
    let aid = '', slug = '';
    if (svc) {
      const srow = env.TENGSL ? await env.TENGSL.prepare('SELECT askell_id FROM sub_service WHERE user_id=? AND service=?').bind(uid, svc).first().catch(() => null) : null;
      aid = (srow && srow.askell_id) || '';
      slug = svc;
    } else {
      aid = (urow && urow.tier_askell) || '';
      slug = String((urow && urow.tier) || '').toLowerCase();
    }
    // 1) Fljótleið: vistað contract-id → reyna beint (frettir/fasteign/þrep um sub2 lenda hér).
    if (aid && await cancelById(aid)) return sjson({ ok: true, cancelled: true });
    // 2) askellId vantar EÐA er úrelt → fletta upp VIRKUM samningi kaupanda í Áskell (kt + vara) og segja upp.
    //    Rót: WP-vistaða id-ið er aðeins flýtileið sem getur rekið sig frá Áskell — t.d. útboð veitt um
    //    /sub/trial (aldrei _askell) eða id sem bendir á hreinsaðan/afskráðan samning. Áskell = sannleikur.
    if (kt.length === 10 && slug) {
      const resp = await fetch('https://askell.is/api/v2/subscription-contracts/?page_size=100', { headers: H }).catch(() => null);
      if (resp && resp.ok) {
        const lst = await resp.json().catch(() => null);
        const contracts = Array.isArray(lst) ? lst : ((lst && lst.results) || []);
        const match = contracts.filter((c) => String(c.customer_reference || '').replace(/\D/g, '') === kt
          && !/cancel/i.test(String(c.state || '')) && (c.items || []).some((i) => String(i.product_reference || '') === slug));
        let any = false;
        for (const c of match) { if (c && c.id && await cancelById(c.id)) any = true; }
        if (any) return sjson({ ok: true, cancelled: true });
        // Enginn virkur rukkandi samningur til → fríprófun/ó-rukkandi áskrift: ekkert að stöðva í Áskell.
        // Aðgangur rennur samt út á `until` (WP) og ENGIN frekari gjöld verða innheimt → uppsögn telst tókst.
        if (match.length === 0) return sjson({ ok: true, cancelled: false, note: 'no-billing' });
        return sjson({ error: 'askell' });   // fann samning en cancel mistókst → láta notanda reyna aftur
      }
      // Áskell-listun mistókst (staða óstaðfest) → EKKI fullyrða uppsögn; leyfa endurtilraun.
    }
    if (!aid) return sjson({ error: 'noid' });   // hvorki id, kt né vara → getum ekkert gert
    return sjson({ error: 'askell' });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ⚠ TÍMABUNDIÐ debug — skilar síðasta Áskell-vefkróks-payloadi (varið ASKELL_WEBHOOK_SECRET). Fjarlægist eftir prófun.
async function askellLastHandler(request, env) {
  const url = new URL(request.url);
  const t = url.searchParams.get('t') || '';
  const secretSet = !!(env.ASKELL_WEBHOOK_SECRET && String(env.ASKELL_WEBHOOK_SECRET).length);
  const cap = await caches.default.match(new Request('https://cap.karp.internal/askell-last'));
  const capTxt = cap ? await cap.text() : '';
  let last = null; try { last = capTxt ? JSON.parse(capTxt) : null; } catch (e) {}
  // ?diag=1 → greining ÁN leyndarmáls: secret sett? + vefkrókur barst? + STRÚKTÚR síðasta payloads
  // (maskað — engin PII): sést hvort undirritun gengur upp OG hvort grant-sviðin (kt/metadata/state) finnast.
  if (url.searchParams.get('diag') === '1') {
    const out = { secret_sett: secretSet, secret_lengd: secretSet ? String(env.ASKELL_WEBHOOK_SECRET).length : 0, upptaka_til: !!capTxt, sidasta_sigOk: last ? last.sigOk : null, sidasti_event: last ? last.event : null, sidast: last ? last.at : null };
    if (last && last.body) {
      try {
        const p = JSON.parse(last.body);
        const d = p.data || p;
        const sub = d.subscription || d.contract || d.subscription_contract || {};
        let meta = d.metadata || d.meta || sub.metadata || sub.meta || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
        const ktRaw = String(d.customer_reference || (d.customer && d.customer.reference) || sub.customer_reference || (sub.customer && sub.customer.customer_reference) || '');
        out.struktur = {
          topp_lyklar: Object.keys(p).slice(0, 12),
          gogn_lyklar: Object.keys(d).slice(0, 20),
          hefur_customer_reference: !!ktRaw,
          kt_maskad: ktRaw ? ktRaw.replace(/^\d{6}/, '……') : null,
          metadata: { service: meta.service || null, tier: meta.tier || null, key_present: !!meta.key },
          state: d.state || d.status || sub.state || null,
          reference: String(d.reference || '').replace(/\d{6}(\d{4})/g, '……$1') || null,
        };
      } catch (e) { out.struktur_villa = String((e && e.message) || e); }
    }
    return sjson(out);
  }
  if (!secretSet || t !== env.ASKELL_WEBHOOK_SECRET) return sjson({ error: 'nope', hint: 'nota ?diag=1 til greiningar (án leyndarmáls), annars ?t=<ASKELL_WEBHOOK_SECRET>' });
  if (!capTxt) return sjson({ empty: true, note: 'engin webhook-upptaka enn — gerðu test-greiðslu fyrst' });
  return new Response(capTxt, { headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
}

// ── Áskell v2 embedded checkout — stofna checkout-session (LOTA 110d) ──
// Framendinn kallar hér þegar notandi vill gerast áskrifandi → worker stofnar v2 checkout-session
// með PRIVATE key (server-hlið) → skilar { token } sem framendinn setur í Askell.mountCheckout (askell.js).
// Áskell-widgetinn sér um kortainnslátt + 3DS INNI á karp.is. customer_reference = kt bindur áskriftina.
// ⚠ ÓVIRKT þar til ASKELL_PRIVATE_KEY er sett (rása-slug frettir/utbod eru hardkóðuð sjálfgildi).
// Flettir upp verð-ID einskiptisvöru í Áskell V2-katalógnum eftir vöru-TILVÍSUN (reference).
// Varfærin þáttun (svar-snið óskjalfest í smáatriðum): vörulisti → id→reference kort, verðlisti →
// fyrsta verð vörunnar (one_time í forgangi). Cache 1h per tilvísun. Skilar id eða null.
// recurring=true → skilar ENDURTEKNA verðinu (áskriftir); annars one_time í forgangi (stök skýrsla)
async function askellPriceId(env, ctx, prodRef, recurring) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-price?ref=' + encodeURIComponent(prodRef) + (recurring ? '&rec=1' : ''));
  const hit = await cache.match(ck);
  if (hit) { try { const j = await hit.json(); if (j.id) return j.id; } catch (e) {} }
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Accept': 'application/json' };
  const lesa = (d) => (Array.isArray(d) ? d : (d && (d.results || d.options || d.items || d.data)) || []);
  try {
    const [prodsR, pricesR] = await Promise.all([
      fetch('https://askell.is/api/v2/catalog/products/?active=all', { headers: H }).then((r) => r.json()).catch(() => null),
      fetch('https://askell.is/api/v2/catalog/prices/?active=all', { headers: H }).then((r) => r.json()).catch(() => null),
    ]);
    const prods = lesa(prodsR), prices = lesa(pricesR);
    const refOf = (p) => String(p.reference || p.ref || p.sku || '');
    const idOf = (p) => (p.id != null ? p.id : (p.pk != null ? p.pk : (p.uuid || p.token || null)));
    // product-tengill verðs getur verið heiltala, "12", DRF-hyperlink ".../products/12/", hlutur — eða
    // tilvísunin sjálf; verðið getur líka borið eigin reference. Prófa allt (snið óskjalfest).
    const linkId = (v) => {
      if (v == null) return null;
      if (typeof v === 'object') return idOf(v);
      const s = String(v), m = s.match(/\/(\d+)\/?$/);
      return m ? m[1] : s;
    };
    const prodIds = new Set(prods.filter((p) => refOf(p) === prodRef).map(idOf).filter((x) => x != null).map(String));
    let best = null;
    for (const pr of prices) {
      if (pr.active === false) continue;
      // RAUN-SNIÐ Áskell V2 (staðfest 11.7): verð ber product_reference + product_id beint
      const pid = pr.product_id != null ? pr.product_id : linkId(pr.product);
      const pref = String(pr.product_reference || ((pr.product && typeof pr.product === 'object') ? refOf(pr.product) : ''));
      const match = pref === prodRef || (pid != null && prodIds.has(String(pid))) ||
        String(pr.product || '') === prodRef || refOf(pr) === prodRef;
      if (!match) continue;
      const vil = recurring ? 'recurring' : 'one_time';
      if (!best || String(pr.billing_type || '') === vil) best = pr;   // óskað snið í forgangi
    }
    const id = best ? idOf(best) : null;
    if (id != null) ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ id }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
    return id;
  } catch (e) { return null; }
}
async function askellSessionHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY) return sjson({ error: 'unconfigured' });
  const u = new URL(request.url);
  const TIERS = { grunnur: 'ASKELL_CHANNEL_GRUNNUR', fyrirtaeki: 'ASKELL_CHANNEL_FYRIRTAEKI', fyrirtaeki_plus: 'ASKELL_CHANNEL_FYRIRTAEKI_PLUS' };
  const SVCS = { utbod: 'ASKELL_CHANNEL_UTBOD', frettir: 'ASKELL_CHANNEL_FRETTIR', fasteign: 'ASKELL_CHANNEL_FASTEIGN', thingskyrslur: 'ASKELL_CHANNEL_THINGSKYRSLUR', kvoti: 'ASKELL_CHANNEL_KVOTI' };   // sérlausnir: Útboð 1.900, Umfjöllun/frettir 3.900, Fasteignir 3.900, Þingmannaskýrslur 3.900, Kvótavaktin 9.900 (premium)
  const svc = SVCS[u.searchParams.get('service')] ? u.searchParams.get('service') : '';
  const tier = TIERS[u.searchParams.get('tier')] ? u.searchParams.get('tier') : 'grunnur';
  const kt = String(u.searchParams.get('kt') || '').replace(/\D/g, '');
  // Stök skýrsla (einskiptisvara um Áskell): ?stak=fyrirtaeki:kt|eigendur:kt|areidanleiki:kt|fasteign:addr
  // → sölurás per tegund (sjálfgildi = vöru-tilvísanir Arons í Áskell 11.7.2026), metadata {service:'stak', key}
  // → vefkrókur veitir um /reports/grant. Env-secret yfirskrifar sjálfgildið ef rásar-slug er annað.
  const STAKS = {
    fyrirtaeki: ['ASKELL_CHANNEL_STAK_FYRIRTAEKI', 'fyrirtaeki_skyrsla'],
    eigendur: ['ASKELL_CHANNEL_STAK_EIGENDUR', 'eigendur_skyrsla'],
    areidanleiki: ['ASKELL_CHANNEL_STAK_AREIDANLEIKI', 'areidanleiki'],
    fasteign: ['ASKELL_CHANNEL_STAK_FASTEIGN', 'fasteigna_skyrsla'],
    thingmadur: ['ASKELL_CHANNEL_STAK_THINGMADUR', 'thingmanna_skyrsla'],
  };
  const stak = String(u.searchParams.get('stak') || '').slice(0, 90);
  const stakKind = (stak.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  if (stak && !stakKind) return sjson({ error: 'stak' });
  const channel = stakKind ? (env[STAKS[stakKind][0]] || env.ASKELL_CHANNEL_STAK || STAKS[stakKind][1])
    : (svc ? (env[SVCS[svc]] || svc) : (env[TIERS[tier]] || tier));   // sjálfgefið = slug → aðeins ASKELL_PRIVATE_KEY skylt
  const stakOk = !!stakKind;
  // Einskiptisvara VERÐUR að fylgja session-inum sem initial_items (rásin ein býður ekkert tilboð —
  // „Ekkert tilboð er tiltækt í þessu kaupferli"). Verð-ID flett upp í V2-katalógnum eftir vöru-tilvísun.
  let stakPrice = null;
  if (stakOk) {
    stakPrice = await askellPriceId(env, ctx, STAKS[stakKind][1]);
    if (!stakPrice) return sjson({ error: 'noprice', ref: STAKS[stakKind][1] });
  }
  // PRUFUVÖRN: áskrift (svc/þrep) — stök skýrsla (stakOk) hefur ekkert frípróf, sleppt. Endurtekið
  // frípróf → án-frípróf rás ef stillt, annars blokka. Auðkennt per user-id (kt-skipti duga ekki).
  let useChannel = channel;
  if (!stakOk) {
    const uid = await karpUserId(request, env);
    const kind = svc ? 'svc' : 'tier';
    const slug = svc || tier;
    if (uid && await trialUsedFor(env, uid, kind, slug)) {
      const nt = notrialChannel(env, slug);
      if (!nt) return sjson({ error: 'trial_used' });
      useChannel = nt;
    }
  }
  const body = { sales_channel: useChannel, expires_in_seconds: 1800, metadata: stakOk ? { service: 'stak', key: stak } : (svc ? { service: svc } : { tier }) };   // metadata → vefkrókur veit hvað var keypt
  if (stakPrice) body.initial_items = [{ price: stakPrice, quantity: 1 }];   // einskiptisvaran sjálf → tilboð birtist í kaupferlinu
  if (kt.length === 10) body.customer_reference = kt;   // bindur áskriftina við kt → vefkrókur skilar því → grant
  try {
    const r = await fetch('https://askell.is/api/v2/checkout-sessions/', {
      method: 'POST',
      headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, expires_at: d.expires_at || null, tier: svc || tier });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

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
const STAK_VERD = { fyrirtaeki: ['Fyrirtækjaskýrsla', 990], eigendur: ['Eigendaskýrsla', 990], areidanleiki: ['Áreiðanleikamat', 990], fasteign: ['Fasteignaskýrsla (verðmat)', 990], thingmadur: ['Þingmannaskýrsla', 990] };
async function askellProcessorId(env, ctx) {
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-procid');
  const hit = await cache.match(ck);
  if (hit) { try { const j = await hit.json(); if (j.id != null) return j.id; } catch (e) {} }
  try {
    const r = await fetch('https://askell.is/api/checkouts/paymentprocessors/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY } });
    const d = await r.json().catch(() => null);
    const list = (d && (d.payment_processors || d.results)) || (Array.isArray(d) ? d : []);
    const p = list.find((x) => x.supports_checkout && (x.allowed_currencies || []).indexOf('ISK') >= 0) || list.find((x) => x.supports_checkout);
    if (p && p.id != null) {
      ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ id: p.id }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
      return p.id;
    }
  } catch (e) {}
  return null;
}
async function stakCheckoutHandler(request, env, ctx) {
  // ⚠ ASKELL_PUBLIC_KEY er SKYLDA: eina örugga „kort komið"-merkið er GET /api/checkouts/{token}/
  // (status=tokencreated) sem krefst public-lykilsins — án hans myndum við rukka blint (sannað 11.7:
  // paymentmethod-attach TEKST á fersku checkout-i áður en kort er slegið inn). Án lykils → Teya.
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY) return sjson({ error: 'unconfigured' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  if (request.method !== 'POST') {   // létt könnun framendans áður en kt-form birtist
    const pid = await askellProcessorId(env, ctx);
    return sjson(pid != null ? { ok: 1 } : { error: 'noprocessor' });
  }
  const uid = await karpUserId(request, env);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  if (!kind || kt.length !== 10) return sjson({ error: 'input' });
  const pid = await askellProcessorId(env, ctx);
  if (pid == null) return sjson({ error: 'noprocessor' });
  const nafn = String((b && b.nafn) || '').trim().slice(0, 80) || 'Karp notandi';
  const bil = nafn.lastIndexOf(' ');
  const email = String((b && b.email) || '').trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sjson({ error: 'email' });   // Áskell krefst netfangs (kvittun)
  try {
    // viðskiptavinur verður að vera til áður en kort er tengt — stofna; 400 er aðeins í lagi ef hann
    // ER til (annars endar kaupandinn í eilífu 'waiting' eftir kortainnslátt — rýni-atriði #6)
    const cr = await fetch('https://askell.is/api/customers/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ first_name: bil > 0 ? nafn.slice(0, bil) : nafn, last_name: bil > 0 ? nafn.slice(bil + 1) : '-', email, customer_reference: kt }),
    });
    if (!cr.ok) {
      const til = await fetch('https://askell.is/api/customers/' + encodeURIComponent(kt) + '/', { headers: H });
      if (!til.ok) return sjson({ error: 'customer' });
    }
    const r = await fetch('https://askell.is/api/checkouts/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ payment_processor: pid, currency: 'ISK', capture_only: true, allowed_origin: 'https://karp.is' }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.checkout_url || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, checkout_url: d.checkout_url });
  } catch (e) { return sjson({ error: 'upstream' }); }
}
async function stakConfirmHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY || request.method !== 'POST') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign|thingmadur):.+/) || [])[1] || '';
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  const tok = String((b && b.token) || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (!kind || kt.length !== 10 || tok.length < 20) return sjson({ error: 'input' });
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-stakpay?tok=' + tok);
  // reference = lykill + KAUPANDA-kt → einkvæmt per (skýrsla, kaupandi) og STÖÐUGT þvert á
  // endurtilraunir/ný checkout → tvírukkunar-vörn þótt edge-cache gleymist (rýni-atriði #2).
  // Vefkrókur klippir '|…' af fyrir grant-lykilinn.
  const refStr = key + '|' + kt;
  const granted = async (uuid) => {   // F7: grant→D1 (leysir WP af hólmi) á INNSKRÁÐA kaupandann (uid) — idempotent á user+key.
    if (env.TENGSL && uid) await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)').bind(+uid, key, Math.floor(Date.now() / 1000)).run().catch(() => {});
    if (!env.KARP_GRANT_SECRET) return;   // WP-varaleið meðan hún tórir (fellur út þegar WP fer)
    await fetch('https://wp.karp.is/wp-json/karp/v1/reports/grant', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Karp-Secret': env.KARP_GRANT_SECRET },
      body: JSON.stringify({ userid: +uid, kt, key, orderid: 'askv1_' + uuid, secret: env.KARP_GRANT_SECRET }),
    }).catch(() => null);
  };
  // BLOCKER-vörn (rýni-atriði #1): grant-lykillinn er lesinn úr GREIÐSLUNNI sjálfri (reference) og
  // verður að passa við key/kt beiðninnar — annars gæti ein greidd skýrsla „opnað" allar hinar.
  const stada = async (uuid) => {
    const r = await fetch('https://askell.is/api/payments/' + uuid + '/', { headers: H });
    const d = await r.json().catch(() => null);
    const st = String((d && d.state) || 'pending');
    if (st === 'settled') {
      const greiddurLykill = String((d && d.reference) || '').split('|')[0];
      const greiddKt = String((d && d.customer_reference) || '').replace(/\D/g, '');
      if (greiddurLykill !== key || (greiddKt && greiddKt !== kt)) return sjson({ error: 'mismatch' });
      await granted(uuid);
      return sjson({ state: 'settled' });
    }
    return sjson({ state: st === 'failed' ? 'failed' : 'pending' });
  };
  try {
    const hit = await cache.match(ck);
    if (hit) {   // greiðsla þegar stofnuð → aðeins staða + grant þegar settled
      const j = await hit.json().catch(() => null);
      if (j && j.uuid) return stada(String(j.uuid));
    }
    // ⚠ EINA örugga „kort komið"-merkið: staða checkout-sins sjálfs (krefst PUBLIC-lykils).
    // paymentmethod-attach tekst nefnilega STRAX á fersku checkout-i (sannað 11.7) → blind rukkun bönnuð.
    const cs = await fetch('https://askell.is/api/checkouts/' + tok + '/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PUBLIC_KEY } });
    const cd = await cs.json().catch(() => null);
    const cst = String((cd && cd.status) || '');
    if (cst !== 'tokencreated') {
      if (/error|fail|cancel|expire/i.test(cst)) return sjson({ state: 'failed' });
      return sjson({ state: 'waiting' });
    }
    // kort komið → en FYRST: er lifandi greiðsla þegar til fyrir (skýrslu, kaupanda)? — misheppnaðar
    // greiðslur (hafnað kort) mega EKKI stífla nýja tilraun → aðeins non-failed telja
    const pl = await fetch('https://askell.is/api/payments/?page_size=100', { headers: H }).then((r) => r.json()).catch(() => null);
    const fyrri = ((Array.isArray(pl) ? pl : (pl && pl.results) || []).find((x) => String(x.reference || '') === refStr && !/fail/i.test(String(x.state || ''))));
    if (fyrri && (fyrri.uuid || fyrri.id)) {
      const u0 = String(fyrri.uuid || fyrri.id);
      ctx.waitUntil(cache.put(ck, new Response(JSON.stringify({ uuid: u0 }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } })));
      return stada(u0);
    }
    const at = await fetch('https://askell.is/api/customers/paymentmethod/', { method: 'POST', headers: H, body: JSON.stringify({ customer_reference: kt, token: tok }) });
    if (!at.ok) return sjson({ state: 'waiting' });
    const [heiti, verd] = STAK_VERD[kind];
    const pr = await fetch('https://askell.is/api/payments/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ customer_reference: kt, amount: String(verd), currency: 'ISK', description: heiti + ' — karp.is', reference: refStr }),
    });
    const pd = await pr.json().catch(() => null);
    const uuid = pd && (pd.uuid || pd.id);
    if (!pr.ok || !uuid) return sjson({ error: 'payment', status: pr.status });
    await cache.put(ck, new Response(JSON.stringify({ uuid: String(uuid) }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } }));
    const st = String((pd && pd.state) || 'pending');
    if (st === 'settled') { await granted(String(uuid)); return sjson({ state: 'settled' }); }
    return sjson({ state: 'pending' });
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ── Áskriftir um ÁSKELL V1-FLÆÐI (framhjá V2 embedded widget) ──
// V2 widget getur EKKI tengt viðskiptavin sem er þegar til („A customer with this reference already exists")
// OG Áskell sendir ENGAN vefkrók við trial-contract-stofnun (sannað 12.7) → widget-leiðin veitir aldrei aðgang.
// Þess í stað: sama iframe-kortaform og stökin (V1 hosted checkout) → server-megin stofnum við
// V2 subscription-contract OG veitum aðgang STRAX á /sub/grant (ekki beðið eftir rukkunar-vefkrók).
// slug = þrep (grunnur/fyrirtaeki/fyrirtaeki_plus) EÐA þjónusta (utbod/frettir/fasteign) = vöru-tilvísun í Áskell.
const SUB2_SLUGS = { grunnur: 'tier', fyrirtaeki: 'tier', fyrirtaeki_plus: 'tier', utbod: 'svc', frettir: 'svc', fasteign: 'svc', thingskyrslur: 'svc', kvoti: 'svc' };
async function sub2CheckoutHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY) return sjson({ error: 'unconfigured' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  if (request.method !== 'POST') { const pid = await askellProcessorId(env, ctx); return sjson(pid != null ? { ok: 1 } : { error: 'noprocessor' }); }
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const slug = String((b && b.slug) || '').toLowerCase();
  if (!SUB2_SLUGS[slug]) return sjson({ error: 'input' });
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'input' });
  // PRUFUVÖRN: endurtekið frípróf blokkað (server-hlið, per user-id). sub2 notar endurtekið VERÐ
  // (frípróf á Áskell-áætluninni) → engin sjálfvirk án-frípróf leið hér, svo blokka. Endurkomu-payer:
  // hafðu samband (eða Aron útbýr án-frípróf verð síðar). uid er auðkennt að ofan.
  if (await trialUsedFor(env, uid, SUB2_SLUGS[slug], slug)) return sjson({ error: 'trial_used' });
  const email = String((b && b.email) || '').trim().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sjson({ error: 'email' });
  const nafn = String((b && b.nafn) || '').trim().slice(0, 80) || 'Karp notandi';
  const bil = nafn.lastIndexOf(' ');
  const pid = await askellProcessorId(env, ctx);
  if (pid == null) return sjson({ error: 'noprocessor' });
  const price = await askellPriceId(env, ctx, slug, true);   // endurtekna verðið — verður að finnast ÁÐUR en kort birtist
  if (!price) return sjson({ error: 'noprice', ref: slug });
  try {
    const cr = await fetch('https://askell.is/api/customers/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ first_name: bil > 0 ? nafn.slice(0, bil) : nafn, last_name: bil > 0 ? nafn.slice(bil + 1) : '-', email, customer_reference: kt }),
    });
    if (!cr.ok) { const til = await fetch('https://askell.is/api/customers/' + encodeURIComponent(kt) + '/', { headers: H }); if (!til.ok) return sjson({ error: 'customer' }); }
    const r = await fetch('https://askell.is/api/checkouts/', {
      method: 'POST', headers: H,
      body: JSON.stringify({ payment_processor: pid, currency: 'ISK', capture_only: true, allowed_origin: 'https://karp.is' }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.checkout_url || !d.token) return sjson({ error: 'askell', status: r.status });
    return sjson({ token: d.token, checkout_url: d.checkout_url });
  } catch (e) { return sjson({ error: 'upstream' }); }
}
async function sub2ConfirmHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY || request.method !== 'POST') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request, env);
  if (!uid) return sjson({ error: 'login' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  const b = await request.json().catch(() => null);
  const slug = String((b && b.slug) || '').toLowerCase();
  if (!SUB2_SLUGS[slug]) return sjson({ error: 'input' });
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  const tok = String((b && b.token) || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (kt.length !== 10 || tok.length < 20) return sjson({ error: 'input' });
  const isTier = SUB2_SLUGS[slug] === 'tier';
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-sub2?tok=' + tok);
  const untilOf = (c) => {
    const s = c && (c.trial_end_at || c.billing_anchor_at || c.next_billing_at || c.current_period_end_at);
    const now = Math.floor(Date.now() / 1000);
    let u = s ? Math.floor(new Date(s).getTime() / 1000) : 0;
    if (!u || u < now) u = now + 32 * 86400;   // ef period-lok finnst ekki → mánuður frá núna (grant klárast)
    return u;
  };
  const virk = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));
  const granted = async (cid, until) => {   // F7: grant STRAX á D1 (leysir WP af hólmi) á kaupanda-uid — idempotent.
    if (env.TENGSL && uid) {
      const now = Math.floor(Date.now() / 1000);
      if (isTier) await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, tier_askell=?, tier_trial_used=1, updated=? WHERE id=?').bind(slug, until, String(cid), now, +uid).run().catch(() => {});
      else await env.TENGSL.prepare('INSERT INTO sub_service (user_id, service, until, askell_id, trial_used) VALUES (?,?,?,?,1) ON CONFLICT(user_id, service) DO UPDATE SET until=excluded.until, askell_id=excluded.askell_id, trial_used=1').bind(+uid, slug, until, String(cid)).run().catch(() => {});
    }
    if (!env.KARP_GRANT_SECRET) return;   // WP-varaleið meðan hún tórir
    await fetch('https://wp.karp.is/wp-json/karp/v1/sub/grant', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Karp-Secret': env.KARP_GRANT_SECRET },
      body: JSON.stringify({ userid: +uid, kt, ...(isTier ? { tier: slug } : { service: slug }), until, askellId: String(cid), ref: 'sub2_' + String(cid) + '_' + until, secret: env.KARP_GRANT_SECRET }),
    }).catch(() => null);
  };
  const contractGet = async (cid) => { const g = await fetch('https://askell.is/api/v2/subscription-contracts/' + cid + '/', { headers: H }); return g.json().catch(() => null); };
  try {
    const hit = await cache.match(ck);
    if (hit) {   // samningur þegar stofnaður → aðeins staða + grant þegar virkur
      const j = await hit.json().catch(() => null);
      if (j && j.cid) { const c = await contractGet(j.cid); if (virk(c && c.state)) { await granted(j.cid, untilOf(c)); return sjson({ state: 'active' }); } return sjson({ state: 'pending' }); }
    }
    // kort komið? (checkout status = tokencreated, krefst public-lykils — annars blind virkjun)
    const cs = await fetch('https://askell.is/api/checkouts/' + tok + '/', { headers: { 'Authorization': 'Api-Key ' + env.ASKELL_PUBLIC_KEY } });
    const cd = await cs.json().catch(() => null);
    const cst = String((cd && cd.status) || '');
    if (cst !== 'tokencreated') { if (/error|fail|cancel|expire/i.test(cst)) return sjson({ state: 'failed' }); return sjson({ state: 'waiting' }); }
    const price = await askellPriceId(env, ctx, slug, true);
    if (!price) return sjson({ error: 'noprice' });
    // dedup: ó-afskráður samningur fyrir þennan kaupanda+vöru þegar til? → endurnýta (engin tvöföldun v/endurtilrauna)
    const lst = await fetch('https://askell.is/api/v2/subscription-contracts/?page_size=50', { headers: H }).then((r) => r.json()).catch(() => null);
    const contracts = Array.isArray(lst) ? lst : ((lst && lst.results) || []);
    let contract = contracts.find((c) => String(c.customer_reference || '').replace(/\D/g, '') === kt && !/cancel/i.test(String(c.state || '')) && (c.items || []).some((i) => String(i.product_reference || '') === slug)) || null;
    // tengja kort við viðskiptavin (nauðsynlegt fyrir rukkun þegar trial rennur út)
    const at = await fetch('https://askell.is/api/customers/paymentmethod/', { method: 'POST', headers: H, body: JSON.stringify({ customer_reference: kt, token: tok }) });
    if (!at.ok && !contract) return sjson({ state: 'waiting' });
    if (!contract) {   // stofna+virkja samning server-megin (widget kemur hvergi við)
      const body = { customer_reference: kt, items: [{ price }], state: 'active', metadata: { karp: (isTier ? 'tier:' : 'svc:') + slug, uid: String(uid) } };
      const cr = await fetch('https://askell.is/api/v2/subscription-contracts/', { method: 'POST', headers: H, body: JSON.stringify(body) });
      contract = await cr.json().catch(() => null);
      if (!cr.ok || !contract || !contract.id) return sjson({ error: 'contract', status: cr.status });
    }
    const cid = contract.id;
    await cache.put(ck, new Response(JSON.stringify({ cid }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=7200' } }));
    if (!virk(contract.state)) {   // ekki virkur enn → reyna PATCH state active, lesa aftur
      const pc = await fetch('https://askell.is/api/v2/subscription-contracts/' + cid + '/', { method: 'PATCH', headers: H, body: JSON.stringify({ state: 'active' }) });
      const c2 = await pc.json().catch(() => null);
      if (c2 && c2.state) contract = c2; else { const c3 = await contractGet(cid); if (c3) contract = c3; }
    }
    if (virk(contract.state)) { await granted(cid, untilOf(contract)); return sjson({ state: 'active' }); }
    return sjson({ state: 'pending', contract_state: contract.state || null });   // sést í prófi ef virkjun tókst ekki
  } catch (e) { return sjson({ error: 'upstream' }); }
}

// ⚠ TÍMABUNDINN greiningar-endapunktur (LOTA 110i) — les Áskell-uppsetningu m/private-lykli til að greina
// „Payment processor configuration could not be loaded". Skilar AÐEINS fjölda + eligibility + display_names
// (engin leyndarmál/viðkvæmt) → óhætt án ?t=. EYÐA eftir að webhook er staðfestur.
async function askellConfigHandler(request, env) {
  if (!env.ASKELL_PRIVATE_KEY) return sjson({ error: 'no-key' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  // ?cs=1: krufning á checkout-session m/initial_items — hvers vegna „Ekkert tilboð er tiltækt"?
  // (?chan=rás, ?price=verd-id) → OPTIONS-svið + stofnun + lesa til baka + widget-endapunktar m/token
  const uq = new URL(request.url).searchParams;
  // ?contracts=1: LESA áskriftarsamninga (aðeins lestur — engin stofnun/afskráning) til greiningar
  if (uq.get('contracts')) {
    const out = {};
    const det = uq.get('detail');
    if (det) {   // LESA einn samning í heild (vara/metadata/dags) — staðfesta að sub2-flæðið hafi rétt
      try {
        const g = await fetch('https://askell.is/api/v2/subscription-contracts/' + det + '/', { headers: H });
        const c = await g.json().catch(() => null);
        out.detail = c ? { id: c.id, state: c.state, kt: String(c.customer_reference || '').replace(/^\d{6}/, '……'), items: (c.items || []).map((i) => ({ ref: i.product_reference, nafn: i.product_name, verd: i.unit_amount })), metadata: c.metadata, trial_end_at: c.trial_end_at, billing_anchor_at: c.billing_anchor_at, next_billing_at: c.next_billing_at, created: c.created_at } : null;
      } catch (e) { out.detail_err = String((e && e.message) || e); }
    }
    try {
      const r = await fetch('https://askell.is/api/v2/subscription-contracts/?page_size=15', { headers: H });
      const b = await r.json().catch(() => null);
      const list = Array.isArray(b) ? b : ((b && b.results) || []);
      out.contracts = list.map((x) => ({ id: x.id, state: x.state, kt: String(x.customer_reference || '').replace(/^\d{6}/, '……'), created: x.created_at || x.created, vara: (x.items || []).map((i) => i.product_reference || i.product_name).join(',') }));
    } catch (e) { out.err = String((e && e.message) || e); }
    return sjson(out);
  }
  // ?wh=1: skráðir vefkrókar í Áskell — er einn skráður og bendir hann á karp.is/api/askell/webhook?
  //   (áskriftir reiða sig ALGJÖRLEGA á vefkrókinn — engin poll-varaleið eins og stakar)
  if (uq.get('wh')) {
    const out = {};
    for (const p of ['/api/webhooks/', '/api/v2/webhooks/']) {
      try {
        const r = await fetch('https://askell.is' + p, { headers: H });
        const b = await r.json().catch(() => null);
        const list = Array.isArray(b) ? b : ((b && b.results) || []);
        out[p] = { s: r.status, n: list.length, hooks: list.map((x) => ({ id: x.id || x.pk, url: x.url || x.endpoint || x.target_url, events: x.events || x.event_types || x.subscribed_events, active: x.active != null ? x.active : x.is_active, has_secret: !!(x.secret || x.signing_secret) })) };
      } catch (e) { out[p] = { e: String((e && e.message) || e) }; }
    }
    return sjson(out);
  }
  // ?fixgrant=1: viðgerð — endurkeyra grant f. SETTLED V1-greiðslur (lykill+kaupanda-kt úr reference).
  // Örugg: veitir aðeins það sem sannanlega var greitt; WP-grant er idempotent á lykli. Skilar WP-svörum.
  if (uq.get('fixgrant')) {
    const r = await fetch('https://askell.is/api/payments/?page_size=15', { headers: H });
    const d = await r.json().catch(() => null);
    const list = Array.isArray(d) ? d : ((d && d.results) || []);
    const ut = [];
    for (const x of list) {
      if (String(x.state || '') !== 'settled') continue;
      const [lykill, ktRaw] = String(x.reference || '').split('|');
      const kt = String(ktRaw || '').replace(/\D/g, '');
      if (!/^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/.test(lykill || '') || kt.length !== 10) continue;
      await grantReportD1(env, kt, lykill);   // F7: grant→D1 (um kt→uid)
      ut.push({ uuid: String(x.uuid || '').slice(0, 8), lykill: lykill.replace(/\d{6}(\d{4})/, '……$1'), d1: 'grantað' });
    }
    return sjson({ n: ut.length, grants: ut });
  }
  // ?pay=1: nýjustu V1-greiðslur (staða/upphæð/reference m/maskaðri kt) — greina prófkaup
  if (uq.get('pay')) {
    try {
      const r = await fetch('https://askell.is/api/payments/?page_size=15', { headers: H });
      const d = await r.json().catch(() => null);
      const list = Array.isArray(d) ? d : ((d && d.results) || []);
      return sjson({
        status: r.status, n: list.length,
        greidslur: list.map((x) => ({
          uuid: String(x.uuid || x.id || '').slice(0, 8),
          state: x.state, amount: x.amount, currency: x.currency,
          reference: String(x.reference || '').replace(/\d{6}(\d{4})/g, '……$1'),   // kt möskuð
          kt_maskad: String(x.customer_reference || '').replace(/^\d{6}/, '……'),
          descr: String(x.description || '').slice(0, 40),
          created: x.created_at || x.created || null,
          villa: x.error || x.failure_reason || x.decline_reason || undefined,
        })),
        lyklar_fyrstu: list[0] ? Object.keys(list[0]) : [],
      });
    } catch (e) { return sjson({ error: String((e && e.message) || e) }); }
  }
  // ?v1=1: V1 stak-greiðsluleiðin — styður Teya-færsluhirðirinn hosted checkout (iframe)?
  // + stofna capture_only prufu-checkout og skoða frameability-hausa á checkout_url
  if (uq.get('v1')) {
    const out = {};
    try { const r = await fetch('https://askell.is/api/checkouts/paymentprocessors/', { headers: H }); out.pp_status = r.status; out.pp = await r.json().catch(() => null); } catch (e) { out.pp_err = String((e && e.message) || e); }
    const list = (out.pp && (out.pp.payment_processors || out.pp.results)) || (Array.isArray(out.pp) ? out.pp : []);
    const proc = list.find((x) => x.supports_checkout) || list[0];
    if (proc && uq.get('mk')) {
      try {
        const r = await fetch('https://askell.is/api/checkouts/', { method: 'POST', headers: H, body: JSON.stringify({ payment_processor: proc.id, currency: 'ISK', capture_only: true, allowed_origin: 'https://karp.is' }) });
        out.create_status = r.status;
        const cd = await r.json().catch(() => null);
        out.create = cd;
        if (cd && cd.checkout_url) {
          const h = await fetch(cd.checkout_url, { method: 'GET', redirect: 'manual' });
          out.frame = { status: h.status, xfo: h.headers.get('x-frame-options'), csp: h.headers.get('content-security-policy') };
        }
        if (cd && cd.token) { const g = await fetch('https://askell.is/api/checkouts/' + cd.token + '/', { headers: H }); out.chk_status = g.status; out.chk = await g.json().catch(() => null); }
      } catch (e) { out.create_err = String((e && e.message) || e); }
    }
    return sjson(out);
  }
  // ?sc=1: sölurásirnar sjálfar — hafa þær „tilboð" (offers/plans/prices) tengd Áskell-megin?
  if (uq.get('sc')) {
    const out = {};
    for (const p of ['/api/v2/sales-channels/?active=all', '/api/v2/sales-channels/', '/api/v2/saleschannels/', '/api/v2/catalog/sales-channels/']) {
      try {
        const r = await fetch('https://askell.is' + p, { headers: H });
        out[p] = { s: r.status };
        if (r.status === 200) { out[p].b = await r.json().catch(() => null); break; }
      } catch (e) { out[p] = { e: String((e && e.message) || e) }; }
    }
    return sjson(out);
  }
  const get = async (p) => { try { const r = await fetch('https://askell.is' + p, { headers: H }); return { s: r.status, b: await r.json().catch(() => null) }; } catch (e) { return { s: 0, e: String((e && e.message) || e) }; } };
  const post = async (p, body) => { try { const r = await fetch('https://askell.is' + p, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(() => null) }; } catch (e) { return { s: 0, e: String((e && e.message) || e) }; } };
  const arr = (x) => Array.isArray(x) ? x : (x && Array.isArray(x.results) ? x.results : []);
  const prod = await get('/api/v2/catalog/products/?active=all');
  const price = await get('/api/v2/catalog/prices/?active=all');
  const products = arr(prod.b), prices = arr(price.b);
  const iskRec = prices.find((p) => p.currency === 'ISK' && (p.billing_type === 'recurring' || p.recurrence_type)) || prices.find((p) => p.currency === 'ISK') || prices[0];
  const out = {
    products_status: prod.s, prices_status: price.s,
    n_products: products.length,
    n_active_products: products.filter((p) => p.active || p.is_active).length,
    n_prices: prices.length,
    isk_prices: prices.filter((p) => p.currency === 'ISK').map((p) => ({ id: p.id || p.pk, amount: p.amount, active: p.active != null ? p.active : p.is_active, billing: p.billing_type, rec: p.recurrence_type })),
    picked_price: iskRec ? (iskRec.id || iskRec.pk) : null,
    // Linkage-sýni (vörukatalógur Karp sjálfs — engin viðskiptavina-gögn): hvernig tengist verð vöru?
    product_samples: products.map((p) => ({ id: p.id != null ? p.id : p.pk, reference: p.reference || p.ref || p.sku || null, name: String(p.name || '').slice(0, 40) })),
    price_link_samples: prices.map((p) => ({ id: p.id != null ? p.id : p.pk, product: p.product != null ? (typeof p.product === 'object' ? { id: p.product.id, reference: p.product.reference } : p.product) : null, reference: p.reference || null, billing: p.billing_type, amount: p.amount, currency: p.currency })),
    price_keys: prices[0] ? Object.keys(prices[0]) : [],
    product_keys: products[0] ? Object.keys(products[0]) : [],
  };
  if (iskRec) {
    const pid = iskRec.id || iskRec.pk;
    const base = { customer_reference: '1234567890', currency: 'ISK', collection_method: 'card' };
    let r = await post('/api/v2/payment-processor-options/', { ...base, items: [{ price: pid, quantity: 1 }] });
    if (r.s >= 400) { const r2 = await post('/api/v2/payment-processor-options/', { ...base, initial_items: [{ price: pid, quantity: 1 }] }); if (r2.s < r.s) r = r2; }
    out.pp_status = r.s;
    out.pp_raw = r.b;   // fullt hrátt svar → sést hvers vegna results er tómt þrátt fyrir single_eligible
  }
  // Finna account payment processors (nr. 254) → sést tegund + hvort hann styður innfellt checkout
  out.processor_probe = {};
  let processors = null;
  for (const p of ['/api/v2/account-payment-processors/?active=all', '/api/v2/payment-processors/?active=all', '/api/paymentprocessors/', '/api/v2/account-payment-processors/']) {
    const g = await get(p);
    const list = Array.isArray(g.b) ? g.b : ((g.b && g.b.results) || null);
    out.processor_probe[p] = g.s + (list ? (' n=' + list.length) : '');
    if (g.s === 200 && list && !processors) processors = list;
  }
  if (processors) out.processors = processors.map((x) => ({ id: x.id || x.pk, name: x.display_name || x.name, type: x.payment_processor || x.processor_type || x.type, active: x.active != null ? x.active : x.is_active, checkout: x.supports_checkout, card_frontend: x.card_collection_in_frontend, render: x.render_mode }));
  return sjson(out);
}

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
const htmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ktSep = (kt) => (/^\d{10}$/.test(kt) ? kt.slice(0, 6) + '-' + kt.slice(6) : String(kt || ''));
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +String(kt).slice(0, 2) >= 41 && +String(kt).slice(0, 2) <= 71;
const isoDate = (s) => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined; };
const repAll = (h, t, v) => h.split(t).join(v);

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
  return `<p class="kf-links"><a href="/fyrirtaeki/">← Fyrirtækjaskrá</a></p>
    <h1 class="kf-h1">${e(f.nafn)}</h1>
    <div class="kf-kt">kt. ${e(ktSep(kt))}</div>
    <div class="kf-chips">${chips}</div>
    <div class="kf-grid">${grid}</div>
    ${isatSec}${fyrirsvarSec}${arsSec}${eigTeaser}${cta}${links}
    <p class="kf-note">Grunngögn úr opinberri fyrirtækjaskrá Skattsins (skatturinn.is), sótt lifandi. Ekki vottorð. Formleg fyrirtækjaskýrsla og eigendaskýrsla fást keyptar hér að ofan.</p>`;
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
let SANCTIONS_IDX = null;
const sancNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
async function sanctionsIndex(env) {
  if (SANCTIONS_IDX) return SANCTIONS_IDX;
  const j = await augGet(env, 'sanctions.json');
  if (!j || !j.names) return { idx: new Map(), updated: null };   // ekki memo-a bilun → reynir aftur síðar
  const idx = new Map();
  for (const x of j.names) {
    const t = (x.n || '').split(' ').filter(Boolean);
    if (t.length < 2) continue;
    const key = t[0] + '|' + t[t.length - 1];
    if (!idx.has(key)) idx.set(key, { nafn: x.nafn, listar: x.listar });
  }
  SANCTIONS_IDX = { idx, updated: j.updated || null };
  return SANCTIONS_IDX;
}
async function sanctionsHandler(request, env, ctx) {
  const names = (new URL(request.url).searchParams.get('names') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const { idx, updated } = await sanctionsIndex(env);
  const hits = [], seen = new Set();
  for (const raw of names) {
    const t = sancNorm(raw).split(' ').filter(Boolean);
    if (t.length < 2) continue;
    const key = t[0] + '|' + t[t.length - 1];
    const m = idx.get(key);
    if (m && !seen.has(key)) { seen.add(key); hits.push({ nafn: raw, listi: m.nafn, listar: m.listar }); }
  }
  return sjson({ hits, updated, n: idx.size });
}

// LEI (GLEIF opið API) — alþjóðlegt lögaðila-auðkenni eftir kt (registeredAs). 5.500+ íslensk félög.
async function leiHandler(request, ctx) {
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

// Leyfaskrár (áfangi 1) — kt-lyklað, sameinar Sýslumenn (rekstrarleyfi) + Ferðamálastofu (ferðaleyfi).
async function leyfiHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ kt, holdur: false, leyfi: [] });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/leyfi?kt=' + kt);
  const hit = await cache.match(cacheKey); if (hit) return hit;
  const [rek, ferda] = await Promise.all([augGet(env, 'rekstrarleyfi.json'), augGet(env, 'ferdaleyfi.json')]);
  const list = [];
  for (const x of ((rek && rek.byKt && rek.byKt[kt]) || [])) list.push({ teg: x.teg, undir: x.undir, flokkur: x.flokkur, stadur: x.stadur, afengi: x.afengi, hop: 'Sýslumenn' });
  for (const x of ((ferda && ferda.byKt && ferda.byKt[kt]) || [])) list.push({ teg: x.teg, undir: null, flokkur: null, stadur: x.stadur, afengi: false, hop: 'Ferðamálastofa' });
  const out = { kt, holdur: list.length > 0, n: list.length, afengi: list.some((x) => x.afengi), leyfi: list.slice(0, 16), heimild: 'Sýslumenn + Ferðamálastofa (island.is)' };
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=43200' } });
  if (rek || ferda) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// Loftför (Loftfaraskrá Samgöngustofu um OPNU island.is-gáttina) — kt → loftför sem félagið á/rekur.
// build_loftfor.mjs → gogn/loftfor.json byKt (aðeins lögaðilar). Sjá memory/iceland-islandis-graphql-audit.md.
async function loftforHandler(request, env, ctx) {
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

// ── RSK Fyrirtækjaskrá — OPINBERT API (Skatturinn, api.skattur.cloud/legalentities/v2.1) ──
// Server-hlið lykill env.RSK_KEY (Ocp-Apim-Subscription-Key). Mælt/gjaldfært → harð-cache 24h.
// ⚠ PII: relationships[] bera kennitölur EINSTAKLINGA → aldrei birtar. Fyrirtækja-kt (dagur 41–71)
// haldið sem tengill milli félaga; einstaklings-kt (01–31) fjarlægt. Secret-gated: án lykils → unconfigured.
function rskErFyrirtaeki(kt) { const dd = parseInt(String(kt).slice(0, 2), 10); return dd >= 41 && dd <= 71; }
// ⚠ APIð skilar PascalCase ("NationalId","Deregistration"…) þótt skjölin sýni camelCase → case-óháð lesning.
function rg(o, name) {
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
async function rskHandler(request, env, ctx) {
  const u = new URL(request.url);
  const kt = (u.searchParams.get('kt') || '').replace(/\D/g, '');
  const debug = u.searchParams.get('debug') === '1';   // TIMABUNDID: PII-oruggt (lyklar, ekki gildi)
  if (kt.length !== 10) return sjson({ kt, holdur: false });
  if (!env.RSK_KEY) return sjson({ kt, holdur: false, unconfigured: true });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/rsk?kt=' + kt);
  if (!debug) { const hit = await cache.match(cacheKey); if (hit) return hit; }
  let out = { kt, holdur: false };
  const diag = { kt };
  try {
    const r = await fetch('https://api.skattur.cloud/legalentities/v2.1/' + kt + '?language=is', {
      headers: { 'Ocp-Apim-Subscription-Key': env.RSK_KEY, 'Accept': 'application/json' },
    });
    diag.upstreamStatus = r.status;
    diag.contentType = r.headers.get('content-type') || null;
    const body = await r.text();
    diag.len = body.length;
    if (r.ok) {
      let d = null; try { d = JSON.parse(body); diag.parsedOk = true; } catch (e) { diag.parsedOk = false; }
      if (d && typeof d === 'object') { diag.keys = Object.keys(d).slice(0, 40); out = rskClean(kt, d); }
      diag.holdur = out.holdur;
    } else {
      out = { kt, holdur: false, status: r.status };
      diag.bodyHead = body.slice(0, 200);   // villusvor eru error-JSON, ekki felagsgogn
    }
  } catch (e) { diag.threw = String((e && e.message) || e); }
  if (debug) return sjson(diag);
  // ⚠ Neikvæð svör ALDREI cache-uð (annars festist tímabundin 404/villa á jaðri í 24h).
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': out.holdur ? 'public, max-age=86400' : 'no-store' } });
  if (out.holdur) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// Innri RAW-sækjari á RSK-API (heldur einstaklings-kt í minni fyrir kt-samsvörun) með eigin
// jaðar-cache (24h) svo tengslanet endurnýti köll milli róta. Skilar hreinsuðum hlut eða null.
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

// ── 🕸️ Kort-hamur: server-hlið nafna-felun (DPIA leið A) ─────────────────────
// Tengslakortið (?kort=1) birtir AÐEINS nöfn rót-tengds fólks. „krossar" = fólk með
// hlutverk í ≥2 net-félögum EN EKKI í rótinni → fjarlægir aðilar. Nöfn þeirra eru
// KLIPPT ÚR svarinu (fara aldrei í vafrann); þeir bera aðeins stöðugt token 'E'+n.
// Félög (lögaðilar) og rót-fyrirsvar (stjornendur) halda nöfnum — sama KYC-gildi og listinn.
export function maskaKortSvar(out) {
  if (!out || !out.holdur) return out;
  const krossar = (out.krossar || []).map((p, i) => ({ token: 'E' + (i + 1), maskad: true, felog: p.felog || [] }));
  return { ...out, krossar, kort: true };
}

// 🔀 RSK-proxy (LOTA — tengslagrunnur): Cloudflare-worker-egress er EKKI throttlað af
// www.skatturinn.is við magn (sannreynt: 32/40 köll m/≥100 treff, ekkert cutoff — öfugt við
// GitHub-runner sem deyr við ~30). Því beinir næturlegi crawlerinn skrapinu HINGAÐ og fær
// landsdekkun á vikum í stað mánaða. GATT: X-Karp-Proxy === RSK_KEY (til á báðum hliðum, ekkert
// nýtt secret). SSRF-vörn: aðeins /fyrirtaekjaskra/-slóðir á www.skatturinn.is. Skilar hráu HTML.
async function rskProxyHandler(request, env) {
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

// 📊 Tengslagrunns-tölfræði (gátað: X-Karp-Proxy===RSK_KEY). Aðeins samtölur (engin PII) svo Aron/ég
// getum fylgst með framvindu crawl-sins hvenær sem er. GET /api/tengsl-stats.
async function tengslStatsHandler(request, env) {
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

// 🕸️ Landsdekkandi auðgun úr tengslagrunni (D1). Null-þolið: án env.TENGSL → óbreytt.
// Bætir landsvísu-félögum rót-tengds fólks í onnur[]. Persónu-kt (out.stjornendur[]._kt,
// server-hlið eingöngu) er notað sem D1-lykill og STRIPPAÐ hér áður en svarið fer út.
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

// 📊 Topplistar fyrirtækja (Karp+-læst). Pure gátun: entitled → fullt; annars topp-3 agn.
export function topplistaBody(rows, entitled, total) {
  return entitled ? { radir: rows, total, locked: false } : { radir: rows.slice(0, 3), total, locked: true };
}
const TOPP_RADAD = { sala: 'sala', hagnadur: 'hagnadur', eignir: 'eignir', efe: 'eigid_fe' };
async function topplistarHandler(request, env, ctx) {
  const u = new URL(request.url);
  const grein = u.searchParams.get('grein') || 'island';
  const radadKey = u.searchParams.get('radad') || 'sala';
  const filter = greinaSql(grein), col = TOPP_RADAD[radadKey];
  if (filter === null || !col) return sjson({ error: 'bad-params' }, 400);
  if (!env.TENGSL) return sjson({ error: 'unconfigured' });
  // entitlement: admin EÐA virk Karp+-áskrift (sama og userPayload.tierActive)
  const uid = await karpUserId(request, env);
  let entitled = false;
  if (uid) {
    const urow = await env.TENGSL.prepare('SELECT tier, tier_until, is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    const now = Math.floor(Date.now() / 1000);
    entitled = !!(urow && (urow.is_admin || (urow.tier && urow.tier_until > now)));
  }
  const cacheKey = new Request('https://cache.karp.internal/api/topplistar?g=' + grein + '&r=' + radadKey + '&e=' + (entitled ? 1 : 0));
  const cache = caches.default;
  const hit = await cache.match(cacheKey); if (hit) return hit;
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
  const res = new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=21600' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ── 🪑 Tengslanet (F10): fyrirsvarsmenn þvert á félög eignarhaldsnetsins ─────────────────────
// GET /api/tengslanet?kt= → { stjornendur: [rótarfyrirsvar + hlutverk í öðrum net-félögum],
// krossar: [fólk í ≥2 net-félögum án hlutverks í rót] }. Félagamengið = rót + félags-hnútar úr
// UBO-trénu (gogn/eigendur/<kt>.json), þak 12 (mælt API). Samsvörun með einstaklings-kt SERVER-HLIÐ;
// út fara AÐEINS nöfn + hlutverk + félags-kt (aldrei kt einstaklinga). Endurskoðendur/stofnendur/
// látnir síaðir frá (suð, sögulegt).
async function tengslanetHandler(request, env, ctx) {
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

// ══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE-NATIVE AUÐKENNING (F2) — leysir WordPress/wp.karp.is af hólmi.
// Notendur/réttindi í D1 (env.TENGSL); lotur = undirritaðar HttpOnly-kökur (SESSION_SECRET).
// F1: lykilorðs-auth ÁN póst-staðfestingar (email_verified=1 við nýskráningu). F5 bætir póst-verify.
// ══════════════════════════════════════════════════════════════════════════
const _te = new TextEncoder();
const _b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 100000;
  const key = await crypto.subtle.importKey('raw', _te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iter}$${_b64u(salt)}$${_b64u(bits)}`;
}
async function verifyPassword(pw, stored) {
  try {
    const [alg, iterS, saltS, hashS] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', _te.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: _fromB64(saltS), iterations: +iterS, hash: 'SHA-256' }, key, 256);
    return _b64u(bits) === hashS;
  } catch (e) { return false; }
}
async function _hmac(env, msg) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET missing');   // fail-closed: ekkert giskanlegt fallback (annars mætti falsa lotu-köku)
  const key = await crypto.subtle.importKey('raw', _te.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return _b64u(await crypto.subtle.sign('HMAC', key, _te.encode(msg)));
}
async function makeSession(env, uid) {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 60 * 86400);   // 60 daga gildi
  return body + '.' + await _hmac(env, body);
}
async function readSession(env, request) {
  try {
    const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)karp_session=([^;]+)/);
    if (!m) return 0;
    const [uid, exp, sig] = decodeURIComponent(m[1]).split('.');
    if (!uid || !exp || !sig || +exp < Math.floor(Date.now() / 1000)) return 0;
    if (await _hmac(env, uid + '.' + exp) !== sig) return 0;
    return +uid;
  } catch (e) { return 0; }   // t.d. SESSION_SECRET vantar → engin lota (fail-closed)
}
const _sessCookie = (val, maxAge) => `karp_session=${encodeURIComponent(val)}; Domain=.karp.is; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const _ajson = (obj, extra = {}) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json', ...extra } });
// D1 notandi → KARP_USER-lögun (sama snið og WP /me skilaði svo auth.js þurfi engar breytingar á lögun).
function userPayload(u) {
  const base = { loginUrl: 'https://karp.is/innskra/', registerUrl: 'https://karp.is/nyskraning/', paywall: false };
  if (!u) return { loggedIn: false, ...base };
  const now = Math.floor(Date.now() / 1000);
  const tierActive = !!(u.tier && u.tier_until && u.tier_until > now);
  return {
    loggedIn: true, id: u.id, email: u.email, name: u.name || u.username || u.email,
    isAdmin: u.is_admin === 1, plus: u.is_admin === 1 || tierActive,   // (F4 gerir nákvæmt: þrep + þjónustur + kvóti)
    tier: tierActive ? u.tier : null, effectiveTier: tierActive ? u.tier : null,
    emailVerified: u.email_verified === 1, kt: u.kt || null, ...base,
  };
}
const REPORT_QUOTA = { grunnur: 4, fyrirtaeki: 10, fyrirtaeki_plus: 20 };   // stakar skýrslur/mán per þrep
async function authMeHandler(request, env) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return _ajson(userPayload(null));
  const u = await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(uid).first().catch(() => null);
  if (!u) return _ajson(userPayload(null));
  const p = userPayload(u);
  const now = Math.floor(Date.now() / 1000);
  // F4: réttindi úr D1 — virkar þjónustu-áskriftir + keyptar skýrslur + skýrslu-kvóti mánaðarins.
  const subsR = await env.TENGSL.prepare('SELECT service FROM sub_service WHERE user_id=? AND until>?').bind(uid, now).all().catch(() => ({ results: [] }));
  const repsR = await env.TENGSL.prepare('SELECT report_key FROM reports_granted WHERE user_id=?').bind(uid).all().catch(() => ({ results: [] }));
  p.subs = (subsR.results || []).map((r) => r.service);
  p.reports = (repsR.results || []).map((r) => r.report_key);
  const ym = new Date(now * 1000).toISOString().slice(0, 7);
  const used = (u.reports_month === ym) ? (u.reports_used || 0) : 0;
  const quota = u.is_admin === 1 ? 9999 : (p.tier ? (REPORT_QUOTA[p.tier] || 0) : 0);
  p.reportsRemaining = Math.max(0, quota - used);
  p.plus = p.plus || p.subs.length > 0;   // Karp+ ef þrep EÐA einhver virk þjónustu-áskrift
  // F6: fylgja-listi úr user_prefs (KARP_USER.follows notað víða; followsCount á Mitt svæði).
  p.follows = await _prefGet(env, uid, 'follows', []);
  p.followsCount = p.follows.length;
  return _ajson(p);
}
async function authRegisterHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const username = String(b.username || '').trim().slice(0, 60) || null;
  const pw = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return _ajson({ ok: false, error: 'email' });
  if (pw.length < 8) return _ajson({ ok: false, error: 'weakpass' });
  if (!b.terms) return _ajson({ ok: false, error: 'terms' });
  const dup = await env.TENGSL.prepare('SELECT id FROM users WHERE email=? OR (username IS NOT NULL AND username=?)').bind(email, username).first().catch(() => null);
  if (dup) return _ajson({ ok: false, error: 'exists' });
  const now = Math.floor(Date.now() / 1000);
  const res = await env.TENGSL.prepare('INSERT INTO users (email, username, pass_hash, name, email_verified, terms_accepted, created) VALUES (?,?,?,?,1,?,?)')
    .bind(email, username, await hashPassword(pw), b.name || null, b.terms ? now : null, now).run();
  return _ajson({ ok: true, id: res.meta.last_row_id }, { 'set-cookie': _sessCookie(await makeSession(env, res.meta.last_row_id), 60 * 86400) });
}
async function authLoginHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const login = String(b.login || b.email || '').trim().toLowerCase().slice(0, 120);
  const pw = String(b.password || '');
  if (!login || !pw) return _ajson({ ok: false, error: 'input' });
  const u = await env.TENGSL.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(login, login).first().catch(() => null);
  if (!u || !(await verifyPassword(pw, u.pass_hash))) return _ajson({ ok: false, error: 'invalid' });   // sama villa (engin upptalning)
  if (u.email_verified !== 1) return _ajson({ ok: false, error: 'unverified' });
  return _ajson({ ok: true, id: u.id }, { 'set-cookie': _sessCookie(await makeSession(env, u.id), 60 * 86400) });
}
const authLogoutHandler = () => _ajson({ ok: true }, { 'set-cookie': _sessCookie('', 0) });

// ── F4: Áskell-grant + réttindi í D1 (leysir WP /sub/grant + /reports/grant af hólmi) ──
const _svcOk = (s) => ['utbod', 'frettir', 'fasteign', 'thingskyrslur', 'kvoti'].indexOf(s) >= 0;
const _tierOk = (t) => ['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].indexOf(t) >= 0;
async function _uidByKt(env, kt) {   // kt → user_id (fyrsta/nýjasta samsvörun); 0 ef enginn
  if (!env.TENGSL || !kt || kt.length !== 10) return 0;
  const r = await env.TENGSL.prepare('SELECT id FROM users WHERE kt=? ORDER BY id DESC LIMIT 1').bind(kt).first().catch(() => null);
  return r ? r.id : 0;
}
async function _refSeen(env, ref) {
  if (!ref) return false;
  return !!(await env.TENGSL.prepare('SELECT ref FROM granted_refs WHERE ref=?').bind(ref).first().catch(() => null));
}
// Áskrift (þjónusta eða þrep) → D1. Idempotent á ref. Setur trial_used (prufuvörn).
async function grantSubD1(env, o) {
  if (!env.TENGSL) return;
  if (await _refSeen(env, o.ref)) return;
  const uid = await _uidByKt(env, o.kt);
  if (!uid) return;   // enginn notandi með þessa kt enn (kt sett í checkout → webhook finnur svo)
  const now = Math.floor(Date.now() / 1000);
  if (o.service && _svcOk(o.service)) {
    await env.TENGSL.prepare('INSERT INTO sub_service (user_id, service, until, askell_id, trial_used) VALUES (?,?,?,?,1) ON CONFLICT(user_id, service) DO UPDATE SET until=excluded.until, askell_id=excluded.askell_id, trial_used=1')
      .bind(uid, o.service, o.until, o.askellId || null).run().catch(() => {});
  } else if (o.tier && _tierOk(o.tier)) {
    await env.TENGSL.prepare('UPDATE users SET tier=?, tier_until=?, tier_askell=?, tier_trial_used=1, updated=? WHERE id=?')
      .bind(o.tier, o.until, o.askellId || null, now, uid).run().catch(() => {});
  }
  if (o.ref) await env.TENGSL.prepare('INSERT OR IGNORE INTO granted_refs (ref, created) VALUES (?,?)').bind(o.ref, now).run().catch(() => {});
}
// Stök skýrsla → D1 (varanlegt grant, idempotent á user+key).
async function grantReportD1(env, kt, key) {
  const uid = await _uidByKt(env, kt);
  if (!uid) return;
  await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id, report_key, granted) VALUES (?,?,?)')
    .bind(uid, key, Math.floor(Date.now() / 1000)).run().catch(() => {});
}
// Prufuvörn úr D1 (leysir WP /sub/trialstatus af hólmi).
async function trialUsedD1(env, uid, kind, slug) {
  if (!env.TENGSL || !uid) return false;
  if (kind === 'tier') {
    const r = await env.TENGSL.prepare('SELECT tier_trial_used FROM users WHERE id=?').bind(uid).first().catch(() => null);
    return !!(r && r.tier_trial_used);
  }
  const r = await env.TENGSL.prepare('SELECT trial_used FROM sub_service WHERE user_id=? AND service=?').bind(uid, slug).first().catch(() => null);
  return !!(r && r.trial_used);
}
// F4: vista kt á innskráðan notanda (bindur Áskell customer_reference → webhook finnur notanda).
// Leysir WP /sub/subscribe (sem vistaði karp_kt) af hólmi. Framendinn kallar á undan checkout.
async function authSaveKtHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const uid = await readSession(env, request);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const b = (await request.json().catch(() => null)) || {};
  const kt = String(b.kt || '').replace(/\D/g, '');
  if (kt.length !== 10) return _ajson({ ok: false, error: 'input' });
  await env.TENGSL.prepare('UPDATE users SET kt=?, updated=? WHERE id=?').bind(kt, Math.floor(Date.now() / 1000), uid).run().catch(() => {});
  return _ajson({ ok: true });
}

// ══════════════════════════════════════════════════════════════════════════
// F5: TÖLVUPÓSTUR gegnum Gmail REST API (OAuth refresh-token) — leysir WP wp_mail af hólmi.
// Secret-gated: án GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN skilar sendGmail {unconfigured:true}
// og kallendur falla mjúkt. Notað fyrir: gleymt-lykilorð (/api/auth/forgot+reset) og /api/hjalp.
// ══════════════════════════════════════════════════════════════════════════
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _tokenHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
const _b64std = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));   // stöðluð base64 (encoded-word/MIME-body)
async function _gmailToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
  }).catch(() => null);
  const d = r && (await r.json().catch(() => null));
  return (d && d.access_token) || null;
}
async function sendGmail(env, { to, subject, html, text, replyTo, inReplyTo }) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) return { ok: false, unconfigured: true };
  const tok = await _gmailToken(env);
  if (!tok) return { ok: false, error: 'token' };
  const from = env.GMAIL_FROM || 'Karp <hjalp@karp.is>';
  const bodyHtml = html || (text != null ? _esc(text).replace(/\n/g, '<br>') : '');
  const lines = ['From: ' + from, 'To: ' + to];
  if (replyTo) lines.push('Reply-To: ' + replyTo);
  if (inReplyTo) { lines.push('In-Reply-To: ' + inReplyTo); lines.push('References: ' + inReplyTo); }   // þráður (hjalp-svör)
  lines.push(
    'Subject: =?UTF-8?B?' + _b64std(_te.encode(subject)) + '?=',
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    _b64std(_te.encode(bodyHtml)).replace(/(.{76})/g, '$1\r\n'),
  );
  const raw = _b64u(_te.encode(lines.join('\r\n')));
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ raw }),
  }).catch(() => null);
  return (r && r.ok) ? { ok: true } : { ok: false, error: 'send', status: r ? r.status : 0 };
}
// Gleymt lykilorð — biður um endurstillingar-hlekk. Alltaf {ok:true} (engin notenda-upptalning).
async function authForgotHandler(request, env, ctx) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: true });
  const b = (await request.json().catch(() => null)) || {};
  const login = String(b.login || b.email || '').trim().toLowerCase().slice(0, 120);
  if (!login) return _ajson({ ok: true });
  const u = await env.TENGSL.prepare('SELECT id, email FROM users WHERE email=? OR username=?').bind(login, login).first().catch(() => null);
  if (u) {
    const now = Math.floor(Date.now() / 1000);
    const token = _tokenHex();
    await env.TENGSL.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires) VALUES (?,?,?,?)').bind(token, u.id, 'reset', now + 3600).run().catch(() => {});
    const link = 'https://karp.is/endurstilla/?token=' + token;
    const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;color:#222"><h2 style="color:#8a5e00;margin:0 0 12px">Endurstilla lykilorð</h2><p>Þú (eða einhver) baðst um að endurstilla lykilorðið á Karp-aðgangi þínum.</p><p style="margin:22px 0"><a href="' + link + '" style="background:#8a5e00;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Velja nýtt lykilorð</a></p><p style="color:#666;font-size:13px">Hlekkurinn gildir í eina klukkustund. Baðstu ekki um þetta? Hunsaðu póstinn — lykilorðið breytist ekki.</p><p style="color:#999;font-size:12px;margin-top:24px">karp.is</p></div>';
    ctx.waitUntil(sendGmail(env, { to: u.email, subject: 'Endurstilla lykilorð á Karp', html }));
  }
  return _ajson({ ok: true });
}
// Setur nýtt lykilorð úr endurstillingar-tóken → skráir inn (staðfestir netfang um leið).
async function authResetHandler(request, env) {
  if (request.method !== 'POST' || !env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const b = (await request.json().catch(() => null)) || {};
  const token = String(b.token || '').trim().slice(0, 80);
  const pw = String(b.password || '');
  if (!token) return _ajson({ ok: false, error: 'badtoken' });
  if (pw.length < 8) return _ajson({ ok: false, error: 'weakpass' });
  const now = Math.floor(Date.now() / 1000);
  const t = await env.TENGSL.prepare("SELECT token, user_id FROM auth_tokens WHERE token=? AND kind='reset' AND expires>?").bind(token, now).first().catch(() => null);
  if (!t) return _ajson({ ok: false, error: 'badtoken' });
  await env.TENGSL.prepare('UPDATE users SET pass_hash=?, email_verified=1, updated=? WHERE id=?').bind(await hashPassword(pw), now, t.user_id).run().catch(() => {});
  await env.TENGSL.prepare('DELETE FROM auth_tokens WHERE token=?').bind(token).run().catch(() => {});
  return _ajson({ ok: true, id: t.user_id }, { 'set-cookie': _sessCookie(await makeSession(env, t.user_id), 60 * 86400) });
}

// ══════════════════════════════════════════════════════════════════════════
// F6: PERÍFERU NOTENDA-GÖGN — allt undir /api/u/* (leysir WP user-meta af hólmi).
// Vakt-/stillinga-blobbar → user_prefs; kvóti → users.reports_used + sub_service.used;
// samfélag (atkvæði/spár/kannanir) → deildar töflur með aggregate. KARP_API=/api/u í framhlið.
// ══════════════════════════════════════════════════════════════════════════
const _U_BLOBS = ['leitvakt', 'fastvakt', 'firmavakt', 'utbodvakt', 'verkprofil', 'digest', 'vaktir'];
const _monthStr = (now) => new Date(now * 1000).toISOString().slice(0, 7);
const _nextMonth = (now) => { const d = new Date(now * 1000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000); };
const _uTier = (u, now) => (u.tier && u.tier_until && u.tier_until > now) ? u.tier : null;
const _ktwatchCap = (u, now) => u.is_admin === 1 ? -1 : ({ fyrirtaeki: 25, fyrirtaeki_plus: 100 }[_uTier(u, now)] || 0);
const _seatsCap = (u, now) => u.is_admin === 1 ? -1 : ({ fyrirtaeki: 5, fyrirtaeki_plus: 10 }[_uTier(u, now)] || 1);
async function _prefGet(env, uid, k, dflt) {
  if (!uid) return dflt;
  const r = await env.TENGSL.prepare('SELECT v FROM user_prefs WHERE user_id=? AND k=?').bind(uid, k).first().catch(() => null);
  if (!r) return dflt;
  try { return JSON.parse(r.v); } catch (e) { return dflt; }
}
async function _prefSet(env, uid, k, obj) {
  await env.TENGSL.prepare('INSERT INTO user_prefs (user_id,k,v,updated) VALUES (?,?,?,?) ON CONFLICT(user_id,k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
    .bind(uid, k, JSON.stringify(obj), Math.floor(Date.now() / 1000)).run().catch(() => {});
}
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

  // ── Blobb-endapunktar (geymdu-og-echo) ──
  const bk = path.slice(1);
  if (_U_BLOBS.indexOf(bk) >= 0) {
    if (method === 'POST') { await _prefSet(env, uid, bk, body); return _ajson(Object.assign({ ok: true }, body)); }
    return _ajson(await _prefGet(env, uid, bk, {}));
  }

  // ── Fylgja (array-blobb; birtist líka í /me.follows) ──
  if (path === '/follows' && method === 'POST') {
    const f = Array.isArray(body.follows) ? body.follows.map((x) => String(x)).slice(0, 500) : [];
    await _prefSet(env, uid, 'follows', f);
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
    const r = await env.TENGSL.prepare('SELECT report_key FROM reports_granted WHERE user_id=?').bind(uid).all().catch(() => ({ results: [] }));
    return _ajson({ reports: (r.results || []).map((x) => x.report_key) });
  }

  // ── Skýrslu-kvóti þreps: /reports/open ──
  if (path === '/reports/open' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    if (u.is_admin === 1) return _ajson({ owned: true });
    if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(uid, key).first().catch(() => null)) return _ajson({ owned: true });
    const quota = REPORT_QUOTA[_uTier(u, now)] || 0;
    const used = (u.reports_month === _monthStr(now)) ? (u.reports_used || 0) : 0;
    if (quota > 0 && used < quota) {
      await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id,report_key,granted) VALUES (?,?,?)').bind(uid, key, now).run().catch(() => {});
      await env.TENGSL.prepare('UPDATE users SET reports_used=?, reports_month=?, updated=? WHERE id=?').bind(used + 1, _monthStr(now), now, uid).run().catch(() => {});
      return _ajson({ granted: true, remaining: quota - used - 1 });
    }
    return _ajson({ needPay: true });
  }

  // ── Þingmannaskýrslu-kvóti (thingskyrslur-áskrift, 20/mán): /thing/open ──
  if (path === '/thing/open' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    if (u.is_admin === 1) return _ajson({ owned: true });
    if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(uid, key).first().catch(() => null)) return _ajson({ owned: true });
    const s = await env.TENGSL.prepare('SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?').bind(uid, 'thingskyrslur', now).first().catch(() => null);
    if (!s) return _ajson({ error: 'nosub' });
    const used = (s.used_month === _monthStr(now)) ? (s.used || 0) : 0;
    if (used < 20) {
      await env.TENGSL.prepare('INSERT OR IGNORE INTO reports_granted (user_id,report_key,granted) VALUES (?,?,?)').bind(uid, key, now).run().catch(() => {});
      await env.TENGSL.prepare('UPDATE sub_service SET used=?, used_month=? WHERE user_id=? AND service=?').bind(used + 1, _monthStr(now), uid, 'thingskyrslur').run().catch(() => {});
      return _ajson({ granted: true, remaining: 20 - used - 1 });
    }
    return _ajson({ needPay: true, resets: _nextMonth(now) });
  }

  // ── Fasteignamats-kvóti (fasteign-áskrift, 20/mán; endurmat sama fangs frítt): /fasteign/meta ──
  if (path === '/fasteign/meta' && method === 'POST') {
    const key = String(body.key || ''); if (!key) return _ajson({ error: true });
    const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ error: true });
    const done = await _prefGet(env, uid, 'fasteign_done', []);
    if (u.is_admin === 1) { if (done.indexOf(key) < 0) { done.push(key); await _prefSet(env, uid, 'fasteign_done', done); } return _ajson({ granted: true, owned: false, remaining: -1 }); }
    const s = await env.TENGSL.prepare('SELECT * FROM sub_service WHERE user_id=? AND service=? AND until>?').bind(uid, 'fasteign', now).first().catch(() => null);
    const used = (s && s.used_month === _monthStr(now)) ? (s.used || 0) : 0;
    if (done.indexOf(key) >= 0) return _ajson({ granted: true, owned: true, remaining: s ? Math.max(0, 20 - used) : 0 });
    if (!s) return _ajson({ error: 'nosub' });
    if (used < 20) {
      done.push(key); await _prefSet(env, uid, 'fasteign_done', done);
      await env.TENGSL.prepare('UPDATE sub_service SET used=?, used_month=? WHERE user_id=? AND service=?').bind(used + 1, _monthStr(now), uid, 'fasteign').run().catch(() => {});
      return _ajson({ granted: true, owned: false, remaining: 20 - used - 1 });
    }
    return _ajson({ needPay: true, resets: _nextMonth(now) });
  }

  // ── Viðskiptamannavakt (kt-listi) + Teymi (sæti) ──
  if (path === '/ktwatch') {
    const u = uid ? await env.TENGSL.prepare('SELECT is_admin, tier, tier_until FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const cap = u ? _ktwatchCap(u, now) : 0;
    let list = await _prefGet(env, uid, 'ktwatch', []);
    if (method === 'POST') {
      const kt = String(body.kt || '').replace(/\D/g, '');
      if (kt.length === 10) {
        if (body.action === 'remove') list = list.filter((x) => x !== kt);
        else if (list.indexOf(kt) < 0) { if (cap >= 0 && list.length >= cap) return _ajson({ ok: false, error: 'cap', kt: list, cap }); list.push(kt); }
        await _prefSet(env, uid, 'ktwatch', list);
      }
      return _ajson({ ok: true, kt: list, cap });
    }
    return _ajson({ kt: list, cap });
  }
  if (path === '/team') {
    const u = uid ? await env.TENGSL.prepare('SELECT is_admin, tier, tier_until FROM users WHERE id=?').bind(uid).first().catch(() => null) : null;
    const cap = u ? _seatsCap(u, now) : 1;
    let members = await _prefGet(env, uid, 'team', []);
    if (method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (body.action === 'remove') members = members.filter((x) => x !== email);
        else if (members.indexOf(email) < 0) { if (cap >= 0 && members.length >= cap) return _ajson({ ok: false, error: 'cap', members, cap }); members.push(email); }
        await _prefSet(env, uid, 'team', members);
      }
      return _ajson({ ok: true, members, cap });
    }
    return _ajson({ members, cap });
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
async function _dget(env, path) {
  try {
    const req = new Request('https://karp.is' + path);
    const r = (env && env.ASSETS) ? await env.ASSETS.fetch(req) : await fetch(req);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
// Íslenskir fjölmiðla-RSS (port úr karp-frettir.php) — fullt fréttasafn f. digest-orðaleit.
const NEWS_FEEDS = [
  ['https://www.mbl.is/feeds/fp/', 'mbl.is'], ['https://www.mbl.is/feeds/innlent/', 'mbl.is'], ['https://www.mbl.is/feeds/vidskipti/', 'mbl.is'],
  ['https://www.ruv.is/rss/frettir', 'RÚV'], ['https://www.ruv.is/rss/innlent', 'RÚV'],
  ['https://www.visir.is/rss/frettir', 'Vísir'], ['https://www.visir.is/rss/vidskipti', 'Vísir'],
  ['https://heimildin.is/rss/', 'Heimildin'], ['https://vb.is/rss/', 'Viðskiptablaðið'],
];
const _cdata = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
function _rssItems(xml, source) {
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
async function fetchNews() {
  const wkDate = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const lists = await Promise.all(NEWS_FEEDS.map(async ([u, src]) => {
    try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (KarpBot; +https://karp.is)' }, cf: { cacheTtl: 900 } }); return r.ok ? _rssItems(await r.text(), src) : []; } catch (e) { return []; }
  }));
  const seen = new Set(), out = [];
  for (const arr of lists) for (const it of arr) { if (it.date && it.date < wkDate) continue; const k = it.title.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
}
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
  const ord = (prefs.leitvakt && Array.isArray(prefs.leitvakt.ord)) ? prefs.leitvakt.ord : [];
  if (ord.length) {
    let sec = '';
    for (const w of ord.slice(0, 12)) { const hit = _newsHits(sh.news, w, 3); if (!hit.n) continue; sec += li('„' + w + '" — ' + hit.n + ' ' + (hit.n === 1 ? 'frétt' : 'fréttir') + ' í vikunni', '', 'https://karp.is/frettir/'); for (const r of hit.rows) sec += li('· ' + r.title.slice(0, 90), r.source || '', _u(r.url)); }
    if (sec) { rows += H('🔎', 'Leitarorðin þín í fréttum vikunnar') + sec; personal = true; }
  }
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
  if (!personal && !sh.tolur.length) return '';
  if (!personal) rows += '<tr><td style="padding:14px 20px;color:#8a93a8;font-size:13px;line-height:1.6">Engin persónuleg treff í vikunni — settu upp <a href="https://karp.is/vaktir/" style="color:#f6b13b">leitarorða-, útboðs- eða fasteignavakt</a> eða fylgstu með fyrirtækjum og þingmönnum til að fá vikuna þína hér.</td></tr>';
  const nm = name ? _esc(name) : '';
  return '<div style="background:#0a0e14;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0e1420;border:1px solid #1d2733;border-radius:16px;overflow:hidden"><div style="padding:22px 24px 8px"><div style="color:#f6b13b;font-weight:800;font-size:13px;letter-spacing:1px">🐟 KARP VIKUYFIRLIT</div><div style="color:#eaf1fb;font-size:21px;font-weight:800;margin-top:6px">' + (nm ? 'Vikan þín, ' + nm : 'Vikan þín á Karp') + '</div><div style="color:#8a93a8;font-size:13.5px;margin-top:4px">Það sem gerðist í vikunni á vöktunum þínum og hjá þeim sem þú fylgist með.</div></div><table style="width:100%;border-collapse:collapse;margin-top:6px">' + rows + '</table><div style="padding:18px 24px 24px"><a href="https://karp.is/mitt-svaedi/" style="display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">Opna Mitt svæði →</a><div style="color:#5c6678;font-size:12px;margin-top:18px;line-height:1.5">Þú færð þennan póst því vikuyfirlitið er virkt á aðganginum þínum. Slökktu á <a href="https://karp.is/vaktir/" style="color:#8a93a8">karp.is/vaktir</a> — „📬 Vikuyfirlitið".</div></div></div></div>';
}
async function digestRun(env) {
  if (!env.TENGSL) return { sent: 0, reason: 'no-d1' };
  const rows = await env.TENGSL.prepare("SELECT DISTINCT p.user_id AS uid, u.email, u.name FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='digest' AND p.v LIKE '%\"on\":true%'").all().catch(() => ({ results: [] }));
  const users = rows.results || [];
  if (!users.length) return { sent: 0, users: 0 };
  const sh = await digestShared(env);
  let sent = 0, built = 0, gmail = null;
  for (const u of users) {
    if (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) continue;
    const pr = {};
    const pres = await env.TENGSL.prepare("SELECT k, v FROM user_prefs WHERE user_id=? AND k IN ('leitvakt','follows','fastvakt','utbodvakt','firmavakt')").bind(u.uid).all().catch(() => ({ results: [] }));
    for (const row of (pres.results || [])) { try { pr[row.k] = JSON.parse(row.v); } catch (e) {} }
    const html = digestBuild(u.name, pr, sh);
    if (!html) continue;
    built++;
    const r = await sendGmail(env, { to: u.email, subject: '🐟 Vikuyfirlitið þitt á Karp', html });
    gmail = r;
    if (r && r.ok) sent++;
  }
  return { sent, users: users.length, built, tolur: sh.tolur.length, news: sh.news.length, gmail };
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
const _fjson = (o, ttl) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=' + (ttl || 600) } });
// Frétta-safn: cron les RSS → D1 (dedup á slóð), grisjar > 90 daga.
async function newsIngest(env) {
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
async function newsSince(env, days, limit) {
  if (!env.TENGSL) return [];
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const r = await env.TENGSL.prepare('SELECT title, url, source, ts, body FROM news WHERE ts>=? ORDER BY ts DESC LIMIT ?').bind(since, Math.min(limit || 60, 2000)).all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => ({ title: x.title, url: x.url, source: x.source, date: new Date(x.ts * 1000).toISOString().slice(0, 10), ts: x.ts, body: x.body || x.title }));
}
// SQL-leit í öllu safninu (51k+) eftir orðum — pushar síuna á D1 svo greiningar noti heilt ár.
// SQLite LIKE case-fold-ar aðeins ASCII → leitum bæði lágstöfum OG hástafs-fyrsta (nær ísl. Íslandsbanki/Össur).
// + ÍSLENSK BEYGING: fyrir einyrt, nógu-langt nafn bætum við ORÐAMÖRKUÐUM stofni (bil-á-undan '% stofn' EÐA
// texta-byrjun 'stofn%') svo beygðar myndir finnist (Landsbankinn/Landsbankans/Landsbankanum/Landsbanka → 'landsbank').
// Orðamörkin verja gegn samsetningar-árekstri: '% landsbank' passar EKKI 'Íslandsbanka'. Grunnmyndin er höfð áfram
// óbreytt (ber '%nafn%') svo ekkert recall tapist fyrir óbeygjanleg/stutt nöfn (Marel, Icelandair, Össur).
const _ISUF = ['innar', 'arnir', 'irnir', 'inum', 'anum', 'anna', 'unum', 'inni', 'ana', 'ins', 'ans', 'nir', 'nar', 'num', 'inn', 'in', 'ið', 'ur', 'ns', 'na', 'um', 's', 'i', 'a'];
function _isStem(lc) { if (/\s/.test(lc) || lc.length < 7) return null; for (const suf of _ISUF) { if (lc.endsWith(suf) && lc.length - suf.length >= 5) return lc.slice(0, -suf.length); } return null; }
function _searchVariants(t) {
  const lc = String(t).toLowerCase().trim();
  if (lc.length < 3) return [];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pats = new Set(['%' + lc + '%']);                 // grunnmynd hvar sem er
  if (cap(lc) !== lc) pats.add('%' + cap(lc) + '%');       // ísl. upphafsstafur (Í/Ö/Þ/Æ)
  const st = _isStem(lc);
  if (st && st.length >= 5 && st !== lc) for (const s of (cap(st) !== st ? [st, cap(st)] : [st])) { pats.add('% ' + s + '%'); pats.add(s + '%'); }
  return [...pats];
}
// JS-hliðstæða _searchVariants fyrir per-grein eigna-mörkun (firmagraph/agenda co-occurrence): grunnmynd (includes)
// EÐA orðamarkaður stofn (byrjun eða bil-á-undan) — sama orðamörk og SQL svo 'landsbank' passi ekki 'íslandsbanka'.
function _mentions(hay, al) {
  for (const a of al) {
    if (hay.includes(a)) return true;
    const st = _isStem(a);
    if (st && st.length >= 5) { let i = hay.indexOf(st); while (i >= 0) { if (i === 0 || hay[i - 1] === ' ') return true; i = hay.indexOf(st, i + 1); } }
  }
  return false;
}
async function newsSearch(env, terms, days, limit) {
  if (!env.TENGSL || !terms || !terms.length) return [];
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const vars = [...new Set(terms.flatMap(_searchVariants))].slice(0, 60);
  if (!vars.length) return [];
  const clauses = vars.map(() => 'body LIKE ?').join(' OR ');
  const r = await env.TENGSL.prepare('SELECT title, url, source, ts, body FROM news WHERE ts>=? AND (' + clauses + ') ORDER BY ts DESC LIMIT ?')
    .bind(since, ...vars, Math.min(limit || 500, 4000)).all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => ({ title: x.title, url: x.url, source: x.source, date: new Date(x.ts * 1000).toISOString().slice(0, 10), ts: x.ts, body: x.body || x.title }));
}
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
const _SENT_POS = ['vöxt', 'hagnað', 'aukning', 'aukn', 'sterk', 'jákvæð', 'styrk', 'samning', 'fjárfest', 'útrás', 'stækk', 'bætir', 'árangur', 'verðlaun', 'vinnur', 'ágóð', 'uppgang', 'kaupir', 'nýr samningur'];
const _SENT_NEG = ['tap', 'gjaldþrot', 'uppsögn', 'uppsagn', 'samdrátt', 'lækk', 'veik', 'neikvæð', 'vandræð', 'sekt', 'deila', 'rannsókn', 'kæra', 'svik', 'lokun', 'rift', 'vanskil', 'tjón', 'mistök', 'gagnrýn', 'afskrá'];
function _tone(title) { const t = String(title).toLowerCase(); let p = 0, n = 0; for (const w of _SENT_POS) if (t.includes(w)) p++; for (const w of _SENT_NEG) if (t.includes(w)) n++; return p - n; }
// /api/firma?q=nafn[,samheiti]&days= → { ready, total, items, timeline:[{d,n,idx}], sentiment:{idx,scored,pos,neg} }
async function firmaHandler(request, env) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim();
  const days = Math.min(+(url.searchParams.get('days') || 365) || 365, 365);
  if (q.length < 3) return _fjson({ ready: true, total: 0, items: [], timeline: [], sentiment: {} }, 300);
  const terms = q.split(',').map((s) => s.trim()).filter((s) => s.length >= 3);
  const items = await newsSearch(env, terms, days, 800);   // SQL-leit í öllu safninu (heilt ár)
  let pos = 0, neg = 0;
  for (const it of items) { it._t = _tone(it.title); if (it._t > 0) pos++; else if (it._t < 0) neg++; }
  const scored = items.length > 0;
  const idx = scored ? Math.max(-100, Math.min(100, Math.round((pos - neg) / items.length * 100))) : 0;
  const wk = {};
  for (const it of items) { const d = new Date(it.ts * 1000); const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const key = mon.toISOString().slice(0, 10); const b = (wk[key] = wk[key] || { d: key, n: 0, tone: 0 }); b.n++; b.tone += it._t || 0; }
  const timeline = Object.values(wk).sort((a, b) => a.d < b.d ? -1 : 1).map((w) => ({ d: w.d, n: w.n, idx: w.n ? Math.round(w.tone / w.n * 20) : 0 }));
  return _fjson({ ready: true, total: items.length, items: items.slice(0, 20).map((n) => ({ title: n.title, link: n.url, source: n.source, date: n.date })), timeline, sentiment: { idx, scored, pos, neg } }, 300);
}
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
async function _isAdmin(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}
async function adminOverviewHandler(request, env) {
  // Aðgangur: annaðhvort innskráður admin (vafri) EÐA X-Admin-Key leyndarmál (Node-stjórnborð, server-til-server).
  const key = request.headers.get('X-Admin-Key');
  const bySecret = key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY;
  if (!bySecret && !(await _isAdmin(env, request))) return _ajson({ ok: false, error: 'admin' });
  const now = Math.floor(Date.now() / 1000);
  const users = (await env.TENGSL.prepare('SELECT id,email,username,name,is_admin,email_verified,kt,tier,tier_until,created FROM users ORDER BY created DESC LIMIT 1000').all().catch(() => ({ results: [] }))).results || [];
  const subs = (await env.TENGSL.prepare('SELECT user_id,service,until,askell_id FROM sub_service WHERE until>?').bind(now).all().catch(() => ({ results: [] }))).results || [];
  const reps = (await env.TENGSL.prepare('SELECT user_id,report_key,granted FROM reports_granted').all().catch(() => ({ results: [] }))).results || [];
  const subByUser = {}, repByUser = {};
  for (const s of subs) (subByUser[s.user_id] = subByUser[s.user_id] || []).push(s.service);
  for (const r of reps) repByUser[r.user_id] = (repByUser[r.user_id] || 0) + 1;
  const uList = users.map((u) => ({ id: u.id, email: u.email, name: u.name || u.username || '', admin: u.is_admin === 1, verified: u.email_verified === 1, kt: u.kt || null, tier: (u.tier && u.tier_until > now) ? u.tier : null, subs: subByUser[u.id] || [], reports: repByUser[u.id] || 0, created: u.created }));
  const byService = {}; for (const s of subs) byService[s.service] = (byService[s.service] || 0) + 1;
  const byReport = {}; for (const r of reps) { const t = String(r.report_key).split(':')[0]; byReport[t] = (byReport[t] || 0) + 1; }
  const day = 86400, recent = (n) => users.filter((u) => u.created > now - n * day).length;
  // Tekjur (áætlaðar): virkar þjónustu-áskriftir + þrep (mán) + keyptar skýrslur (einskiptis 990).
  const PRICE_SVC = { kvoti: 9900, utbod: 1900, frettir: 3900, fasteign: 3900, thingskyrslur: 3900 };
  const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
  let mrr = 0;
  for (const s of subs) mrr += PRICE_SVC[s.service] || 0;
  for (const u of uList) if (u.tier) mrr += PRICE_TIER[u.tier] || 0;
  // Virkni: notendur með einhverja vakt / digest á (úr user_prefs).
  const watchRows = (await env.TENGSL.prepare("SELECT DISTINCT user_id FROM user_prefs WHERE k IN ('leitvakt','firmavakt','fastvakt','follows','ktwatch')").all().catch(() => ({ results: [] }))).results || [];
  const digestRows = (await env.TENGSL.prepare("SELECT user_id FROM user_prefs WHERE k='digest' AND v LIKE '%\"on\":true%'").all().catch(() => ({ results: [] }))).results || [];
  // Nýleg umsvif: síðustu skýrslukaup (með netfangi).
  const recentReps = (await env.TENGSL.prepare('SELECT rg.report_key, rg.granted, u.email FROM reports_granted rg LEFT JOIN users u ON u.id=rg.user_id ORDER BY rg.granted DESC LIMIT 12').all().catch(() => ({ results: [] }))).results || [];
  // S2b: rekstrar-samantekt Node-stjórnborðsins (samþykktir/tickets/herferðir/ledger) ef ýtt hefur verið.
  const syncRow = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='summary'").first().catch(() => null);
  let stjorn = null; if (syncRow) { try { stjorn = Object.assign(JSON.parse(syncRow.v), { syncedAt: syncRow.updated }); } catch (e) {} }
  return _ajson({
    stjorn,
    ok: true, now,
    users: uList,
    stats: {
      total: users.length, verified: users.filter((u) => u.email_verified === 1).length, admins: users.filter((u) => u.is_admin === 1).length,
      new7: recent(7), new30: recent(30),
      tierUsers: uList.filter((u) => u.tier).length, activeSubs: subs.length, subsByService: byService,
      reportsTotal: reps.length, reportsByType: byReport,
      mrr, reportRevenue: reps.length * 990,
      watchers: watchRows.length, digestSubs: digestRows.length,
    },
    recentReports: recentReps.map((r) => ({ key: r.report_key, email: r.email || '', granted: r.granted })),
  });
}
// Póstsending fyrir Node-stjórnborðið gegnum worker Gmail REST (S4 — sameinar á OAuth, ekkert app-lykilorð).
// Aðgangur: X-Admin-Key EÐA innskráður admin. Body: {to, subject, html|text, replyTo?, inReplyTo?}.
async function adminSendHandler(request, env) {
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
// S2b: Node-stjórnborðið ýtir rekstrar-samantekt í D1 (X-Admin-Key). Body: {k, v}. GET les.
async function adminSyncHandler(request, env) {
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

export default {
  // Cron: viku-digest (mánud. 08:10) + frétta-innlestur í D1-safn (á 3 klst fresti).
  async scheduled(event, env, ctx) {
    if (event.cron === '10 8 * * 1') ctx.waitUntil(digestRun(env));
    else ctx.waitUntil(newsIngest(env));   // F7: safnar RSS → news-tafla
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
    if (url.pathname.startsWith('/api/u/')) return userDataHandler(request, env);   // F6: períferu notenda-gögn
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
    if (url.pathname === '/api/villa') return villaHandler(request, ctx);
    if (url.pathname === '/api/domar') return domarHandler(ctx);
    if (url.pathname === '/api/greidslur') return greidslurHandler(ctx);
    if (url.pathname === '/api/spyrdu') return spyrduHandler(request, env, ctx);
    if (url.pathname === '/api/hjalp') return hjalpHandler(request, env, ctx);
    if (url.pathname === '/api/ytstats') return ytstatsHandler(request, env, ctx);
    if (url.pathname === '/api/gleit') return gleitHandler(request, env, ctx);
    if (url.pathname === '/api/tilkynningar') return tilkynningarHandler(request, env, ctx);
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
    if (url.pathname === '/api/askell/config') return askellConfigHandler(request, env);
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
          const gu = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(guid).first().catch(() => null);
          if (gu && gu.is_admin === 1) gok = true;
          else if (await env.TENGSL.prepare('SELECT 1 FROM reports_granted WHERE user_id=? AND report_key=?').bind(guid, gkey).first().catch(() => null)) gok = true;
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
