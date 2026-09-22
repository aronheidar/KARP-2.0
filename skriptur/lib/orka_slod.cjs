// skriptur/lib/orka_slod.cjs — finnur nýjustu „Þróun raforkuframleiðslu"-útgáfuna á talnaefnissíðunni.
//
// ⚠ build_orka.js harðkóðaði áður slóð útgáfu OS-2025-1 (1969–2024) og /orka/ fraus í 2024. Útgáfan
// 1.4.2026 bar nýtt auðkenni (ROS-2026-1), svo slóðina verður að lesa af síðunni, ekki giska á hana.
'use strict';

const TALNAEFNI = 'https://orkustofnun.is/upplysingar/talnaefni/raforka';

/** HTML talnaefnissíðunnar → { slod, ar } fyrir útgáfuna með hæsta lokaárinu, eða null. */
function nyjastaRaforkuSlod(html, grunnur = TALNAEFNI) {
  let best = null;
  for (const m of String(html).matchAll(/href="([^"]*throun-raforkuframleidslu[^"]*\.xlsx)"/gi)) {
    const ar = Number((m[1].match(/\d{4}-(\d{4})/) || [])[1]);
    if (!ar) continue;
    if (!best || ar > best.ar) best = { slod: new URL(m[1], grunnur).href, ar };
  }
  return best;
}

/** „+" í slóð getur staðið fyrir bil í skráarheitinu; reyna fyrst óbreytt, svo með %20. */
function slodarKostir(slod) {
  return slod.includes('+') ? [slod, slod.replace(/\+/g, '%20')] : [slod];
}

module.exports = { TALNAEFNI, nyjastaRaforkuSlod, slodarKostir };
