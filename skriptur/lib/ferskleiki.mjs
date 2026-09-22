// skriptur/lib/ferskleiki.mjs — ferskleikavörn gagnasafna: aldur NÝJASTA TÍMABILS, ekki keyrslunnar.
//
// ⚠⚠ AF HVERJU (21.9.2026): fimm gagnasöfn stóðu í allt að þrjá mánuði meðan dagleg keyrsla var græn.
//   Atvinnuleysi á forsíðu í maí (skriptan las xlsm sem enginn endurnýjaði), kannanir í júní (Wikipedia
//   á eftir), afbrot 2024 (þáttunarvilla), orka 2024 (harðkóðuð slóð), tónn frétta frá júní (ekki í
//   keyrslunni). Útgangskóðinn mældi ekkert af þessu og byggingardagurinn uppfærist hvort sem er.
//   Hvert safn fær hér hámarksaldur nýjasta tímabils m.v. útgáfutakt heimildarinnar.

const MAN = { jan: 1, feb: 2, mar: 3, apr: 4, maí: 5, jún: 6, júl: 7, ágú: 8, sep: 9, okt: 10, nóv: 11, des: 12 };
const iso = (ar, man, dagur) => `${ar}-${String(man).padStart(2, '0')}-${String(dagur).padStart(2, '0')}`;
const manadarlok = (ar, man) => iso(ar, man, new Date(Date.UTC(ar, man, 0)).getUTCDate());

/**
 * Tímabil → lokadagur þess (ISO) eða null. „2026M08", „2026 F2"/„2026Q2", „júl 2026", „2025",
 * „2024-2025" (skólaár, lýkur 30.6), „2026-08-31".
 */
export function timabilLok(t) {
  const s = String(t ?? '').trim().toLowerCase();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  if ((m = s.match(/^(\d{4})m(\d{2})$/))) return manadarlok(+m[1], +m[2]);
  if ((m = s.match(/^(\d{4})\s*[qf]([1-4])$/))) return manadarlok(+m[1], +m[2] * 3);
  if ((m = s.match(/^(jan|feb|mar|apr|maí|jún|júl|ágú|sep|okt|nóv|des)[a-zúáéíóýþæö]*\.?\s+(\d{4})$/))) return manadarlok(+m[2], MAN[m[1]]);
  if ((m = s.match(/^(\d{4})-(\d{4})$/))) return iso(+m[2], 6, 30);
  if ((m = s.match(/^(\d{4})$/))) return iso(+m[1], 12, 31);
  return null;
}

/** Heilir dagar frá `lok` til `nu` (bæði ISO). */
export const aldurDaga = (lok, nu) => Math.floor((Date.parse(nu) - Date.parse(lok)) / 864e5);

/** Vöktuð gagnasöfn. `hamark` = eðlilegur hámarksaldur nýjasta tímabils (dagar) m.v. `takt`. */
export const GAGNASOFN = [
  { nafn: 'Atvinnuleysi (Vinnumálastofnun)', skra: 'atvinnuleysi', les: (j) => j.updated, hamark: 50, takt: 'mánaðarlegt, birt um 10. næsta mánaðar' },
  { nafn: 'Fylgiskannanir', skra: 'polls', les: (j) => j.polls?.at(-1)?.date, hamark: 45, takt: 'mánaðarlegt' },
  { nafn: 'Vísitala neysluverðs', skra: 'verdlag', les: (j) => j.rows?.at(-1)?.t, hamark: 45, takt: 'mánaðarlegt, birt í lok mánaðar' },
  { nafn: 'Launavísitala', skra: 'vinnumarkadur', les: (j) => j.WAGE?.months?.at(-1), hamark: 75, takt: 'mánaðarlegt, um mánuður í töf' },
  { nafn: 'Vöruviðskipti', skra: 'vidskipti', les: (j) => j.TREND?.labels?.at(-1), hamark: 75, takt: 'mánaðarlegt, um mánuður í töf' },
  { nafn: 'Launakapphlaupið', skra: 'furduhagfraedi', les: (j) => j.RACE?.labels?.at(-1), hamark: 90, takt: 'mánaðarlegt' },
  { nafn: 'Gjaldþrot og nýskráningar', skra: 'gjaldthrot', les: (j) => j.nyjasti, hamark: 130, takt: 'ársfjórðungslegt, birt um tveimur vikum eftir lok ársfjórðungs' },
  { nafn: 'Mannfjöldi', skra: 'mannfjoldi', les: (j) => j.POP?.labels?.at(-1), hamark: 140, takt: 'ársfjórðungslegt' },
  { nafn: 'Landsframleiðsla', skra: 'hagvoxtur', les: (j) => j.GDP?.latestQ, hamark: 160, takt: 'ársfjórðungslegt, um tveir mánuðir í töf' },
  { nafn: 'Afbrot (Ríkislögreglustjóri)', skra: 'glaepir', les: (j) => (j.year != null ? String(j.year) : null), hamark: 430, takt: 'árlegt, birt í febrúar' },
  { nafn: 'Raforkuframleiðsla', skra: 'orka', les: (j) => (j.rows?.at(-1)?.y != null ? String(j.rows.at(-1).y) : null), hamark: 490, takt: 'árlegt, birt í apríl' },
  { nafn: 'Brautskráðir háskóla', skra: 'menntun', les: (j) => j.FIELD?.fieldY, hamark: 560, takt: 'árlegt' },
  { nafn: 'Tónn frétta', skra: 'sentiment', les: (j) => j.updated, hamark: 3, takt: 'daglegt' },
];

/**
 * [{ ...gagnasafn, json }] → [{ nafn, skra, timabil, lok, aldur, hamark, takt, stada }].
 * stada: 'ok' | 'gamalt' | 'olesanlegt' (skrá vantar eða sniðið breyttist: aldrei þögn).
 */
export function metaFerskleika(gogn, nu) {
  return gogn.map((g) => {
    let timabil = null;
    try { timabil = g.json ? g.les(g.json) ?? null : null; } catch { timabil = null; }
    const lok = timabilLok(timabil);
    const aldur = lok ? aldurDaga(lok, nu) : null;
    const stada = aldur == null ? 'olesanlegt' : aldur > g.hamark ? 'gamalt' : 'ok';
    return { nafn: g.nafn, skra: g.skra, timabil, lok, aldur, hamark: g.hamark, takt: g.takt, stada };
  });
}
