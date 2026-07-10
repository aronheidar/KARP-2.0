#!/usr/bin/env node
// build_hugverk.mjs — snapshot fyrir /atvinnuvegir/hugverk/:
//   • R&Þ-útgjöld % af VLF eftir framkvæmdaaðila (Hagstofa FYR05101) → C1/rdL
//   • Nýskráð vörumerki sl. 45 daga (Hugverkastofan api.hugverk.is, opið leitar-API) → VM
// Áður .astro-frontmatter á hverri byggingu → nú daglegt snapshot (seigla + saga).
// -> gogn/hugverk.json + web/public/gogn/hugverk.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const prev = loadPrev('hugverk');
const ADILAR = { 1: ['Fyrirtæki', '#19d3c5'], 2: ['Háskólar', '#3a8dff'], 3: ['Opinberar stofnanir', '#c95cf7'] };

// R&Þ-útgjöld (% af VLF) eftir framkvæmdaaðila — FYR05101.
let C1 = null, rdL = null;
try {
  const j = await px('Atvinnuvegir/visinditaekni/rannsoknthroun/FYR05101.px', [sel('Eining', 'item', Object.keys(ADILAR)), sel('Niðurstöður', 'item', ['2']), sel('Ár', 'all', ['*'])]);
  const by = {};
  j.data.forEach((d) => { const y = d.key.find((k) => /^\d{4}$/.test(k)); const a = d.key.find((k) => ADILAR[k] && k.length === 1); const v = num(d.values[0]); if (y && a && v != null) ((by[a] = by[a] || {})[y] = v); });
  const ys = [...new Set(Object.values(by).flatMap((o) => Object.keys(o)))].sort();
  if (ys.length) {
    C1 = { x: ys, u: '% af VLF', series: Object.keys(ADILAR).filter((k) => by[k]).map((k) => ({ name: ADILAR[k][0], color: ADILAR[k][1], data: ys.map((y) => by[k][y] ?? null) })), stack: true };
    const l = ys[ys.length - 1];
    rdL = { y: l, v: Math.round(Object.keys(by).reduce((s, k) => s + (by[k][l] || 0), 0) * 100) / 100 };
  }
} catch (e) { console.error('C1', e.message); }

// Nýskráð vörumerki sl. 45 daga — Hugverkastofan.
const dIS = (iso) => { const [y, m, d] = String(iso || '').split('-'); return d ? +d + '.' + +m + '.' + y : ''; };
let VM = null, vmTotal = 0, vmFra = '';
try {
  const df = new Date(); df.setDate(df.getDate() - 45);
  vmFra = df.toISOString().slice(0, 10);
  const r = await fetch('https://api.hugverk.is/umbraco/api/search/searchtrademarks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ textfield: '', owner: [], agent: [], type: [], status: [], category: [], registrationDateFrom: vmFra, page: 1 }),
  });
  if (r.ok) {
    const j = await r.json();
    vmTotal = j.totalCount || 0;
    VM = (j.results || []).map((it) => it.document || {}).filter((x) => x.identifier).slice(0, 30).map((x) => ({
      id: x.identifier, titill: x.titleUnchanged || x.title || '', tegund: x.type || '',
      eigandi: (x.owner || []).map((o) => o.ownerName).filter(Boolean).join(', '),
      kt: String(((x.owner || [])[0] || {}).ownerSsn || '').replace(/\D/g, ''),
      flokkar: (x.category || []).slice(0, 6), skrad: dIS((x.registrationDate || '').slice(0, 10)),
      mynd: x.imagePath || '', url: 'https://www.hugverk.is/leit/trademark/' + x.identifier,
    }));
    if (!VM.length) VM = null;
  }
} catch (e) { console.error('VM', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (VM heldur líka vmTotal/vmFra saman).
C1 = C1 ?? prev.C1 ?? null;
rdL = rdL ?? prev.rdL ?? null;
if (VM == null && prev.VM) { VM = prev.VM; vmTotal = prev.vmTotal ?? 0; vmFra = prev.vmFra ?? vmFra; }
if (!C1 && !VM) { console.error('hugverk: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('hugverk', { updated: today(), C1, rdL, VM, vmTotal, vmFra });
console.log('hugverk.json | R&Þ', rdL && rdL.v, '% (', rdL && rdL.y, ') | vörumerki', VM && VM.length, '/', vmTotal, '| bytes', bytes);
