#!/usr/bin/env node
// build_lobbyvakt.mjs — Lobbývakt: nætur-flokkun þingmála + samráðsmála eftir atvinnugrein
// (Claude haiku + heuristík-fallback). Sjá docs/superpowers/specs/2026-07-27-lobbyvakt-design.md §4.1.
//
// Heimildir:
//   - Þingmál: gogn/frumvorp.json (sama skrá og build_thingmal_ras.mjs les; fallback web/public/gogn/frumvorp.json).
//     Hvert færsla ≈ { nr, hs, teg, titill, sam, d, stada, ... } — hs='Frv.'|'Till.' eru lagafrumvörp/þingsályktunartillögur.
//     Dagsetningarreitur er `d` (ekki `dags`). Hlekkur = "ferill máls" á althingi.is (sjá thingmal.astro).
//   - Samráðsmál: samráðsgátt island.is — sama opna GraphQL-gátt og /api/samrad í worker.js notar
//     (consultationPortalGetCases). Hlekkur = https://island.is/samradsgatt/mal/<id> (staðfest úr
//     wp/karp-vaktpro.php + mitt-svaedi.astro — notar `id`, EKKI `caseNumber`).
//
// Úttak: web/public/gogn/lobbyvakt.json ({updated,items,bySector}) + web/public/gogn/lobbyvakt_cache.json
// (id → AI-reitir; cache svo aðeins NÝ mál fari í Claude — ódýrt). Sanity-guard: 0 mál eftir síu → henda (EKKI
// skrifa yfir góða skrá).
//
// Keyra: node skriptur/build_lobbyvakt.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SECTORS, SECTORS, classifyHeuristic } from '../web/src/lib/lobbyvakt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOGN_ROOT = join(__dirname, '..', 'gogn');
const GOGN_WEB = join(__dirname, '..', 'web', 'public', 'gogn');
const OUT = join(GOGN_WEB, 'lobbyvakt.json');
const CACHE_PATH = join(GOGN_WEB, 'lobbyvakt_cache.json');
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));

const LTHING = process.env.KARP_LTHING || '157';
const MODEL = process.env.KARP_LOBBYVAKT_MODEL || 'claude-haiku-4-5-20251001';
const DRY = process.argv.includes('--dry');
const DAYS_WINDOW = 90;
const STIG_OK = new Set(['Lítil', 'Miðlungs', 'Mikil']);

// ── Heimild 1: þingmál ───────────────────────────────────────────────────────
// gogn/frumvorp.json (sama og build_thingmal_ras.mjs) — fallback á web/public/gogn/frumvorp.json ef vantar.
function loadBills() {
  const primary = join(GOGN_ROOT, 'frumvorp.json');
  const fallback = join(GOGN_WEB, 'frumvorp.json');
  const p = existsSync(primary) ? primary : fallback;
  if (!existsSync(p)) { console.log('  (frumvorp.json vantar — sleppi þingmálum)'); return []; }
  let bills;
  try { bills = rj(p); } catch (e) { console.log('  villa við lestur frumvorp.json:', e.message); return []; }
  return bills
    .filter((b) => b && (b.hs === 'Frv.' || b.hs === 'Till.') && Number.isFinite(b.nr) && b.d)
    .map((b) => ({
      id: `thm-${LTHING}-${b.nr}`,
      kind: 'thingmal',
      titill: b.titill || '',
      lysing: b.sam || '',
      hlekkur: `https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/?ltg=${LTHING}&mnr=${b.nr}`,
      frestur: null,
      stada: b.stada || '',
      dags: b.d,
    }));
}

// ── Heimild 2: samráðsmál ────────────────────────────────────────────────────
// samráðsgátt island.is GraphQL (sama veita og /api/samrad); defensive .catch() — bilun hér má EKKI stöðva þingmál.
async function loadSamrad() {
  const query = 'query { consultationPortalGetCases(input: {pageSize: 100, pageNumber: 0}) { total cases { id caseNumber name statusName typeName institutionName created processEnds } } }';
  const j = await fetch('https://island.is/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  }).then((r) => (r.ok ? r.json() : null)).catch((e) => { console.log('  villa við sókn samráðsgáttar:', e.message); return null; });
  const cases = (((j || {}).data || {}).consultationPortalGetCases || {}).cases;
  if (!Array.isArray(cases)) { console.log('  samráðsgátt svaraði ekki (eða óvænt form) — sleppi samráðsmálum, held áfram með þingmál.'); return []; }
  return cases
    .filter((c) => c && c.id != null && c.created)
    .map((c) => ({
      id: `sam-${c.id}`,
      kind: 'samrad',
      titill: c.name || '',
      lysing: c.typeName || '',
      hlekkur: `https://island.is/samradsgatt/mal/${c.id}`,
      frestur: c.processEnds || null,
      stada: c.statusName || '',
      dags: c.created,
    }));
}

// ── Claude haiku-flokkun ─────────────────────────────────────────────────────
const SECTOR_LIST = ALL_SECTORS.map((code) => `${code}=${SECTORS[code]}`).join(', ');
const SYSTEM = [
  'Þú flokkar íslensk mál eftir því hvaða atvinnugreinar þau snerta.',
  'Leyfðir greina-kóðar (veldu þá sem eiga við, ALLTAF úr þessum lista — engir aðrir kóðar leyfðir):',
  SECTOR_LIST,
  'Skilaðu AÐEINS STRÖNGU JSON, ENGUM öðrum texta, á þessu formi:',
  '{"greinar":["kóði", ...],"brief":"1-2 setninga áhrifa-túlkun á mannamáli","stig":"Lítil"|"Miðlungs"|"Mikil","efni":["tag", ...]}',
  'greinar = kóðar úr listanum sem málið snertir beint (0-4 stk; tómt fylki EF ekkert á sérstaklega við).',
  'brief = hlutlaus, stutt túlkun á mannamáli um hvaða áhrif málið gæti haft á fyrirtæki í viðkomandi grein(um) — ENGIN lögfræðileg niðurstaða eða ráðgjöf.',
  'stig = gróft mat á vægi málsins fyrir atvinnulífið: "Lítil", "Miðlungs" eða "Mikil".',
  'efni = 1-4 stutt efnisorð sem lýsa kjarna málsins.',
].join('\n');

function userPrompt(it) {
  const tegund = it.kind === 'thingmal' ? 'Þingmál (frumvarp/þingsályktunartillaga á Alþingi)' : 'Samráðsmál (samráðsgátt stjórnvalda)';
  return `Tegund: ${tegund}\nTitill: ${it.titill}\nNánar: ${it.lysing || '—'}`;
}

// Fyrsta {...} JSON-blokk úr svari → validerað. null ef ekkert nothæft finnst (kallandi fellur þá á heuristík).
export function parseClassification(text) {
  try {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    const greinarRaw = Array.isArray(o.greinar) ? o.greinar.filter((g) => ALL_SECTORS.includes(g)) : [];
    const greinar = greinarRaw.length ? greinarRaw : ['almennt'];
    const stig = STIG_OK.has(o.stig) ? o.stig : 'Miðlungs';
    const brief = typeof o.brief === 'string' ? o.brief.trim() : '';
    const efni = Array.isArray(o.efni) ? o.efni.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5) : [];
    return { greinar, brief, stig, efni };
  } catch (e) { return null; }
}

