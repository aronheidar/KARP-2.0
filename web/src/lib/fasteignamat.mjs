// fasteignamat.mjs — matsvél fasteignavaktarinnar (hrein föll, engin DOM-snerting).
// Dregin úr client-eyju fasteignavakt.astro 19.8.2026 svo hægt sé að PRÓFA hana og BAKPRÓFA:
// sama fall metur eign notandans OG hverja sölu fortíðar út frá sölum á undan henni, svo
// nákvæmnis-talan í skýrslunni lýsir nákvæmlega aðferðinni sem gaf matið.
//
// Sölusaga (solusaga/<pn>.json): { a, d:'YYYY-MM-DD', kv (þ.kr), fm, teg, herb, ar, ppm (kr/m²) }.
// Öll verð hér eru kr/m² — kallandi deilir með 1000 ef hann vill þ.kr/m².

export const OUTLO = 180000, OUTHI = 2600000;      // sía burt bílskúra/hlutasölur/útlaga (kr/m²)
export const MAT = { dagar: 560, staerd: 0.3, arBil: 15, min: 6 };   // 18 mán · ±30% stærð · ±15 byggingarár · ≥6 sambærilegar

export const midgildi = (a) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const hundradsmark = (a, q) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
export const tsOf = (d) => new Date(d + 'T00:00:00').getTime();

// Sambærilegar sölur fyrir eign { teg, fm, ar? } á tímapunkti `now`:
//   sama tegund · ±30% stærð · ppm innan útlagamarka · innan 18 mán á undan `now` (og STRANGT fyrir `now`
//   þegar `strangt` er sett — bakprófið má aldrei sjá söluna sem það er að meta, né nokkra síðar).
// Byggingarárs-sían ±15 ár er AÐEINS beitt ef ≥min sambærilegar standa eftir — annars er þunnur
// grunnur verri en breiður. Mælt 19.8.2026 á 12 pn: miðgildisskekkja 8,3% → 6,7% með síunni;
// 260: 63% → 79% mata innan ±10%, 110: 70% → 86%.
export function veljaSamberilegar(sales, subj, opts) {
  const o = Object.assign({}, MAT, opts || {});
  const now = o.now == null ? Date.now() : o.now;
  const fra = now - o.dagar * 864e5;
  const fm = +subj.fm || 0;
  const lo = fm * (1 - o.staerd), hi = fm * (1 + o.staerd);
  let comps = (Array.isArray(sales) ? sales : []).filter((s) => {
    if (!s || s === o.sleppa || s.teg !== subj.teg) return false;
    if (!(s.fm >= lo && s.fm <= hi)) return false;
    if (!(s.ppm >= OUTLO && s.ppm <= OUTHI)) return false;
    const t = tsOf(s.d);
    if (!(t >= fra)) return false;
    return o.strangt ? t < now : true;
  });
  let arSia = false;
  const ar = +subj.ar || 0;
  if (ar && o.arBil > 0) {
    const med = comps.filter((s) => s.ar && Math.abs(s.ar - ar) <= o.arBil);
    if (med.length >= o.min) { comps = med; arSia = true; }
  }
  return { comps, arSia };
}

// Mat: miðgildi + fjórðungsbil ppm sambærilegra. null ef færri en min — þá á kallandi að falla á breiðari grunn.
export function metaUrSolusogu(sales, subj, opts) {
  const o = Object.assign({}, MAT, opts || {});
  const { comps, arSia } = veljaSamberilegar(sales, subj, o);
  if (comps.length < o.min) return null;
  const v = comps.map((s) => s.ppm);
  return { m: midgildi(v), lo: hundradsmark(v, 0.25), hi: hundradsmark(v, 0.75), n: comps.length, arSia, comps };
}

// Bakpróf: hver sala síðustu `manudir` mánaða metin með SÖMU aðferð út frá sölum Á UNDAN henni.
// Skekkja = |mat/raunverð − 1| á ppm. Skilar null ef færri en `minN` sölur voru metanlegar —
// nákvæmnis-tala úr 8 sölum er ekki tala sem má birta.
export function bakprof(sales, opts) {
  const o = Object.assign({ manudir: 6, minN: 20 }, MAT, opts || {});
  const now = o.now == null ? Date.now() : o.now;
  const fra = now - o.manudir * 30.4 * 864e5;
  const list = Array.isArray(sales) ? sales : [];
  const errs = [];
  let profad = 0;
  for (const t of list) {
    if (!t || !(t.fm > 15) || !(t.ppm > 0)) continue;
    const td = tsOf(t.d);
    if (!(td >= fra && td <= now)) continue;
    profad++;
    const r = metaUrSolusogu(list, { teg: t.teg, fm: t.fm, ar: t.ar }, Object.assign({}, o, { now: td, strangt: true, sleppa: t }));
    if (!r) continue;
    errs.push(Math.abs(r.m / t.ppm - 1));
  }
  if (errs.length < o.minN) return null;
  return {
    n: errs.length, profad,
    midgildi: midgildi(errs), p75: hundradsmark(errs, 0.75),
    innan10: errs.filter((e) => e <= 0.10).length / errs.length,
    innan20: errs.filter((e) => e <= 0.20).length / errs.length,
  };
}
