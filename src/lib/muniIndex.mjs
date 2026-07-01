// muniIndex.mjs — sveitarfélaga-vísitala (fjárhagur · vöxtur · atvinna), kvörðuð
// milli sveitarfélaga >1.000 íbúa. Hrein útgáfa af karpMuniIndex() (dashboard.html l.6354).
// -------------------------------------------------------------------------
// Gagnaglobölin (SVFIN/SVMETA/SVPOP/ATVINNULEYSI) sem fallið las úr scope eru hér
// TEKIN SEM VIÐFANG. Memóun (var _MUNIIDX) er eftirlátin kallanda (hrein fall).
// #2 Á1, 2026-07-01.

/**
 * @param data { SVFIN, SVMETA, SVPOP, ATVINNULEYSI }
 * @returns { <sveitarfélag>: { idx, fjar, vox, atv } } — allt 0–100 (eða null), kvarðað milli sveitarfélaga
 */
export function computeMuniIndex(data = {}) {
  const FIN = data.SVFIN || {}, META = data.SVMETA || {}, POP = data.SVPOP || {};
  const ATV = (data.ATVINNULEYSI && data.ATVINNULEYSI.byMuni) || {};

  const num = (x) => (typeof x === 'number' && isFinite(x)) ? x : null;
  const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  const names = Object.keys(FIN).filter((m) => (POP[m] || 0) >= 1000);
  const rows = names.map((m) => {
    const f = FIN[m] || {}, me = META[m] || {}, a = ATV[m];
    return { m, afk: num(f.afkoma_ibui), skd: num(f.skuldir_ibui), gro: num(me.breyting_pct), ung: num(me.ung), unemp: a ? num(a.rate) : null };
  });

  // Kvörðun 0–100 milli allra raða; dir<0 snýr við (lægra = betra, t.d. skuldir/atvinnuleysi).
  const norm = (field, dir) => {
    const vals = rows.map((r) => r[field]).filter((v) => v != null);
    if (!vals.length) return () => null;
    const mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1;
    return (v) => { if (v == null) return null; const p = (v - mn) / rg * 100; return dir < 0 ? 100 - p : p; };
  };
  const nAfk = norm('afk', 1), nSkd = norm('skd', -1), nGro = norm('gro', 1), nUng = norm('ung', 1), nUne = norm('unemp', -1);

  const map = {};
  rows.forEach((r) => {
    const fjar = avg([nAfk(r.afk), nSkd(r.skd)]);   // 🏦 afkoma + skuldir
    const vox  = avg([nGro(r.gro), nUng(r.ung)]);   // 📈 fólksfjölgun + ungt fólk
    const atv  = nUne(r.unemp);                      // 👷 atvinnuleysi (öfugt)
    map[r.m] = { idx: avg([fjar, vox, atv]), fjar, vox, atv };
  });
  return map;
}
