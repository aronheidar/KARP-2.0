// skriptur/lib/gjaldthrot.mjs — gjaldþrot og nýskráningar fyrirtækja (Hagstofa FYR03001 + FYR03010).
//
// Hrein föll: ALLIR útreikningar síðunnar /gjaldthrot/ og forsíðureitsins gerast hér og eru prófaðir
// (gjaldthrot.test.mjs). Síðan birtir aðeins tölurnar sem build_gjaldthrot.mjs skrifar.
//
// ⚠ Skráð gjaldþrot eru að mestu félög sem voru hætt starfsemi (um tvö af hverjum þremur 2026) og
//   hoppa þegar mörg eru gerð upp í einu. Gjaldþrot félaga MEÐ STARFSEMI árið áður er talan sem segir
//   eitthvað um atvinnulífið; þess vegna ber forsíðureiturinn hana.
// ⚠ Mánaðartölur sveiflast frá 7 (ágúst) upp í 124 (janúar). Síðan sýnir aldrei stakan mánuð heldur
//   frá áramótum á móti sama tíma í fyrra, eða 12 mánaða summur.
import { MON, MON_LONG, monthLabel } from '../../src/lib/format.mjs';

/** Breytukóðar Hagstofunnar. Breyti hún þeim kastar `rod` villu sem nefnir kóðann. */
export const BREYTUR = {
  nyskr: 'Fjöldi nýskráninga',                             // FYR03001
  skrad: 'Fjöldi gjaldþrota',                              // FYR03001
  skradGrein: 'Skráð gjaldþrot',                           // FYR03010, sama tala og skrad fyrir Alls
  virk: 'Gjaldþrot fyrirtækja með virkni á fyrra ári',     // FYR03010
  launafolk: 'Fjöldi launafólks að jafnaði á fyrra ári',   // FYR03010
  velta: 'VSK velta á fyrra ári',                          // FYR03010, milljónir króna
};

/** Þverflokkar Hagstofunnar sem birtast utan summunnar, með styttra heiti. */
const THVERSNID = { T_TOT_IS: 'Ferðaþjónusta', SI_alls_IS: 'Iðnaður' };

/**
 * PxWeb json-svar → { [grein]: { [breyta]: { [mánuður]: tala|null } } }.
 * Stöður víddanna eru lesnar úr `columns` (svarið kemur í lækkandi mánaðaröð). Aðrar víddir, svo sem
 * Rekstrarform sem fyrirspurnin festir á „Alls“, eru hunsaðar.
 */
export function lesaPx(svar) {
  const cols = svar?.columns ?? [];
  const iMan = cols.findIndex((c) => c.type === 't');
  const iGrein = cols.findIndex((c) => c.code === 'Atvinnugreinar');
  const iBreyta = cols.findIndex((c) => c.code === 'Breytur');
  if (iMan < 0 || iGrein < 0 || iBreyta < 0) throw new Error('gjaldthrot: vantar vídd (Mánuður, Atvinnugreinar eða Breytur) í svari Hagstofunnar');
  const ut = {};
  for (const d of svar.data ?? []) {
    const v = Number.parseInt(d.values[0], 10);
    ((ut[d.key[iGrein]] ??= {})[d.key[iBreyta]] ??= {})[d.key[iMan]] = Number.isFinite(v) ? v : null;
  }
  return ut;
}

/** Röð einnar breytu fyrir eina grein. Kastar villu sem nefnir kóðann ef hann er ekki í svarinu. */
export function rod(radir, grein, breyta) {
  const r = radir?.[grein]?.[breyta];
  if (!r) throw new Error(`gjaldthrot: breytan „${breyta}“ (${grein}) er ekki í svari Hagstofunnar`);
  return r;
}

const manTala = (m) => {
  const x = /^(\d{4})M(\d{2})$/.exec(m);
  if (!x) throw new Error('gjaldthrot: ógildur mánuður ' + m);
  return +x[1] * 12 + (+x[2] - 1);
};
const manLykill = (n) => `${Math.floor(n / 12)}M${String((n % 12) + 1).padStart(2, '0')}`;

