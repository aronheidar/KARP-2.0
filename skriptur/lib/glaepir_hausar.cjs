// skriptur/lib/glaepir_hausar.cjs — árshausar í afbrotaskjali Ríkislögreglustjóra.
//
// ⚠ Síðasta árið kemur sem STRENGUR með stjörnu („2025*" = bráðabirgðatölur), hin sem tölur. Gamla
// síun (typeof === 'number') hoppaði yfir nýjasta árið og /afbrot/ sýndi 2024 í hálft ár (21.9.2026).
'use strict';

/** Hausröð → [{ y, i, bradabirgda }] fyrir dálka sem eru ár (2001+), tölur eða strengir, með eða án „*". */
function artalsdalkar(hdr) {
  const ut = [];
  hdr.forEach((h, i) => {
    const m = String(h ?? '').trim().match(/^(\d{4})\s*(\*)?$/);
    if (!m) return;
    const y = Number(m[1]);
    if (y > 2000) ut.push({ y, i, bradabirgda: Boolean(m[2]) });
  });
  return ut;
}

module.exports = { artalsdalkar };
