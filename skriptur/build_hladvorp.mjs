// build_hladvorp.mjs — HLAÐVARPSVAKTIN (22.8.2026). Tvö lög, bæði keyrð í nætur-CI (refresh-data.yml):
//
//  1) LÝSIGÖGN (alltaf, ókeypis): gogn/hladvorp_feeds.json (11 sannreynd opin RSS) → þættir síðustu 21 daga
//     → web/public/gogn/hladvorp.json { updated, n, thaettir:[{ url, audio, show, source, title, lysing≤400,
//     d, min }] }. Lýsigögn eru opinber hvort eð er (RSS) og MÁ birta. Leitarorða-samsvörun á titil+lýsingu
//     gefur strax gildi í lobbyvakt/póstvakt — án talgreiningar.
//
//  2) TALGREINING (gated á CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID — sömu lyklar og D1): nýir þættir valdir
//     undir kostnaðar-þökum (hladvorp_lib.veljaThaetti: ≤450 mín / ≤30 þættir per keyrslu, per-feed þak, lengdar-
//     þak per feed) → mp3 sótt → ffmpeg 16 kHz mono 32 kbps í 5 mín BÚTA → Workers AI
//     `@cf/openai/whisper-large-v3-turbo` (REST, base64, language=is; 4 bútar samtímis) → textar límdir saman →
//     D1-taflan `hladvorp` um REST-hjálparann skriptur/lib/d1_rest.mjs (bundnar breytur; EKKI wrangler-CLI). ⚠ REPOIÐ ER PUBLIC → umritanir fara ALDREI í
//     gogn/, aðeins í D1 (einka); birting = stutt brot + hlekkur á þáttinn (höfundaréttar-varfærni, eins og news.body).
//     MÆLT 22.8.2026 á 90 s úr Speglinum: turbo-módelið gefur góða íslensku (nöfn/tölur rétt), ~4× rauntími;
//     gamla `@cf/openai/whisper` er ÓNOTHÆFT á íslensku. Verð $0,0005/mín og 10.000 neurons/dag FRÍ (≈214 mín/dag)
//     → nætur-þakið 450 mín kostar ≈ $0,12 → < 500 kr/mán. Valkvæmt: HLAD_ASR=openai + OPENAI_API_KEY → whisper-1
//     ($0,006/mín, ein skrá ≤25 MB) ef Workers AI bregst.
//     ⚠ CLOUDFLARE_API_TOKEN þarf heimildina „Workers AI: Read" (Account-stig) — annars 403/10000 → skýr villa.
//
// Án lykla: lag 2 sleppt með skilaboðum — lag 1 keyrir alltaf. Villur í stökum þáttum fella ekki keyrsluna.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { minOf, veljaThaetti, d1Stmts, HLAD_CREATE } from './hladvorp_lib.mjs';
import { makeD1 } from './lib/d1_rest.mjs';   // D1 um REST/database_id — EKKI `wrangler d1 execute tengsl` (nafna-uppfletting bregst í CI, sjá export_tengsl_fonix)
import { _rssItems } from '../web/src/worker/cron.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const UA = 'Mozilla/5.0 (KarpBot; +https://karp.is)';
const NU = Date.now();
const FRA = new Date(NU - 21 * 86400 * 1000).toISOString().slice(0, 10);

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'gogn', 'hladvorp_feeds.json'), 'utf8'));
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ── 1) Lýsigögn ──────────────────────────────────────────────
const thaettir = [];
for (const f of cfg.feeds) {
  try {
    const r = await fetch(f.feed, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.error('⚠', f.id, 'HTTP', r.status); continue; }
    const xml = await r.text();
    // _rssItems gefur title/url/date/desc — sækjum enclosure + duration sjálf per <item>
    const blocks = xml.split(/<item[\s>]/i).slice(1);
    const items = _rssItems(xml, f.source);
    let n = 0;
    for (let k = 0; k < items.length && k < blocks.length; k++) {
      const it = items[k], b = blocks[k];
      if (!it.date || it.date < FRA) continue;
      const audio = ((b.match(/<enclosure[^>]+url="([^"]+)"/i) || [])[1] || '').trim();
      if (!audio) continue;
      const dur = (b.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i) || [])[1];
      thaettir.push({
        url: it.url || audio, audio, show: f.show, source: f.source, feedId: f.id, p: f.p, maxMin: f.maxMin,
        title: strip(it.title).slice(0, 200), lysing: strip(it.desc).slice(0, 400), d: it.date, min: minOf(dur),
      });
      n++;
    }
    console.log('feed', f.id.padEnd(16), n, 'þættir sl. 21 daga');
  } catch (e) { console.error('⚠', f.id, String(e).slice(0, 100)); }
}
thaettir.sort((a, b) => b.d.localeCompare(a.d));
const metaOut = {
  updated: new Date().toISOString(), fra: FRA, n: thaettir.length,
  heimild: 'Opin RSS-feed íslenskra hlaðvarpa (sjá gogn/hladvorp_feeds.json) — lýsigögn eingöngu; umritanir eru ekki birtar, aðeins leitar-brot.',
  thaettir: thaettir.map(({ feedId, p, maxMin, ...keep }) => keep),
};
fs.mkdirSync(path.join(ROOT, 'web', 'public', 'gogn'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'web', 'public', 'gogn', 'hladvorp.json'), JSON.stringify(metaOut));
console.log('hladvorp.json:', thaettir.length, 'þættir frá', FRA);

