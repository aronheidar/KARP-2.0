// Fjárhagsstærðfræði fyrirtækjaprófílsins — hrein föll, engin DOM-snerting.
// Áður inni í client-eyju fyrirtaeki.astro (~1450 línur) þar sem þau voru óprófanleg;
// hér eru sömu útreikningar prófaðir í web/test/fyrirtaeki-kpi.test.mjs.
// Allar fjárhæðir eru í milljónum myntar (m.kr nema annað sé tekið fram).

export const fsThou = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const fsMkr = (v, c) => (v == null ? '–' : (v < 0 ? '−' : '') + fsThou(v) + ' ' + (c || 'm.kr'));
export const fsPct1 = (v) => (v == null ? '–' : (v < 0 ? '−' : '') + (Math.abs(v) * 100).toFixed(1).replace('.', ',') + '%');
export const fsRat = (v) => (v == null ? '–' : v.toFixed(2).replace('.', ','));

// Kennitölur úr einu rekstrarári (y) með fyrra ár (p) fyrir vöxt. Nefnari 0/vantar → null (ekki 0 eða Infinity).
export function fsKpiCalc(y, p) {
  p = p || {};
  const framlegd = y.tekjur - (y.kostnadarverd || 0);
  const ebitda = framlegd - (y.rekstrargjold || 0);
  const ebit = ebitda - (y.afskriftir || 0);
  const d = (a, b) => (b ? a / b : null);
  return {
    framlegd: d(framlegd, y.tekjur), rekstrarhlutf: d(ebit, y.tekjur), hagnhlutf: d(y.hagnadur, y.tekjur),
    roe: d(y.hagnadur, y.eigidfe), roa: d(y.hagnadur, y.eignir),
    veltufjar: d(y.veltufjarmunir, y.skammtimaskuldir), lausafjar: d(y.veltufjarmunir - (y.birgdir || 0), y.skammtimaskuldir),
    eiginfjarhlutf: d(y.eigidfe, y.eignir), de: d(y.skuldir, y.eigidfe), vaxtathekja: d(ebit, Math.abs(y.fjarmagn || 0)),
    eignavelta: d(y.tekjur, y.eignir),
    tekjuvoxtur: p.tekjur ? y.tekjur / p.tekjur - 1 : null, hagnvoxtur: p.hagnadur ? y.hagnadur / p.hagnadur - 1 : null,
    _ebitda: ebitda, _ebit: ebit,
  };
}

// Raun-KPI (LOTA 99R): kortleggur scrapaðan ársreikning (RSK-PDF → JSON) á fjarhagur-snið (m.kr).
export function fsMapArs(j) {
  if (!j || !j.ar) return null;
  const years = Object.keys(j.ar).sort().reverse();   // nýjast fyrst
  if (!years.length) return null;
  const rows = years.map((yr) => {
    const a = j.ar[yr], kv = (a.kvardi || 1) / 1e6, r = a.rekstur, e = a.efnahagur;   // kv → milljónir myntar
    const row = { ar: yr, _cur: (!a.mynt || a.mynt === 'ISK') ? 'm.kr' : ('m. ' + a.mynt), starfsmenn: (a.starfsmenn != null ? a.starfsmenn : null) };
    // FORREIKNUÐ KPI úr þáttaranum (myntóháð hlutföll, réttar þrátt fyrir formerki/IFRS) — sitt hvor lyklanöfn
    if (a.kpi) row._kpi = { framlegd: a.kpi.framlegd, rekstrarhlutf: a.kpi.ebit_hlutfall, hagnhlutf: a.kpi.hagnadarhlutfall,
      roe: a.kpi.ROE, roa: a.kpi.ROA, eiginfjarhlutf: a.kpi.eiginfjarhlutfall, veltufjar: a.kpi.veltufjarhlutfall,
      de: a.kpi.skuldahlutfall_DE, eignavelta: a.kpi.eignavelta, vaxtathekja: null, lausafjar: null, tekjuvoxtur: null, hagnvoxtur: null, _ebitda: null };
    if (r) { row.tekjur = ((r.sala || 0) + (r.adrar_tekjur || 0)) * kv; row.hagnadur = (r.hagnadur || 0) * kv;
      row.kostnadarverd = Math.abs(r.kostnadarverd || 0) * kv; row.rekstrargjold = Math.abs((r.annar_rekstur || 0) + (r.laun || 0)) * kv;
      row.afskriftir = Math.abs(r.afskriftir || 0) * kv; row.fjarmagn = Math.abs(r.fjarmagnsgjold || 0) * kv; row.matsbreyting = (r.matsbreyting || 0) * kv; }
    if (e) { row.eignir = (e.eignir || 0) * kv; row.eigidfe = (e.eigid_fe || 0) * kv; row.skuldir = (e.skuldir || 0) * kv;
      row.veltufjarmunir = ((e.birgdir || 0) + (e.vidskiptakrofur || 0) + (e.handbaert || 0)) * kv;
      row.birgdir = (e.birgdir || 0) * kv; row.vidskiptakrofur = (e.vidskiptakrofur || 0) * kv; row.handbaert = (e.handbaert || 0) * kv;
      row.skammtimaskuldir = (e.skammtimaskuldir || 0) * kv; }
    return row;
  });
  // Vöxtur (tekju-/hagnaðar-) reiknast úr fjölærs-gögnunum — þáttarinn skilar honum ekki (per-ár KPI úr einu PDF).
  rows.forEach((row, i) => {
    const p = rows[i + 1];   // fyrra ár (raðað nýjast-fyrst)
    if (row._kpi && p) {
      // aðeins marktækt frá JÁKVÆÐUM grunni (banka-rekstrarreikn. þáttast stundum í rusl/neikvæðar tekjur)
      if (p.tekjur > 0 && row.tekjur > 0) row._kpi.tekjuvoxtur = row.tekjur / p.tekjur - 1;
      if (p.hagnadur > 0) row._kpi.hagnvoxtur = row.hagnadur / p.hagnadur - 1;
    }
  });
  return rows;
}

