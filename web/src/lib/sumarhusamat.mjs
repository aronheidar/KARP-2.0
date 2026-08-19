// sumarhusamat.mjs — matsvél sumarhúsa (hrein föll, engin DOM-snerting). Systir fasteignamat.mjs en ÖNNUR dýr:
// sumarhús eru misleit (útsýni, gæði, lóð) og verð á m² fellur EKKI með stærð (teygni −0,04 innan svæðis-árs,
// mælt 19.8.2026 á 2.044 sölum úr gagnasafni HMS fyrir sumarhúsamat 2027 — R² innan svæðis-árs aðeins 2,7%).
// Þess vegna: svæðis-miðgildi m²-verðs, TÍMALEIÐRÉTT með árs-vísitölu úr gagnasafninu sjálfu, með smá
// leiðréttingu fyrir hitaveitu (+7,3%) og eignarlóð (+9,6%) þegar notandi gefur þær upp — og BREITT bil.
//
// Bakpróf (STRANGT out-of-sample — vísitala OG sambærilegar aðeins úr sölum á undan hverri sölu; 24 mán til
// 2026-03, n=671): miðgildisskekkja 19,3%, 52% innan ±20%, 68% innan ±30%. Til samanburðar hittir OPINBERT
// fasteignamat HMS sömu sölur með 18,1% miðgildisskekkju (53% innan ±20%, n=614) — svæðis-aðferðin er jafngóð
// opinbera matinu; hvorugt nær lengra án gæða-/útsýnis-gagna. Bil í skýrslu = fjórðungsbil, EKKI ±5%.
//
// Gögn: web/public/gogn/hms/sumarhus_2027.json (build_hms_2027.py) —
//   svaedi: { nr: { heiti, studull, br, m2 } } (142 matssvæði sumarhúsa; Xxxx-rót = landshluti, t.d. 8000 Suðurland)
//   solur:  [{ d:'YYYY-MM-DD', hv (svæði), kv (þ.kr), m2, ar, lod (m²), eign 0/1, vatn 0/1, hiti 0/1, raf 0/1, ppm (kr/m²) }]

export const SUM = {
  ar: 5,            // sölu-gluggi: 5 ár aftur í tímann (tímaleiðrétt) — þunnur grunnur er verri en gamall
  min: 5,           // lágmark sambærilegra áður en fallið er á landshluta → land
  hiti: 0.073,      // log-áhrif hitaveitu innan svæðis-árs (mælt)
  eign: 0.096,      // log-áhrif eignarlóðar (vs leigulóð) innan svæðis-árs (mælt)
  OUTLO: 50000, OUTHI: 3000000,   // útlagamörk kr/m²
  m2lo: 15, m2hi: 400,
  visitalaMin: 20,  // ár þarf ≥20 sölur til að fá eigin vísitölu-gildi
};

export const midgildi = (a) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const hundradsmark = (a, q) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
export const tsOf = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
export const arOf = (d) => +String(d).slice(0, 4);
export const landshluti = (hv) => { const n = +hv || 0; return n < 1000 ? 999 : Math.floor(n / 1000) * 1000; };

// Nothæfar sölur: ppm innan útlagamarka, stærð innan skynsamlegra marka.
export const nothaef = (s) => !!s && s.ppm >= SUM.OUTLO && s.ppm <= SUM.OUTHI && s.m2 >= SUM.m2lo && s.m2 <= SUM.m2hi && !!s.d;

// Árs-vísitala: miðgildi m²-verðs allra nothæfra sala per ár (landið allt). Ár með færri en visitalaMin sölur
// fá gildi næsta árs á undan (og fyrsta árið gildi næsta árs á eftir) — aldrei null fyrir ár sem sölur eru í.
export function arsVisitala(solur, opts) {
  const o = Object.assign({}, SUM, opts || {});
  const byAr = {};
  for (const s of (Array.isArray(solur) ? solur : [])) { if (!nothaef(s)) continue; (byAr[arOf(s.d)] ??= []).push(s.ppm); }
  const ar = Object.keys(byAr).map(Number).sort((a, b) => a - b);
  const idx = {};
  let prev = null;
  for (const y of ar) { if (byAr[y].length >= o.visitalaMin) { idx[y] = midgildi(byAr[y]); prev = idx[y]; } else if (prev != null) idx[y] = prev; }
  let next = null;
  for (let i = ar.length - 1; i >= 0; i--) { const y = ar[i]; if (idx[y] != null) next = idx[y]; else if (next != null) idx[y] = next; }
  return idx;
}

