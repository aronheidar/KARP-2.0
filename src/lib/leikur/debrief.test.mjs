import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { explainRound } from './debrief.mjs';
import { MANDATE } from './game-config.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json');
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const perKpi = [
  { key: 'verdbolga', label: 'Verðbólga', value: 2.6, score: 95, weight: 1 },
  { key: 'atvinnuleysi', label: 'Atvinnuleysi', value: 6.5, score: 40, weight: 1 },
  { key: 'skuldir', label: 'Skuldir ríkis', value: 38, score: 100, weight: 1 },
  { key: 'hagvoxtur', label: 'Hagvöxtur', value: 2.5, score: 100, weight: 1 },
];
const changes = [
  { key: 'vextir', label: 'Stýrivextir', from: 5, to: 8, unit: '%' },
  { key: 'skattar', label: 'Skattstefna', from: 0, to: 4, unit: '' },
];

// Grunn-uppbygging
const r = explainRound({ changes, perKpi, kpisNow: { verdbolga: 2.6, atvinnuleysi: 6.5, skuldir: 38, hagvoxtur: 2.5 }, mandate: MANDATE, links, baseline });
ok('skilar lines-fylki', Array.isArray(r.lines) && r.lines.length >= 2);
ok('aðal-aðgerð nefnd', r.lines[0].includes('Stýrivextir'));
ok('fjöldi annarra breytinga', r.lines[0].includes('1 önnur breyting'));
ok('sterkast/veikast markmið', r.lines.some((l) => l.includes('Sterkast') && l.includes('Veikast')));
ok('veikast = atvinnuleysi (40)', r.lines.some((l) => l.includes('Atvinnuleysi') && l.includes('40/100')));

// Engar breytingar → kyrrstöðu-lína
const r0 = explainRound({ changes: [], perKpi, mandate: MANDATE, links, baseline });
ok('engar breytingar → kyrrstaða', r0.lines[0].includes('kyrrstaða'));

// Δ frá fyrri umferð (versnun)
const rp = explainRound({ changes, perKpi, kpisNow: { atvinnuleysi: 6.5 }, kpisPrev: { atvinnuleysi: 4.0 }, mandate: MANDATE, links, baseline });
ok('Δ lína til staðar', rp.lines.some((l) => l.includes('fór úr') && l.includes('í 6,5')));
ok('atvinnuleysi hækkun = versnaði', rp.lines.some((l) => l.includes('versnaði')));

// Δ batnaði (target-KPI nær marki)
const rb = explainRound({ changes, perKpi: [{ key: 'verdbolga', label: 'Verðbólga', value: 2.6, score: 20, weight: 1 }], kpisNow: { verdbolga: 2.6 }, kpisPrev: { verdbolga: 8.0 }, mandate: MANDATE, links, baseline });
ok('verðbólga nær marki = batnaði', rb.lines.some((l) => l.includes('batnaði')));

// disp-callback notað ef gefið
const rd = explainRound({ changes, perKpi, mandate: MANDATE, links, baseline, disp: () => 'RAUN' });
ok('disp callback notað', rd.lines[0].includes('RAUN'));

// Fórn-lína aðeins ef aðal-sleðinn togar tvö umboðs-KPI í öfuga átt
ok('fórn-lína valfrjáls (≤ ein)', r.lines.filter((l) => l.includes('⚖️')).length <= 1);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
