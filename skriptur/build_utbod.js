// ─────────────────────────────────────────────────────────────
// build_utbod.js — ÚTBOÐSGÁTT KARP (LOTA 25). Sækir öll útboð frá öllum
// gáttum sem hægt er — API þar sem það býðst, annars scrape einu sinni á dag —
// normaliserar, flokkar (lykilorð) og bakar í gogn/utbod.json + public.
//
// Veitur:
//   rk   Útboðsvefur Ríkiskaupa   — WP REST API (miðlæga safnið, margar stofnanir)
//   ted  TED (ESB)                — EES-útboð með framkvæmdastað Ísland (POST API)
//   fax  Faxaflóahafnir           — HTML scrape (TenderList-hlutir)
//   lv   Landsvirkjun             — __NEXT_DATA__ accordion-listi
// (Reykjavík In-Tend er reCAPTCHA-varið; Vegagerðin/Hafnarfj. birta fréttir en
//  ekki útboðslista og fara auk þess flest gegnum Útboðsvef → hlekkir á /utbod/.)
//
// Skema per útboð: { t, buyer, d(ISO birt), deadline(ISO|null), u(hlekkur), src, cat }
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const UA = { 'User-Agent': 'KARP utbodsvakt (karp.is; aronheidars@gmail.com)' };

// ── Lykilorða-flokkun (verktaka-svið) ──────────────────────────
const CATS = {
  bygg: ['Byggingar & mannvirki', '🏗️'], jardv: ['Jarðvinna & vegir', '🚧'],
  raf: ['Rafmagn & lýsing', '⚡'], vatn: ['Veitur & lagnir', '🚰'],
  vel: ['Vélar & búnaður', '⚙️'], hugb: ['Upplýsingatækni', '💻'],
  radgjof: ['Ráðgjöf & hönnun', '📐'], raesting: ['Ræsting & úrgangur', '🧹'],
  flutn: ['Flutningar & farartæki', '🚚'], matur: ['Matvæli & veitingar', '🍽️'],
  trygg: ['Tryggingar & fjármál', '📄'], annad: ['Annað', '📦'],
};
// Lyklar tvítyngdir — TED-titlar eru á ensku („Iceland – < enskur flokkur > – …").
const CATKW = [
  ['jardv', /jarðvinn|gröft|graf |vegag|vegir|vega |malbik|gatna|lagnaskurð|fylling|klæðning|\bbrú|jarðgöng|spreng|efnistök|snjómokstur|vetrarþjón|road|excavat|paving|snow|winter service|bridge|asphalt/i],
  ['bygg', /bygging|mannvirk|steyp|múr|þak|glugg|innrétt|viðbygg|endurbæt|nýbygg|verkleg|framkvæmd|frágang|dúkl|málun|parket|flísa|construction|building work|renovat|refurbish/i],
  ['raf', /rafmagn|raflagn|raforku|spenn|háspennu|lágspennu|ljósleiðar|lýsing|rafbún|stöðvarveit|\brafal|tengivirk|jarðstreng|electric|transformer|power supply|lighting|cabl/i],
  ['vatn', /\bveitu|vatnslagn|fráveitu|hitaveitu|skólp|dælustöð|hreinsistöð|\blagnir|pípulagn|vatnsból|borhol|water|sewage|pipe|heating|drainage/i],
  ['vel', /\bvél |búnað|\btæki\b|dælur|mótor|loftræst|kæli|lyftu|krana|gámi|bátur|skip |ferju|repair|maintenance|machinery|equipment|\bpump|vessel|\bcrane|ventilation/i],
  ['hugb', /hugbúnað|upplýsingatækn|kerfi\b|hýsing|\bvef|smáforrit|stafræn|gagna|net-|tölvu|hýsingar|hugverk|software|informat|\bsystem|digital|licen|comput|hosting|\bIT\b/i],
  ['radgjof', /ráðgjöf|hönnun|verkfræð|arkitekt|eftirlit|úttekt|greining|skýrsl|rannsókn|matsáætl|umhverfismat|ráðgjaf|consult|\bdesign|engineering|survey|advisory|architect/i],
  ['raesting', /ræsting|\bþrif|hreingern|sorphir|\bsorp|úrgang|endurvinnsl|gámaþjón|cleaning|\bwaste|refuse|recycl/i],
  ['trygg', /trygging|vátrygg|fjármögn|lánaþjón|endurskoð|bókhald|insuranc|financ|audit|banking/i],
  ['flutn', /flutning|akstur|leigubíl|bifreið|sending|dreifing|farartæk|rúta|hópferð|motorcycl|vehicl|bicycl|transport|\bbus |lorry|truck|freight/i],
  ['matur', /matvæl|veitinga|mötuneyt|\bmatur|kaffi|drykkjar|\bfood|catering|beverage|pharmaceutic|medic|lyf\b/i],
];
const classify = (title) => { const s = String(title || '').toLowerCase(); const hit = CATKW.find(([, rx]) => rx.test(s)); return hit ? hit[0] : 'annad'; };