// Ár sem tímaleiðrétt er TIL: nýjasta árið með fulla vísitölu (≥visitalaMin sölur) — ekki hálft yfirstandandi ár.
export function visitalaAr(solur, idx, opts) {
  const o = Object.assign({}, SUM, opts || {});
  const byAr = {};
  for (const s of (Array.isArray(solur) ? solur : [])) { if (nothaef(s)) byAr[arOf(s.d)] = (byAr[arOf(s.d)] || 0) + 1; }
  const full = Object.keys(byAr).map(Number).filter((y) => byAr[y] >= o.visitalaMin && idx[y] != null).sort((a, b) => b - a);
  return full.length ? full[0] : null;
}

// m²-verð sölu fært til verðlags `tilAr` með vísitölunni, og leiðrétt fyrir hita/eignarlóð ef eignin gefur þá upp
// (subj.hiti / subj.eign: true/false = gefið upp, null/undefined = óþekkt → engin leiðrétting).
export function leidrettPpm(s, subj, idx, tilAr, o) {
  const base = idx[arOf(s.d)], til = idx[tilAr];
  let v = (base > 0 && til > 0) ? s.ppm * til / base : s.ppm;
  if (subj && (subj.hiti === true || subj.hiti === false)) { const sh = !!s.hiti; if (sh !== subj.hiti) v *= Math.exp(subj.hiti ? o.hiti : -o.hiti); }
  if (subj && (subj.eign === true || subj.eign === false)) { const se = !!s.eign; if (se !== subj.eign) v *= Math.exp(subj.eign ? o.eign : -o.eign); }
  return v;
}

// Velja sambærilegar: sama matssvæði → (ef <min) landshluti → (ef <min) landið allt; innan `ar` ára á undan `now`.
// strangt: aðeins sölur FYRIR now og aldrei o.sleppa (bakpróf).
export function veljaSumarhus(solur, subj, opts) {
  const o = Object.assign({}, SUM, opts || {});
  const now = o.now == null ? Date.now() : o.now;
  const fra = now - o.ar * 365.25 * 864e5;
  const hv = +subj.hv || 0, lh = landshluti(hv);
  const pool = (Array.isArray(solur) ? solur : []).filter((s) => {
    if (!nothaef(s) || s === o.sleppa) return false;
    const t = tsOf(s.d);
    if (!(t >= fra)) return false;
    return o.strangt ? t < now : t <= now;
  });
  let comps = pool.filter((s) => +s.hv === hv), stig = 'svaedi';
  if (comps.length < o.min) { comps = pool.filter((s) => landshluti(s.hv) === lh); stig = 'landshluti'; }
  if (comps.length < o.min) { comps = pool; stig = 'land'; }
  return { comps, stig, lh };
}

// Mat: miðgildi + fjórðungsbil tímaleiðrétts m²-verðs sambærilegra. null ef færri en min standa eftir.
// Skilar líka comps með `adj` (leiðrétt ppm) nýjustu fyrst svo skýrsla geti sýnt grunninn.
export function metaSumarhus(solur, subj, opts) {
  const o = Object.assign({}, SUM, opts || {});
  const idx = o.idx || arsVisitala(solur, o);
  const tilAr = o.tilAr || visitalaAr(solur, idx, o);
  if (tilAr == null) return null;
  const { comps, stig, lh } = veljaSumarhus(solur, subj, o);
  if (comps.length < o.min) return null;
  const adj = comps.map((s) => Object.assign({}, s, { adj: leidrettPpm(s, subj, idx, tilAr, o) })).sort((a, b) => (a.d < b.d ? 1 : -1));
  const v = adj.map((s) => s.adj);
  const m2 = +subj.m2 || 0;
  const m = midgildi(v), lo = hundradsmark(v, 0.25), hi = hundradsmark(v, 0.75);
  return {
    m, lo, hi, n: adj.length, stig, lh, tilAr,
    verd: m2 > 0 ? m * m2 : null, verdLo: m2 > 0 ? lo * m2 : null, verdHi: m2 > 0 ? hi * m2 : null,
    leidr: { hiti: subj.hiti === true || subj.hiti === false, eign: subj.eign === true || subj.eign === false },
    comps: adj,
  };
}

