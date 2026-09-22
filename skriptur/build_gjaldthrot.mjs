#!/usr/bin/env node
// build_gjaldthrot.mjs — snapshot fyrir /gjaldthrot/, forsíðureitinn og spjaldið á /atvinnuvegir/:
//   • FYR03001 nýskráningar og gjaldþrot eftir mánuðum frá 2008 (Alls, öll rekstrarform)
//   • FYR03010 gjaldþrot fyrirtækja með starfsemi árið áður, launafólk þeirra og VSK-velta (m.kr.)
//     eftir mánuðum og bálkum frá 2009
// Útreikningarnir eru í lib/gjaldthrot.mjs (prófaðir). Hagstofan birtir ársfjórðungslega (tölur til júní
// birtust 15.7.2026); ferskleikavörnin (lib/ferskleiki.mjs) flaggar ef `nyjasti` verður eldri en 130 daga.
// ⚠ ALLT EÐA EKKERT: hlutarnir nota báðar töflurnar (frá áramótum blandar þeim saman), svo ef sókn eða
//   útreikningur bregst skrifast ekkert og síðasta snapshot stendur. Hin Hagstofu-snapshotin halda
//   hluta fyrir hluta, en hér yrðu hlutarnir þá úr ólíkum útgáfum.
// -> gogn/gjaldthrot.json + web/public/gogn/gjaldthrot.json
import { px, sel, getJson, writeSnapshot, today } from './_pxlib.mjs';
import { lesaPx, smidaGjaldthrot } from './lib/gjaldthrot.mjs';

const MAPPA = 'Atvinnuvegir/fyrirtaeki/skradfyrirtaeki/2_skraningar/';
const ALLT = ['*'];

try {
  const [a, b, meta] = await Promise.all([
    px(MAPPA + 'FYR03001.px', [sel('Mánuður', 'all', ALLT), sel('Atvinnugreinar', 'item', ['Alls']), sel('Rekstrarform', 'item', ['Alls']), sel('Breytur', 'all', ALLT)]),
    px(MAPPA + 'FYR03010.px', [sel('Mánuður', 'all', ALLT), sel('Atvinnugreinar', 'all', ALLT), sel('Breytur', 'all', ALLT)]),
    getJson('https://px.hagstofa.is/pxis/api/v1/is/' + MAPPA + 'FYR03010.px'),
  ]);
  const v = meta.variables.find((x) => x.code === 'Atvinnugreinar');
  const heiti = Object.fromEntries(v.values.map((k, i) => [k, v.valueTexts[i]]));
  const G = smidaGjaldthrot({ fyr03001: lesaPx(a), fyr03010: lesaPx(b), heiti });
  const bytes = writeSnapshot('gjaldthrot', { updated: today(), ...G });
  const y = G.ytd;
  console.log(`gjaldthrot.json | til ${G.nyjasti} | ${y.heiti}: ${y.nu.skrad} gjaldþrot (${y.nu.virk} með starfsemi, ${y.nu.launafolk} launafólk), ${y.nu.nyskr} nýskráningar | ${G.balkar.rodir.length} bálkar | bytes ${bytes}`);
} catch (e) {
  console.error('gjaldthrot: sókn eða útreikningur brást, fyrra snapshot stendur óbreytt:', e.message);
  process.exit(1);
}
