// ─────────────────────────────────────────────────────────────
// build_utbod_haefi.mjs — FIT-ÞREP 3: hæfiskröfu-þáttun útboða með Claude.
// Les gogn/utbod.json (TED-færslur), sækir eForms-XML hverrar tilkynningar
// (links í TendererQualificationRequest/TenderingTerms — hæfiskaflarnir),
// þáttar kröfurnar í strúktúrað JSON með Messages API (structured output)
// og bakar í gogn/utbod_haefi.json + web/public/gogn (lyklað á útboðs-slóð).
//
// Stigvaxandi: aðeins NÝJAR slóðir eru þáttaðar per keyrslu; færslur útboða
// sem duttu úr safninu falla út. Útboð án hæfiskafla fá {engar:true} svo
// þau séu ekki endurþáttuð daglega.
//
// ⚠ ÓVIRKT þar til ANTHROPIC_API_KEY er sett (GitHub Secret → refresh-data.yml).
//   Kostnaður: ~2–3¢ per útboð (claude-opus-4-8); ~40 í fyrstu keyrslu, svo örfá á dag.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOGN = path.join(__dirname, '..', 'gogn');
const OUT = 'utbod_haefi.json';
const UA = { 'User-Agent': 'KARP utbodsvakt (karp.is; aronheidars@gmail.com)' };
const MAX_PER_RUN = 60;   // kostnaðar-þak per keyrslu

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('utbod_haefi: ANTHROPIC_API_KEY vantar — sleppi. (Virkjast þegar lykillinn er settur í GitHub Secrets.)');
  process.exit(0);
}
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();   // les ANTHROPIC_API_KEY úr env

// ── Strúktúrað úttak: hæfiskröfur per útboð ────────────────────
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['krofur', 'lagmarksvelta_isk', 'vottord', 'reynsla_ar', 'tryggingar'],
  properties: {
    krofur: {
      description: 'Allar hæfiskröfur til bjóðenda, hver fyrir sig',
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['flokkur', 'texti'],
        properties: {
          flokkur: { type: 'string', enum: ['fjarhagsstada', 'taeknileg_geta', 'reynsla', 'vottord', 'starfsleyfi', 'trygging', 'annad'] },
          texti: { type: 'string', description: 'Krafan endursögð stutt og skýrt á íslensku (1–2 setningar)' },
        },
      },
    },
    lagmarksvelta_isk: { type: 'number', description: 'Lágmarks-ársvelta í ISK ef krafist (umreikna EUR→ISK ~145). 0 ef engin veltukrafa.' },
    vottord: { type: 'array', items: { type: 'string' }, description: 'Vottorð/staðlar sem krafist er (t.d. ISO 9001). Tómt ef engin.' },
    reynsla_ar: { type: 'number', description: 'Krafist árafjöldi sambærilegrar reynslu. 0 ef ekki tilgreint.' },
    tryggingar: { type: 'boolean', description: 'Er krafist ábyrgðar-/verktrygginga eða starfsábyrgðartryggingar?' },
  },
};

const SYSTEM = 'Þú ert íslenskur útboðssérfræðingur. Þú færð texta úr eForms-útboðstilkynningu (TED) og dregur út HÆFISKRÖFUR til bjóðenda — skilyrðin sem fyrirtæki þarf að uppfylla til að mega bjóða (fjárhagsstaða, tæknileg geta, reynsla, vottorð, starfsleyfi, tryggingar). Ekki telja upp verklýsingu eða valforsendur (matskröfur), aðeins hæfiskröfur. Skrifaðu texta á íslensku. Ef engar hæfiskröfur koma fram skilarðu tómum krofur-lista.';

// ── eForms-XML: sækja + skera hæfiskaflana út ──────────────────
const pubnum = (u) => { const m = String(u || '').match(/detail\/([\d-]+)/); return m ? m[1] : null; };
const stripXml = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/\s+/g, ' ').trim();

