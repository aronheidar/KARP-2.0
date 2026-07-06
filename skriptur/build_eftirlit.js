// ─────────────────────────────────────────────────────────────
// 🍽️ EFTIRLITSVAKTIN (LOTA 89) — skrá metinna matvæla-/veitingastaða RVK
// Opinberar niðurstöður Heilbrigðiseftirlits Reykjavíkur (HER) → gogn/eftirlit.json
// fyrir /eftirlit/ (leitanleg skrá + topplisti + dreifing). Prófílflísin (LOTA 88)
// notar lifandi worker /api/eftirlit; ÞESSI skripta bakar heildarskrána fyrir vöktina.
//
// HEIMILD: https://her.reykjavik.is  (OPINN GET, ekkert cookie/token)
//   GET /?q=<póstnúmer>&o=name → allir staðir í hverfinu (server-HTML, engin síðuskipting).
//   Kvarði 0–5 (0 verst). Skýrsla: /embed/<uuid>/. ⚠ AÐEINS Reykjavík.
//   Sjá memory/iceland-her-eftirlit-api.md.
//
// ⚠ HÓFSEMI: AFMARKAÐUR crawl — ítrar RVK-póstnúmer (~30 köll, 1,2s töf), afþúppar á uuid.
//   ENGIN brute-force á allri skránni (6.730 staðir); póstnúmer skila öllum metnum stöðum.
// KEYRSLA: node skriptur/build_eftirlit.js
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const OUT = [path.join(__dirname, '..', 'gogn'), path.join(__dirname, '..', 'web', 'public', 'gogn')];
const BASE = 'https://her.reykjavik.is';
const UA = { 'user-agent': 'KarpBot/1.0 (+https://karp.is; hagvísir)', 'accept-language': 'is', referer: 'https://reykjavik.is/' };

const LABEL = {
  5: 'Kröfur uppfylltar / fáeinar ábendingar', 4: 'Fáein frávik / ábendingar',
  3: 'Frávik / ábendingar', 2: 'Aðkallandi frávik / ábendingar',
  1: 'Starfsemi takmörkuð / stöðvuð að hluta', 0: 'Starfsemi stöðvuð',
};
// Crawl-fyrirspurnir: RVK-póstnúmer (landfræðileg þekja) + flokka-leitarorð (ná stöðum sem
// tokenast ekki á póstnúmeri). Afþúppað á uuid → engin tvítalning. Afmarkað, ekki brute-force.
const POSTNR = ['101','102','103','104','105','107','108','109','110','111','112','113','116','121','123','124','125','127','128','129','130','132','150','155','161','162','170','200','203','210','270'];
const KEYWORDS = ['kaffi','bar','veitinga','veitingahús','veitingastaður','pizza','pizzur','sushi','grill','bakarí','hótel','veisla','mötuneyti','ísbúð','söluturn','kjöt','fiskur','matur','matvöru','verslun','búð','vín','kaffihús','mathöll','bistro','pub','skóli','leikskóli','hjúkrunar','deli','hamborgara','bakstur','matvæli','krá'];
const QUERIES = [...POSTNR, ...KEYWORDS];

