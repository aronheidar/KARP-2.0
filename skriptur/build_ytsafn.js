// ─────────────────────────────────────────────────────────────
// build_ytsafn.js (LOTA 34A; API-uppfærð LOTA 40) — UPPSKERA + GREINING YouTube-safnsins.
// TVÆR uppskeruleiðir, valdar sjálfkrafa:
//   A) YOUTUBE_API_KEY sett (umhverfi eða .env) → YouTube Data API v3:
//      channels.list (nákvæmir áskrifendur, 50 rásir/kall) + playlistItems á
//      uploads-lista (FULL baksaga að BACKFILL_FROM, þak PAGE_CAP síður/rás) +
//      videos.list (nákvæm views/likes/dags/titill fyrir ÖLL myndbönd safnsins,
//      50/kall — áhorfstölur alls safnsins endurnýjast daglega).
//      Kvóti: ~200-400 einingar/dag af 10.000 fríum — margfalt borð.
//   B) enginn lykill → gamla keyless-leiðin: RSS (15 nýjustu) + /videos-skrap
//      (~30) + /about-áskrifendaskrap. CI án secrets virkar áfram.
// SAFNIÐ VEX: myndbönd leggjast við gogn/ytsafn.json (lyklað á myndbands-id,
// aldrei eytt) — dagleg keyrsla í cron grípur nýtt efni.
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