/** Samfelld röð mánaða frá `fra` til `til`, bæði meðtalin. */
export function manudirFra(fra, til) {
  const ut = [];
  for (let n = manTala(fra); n <= manTala(til); n++) ut.push(manLykill(n));
  return ut;
}

/** Mánuðurinn `n` mánuðum á undan `m`. */
export const hlidra = (m, n) => manLykill(manTala(m) - n);

/** Nýjasti mánuður með gildi. Lyklarnir eru 'YYYYMmm' og raðast því rétt sem strengir. */
export const nyjastiManudur = (r) => Object.keys(r).filter((m) => r[m] != null).sort().at(-1) ?? null;

/** Summa yfir mánuði, eða null ef einhvern vantar: hálf summa væri röng tala, ekki bara lægri. */
export function summa(r, manudir) {
  let s = 0;
  for (const m of manudir) {
    const v = r[m];
    if (v == null) return null;
    s += v;
  }
  return s;
}

/** 12 mánaða summa sem endar í hverjum mánuði `manudir`; null þar til 12 heilir mánuðir eru komnir. */
export const rullandi12 = (r, manudir) => manudir.map((m) => summa(r, manudirFra(hlidra(m, 11), m)));

/** Frá áramótum til og með `nyjasti`, og sömu mánuðir árið áður. */
export function fraAramotum(r, nyjasti) {
  const ar = +nyjasti.slice(0, 4);
  return {
    nu: summa(r, manudirFra(`${ar}M01`, nyjasti)),
    fyrra: summa(r, manudirFra(`${ar - 1}M01`, `${ar - 1}${nyjasti.slice(4)}`)),
  };
}

/** Breyting í heilum prósentum; null ef grunninn vantar eða hann er núll. Aldrei -0. */
export function breytingPct(nu, fyrra) {
  if (nu == null || fyrra == null || fyrra === 0) return null;
  return Math.round(((nu - fyrra) / fyrra) * 100) || 0;
}

const tveir = (x) => Math.round(x * 100) / 100;

/**
 * Nýskráningar á hvert gjaldþrot síðustu 12 mánuði, og lægsta og hæsta gildi heilla almanaksára.
 * Ár telst heilt ef allir 12 mánuðir eru til í báðum röðum, svo yfirstandandi ár er ekki með.
 */
export function hlutfallSamhengi(nyskr, skrad, nyjasti) {
  const glugginn = manudirFra(hlidra(nyjasti, 11), nyjasti);
  const n12 = summa(nyskr, glugginn), g12 = summa(skrad, glugginn);
  const arin = [...new Set(Object.keys(skrad).map((m) => +m.slice(0, 4)))];
  const heil = [];
  for (const ar of arin) {
    const mm = manudirFra(`${ar}M01`, `${ar}M12`);
    const n = summa(nyskr, mm), g = summa(skrad, mm);
    if (n != null && g) heil.push({ ar, v: tveir(n / g) });
  }
  heil.sort((a, b) => a.v - b.v || a.ar - b.ar);
  return { nu: n12 != null && g12 ? tveir(n12 / g12) : null, lagmark: heil[0] ?? null, hamark: heil.at(-1) ?? null };
}

/** „Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)“ → { nafn, isat: '41-43' }. */
export function hreinsaHeiti(texti) {
  const s = String(texti ?? '');
  const m = /^(.*?)\s*\(ÍSAT2008:\s*([^)]*)\)\s*$/.exec(s);
  return m ? { nafn: m[1], isat: m[2] } : { nafn: s, isat: null };
}

/** Heiti tímabils frá áramótum: 'jan–jún 2026', 'jan 2026' eða 'árið 2026'. */
export function timabilsHeiti(ar, man) {
  if (man === 12) return `árið ${ar}`;
  if (man === 1) return `jan ${ar}`;
  return `jan–${MON[man - 1]} ${ar}`;
}

/**
 * Tafla eftir atvinnugreinum fyrir 12 mánuðina sem enda í `nyjasti`, og gjaldþrot með starfsemi
 * 12 mánuðina þar á undan (`virkFyrra`). Bálkar eru einn hástafur (A–S, X); raðir sem eru núll í öllu
 * falla út og hinar raðast eftir gjaldþrotum með starfsemi, síðan skráðum gjaldþrotum.
 */
