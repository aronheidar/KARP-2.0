// ─────────────────────────────────────────────────────────────
// build_ytras.js (LOTA 34A) — UPPGÖTVUN YouTube-rása fyrir Karp-safnið.
// Leitar (rása-sía) að: fréttamiðlum, öllum 63 þingmönnum, flokkum, fyrir-
// tækjum (GRAFSECT-listinn), stofnunum og MÁLEFNA-rásum (ESB, Seðlabanki,
// hagfræði, fjármál…). Hver kandídat er SANNPRÓFAÐUR með RSS (virkni) og
// grófri viðeigandi-síu áður en hann fer í skrána. Handvirk fræ + svartlisti
// verja gegn röngum samnöfnum (dæmi: @hagar-einstaklingur ≠ Hagar hf).
// Úttak: gogn/ytras.json {updated, n, chans:[{id,n,q,cat,subs,newest,vids}]}
// Keyrsla: node skriptur/build_ytras.js [--seeds-only]   (full leit ~3-5 mín)
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (f) => path.join(__dirname, '..', 'gogn', f);

// ── Handvirk fræ (þekkt góð) — fara alltaf inn ────────────────
const SEEDS = [
  { id: 'UCNpgIsrS5j94RDTfPB3wevg', n: 'Samstöðin', cat: 'midlar' },
  { id: 'UCGgyr3-DI5pr5Cnnv2A8shg', n: 'RÚV', cat: 'midlar' },
  { id: 'UCOz6GbXqeZ6wJsUT8HXdZAQ', n: 'Stjórnarráðið', cat: 'stofnanir' },
  { id: 'UCiPZhGeTpFL9wvvVR9uFQgA', n: 'Eimskip', cat: 'fyrirtaeki' },
  { id: 'UCJKK3LJ0Fs6UcWs6QMRWs8g', n: 'Eimskip (aðalrás)', cat: 'fyrirtaeki' },
  { id: 'UC0auMGlERL_q9IfaYPysb1Q', n: 'Icelandair', cat: 'fyrirtaeki' },
  { id: 'UCHGNsNarIoZP3QuBzuqtHqg', n: 'Play', cat: 'fyrirtaeki' },
  { id: 'UC9VZ9wDIJJ4LSXlK7Vgnjsw', n: 'Landsvirkjun', cat: 'fyrirtaeki' },
  { id: 'UC9-sEuaG0dXpbcr0wScvMvg', n: 'Síminn', cat: 'fyrirtaeki' },
  { id: 'UCRijU8XCs80USak_fB7KziA', n: 'Nova', cat: 'fyrirtaeki' },
  { id: 'UC3R4Nvk_EL7BODeuoYv0Q9w', n: 'Arion banki', cat: 'fyrirtaeki' },
  { id: 'UCvKAwqQCubhM-Hwayvcd2bA', n: 'Íslandsbanki', cat: 'fyrirtaeki' },
  { id: 'UCtTyhVmndlpjloldBtguR6Q', n: 'Ölgerðin', cat: 'fyrirtaeki' },
  { id: 'UClVW7BGbRvC5-0kowu8quhw', n: 'Össur', cat: 'fyrirtaeki' },
];
// Rásir sem leit finnur en eiga EKKI heima í safninu (röng samnöfn o.þ.h.)
// Skilyrði safnsins (Aron 4.7.2026): AÐEINS íslensk vöktun og umfjöllun.
const BLACKLIST = new Set([
  'UCuBsZ4oJma0hhLYIcgulGBg', // @hagar einstaklingur ≠ Hagar hf
  'UCVR94saY6YnNgaQtvLBcS0w', // DV Plays — enskt gaming-efni, falskt samnafn við DV
  'UC8clR9FpMIXuQ-le1ZaDrrQ', // DV Aerials — drónamyndefni, ekki umfjöllun
  'UCjwIUlrgM0XpMYGBAubbEUg', // RÚV Íþróttir — íþróttaklippur menga áhorfs-samanburð
]);