const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// TED skilar „2026-07-08+02:00" (dagsetning+tímabelti án tíma) sem Date() þáttar EKKI → regex fyrst.
const isoDate = (d) => { const m = String(d || '').match(/(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; try { const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); } catch (e) { return null; } };

// ── 1) Útboðsvefur Ríkiskaupa (WP REST) ────────────────────────
async function ríkiskaup() {
  try {
    const r = await fetch('https://utbodsvefur.is/wp-json/wp/v2/posts?per_page=100&_fields=date,title,link,excerpt', { headers: UA });
    if (!r.ok) return [];
    const posts = await r.json();
    return (posts || []).map((p) => {
      const t = clean((p.title || {}).rendered);
      const ex = clean((p.excerpt || {}).rendered);
      const dm = ex.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/) || ex.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})/);
      return { t, buyer: 'Ríkiskaup / Útboðsvefur', d: isoDate(p.date), deadline: null, u: p.link, src: 'rk', cat: classify(t) };
    }).filter((x) => x.t);
  } catch (e) { console.log('  Útboðsvefur villa:', String(e).slice(0, 60)); return []; }
}

// ── 2) TED (EES-útboð á Íslandi) ───────────────────────────────
// CPV-deild (fyrstu 2 stafir) → Karp-flokkur. Notað fyrir TED-færslur (enskir titlar veikja
// lykilorða-flokkunina) og geymt á færslunni (x.cpv) fyrir fit-einkunn verktaka.
const CPV_CAT = {
  45: 'bygg', 44: 'bygg', 71: 'radgjof', 73: 'radgjof', 79: 'radgjof', 72: 'hugb', 48: 'hugb',
  30: 'hugb', 32: 'hugb', 31: 'raf', '09': 'raf', 65: 'vatn', 41: 'vatn', 90: 'raesting',
  60: 'flutn', 63: 'flutn', 34: 'flutn', 42: 'vel', 43: 'vel', 50: 'vel', 51: 'vel', 38: 'vel',
  15: 'matur', 55: 'matur', '03': 'matur', 33: 'matur', 66: 'trygg', 77: 'jardv', 14: 'jardv',
};
const cpvCat = (codes) => { for (const c of codes || []) { const k = String(c).slice(0, 2); if (CPV_CAT[k]) return CPV_CAT[k]; } return null; };
const TED_FIELDS = ['publication-number', 'notice-title', 'publication-date', 'deadline-receipt-tender-date-lot', 'buyer-name', 'classification-cpv'];
const tedTitle = (tt) => clean(typeof tt === 'object' && tt ? (tt.isl || tt.eng || Object.values(tt)[0]) : tt);
async function tedQuery(query, limit) {
  const r = await fetch('https://api.ted.europa.eu/v3/notices/search', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, fields: TED_FIELDS, limit }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return ((j && j.notices) || []).map((x) => {
    const t = tedTitle(x['notice-title']);
    const bn = x['buyer-name'];
    const buyer = bn ? clean(typeof bn === 'object' ? (bn.isl || bn.eng || Object.values(bn)[0]) : bn) : 'EES-útboð (TED)';
    const dl = x['deadline-receipt-tender-date-lot'];
    const deadline = dl ? isoDate(Array.isArray(dl) ? dl[0] : dl) : null;
    const cpv = [...new Set((Array.isArray(x['classification-cpv']) ? x['classification-cpv'] : (x['classification-cpv'] ? [x['classification-cpv']] : [])).map(String))].slice(0, 4);
    const out = { t, buyer, d: isoDate(x['publication-date']), deadline, u: 'https://ted.europa.eu/en/notice/-/detail/' + (x['publication-number'] || ''), src: 'ted', cat: cpvCat(cpv) || classify(t) };
    if (cpv.length) out.cpv = cpv;
    return out;
  }).filter((x) => x.t);
}
async function ted() {
  try {
    // Aðeins virk samkeppnisútboð (contract notices) — forauglýsingar fara í sér pins-lista
    return await tedQuery('place-of-performance IN (ISL) AND notice-type IN (cn-standard cn-social cn-desg) SORT BY publication-date DESC', 40);
  } catch (e) { console.log('  TED villa:', String(e).slice(0, 60)); return []; }
}
// Forauglýsingar & markaðskannanir (PIN/RFI) — verk sem eru VÆNTANLEG í útboð. Forskot verktaka.
async function tedPins() {
  try {
    return await tedQuery('place-of-performance IN (ISL) AND notice-type IN (pin-only pin-buyer pin-cfc-standard pin-cfc-social) SORT BY publication-date DESC', 25);
  } catch (e) { console.log('  TED-PIN villa:', String(e).slice(0, 60)); return []; }
}

