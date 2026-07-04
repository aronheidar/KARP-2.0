// Dóma-samantektir á mannamáli (LOTA 44) — les dómavaktina (/api/domar: HR+LR m/opinberri
// reifun dómstólanna í `um`-reitnum) og lætur Claude ENDURSEGJA reifunina á einföldu máli
// (2 setningar) + flokka sviðið. STRANGT grundað í reifuninni — ekkert umfram hana (borgaratól).
//
// KEYRSLA: node skriptur/build_domar_ai.js   (þarf ANTHROPIC_API_KEY fyrir NÝ mál;
//   án lykils haldast eldri samantektir og nýjum er sleppt — sama mynstur og build_summaries.js)
// SKYNDIMINNI: gogn/domar_ai.json { "hr:3/2026": {einfalt, svid, t, d} } — aðeins ný mál kalla á API.
// MODEL: KARP_SUMMARY_MODEL eða claude-opus-4-8 (örfá mál/dag → kostar nær ekkert).

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
const MODEL = process.env.KARP_SUMMARY_MODEL || 'claude-opus-4-8';
const SVID = ['Refsimál', 'Einkamál', 'Stjórnsýsla', 'Vinnumarkaður', 'Fjármál og viðskipti', 'Fjölskyldumál', 'Fasteignir og skipulag', 'Gæsluvarðhald og þvingun', 'Annað'];

const SYSTEM = 'Þú ert ritstjóri hjá Karp, íslensku borgaratóli. Þú færð opinbera reifun dóms. '
  + 'Skrifaðu HÁMARK 2 stuttar setningar á einföldu íslensku máli sem venjulegt fólk skilur — hvað var deilt um og hver varð niðurstaðan. '
  + 'Notaðu AÐEINS upplýsingar úr reifuninni; ekki geta í eyður, ekki nota lagatilvísanir. Nafngreina má aðila eins og reifunin gerir. '
  + 'Svaraðu í JSON: {"einfalt":"...","svid":"..."} þar sem svid er nákvæmlega eitt af: ' + SVID.join(', ') + '.';

async function summarize(client, c) {
  const user = 'Dómstóll: ' + c.court + '\nMál: ' + c.nr + '\nTitill: ' + (c.titill || '') + '\nEfnisorð: ' + (c.efnisord || []).join(', ') + '\n\nReifun:\n' + c.um;
  const msg = await client.messages.create({ model: MODEL, max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content: user }] });
  const block = (msg.content || []).find((x) => x.type === 'text');
  if (!block) return null;
  try {
    const j = JSON.parse((block.text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    if (!j.einfalt) return null;
    return { einfalt: String(j.einfalt).trim(), svid: SVID.includes(j.svid) ? j.svid : 'Annað' };
  } catch (e) { return null; }
}

(async () => {
  const r = await fetch('https://karp.is/api/domar', { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('domar-veitan svarar ekki: HTTP ' + r.status);
  const d = await r.json();
  const cases = [];
  for (const [court, key] of [['Hæstiréttur', 'hr'], ['Landsréttur', 'lr']]) {
    for (const v of d[key] || []) if (v && v.nr && v.um && v.um.trim().length > 40) cases.push({ key: key + ':' + v.nr, court, nr: v.nr, titill: v.titill, efnisord: v.efnisord, um: v.um.trim().slice(0, 4000), d: (v.dags || '').slice(0, 10) });
  }

  const cachePath = DIR + 'domar_ai.json';
  let cache = {};
  if (fs.existsSync(cachePath)) { try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {} }

  const todo = cases.filter((c) => !cache[c.key]);
  console.log('dómar með reifun:', cases.length, '| úr minni:', cases.length - todo.length, '| ný:', todo.length, '| model:', MODEL);

  if (todo.length && !process.env.ANTHROPIC_API_KEY) {
    console.log('⚠ ANTHROPIC_API_KEY vantar — sleppi ' + todo.length + ' nýjum (eldri haldast). Þetta er EKKI villa.');
  } else if (todo.length) {
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { console.log('⚠ @anthropic-ai/sdk vantar — npm install fyrst.'); process.exit(0); }
    const client = new Anthropic();
    for (const c of todo) {
      try {
        const s = await summarize(client, c);
        if (s) { cache[c.key] = { ...s, t: c.titill, d: c.d }; console.log('  ✓', c.key, '·', s.svid, '·', s.einfalt.slice(0, 70) + '…'); }
      } catch (e) { console.log('  ⚠', c.key, e.message.slice(0, 80)); }
    }
  }

  // Grisja: halda 400 nýjustu (lyklar hverfa aldrei úr vaktinni of hratt)
  const keys = Object.keys(cache);
  if (keys.length > 400) {
    keys.sort((a, b) => String(cache[a].d || '').localeCompare(String(cache[b].d || '')));
    keys.slice(0, keys.length - 400).forEach((k) => delete cache[k]);
  }

  const s = JSON.stringify({ updated: new Date().toISOString(), n: Object.keys(cache).length, note: 'AI-endursögn opinberrar reifunar dómstólanna á einföldu máli (grundað, ekkert umfram reifun). Lykill: hr:/lr: + málsnr.', byNr: cache });
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(path.join(PUB, 'domar_ai.json'), s);
  console.log('domar_ai.json:', Object.keys(cache).length, 'samantektir | public:', (s.length / 1024).toFixed(1), 'KB');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
