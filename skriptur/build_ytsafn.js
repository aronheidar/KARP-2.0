// ─────────────────────────────────────────────────────────────
// build_ytsafn.js (LOTA 34A) — UPPSKERA + GREINING YouTube-safnsins.
// Les rásaskrána (gogn/ytras.json) og safnar fyrir HVERJA rás:
//   • RSS (15 nýjustu): titill, dags, áhorf, likes — kjarnauppskeran
//   • /videos-forsíðu-backfill (~30 eldri): titill+id+áhorfstexti úr ytInitialData
//   • /about: áskrifendafjöldi
// SAFNIÐ VEX: myndbönd leggjast við gogn/ytsafn.json (lyklað á myndbands-id,
// aldrei eytt) — dagleg keyrsla í cron grípur nýtt efni; RSS nær 15 aftur svo
// ekkert tapast milli daga. ATH heiðarleiki: full baksaga rásar (>45 myndbönd)
// krefst YouTube Data API lykils — skjalað í note-reitnum.
// GREINING: efnistögg á titla (ESB, Seðlabankinn, verðbólga, ríkisstjórn…) +
// samantektir per rás/flokk/efni → gogn/ytgreining.json (+public bæði).
// Keyrsla: node skriptur/build_ytsafn.js   (~1-2 mín á 40 rásir)
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (f) => path.join(__dirname, '..', 'gogn', f);
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');

// Efnistögg — sömu lykilhugtök og notandinn bað um + kjarnamál Karp
const TAGS = [
  ['esb', /evrópusambandi|evrópusamband|\bESB\b|schengen|EES-samning/i],
  ['sedlabanki', /seðlabank|stýrivext|peningastefn/i],
  ['verdbolga', /verðbólg|vísitala neysluverðs/i],
  ['fjarmal', /fjármál|fjárfest|hlutabréf|skuldabréf|lífeyri|banka|vext/i],
  ['hagfraedi', /hagfræð|hagkerf|hagvöxt|efnahag|þjóðarbú/i],
  ['rikisstjorn', /ríkisstjórn|ráðherra|forsætis/i],
  ['althingi', /alþingi|þingmað|þingmenn|frumvarp|þingfund/i],
  ['husnaedi', /húsnæði|íbúðaverð|fasteign|leigumarkað/i],
  ['orka', /orkuskipt|virkjun|raforku|jarðvarm|vindork/i],
  ['sjavar', /sjávarútveg|fiskveið|kvóta|veiðigjöld|fiskeldi/i],
  ['ferda', /ferðaþjónust|ferðamenn|flugfélag/i],
  ['kjaramal', /kjarasamning|verkfall|kjaradeil|laun\b/i],
];
const tagsOf = (t) => TAGS.filter(([, rx]) => rx.test(t)).map(([k]) => k);
const parseSubs = (s) => { const m = String(s || '').match(/([\d.,]+)\s*([KM])?/i); if (!m) return null; return Math.round(parseFloat(m[1].replace(',', '.')) * (/m/i.test(m[2] || '') ? 1e6 : m[2] ? 1e3 : 1)); };
const parseViews = (s) => { const m = String(s || '').replace(/[.,]/g, '').match(/(\d+)/); return m ? +m[1] : null; };

