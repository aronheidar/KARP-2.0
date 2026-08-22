// build_hladvorp.mjs — HLAÐVARPSVAKTIN (22.8.2026). Tvö lög, bæði keyrð í nætur-CI (refresh-data.yml):
//
//  1) LÝSIGÖGN (alltaf, ókeypis): gogn/hladvorp_feeds.json (11 sannreynd opin RSS) → þættir síðustu 21 daga
//     → web/public/gogn/hladvorp.json { updated, n, thaettir:[{ url, audio, show, source, title, lysing≤400,
//     d, min }] }. Lýsigögn eru opinber hvort eð er (RSS) og MÁ birta. Leitarorða-samsvörun á titil+lýsingu
//     gefur strax gildi í lobbyvakt/póstvakt — án talgreiningar.
//
//  2) TALGREINING (gated á OPENAI_API_KEY + CLOUDFLARE_API_TOKEN/ACCOUNT_ID): nýir þættir valdir undir
//     kostnaðar-þökum (hladvorp_lib.veljaThaetti: ≤450 mín / ≤30 þættir per keyrslu, per-feed þak, lengdar-þak
//     per feed) → mp3 sótt → ffmpeg 16 kHz mono 32 kbps (45 mín ≈ 11 MB < 25 MB API-þak) → OpenAI whisper-1
//     (language=is) → texti í D1-töfluna `hladvorp` um `wrangler d1 execute tengsl --remote` (sama auðkenning
//     og export_tengsl_fonix.mjs). ⚠ REPOIÐ ER PUBLIC → umritanir fara ALDREI í gogn/, aðeins í D1 (einka);
//     birting til notenda er stutt brot + hlekkur á þáttinn (höfundaréttar-varfærni, sama nálgun og news.body).
//     Kostnaður: whisper-1 $0.006/mín → full keyrsla ≈ $2,7/dag ≈ ~11 þús. kr/mán; raun minni (færri nýir þættir).
//
// Án lykla: lag 2 sleppt með skilaboðum — lag 1 keyrir alltaf. Villur í stökum þáttum fella ekki keyrsluna.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { minOf, veljaThaetti, d1Batch } from './hladvorp_lib.mjs';
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
const CF = process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID;
if (!OAI || !CF) {
  console.log('• Talgreining sleppt —', !OAI ? 'enginn OPENAI_API_KEY' : '', !CF ? 'engir Cloudflare-lyklar' : '', '(lýsigögnin duga í titla-vakt).');
  process.exit(0);
}
const wrangler = (args, opts) => execFileSync('npx', ['wrangler', ...args], Object.assign({ cwd: path.join(ROOT, 'web'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }, opts || {}));

// Hvað er þegar umritað? (engin state-skrá — D1 er sannleikurinn)
let done = new Set();
try {
  const out = wrangler(['d1', 'execute', 'tengsl', '--remote', '--json', '--command', "SELECT url FROM hladvorp WHERE ts > strftime('%s','now') - 45*86400"]);
  const j = JSON.parse(out);
  done = new Set(((j[0] && j[0].results) || []).map((r) => r.url));
} catch (e) { console.log('• hladvorp-tafla ekki til enn (fyrsta keyrsla) — allt telst nýtt.'); }

const { valdir, minSum, sleppt } = veljaThaetti(thaettir.filter((t) => t.d >= new Date(NU - 7 * 86400 * 1000).toISOString().slice(0, 10)), done, { perFeed: Object.fromEntries(cfg.feeds.filter((f) => f.maxEpRun).map((f) => [f.id, f.maxEpRun])) });
console.log('Til umritunar:', valdir.length, 'þættir ≈', minSum, 'mín | sleppt:', JSON.stringify(sleppt));

const TMP = fs.mkdtempSync(path.join(ROOT, 'hlad-'));
const rows = [];
for (const ep of valdir) {
  const raw = path.join(TMP, 'raw'), enc = path.join(TMP, 'enc.mp3');
  try {
    const r = await fetch(ep.audio, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error('audio HTTP ' + r.status);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    execFileSync('ffmpeg', ['-y', '-i', raw, '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'mp3', enc], { stdio: 'ignore' });
    const mb = fs.statSync(enc).size / 1048576;
    if (mb > 24.5) throw new Error('of stór eftir þjöppun: ' + mb.toFixed(1) + ' MB');
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(enc)], { type: 'audio/mpeg' }), 'ep.mp3');
    form.append('model', 'whisper-1');
    form.append('language', 'is');
    form.append('response_format', 'text');
    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + OAI }, body: form, signal: AbortSignal.timeout(600000) });
    if (!tr.ok) throw new Error('whisper HTTP ' + tr.status + ' ' + (await tr.text()).slice(0, 120));
    const texti = (await tr.text()).trim();
    if (texti.length < 100) throw new Error('umritun tóm/stutt (' + texti.length + ')');
    rows.push({ url: ep.url, show: ep.show + (ep.source && ep.source !== ep.show ? '' : ''), title: ep.title, ts: Math.floor(new Date(ep.d + 'T12:00:00Z').getTime() / 1000), dur: ep.min || 0, texti });
    console.log('✓', ep.d, ep.show.slice(0, 22), '·', ep.title.slice(0, 46), '·', texti.length, 'stafir');
  } catch (e) { console.error('✗', ep.show.slice(0, 22), ep.title.slice(0, 40), String(e).slice(0, 110)); }
  finally { for (const f of [raw, enc]) { try { fs.unlinkSync(f); } catch (e2) {} } }
}
if (rows.length) {
  const sqlPath = path.join(TMP, 'batch.sql');
  fs.writeFileSync(sqlPath, d1Batch(rows, Math.floor(NU / 1000)));
  wrangler(['d1', 'execute', 'tengsl', '--remote', '--file', sqlPath]);
  console.log('D1: skrifaðir', rows.length, 'þættir í hladvorp-töfluna');
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('Búið:', rows.length, 'umritaðir af', valdir.length, 'völdum.');
