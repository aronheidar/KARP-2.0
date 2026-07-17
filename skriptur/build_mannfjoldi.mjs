#!/usr/bin/env node
// build_mannfjoldi.mjs — snapshot fyrir /mannfjoldi/:
//   • Heildarmannfjöldi ársfj. (16 ár) + fjölgun frá fyrra ári   (Hagstofa MAN10001)
//   • Þættir fólksfjölgunar: aðfl. umfram brottfl. + fæddir umfram dána (MAN00000)
//   • Hlutfall innflytjenda af mannfjölda                          (MAN43000)
//   • Frjósemi (börn á ævi hverrar konu) 1960–                      (MAN05202)
//   • Mannfjöldaspá til 2074 (mannfjöldi/nátt.fjölgun/flutn.) lág/mið/há (MAN09012)
// Áður .astro-frontmatter á hverri byggingu → nú daglegt snapshot (seigla + saga).
// -> gogn/mannfjoldi.json + web/public/gogn/mannfjoldi.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const prev = loadPrev('mannfjoldi');

// Heildarmannfjöldi, ársfjórðungslega (64 ársfj. ≈ 16 ár).
let POP = null;
try {
  const j = await px('Ibuar/mannfjoldi/1_yfirlit/arsfjordungstolur/MAN10001.px', [sel('Sveitarfélag', 'item', ['IS']), sel('Kyn og ríkisfang', 'item', ['0']), sel('Ársfjórðungur', 'top', ['64'])]);
  const m = {};
  j.data.forEach((d) => { const t = d.key.find((k) => /\d{4}/.test(k)); const v = num(d.values[0]); if (t && v != null) m[t] = v; });
  const ts = Object.keys(m).sort();
  if (ts.length) {
    const last = m[ts[ts.length - 1]], y4 = m[ts[ts.length - 5]];
    POP = { labels: ts.map((t) => t.replace(/(\d{4}).*?([1-4])$/, '$1 F$2')), vals: ts.map((t) => m[t]), now: last, prev: y4 ?? null, yoy: y4 ? Math.round(((last - y4) / y4) * 1000) / 10 : null, yoyAbs: y4 ? last - y4 : null };
  }
} catch (e) { console.error('POP', e.message); }

// Þættir fólksfjölgunar: 2=heildarfjölgun, 3=aðfl. umfram brottfl., 4=fæddir umfram dána.
let COMP = null;
try {
  const j = await px('Ibuar/mannfjoldi/1_yfirlit/Yfirlit_mannfjolda/MAN00000.px', [sel('Eining', 'item', ['3', '4', '2'])]);
  const by = { 2: {}, 3: {}, 4: {} };
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}$/.test(k));
    const e = d.key.find((k) => k === '2' || k === '3' || k === '4');
    const v = num(d.values[0]);
    if (t && e && v != null) by[e][t] = v;
  });
  const years = Object.keys(by[2]).filter((y) => by[3][y] != null && by[4][y] != null).sort().slice(-25);
  if (years.length) COMP = { years, netmig: years.map((y) => by[3][y]), natural: years.map((y) => by[4][y]), total: years.map((y) => by[2][y]) };
} catch (e) { console.error('COMP', e.message); }

// Innflytjendur: hlutfall af mannfjölda (124 = innflytjendur, -1 = alls; Kyn=0 svo kynjaraðir yfirskrifi ekki).
let IMM = null;
try {
  const j = await px('Ibuar/mannfjoldi/3_bakgrunnur/Uppruni/MAN43000.px', [sel('Aldur', 'item', ['-1']), sel('Bakgrunnur', 'item', ['-1', '124']), sel('Kyn', 'item', ['0'])]);
  const all = {}, imm = {};
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}$/.test(k));
    const b = d.key.includes('124') ? '124' : '-1';
    const v = num(d.values[0]);
    if (t && v != null) (b === '124' ? imm : all)[t] = v;
  });
  const years = Object.keys(imm).filter((y) => all[y]).sort().slice(-20);
  if (years.length) {
    const share = years.map((y) => Math.round((imm[y] / all[y]) * 1000) / 10);
    IMM = { years, share, now: share[share.length - 1], prev: share.length > 1 ? share[share.length - 2] : null };
  }
} catch (e) { console.error('IMM', e.message); }