async function main() {
  console.log('Lobbyvakt: sæki þingmál + samráðsmál…');
  const billItems = loadBills();
  const samradItems = await loadSamrad();
  const allRaw = [...billItems, ...samradItems];
  console.log(`  þingmál: ${billItems.length} · samráð: ${samradItems.length} · samtals: ${allRaw.length}`);

  let cache = {};
  if (existsSync(CACHE_PATH)) { try { cache = rj(CACHE_PATH); } catch (e) { console.log('  cache-lestrarvilla, byrja tómt:', e.message); } }

  const todo = allRaw.filter((it) => !cache[it.id]);
  console.log(`Lobbyvakt: ${todo.length} ný mál til flokkunar (af ${allRaw.length} alls).`);

  const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
  let client = null;
  if (!DRY && HAS_KEY && todo.length) {
    try {
      const p = await import('@anthropic-ai/sdk'); const Anthropic = p.Anthropic || p.default || p;
      client = new Anthropic();
    } catch (e) { console.log('  Anthropic SDK ekki tiltækt, nota heuristík:', e.message); }
  } else if (!DRY && !HAS_KEY && todo.length) {
    console.log('  (ANTHROPIC_API_KEY vantar — nota heuristík-fallback fyrir öll ný mál)');
  } else if (DRY && todo.length) {
    console.log('  (--dry: engin Claude-köll — nota heuristík-fallback fyrir öll ný mál)');
  }

  let aiCount = 0, fallbackCount = 0;
  for (const it of todo) {
    let ai = null;
    if (client) {
      try {
        const msg = await client.messages.create({ model: MODEL, max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: userPrompt(it) }] });
        const blk = (msg.content || []).find((x) => x.type === 'text');
        ai = blk ? parseClassification(blk.text) : null;
      } catch (e) { console.log('  villa (Claude)', it.id, e.message); }
    }
    if (ai) aiCount++;
    else { ai = { greinar: classifyHeuristic(it.titill, it.lysing), brief: '', stig: 'Miðlungs', efni: [] }; fallbackCount++; }
    cache[it.id] = ai;
  }
  if (todo.length) console.log(`Flokkun: ${aiCount} um Claude · ${fallbackCount} heuristík-fallback.`);

  // Sameina + halda 90-daga glugga.
  const cutoff = Date.now() - DAYS_WINDOW * 86400000;
  const items = [];
  for (const it of allRaw) {
    const t = Date.parse(it.dags);
    if (Number.isNaN(t) || t < cutoff) continue;
    const ai = cache[it.id] || { greinar: classifyHeuristic(it.titill, it.lysing), brief: '', stig: 'Miðlungs', efni: [] };
    items.push({
      id: it.id,
      kind: it.kind,
      titill: it.titill,
      hlekkur: it.hlekkur,
      greinar: ai.greinar,
      brief: ai.brief,
      stig: ai.stig,
      efni: ai.efni,
      frestur: it.frestur || null,
      stada: it.stada || '',
      dags: it.dags,
    });
  }

  if (!items.length) throw new Error('0 mál eftir 90-daga síu — hætti (skrifa EKKI yfir góða skrá).');

  const bySector = {};
  for (const it of items) for (const g of it.greinar) (bySector[g] = bySector[g] || []).push(it.id);

  const out = { updated: new Date().toISOString().slice(0, 10), items, bySector };
  const thmN = items.filter((i) => i.kind === 'thingmal').length;
  const samN = items.filter((i) => i.kind === 'samrad').length;
  console.log(`Lobbyvakt: ${items.length} mál í straumi (þingmál ${thmN} · samráð ${samN}, 90-daga gluggi).`);
  console.log('bySector lyklar:', Object.keys(bySector).sort().join(', '));

  if (!DRY) {
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
    writeFileSync(OUT, JSON.stringify(out));
    console.log('Skrifað:', OUT);
    console.log('Skrifað:', CACHE_PATH);
  } else {
    console.log('(--dry: engin skrif)');
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('build_lobbyvakt.mjs')) {
  main().catch((e) => { console.error('VILLA', e); process.exit(1); });
}
