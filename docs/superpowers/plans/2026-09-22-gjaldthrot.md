# Gjaldþrot og nýskráningar (/gjaldthrot/) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ný síða `/gjaldthrot/` og forsíðureitur úr Hagstofutöflunum FYR03001 og FYR03010, sótt daglega og vöktuð af ferskleikavörninni.

**Architecture:** Hrein, prófuð eining `skriptur/lib/gjaldthrot.mjs` reiknar allt; `skriptur/build_gjaldthrot.mjs` sækir töflurnar með `_pxlib.mjs` og skrifar `gogn/gjaldthrot.json` (allt eða ekkert). Astro-síðan, forsíðan og yfirlitssíða atvinnuvega birta aðeins tölur úr JSON-inu.

**Tech Stack:** Node 22 (`node:test`), Astro SSG, ECharts 5 af jsDelivr, Hagstofa PxWeb API v1, GitHub Actions (refresh-data.yml).

Spekk: `docs/superpowers/specs/2026-09-22-gjaldthrot-design.md`. Vinnutré: `C:\Users\aronh\dev\KARP\_gc3-wt` (detached HEAD á origin/main). Allar skipanir keyrðar úr rót vinnutrésins nema annað sé tekið fram.

## Global Constraints

- Engin emojí á síðunni, forsíðureitnum eða í valmynd. ▲/▼ eru húsvenja fyrir formerki og leyfð.
- Engin ferskleika- eða „live“-merki í sýnilegum texta. Fóturinn segir „Tölur til og með {mánuður ár}“ (tímabil gagnanna).
- Engin em-strik í fyrirsögnum (h1/h2). Bil-strik (–) í tímabilum („jan–jún 2026“) eru í lagi.
- Velta í FYR03010 er í **milljónum króna** (UNITS „Fjöldi/ Milljónir króna“); birt sem ma.kr með einum aukastaf.
- Litir úr þemabreytum `--panel --line --ink --muted --faint --gold --ok --slaemt` svo ljósa þemað virki.
- Ferskleikavörn: `skra: 'gjaldthrot'`, les `nyjasti`, `hamark: 130`.
- Forsíðureiturinn ber `ytd.breyting.virk` (félög með starfsemi), ekki skráð gjaldþrot.
- Commit-skilaboð enda á `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Deploy: `git fetch origin && git rebase origin/main && git push origin HEAD:main`.

---

### Task 1: Reikningseiningin `skriptur/lib/gjaldthrot.mjs`

**Files:**
- Create: `skriptur/lib/gjaldthrot.mjs`
- Test: `skriptur/lib/gjaldthrot.test.mjs`

**Interfaces:**
- Consumes: `MON`, `MON_LONG`, `monthLabel` úr `src/lib/format.mjs` (repo-rót).
- Produces: `BREYTUR`, `lesaPx(svar)`, `rod(radir, grein, breyta)`, `manudirFra(fra, til)`, `hlidra(m, n)`, `nyjastiManudur(r)`, `summa(r, manudir)`, `rullandi12(r, manudir)`, `fraAramotum(r, nyjasti)`, `breytingPct(nu, fyrra)`, `hlutfallSamhengi(nyskr, skrad, nyjasti)`, `hreinsaHeiti(texti)`, `timabilsHeiti(ar, man)`, `balkaTafla(radir, heiti, nyjasti)`, `smidaGjaldthrot({ fyr03001, fyr03010, heiti })` → JSON-hlutinn í spekkinu (allt nema `updated`).

- [ ] **Step 1: Skrifa prófin**

`skriptur/lib/gjaldthrot.test.mjs`:

```js
// skriptur/lib/gjaldthrot.test.mjs
// Gjaldþrot og nýskráningar (FYR03001 + FYR03010). Tölurnar birtast á /gjaldthrot/ og á forsíðu, svo
// hver útreikningur er festur hér: gluggar, frá áramótum, heil ár, röðun bálka og útgáfuskörun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREYTUR, lesaPx, manudirFra, hlidra, nyjastiManudur, summa, rullandi12, fraAramotum, breytingPct,
  hlutfallSamhengi, hreinsaHeiti, timabilsHeiti, balkaTafla, smidaGjaldthrot,
} from './gjaldthrot.mjs';

const fastar = (fra, til, v) => Object.fromEntries(manudirFra(fra, til).map((m) => [m, v]));

test('lesaPx les víddir úr columns, þolir lækkandi röð og gerir „..“ að null', () => {
  const svar = {
    columns: [{ code: 'Mánuður', type: 't' }, { code: 'Atvinnugreinar', type: 'd' }, { code: 'Rekstrarform', type: 'd' }, { code: 'Breytur', type: 'd' }, { code: 'tafla', type: 'c' }],
    data: [
      { key: ['2026M02', 'Alls', 'Alls', 'Fjöldi gjaldþrota'], values: ['12'] },
      { key: ['2026M01', 'Alls', 'Alls', 'Fjöldi gjaldþrota'], values: ['..'] },
    ],
  };
  assert.deepEqual(lesaPx(svar), { Alls: { 'Fjöldi gjaldþrota': { '2026M02': 12, '2026M01': null } } });
  assert.throws(() => lesaPx({ columns: [{ code: 'Mánuður', type: 't' }], data: [] }), /vantar vídd/);
});