// ── Leitarfyrirspurnir per flokkur ────────────────────────────
function queries() {
  const q = [];
  // Fréttamiðlar
  ['RÚV', 'Stöð 2', 'Vísir fréttir', 'mbl Morgunblaðið', 'Heimildin', 'Viðskiptablaðið', 'DV Ísland', 'Mannlíf', 'Hringbraut', 'Útvarp Saga', 'N4 sjónvarp', 'Kjarninn'].forEach((s) => q.push({ q: s, cat: 'midlar' }));
  // Þingmenn (allir aðalmenn)
  try {
    const mps = JSON.parse(fs.readFileSync(G('althingi.json'), 'utf8'));
    mps.filter((m) => m.adalmadur).forEach((m) => q.push({ q: m.nafn, cat: 'thingmenn', exact: m.nafn }));
  } catch (e) {}
  // Flokkar
  ['Samfylkingin', 'Sjálfstæðisflokkurinn', 'Viðreisn', 'Miðflokkurinn', 'Framsóknarflokkurinn', 'Flokkur fólksins', 'Píratar', 'Sósíalistaflokkurinn', 'Vinstri græn'].forEach((s) => q.push({ q: s, cat: 'flokkar', exact: s }));
  // Fyrirtæki (GRAFSECT-heiti + stærri óskráð)
  ['Sjóvá', 'Kvika banki', 'Skagi VÍS tryggingar', 'Indó banki', 'Sýn fjarskipti', 'CCP Games', 'Hagar verslanir', 'Festi hf', 'Skel fjárfestingafélag', 'Samkaup', 'Brim seafood', 'Síldarvinnslan', 'Hampiðjan', 'JBT Marel', 'Alvotech', 'Amaroq minerals', 'Norðurál', 'Rio Tinto Iceland', 'Isavia', 'Orkuveita Reykjavíkur', 'Veitur', 'Landsnet', 'Reitir fasteignafélag', 'Eik fasteignafélag', 'Landsbankinn', 'Bónus', 'Krónan verslun', 'Elko', 'Byko', 'Húsasmiðjan', 'Origo', 'Controlant', 'Kerecis'].forEach((s) => q.push({ q: s, cat: 'fyrirtaeki' }));
  // Stofnanir
  ['Seðlabanki Íslands', 'Alþingi', 'Reykjavíkurborg', 'Landspítalinn', 'Háskóli Íslands', 'Háskólinn í Reykjavík', 'Vegagerðin', 'Landhelgisgæslan', 'Lögreglan á höfuðborgarsvæðinu', 'Umhverfisstofnun', 'Samtök atvinnulífsins', 'ASÍ verkalýðshreyfing', 'Viðskiptaráð Íslands', 'Samtök iðnaðarins'].forEach((s) => q.push({ q: s, cat: 'stofnanir' }));
  // Málefni — íslenskar umræðurásir um lykilhugtök
  ['Evrópusambandið Ísland umræða', 'Seðlabankinn vextir umræða', 'hagfræði Ísland', 'fjármál Ísland fyrirlestur', 'íslensk pólitík hlaðvarp', 'efnahagsmál Ísland', 'verðbólga Ísland', 'Þjóðmál hlaðvarp', 'Ein pæling', 'Skoðanabræður', 'Sölvi Tryggvason podcast', 'Rauða borðið'].forEach((s) => q.push({ q: s, cat: 'efni' }));
  return q;
}