export const FS_LH_SKALI = 'Einkunnaskali 0–100: A 80–100 mjög sterk · B 65–79 sterk · C 50–64 í meðallagi · D 35–49 veik · E 0–34 mjög veik. Grunnurinn er fjárhagsheilsa úr ársreikningi (arðsemi, skuldsetning, lausafé, vöxtur); áhættuþættir hnika henni upp eða niður.';
export function fsLhGrade(s) { return s == null ? '–' : s >= 80 ? 'A' : s >= 65 ? 'B' : s >= 50 ? 'C' : s >= 35 ? 'D' : 'E'; }

// Fjárhagsheilsa 0–100 úr fjórum stoðum (arðsemi 30% · skuldsetning 30% · lausafé 20% · vöxtur 20%).
// Stoð sem vantar gögn dettur út og vogirnar normaliserast — félag með aðeins efnahagsreikning fær samt einkunn.
export function fsHealthScore(k) {
  const nz = (v, lo, hi) => (v == null ? null : Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)));
  const avg = (arr) => { const f = arr.filter((x) => x != null); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; };
  const ard = avg([nz(k.hagnhlutf, -0.02, 0.12), nz(k.roe, 0, 0.2)]);
  // D/E sem vantar er ÞÖGN, ekki „3“: gamla varaleiðin bjó til stoð úr engu (félag án ársreiknings fékk 0/E í stað „–“)
  // og refsaði félagi sem aðeins vantaði skuldatöluna. Neikvætt D/E = neikvætt eigið fé = versta staða, ekki besta.
  const deStig = k.de == null ? null : k.de < 0 ? 0 : nz(3 - Math.min(k.de, 4), 0, 2.5);
  const skuld = avg([nz(k.eiginfjarhlutf, 0.1, 0.55), deStig]);
  const laus = nz(k.veltufjar, 0.7, 1.8);
  const voxt = nz(k.tekjuvoxtur, -0.05, 0.15);
  // Efnahagsreikningur er FORSENDA einkunnar. Náist hann ekki úr PDF-inu er allt sem við höfum
  // framlegð og vöxtur — það er afkomumæling, ekki fjárhagsheilsa, og má ekki birtast sem A.
  if (skuld == null && laus == null) return { score: null, grade: '–', color: '#6b7688', pillars: { ard, skuld, laus, voxt } };
  let t = 0, w = 0;
  [[ard, 0.3], [skuld, 0.3], [laus, 0.2], [voxt, 0.2]].forEach((p) => { if (p[0] != null) { t += p[0] * p[1]; w += p[1]; } });
  const score = w ? Math.round(t / w) : null;
  const grade = fsLhGrade(score);
  const color = score == null ? '#6b7688' : score >= 65 ? '#42d086' : score >= 50 ? '#e8b84b' : '#ef6a6a';
  return { score, grade, color, pillars: { ard, skuld, laus, voxt } };
}