// Bakpróf: hver sala síðustu `manudir` mánaða metin með SÖMU aðferð út frá sölum Á UNDAN henni (strangt).
export function bakprofSumarhus(solur, opts) {
  const o = Object.assign({ manudir: 24, minN: 30 }, SUM, opts || {});
  const list = (Array.isArray(solur) ? solur : []).filter(nothaef).sort((a, b) => tsOf(a.d) - tsOf(b.d));
  const now = o.now == null ? Date.now() : o.now;
  const fra = now - o.manudir * 30.4 * 864e5;
  const errs = [];
  let profad = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const td = tsOf(t.d);
    if (!(td >= fra && td <= now)) continue;
    profad++;
    // Vísitalan úr sölum Á UNDAN þessari einni (ekkert kíkt fram í árið); tímaleiðrétt TIL árs sölunnar ef
    // einhver fyrri sala er í því ári (hlut-ár fær gildi fyrra árs), annars til nýjasta árs sem var „vitað".
    const prior = list.slice(0, i).filter((s) => tsOf(s.d) < td);
    const idx = arsVisitala(prior, o);
    const arT = arOf(t.d);
    const tilAr = idx[arT] != null ? arT : Object.keys(idx).map(Number).sort((x, y) => y - x)[0];
    if (tilAr == null) continue;
    const r = metaSumarhus(prior, { hv: t.hv, m2: t.m2, hiti: !!t.hiti, eign: !!t.eign }, Object.assign({}, o, { idx, tilAr, now: td, strangt: true, sleppa: t }));
    if (!r) continue;
    errs.push(Math.abs(r.m / t.ppm - 1));
  }
  if (errs.length < o.minN) return null;
  return { n: errs.length, profad, midgildi: midgildi(errs), p75: hundradsmark(errs, 0.75), innan20: errs.filter((e) => e <= 0.2).length / errs.length, innan30: errs.filter((e) => e <= 0.3).length / errs.length };
}

// Yfirlit per matssvæði fyrir töflu/SEO: fjöldi sala (allt + sl. 3 ár), tímaleiðrétt miðgildi m²-verðs sl. `ar` ár,
// miðgildi kaupverðs og stærðar, ásamt HMS-stuðli/breytingu/m² úr svaedi-skránni.
export function svaedaYfirlit(solur, svaedi, opts) {
  const o = Object.assign({}, SUM, opts || {});
  const list = (Array.isArray(solur) ? solur : []).filter(nothaef);
  const idx = arsVisitala(list, o), tilAr = visitalaAr(list, idx, o);
  const now = o.now == null ? Date.now() : o.now;
  const fra = now - o.ar * 365.25 * 864e5, fra3 = now - 3 * 365.25 * 864e5;
  const by = {};
  for (const s of list) (by[+s.hv] ??= []).push(s);
  return Object.entries(svaedi || {}).filter(([, v]) => v && v.heiti).map(([nr, v]) => {
    const all = by[+nr] || [];
    const inWin = all.filter((s) => tsOf(s.d) >= fra && tsOf(s.d) <= now);
    const adj = tilAr != null ? inWin.map((s) => leidrettPpm(s, null, idx, tilAr, o)) : [];
    return {
      nr: +nr, heiti: v.heiti, lh: landshluti(+nr), rot: landshluti(+nr) === +nr,
      n: all.length, n3: all.filter((s) => tsOf(s.d) >= fra3).length, nWin: inWin.length,
      ppm: adj.length >= o.min ? midgildi(adj) : null,
      kv: inWin.length >= o.min ? midgildi(inWin.map((s) => s.kv)) : null,
      m2: inWin.length >= o.min ? midgildi(inWin.map((s) => s.m2)) : null,
      studull: v.studull ?? null, br: v.br ?? null, m2hms: v.m2 ?? null, tilAr,
    };
  });
}