async function saekjaTexta(u) {
  const pn = pubnum(u);
  if (!pn) return null;
  const r = await fetch(`https://ted.europa.eu/en/notice/${pn}/xml`, { headers: UA });
  if (!r.ok) return null;
  const xml = await r.text();
  // Hæfiskröfurnar búa í TenderingTerms (TendererQualificationRequest o.fl.);
  // tökum þá kafla + titil/lýsingu. Fallback: allt XML-ið (klippt).
  const kaflar = [];
  for (const rx of [/<cac:TenderingTerms[\s\S]*?<\/cac:TenderingTerms>/g, /<cac:ProcurementProject>[\s\S]*?<\/cac:ProcurementProject>/]) {
    for (const m of xml.match(rx) || []) kaflar.push(m);
  }
  const efni = kaflar.length ? kaflar.join('\n') : xml;
  const hefurKrofur = /TendererQualificationRequest|SpecificTendererRequirement|selection-criteria/i.test(efni);
  return { texti: stripXml(efni).slice(0, 60000), hefurKrofur };
}

// ── Claude-þáttun (structured output — fyrsta text-blokk er gilt JSON) ──
async function thatta(t, texti) {
  const resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Útboð: „${t}“\n\nTexti tilkynningarinnar:\n${texti}` }],
  });
  if (resp.stop_reason === 'refusal') return null;
  if (resp.stop_reason === 'max_tokens') { console.log('    ⚠ max_tokens — sleppi'); return null; }
  const blokk = resp.content.find((b) => b.type === 'text');
  return blokk ? JSON.parse(blokk.text) : null;
}

async function main() {
  const utbod = JSON.parse(fs.readFileSync(path.join(GOGN, 'utbod.json'), 'utf8'));
  const ted = (utbod.tenders || []).filter((x) => x.src === 'ted' && x.u);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(path.join(GOGN, OUT), 'utf8')).haefi || {}; } catch (e) {}

  // Halda aðeins færslum útboða sem enn eru í safninu; finna óþáttuð
  const lifandi = new Set(ted.map((x) => x.u));
  const haefi = Object.fromEntries(Object.entries(prev).filter(([u]) => lifandi.has(u)));
  const ny = ted.filter((x) => !haefi[x.u]).slice(0, MAX_PER_RUN);
  console.log(`utbod_haefi: ${ted.length} TED-útboð · ${Object.keys(haefi).length} áður þáttuð · ${ny.length} ný í þessari keyrslu`);

  let ok = 0, engar = 0, villur = 0;
  for (const x of ny) {
    try {
      const s = await saekjaTexta(x.u);
      if (!s) { villur++; continue; }
      if (!s.hefurKrofur) { haefi[x.u] = { t: x.t, engar: true }; engar++; continue; }
      const d = await thatta(x.t, s.texti);
      if (!d) { villur++; continue; }
      haefi[x.u] = d.krofur.length
        ? { t: x.t, krofur: d.krofur, lagmarksvelta_isk: d.lagmarksvelta_isk || 0, vottord: d.vottord || [], reynsla_ar: d.reynsla_ar || 0, tryggingar: !!d.tryggingar }
        : { t: x.t, engar: true };
      if (d.krofur.length) ok++; else engar++;
      console.log(`  ✓ ${x.t.slice(0, 60)} — ${d.krofur.length} kröfur${d.lagmarksvelta_isk ? ' · velta ≥ ' + Math.round(d.lagmarksvelta_isk / 1e6) + ' m.kr.' : ''}`);
    } catch (e) {
      villur++;
      console.log(`  ✗ ${x.t.slice(0, 50)}: ${String(e && e.message || e).slice(0, 80)}`);
    }
  }

  const nMed = Object.values(haefi).filter((h) => h.krofur && h.krofur.length).length;
  const out = { updated: new Date().toISOString(), n: Object.keys(haefi).length, nMedKrofur: nMed, haefi };
  const payload = JSON.stringify(out);
  fs.writeFileSync(path.join(GOGN, OUT), payload);
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, OUT), payload);
  console.log(`Skrifað: gogn/${OUT} + public · ${Object.keys(haefi).length} útboð (${nMed} m/kröfur) · nýtt: ${ok} þáttuð, ${engar} án krafna, ${villur} villur · ${Math.round(payload.length / 1024)} KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
