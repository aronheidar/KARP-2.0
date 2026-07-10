#!/usr/bin/env node
// build_vinnumarkadur.mjs — snapshot fyrir /vinnumarkadur/:
//   • Laun vs verðbólga (kaupmáttur) — ársbreyting launavísitölu (LAU04001)
//     + ársbreyting vísitölu neysluverðs (VIS01000), síðustu 37 mán.  (Hagstofa)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga).
// Atvinnuleysis-hlutinn kemur áfram úr bökuðu gogn/atvinnuleysi.json (build_atvinnuleysi.js).
// -> gogn/vinnumarkadur.json + web/public/gogn/vinnumarkadur.json
import { px, sel, loadPrev, writeSnapshot, today } from './_pxlib.mjs';
import { monthLabel } from '../src/lib/format.mjs';

const prev = loadPrev('vinnumarkadur');

// Laun vs verðbólga (þolir bilun): LAU04001 ársbreyting launavísitölu + VIS01000 CPI ársbreyting.
// Kaupmáttur = launabreyting − verðbólga (nýjasti sameiginlegi mánuður), námundað í 1 aukastaf.
let WAGE = null;
try {
  const [lj, cj] = await Promise.all([
    px('Samfelag/launogtekjur/2_lvt/1_manadartolur/LAU04001.px', [sel('Mánuður', 'top', ['37']), sel('Vísitala', 'item', ['LVT']), sel('Eining', 'item', ['change_A'])]),
    px('Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px', [sel('Mánuður', 'top', ['37']), sel('Vísitala', 'item', ['CPI']), sel('Liður', 'item', ['change_A'])]),
  ]);
  const grab = (j) => { const m = {}; j.data.forEach((d) => { const t = d.key.find((k) => /^\d{4}M\d{2}$/.test(k)); const v = parseFloat(String(d.values[0]).replace(',', '.')); if (t && !isNaN(v)) m[t] = v; }); return m; };
  const lw = grab(lj), cp = grab(cj);
  const ts = Object.keys(lw).filter((t) => cp[t] != null).sort();
  if (ts.length) {
    const last = ts[ts.length - 1];
    WAGE = { months: ts.map(monthLabel), laun: ts.map((t) => lw[t]), verd: ts.map((t) => cp[t]), kaupm: Math.round((lw[last] - cp[last]) * 10) / 10 };
  }
} catch (e) { console.error('WAGE', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
WAGE = WAGE ?? prev.WAGE ?? null;
if (!WAGE) { console.error('vinnumarkadur: WAGE tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('vinnumarkadur', { updated: today(), WAGE });
console.log('vinnumarkadur.json | WAGE', WAGE.months.length, 'mán | kaupm', WAGE.kaupm, 'pp | bytes', bytes);
