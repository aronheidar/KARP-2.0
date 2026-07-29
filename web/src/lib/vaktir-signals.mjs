// vaktir-signals.mjs — hrein rökvél fyrir eftirlits-/byggingar-vöktun (engin I/O; prófuð).
// Deilt af worker.js digest (eftirlit→firmavakt eftir kt, bygging→fastvakt eftir póstnr/götu).

// Nýleiki eftir ISO-dagsetningu vs viku-mörk (yyyy-mm-dd streng, sama og digest wkDate). true ef iso >= wkDate.
export function eftNylegt(iso, wkDate) {
  const d = String(iso == null ? '' : iso).slice(0, 10);
  return !!d && !!wkDate && d >= String(wkDate);
}

// Byggingar-pörun við fastvakt-leitarorð q: 3ja-stafa q → póstnúmer (item.pn===q); annars gatna-forskeyti
// (item.a lágstafað byrjar á q). Tómt q → false. Sleppir sv (byggingar bera hverfi, ekki kaupskrá-svæði).
export function byggMatch(item, q) {
  const s = String(q == null ? '' : q).toLowerCase().trim();
  if (!s || !item) return false;
  if (/^\d{3}$/.test(s)) return String(item.pn || '') === s;
  return String(item.a || '').toLowerCase().startsWith(s);
}