// Frjósemi: Eining 0 = lifandi fædd börn á ævi hverrar konu (heildarfrjósemi). Frá 1960.
let FERT = null;
try {
  const j = await px('Ibuar/Faeddirdanir/Faeddir/faedingar/MAN05202.px', [sel('Ár', 'all', ['*']), sel('Eining', 'item', ['0'])]);
  const m = {};
  j.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}$/.test(k)); const v = num(d.values[0]); if (t && v != null) m[t] = v; });
  const years = Object.keys(m).filter((y) => +y >= 1960).sort();
  if (years.length) FERT = { years: years.map(Number), tfr: years.map((y) => m[y]), now: m[years[years.length - 1]] };
} catch (e) { console.error('FERT', e.message); }

// Mannfjöldaspá til 2074 (MAN09012): spáafbrigði 2=lágspá L1, 3=miðgildi, 4=háspá H1.
// Þættir: Mannfjöldi (1. jan), Náttúrufjölgun (fæddir umfram dána), Flutningsjöfnuður (aðfl. umfram brottfl.).
let PROJ = null;
try {
  const j = await px('Ibuar/mannfjoldaspa/MAN09012.px', [sel('Ár', 'all', ['*']), sel('Spáafbrigði', 'item', ['2', '3', '4']), sel('Helstu þættir', 'item', ['Mannfjöldi', 'Náttúrufjölgun', 'Flutningsjöfnuður'])]);
  const st = {};
  j.data.forEach((d) => {
    const t = d.key.find((k) => /^\d{4}$/.test(k));
    const vv = d.key.find((k) => k === '2' || k === '3' || k === '4');
    const f = d.key.find((k) => k === 'Mannfjöldi' || k === 'Náttúrufjölgun' || k === 'Flutningsjöfnuður');
    const v = num(d.values[0]);
    if (t && vv && f) { (st[t] = st[t] || {})[vv] = (st[t][vv] || {}); st[t][vv][f] = v; }
  });
  const years = Object.keys(st).sort();
  const pick = (y, vv, f) => (st[y] && st[y][vv] && st[y][vv][f] != null ? st[y][vv][f] : null);
  if (years.length) {
    // fyrsta árið þar sem miðspá náttúrufjölgunar verður neikvæð (fleiri deyja en fæðast).
    let natNeg = null;
    for (const y of years) { if (pick(y, '3', 'Náttúrufjölgun') != null && pick(y, '3', 'Náttúrufjölgun') < 0) { natNeg = +y; break; } }
    PROJ = {
      years: years.map(Number),
      popMid: years.map((y) => pick(y, '3', 'Mannfjöldi')), popLow: years.map((y) => pick(y, '2', 'Mannfjöldi')), popHigh: years.map((y) => pick(y, '4', 'Mannfjöldi')),
      natural: years.map((y) => pick(y, '3', 'Náttúrufjölgun')), netmig: years.map((y) => pick(y, '3', 'Flutningsjöfnuður')),
      natNeg,
    };
  }
} catch (e) { console.error('PROJ', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást.
POP = POP ?? prev.POP ?? null;
COMP = COMP ?? prev.COMP ?? null;
IMM = IMM ?? prev.IMM ?? null;
FERT = FERT ?? prev.FERT ?? null;
PROJ = PROJ ?? prev.PROJ ?? null;
if (!POP && !COMP && !IMM) { console.error('mannfjoldi: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('mannfjoldi', { updated: today(), POP, COMP, IMM, FERT, PROJ });
console.log('mannfjoldi.json | POP', POP && POP.now, '| COMP', COMP && COMP.years.length, 'ár | IMM', IMM && IMM.now, '% | FERT', FERT && FERT.now, '| PROJ', PROJ && PROJ.years.length + ' ár, natNeg ' + (PROJ && PROJ.natNeg), '| bytes', bytes);