// ── 3) Faxaflóahafnir (HTML scrape) ────────────────────────────
async function faxafloahafnir() {
  try {
    const html = await (await fetch('https://www.faxafloahafnir.is/utbod/', { headers: UA })).text();
    // Hver færsla: TenderList_item ... dagsetning ... title ... hlekkur
    const blocks = html.split('TenderList_item__AtC75').slice(1);
    const monaudir = { 'janúar': 1, 'febrúar': 2, 'mars': 3, 'apríl': 4, 'maí': 5, 'júní': 6, 'júlí': 7, 'ágúst': 8, 'september': 9, 'október': 10, 'nóvember': 11, 'desember': 12 };
    return blocks.map((b) => {
      const titleM = b.match(new RegExp('TenderList_item__title' + '[^>]*>([\\s\\S]*?)<'));
      const linkM = b.match(new RegExp('href="(' + '/utbod/' + '[^"#]+)"'));
      const dateM = b.match(new RegExp('(\\d{1,2})\\.\\s*(' + Object.keys(monaudir).join('|') + ')\\s*(\\d{4})'));
      const t = clean(titleM ? titleM[1] : '');
      let d = null;
      if (dateM) d = `${dateM[3]}-${String(monaudir[dateM[2]]).padStart(2, '0')}-${String(+dateM[1]).padStart(2, '0')}`;
      return { t, buyer: 'Faxaflóahafnir', d, deadline: null, u: linkM ? 'https://www.faxafloahafnir.is' + linkM[1] : 'https://www.faxafloahafnir.is/utbod/', src: 'fax', cat: classify(t) };
    }).filter((x) => x.t && x.t.length > 5);
  } catch (e) { console.log('  Faxaflóahafnir villa:', String(e).slice(0, 60)); return []; }
}