const MONTHS = { 'janúar':1,'febrúar':2,'mars':3,'apríl':4,'maí':5,'júní':6,'júlí':7,'ágúst':8,'september':9,'október':10,'nóvember':11,'desember':12 };
function toISO(is) { const m=(is||'').match(/(\d{1,2})\.\s*([a-záðéíóúýþæö]+)\s*(\d{4})/i); if(!m||!MONTHS[m[2].toLowerCase()])return null; return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`; }

function parseHER(html) {
  const out = [];
  const parts = html.split('card-title">').slice(1);
  for (const raw of parts) {
    const seg = raw.split('card-title">')[0];
    const name = ((seg.match(/^([^<]+)</) || [])[1] || '').trim();
    const km = seg.match(/\((\d{6})-(\d{4})\)/);
    const kt = km ? km[1] + km[2] : null;
    let street=null, postnr=null, city=null;
    const sub = seg.match(/card-subtitle[^>]*>([\s\S]*?)<\/h6>/);
    if (sub) {
      const s = sub[1].replace(/<br\s*\/?>/gi,'|').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
      const m = s.match(/^(.*?)\|?\s*(\d{3})\s+(.+)$/);
      if (m) { street=m[1].replace(/\|/g,' ').replace(/,\s*$/,'').trim(); postnr=m[2]; city=m[3].trim(); }
      else street = s.replace(/\|/g,' ').trim();
    }
    const rs = seg.match(/text-right">\s*<span>(\d)<\/span>/) || seg.match(/<span>(\d)<\/span>\s*<i class="fas/);
    const rating = rs ? +rs[1] : null;
    const dt = ((seg.match(/Síðasta eftirlit:<\/strong>\s*([^<]+?)\s*<\/?/) || seg.match(/Síðasta eftirlit:\s*([^<]+?)</) || [])[1] || '').trim() || null;
    const uuid = (seg.match(/\/embed\/([0-9a-f-]{36})\//) || [])[1] || null;
    out.push({ name, kt, street, postnr, city, rating, lastInspection: dt, lastInspectionISO: toISO(dt), uuid });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchQ(q, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/?o=name&q=${encodeURIComponent(q)}`, { headers: UA });
      if (r.status === 200) return parseHER(await r.text());
      console.warn(`  q=${q} → HTTP ${r.status}${i < tries-1 ? ' — bíð 4s' : ' — sleppi'}`);
    } catch (e) { console.warn(`  q=${q} → ${e.message}`); }
    if (i < tries - 1) await sleep(4000);
  }
  return [];
}

(async () => {
  const byUuid = new Map();
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    const rows = await fetchQ(q);
    let added = 0;
    for (const x of rows) {
      if (x.rating == null || !x.uuid) continue;      // aðeins metnir staðir m/ skýrslu
      if (byUuid.has(x.uuid)) continue;
      byUuid.set(x.uuid, {
        name: x.name, kt: x.kt, street: x.street, postnr: x.postnr, city: x.city,
        rating: x.rating, ratingLabel: LABEL[x.rating],
        lastInspection: x.lastInspection, lastInspectionISO: x.lastInspectionISO,
        uuid: x.uuid, reportUrl: `${BASE}/embed/${x.uuid}/`,
      });
      added++;
    }
    process.stdout.write(`[${i+1}/${QUERIES.length}] q=${q}: ${rows.length} staðir, +${added} nýir (alls ${byUuid.size})\n`);
    if (i < QUERIES.length - 1) await sleep(1200);      // ⚠ hófsemi
  }

  const stadir = [...byUuid.values()].sort((a, b) => (a.rating - b.rating) || (b.lastInspectionISO || '').localeCompare(a.lastInspectionISO || ''));
  const dist = [0,0,0,0,0,0];
  stadir.forEach((s) => { dist[s.rating]++; });
  const avg = stadir.length ? Math.round((stadir.reduce((a, s) => a + s.rating, 0) / stadir.length) * 100) / 100 : null;

  const data = {
    updated: new Date().toISOString(),
    source: 'Heilbrigðiseftirlit Reykjavíkur (her.reykjavik.is)',
    scope: 'Reykjavík — opinbert matvæla-/heilbrigðiseftirlit, kvarði 0–5 (0 verst)',
    labels: LABEL, count: stadir.length, avg, dist, stadir,
  };
  const s = JSON.stringify(data);
  OUT.forEach((dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'eftirlit.json'), s); });
  console.log(`\neftirlit.json — ${stadir.length} metnir staðir | meðaltal ${avg} | dreifing[0..5] ${dist.join(',')} | ${(s.length/1024).toFixed(0)} KB`);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