test('mánaðaraðgerðir yfir áramót', () => {
  assert.deepEqual(manudirFra('2025M11', '2026M02'), ['2025M11', '2025M12', '2026M01', '2026M02']);
  assert.equal(hlidra('2026M06', 11), '2025M07');
  assert.equal(hlidra('2026M06', 23), '2024M07');
  assert.equal(nyjastiManudur({ '2026M05': 3, '2026M06': null, '2025M12': 1 }), '2026M05');
});

test('summa er null ef einhvern mánuð vantar og 12 mánaða summan bíður heils glugga', () => {
  const r = Object.fromEntries(manudirFra('2025M01', '2026M01').map((m, i) => [m, i + 1]));   // 1..13
  assert.equal(summa(r, ['2025M01', '2025M02']), 3);
  assert.equal(summa(r, ['2024M12', '2025M01']), null);
  assert.deepEqual(rullandi12(r, ['2025M11', '2025M12', '2026M01']), [null, 78, 90]);
});

test('frá áramótum á móti sömu mánuðum árið áður, breyting í heilum prósentum', () => {
  const r = { '2025M01': 10, '2025M02': 20, '2025M03': 99, '2026M01': 15, '2026M02': 30 };
  assert.deepEqual(fraAramotum(r, '2026M02'), { nu: 45, fyrra: 30 });
  assert.equal(breytingPct(45, 30), 50);
  assert.equal(breytingPct(693, 595), 16);
  assert.equal(breytingPct(1168, 1217), -4);
  assert.equal(breytingPct(5, 0), null);
  assert.equal(breytingPct(null, 5), null);
  assert.ok(Object.is(breytingPct(1000, 1003), 0), 'lítil lækkun verður 0, ekki -0');
});

test('hlutfall nýskráninga á gjaldþrot: aðeins heil ár í lægsta og hæsta gildi', () => {
  const nyskr = { ...fastar('2010M01', '2010M12', 20), ...fastar('2011M01', '2011M12', 30), ...fastar('2012M01', '2012M06', 50) };
  const skrad = fastar('2010M01', '2012M06', 10);
  const h = hlutfallSamhengi(nyskr, skrad, '2012M06');
  assert.deepEqual(h.lagmark, { ar: 2010, v: 2 });
  assert.deepEqual(h.hamark, { ar: 2011, v: 3 });                  // hálfa árið 2012 (5) er ekki með
  assert.equal(h.nu, 4);                                             // (6·30 + 6·50) / 120
});

test('heiti greina án ÍSAT-kóða, líka þegar svigi er í nafninu', () => {
  assert.deepEqual(hreinsaHeiti('Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)'), { nafn: 'Byggingarstarfsemi og mannvirkjagerð', isat: '41-43' });
  assert.deepEqual(hreinsaHeiti('Atvinnugreinaflokkun iðnaðarins (alls) (ÍSAT2008: 05-33 án 102, 41-43)'), { nafn: 'Atvinnugreinaflokkun iðnaðarins (alls)', isat: '05-33 án 102, 41-43' });
  assert.deepEqual(hreinsaHeiti('Óþekkt starfsemi'), { nafn: 'Óþekkt starfsemi', isat: null });
});

test('heiti tímabils frá áramótum', () => {
  assert.equal(timabilsHeiti(2026, 6), 'jan–jún 2026');
  assert.equal(timabilsHeiti(2026, 1), 'jan 2026');
  assert.equal(timabilsHeiti(2025, 12), 'árið 2025');
});

// Fastar mánaðartölur: `fyrr` í 2024M07–2025M06 og `nu` í 2025M07–2026M06.
function greinaradir(spec) {
  const tvo = (fyrr, nu) => ({ ...fastar('2024M07', '2025M06', fyrr), ...fastar('2025M07', '2026M06', nu) });
  const ut = {};
  for (const [kodi, g] of Object.entries(spec)) {
    ut[kodi] = {
      [BREYTUR.skradGrein]: tvo(0, g.skrad),
      [BREYTUR.virk]: tvo(g.virkFyrra, g.virk),
      [BREYTUR.launafolk]: tvo(0, g.launafolk ?? 0),
      [BREYTUR.velta]: tvo(0, g.velta ?? 0),
    };
  }
  return ut;
}