// ── 2) Talgreining (gated) ───────────────────────────────────
const OAI = process.env.OPENAI_API_KEY;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN, CF_ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF = !!(CF_TOKEN && CF_ACC);
const ASR = (process.env.HLAD_ASR === 'openai' && OAI) ? 'openai' : 'cf';
if (!CF) {
  console.log('• Talgreining sleppt — engir Cloudflare-lyklar (þarf CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID fyrir D1 og Workers AI). Lýsigögnin duga í titla-vakt.');
  process.exit(0);
}
console.log('• Talgreining:', ASR === 'cf' ? 'Workers AI @cf/openai/whisper-large-v3-turbo (5 mín bútar, 4 samtímis)' : 'OpenAI whisper-1');
// Greining á tókanum ÁÐUR en nokkurt hljóð er sótt: hvaða tóki (ID) og hefur hann Workers AI-heimild?
if (ASR === 'cf') {
  try {
    // Tveir verify-endapunktar: notanda-tóki (My Profile) vs ACCOUNT-tóki (Manage Account → API Tokens) — segir hvar á að breyta honum
    const vU = await (await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { authorization: 'Bearer ' + CF_TOKEN } })).json().catch(() => null);
    const vA = await (await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACC + '/tokens/verify', { headers: { authorization: 'Bearer ' + CF_TOKEN } })).json().catch(() => null);
    const tid = (vU && vU.success && vU.result && vU.result.id) ? vU.result.id + ' (NOTANDA-tóki: My Profile → API Tokens)' : (vA && vA.success && vA.result && vA.result.id) ? vA.result.id + ' (ACCOUNT-tóki: Manage Account → API Tokens)' : '? (' + JSON.stringify((vU && vU.errors) || vU).slice(0, 120) + ')';
    const m = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACC + '/ai/models/search?per_page=1', { headers: { authorization: 'Bearer ' + CF_TOKEN } });
    const mj = await m.json().catch(() => null);
    if (m.ok && mj && mj.success) console.log('• Tóki', tid, '— Workers AI-heimild STAÐFEST (models/search OK)');
    else {
      console.error('⛔ Tóki', tid, 'hefur EKKI Workers AI-heimild:', JSON.stringify((mj && mj.errors) || m.status).slice(0, 200));
      console.error('   → Cloudflare → My Profile → API Tokens → tókinn með ÞETTA ID (sést í Edit/summary) → bæta við „Account · Workers AI · Read" → Continue → UPDATE TOKEN.');
      process.exit(1);
    }
  } catch (e) { console.error('⚠ tóka-greining brást:', String(e).slice(0, 120)); }
}

