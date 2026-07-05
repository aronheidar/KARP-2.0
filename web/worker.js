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
async function fyrirtaekiHandler(request, ctx) {
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
  res = new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // LEIÐ A (lénaflutningur): app.karp.is og www.karp.is 301-a á karp.is —
    // SEO-flutningurinn sjálfur. Gamla WP-mælaborðið fær möppun á forsíðuna.
    if (url.hostname === 'app.karp.is' || url.hostname === 'www.karp.is') {
      url.hostname = 'karp.is';
      return Response.redirect(url.toString(), 301);
    }
    if (/^\/hagvisir\/?$/.test(url.pathname)) return Response.redirect('https://karp.is/', 301);
    if (url.pathname === '/api/villa') return villaHandler(request, ctx);
    if (url.pathname === '/api/domar') return domarHandler(ctx);
    if (url.pathname === '/api/greidslur') return greidslurHandler(ctx);
    if (url.pathname === '/api/spyrdu') return spyrduHandler(request, env, ctx);
    if (url.pathname === '/api/ytstats') return ytstatsHandler(request, env, ctx);
    if (url.pathname === '/api/gleit') return gleitHandler(request, env, ctx);
    if (url.pathname === '/api/tilkynningar') return tilkynningarHandler(request, env, ctx);
    if (url.pathname === '/api/fyrirtaeki') return fyrirtaekiHandler(request, ctx);
    if (url.pathname === '/api/vanskil') return vanskilHandler(request, ctx);
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
    return env.ASSETS.fetch(request);
  },
};
