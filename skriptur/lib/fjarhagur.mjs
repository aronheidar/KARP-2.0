// fjarhagur.mjs — HREIN: dregur röðunar-samantekt úr ársreikningi-JSON. Nýjasta ISK-ár með veltu.
export function arsreikningurSummary(json) {
  if (!json || !json.ar) return null;
  const years = Object.keys(json.ar).sort().reverse();   // nýjast fyrst
  for (const y of years) {
    const a = json.ar[y] || {};
    if ((a.mynt || 'ISK') !== 'ISK') continue;            // aðeins ISK í röðun
    const r = a.rekstur || {}, e = a.efnahagur || {}, k = a.kvardi || 1;
    if (r.sala == null) continue;                         // þarf veltu til röðunar
    const sc = (v) => (v == null ? null : v * k);
    return { kt: json.kt, ar: y, sala: sc(r.sala), hagnadur: sc(r.hagnadur), eignir: sc(e.eignir), eigid_fe: sc(e.eigid_fe) };
  }
  return null;
}
