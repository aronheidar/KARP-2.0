// Lánshæfis-vélin: hvernig fjárhagsgrunnur + áhættuþættir verða að einni einkunn 0–100 / A–E.
// Áður inni í client-eyju fyrirtaeki.astro og óprófuð; hér prófuð í web/test/fyrirtaeki-lanshaefi.test.mjs.
// Fjárhagsgrunnurinn sjálfur (fsHealthScore) er í [fyrirtaeki-kpi.mjs] — þetta lag vegur hann með
// opinberum áhættumerkjum. Vogtölurnar sjálfar (±4 aldur, −5 skil, o.s.frv.) eru settar í fsLhReset/
// fsWireLanshaefi í eyjunni; hér er reikniverkið sem sameinar þær.
import { fsLhGrade } from './fyrirtaeki-kpi.mjs';

// Birtingarröð þáttanna í kortinu.
export const FS_LH_ORDER = ['fjarhagur', 'aldur', 'skil', 'stada', 'vanskil', 'logbirting', 'sector', 'flakk', 'sanction'];

// lh = { base: 0–100 | null, factors: { key: { delta?, cap?, base?, status?, ... } } }
export function lhScore(lh) {
  if (!lh) return null;
  let s = lh.base, cap = 100, medThak = false;
  for (const k in lh.factors) {
    const f = lh.factors[k];
    if (f.cap != null) { cap = Math.min(cap, f.cap); medThak = true; }
    if (s != null) s += (f.delta || 0);
  }
  // Þak ÁN fjárhagsgrunns: gjaldþrot eða refsilisti er staðreynd sem stendur ein og sér — þá er matið
  // þakið sjálft (E), ekki „óþekkt". Áður skilaði fallið null hér, svo gjaldþrota félag án lesanlegs
  // ársreiknings fékk ENGA einkunn þótt þakið væri sett beinlínis til að þvinga E.
  if (s == null) return medThak ? cap : null;
  return Math.max(0, Math.min(cap, Math.round(s)));   // þakið tryggir lágan flokk óháð sterkum fjárhag
}

export function lhColor(s) { return s == null ? '#6b7688' : s >= 65 ? '#42d086' : s >= 50 ? '#e8b84b' : '#ef6a6a'; }
export function lhBand(s) { return s == null ? 'Ófullnægjandi fjárhagsgögn' : s >= 65 ? 'Sterk staða' : s >= 50 ? 'Í meðallagi' : 'Veik staða'; }

// Áhrifa-merking þáttar í listanum: grunnur · þak (→ E) · ±stig · stöðutákn.
export function lhEffect(fc) {
  if (fc.base) return 'grunnur';
  if (fc.cap != null) return '→ ' + fsLhGrade(fc.cap);
  const d = fc.delta;
  if (d > 0) return '+' + d;
  if (d < 0) return '−' + Math.abs(d);
  return fc.status === 'g' ? '✓' : fc.status === 'n' ? '·' : '⚑';
}

// Aldur félags í árum úr skráningardegi (dd.mm.yyyy) — null ef óþekkt. `nu` er sprautað fyrir prófanir.
export function lhAldur(skrad, nu) {
  const m = String(skrad || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? Math.floor(((nu == null ? Date.now() : nu) - new Date(+m[3], +m[2] - 1, +m[1]).getTime()) / (365.25 * 864e5)) : null;
}

// Sein ársreikningaskil? (sami 31.8-frestur og fsSkilaSaga) — null ef engin skil skráð.
export function lhSkilLate(f) {
  const ars = ((f && f.arsreikningar) || []).filter((a) => a.ar && a.skil).slice(0, 6);
  if (!ars.length) return null;
  const pd = (s) => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  return ars.some((a) => { const yr = parseInt(a.ar, 10), d = pd(a.skil); return d && d >= new Date(yr + 1, 8, 1); });
}