export function balkaTafla(radir, heiti, nyjasti) {
  const nu = manudirFra(hlidra(nyjasti, 11), nyjasti);
  const fyrr = manudirFra(hlidra(nyjasti, 23), hlidra(nyjasti, 12));
  const lina = (kodi) => {
    const r = radir[kodi] ?? {};
    const s = (breyta, mm) => (r[breyta] ? summa(r[breyta], mm) : null);
    const h = hreinsaHeiti(heiti[kodi] ?? kodi);
    return {
      kodi, nafn: THVERSNID[kodi] ?? h.nafn, isat: h.isat,
      skrad: s(BREYTUR.skradGrein, nu), virk: s(BREYTUR.virk, nu), virkFyrra: s(BREYTUR.virk, fyrr),
      launafolk: s(BREYTUR.launafolk, nu), velta: s(BREYTUR.velta, nu),
    };
  };
  const rodir = Object.keys(radir).filter((k) => /^[A-Z]$/.test(k)).map(lina)
    .filter((l) => l.skrad || l.virk || l.virkFyrra)
    .sort((a, b) => (b.virk ?? -1) - (a.virk ?? -1) || (b.skrad ?? -1) - (a.skrad ?? -1) || a.kodi.localeCompare(b.kodi));
  return {
    fra: nu[0], til: nyjasti, heiti: `${monthLabel(nu[0])} – ${monthLabel(nyjasti)}`,
    rodir,
    thversnid: Object.keys(THVERSNID).filter((k) => radir[k]).map(lina),
    alls: lina('Alls'),
  };
}

/**
 * Allt sem síðan og forsíðureiturinn þurfa, úr lesnum töflum (`lesaPx`). `heiti` er { kóði: texti }
 * úr lýsigögnum FYR03010. `nyjasti` er sá mánuður sem BÁÐAR töflur ná til, svo samanburður blandi
 * aldrei saman ólíkum útgáfum Hagstofunnar.
 */
export function smidaGjaldthrot({ fyr03001, fyr03010, heiti }) {
  const nyskr = rod(fyr03001, 'Alls', BREYTUR.nyskr);
  const skrad = rod(fyr03001, 'Alls', BREYTUR.skrad);
  const virk = rod(fyr03010, 'Alls', BREYTUR.virk);
  const launafolk = rod(fyr03010, 'Alls', BREYTUR.launafolk);
  const velta = rod(fyr03010, 'Alls', BREYTUR.velta);
  const a = nyjastiManudur(skrad), b = nyjastiManudur(virk);
  if (!a || !b) throw new Error('gjaldthrot: engir mánuðir með gildi í svari Hagstofunnar');
  const nyjasti = a < b ? a : b;
  const ar = +nyjasti.slice(0, 4), man = +nyjasti.slice(5);

  const nu = {}, fyrra = {}, breyting = {};
  for (const [k, r] of Object.entries({ skrad, virk, launafolk, velta, nyskr })) {
    const f = fraAramotum(r, nyjasti);
    nu[k] = f.nu; fyrra[k] = f.fyrra; breyting[k] = breytingPct(f.nu, f.fyrra);
  }
  const anStarfsemiPct = nu.skrad && nu.virk != null ? Math.round((1 - nu.virk / nu.skrad) * 100) : null;

  const man12 = manudirFra(Object.keys(skrad).sort()[0], nyjasti).slice(11);
  return {
    nyjasti,
    nyjastiHeiti: `${MON_LONG[man - 1]} ${ar}`,
    ytd: { ar, man, heiti: timabilsHeiti(ar, man), heitiFyrra: timabilsHeiti(ar - 1, man), nu, fyrra, breyting, anStarfsemiPct },
    hlutfall: hlutfallSamhengi(nyskr, skrad, nyjasti),
    r12: { man: man12, nyskr: rullandi12(nyskr, man12), skrad: rullandi12(skrad, man12), virk: rullandi12(virk, man12) },
    balkar: balkaTafla(fyr03010, heiti, nyjasti),
  };
}
