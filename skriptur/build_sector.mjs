#!/usr/bin/env node
// build_sector.mjs — greinar-viðmið (F2) úr Hagstofu FYR08010 (Rekstrar- og efnahagsyfirlit).
// -> web/public/gogn/sector_kpi.json : { updated, source, ar, map:{<isat-forskeyti>:{...hlutföll,label}}, heild:{...} }
// Runtime: company f.isat[0] -> tölustafir -> lengsta forskeyti í map (annars heild).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'sector_kpi.json');
const API = 'https://px.hagstofa.is/pxis/api/v1/is/Atvinnuvegir/fyrirtaeki/afkoma/2_rekstrarogefnahags/FYR08010.px';
const UA = { 'User-Agent': 'KARP dashboard build (karp.is)', 'Accept': 'application/json', 'Content-Type': 'application/json' };

// Reikningsliður-kóðar sem við sækjum
const L = { starfsm: '1', tekjur: '2', hraefni: '4', laun: '5', ebit: '8', hagnadur: '14', langtima: '23', skammtima: '24', eigidfe: '25' };
const YEARS = ['2024', '2023']; // nýjast fyrst; fallback per grein

// ÍSAT-forskeyti úr greina-heiti: "...(ÍSAT2008: 031, 102)" / "13-15" / "10, án 102"
function isatPrefixes(label) {
  const m = String(label).match(/ÍSAT[^\d)]*([\d][^)]*)\)/);
  if (!m) return [];
  const out = [];
  for (let tok of m[1].split(',')) {
    tok = tok.trim();
    if (/^án\b/i.test(tok)) continue;              // undantekning -> sleppa
    const range = tok.match(/^(\d{2})\s*-\s*(\d{2})$/);
    if (range) { for (let d = +range[1]; d <= +range[2]; d++) out.push(String(d).padStart(2, '0')); continue; }
    const code = tok.match(/^\d{2,4}$/);
    if (code) out.push(code[0]);
  }
  return out;
}
const num = (v) => (v == null || v === '.' || v === '..' || v === '...' || v === '-' ? null : (typeof v === 'number' ? v : (isNaN(+v) ? null : +v)));
const ratio = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

async function getJson(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: UA, body: JSON.stringify(body) } : { headers: UA });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url + ' :: ' + (await r.text()).slice(0, 200));
  return r.json();
}

// json-stat2 accessor
function jsAccessor(js) {
  const ids = js.id, sizes = js.size, val = js.value;
  const idx = {}; // dim -> {code: pos}
  for (const d of ids) idx[d] = js.dimension[d].category.index;
  const labels = {};
  for (const d of ids) labels[d] = js.dimension[d].category.label || {};
  const strides = new Array(ids.length); let s = 1;
  for (let i = ids.length - 1; i >= 0; i--) { strides[i] = s; s *= sizes[i]; }
  return {
    ids, idx, labels,
    get(codes) { // codes: {dim:code}
      let off = 0;
      for (let i = 0; i < ids.length; i++) { const p = idx[ids[i]][codes[ids[i]]]; if (p == null) return null; off += p * strides[i]; }
      return num(val[off]);
    },
  };
}

(async () => {
  console.log('sæki lýsigögn FYR08010…');
  const meta = await getJson(API);
  const agVar = meta.variables.find((v) => v.code === 'Atvinnugrein');
  const codes = agVar.values, texts = agVar.valueTexts;

  console.log('sæki gögn (', YEARS.join('/'), ')…');
  const js = await getJson(API, {
    query: [
      { code: 'Atvinnugrein', selection: { filter: 'item', values: codes } },
      { code: 'Reikningsliður', selection: { filter: 'item', values: Object.values(L) } },
      { code: 'Tekjuár', selection: { filter: 'item', values: YEARS } },
    ],
    response: { format: 'json-stat2' },
  });
  const A = jsAccessor(js);
  const yearDim = A.ids.find((d) => /ár|tekjuár/i.test(d)) || 'Tekjuár';

  const map = {}; let heild = null; let usedYear = null;
  const kpiFor = (agCode) => {
    for (const y of YEARS) {
      const g = (li) => A.get({ Atvinnugrein: agCode, Reikningsliður: L[li], [yearDim]: y });
      const tekjur = g('tekjur');
      if (tekjur == null || tekjur === 0) continue;
      const hraefni = g('hraefni'), laun = g('laun'), ebit = g('ebit'), hagnadur = g('hagnadur');
      const langtima = g('langtima'), skammtima = g('skammtima'), eigidfe = g('eigidfe'), starfsm = g('starfsm');
      const eignir = (langtima || 0) + (skammtima || 0) + (eigidfe || 0);
      usedYear = usedYear || y;
      return {
        ar: +y,
        framlegd: r4(ratio(tekjur - Math.abs(hraefni || 0), tekjur)),  // kostn. neikvæðir í töflu
        hagnadarhlutfall: r4(ratio(hagnadur, tekjur)),
        ebit_hlutfall: r4(ratio(ebit, tekjur)),
        eiginfjarhlutfall: r4(ratio(eigidfe, eignir)),
        skuldahlutfall_DE: r4(ratio((langtima || 0) + (skammtima || 0), eigidfe)),
        eignavelta: r4(ratio(tekjur, eignir)),
        launahlutfall: r4(ratio(Math.abs(laun || 0), tekjur)),
        tekjur_pr_starfsm_mkr: starfsm ? Math.round(tekjur / starfsm) : null,  // tekjur í m.kr
      };
    }
    return null;
  };

  for (let i = 0; i < codes.length; i++) {
    const c = codes[i], label = texts[i];
    const k = kpiFor(c);
    if (!k) continue;
    if (c === '0') { heild = { label, ...k }; continue; } // Viðskiptahagkerfið = heild
    for (const p of isatPrefixes(label)) {
      if (!map[p] || p.length >= (map[p]._plen || 0)) map[p] = { label, _plen: p.length, ...k };
    }
  }
  for (const p in map) delete map[p]._plen;

  const data = { updated: new Date().toISOString().slice(0, 10), source: 'Hagstofa Íslands — FYR08010 Rekstrar- og efnahagsyfirlit', ar: usedYear ? +usedYear : null, n: Object.keys(map).length, map, heild };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('sector_kpi.json | forskeyti:', Object.keys(map).length, '| ár:', data.ar, '| bytes:', fs.statSync(OUT).size);
  // sanngæfa
  const demo = (dig) => { let b = null, bl = -1; for (const p in map) if (dig.startsWith(p) && p.length > bl) { b = map[p]; bl = p.length; } return b || heild; };
  for (const [n, d] of [['46 heildv', '46'], ['031 sjávar', '031'], ['41 bygg', '41'], ['5610 veiting', '5610']]) {
    const x = demo(d); console.log('  ', n, '->', x && x.label, '| framlegð', x && x.framlegd, '| eiginfjárhlutf', x && x.eiginfjarhlutfall, '| tekj/starfsm(m)', x && x.tekjur_pr_starfsm_mkr);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