// Workers AI REST: einn bútur (≤ ~1,3 MB mp3 → base64) → texti. Skýr villa ef token vantar Workers AI-heimild.
async function cfWhisper(buf) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + CF_ACC + '/ai/run/@cf/openai/whisper-large-v3-turbo', {
    method: 'POST', headers: { authorization: 'Bearer ' + CF_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ audio: buf.toString('base64'), task: 'transcribe', language: 'is' }), signal: AbortSignal.timeout(240000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.success === false) {
    const msg = (j && j.errors && j.errors.map((e) => e.code + ' ' + e.message).join('; ')) || ('HTTP ' + r.status);
    if (r.status === 401 || r.status === 403 || /10000|Authentication|permission/i.test(msg)) throw new Error('Workers AI auth: ' + msg + ' → bæta heimildinni „Workers AI: Read" við CLOUDFLARE_API_TOKEN');
    throw new Error('Workers AI: ' + msg);
  }
  return String((j.result && j.result.text) || '').trim();
}
async function oaiWhisper(file) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), 'ep.mp3');
  form.append('model', 'whisper-1'); form.append('language', 'is'); form.append('response_format', 'text');
  const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + OAI }, body: form, signal: AbortSignal.timeout(600000) });
  if (!tr.ok) throw new Error('whisper HTTP ' + tr.status + ' ' + (await tr.text()).slice(0, 120));
  return (await tr.text()).trim();
}
// Bútar í röð með takmörkuðum samtímis-fjölda; textar límdir í upprunalegri röð.
async function pmap(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
// D1 um REST (sömu skilríki og Workers AI). Taflan búin til STRAX svo D1-heimildin sannist óháð talgreiningu.
const d1 = makeD1(path.join(ROOT, 'web'));
let done = new Set();
try {
  await d1.query(HLAD_CREATE);
  const rows = await d1.query("SELECT url FROM hladvorp WHERE ts > strftime('%s','now') - 45*86400");
  done = new Set(rows.map((r) => r.url));
  console.log('• D1 hladvorp-tafla klár —', done.size, 'þættir þegar umritaðir sl. 45 daga');
} catch (e) { console.error('✗ D1 REST brást (þarf „D1: Edit" á CLOUDFLARE_API_TOKEN):', String(e).slice(0, 200)); process.exit(1); }

const { valdir, minSum, sleppt } = veljaThaetti(thaettir.filter((t) => t.d >= new Date(NU - 7 * 86400 * 1000).toISOString().slice(0, 10)), done, { perFeed: Object.fromEntries(cfg.feeds.filter((f) => f.maxEpRun).map((f) => [f.id, f.maxEpRun])) });
console.log('Til umritunar:', valdir.length, 'þættir ≈', minSum, 'mín | sleppt:', JSON.stringify(sleppt));

const TMP = fs.mkdtempSync(path.join(ROOT, 'hlad-'));
const rows = [];
for (const ep of valdir) {
  const raw = path.join(TMP, 'raw'), enc = path.join(TMP, 'enc.mp3'), seg = path.join(TMP, 'seg_%03d.mp3');
  try {
    const r = await fetch(ep.audio, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error('audio HTTP ' + r.status);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    let texti = '';
    if (ASR === 'cf') {
      // 5 mín bútar (≈1,2 MB hver við 32 kbps) → base64 ≈ 1,6 MB per REST-kall; 4 samtímis
      execFileSync('ffmpeg', ['-y', '-i', raw, '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'segment', '-segment_time', '300', '-reset_timestamps', '1', seg], { stdio: 'ignore' });
      const parts = fs.readdirSync(TMP).filter((f) => /^seg_\d+\.mp3$/.test(f)).sort();
      if (!parts.length) throw new Error('ffmpeg gaf enga búta');
      const textar = await pmap(parts, 4, (f) => cfWhisper(fs.readFileSync(path.join(TMP, f))));
      texti = textar.join(' ').replace(/\s+/g, ' ').trim();
      for (const f of parts) { try { fs.unlinkSync(path.join(TMP, f)); } catch (e2) {} }
    } else {
      execFileSync('ffmpeg', ['-y', '-i', raw, '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'mp3', enc], { stdio: 'ignore' });
      const mb = fs.statSync(enc).size / 1048576;
      if (mb > 24.5) throw new Error('of stór eftir þjöppun: ' + mb.toFixed(1) + ' MB');
      texti = await oaiWhisper(enc);
    }
    if (texti.length < 100) throw new Error('umritun tóm/stutt (' + texti.length + ')');
    rows.push({ url: ep.url, show: ep.show, title: ep.title, ts: Math.floor(new Date(ep.d + 'T12:00:00Z').getTime() / 1000), dur: ep.min || 0, texti });
    console.log('✓', ep.d, ep.show.slice(0, 22), '·', ep.title.slice(0, 46), '·', texti.length, 'stafir');
  } catch (e) {
    console.error('✗', ep.show.slice(0, 22), ep.title.slice(0, 40), String(e).slice(0, 160));
    if (/Workers AI auth/.test(String(e))) { console.error('⛔ Hætti: Workers AI-heimild vantar á tókann — engin ástæða að reyna fleiri þætti.'); break; }
  }
  finally { for (const f of [raw, enc]) { try { fs.unlinkSync(f); } catch (e2) {} } }
}
if (rows.length) {
  let n = 0;
  for (const st of d1Stmts(rows, Math.floor(NU / 1000))) { await d1.query(st.sql, st.params); if (st.sql.startsWith('INSERT')) n++; }
  console.log('D1: skrifaðir', n, 'þættir í hladvorp-töfluna (REST, bundnar breytur)');
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('Búið:', rows.length, 'umritaðir af', valdir.length, 'völdum.');
