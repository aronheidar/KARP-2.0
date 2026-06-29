// AI-samantektir á þingmálum → bætir `sam` (ein setning, einfalt íslenskt mál) við
// hvert frumvarp í frumvorp.json. Byggt á greinargerð málsins (greinargerð = manngerð
// skýring á tilgangi máls) + titli + efnisgreiningu — STRANGT án skáldskapar (borgaratól).
//
// KEYRSLA:
//   1) npm install @anthropic-ai/sdk          (einu sinni — bætt í package.json)
//   2) set ANTHROPIC_API_KEY=sk-ant-...        (PowerShell: $env:ANTHROPIC_API_KEY='sk-ant-...')
//   3) node skriptur/build_summaries.js
//   → svo: node build_embed.js  (bakar sam-textann inn í karp-data.txt)
//
// SKYNDIMINNI: samantektir geymast í gogn/samantektir.json (lykill: "157_<málsnr>").
//   build_frumvorp.js endurskrifar frumvorp.json frá grunni — þetta skript les minnið og
//   ENDURNÝTIR fyrri samantektir ókeypis (þarf hvorki lykil né SDK fyrir það). Aðeins NÝ mál
//   kalla á API. Þannig kostar vikuleg endurnýjun nær ekkert eftir fyrstu keyrslu, og þótt
//   lykilinn vanti í refresh-keyrslu haldast eldri samantektir (þær eru skrifaðar úr minni).
//
// MODEL: claude-opus-4-8 (sjálfgefið — nákvæmast). Hægt að skipta: set KARP_SUMMARY_MODEL=claude-haiku-4-5
//   (~5x ódýrara). FORCE endurgerð allra: set KARP_RESUMMARIZE=1

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const LTHING = process.env.KARP_LTHING || '157';
const MODEL = process.env.KARP_SUMMARY_MODEL || 'claude-opus-4-8';
const FORCE = process.env.KARP_RESUMMARIZE === '1';
const CONCURRENCY = 4;

const SYSTEM = [
  'Þú skrifar stuttar, hlutlausar samantektir á íslenskum þingmálum fyrir almenning.',
  '',
  'Reglur:',
  '- Skrifaðu EINA setningu (að hámarki ~30 orð) á einföldu, skýru íslensku máli sem útskýrir um hvað málið snýst.',
  '- Byggðu EINGÖNGU á upplýsingunum sem fylgja (titill, efnisgreining, greinargerð). EKKI búa til staðreyndir, tölur, dagsetningar, stofnanir eða ákvæði sem koma ekki fram.',
  '- Vertu hlutlaus — engin afstaða með eða á móti, engin gildishlaðin orð.',
  '- Ef upplýsingar eru takmarkaðar, skrifaðu almenna en rétta samantekt án þess að giska á smáatriði.',
  '- Byrjaðu ekki á „Frumvarpið" eða „Málið" í hvert sinn — orðaðu eðlilega.',
  '- Svaraðu AÐEINS með samantektinni sjálfri: engin inngangsorð, engin rökleiðsla, engar gæsalappir.'
].join('\n');

const dec = s => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