// ── 5) Reykjavíkurborg — OPINN útboðslisti (Drupal, reykjavik.is) ──
// ATH: EKKI reCAPTCHA-læsta In-Tend gáttin (utbod.reykjavik.is) heldur opna
// auglýsingasíðan reykjavik.is/utbodsauglysingar — hrein útboð með /utbod/<id>- hlekkjum.
async function reykjavik() {
  try {
    const html = await (await fetch('https://reykjavik.is/utbodsauglysingar', { headers: UA })).text();
    const seen = new Set();
    const out = [];
    for (const m of html.matchAll(/href="(\/utbod\/(\d+)-[^"#]+)"[^>]*>([\s\S]{5,160}?)<\/a>/g)) {
      const id = m[2];
      if (seen.has(id)) continue;
      seen.add(id);
      let t = clean(m[3]);
      // Titill byrjar á útboðsnúmerinu (t.d. „16328 Vogabyggð…") — höldum því sem tilvísun.
      if (t.length < 6) continue;
      out.push({ t, buyer: 'Reykjavíkurborg', d: null, deadline: null, u: 'https://reykjavik.is' + m[1], src: 'rvk', cat: classify(t) });
    }
    return out;
  } catch (e) { console.log('  Reykjavík villa:', String(e).slice(0, 60)); return []; }
}

// ── 4) Landsvirkjun (__NEXT_DATA__ accordion) ──────────────────
async function landsvirkjun() {
  try {
    const html = await (await fetch('https://www.landsvirkjun.is/utbod', { headers: UA })).text();
    const i = html.indexOf('__NEXT_DATA__');
    if (i < 0) return [];
    const j = JSON.parse(html.slice(i).match(new RegExp('>({[\\s\\S]*?})</script>'))[1]);
    const body = (((j.props || {}).pageProps || {}).page || {}).body || [];
    const rich = (v) => Array.isArray(v) ? v.map((x) => (x && x.text) || '').join(' ').trim() : (typeof v === 'string' ? v : ((v && v.text) || ''));
    const yr = new Date().getUTCFullYear();
    const out = [];
    body.forEach((blk) => (blk.fields || []).forEach((f) => {
      const t = clean(rich(f.accordion_title));
      // Aðeins yfirstandandi árs útboð (nr. YYYY-NN) — eldri eru lokuð
      if (t && (t.includes(String(yr)) || t.includes(String(yr + 1)))) {
        out.push({ t, buyer: 'Landsvirkjun', d: null, deadline: null, u: 'https://www.landsvirkjun.is/utbod', src: 'lv', cat: classify(t) });
      }
    }));
    return out;
  } catch (e) { console.log('  Landsvirkjun villa:', String(e).slice(0, 60)); return []; }
}

async function main() {
  const [rk, td, fx, lv, rvk, pins] = await Promise.all([ríkiskaup(), ted(), faxafloahafnir(), landsvirkjun(), reykjavik(), tedPins()]);
  console.log('  Útboðsvefur:', rk.length, '· TED:', td.length, '· Faxaflóahafnir:', fx.length, '· Landsvirkjun:', lv.length, '· Reykjavík:', rvk.length, '· PIN:', pins.length);
  let all = [...rk, ...td, ...fx, ...lv, ...rvk];
  // Tvítök burt (sami titill+veita)
  const seen = new Set();
  all = all.filter((x) => { const k = x.src + '|' + x.t.toLowerCase().slice(0, 60); return seen.has(k) ? false : (seen.add(k), true); });
  // Röðun: nýjast birt fyrst (deadline-röðun gerist client-side)
  all.sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')));

  const byCat = {}; all.forEach((x) => { byCat[x.cat] = (byCat[x.cat] || 0) + 1; });
  const bySrc = {}; all.forEach((x) => { bySrc[x.src] = (bySrc[x.src] || 0) + 1; });
  const out = {
    updated: new Date().toISOString(),
    n: all.length,
    cats: CATS, byCat, bySrc,
    sources: { rk: 'Útboðsvefur Ríkiskaupa', ted: 'TED (EES)', rvk: 'Reykjavíkurborg', fax: 'Faxaflóahafnir', lv: 'Landsvirkjun' },
    tenders: all,
    pins,   // forauglýsingar & markaðskannanir (TED PIN/RFI) — væntanleg útboð
  };
  const payload = JSON.stringify(out);
  fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'utbod.json'), payload);
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'utbod.json'), payload);
  console.log('Skrifað: gogn/utbod.json + public ·', all.length, 'útboð ·', pins.length, 'PIN ·', Object.keys(byCat).length, 'flokkar ·', Math.round(payload.length / 1024), 'KB');
}
main().catch((e) => { console.error(e); process.exit(1); });
