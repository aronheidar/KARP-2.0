// ─────────────────────────────────────────────────────────────
// lthing.mjs — yfirstandandi löggjafarþing fyrir worker-leiðir (biðlarahlið/edge).
//
// Af hverju (23.9.2026): `/api/thingmal` í web/worker.js var FAST proxy á
// `thingmalalisti/?lthing=157`. 158. þing hófst í september 2026, svo „Frá Alþingi"
// -straumurinn á /thingmal/ sýndi mál LIÐINS þings — og gerði það þögult, því svarið
// var fullgilt XML með fullt af málum. Ekkert benti til þess að neitt væri að.
//
// Node-hliðin á sitt eigið `nuverandiThing()` í skriptur/_seigla.js (CJS, með eigin
// skyndiminni í ferli). Hér þarf edge-útgáfu: Cache API í stað ferlisminnis og
// engin fs. Þáttunin er sú sama í reynd — hæsta `<þing númer='N'>` í svarinu.
//
// ⚠ SEIGLA: ein 429-lota frá althingi.is má ekki fella strauminn. Þingnúmerið er geymt
//   tvisvar: stutt færsla sem venjuleg uppfletting notar, og LÖNG færsla sem er aðeins
//   lesin þegar veitan bilar. Síðasta þekkta þing er réttara en ekkert — en við
//   giskum ALDREI á fasta tölu, það var einmitt villan sem þetta leysir.
// ─────────────────────────────────────────────────────────────

export const LTHING_TTL = 43200;          // 12 klst — þing skiptir um einu sinni á ári
export const LTHING_SEIGLA_TTL = 2592000; // 30 dagar — aðeins notuð þegar veitan bilar

const LYKILL = 'https://cache.karp.internal/_lthing';
const LYKILL_SIDAST = 'https://cache.karp.internal/_lthing-sidast';
const UPPSPRETTA = 'https://www.althingi.is/altext/xml/loggjafarthing/yfirstandandi/';
const UA = { 'User-Agent': 'karp.is dashboard (aronheidars@gmail.com)' };

// Hæsta þingnúmerið í svarinu. Skilar null fyrir rusl — ALDREI 0 og engin ágiskun,
// svo kallandinn geti greint „veit ekki" frá gildu númeri.
export function lesaThingNumer(xml) {
  const nr = (String(xml || '').match(/<þing\s+númer='(\d+)'/g) || [])
    .map((m) => +m.replace(/\D/g, ''))
    .filter((n) => n > 0);
  return nr.length ? Math.max(...nr) : null;
}

export function thingmalSlod(lthing) {
  return 'https://www.althingi.is/altext/xml/thingmalalisti/?lthing=' + lthing;
}

async function lesaMinni(cache, url) {
  const hit = await cache.match(new Request(url));
  if (!hit) return null;
  const n = parseInt((await hit.text()).trim(), 10);
  return n > 0 ? n : null;
}

export async function nuverandiThing({ cache, ctx, fetchImpl = fetch } = {}) {
  const fyrir = await lesaMinni(cache, LYKILL);
  if (fyrir) return fyrir;

  let nytt = null;
  try {
    const r = await fetchImpl(UPPSPRETTA, { headers: UA });
    if (r.ok) nytt = lesaThingNumer(await r.text());
  } catch (e) { /* fellur í seigluna að neðan */ }

  if (nytt) {
    const geyma = (url, ttl) => cache.put(new Request(url),
      new Response(String(nytt), { headers: { 'cache-control': 'public, max-age=' + ttl } }));
    const p = Promise.all([geyma(LYKILL, LTHING_TTL), geyma(LYKILL_SIDAST, LTHING_SEIGLA_TTL)]);
    if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
    return nytt;
  }

  const sidast = await lesaMinni(cache, LYKILL_SIDAST);
  if (sidast) return sidast;
  throw new Error('lthing: veitan svarar ekki og ekkert þekkt þing í skyndiminni');
}