async function getText(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (KARP dashboard build)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// Sækir greinargerð (skýringu á tilgangi máls) úr þingskjals-HTML. Skilar '' ef engin.
function extractGreinargerd(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = dec(t.replace(/<[^>]+>/g, ' '));
  const m = t.search(/Greinarger[ðd]/i);
  if (m >= 0) {
    let chunk = t.slice(m, m + 2800);
    const cut = chunk.lastIndexOf('. ');
    if (cut > 1200) chunk = chunk.slice(0, cut + 1);
    return chunk;
  }
  return '';
}

// Sækir efnisgreiningu + slóð á aðalþingskjal úr þingmáls-detail XML, svo greinargerð.
async function fetchContext(nr) {
  let efni = '', docHtml = '';
  try {
    const x = await getText('https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=' + LTHING + '&malnr=' + nr);
    efni = dec((x.match(/<efnisgreining>([^<]*)<\/efnisgreining>/) || [])[1]);
    const link = (x.match(/<html>\s*(https?:\/\/[^<]*\/altext\/\d+\/s\/\d+\.html)\s*<\/html>/) || [])[1];
    if (link) { try { docHtml = await getText(link.replace(/^http:/, 'https:')); } catch (e) {} }
  } catch (e) {}
  return { efni, greinargerd: docHtml ? extractGreinargerd(docHtml) : '' };
}

async function summarize(client, b, ctx) {
  const user =
    'Titill: ' + (b.titill || '(óþekktur)') + '\n' +
    'Tegund: ' + (b.teg || 'þingmál') + '\n' +
    (b.stada ? 'Staða: ' + b.stada + '\n' : '') +
    'Efnisgreining: ' + (ctx.efni || '—') + '\n\n' +
    'Greinargerð (útdráttur):\n' + (ctx.greinargerd || '(engin greinargerð fylgir — notaðu titil og efnisgreiningu)');
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 250,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }]
  });
  const block = (msg.content || []).find(x => x.type === 'text');
  return block ? block.text.trim().replace(/^["„]|["“]$/g, '').trim() : '';
}

async function pool(items, n, fn) {
  let i = 0;
  async function w() { while (i < items.length) { const k = i++; await fn(items[k], k); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
}

(async () => {
  const bills = JSON.parse(fs.readFileSync(DIR + 'frumvorp.json', 'utf8'));
  const cachePath = DIR + 'samantektir.json';
  let cache = {};
  if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {} }

  // 1) Endurnýta úr minni (ókeypis — hvorki lykill né SDK). Heldur samantektum þótt
  //    build_frumvorp.js hafi endurskrifað frumvorp.json.
  let cached = 0;
  if (!FORCE) bills.forEach(b => { const v = cache[LTHING + '_' + b.nr]; if (v) { b.sam = v; cached++; } });
  fs.writeFileSync(DIR + 'frumvorp.json', JSON.stringify(bills)); // varðveita strax

  const todo = bills.filter(b => !b.sam);
  console.log('Mál alls:', bills.length, '| úr minni:', cached, '| þarf að gera:', todo.length, '| model:', MODEL);
  if (!todo.length) { console.log('Ekkert nýtt — allar samantektir komnar úr minni.'); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠ ANTHROPIC_API_KEY vantar — sleppi ' + todo.length + ' nýjum samantektum (eldri haldast).');
    console.log('  Settu lykilinn og keyrðu aftur til að klára þær. (Þetta er EKKI villa.)');
    return;
  }

  // 2) Búa til nýjar samantektir. Sækja SDK aðeins hér (svo cache-only keyrsla þurfi hann ekki).
  let Anthropic;
  try { const p = require('@anthropic-ai/sdk'); Anthropic = p.Anthropic || p.default || p; }
  catch (e) { console.error('Vantar @anthropic-ai/sdk. Keyrðu: npm install @anthropic-ai/sdk'); process.exit(1); }
  const client = new Anthropic();

  let done = 0, fail = 0;
  function save() {
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    fs.writeFileSync(DIR + 'frumvorp.json', JSON.stringify(bills));
  }
  await pool(todo, CONCURRENCY, async (b) => {
    try {
      const ctx = await fetchContext(b.nr);
      const sam = await summarize(client, b, ctx);
      if (sam) {
        b.sam = sam; cache[LTHING + '_' + b.nr] = sam;
        if (++done % 5 === 0) { save(); console.log('  ', done, '/', todo.length, '…'); }
      } else { fail++; }
    } catch (e) { fail++; console.log('  villa við mál', b.nr, '-', e.message); }
  });
  save();
  console.log('\nLOKIÐ | nýjar samantektir:', done, '| mistókust:', fail, '| samtals með sam:', bills.filter(b => b.sam).length, '/', bills.length);
  console.log('Næst: node build_embed.js  (til að baka sam-textann inn í karp-data.txt)');
  const ex = bills.find(b => b.sam);
  if (ex) console.log('Dæmi [' + ex.titill + ']:', ex.sam);
})().catch(e => { console.error('ERR', e); process.exit(1); });
