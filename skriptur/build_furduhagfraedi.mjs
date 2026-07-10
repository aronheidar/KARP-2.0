#!/usr/bin/env node
// build_furduhagfraedi.mjs — snapshot fyrir /furduhagfraedi/:
//   • 🏃 Launakapphlaupið — laun vs húsnæðisverð vs almennt verðlag, allt sett á 100
//     í fyrsta sameiginlega mánuði (2000M03). Heimild: Hagstofa Íslands (PxWeb).
//       - Laun (vísitala)             LAU04000
//       - Húsnæðisverð (RI_total)     VIS01106
//       - Vísitala neysluverðs (CPI)  VIS01000
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga).
// Numbeo-verðin (spjöldin) haldast bökuð í gogn/numbeo.json — aðeins Hagstofu-sóknin flyst hingað.
// -> gogn/furduhagfraedi.json + web/public/gogn/furduhagfraedi.json
import { px, sel, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const prev = loadPrev('furduhagfraedi');

// toMap: PxWeb-svar → { lykill(mánuður): gildi }, sleppir NaN. (verbatim úr gömlu frontmatter)
const toMap = (j, ti = 0) => { const m = {}; (j.data || []).forEach((d) => { const v = parseFloat(String(d.values[0]).replace(',', '.')); if (!isNaN(v)) m[d.key[ti]] = v; }); return m; };

// 🏃 Launakapphlaupið (LOTA 13g): laun vs húsnæði vs verðlag, allt sett á 100 í 2000M03
// (fyrsta mán. íbúðavísitölu). Byggingartíma-PxWeb, þolir bilun.
let RACE = null;
try {
  const [lau, hus, cpi] = await Promise.all([
    px('Samfelag/launogtekjur/2_lvt/1_manadartolur/LAU04000.px', [sel('Eining', 'item', ['index'])]),
    px('Efnahagur/visitolur/1_vnv/3_greiningarvisitolur/VIS01106.px', [sel('Vísitala', 'item', ['RI_total'])]),
    px('Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px', [sel('Vísitala', 'item', ['CPI']), sel('Liður', 'item', ['index'])]),
  ]);
  const L = toMap(lau), H = toMap(hus), C = toMap(cpi);
  const months = Object.keys(H).filter((m) => L[m] != null && C[m] != null).sort();
  const base = months[0];
  if (base && months.length > 24) {
    const rb = (M) => months.map((m) => Math.round((M[m] / M[base]) * 1000) / 10);
    const wage = rb(L), house = rb(H), cpix = rb(C);
    RACE = {
      labels: months, wage, house, cpi: cpix,
      baseY: base.slice(0, 4),
      fW: Math.round((wage[wage.length - 1] / 100) * 10) / 10,
      fH: Math.round((house[house.length - 1] / 100) * 10) / 10,
      fC: Math.round((cpix[cpix.length - 1] / 100) * 10) / 10,
    };
  }
} catch (e) { console.error('RACE', e.message); }

// Seigla: haltu fyrra snapshot-i ef ný Hagstofu-sókn brást (tæmir aldrei það sem áður var til).
RACE = RACE ?? prev.RACE ?? null;
if (!RACE) { console.error('furduhagfraedi: RACE tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('furduhagfraedi', { updated: today(), RACE });
console.log('furduhagfraedi.json | RACE', !!RACE, '| mánuðir', RACE.labels.length, '| grunnár', RACE.baseY, '| laun x' + RACE.fW, 'húsn x' + RACE.fH, 'verðlag x' + RACE.fC, '| bytes', bytes);
