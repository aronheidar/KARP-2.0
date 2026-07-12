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
  try {
    const r = await fetch('https://wp.karp.is/wp-json/karp/v1/hjalp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.KARP_GRANT_SECRET ? { 'X-Karp-Secret': env.KARP_GRANT_SECRET } : {}) },
      body: JSON.stringify({
        nafn, netfang, flokkur, lysing,
        fra: String(b.fra || '').slice(0, 300),
        innskraning: b.innskraning === true,
        ua: String(b.ua || '').slice(0, 300),
        ip,
      }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.ok) return sjson({ ok: true });
    return sjson({ error: (d && d.error) === 'rate' ? 'rate' : 'send' }, 502);
  } catch (e) {
    return sjson({ error: 'send' }, 502);
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
async function karpUserId(request) {
  try {
    const cookie = request.headers.get('Cookie') || '';
    if (!cookie) return 0;
    const r = await fetch('https://wp.karp.is/wp-json/karp/v1/me', { headers: { Cookie: cookie } });
    if (!r.ok) return 0;
    const j = await r.json().catch(() => null);
    return (j && j.loggedIn && +j.id > 0) ? +j.id : 0;
  } catch (e) { return 0; }
}
async function payCheckoutHandler(request, env, ctx) {
  if (request.method !== 'POST') return sjson({ error: 'post' });
  // óuppsett (engin secrets) EÐA öryggisrofi óvirkur → framendi notar ókeypis prentleiðina
  if (!teyaConfigured(env) || env.TEYA_LIVE !== '1') return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request);   // þarf innskráningu svo kaupið vistist á Mitt svæði
  if (!uid) return sjson({ error: 'login' });
  let b = {}; try { b = (await request.json()) || {}; } catch (e) {}
  const kind = ['fyrirtaeki', 'eigendur', 'fasteign'].includes(b.kind) ? b.kind : 'fasteign';
  const ref = String(b.ref || '').slice(0, 80);
  const key = String(b.key || (kind + ':' + ref)).slice(0, 80);
  const price = Math.round(+(kind === 'fyrirtaeki' ? env.PRICE_FYRIRTAEKI : kind === 'eigendur' ? env.PRICE_EIGENDUR : env.PRICE_FASTEIGN) || 990);
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
  const desc = kind === 'fyrirtaeki' ? 'Karp fyrirtaekjaskyrsla' : kind === 'eigendur' ? 'Karp eigendaskyrsla' : 'Karp verdmatsskyrsla';
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
  // ✓ Greiðsla staðfest → skrá entitlement í WP (server-til-server m/ sameiginlegu leyndarmáli).
  const uid = u.searchParams.get('u') || '';
  const key = u.searchParams.get('k') || '';
  if (uid && key && env.KARP_GRANT_SECRET) {
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
  // ⚠ TÍMABUNDIN debug-upptaka (skoða: /api/askell/last?t=<ASKELL_WEBHOOK_SECRET>) — til að sjá raun v2-payload
  //    og fínstilla lesturinn. Grípur ÁÐUR en badsig-höfnun svo sést líka ef undirritun mistekst (t.d. rangt secret).
  try { ctx.waitUntil(caches.default.put(new Request('https://cap.karp.internal/askell-last'),
    new Response(JSON.stringify({ event, sigOk, at: Date.now(), body: raw.slice(0, 6000) }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } }))); } catch (e) {}
  if (!sigOk) return new Response('badsig', { status: 401 });
  let body = {}; try { body = JSON.parse(raw); } catch (e) {}
  const ev = String(body.event || event || '');
  const d = body.data || body;   // Áskell pakkar í {event,sender,data:{...}}
  // Áskrift: subscription.* (v1) OG subscription_contract.* (v2). customer_reference = kt (VIÐ settum),
  //   þrep úr metadata.tier (áreiðanlegt — við setjum í session) EÐA vöru-nafni; aðgangur TIL period-loka.
  // ⚠ Nákvæm v2-svið staðfestast með raun test-greiðslu; les því mörg möguleg heiti varlega.
  if ((ev.indexOf('subscription') >= 0 || ev.indexOf('contract') >= 0) && env.KARP_GRANT_SECRET) {
    const sub = d.subscription || d.contract || d.subscription_contract || {};
    const cust = d.customer || sub.customer || {};
    const kt = String(d.customer_reference || d.customerReference || sub.customer_reference || cust.reference || cust.customer_reference || '').replace(/\D/g, '');
    let meta = d.metadata || d.meta || sub.metadata || sub.meta || {};
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }   // v1 sýnir "meta":"{}" (strengur)
    const nameBlob = (JSON.stringify(d.plan || d.items || d.product || d.bundle || sub.plan || sub.product || '') + ' ' + String(d.reference || sub.reference || '')).toLowerCase();
    // Sér þjónustu-áskrift (Útboðsvaktin o.fl.): metadata.service áreiðanlegt (VIÐ setjum í session);
    // vöru-nafn til vara. Slík áskrift veitir karp_sub_<svc>_until í WP — EKKI þrep.
    const ms = String(meta.service || '');
    const service = ['utbod', 'frettir', 'fasteign'].indexOf(ms) >= 0 ? ms
      : (nameBlob.indexOf('útboð') >= 0 || nameBlob.indexOf('utbod') >= 0 ? 'utbod' : '');
    const mt = String(meta.tier || '');
    const tier = ['grunnur', 'fyrirtaeki', 'fyrirtaeki_plus'].indexOf(mt) >= 0 ? mt
      : (nameBlob.indexOf('plus') >= 0 ? 'fyrirtaeki_plus' : (nameBlob.indexOf('fyrirt') >= 0 ? 'fyrirtaeki' : 'grunnur'));   // metadata.tier áreiðanlegt; nafn til vara
    const now = Math.floor(Date.now() / 1000);
    const endStr = d.active_until || d.current_period_end || d.next_billing_at || d.period_end || (d.current_period && d.current_period.end) || sub.active_until || sub.current_period_end || (sub.current_period && sub.current_period.end) || '';
    let until = endStr ? Math.floor(new Date(endStr).getTime() / 1000) : 0;
    if (!until || until < now) until = now + 32 * 86400;   // ⚠ vara: ef period-lok finnst ekki í v2-payloadi → mánuður frá núna (grant klárast; fínstillt þegar raun-payload sést)
    if (kt.length === 10) {   // until-skilyrði fjarlægt (until defaultar alltaf á gilt gildi)
      ctx.waitUntil(fetch('https://wp.karp.is/wp-json/karp/v1/sub/grant', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Karp-Secret': env.KARP_GRANT_SECRET },
        body: JSON.stringify(service
          ? { kt, service, until, askellId: String(sub.id || d.id || ''), ref: String(d.id || d.token || d.uuid || sub.id || sub.uuid || '') + '_' + until }
          : { kt, tier, until, askellId: String(sub.id || d.id || ''), ref: String(d.id || d.token || d.uuid || sub.id || sub.uuid || '') + '_' + until }),
      }).catch(() => {}));
    }
  }
  // ── Stakar skýrslur um Áskell (einskiptisvara): session-metadata {service:'stak', key:'fyrirtaeki:kt'…} ──
  // Hlustum vítt (payment/billing_run/contract) — nákvæmt event-heiti er óskjalfest og staðfestist í sandbox.
  // Grant er idempotent á lykli (WP dedupe) svo tvöföld event eru skaðlaus. userid leyst af kt (karp_kt).
  if (env.KARP_GRANT_SECRET && (ev.indexOf('payment') >= 0 || ev.indexOf('billing_run') >= 0 || ev.indexOf('contract') >= 0)) {
    try {
      const sub2 = d.subscription || d.contract || d.subscription_contract || {};
      let meta2 = d.metadata || d.meta || sub2.metadata || sub2.meta || {};
      if (typeof meta2 === 'string') { try { meta2 = JSON.parse(meta2); } catch (e) { meta2 = {}; } }
      // V2-leið: session-metadata {service:'stak', key} · V1-leið (stakgreiðsla um /api/payments/):
      // engin metadata en reference-svið greiðslunnar BER stak-lykilinn sjálfan
      // reference = '<lykill>|<token-forskeyti>' (tvírukkunar-vörn) → klippa '|…' af fyrir grant-lykilinn
      const ref0 = String(d.reference || '').split('|')[0];
      const refKey = /^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/.test(ref0) ? ref0 : '';
      const viaMeta = String(meta2.service || '') === 'stak';
      const stakKey = viaMeta ? String(meta2.key || '') : refKey;
      const st2 = String(d.state || d.status || '');
      // V1-stakgreiðsla: veita AÐEINS við settled (pending/retrying bíða); V2: útiloka villustöður
      const okState = viaMeta ? !/fail|error|cancel/i.test(st2) : /settled/i.test(st2);
      // ⚠ V1-greiðslu-objekt ber EKKERT customer_reference (sannað 11.7) — kaupanda-kt býr aftan við '|' í reference
      const ktUrRef = (String(d.reference || '').split('|')[1] || '').replace(/\D/g, '');
      const kt2 = (String(d.customer_reference || (d.customer && d.customer.reference) || sub2.customer_reference || '').replace(/\D/g, '')) || ktUrRef;
      if (stakKey && okState && /^[a-z]+:[\w .,ÁÉÍÓÚÝÞÆÖáéíóúýþæö-]+$/.test(stakKey) && kt2.length === 10) {
        ctx.waitUntil(fetch('https://wp.karp.is/wp-json/karp/v1/reports/grant', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kt: kt2, key: stakKey, orderid: 'askell_' + String(d.uuid || d.id || ''), secret: env.KARP_GRANT_SECRET }),
        }).catch(() => {}));
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
  const uid = await karpUserId(request);
  if (!uid) return sjson({ error: 'login' });
  let body = {}; try { body = await request.json(); } catch (e) {}
  const svc = ['utbod', 'frettir', 'fasteign'].indexOf(String(body.service || '')) >= 0 ? String(body.service) : '';
  try {
    const info = await (await fetch('https://wp.karp.is/wp-json/karp/v1/sub/cancelinfo', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Karp-Secret': env.KARP_GRANT_SECRET },
      body: JSON.stringify({ userid: uid, service: svc }),
    })).json();
    const aid = info && info.askellId;
    if (!aid) return sjson({ error: 'noid' });   // engin Áskell-tilvísun vistuð (t.d. fríprófun án korts)
    const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
    // v2 contract fyrst (cancel_at_period_end = aðgangur út greitt tímabil), legacy til vara
    let r = await fetch('https://askell.is/api/v2/subscription-contracts/' + encodeURIComponent(aid) + '/cancel/', { method: 'POST', headers: H, body: JSON.stringify({ cancel_at_period_end: true }) });
    if (!r.ok) r = await fetch('https://askell.is/api/subscriptions/' + encodeURIComponent(aid) + '/cancel/', { method: 'POST', headers: H });
    if (!r.ok) return sjson({ error: 'askell', status: r.status });
    return sjson({ ok: true, cancelled: true });   // until helst í WP → aðgangur rennur út náttúrulega
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
  const SVCS = { utbod: 'ASKELL_CHANNEL_UTBOD', frettir: 'ASKELL_CHANNEL_FRETTIR', fasteign: 'ASKELL_CHANNEL_FASTEIGN' };   // sérlausnir: Útboð 1.900, Umfjöllun/frettir 3.900, Fasteignir 3.900
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
  };
  const stak = String(u.searchParams.get('stak') || '').slice(0, 90);
  const stakKind = (stak.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/) || [])[1] || '';
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
  const body = { sales_channel: channel, expires_in_seconds: 1800, metadata: stakOk ? { service: 'stak', key: stak } : (svc ? { service: svc } : { tier }) };   // metadata → vefkrókur veit hvað var keypt
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
const STAK_VERD = { fyrirtaeki: ['Fyrirtækjaskýrsla', 990], eigendur: ['Eigendaskýrsla', 990], areidanleiki: ['Áreiðanleikamat', 990], fasteign: ['Fasteignaskýrsla (verðmat)', 990] };
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
  const uid = await karpUserId(request);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/) || [])[1] || '';
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
  const uid = await karpUserId(request);   // peninga-endapunktur: innskráning skylda (rýni-atriði #3)
  if (!uid) return sjson({ error: 'login' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  const b = await request.json().catch(() => null);
  const key = String((b && b.key) || '').slice(0, 90);
  const kind = (key.match(/^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/) || [])[1] || '';
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  const tok = String((b && b.token) || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  if (!kind || kt.length !== 10 || tok.length < 20) return sjson({ error: 'input' });
  const cache = caches.default;
  const ck = new Request('https://cache.karp.internal/askell-stakpay?tok=' + tok);
  // reference = lykill + KAUPANDA-kt → einkvæmt per (skýrsla, kaupandi) og STÖÐUGT þvert á
  // endurtilraunir/ný checkout → tvírukkunar-vörn þótt edge-cache gleymist (rýni-atriði #2).
  // Vefkrókur klippir '|…' af fyrir grant-lykilinn.
  const refStr = key + '|' + kt;
  const granted = async (uuid) => {   // grant á WP — idempotent á lykli WP-megin; vefkrókurinn er varaleið
    if (!env.KARP_GRANT_SECRET) return;
    // userid = INNSKRÁÐI kaupandinn → skýrslan lendir á réttum aðgangi þótt fleiri deili kt
    // (kt-árekstur sannaður 11.7: sama kt á tveimur aðgöngum → get_users valdi rangan); kt = varaleið
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
const SUB2_SLUGS = { grunnur: 'tier', fyrirtaeki: 'tier', fyrirtaeki_plus: 'tier', utbod: 'svc', frettir: 'svc', fasteign: 'svc' };
async function sub2CheckoutHandler(request, env, ctx) {
  if (!env.ASKELL_PRIVATE_KEY || !env.ASKELL_PUBLIC_KEY) return sjson({ error: 'unconfigured' });
  const H = { 'Authorization': 'Api-Key ' + env.ASKELL_PRIVATE_KEY, 'Content-Type': 'application/json' };
  if (request.method !== 'POST') { const pid = await askellProcessorId(env, ctx); return sjson(pid != null ? { ok: 1 } : { error: 'noprocessor' }); }
  const uid = await karpUserId(request);
  if (!uid) return sjson({ error: 'login' });
  const b = await request.json().catch(() => null);
  const slug = String((b && b.slug) || '').toLowerCase();
  if (!SUB2_SLUGS[slug]) return sjson({ error: 'input' });
  const kt = String((b && b.kt) || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'input' });
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
  const uid = await karpUserId(request);
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
  const granted = async (cid, until) => {   // grant STRAX server-megin (ekki beðið eftir vefkrók); userid → réttur aðgangur
    if (!env.KARP_GRANT_SECRET) return;
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
    if (!env.KARP_GRANT_SECRET) return sjson({ error: 'nosecret' });
    const r = await fetch('https://askell.is/api/payments/?page_size=15', { headers: H });
    const d = await r.json().catch(() => null);
    const list = Array.isArray(d) ? d : ((d && d.results) || []);
    const ut = [];
    for (const x of list) {
      if (String(x.state || '') !== 'settled') continue;
      const [lykill, ktRaw] = String(x.reference || '').split('|');
      const kt = String(ktRaw || '').replace(/\D/g, '');
      if (!/^(fyrirtaeki|eigendur|areidanleiki|fasteign):.+/.test(lykill || '') || kt.length !== 10) continue;
      const g = await fetch('https://wp.karp.is/wp-json/karp/v1/reports/grant', {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Karp-Secret': env.KARP_GRANT_SECRET },
        body: JSON.stringify({ kt, key: lykill, orderid: 'askv1_' + String(x.uuid || ''), secret: env.KARP_GRANT_SECRET }),
      }).catch(() => null);
      ut.push({ uuid: String(x.uuid || '').slice(0, 8), lykill: lykill.replace(/\d{6}(\d{4})/, '……$1'), wp_status: g ? g.status : 0, wp_svar: g ? (await g.text().catch(() => '')).slice(0, 200) : 'net-villa' });
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
  const uid = await karpUserId(request);
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
  const uid = await karpUserId(request);
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
  const uid = await karpUserId(request);
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

// ── 🪑 Tengslanet (F10): fyrirsvarsmenn þvert á félög eignarhaldsnetsins ─────────────────────
// GET /api/tengslanet?kt= → { stjornendur: [rótarfyrirsvar + hlutverk í öðrum net-félögum],
// krossar: [fólk í ≥2 net-félögum án hlutverks í rót] }. Félagamengið = rót + félags-hnútar úr
// UBO-trénu (gogn/eigendur/<kt>.json), þak 12 (mælt API). Samsvörun með einstaklings-kt SERVER-HLIÐ;
// út fara AÐEINS nöfn + hlutverk + félags-kt (aldrei kt einstaklinga). Endurskoðendur/stofnendur/
// látnir síaðir frá (suð, sögulegt).
async function tengslanetHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10 || !rskErFyrirtaeki(kt)) return sjson({ kt, holdur: false });   // aðeins lögaðila-kt í mælda APIð
  if (!env.RSK_KEY) return sjson({ kt, holdur: false, unconfigured: true });
  // Innskráðir eingöngu (hluti keyptu eigendaskýrslunnar; ver líka mælda APIð gegn opinni upptalningu).
  // ⚠ VERÐUR að standa Á UNDAN cache-treffinu — annars þjónaði jaðarinn óinnskráðum úr cache.
  const uid = await karpUserId(request);
  if (!uid) return sjson({ kt, holdur: false, error: 'login' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/tengslanet?kt=' + kt);
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
        const p = folk.get(t.kt) || { nafn: t.nafn, roles: [] };
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
        stjornendur.push({ nafn: p.nafn, hlutverk_rot: [...new Set(rotRoles.map((r) => r.label))], onnur });
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
  const res = new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': ttl ? 'public, max-age=' + ttl : 'no-store' } });
  if (ttl) ctx.waitUntil(cache.put(cacheKey, res.clone()));
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
    if (url.pathname === '/api/hjalp') return hjalpHandler(request, env, ctx);
    if (url.pathname === '/api/ytstats') return ytstatsHandler(request, env, ctx);
    if (url.pathname === '/api/gleit') return gleitHandler(request, env, ctx);
    if (url.pathname === '/api/tilkynningar') return tilkynningarHandler(request, env, ctx);
    if (url.pathname === '/api/fyrirtaeki') return fyrirtaekiHandler(request, env, ctx);
    if (url.pathname === '/api/vanskil') return vanskilHandler(request, ctx);
    if (url.pathname === '/api/kvoti') return kvotiHandler(request, env, ctx);
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
    if (url.pathname === '/api/leyfi') return leyfiHandler(request, env, ctx);
    if (url.pathname === '/api/pay/checkout') return payCheckoutHandler(request, env, ctx);
    if (url.pathname === '/api/pay/return') return payReturnHandler(request, env, ctx);
    if (url.pathname === '/api/pay/callback') return payCallbackHandler(request, env, ctx);
    if (url.pathname === '/api/askell/webhook') return askellWebhookHandler(request, env, ctx);
    if (url.pathname === '/api/askell/last') return askellLastHandler(request, env);
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
    return env.ASSETS.fetch(request);
  },
};
