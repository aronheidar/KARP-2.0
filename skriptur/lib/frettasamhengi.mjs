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
  .replace(/[.,;:„""'()]/g, ' ')
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

const HOPAR = { urslit, styrkur, vorumerki, gjaldthrot };
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
