// fasteignamat.mjs — matsvél fasteignavaktarinnar (hrein föll, engin DOM-snerting).
// Dregin úr client-eyju fasteignavakt.astro 19.8.2026 svo hægt sé að PRÓFA hana og BAKPRÓFA:
// sama fall metur eign notandans OG hverja sölu fortíðar út frá sölum á undan henni, svo
// nákvæmnis-talan í skýrslunni lýsir nákvæmlega aðferðinni sem gaf matið.
//
// Sölusaga (solusaga/<pn>.json): { a, d:'YYYY-MM-DD', kv (þ.kr), fm, teg, herb, ar, ppm (kr/m²) }.
// Öll verð hér eru kr/m² — kallandi deilir með 1000 ef hann vill þ.kr/m².

export const OUTLO = 180000, OUTHI = 2600000;      // sía burt bílskúra/hlutasölur/útlaga (kr/m²)
export const MAT = { dagar: 560, staerd: 0.3, arBil: 15, min: 6, teygni: -0.31 };   // 18 mán · ±30% stærð · ±15 byggingarár · ≥6 sambærilegar · stærðarteygni
// teygni: m²-verð fellur með stærð — log(m²-verð)/log(stærð) = −0,31 (mælt 19.8.2026 á 30.697 sölum úr sölu-úrtaki HMS
// fyrir fasteignamat 2027, innan svæðis+söluárs+byggingaráratugar; fjölbýli −0,32, sérbýli −0,28). 10% stærri eign ≈ 3%
// lægra m²-verð, svo sambærileg 30% stærri en eignin er ~8% „ódýrari" á fermetrann og togaði miðgildið áður. Hver
// sambærileg er því sköluð að stærð eignarinnar: ppm × (fm_i / fm)^(−teygni). Bakpróf á 12 pn: 6,7% → 6,1%
// miðgildisskekkja, 68% → 72% innan ±10%, batnar/helst í 12 af 12. teygni: 0 slekkur.

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
  const fm = +subj.fm || 0, t = o.teygni || 0;
  const v = comps.map((s) => (t && fm > 0 && s.fm > 0) ? s.ppm * Math.pow(s.fm / fm, -t) : s.ppm);   // stærðarleiðrétt m²-verð
  return { m: midgildi(v), lo: hundradsmark(v, 0.25), hi: hundradsmark(v, 0.75), n: comps.length, arSia, staerdLeidr: !!(t && fm > 0), comps };
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

// ── FASTEIGNAMATS-LEIÐIN (19.8.2026) — annað, óháð mat úr gildandi fasteignamati × svæðis-hlutfalli ──
// Kaupskrá HMS ber NÚGILDANDI fasteignamat hverrar seldrar eignar (2026) og fyrirhugað (2027) — snapshot við
// útdrátt, ekki matið við söluna (mælt: matN/mat ≈ 1,01 í öllum sölumánuðum; kv/mat 0,98→1,056 2024-06→2026-08).
// build_fasteignaskra.js reiknar miðgildi kaupverð/mat sl. 12 mán per matssvæði, póstnúmer og land
// (web/public/gogn/hms/mat_hlutfall.json: [miðgildi, q25, q75, n] × g/n × a/f/s). Mælt á HMS-úrtaki (7.700 sölur
// 2025-03→2026-02, strangt á undan): fasteignamat × svæðis-hlutfall 5,5% miðgildisskekkja / 75% innan ±10% —
// sambærilegar sölur 6,5% / 67% á sama úrtaki; blanda bætir EKKI (5,7%). Tvö óháð möt → sýnd hlið við hlið.
export const MATHL = { min: 10, hatt: 0.10, mjog: 0.20 };   // lágmarks-n per þrep · frávik „hátt/lágt" · „mjög"
export const tegLykill = (teg) => (teg === 'Fjölbýli' ? 'f' : ['Sérbýli', 'Einbýli', 'Raðhús', 'Parhús'].includes(teg) ? 's' : null);

// Velur hlutfall eftir þrepum: svæði+tegund → svæði allt → pn+tegund → pn allt → land+tegund → land allt.
// H = mat_hlutfall.json; argerd 'g' (gildandi) | 'n' (fyrirhugað). Skilar { h:[med,q25,q75,n], stig, teg } eða null.
export function veljaMatHlutfall(H, subj, opts) {
  const o = Object.assign({}, MATHL, opts || {});
  if (!H || !subj) return null;
  const ag = subj.argerd === 'n' ? 'n' : 'g', tk = tegLykill(subj.teg);
  const pick = (bag, stig) => {
    if (!bag || !bag[ag]) return null;
    if (tk && bag[ag][tk] && bag[ag][tk][3] >= o.min) return { h: bag[ag][tk], stig, teg: true };
    if (bag[ag].a && bag[ag].a[3] >= o.min) return { h: bag[ag].a, stig, teg: false };
    return null;
  };
  return pick(subj.zone != null && H.byZone ? H.byZone[String(subj.zone)] : null, 'svaedi')
    || pick(subj.pn && H.byPn ? H.byPn[String(subj.pn)] : null, 'pn')
    || pick(H.land, 'land');
}

// Mat út frá fasteignamati: mat × miðgildi hlutfalls; bil = mat × q25..q75. mat og niðurstaða í SÖMU einingu.
export function metaUrFasteignamati(mat, h) {
  if (!(mat > 0) || !h || !(h[0] > 0)) return null;
  return { m: mat * h[0], lo: mat * h[1], hi: mat * h[2], n: h[3], hlutfall: h[0] };
}

// „Er fasteignamatið rétt?" — ber saman matið sem fasteignamatið gefur (mat × hlutfall) við mat sambærilegra (est).
// fravik = est2/est − 1: jákvætt → fasteignamatið er HÁTT miðað við markaðsverð sambærilegra (m.v. hvernig svæðið
// selst yfir/undir mati), neikvætt → lágt. est og mat í SÖMU einingu. Þröskuldar úr MATHL (±10% / ±20%) — báðar
// aðferðir hafa ~6% miðgildisskekkju, svo minni munur er hávaði.
export function matDomur(est, mat, h, opts) {
  const o = Object.assign({}, MATHL, opts || {});
  const r = metaUrFasteignamati(mat, h);
  if (!r || !(est > 0)) return null;
  const fravik = r.m / est - 1;
  const domur = fravik > o.mjog ? 'mjog_hatt' : fravik > o.hatt ? 'hatt' : fravik < -o.mjog ? 'mjog_lagt' : fravik < -o.hatt ? 'lagt' : 'i_takt';
  return { est2: r.m, lo: r.lo, hi: r.hi, hlutfall: r.hlutfall, n: r.n, fravik, domur, matVaent: est / r.hlutfall };   // matVaent = matið sem markaðsverðið gæfi
}