// ── YouTube Data API v3 (LOTA 40) ──
function loadYtKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^YOUTUBE_API_KEY=(.+)$/m);
    return m && !/SETTU/.test(m[1]) ? m[1].trim() : null;
  } catch (e) { return null; }
}
const API_KEY = loadYtKey();
const BACKFILL_FROM = '2023-01-01'; // hve langt aftur baksagan er sótt við fyrstu keyrslu
const PAGE_CAP = 10;                // þak: 10 síður × 50 = 500 myndbönd/rás
const api = async (ep, params) => {
  const u = new URL('https://www.googleapis.com/youtube/v3/' + ep);
  Object.entries({ ...params, key: API_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error('YT API ' + r.status + ' (' + ep + '): ' + (await r.text()).slice(0, 200));
  return r.json();
};
const chunk = (arr, n) => arr.reduce((a, x, i) => (i % n ? a[a.length - 1].push(x) : a.push([x]), a), []);

async function harvestApi(ras, safn) {
  const chanMeta = {};
  // 1) rásir: nákvæmir áskrifendur + uploads-playlisti (50 rásir per kall)
  const uploads = {};
  for (const c of chunk(ras.chans, 50)) {
    const j = await api('channels', { part: 'statistics,contentDetails', id: c.map((x) => x.id).join(','), maxResults: 50 });
    for (const it of j.items || []) {
      uploads[it.id] = (it.contentDetails && it.contentDetails.relatedPlaylists && it.contentDetails.relatedPlaylists.uploads) || null;
      const ch = ras.chans.find((x) => x.id === it.id);
      chanMeta[it.id] = { n: ch && ch.n, cat: ch && ch.cat, subs: it.statistics && it.statistics.subscriberCount != null ? +it.statistics.subscriberCount : null, added: 0 };
    }
  }
  // 2) uppgötvun: uploads-listi per rás — nýtt efni + baksaga að BACKFILL_FROM
  for (const ch of ras.chans) {
    const pl = uploads[ch.id];
    if (!pl) { chanMeta[ch.id] = chanMeta[ch.id] || { n: ch.n, cat: ch.cat, subs: null, added: 0 }; continue; }
    let tok = null, pages = 0;
    paging: while (pages < PAGE_CAP) {
      let j;
      try { j = await api('playlistItems', { part: 'snippet', playlistId: pl, maxResults: 50, ...(tok ? { pageToken: tok } : {}) }); } catch (e) { break; }
      pages++;
      let anyNew = false;
      for (const it of j.items || []) {
        const id = it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId;
        if (!id) continue;
        const d = (it.snippet.publishedAt || '').slice(0, 10);
        if (!safn[id]) {
          safn[id] = { id, ch: ch.id, chN: ch.n, cat: ch.cat, t: it.snippet.title || '', d, views: null, likes: null, tags: tagsOf(it.snippet.title || '') };
          chanMeta[ch.id].added++;
          anyNew = true;
        }
        if (d && d < BACKFILL_FROM) break paging; // komin aftur fyrir gluggann
      }
      if (!anyNew) break;       // öll síðan þekkt → safnið nær þegar hingað aftur
      tok = j.nextPageToken;
      if (!tok) break;
      await sleep(60);
    }
  }
  // 3) stöðutölur: nákvæm views/likes/dags/titill fyrir ÖLL myndbönd safnsins
  const ids = Object.keys(safn);
  for (const c of chunk(ids, 50)) {
    let j;
    try { j = await api('videos', { part: 'snippet,statistics', id: c.join(',') }); } catch (e) { continue; }
    for (const it of j.items || []) {
      const v = safn[it.id];
      if (!v) continue;
      if (it.snippet && it.snippet.title) { v.t = it.snippet.title; v.tags = tagsOf(v.t); }
      if (it.snippet && it.snippet.publishedAt) v.d = it.snippet.publishedAt.slice(0, 10);
      if (it.statistics && it.statistics.viewCount != null) v.views = +it.statistics.viewCount;
      if (it.statistics && it.statistics.likeCount != null) v.likes = +it.statistics.likeCount;
      delete v.bf;
    }
    await sleep(40);
  }
  return chanMeta;
}

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
  let chanMeta = {};
  if (API_KEY) {
    console.log('YouTube Data API v3 — nákvæm uppskera á', ras.chans.length, 'rásum (baksaga að ' + BACKFILL_FROM + ')…');
    chanMeta = await harvestApi(ras, safn);
  } else {
    console.log('Enginn YOUTUBE_API_KEY — keyless RSS/skrap-uppskera…');
    let i = 0;
    for (const ch of ras.chans) {
      const { added, subs } = await harvestChannel(ch, safn);
      chanMeta[ch.id] = { n: ch.n, cat: ch.cat, subs, added };
      i++;
      if (i % 10 === 0) console.log('  …', i, '/', ras.chans.length, 'rásir ·', Object.keys(safn).length, 'myndbönd');
      await sleep(250);
    }
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
  const outSafn = { updated: new Date().toISOString(), n: vids.length, note: API_KEY ? 'YouTube Data API v3: full baksaga að ' + BACKFILL_FROM + ' (þak ' + PAGE_CAP * 50 + '/rás), nákvæmir áskrifendur og views/likes endurnýjuð daglega fyrir allt safnið.' : 'RSS(15 nýjustu, m. views+likes) + /videos-forsíðubackfill(~30, views) per rás; safnið vex daglega — full baksaga rásar krefst YouTube Data API lykils.', videos: safn };
  const outGrein = { updated: new Date().toISOString(), nVideos: vids.length, nChans: chans.length, perTag, perCat, chans, topVideos: vids.filter((v) => v.views).sort((a, b) => b.views - a.views).slice(0, 25).map((v) => ({ t: v.t, chN: v.chN, views: v.views, likes: v.likes, d: v.d, id: v.id })) };
  fs.writeFileSync(G('ytsafn.json'), JSON.stringify(outSafn));
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(G('ytgreining.json'), JSON.stringify(outGrein));
  fs.writeFileSync(path.join(PUB, 'ytgreining.json'), JSON.stringify(outGrein));
  console.log('Skrifað: ytsafn.json (' + vids.length + ' myndbönd) + ytgreining.json ·', chans.length, 'rásir · tögg:', Object.entries(perTag).map(([k, v]) => k + ':' + v.n).join(' '));
}
main().catch((e) => { console.error(e); process.exit(1); });