async function harvestChannel(ch, safn) {
  let added = 0, subs = null;
  try {
    const [rssR, vidR, aboutR] = await Promise.all([
      fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + ch.id, { headers: UA }),
      fetch('https://www.youtube.com/channel/' + ch.id + '/videos', { headers: UA }),
      fetch('https://www.youtube.com/channel/' + ch.id + '/about', { headers: UA }),
    ]);
    // RSS: nákvæmustu tölurnar (views + likes)
    if (rssR.ok) {
      const xml = await rssR.text();
      for (const entry of xml.split('<entry>').slice(1)) {
        const id = (entry.match(/<yt:videoId>([^<]+)/) || [])[1];
        if (!id) continue;
        const t = (entry.match(/<title>([^<]+)/) || [])[1] || '';
        const rec = {
          id, ch: ch.id, chN: ch.n, cat: ch.cat, t,
          d: ((entry.match(/<published>([^<]+)/) || [])[1] || '').slice(0, 10),
          views: +((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || 0),
          likes: +((entry.match(/<media:starRating count="(\d+)"/) || [])[1] || 0),
          tags: tagsOf(t),
        };
        if (!safn[id]) added++;
        safn[id] = { ...(safn[id] || {}), ...rec };
      }
    }
    // /videos backfill: eldri myndbönd úr fyrstu síðu ytInitialData (án framhalds)
    if (vidR.ok) {
      const html = await vidR.text();
      for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([^"]+)".{0,900}?"title":\{"runs":\[\{"text":"([^"]{3,180})"/g)) {
        const id = m[1];
        if (safn[id]) continue;
        const seg = html.slice(m.index, m.index + 2200);
        const viewTxt = (seg.match(/"viewCountText":\{"simpleText":"([^"]+)"/) || [])[1] || '';
        const t = m[2].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
        safn[id] = { id, ch: ch.id, chN: ch.n, cat: ch.cat, t, d: null, views: parseViews(viewTxt), likes: null, tags: tagsOf(t), bf: 1 };
        added++;
      }
    }
    if (aboutR.ok) {
      const html = await aboutR.text();
      subs = parseSubs((html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) || html.match(/([\d.,]+[KM]?) subscribers/) || [])[1]);
    }
  } catch (e) {}
  return { added, subs };
}

async function main() {
  const ras = JSON.parse(fs.readFileSync(G('ytras.json'), 'utf8'));
  let safn = {};
  try { safn = JSON.parse(fs.readFileSync(G('ytsafn.json'), 'utf8')).videos || {}; } catch (e) {}
  const chanMeta = {};
  let i = 0;
  for (const ch of ras.chans) {
    const { added, subs } = await harvestChannel(ch, safn);
    chanMeta[ch.id] = { n: ch.n, cat: ch.cat, subs, added };
    i++;
    if (i % 10 === 0) console.log('  …', i, '/', ras.chans.length, 'rásir ·', Object.keys(safn).length, 'myndbönd');
    await sleep(250);
  }
  const vids = Object.values(safn);
  // ── GREINING: samantektir ──
  const perTag = {}; const perCat = {}; const perChan = {};
  for (const v of vids) {
    (v.tags || []).forEach((tg) => { perTag[tg] = perTag[tg] || { n: 0, views: 0 }; perTag[tg].n++; perTag[tg].views += v.views || 0; });
    perCat[v.cat] = perCat[v.cat] || { n: 0, views: 0 }; perCat[v.cat].n++; perCat[v.cat].views += v.views || 0;
    perChan[v.ch] = perChan[v.ch] || { n: 0, views: 0, likes: 0, likesN: 0 };
    perChan[v.ch].n++; perChan[v.ch].views += v.views || 0;
    if (v.likes != null) { perChan[v.ch].likes += v.likes; perChan[v.ch].likesN++; }
  }
  const chans = ras.chans.map((c) => { const m = chanMeta[c.id] || {}; const s = perChan[c.id] || {}; return { id: c.id, n: c.n, cat: c.cat, subs: m.subs ?? null, vids: s.n || 0, views: s.views || 0, avgLikes: s.likesN ? Math.round(s.likes / s.likesN) : null }; });
  const outSafn = { updated: new Date().toISOString(), n: vids.length, note: 'RSS(15 nýjustu, m. views+likes) + /videos-forsíðubackfill(~30, views) per rás; safnið vex daglega — full baksaga rásar krefst YouTube Data API lykils.', videos: safn };
  const outGrein = { updated: new Date().toISOString(), nVideos: vids.length, nChans: chans.length, perTag, perCat, chans, topVideos: vids.filter((v) => v.views).sort((a, b) => b.views - a.views).slice(0, 25).map((v) => ({ t: v.t, chN: v.chN, views: v.views, likes: v.likes, d: v.d, id: v.id })) };
  fs.writeFileSync(G('ytsafn.json'), JSON.stringify(outSafn));
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(G('ytgreining.json'), JSON.stringify(outGrein));
  fs.writeFileSync(path.join(PUB, 'ytgreining.json'), JSON.stringify(outGrein));
  console.log('Skrifað: ytsafn.json (' + vids.length + ' myndbönd) + ytgreining.json ·', chans.length, 'rásir · tögg:', Object.entries(perTag).map(([k, v]) => k + ':' + v.n).join(' '));
}
main().catch((e) => { console.error(e); process.exit(1); });
