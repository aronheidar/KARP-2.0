// ─────────────────────────────────────────────────────────────
// cto_agent.mjs — 🛠️ CTO-AGENT KARP (12.9.2026)
// Rannsakar hjálparbeiðni (ticket) í repo-inu með AFMÖRKUÐUM verkfærum, gerir
// lágmarks-lagfæringu í vinnutrénu og skilar niðurstöðu-JSON. Keyrir EINGÖNGU í
// GitHub Actions (cto.yml) — aldrei á framleiðslu-worker. Git (grein/commit/push)
// er verk workflow-sins, EKKI módelsins: agentinn breytir bara skrám.
//
// Notkun:  node skriptur/cto_agent.mjs <ticket.json> <nidurstada.json>
// Env:     ANTHROPIC_API_KEY (krafist) · KARP_CTO_MODEL (sjálfg. claude-opus-5)
//          · KARP_CTO_SKREF (hámark verkfæra-umferða, sjálfg. 40)
//
// Öryggismörk (gátuð í kóða, ekki treyst á módelið — sama regla og leidGuard):
//  • lesa/leita/lista: aðeins innan repo-rótar
//  • skrifa/skipta: að auki BANNAÐ á .git/, .github/ (workflows!), node_modules,
//    package-lock.json og .env-skrár
//  • keyra: aðeins node/npm, engin keðjutákn (; & | < > ` $()), env HREINSAÐ af
//    leyndarmálum (API-lyklar sjást aldrei í undirferlum)
//  • hámarksfjöldi skrefa + klipping á úttaki verkfæra (context-agi)
// Prófanir á vörðunum: skriptur/cto_agent.test.mjs (hreinu föllin hér að neðan).
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// ── Hreinu varðar-föllin (prófuð) ────────────────────────────────────────────

/** Afstæð slóð → alger slóð innan repo-rótar, annars null (engin '..'-flótti, engar algerar slóðir). */
export function innanRepo(rel) {
  const s = String(rel || '').trim();
  if (!s || path.isAbsolute(s) || s.includes('\0')) return null;
  const abs = path.resolve(ROOT, s);
  return abs === ROOT || abs.startsWith(ROOT + path.sep) ? abs : null;
}