// ── Leit m. rása-síu → kandídatar (m. mjúk-þvingunar-vörn) ────
// YouTube skilar TÓMUM leitarsíðum eftir ~20-30 hraðar leitir (engin villa,
// bara enginn channelRenderer) — við teljum tómstreymi og bakkum (backoff).
let EMPTY_STREAK = 0;
async function searchChannels(query) {
  try {
    const t = await (await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&sp=EgIQAg%253D%253D', { headers: UA })).text();
    const out = [];
    for (const m of t.matchAll(/"channelRenderer":\{"channelId":"(UC[^"]+)".{0,500}?"title":\{"simpleText":"([^"]+)"/g)) {
      out.push({ id: m[1], title: m[2] });
      if (out.length >= 3) break;
    }
    if (!out.length && !t.includes('channelRenderer')) {
      EMPTY_STREAK++;
      if (EMPTY_STREAK >= 3) { console.log('  ⏳ mjúk þvingun — bakka í 20 sek…'); await sleep(20000); EMPTY_STREAK = 0; }
    } else EMPTY_STREAK = 0;
    return out;
  } catch (e) { return []; }
}

// ── RSS-sannprófun: virkni + gróf viðeigandi-sía ──────────────
const ISL = /[ðþæöáéíóúý]|ísland|iceland|reykjav/i;
async function verify(cand, ctx) {
  try {
    const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + cand.id, { headers: UA });
    if (!r.ok) return null;
    const xml = await r.text();
    const entries = xml.split('<entry>').slice(1);
    if (entries.length < 2) return null;
    const newest = ((entries[0].match(/<published>([^<]+)/) || [])[1] || '').slice(0, 10);
    const titles = entries.map((e) => (e.match(/<title>([^<]+)/) || [])[1] || '').join(' | ');
    const chName = (xml.match(/<title>([^<]+)/) || [])[1] || cand.title;
    // Sjálfvirkar „Topic“-rásir YouTube (tónlistarsöfn) eiga aldrei heima hér
    if (/ - Topic$/i.test(chName)) return null;
    // Viðeigandi: titlar/nafn bera íslensk einkenni EÐA nafnið passar fyrirspurninni vel
    const looksIcelandic = ISL.test(titles) || ISL.test(chName);
    const nameMatch = ctx.exact ? chName.toLowerCase().includes(ctx.exact.toLowerCase().split(' ')[0]) : chName.toLowerCase().includes(ctx.q.toLowerCase().split(' ')[0]);
    if (!looksIcelandic && !nameMatch) return null;
    // Miðlar/fyrirtæki/stofnanir: KREFJAST nafnasamsvörunar — íslensk einkenni ein
    // og sér hleyptu persónurásum inn á miðla-leitum (Samuel Jonsson-lexían).
    if ((ctx.cat === 'midlar' || ctx.cat === 'fyrirtaeki' || ctx.cat === 'stofnanir') && !nameMatch) return null;
    // Þingmanna-leit: KREFST nákvæmrar nafnasamsvörunar (algeng nöfn → rangar rásir;
    // startsWith hleypti „Jón Gunnarsson - Topic“ og öðrum alnöfnum inn)
    if (ctx.cat === 'thingmenn' && chName.toLowerCase().trim() !== ctx.exact.toLowerCase()) return null;
    return { id: cand.id, n: chName.slice(0, 60), q: ctx.q, cat: ctx.cat, newest, vids: entries.length };
  } catch (e) { return null; }
}

async function main() {
  const seedsOnly = process.argv.includes('--seeds-only');
  const found = new Map();
  SEEDS.forEach((s) => found.set(s.id, { ...s, q: s.n, newest: '', vids: null, seed: true }));
  if (!seedsOnly) {
    const qs = queries();
    console.log('Leitir:', qs.length, '(þolinmæði — ~sek per leit)');
    let done = 0;
    for (const ctx of qs) {
      const cands = await searchChannels(ctx.q);
      for (const c of cands) {
        if (found.has(c.id) || BLACKLIST.has(c.id)) continue;
        const v = await verify(c, ctx);
        if (v) { found.set(v.id, v); console.log('  ✓', v.cat, '·', v.n, '·', v.id, '· nýjast', v.newest); }
        await sleep(150);
      }
      done++;
      if (done % 20 === 0) console.log('  …', done, '/', qs.length, 'leitum lokið ·', found.size, 'rásir');
      await sleep(700 + Math.floor(Math.random() * 400));
    }
  }
  const chans = [...found.values()];
  const byCat = {}; chans.forEach((c) => { byCat[c.cat] = (byCat[c.cat] || 0) + 1; });
  const out = { updated: new Date().toISOString(), n: chans.length, byCat, chans };
  fs.writeFileSync(G('ytras.json'), JSON.stringify(out, null, 1));
  console.log('Skrifað gogn/ytras.json:', chans.length, 'rásir ·', JSON.stringify(byCat));
}
main().catch((e) => { console.error(e); process.exit(1); });
