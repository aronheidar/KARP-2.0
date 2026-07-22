// Efnahagsleg RÁS-flokkun frumvarpa (einangrað, ódýrt haiku-líkan). Bakar b.ras í frumvorp.json.
// Keyra: node skriptur/build_thingmal_ras.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRas } from '../src/lib/roads/frett-ras.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOGN = join(__dirname, '..', 'gogn');
const RAS = join(GOGN, 'roads');
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));
const LTHING = process.env.KARP_LTHING || '157';
const MODEL = process.env.KARP_THINGRAS_MODEL || 'claude-haiku-4-5-20251001';
const DRY = process.argv.includes('--dry');

const baseline = rj(join(RAS, 'baseline.json'));
const links = rj(join(RAS, 'links.json'));
const scenarios = existsSync(join(RAS, 'scenarios.json')) ? rj(join(RAS, 'scenarios.json')) : [];
const CTX = { baseline, links, scenarios };
const LEVER_KEYS = Object.keys(baseline.levers);
const SHOCK_KEYS = Object.keys(baseline.shocks);
const RAS_SIZE = { skattar:{lítil:3,meðal:5,stór:10}, fjarmagnstekjuskattur:{lítil:3,meðal:5,stór:10}, tryggingagjald:{lítil:3,meðal:5,stór:10}, utgjold:{lítil:5,meðal:10,stór:20}, innvidir:{lítil:5,meðal:10,stór:20}, kolefnisgjald:{lítil:25,meðal:50,stór:100}, kvoti:{lítil:10,meðal:20,stór:30}, veidigjald:{lítil:10,meðal:20,stór:30}, orka:{lítil:10,meðal:15,stór:30}, orkuskipti:{lítil:10,meðal:15,stór:30}, skograekt:{lítil:10,meðal:15,stór:30}, frambod:{lítil:10,meðal:20,stór:30}, leiguhusnaedi:{lítil:10,meðal:20,stór:30}, lodaframbod:{lítil:10,meðal:20,stór:30} };
// Efnahags-hlið: aðeins kalla LLM fyrir mál sem líklega snerta líkanið (spara kostnað).
const ECON_KW = /skatt|virðisauk|tolla|gjald|fjárlög|fjáraukalög|ríkisfj|útgj|húsnæð|íbúð|leigu|byggingarl|lóða|fisk|kvóta|veiðig|orku|orka|kolefni|loftslag|innvið|vegal|samgöng|nýsköp|ívilnan|lífeyri|kjarasamn|tryggingagj|skógrækt|votlend|fiskeldi/i;

// Umbreytir flokkun í (kind, value) fyrir projectRas.
// Lever: value = base + dir*mag (deviationOf dregur base frá → rétt frávik). Shock: base 0 → value = dir*mag.
// mag úr RAS_SIZE, annars step-margfeldi (les BÆÐI levers og shocks step).
export function inputValue(cls, baseline) {
  const isShock = !baseline.levers[cls.key] && !!baseline.shocks[cls.key];
  const tbl = RAS_SIZE[cls.key];
  const mag = tbl
    ? (tbl[cls.size] ?? tbl['meðal'])
    : ((baseline.levers[cls.key]?.step ?? baseline.shocks[cls.key]?.step ?? 5) * (cls.size === 'lítil' ? 1 : cls.size === 'stór' ? 4 : 2));
  const base = isShock ? 0 : (baseline.levers[cls.key].base || 0);
  return { kind: isShock ? 'shock' : 'lever', value: base + cls.dir * mag };
}

const SYSTEM = [
  'Þú flokkar íslensk þingmál eftir áhrifum á þjóðhagslíkan (RÁS).',
  'Skilaðu AÐEINS JSON: {"relevant":bool,"key":streng|null,"dir":1|-1,"size":"lítil"|"meðal"|"stór","why":streng}.',
  'relevant=false ef málið hefur ENGIN bein þjóðhagsleg áhrif (þá key=null).',
  'key VERÐUR að vera einn af þessum inntökum líkansins (annars relevant=false):',
  'SLEÐAR: ' + LEVER_KEYS.join(', '),
  'SJOKK: ' + SHOCK_KEYS.join(', '),
  'dir=1 ef málið HÆKKAR/EYKUR inntakið, dir=-1 ef það LÆKKAR/MINNKAR það.',
  'size = gróft umfang breytingar. why = stutt röksemd (<12 orð).',
].join('\n');

function parseRas(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
    const o = JSON.parse(m[0]);
    if (!o.relevant || !o.key) return null;
    if (!LEVER_KEYS.includes(o.key) && !SHOCK_KEYS.includes(o.key)) return null;
    const dir = o.dir === -1 ? -1 : 1;
    const size = ['lítil', 'meðal', 'stór'].includes(o.size) ? o.size : 'meðal';
    return { key: o.key, dir, size, why: String(o.why || '').slice(0, 120) };
  } catch (e) { return null; }
}

async function main() {
  const bills = rj(join(GOGN, 'frumvorp.json'));
  const cachePath = join(GOGN, 'thingmal_ras.json');
  let cache = {}; if (existsSync(cachePath)) { try { cache = rj(cachePath); } catch (e) {} }
  const todo = bills.filter((b) => (b.hs === 'Frv.' || b.hs === 'Till.') && ECON_KW.test((b.titill || '') + ' ' + (b.sam || '')) && !cache[LTHING + '_' + b.nr]);
  console.log(`RÁS-þingmál: ${todo.length} ný mál til flokkunar (af ${bills.length}).`);

  let client = null;
  if (!DRY && todo.length) {
    const p = await import('@anthropic-ai/sdk'); const Anthropic = p.Anthropic || p.default || p;
    client = new Anthropic();
  }
  for (const b of todo) {
    let cls = null;
    if (client) {
      try {
        const user = 'Titill: ' + (b.titill || '') + '\nTegund: ' + (b.teg || '') + '\nSamantekt: ' + (b.sam || '—');
        const msg = await client.messages.create({ model: MODEL, max_tokens: 160, system: SYSTEM, messages: [{ role: 'user', content: user }] });
        const blk = (msg.content || []).find((x) => x.type === 'text');
        cls = blk ? parseRas(blk.text) : null;
      } catch (e) { console.log('  villa', b.nr, e.message); }
    }
    cache[LTHING + '_' + b.nr] = cls || { none: true };
  }

  // Baka projection inn í bills úr cache (öll mál, líka áður cache-uð).
  let n = 0;
  for (const b of bills) {
    const c = cache[LTHING + '_' + b.nr];
    if (!c || c.none) { if (b.ras) delete b.ras; continue; }
    const { kind, value } = inputValue(c, baseline);
    const proj = projectRas({ kind, key: c.key, value, illustrative: true }, CTX);
    if (proj) { b.ras = { ...proj, illustrative: true, why: c.why }; n++; } else if (b.ras) delete b.ras;
  }
  console.log(`RÁS-þingmál: ${n} mál með projection.`);
  if (!DRY) {
    writeFileSync(cachePath, JSON.stringify(cache));
    writeFileSync(join(GOGN, 'frumvorp.json'), JSON.stringify(bills));
    console.log('Skrifað: gogn/frumvorp.json + gogn/thingmal_ras.json');
  } else console.log('(--dry: engin skrif)');
}
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('build_thingmal_ras.mjs')) {
  main().catch((e) => { console.error('VILLA', e); process.exit(1); });
}