/** Má skrifa/breyta þessari slóð? Workflows, git-innviðir, lockfiles og leyndarmál eru friðhelg. */
export function maSkrifa(rel) {
  const abs = innanRepo(rel);
  if (!abs) return false;
  const r = path.relative(ROOT, abs).split(path.sep).join('/');
  if (/^(\.git|\.github|node_modules)(\/|$)/.test(r) || /(^|\/)node_modules\//.test(r)) return false;
  if (/(^|\/)package-lock\.json$/.test(r) || /(^|\/)\.env(\.|$)/.test(r)) return false;
  return true;
}

/** Má keyra skipunina? Aðeins node/npm, engin keðju- eða innskotstákn. */
export function maKeyra(cmd) {
  const s = String(cmd || '').trim();
  if (!/^(node|npm)\s/.test(s) && s !== 'npm test') return false;
  if (/[;&|<>`\n\r]|\$\(/.test(s)) return false;
  return true;
}

/** Env fyrir undirferla: leyndarmál (lyklar/token/secret) fara ALDREI niður. */
export function hreinsaEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Klippir langt úttak með sýnilegu merki — verkfæra-úttak má ekki sprengja samhengið. */
export function klippa(s, n = 15000) {
  const t = String(s == null ? '' : s);
  return t.length <= n ? t : t.slice(0, n) + '\n… [klippt — ' + (t.length - n) + ' stöfum sleppt]';
}

// ── Verkfærin ────────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'lesa', description: 'Les skrá úr repo-inu með línunúmerum. Notaðu fra/linur fyrir langar skrár.',
    input_schema: { type: 'object', properties: { slod: { type: 'string', description: 'afstæð slóð frá repo-rót' }, fra: { type: 'integer', description: 'fyrsta lína (1-byggt, sjálfg. 1)' }, linur: { type: 'integer', description: 'fjöldi lína (sjálfg. 250, hámark 400)' } }, required: ['slod'] } },
  { name: 'lista', description: 'Listar innihald möppu í repo-inu.',
    input_schema: { type: 'object', properties: { slod: { type: 'string', description: 'afstæð slóð (sjálfg. rótin)' } }, required: [] } },
  { name: 'leita', description: 'grep -rnE í repo-inu (node_modules/dist/.git undanskilið). Skilar slóð:lína:texti.',
    input_schema: { type: 'object', properties: { mynstur: { type: 'string', description: 'extended regex' }, slod: { type: 'string', description: 'afmarka við skrá/möppu (sjálfg. öll rótin)' } }, required: ['mynstur'] } },
  { name: 'keyra', description: 'Keyrir node/npm skipun í repo-rótinni (t.d. "node --test skriptur/frettavel.test.mjs", "npm test"). Engin keðjutákn.',
    input_schema: { type: 'object', properties: { skipun: { type: 'string' } }, required: ['skipun'] } },
  { name: 'skipta', description: 'Skiptir NÁKVÆMLEGA einu tilviki af texta út í skrá — örugga leiðin til að breyta stórum skrám. Bregst ef textinn finnst ekki eða oftar en einu sinni.',
    input_schema: { type: 'object', properties: { slod: { type: 'string' }, gamalt: { type: 'string', description: 'nákvæmur texti sem á að hverfa (m. inndrætti)' }, nytt: { type: 'string' } }, required: ['slod', 'gamalt', 'nytt'] } },
  { name: 'skrifa', description: 'Skrifar heila skrá (yfirskrifar / býr til). Notaðu frekar "skipta" fyrir breytingar á stórum skrám.',
    input_schema: { type: 'object', properties: { slod: { type: 'string' }, efni: { type: 'string' } }, required: ['slod', 'efni'] } },
  { name: 'nidurstada', description: 'LOKAskref — kallaðu ALLTAF á þetta að lokum, hvort sem lagfæring var gerð eða ekki.',
    input_schema: { type: 'object', properties: {
      greining: { type: 'string', description: 'fyrir stjórnandann: rót vandans, hvað var gert (eða af hverju ekki), hvernig var sannreynt' },
      patch: { type: 'boolean', description: 'true ef skrám var breytt og breytingin á að fara í tillögu' },
      ahaetta: { type: 'string', enum: ['litil', 'medal', 'mikil'], description: 'áhættumat breytingarinnar' },
      notendasvar: { type: 'string', description: 'drög að lokasvari til notandans: 2–4 setningar á íslensku, án tæknislangs, engin loforð umfram það sem var lagað' },
    }, required: ['greining', 'patch', 'ahaetta', 'notendasvar'] } },
];

function keyraTol(name, inp) {
  try {
    if (name === 'lesa') {
      const abs = innanRepo(inp.slod);
      if (!abs) return 'VILLA: slóð utan repo-rótar.';
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return 'VILLA: skráin finnst ekki: ' + inp.slod;
      const linur = fs.readFileSync(abs, 'utf8').split('\n');
      const fra = Math.max(1, inp.fra | 0 || 1), n = Math.min(Math.max(1, inp.linur | 0 || 250), 400);
      const bútur = linur.slice(fra - 1, fra - 1 + n).map((l, i) => (fra + i) + '\t' + l).join('\n');
      return 'Skrá ' + inp.slod + ' (' + linur.length + ' línur, sýni ' + fra + '–' + Math.min(fra + n - 1, linur.length) + '):\n' + bútur;
    }
    if (name === 'lista') {
      const abs = innanRepo(inp.slod || '.');
      if (!abs) return 'VILLA: slóð utan repo-rótar.';
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return 'VILLA: mappan finnst ekki: ' + (inp.slod || '.');
      return fs.readdirSync(abs, { withFileTypes: true }).slice(0, 250)
        .map((e) => (e.isDirectory() ? e.name + '/' : e.name)).join('\n') || '(tóm)';
    }
    if (name === 'leita') {
      const abs = innanRepo(inp.slod || '.');
      if (!abs) return 'VILLA: slóð utan repo-rótar.';
      const r = spawnSync('grep', ['-rnE', '--binary-files=without-match', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist', '--exclude=package-lock.json', '--', String(inp.mynstur || ''), abs], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
      if (r.status === 1) return 'Engar niðurstöður.';
      if (r.status !== 0) return 'VILLA í leit: ' + klippa(r.stderr, 500);
      return r.stdout.split('\n').slice(0, 120).map((l) => l.replace(ROOT + path.sep, '')).join('\n');
    }
    if (name === 'keyra') {
      if (!maKeyra(inp.skipun)) return 'VILLA: aðeins node/npm-skipanir án keðjutákna eru leyfðar.';
      const r = spawnSync('bash', ['-c', String(inp.skipun)], { cwd: ROOT, encoding: 'utf8', env: hreinsaEnv(process.env), timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
      return 'exit=' + (r.status == null ? 'tímamörk' : r.status) + '\n' + (r.stdout || '') + (r.stderr ? '\nSTDERR:\n' + r.stderr : '');
    }
    if (name === 'skipta') {
      if (!maSkrifa(inp.slod)) return 'VILLA: má ekki breyta þessari slóð.';
      const abs = innanRepo(inp.slod);
      if (!fs.existsSync(abs)) return 'VILLA: skráin finnst ekki: ' + inp.slod;
      const efni = fs.readFileSync(abs, 'utf8');
      const g = String(inp.gamalt);
      const n = efni.split(g).length - 1;
      if (n === 0) return 'VILLA: textinn fannst ekki í skránni (berðu saman inndrátt/bil við "lesa").';
      if (n > 1) return 'VILLA: textinn kemur ' + n + ' sinnum fyrir — gerðu hann sértækari.';
      fs.writeFileSync(abs, efni.replace(g, String(inp.nytt)));
      return 'Skipt út í ' + inp.slod + '.';
    }
    if (name === 'skrifa') {
      if (!maSkrifa(inp.slod)) return 'VILLA: má ekki skrifa á þessa slóð (workflows/lockfiles/leyndarmál eru friðhelg).';
      const abs = innanRepo(inp.slod);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, String(inp.efni ?? ''));
      return 'Skrifað: ' + inp.slod + ' (' + String(inp.efni ?? '').length + ' stafir).';
    }
  } catch (e) { return 'VILLA: ' + (e && e.message || e); }
  return 'VILLA: óþekkt verkfæri.';
}

// ── Kerfisleiðbeiningin ──────────────────────────────────────────────────────
// Sama grunnregla og annars staðar í Karp: ekkert skáldað, minnsta breyting, sannreynt.

const SYS = 'Þú ert CTO-agent karp.is — íslensks gagna- og hagvísavefjar. Þér berst hjálparbeiðni (ticket) sem þjónustufulltrúinn hefur flokkað sem tæknilegt mál. Verkefnið: finna RÓTINA, gera MINNSTU lagfæringu sem lagar hana, sannreyna, og skila niðurstöðu.\n\n'
  + 'KORT AF REPO-INU:\n'
  + '- web/worker.js + web/src/worker/*.mjs — Cloudflare-workerinn (API-endapunktar, cron, póstur)\n'
  + '- web/src/pages/*.astro + web/src/lib — vefsíðurnar (Astro) og hreinar hjálparmódúlur\n'
  + '- skriptur/*.js|*.mjs|*.py — byggingarskriptur sem lesa heimildir og skrifa JSON í gogn/\n'
  + '- gogn/ og web/public/gogn/ — bökuð gögn (tvöfalt tré; web/public/gogn er það sem vefurinn þjónar)\n'
  + '- prófanir: node --test skriptur/*.test.mjs og (í web/) src/lib+src/worker+test/*.test.mjs\n\n'
  + 'VINNUREGLUR:\n'
  + '1. Rannsakaðu FYRST (lesa/leita/keyra) — breyttu engu fyrr en þú hefur fundið rótina og getur bent á hana í kóða eða gögnum.\n'
  + '2. Minnsta breyting sem lagar rótina. Engin uppfærsluæði, engin stílhreinsun á óskyldu, engar nýjar dependencies.\n'
  + '3. Notaðu "skipta" fyrir breytingar á stórum skrám — aldrei endurskrifa heila stóra skrá.\n'
  + '4. Sannreyndu: keyrðu prófin sem tengjast breytingunni; ef ekkert próf nær yfir hana skaltu keyra viðkomandi skriptu/kóða beint til að sýna að hún hagi sér rétt.\n'
  + '5. ALDREI: breyta .github/ (workflows), package-lock.json, leyndarmálum, greiðslu- eða auðkenningar-flæði (web/src/worker/greidslur.mjs, auth.mjs) — mál sem krefjast þess fá patch:false og skýringu.\n'
  + '6. Sé rótin utanaðkomandi (heimildarveita biluð, misskilningur notanda, gögnin í raun rétt) → patch:false og útskýrðu það heiðarlega í greiningu OG notendasvari.\n'
  + '7. Endaðu ALLTAF á "nidurstada"-verkfærinu. greining = fyrir stjórnandann (rót → breyting → sannreyning). notendasvar = 2–4 setningar á íslensku til notandans, án tæknislangs, engin loforð umfram það sem var lagað, ekkert skáldað.\n';

// ── Aðal-lykkjan ─────────────────────────────────────────────────────────────

export async function main(ticketSlod, utSlod) {
  const t = JSON.parse(fs.readFileSync(ticketSlod, 'utf8'));
  const tk = t.ticket || t;
  const MODEL = process.env.KARP_CTO_MODEL || 'claude-opus-5';
  const MAX = Math.min(parseInt(process.env.KARP_CTO_SKREF || '40', 10) || 40, 80);
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();   // ANTHROPIC_API_KEY úr env

  // PII-lágmörkun: nafn og netfang notandans fara EKKI inn í módelið — þau skipta rótina engu.
  const messages = [{ role: 'user', content:
    'TICKET ' + (tk.id || '?') + '\nFlokkur: ' + (tk.flokkur || '?') + '\nSíða sem beiðnin kom af: ' + (tk.fra || '—') + '\nInnskráður notandi: ' + (tk.innskraning ? 'já' : 'nei')
    + '\n\nERINDI NOTANDANS:\n' + (tk.lysing || '')
    + (tk.verkbeining ? '\n\nVERKBEINING ÞJÓNUSTUFULLTRÚA:\n' + tk.verkbeining : '') }];

  let nidurstada = null, skref = 0;
  while (skref < MAX && !nidurstada) {
    skref++;
    let res = null;
    for (let tilraun = 0; tilraun < 3 && !res; tilraun++) {   // 429/5xx: seigla með biðtíma
      try { res = await client.messages.create({ model: MODEL, max_tokens: 16000, system: SYS, tools: TOOLS, messages }); }
      catch (e) {
        if (tilraun === 2) throw e;
        await new Promise((r) => setTimeout(r, (tilraun + 1) * 15000));
      }
    }
    messages.push({ role: 'assistant', content: res.content });   // thinking-blokkir fylgja óbreyttar með
    const kall = res.content.filter((b) => b.type === 'tool_use');
    const lok = kall.find((b) => b.name === 'nidurstada');
    if (lok) { nidurstada = lok.input; break; }
    if (!kall.length) {
      messages.push({ role: 'user', content: 'Endaðu á "nidurstada"-verkfærinu — það er eina leiðin til að skila verkinu.' });
      continue;
    }
    // ÖLL tool_result í EINNI user-melding (samhliða köll studd)
    messages.push({ role: 'user', content: kall.map((u) => {
      const svar = klippa(keyraTol(u.name, u.input || {}));
      console.log('▸ [' + skref + '] ' + u.name + ' ' + klippa(JSON.stringify(u.input || {}), 200) + ' → ' + klippa(svar.split('\n')[0], 160));
      return { type: 'tool_result', tool_use_id: u.id, content: svar };
    }) });
  }

  const ut = nidurstada
    ? { greining: String(nidurstada.greining || ''), patch: nidurstada.patch === true, ahaetta: ['litil', 'medal', 'mikil'].includes(nidurstada.ahaetta) ? nidurstada.ahaetta : 'medal', notendasvar: String(nidurstada.notendasvar || ''), skref }
    : { greining: 'CTO-agentinn náði ekki niðurstöðu innan ' + MAX + ' skrefa — mannleg skoðun nauðsynleg.', patch: false, ahaetta: 'mikil', notendasvar: '', skref, villa: 'skref-hámark' };
  fs.writeFileSync(utSlod, JSON.stringify(ut, null, 2));
  console.log('✓ nidurstada (' + skref + ' skref): patch=' + ut.patch + ' ahaetta=' + ut.ahaetta + (ut.villa ? ' VILLA=' + ut.villa : ''));
  return ut;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [ticketSlod, utSlod] = process.argv.slice(2);
  if (!ticketSlod || !utSlod) { console.error('Notkun: node skriptur/cto_agent.mjs <ticket.json> <nidurstada.json>'); process.exit(2); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY vantar.'); process.exit(2); }
  main(ticketSlod, utSlod).catch((e) => { console.error('CTO-agent féll:', e && e.message || e); process.exit(1); });
}