test('bálkatafla: 12 mánaða gluggar, röðun, síun og þverflokkar utan summu', () => {
  const radir = greinaradir({
    Alls: { skrad: 5, virk: 3, virkFyrra: 2, launafolk: 4, velta: 100 },
    F: { skrad: 2, virk: 2, virkFyrra: 1, launafolk: 3, velta: 80 },
    I: { skrad: 3, virk: 1, virkFyrra: 1, launafolk: 1, velta: 20 },
    B: { skrad: 0, virk: 0, virkFyrra: 0 },
    T_TOT_IS: { skrad: 1, virk: 1, virkFyrra: 0 },
  });
  const heiti = {
    Alls: 'Alls',
    F: 'Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)',
    I: 'Rekstur gististaða og veitingarekstur (ÍSAT2008: 55-56)',
    B: 'Námugröftur og vinnsla hráefna úr jörðu (ÍSAT2008: 05-09)',
    T_TOT_IS: 'Einkennandi greinar ferðaþjónustu á Íslandi (ÍSAT2008: 491, 551-553)',
  };
  const t = balkaTafla(radir, heiti, '2026M06');
  assert.equal(t.fra, '2025M07');
  assert.equal(t.til, '2026M06');
  assert.equal(t.heiti, 'júl 2025 – jún 2026');
  assert.deepEqual(t.rodir.map((r) => r.kodi), ['F', 'I']);          // B er núll í öllu og fellur út
  assert.deepEqual(t.rodir[0], { kodi: 'F', nafn: 'Byggingarstarfsemi og mannvirkjagerð', isat: '41-43', skrad: 24, virk: 24, virkFyrra: 12, launafolk: 36, velta: 960 });
  assert.deepEqual(t.thversnid.map((r) => [r.kodi, r.nafn, r.virk]), [['T_TOT_IS', 'Ferðaþjónusta', 12]]);
  assert.equal(t.alls.virk, 36);
  assert.equal(t.alls.virkFyrra, 24);
});

test('smidaGjaldthrot: nyjasti er mánuðurinn sem BÁÐAR töflur ná til', () => {
  const fyr03001 = { Alls: { [BREYTUR.nyskr]: fastar('2024M01', '2026M03', 30), [BREYTUR.skrad]: fastar('2024M01', '2026M03', 10) } };
  const grein = (virk) => ({
    [BREYTUR.skradGrein]: fastar('2024M01', '2026M02', 10), [BREYTUR.virk]: fastar('2024M01', '2026M02', virk),
    [BREYTUR.launafolk]: fastar('2024M01', '2026M02', 5), [BREYTUR.velta]: fastar('2024M01', '2026M02', 50),
  });
  const G = smidaGjaldthrot({ fyr03001, fyr03010: { Alls: grein(4), F: grein(4) }, heiti: { Alls: 'Alls', F: 'Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)' } });
  assert.equal(G.nyjasti, '2026M02');                                 // FYR03001 nær til mars, FYR03010 aðeins febrúar
  assert.equal(G.nyjastiHeiti, 'febrúar 2026');
  assert.equal(G.ytd.heiti, 'jan–feb 2026');
  assert.equal(G.ytd.heitiFyrra, 'jan–feb 2025');
  assert.deepEqual(G.ytd.nu, { skrad: 20, virk: 8, launafolk: 10, velta: 100, nyskr: 60 });
  assert.deepEqual(G.ytd.breyting, { skrad: 0, virk: 0, launafolk: 0, velta: 0, nyskr: 0 });
  assert.equal(G.ytd.anStarfsemiPct, 60);
  assert.equal(G.r12.man[0], '2024M12');
  assert.equal(G.r12.man.at(-1), '2026M02');
  assert.deepEqual([G.r12.skrad[0], G.r12.virk[0], G.r12.nyskr[0]], [120, 48, 360]);
  assert.equal(G.hlutfall.nu, 3);
  assert.equal(G.balkar.til, '2026M02');
  assert.deepEqual(G.balkar.rodir.map((r) => r.kodi), ['F']);
});

