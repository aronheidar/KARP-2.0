// frettasamhengi.mjs — bakgrunnur fréttar úr gögnum Karp. Hreinar reikniaðgerðir: engin netköll, ekkert giskað.
//
// AF HVERJU (22.9.2026): miðgildi fréttalengdar var 171 stafur af því að skynjararnir senda Claude fáar
// staðreyndir og reglan bannar allt annað. Hér er bætt við SÖNNUM staðreyndum úr gögnum sem Karp á þegar. Allt
// fer í facts.bakgrunnur og þar með BÆÐI til Claude og í talnavörnina (talnavorn.mjs).
//
// ⚠ Nafnið `samhengi` er frátekið: e.samhengi er útreiknuð LÍNA sem birtist í kassa á fréttasíðunni.
// ⚠ Dómar fá EKKI bakgrunn: domar_ai.json er aðeins hluti dóma (78 færslur 22.9), svo „dómar á árinu" væri villandi.
// ⚠ Persónuvernd: fyrirtækjasamhengi aðeins fyrir LÖGAÐILA. Gefin kt einstaklings stöðvar samhengið alveg.

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const dagarAftur = (idag, n) => new Date(Date.parse((idag || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

/** Fjarlægir tóm svið; skilar null ef ekkert stendur eftir. */
function hreinsa(o) {
  if (!o || typeof o !== 'object') return o ?? null;
  const ut = {};
  for (const [k, v] of Object.entries(o)) {
    const h = v && typeof v === 'object' && !Array.isArray(v) ? hreinsa(v) : v;
    if (h === null || h === undefined || (typeof h === 'number' && !Number.isFinite(h))) continue;
    ut[k] = h;
  }
  return Object.keys(ut).length ? ut : null;
}

export const stadlaNafn = (n) => String(n || '').toLowerCase()
  .replace(/[.,;:„“"'()]/g, ' ')
  .replace(/(^|\s)(ehf|hf|ohf|slf|sf|bs|ses|svf)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();
// Sama stöðlun og build_urslit.js notar á byWinner-lykla, með sérkennum sínum, svo samsvörun útboða sé sú sama.
const normUtbod = (s) => String(s).toLowerCase().replace(/\b(ehf|hf|ohf|slf|sf)\.?\b/g, '').replace(/[^a-za-ö0-9]+/gi, ' ').trim();
export const erLogadili = (kt) => /^[4-7]\d{9}$/.test(String(kt || ''));

export function nafnaskra(felagaskra) {
  const m = new Map();
  for (const f of ((felagaskra && felagaskra.felog) || [])) {
    const k = stadlaNafn(f.nafn);
    if (!k) continue;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(String(f.kt));
  }
  return m;
}
export function ktFraNafni(nafn, skra) {
  const s = skra && skra.get(stadlaNafn(nafn));
  return s && s.size === 1 ? [...s][0] : null;
}

function arsreikningurSamantekt(ars) {
  const ar = ars && ars.ar;
  if (!ar) return null;
  const y = Object.keys(ar).filter((k) => ar[k] && ar[k].rekstur).sort().pop();
  if (!y) return null;
  const kv = Number(ar[y].kvardi) || 1, rek = ar[y].rekstur;
  return hreinsa({
    ar: Number(y),
    sala_kr: typeof rek.sala === 'number' ? rek.sala * kv : null,
    hagnadur_kr: typeof rek.hagnadur === 'number' ? rek.hagnadur * kv : null,
  });
}

/** Samhengi um lögaðila, eða null ef hann finnst ekki ótvírætt. */
export function fyrirtaeki(nafn, gogn, { kt = null, utanUtbods = null, utanStyrks = null } = {}) {
  if (!nafn) return null;
  let k;
  if (kt != null && String(kt) !== '') {
    if (!erLogadili(kt)) return null;   // kt einstaklings: ekki falla á nafnaleit
    k = String(kt);
  } else {
    const skra = gogn._nafnaskra || (gogn._nafnaskra = nafnaskra(gogn.felagaskra));
    k = ktFraNafni(nafn, skra);
  }
  if (!k) return null;
  const s = stadlaNafn(nafn), u = normUtbod(nafn);
  const aw = ((gogn.utbod_urslit && gogn.utbod_urslit.awards) || [])
    .filter((a) => a.nr !== utanUtbods && (a.winners || []).some((w) => normUtbod(w) === u));
  const utbod = aw.length ? {
    fjoldi: aw.length,
    samtals_kr: Math.round(aw.reduce((t, a) => t + (a.cur === 'ISK' && a.value ? a.value / a.winners.length : 0), 0)) || null,
    sidast: aw.map((a) => a.d).filter(Boolean).sort().pop() || null,
  } : null;
  const b = gogn.birgjar;
  const v = b && (b.vendors || []).find((x) => stadlaNafn(x.n) === s);
  const rikis = v ? { samtals_kr: v.t, fra: b.fra || null, til: b.til ? String(b.til).slice(0, 7) : null } : null;
  const st = ((gogn.styrkir && gogn.styrkir.styrkir) || [])
    .filter((x) => ((x.kt && x.kt === k) || stadlaNafn(x.nafn) === s) && !(utanStyrks && utanStyrks(x)));
  const styrkir = st.length ? { fjoldi: st.length, samtals_kr: st.reduce((t, x) => t + (x.upphaed || 0), 0) } : null;
  const ars = typeof gogn.arsreikningur === 'function' ? arsreikningurSamantekt(gogn.arsreikningur(k)) : null;
  return hreinsa({ utbod_unnin: utbod, rikisgreidslur_12man: rikis, styrkir_fyrri: styrkir, arsreikningur: ars });
}

function urslit(e, gogn, o) {
  const f = e.facts || {};
  if (Array.isArray(f.sigurvegarar) && f.sigurvegarar.length) {
    const mork = dagarAftur(o.idag, 365);
    const kaupandi = f.kaupandi ? ((gogn.utbod_urslit && gogn.utbod_urslit.awards) || [])
      .filter((a) => a.buyer === f.kaupandi && a.nr !== f.tedNr && a.d && a.d >= mork).length : 0;
    return hreinsa({ sigurvegari: fyrirtaeki(f.sigurvegarar[0], gogn, { utanUtbods: f.tedNr }), kaupandi_onnur_utbod_12man: kaupandi || null });
  }
  if (f.laegst) return hreinsa({ laegstbjodandi: fyrirtaeki(f.laegst, gogn) });   // tilboðsopnun Landsvirkjunar
  return null;
}
function styrkur(e, gogn) {
  const f = e.facts || {};
  const sama = (x) => stadlaNafn(x.nafn) === stadlaNafn(f.thegi) && x.ar === f.ar && x.upphaed === f.upphaed;
  return hreinsa({ thegi: fyrirtaeki(f.thegi, gogn, { utanStyrks: sama }) });
}
function vorumerki(e, gogn) {
  return hreinsa({ eigandi: fyrirtaeki((e.facts || {}).eigandi, gogn, { kt: e.kt ?? null }) });
}
function gjaldthrot(e, gogn) {
  return hreinsa({ felagid: fyrirtaeki((e.facts || {}).felag, gogn, { kt: e.kt ?? null }) });
}

// ── Markaðir ──────────────────────────────────────────────────────────────────
// ⚠ Verðsagan (hist) nær 40 viðskiptadaga aftur. „52 vikna bil" er því EKKI til og kemur ekki fram.
function mark(e, gogn) {
  const f = e.facts || {}, m = gogn.markadir;
  const s = m && (m.stocks || []).find((x) => x.name === f.felag);
  if (!s) return null;
  const h = (s.hist || []).filter((x) => typeof x === 'number' && x > 0);
  if (h.length < 5) return null;
  // Gengi dagsins er síðasta gildi hist (22.9); annars er því bætt við.
  const rod = Math.abs(h[h.length - 1] - s.price) < 1e-9 ? h : h.concat([s.price]);
  let staersta = 0;
  for (let i = 1; i < rod.length - 1; i++) staersta = Math.max(staersta, Math.abs(rod[i] / rod[i - 1] - 1) * 100);   // án dagsins
  const idx = (m.indices || []).find((x) => /OMXI15/.test(x.sym || ''));
  return hreinsa({
    vidskiptadagar_i_rod: rod.length,
    haesta_i_rod: Math.max(...rod),
    laegsta_i_rod: Math.min(...rod),
    breyting_fra_upphafi_rodar_pct: r1((rod[rod.length - 1] / rod[0] - 1) * 100),
    staersta_fyrri_dagshreyfing_pct: r1(staersta),
    hreyfing_dagsins_su_staersta: typeof f.breyting === 'number' ? Math.abs(f.breyting) > r1(staersta) : null,
    urvalsvisitala_breyting_pct: idx && typeof idx.chgPct === 'number' ? r1(idx.chgPct) : null,
  });
}

// ── Hagtölur ──────────────────────────────────────────────────────────────────
const radVnv = (sb) => ((((sb || {}).datasets || {}).verdbolga || {}).series || [])
  .find((s) => s.name === 'Vísitala neysluverðs' && (s.points || []).some((p) => typeof p[1] === 'number' && p[1] < 50));
const radMegin = (sb) => ((((sb || {}).datasets || {}).vextir_si || {}).series || []).find((s) => /megin/i.test(s.name));

function verdbolgaBg(sb, upp) {
  const r = radVnv(sb);
  if (!r) return null;
  const p = r.points.filter((x) => typeof x[1] === 'number' && x[1] < 50 && (!upp || x[0] <= upp));
  if (!p.length) return null;
  const [d, v] = p[p.length - 1];
  const fyrraAr = (Number(d.slice(0, 4)) - 1) + d.slice(4, 7);
  const f12 = p.find((x) => x[0].slice(0, 7) === fyrraAr);
  const s12 = p.slice(-12).map((x) => x[1]);
  return { verdbolga: v, maeling: d.slice(0, 7), verdbolga_12man_fyrr: f12 ? f12[1] : null, haesta_12man: Math.max(...s12), laegsta_12man: Math.min(...s12), verdbolgumarkmid: 2.5, fravik_fra_markmidi: r1(v - 2.5) };
}
function vextirBg(sb, upp) {
  const r = radMegin(sb);
  if (!r) return null;
  const p = r.points.filter((x) => typeof x[1] === 'number' && (!upp || x[0] <= upp));
  if (p.length < 2) return null;
  let i = p.length - 1;
  while (i > 0 && p[i][1] === p[i - 1][1]) i--;
  let j = i - 1;
  while (j > 0 && p[j][1] === p[j - 1][1]) j--;
  return {
    meginvextir: p[p.length - 1][1],
    sidasta_breyting: i > 0 ? { dags: p[i][0], fra: p[i - 1][1], i: p[i][1] } : null,
    breytingin_a_undan: i > 0 && j > 0 ? { dags: p[j][0], fra: p[j - 1][1], i: p[j][1] } : null,
  };
}
function atvinnuleysiBg(at) {
  const m = (at && at.monthly) || [];
  if (!m.length) return null;
  const nu = m[m.length - 1];
  const [y, mm] = String(nu.t).split('M');
  const f = m.find((x) => x.t === (Number(y) - 1) + 'M' + mm);
  return { atvinnuleysi: nu.v, manudur: y + '-' + mm, atvinnuleysi_12man_fyrr: f ? f.v : null };
}
function hagtolur(e, gogn) {
  const f = e.facts || {};
  if (e.type === 'verdbolga') return hreinsa(verdbolgaBg(gogn.sedlabanki, f.dags));
  if (e.type === 'vextir') {
    const v = vextirBg(gogn.sedlabanki, f.dags), b = verdbolgaBg(gogn.sedlabanki, f.dags);
    return hreinsa({ ...(v || {}), verdbolga: b ? b.verdbolga : null, raunstyrivextir: v && b ? r2(v.meginvextir - b.verdbolga) : null });
  }
  if (e.type === 'vika') {
    const b = verdbolgaBg(gogn.sedlabanki), v = vextirBg(gogn.sedlabanki), a = atvinnuleysiBg(gogn.atvinnuleysi);
    return hreinsa({
      verdbolga_12man_fyrr: b ? b.verdbolga_12man_fyrr : null, verdbolgumarkmid: b ? 2.5 : null,
      sidasta_vaxtabreyting: v ? v.sidasta_breyting : null,
      atvinnuleysi_12man_fyrr: a ? a.atvinnuleysi_12man_fyrr : null,
      raunstyrivextir: b && v ? r2(v.meginvextir - b.verdbolga) : null,
    });
  }
  return null;
}

// ── Lyf ───────────────────────────────────────────────────────────────────────
// ATC-kóði á 5. stigi = virka efnið, svo sami kóði = sama virka efni (aðrir styrkleikar, form og framleiðendur).
function lyf(e, gogn, o) {
  const L = gogn.lyf;
  if (!L || !Array.isArray(L.lyf)) return null;
  const slug = String(e.id || '').replace(/^lyfskortur-/, '');
  const x = L.lyf.find((y) => y.slug === slug) || L.lyf.find((y) => y.name === (e.facts || {}).lyf);
  if (!x) return null;
  const kodi = x.atc && x.atc.code;
  const onnur = kodi ? L.lyf.filter((y) => y.slug !== x.slug && y.atc && y.atc.code === kodi) : [];
  const fyrst = o.state && o.state.lyfFyrst && o.state.lyfFyrst[x.slug];
  return hreinsa({
    atc_kodi: kodi || null,
    onnur_lyf_sama_efni: kodi ? onnur.length : null,
    thar_af_i_skorti: kodi ? onnur.filter((y) => y.shortage).length : null,
    lyf_i_skorti_alls: typeof L.shortageCount === 'number' ? L.shortageCount : null,
    skortur_skradur_fra: /^\d{4}-\d{2}-\d{2}$/.test(String(fyrst || '')) ? fyrst : null,
  });
}

const HOPAR = { urslit, styrkur, vorumerki, gjaldthrot, mark, verdbolga: hagtolur, vextir: hagtolur, vika: hagtolur, lyf };
export const STUDDAR_TEGUNDIR = Object.keys(HOPAR);

/** Bætir facts.bakgrunnur á studdar tegundir. Skilar fjölda atburða sem fengu bakgrunn. */
export function baetaVidBakgrunni(events, gogn, o = {}) {
  let n = 0;
  for (const e of (events || [])) {
    const fn = e && e.facts && HOPAR[e.type];
    if (!fn) continue;
    try {
      const b = fn(e, gogn || {}, o);
      if (b) { e.facts.bakgrunnur = b; n++; }
    } catch (err) { (o.skra || console.log)('• bakgrunnur brást fyrir ' + e.id + ': ' + String(err).slice(0, 100)); }
  }
  return n;
}

export { r1, r2, hreinsa, dagarAftur };