test('breyti Hagstofan breytukóða nefnir villan hann', () => {
  assert.throws(() => smidaGjaldthrot({ fyr03001: { Alls: {} }, fyr03010: { Alls: {} }, heiti: {} }), /Fjöldi nýskráninga/);
});
```

- [ ] **Step 2: Keyra prófin og sjá þau falla**

Run: `node --test skriptur/lib/gjaldthrot.test.mjs`
Expected: FAIL, `Cannot find module ... gjaldthrot.mjs`.

- [ ] **Step 3: Skrifa eininguna**

`skriptur/lib/gjaldthrot.mjs`:

```js
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
```

- [ ] **Step 4: Keyra prófin**

Run: `node --test skriptur/lib/gjaldthrot.test.mjs`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/gjaldthrot.mjs skriptur/lib/gjaldthrot.test.mjs
git commit -m "gjaldthrot: reikningseining fyrir FYR03001 + FYR03010 med profum

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Sókn, fyrsta snapshot, dagleg keyrsla og ferskleikavörn

**Files:**
- Create: `skriptur/build_gjaldthrot.mjs`
- Create (útkoma skriptunnar): `gogn/gjaldthrot.json`, `web/public/gogn/gjaldthrot.json`
- Modify: `.github/workflows/refresh-data.yml:240` (ný lína á eftir `build_vinnumarkadur.mjs`)
- Modify: `skriptur/lib/ferskleiki.mjs:40` (ný færsla á undan Mannfjölda)
- Test: `skriptur/lib/ferskleiki.test.mjs` (nýtt próf aftast)

**Interfaces:**
- Consumes: `lesaPx`, `smidaGjaldthrot` úr Task 1; `px`, `sel`, `getJson`, `writeSnapshot`, `today` úr `skriptur/_pxlib.mjs`.
- Produces: `gogn/gjaldthrot.json` með lyklunum `updated, nyjasti, nyjastiHeiti, ytd, hlutfall, r12, balkar` (Task 3 og 4 lesa þá).

- [ ] **Step 1: Skrifa ferskleikaprófið**

Bæta aftast í `skriptur/lib/ferskleiki.test.mjs`:

```js
test('gjaldþrot: ársfjórðungsleg útgáfa, júní-tölur í lagi 20.10 en gamlar 15.11', () => {
  const g = GAGNASOFN.find((x) => x.skra === 'gjaldthrot');
  assert.equal(metaFerskleika([{ ...g, json: { nyjasti: '2026M06' } }], '2026-10-20')[0].stada, 'ok');       // 112 d
  assert.equal(metaFerskleika([{ ...g, json: { nyjasti: '2026M06' } }], '2026-11-15')[0].stada, 'gamalt');   // 138 d
});
```

- [ ] **Step 2: Keyra og sjá falla**

Run: `node --test skriptur/lib/ferskleiki.test.mjs`
Expected: FAIL, `TypeError: Cannot read properties of undefined` (færsluna vantar).

- [ ] **Step 3: Bæta færslunni í GAGNASOFN**

Í `skriptur/lib/ferskleiki.mjs`, á undan línunni `{ nafn: 'Mannfjöldi', …`:

```js
  { nafn: 'Gjaldþrot og nýskráningar', skra: 'gjaldthrot', les: (j) => j.nyjasti, hamark: 130, takt: 'ársfjórðungslegt, birt um tveimur vikum eftir lok ársfjórðungs' },
```

Run: `node --test skriptur/lib/ferskleiki.test.mjs`
Expected: allt PASS.

- [ ] **Step 4: Skrifa sóknarskriptuna**

`skriptur/build_gjaldthrot.mjs`:

```js
#!/usr/bin/env node
// build_gjaldthrot.mjs — snapshot fyrir /gjaldthrot/, forsíðureitinn og spjaldið á /atvinnuvegir/:
//   • FYR03001 nýskráningar og gjaldþrot eftir mánuðum frá 2008 (Alls, öll rekstrarform)
//   • FYR03010 gjaldþrot fyrirtækja með starfsemi árið áður, launafólk þeirra og VSK-velta (m.kr.)
//     eftir mánuðum og bálkum frá 2009
// Útreikningarnir eru í lib/gjaldthrot.mjs (prófaðir). Hagstofan birtir ársfjórðungslega (tölur til júní
// birtust 15.7.2026); ferskleikavörnin (lib/ferskleiki.mjs) flaggar ef `nyjasti` verður eldri en 130 daga.
// ⚠ ALLT EÐA EKKERT: hlutarnir nota báðar töflurnar (frá áramótum blandar þeim saman), svo ef sókn eða
//   útreikningur bregst skrifast ekkert og síðasta snapshot stendur. Hin Hagstofu-snapshotin halda
//   hluta fyrir hluta, en hér yrðu hlutarnir þá úr ólíkum útgáfum.
// -> gogn/gjaldthrot.json + web/public/gogn/gjaldthrot.json
import { px, sel, getJson, writeSnapshot, today } from './_pxlib.mjs';
import { lesaPx, smidaGjaldthrot } from './lib/gjaldthrot.mjs';

const MAPPA = 'Atvinnuvegir/fyrirtaeki/skradfyrirtaeki/2_skraningar/';
const ALLT = ['*'];

try {
  const [a, b, meta] = await Promise.all([
    px(MAPPA + 'FYR03001.px', [sel('Mánuður', 'all', ALLT), sel('Atvinnugreinar', 'item', ['Alls']), sel('Rekstrarform', 'item', ['Alls']), sel('Breytur', 'all', ALLT)]),
    px(MAPPA + 'FYR03010.px', [sel('Mánuður', 'all', ALLT), sel('Atvinnugreinar', 'all', ALLT), sel('Breytur', 'all', ALLT)]),
    getJson('https://px.hagstofa.is/pxis/api/v1/is/' + MAPPA + 'FYR03010.px'),
  ]);
  const v = meta.variables.find((x) => x.code === 'Atvinnugreinar');
  const heiti = Object.fromEntries(v.values.map((k, i) => [k, v.valueTexts[i]]));
  const G = smidaGjaldthrot({ fyr03001: lesaPx(a), fyr03010: lesaPx(b), heiti });
  const bytes = writeSnapshot('gjaldthrot', { updated: today(), ...G });
  const y = G.ytd;
  console.log(`gjaldthrot.json | til ${G.nyjasti} | ${y.heiti}: ${y.nu.skrad} gjaldþrot (${y.nu.virk} með starfsemi, ${y.nu.launafolk} launafólk), ${y.nu.nyskr} nýskráningar | ${G.balkar.rodir.length} bálkar | bytes ${bytes}`);
} catch (e) {
  console.error('gjaldthrot: sókn eða útreikningur brást, fyrra snapshot stendur óbreytt:', e.message);
  process.exit(1);
}
```

- [ ] **Step 5: Keyra á raungögnum og bera saman við spekkið**

Run: `node skriptur/build_gjaldthrot.mjs`
Expected (22.9.2026): `gjaldthrot.json | til 2026M06 | jan–jún 2026: 693 gjaldþrot (229 með starfsemi, 1168 launafólk), 1847 nýskráningar | 19 bálkar | bytes …` (bálkafjöldinn getur verið annar; tölurnar ekki).

Run:
```bash
node -e "const j=require('./gogn/gjaldthrot.json');console.log(j.ytd.breyting,j.ytd.anStarfsemiPct,j.hlutfall,j.balkar.alls.virk,j.balkar.rodir[0].kodi,j.r12.man[0],j.r12.man.length)"
```
Expected: `{ skrad: 16, virk: 9, launafolk: -4, velta: -18, nyskr: 5 } 67 { nu: 3.23, lagmark: { ar: 2011, v: 1.28 }, hamark: { ar: 2022, v: 8.86 } } 388 F 2008M12 211`

- [ ] **Step 6: Daglega keyrslan**

Í `.github/workflows/refresh-data.yml`, á eftir línunni `node skriptur/build_vinnumarkadur.mjs || true …`:

```yaml
          node skriptur/build_gjaldthrot.mjs  || true   # nýskráningar og gjaldþrot (FYR03001 + FYR03010) → gjaldthrot.json
```

- [ ] **Step 7: Keyra CI-prófin og commit**

Run: `node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs`
Expected: `# fail 0`.

```bash
git add skriptur/build_gjaldthrot.mjs gogn/gjaldthrot.json web/public/gogn/gjaldthrot.json .github/workflows/refresh-data.yml skriptur/lib/ferskleiki.mjs skriptur/lib/ferskleiki.test.mjs
git commit -m "gjaldthrot: dagleg sokn ur Hagstofu, fyrsta snapshot og ferskleikavorn (130 d)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Síðan `/gjaldthrot/`

**Files:**
- Create: `web/src/pages/gjaldthrot.astro`

**Interfaces:**
- Consumes: `gogn/gjaldthrot.json` úr Task 2 um `@gogn/gjaldthrot.json`; `fmtNum`, `groupThousands`, `monthLabel` úr `@lib/format.mjs`; `Layout`, `SiduHaus`.
- Produces: síðuna `https://karp.is/gjaldthrot/` (Task 4 tengir á hana).

- [ ] **Step 1: Skrifa síðuna**

`web/src/pages/gjaldthrot.astro`:

```astro
---
// ─────────────────────────────────────────────────────────────
// /gjaldthrot/ — gjaldþrot og nýskráningar fyrirtækja (Hagstofa FYR03001 + FYR03010).
// Gögn: daglegt snapshot úr skriptur/build_gjaldthrot.mjs → gogn/gjaldthrot.json. ALLIR útreikningar
// eru í skriptur/lib/gjaldthrot.mjs (prófaðir); síðan birtir aðeins tölurnar.
// Fóturinn segir til hvaða mánaðar tölurnar ná (Hagstofan birtir ársfjórðungslega), ekki byggingardag.
// Litir úr þemabreytum (--panel, --line, --ok, --slaemt, --gold) svo ljósa þemað virki.
// ─────────────────────────────────────────────────────────────
import Layout from '../layouts/Layout.astro';
import SiduHaus from '../components/SiduHaus.astro';
import { fmtNum, groupThousands, monthLabel } from '@lib/format.mjs';
import DATA from '@gogn/gjaldthrot.json';

const { ytd, hlutfall, r12, balkar, nyjasti, nyjastiHeiti, updated } = DATA;
const tala = (v) => (v == null ? '–' : groupThousands(v));
const einn = (v) => (v == null ? '–' : fmtNum(v, 1));
const breyting = (b) => (b == null ? '' : `${b > 0 ? '▲' : b < 0 ? '▼' : ''}${Math.abs(b)}% frá ${ytd.heitiFyrra}`);
// Velta er í milljónum króna → milljarðar með einum aukastaf; undir 50 m.kr. sýnist sem „<0,1“.
const ma = (v) => (v == null ? '–' : v === 0 ? '0' : v < 50 ? '<0,1' : fmtNum(v / 1000, 1));
const isatTitill = (r) => (r.isat ? `ÍSAT2008: ${r.isat}` : undefined);
const inngangur = ytd.man === 12 ? `Árið ${ytd.ar}` : `Frá áramótum til loka ${nyjastiHeiti}`;
const desc = `Gjaldþrot fyrirtækja á Íslandi ${ytd.heiti}: ${tala(ytd.nu.skrad)} skráð gjaldþrot, þar af ${tala(ytd.nu.virk)} félög með starfsemi árið áður, og ${tala(ytd.nu.nyskr)} nýskráningar. Þróun frá 2008 og skipting eftir atvinnugreinum.`;
const jsonLd = {
  '@context': 'https://schema.org', '@type': 'Dataset', name: 'Gjaldþrot og nýskráningar fyrirtækja á Íslandi', description: desc,
  creator: { '@type': 'Organization', name: 'Karp', url: 'https://www.karp.is' }, dateModified: updated, spatialCoverage: 'Ísland',
  temporalCoverage: `2008-01/${nyjasti.slice(0, 4)}-${nyjasti.slice(5)}`,
  variableMeasured: ['Skráð gjaldþrot', 'Gjaldþrot fyrirtækja með starfsemi árið áður', 'Nýskráningar fyrirtækja'],
};
const R12 = { man: r12.man.map(monthLabel), nyskr: r12.nyskr, skrad: r12.skrad, virk: r12.virk };
---

<Layout title={`Gjaldþrot fyrirtækja ${ytd.ar} | Karp`} description={desc} canonical="https://karp.is/gjaldthrot/" jsonLd={jsonLd} ogTitle="Gjaldþrot og nýskráningar fyrirtækja">
  <main data-pg="gjaldthrot">
    <SiduHaus kicker="Hagvísir Íslands · Efnahagur" titill="Gjaldþrot og nýskráningar fyrirtækja" heimild="Hagstofa Íslands"
      tip="Skráð gjaldþrot telja öll félög sem tekin eru til gjaldþrotaskipta, líka þau sem voru hætt starfsemi. Hagstofan greinir sérstaklega þau sem höfðu starfsemi árið áður, með launafólki og veltu þeirra.">
      <p>{inngangur} voru {tala(ytd.nu.skrad)} fyrirtæki tekin til gjaldþrotaskipta og {tala(ytd.nu.nyskr)} ný skráð.{ytd.anStarfsemiPct != null && ` Af gjaldþrota félögunum höfðu ${ytd.anStarfsemiPct}% enga starfsemi árið áður.`}</p>
    </SiduHaus>

    <div class="kpis">
      <div class="kpi"><div class="k-l">Skráð gjaldþrot</div><div class="k-v">{tala(ytd.nu.skrad)}</div><div class="k-s">{breyting(ytd.breyting.skrad)}</div></div>
      <div class="kpi"><div class="k-l">Með starfsemi árið áður</div><div class="k-v">{tala(ytd.nu.virk)}</div><div class="k-s">{breyting(ytd.breyting.virk)}</div></div>
      <div class="kpi"><div class="k-l">Launafólk hjá þeim</div><div class="k-v">{tala(ytd.nu.launafolk)}</div><div class="k-s">{breyting(ytd.breyting.launafolk)}</div></div>
      <div class="kpi"><div class="k-l">Nýskráningar</div><div class="k-v">{tala(ytd.nu.nyskr)}</div><div class="k-s">{breyting(ytd.breyting.nyskr)}</div></div>
      {hlutfall.nu != null && (
        <div class="kpi"><div class="k-l">Nýskráningar á hvert gjaldþrot</div><div class="k-v">{einn(hlutfall.nu)}</div>
          <div class="k-s">síðustu 12 mánuði{hlutfall.lagmark && hlutfall.hamark && ` · lægst ${einn(hlutfall.lagmark.v)} (${hlutfall.lagmark.ar}), hæst ${einn(hlutfall.hamark.v)} (${hlutfall.hamark.ar})`}</div></div>
      )}
    </div>

    <h2>Þróun frá 2008</h2>
    <div id="chart-gj"></div>
    <p class="cap">12 mánaða summa. Mánaðartölur sveiflast mikið eftir árstíma.</p>

    <h2>Eftir atvinnugreinum</h2>
    <p class="cap">Gjaldþrot félaga með starfsemi árið áður, {balkar.heiti}, borin saman við 12 mánuðina þar á undan.</p>
    <div class="tw">
      <table class="gt">
        <thead><tr><th>Atvinnugrein</th><th>Gjaldþrot</th><th>Ári fyrr</th><th>Launafólk</th><th>Velta, ma.kr</th></tr></thead>
        <tbody>
          {balkar.rodir.map((r) => (
            <tr><td title={isatTitill(r)}>{r.nafn}</td><td>{tala(r.virk)}</td><td>{tala(r.virkFyrra)}</td><td>{tala(r.launafolk)}</td><td>{ma(r.velta)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Alls</td><td>{tala(balkar.alls.virk)}</td><td>{tala(balkar.alls.virkFyrra)}</td><td>{tala(balkar.alls.launafolk)}</td><td>{ma(balkar.alls.velta)}</td></tr>
          {balkar.thversnid.map((r) => (
            <tr class="thv"><td title={isatTitill(r)}>{r.nafn}</td><td>{tala(r.virk)}</td><td>{tala(r.virkFyrra)}</td><td>{tala(r.launafolk)}</td><td>{ma(r.velta)}</td></tr>
          ))}
        </tfoot>
      </table>
    </div>
    <p class="cap">Ferðaþjónusta og iðnaður ná þvert á greinarnar að ofan og eru ekki í summunni.</p>

    <p class="tengill">Einstök gjaldþrotamál og innkallanir birtast á <a href="/logbirting/">gjaldþrota- og félagavaktinni</a>.</p>
    <p class="foot">Tölur til og með {nyjastiHeiti}. Hagstofan birtir þær ársfjórðungslega. Heimild: <a href="https://hagstofa.is/talnaefni/atvinnuvegir/fyrirtaeki/gjaldthrot/" target="_blank" rel="noopener">Hagstofa Íslands</a> (FYR03001, FYR03010).</p>
  </main>

  <style>
    main { max-width: 860px; margin: 0 auto; padding: 44px 20px 64px; }
    p { color: var(--ink); }
    h2 { font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 30px 0 8px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0 6px; }
    .kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
    .k-l { font-size: 12px; color: var(--muted); }
    .k-v { font-size: 25px; font-weight: 800; color: var(--gold); margin-top: 2px; font-variant-numeric: tabular-nums; }
    .k-s { font-size: 11px; color: var(--faint); }
    #chart-gj { width: 100%; height: 300px; }
    .cap { font-size: 12.5px; color: var(--muted); margin: 4px 0 10px; }
    .tw { overflow-x: auto; }
    .gt { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
    .gt th { text-align: right; font-size: 11.5px; font-weight: 600; color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    .gt td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
    .gt th:first-child, .gt td:first-child { text-align: left; }
    .gt tfoot td { font-weight: 700; }
    .gt tfoot tr.thv td { font-weight: 400; color: var(--muted); }
    .tengill { font-size: 14px; margin-top: 22px; }
    .tengill a, .foot a { color: var(--gold); }
    .foot { font-size: 12px; color: var(--faint); margin-top: 28px; border-top: 1px solid var(--line); padding-top: 14px; }
  </style>

  <!-- Eyja: 12 mánaða summur frá 2008. Litir lesnir úr þemabreytum við upphaf. astro:page-load. -->
  <script define:vars={{ R12 }}>
    function initGj() {
      const el = document.getElementById('chart-gj');
      if (!el) return;
      const go = () => {
        if (window.echarts.getInstanceByDom(el)) return;
        const css = getComputedStyle(document.documentElement);
        const lit = (n, v) => css.getPropertyValue(n).trim() || v;
        const fj = (v) => (v == null ? '–' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
        const lina = (name, data, color, width) => ({ name, type: 'line', data, symbol: 'none', lineStyle: { width, color }, itemStyle: { color } });
        const c = window.echarts.init(el);
        c.setOption({
          backgroundColor: 'transparent',
          legend: { top: 0, textStyle: { color: lit('--muted', '#9fb0c8'), fontSize: 11 } },
          grid: { left: 48, right: 14, top: 34, bottom: 26 },
          xAxis: { type: 'category', data: R12.man, axisLabel: { color: lit('--faint', '#7e8ca6'), fontSize: 10 }, axisLine: { lineStyle: { color: lit('--line', 'rgba(255,255,255,.14)') } } },
          yAxis: { type: 'value', axisLabel: { color: lit('--faint', '#7e8ca6'), formatter: fj }, splitLine: { lineStyle: { color: lit('--line', 'rgba(255,255,255,.06)') } } },
          tooltip: { trigger: 'axis', valueFormatter: fj },
          series: [
            lina('Nýskráningar', R12.nyskr, lit('--ok', '#42d086'), 2),
            lina('Skráð gjaldþrot', R12.skrad, lit('--slaemt', '#ef6a6a'), 2),
            lina('Með starfsemi árið áður', R12.virk, lit('--gold', '#f6b13b'), 2.5),
          ],
        });
        window.addEventListener('resize', () => c.resize());
      };
      if (window.echarts) { go(); return; }
      let s = document.getElementById('echarts-cdn');
      if (!s) { s = document.createElement('script'); s.id = 'echarts-cdn'; s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'; document.head.appendChild(s); }
      s.addEventListener('load', go, { once: true });
    }
    document.addEventListener('astro:page-load', () => { if (document.querySelector('main[data-pg="gjaldthrot"]')) initGj(); });
  </script>
</Layout>
```

- [ ] **Step 2: Byggja og athuga HTML**

Run: `cd web && npm run build`
Expected: byggingin klárast án villu.

Run: `node -e "const h=require('fs').readFileSync('web/dist/gjaldthrot/index.html','utf8');for(const s of ['693','229','1.847','Byggingarstarfsemi','Tölur til og með júní 2026','jan–jún 2025'])console.log(s,h.includes(s))"` (úr rót vinnutrésins)
Expected: `true` sex sinnum.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/gjaldthrot.astro
git commit -m "gjaldthrot: sidan /gjaldthrot/ (spjold, 12 manada graf fra 2008, tafla eftir balkum)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Forsíðureitur, valmynd, atvinnuvegaspjald og markaðstillögur

**Files:**
- Modify: `web/src/pages/index.astro:18` (reitur), `:42` (import), `:88` (TALA)
- Modify: `web/src/layouts/Layout.astro:70` (valmynd), PATH_EFNI efnahagur-línan (~`:504`)
- Modify: `web/src/pages/atvinnuvegir/index.astro` (import + lína í `subs`)
- Modify: `web/src/lib/markadsefni_tillogur.mjs` (`VORUKORT`)

**Interfaces:**
- Consumes: `gogn/gjaldthrot.json` (`ytd.breyting.virk`, `ytd.heiti`, `ytd.nu.virk`) úr Task 2; síðuna úr Task 3.
- Produces: ekkert sem önnur verk nota.

- [ ] **Step 1: Forsíðan**

Í `web/src/pages/index.astro`, á eftir línunni `{ href: '/vinnumarkadur/', title: 'Vinnumarkaður', … },`:

```js
  { href: '/gjaldthrot/', title: 'Gjaldþrot fyrirtækja', desc: 'Gjaldþrot og nýskráningar eftir atvinnugreinum, borin saman við fyrra ár.' },
```

Á eftir `import HAGVOXTUR from '@gogn/hagvoxtur.json';`:

```js
import GJALDTHROT from '@gogn/gjaldthrot.json';
```

Á eftir línunni `if (g.latest != null) TALA['/hagvoxtur/'] = …;` (inni í `try`):

```js
  // Gjaldþrot félaga MEÐ STARFSEMI árið áður, ekki skráð gjaldþrot: skráða talan er að mestu hætt félög
  // og hoppar þegar mörg eru gerð upp í einu (sjá skriptur/lib/gjaldthrot.mjs).
  const gy = GJALDTHROT.ytd || {};
  const gb = gy.breyting ? gy.breyting.virk : null;
  if (gb != null) TALA['/gjaldthrot/'] = { v: (gb > 0 ? '▲' : gb < 0 ? '▼' : '') + isNum(Math.abs(gb)) + '%', l: 'gjaldþrot starfandi félaga, ' + gy.heiti };
```

- [ ] **Step 2: Valmyndin**

Í `web/src/layouts/Layout.astro`, á eftir `{ href: '/atvinnugreinar/', label: 'Atvinnugreinar' },`:

```js
    { href: '/gjaldthrot/', label: 'Gjaldþrot fyrirtækja' },
```

Í `PATH_EFNI`, efnahagur-línunni, breyta `furduhagfraedi|fyrirtaeki)/, 'efnahagur'` í `furduhagfraedi|fyrirtaeki|gjaldthrot)/, 'efnahagur'`.

- [ ] **Step 3: Atvinnuvegaspjald**

Í `web/src/pages/atvinnuvegir/index.astro`, á eftir `import HUGV from '@gogn/hugverk.json';`:

```js
import GJ from '@gogn/gjaldthrot.json';
```

Í `subs`, á undan línunni `['/atvinnugreinar/', 'Fjárhagur per grein', …],`:

```js
  ['/gjaldthrot/', 'Gjaldþrot fyrirtækja', GJ.ytd && GJ.ytd.nu.virk != null && groupThousands(GJ.ytd.nu.virk), GJ.ytd && `gjaldþrot félaga með starfsemi · ${GJ.ytd.heiti}`],
```

- [ ] **Step 4: Markaðstillögur**

Í `web/src/lib/markadsefni_tillogur.mjs`, aftast í `VORUKORT` (á eftir `'Fiskeldi': …,`):

```js
  'Gjaldþrot': { vara: 'Gjaldþrotasíðan', slod: '/gjaldthrot/', tala: 'gjaldþrot félaga með starfsemi eftir atvinnugreinum' },
```

Run: `cd web && node --test src/lib/markadsefni_tillogur.test.mjs`
Expected: `# fail 0` (prófið staðfestir að „Gjaldþrot“ sé raunverulegt málefnaheiti í `malefni.json`).

- [ ] **Step 5: Byggja og athuga**

Run: `cd web && npm run build`
Expected: klárast án villu.

Run (úr rót): `node -e "const f=require('fs');const i=f.readFileSync('web/dist/index.html','utf8');const a=f.readFileSync('web/dist/atvinnuvegir/index.html','utf8');console.log(i.includes('/gjaldthrot/'),i.includes('gjaldþrot starfandi félaga, jan–jún 2026'),a.includes('/gjaldthrot/'))"`
Expected: `true true true`

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/index.astro web/src/layouts/Layout.astro web/src/pages/atvinnuvegir/index.astro web/src/lib/markadsefni_tillogur.mjs
git commit -m "gjaldthrot: forsidureitur, valmynd, spjald a /atvinnuvegir/ og markadstillogur

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Sannprófun í vafra og birting

**Files:** engar nýjar (aðeins lagfæringar ef eitthvað finnst).

- [ ] **Step 1: Öll próf**

Run: `node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs && node skriptur/ci_worker_bindings.mjs && cd web && npm test`
Expected: `# fail 0` í báðum prófakeyrslum, bindingar í lagi.

- [ ] **Step 2: Skoða í vafra**

`preview_start` með `{ name: "astro-preview" }` (byggða útgáfan á :4321). Opna `/gjaldthrot/`:
- `read_console_messages` með `onlyErrors: true`: engar villur.
- `read_page`: fimm spjöld, graf teiknað (canvas inni í `#chart-gj`), taflan með F efst.
- `resize_window` `colorScheme: 'light'` og endurhlaða: litir læsilegir.
- `resize_window` `preset: 'mobile'`: engin lárétt skrun á síðunni sjálfri (taflan má skruna í eigin ramma).
- Forsíðan `/`: reiturinn „Gjaldþrot fyrirtækja“ með ▲9%.
- `resize_window` `preset: 'desktop'` og skjáskot af `/gjaldthrot/` sem sönnun.

- [ ] **Step 3: Birta**

```bash
git fetch origin && git rebase origin/main && git push origin HEAD:main
```

- [ ] **Step 4: Staðfesta í loftinu**

Eftir Workers Builds (um 3 mín.): opna `https://karp.is/gjaldthrot/` í vafranum og `get_page_text`: „693“ og „Tölur til og með júní 2026“ sjást. Forsíðan `https://karp.is/` sýnir reitinn.
