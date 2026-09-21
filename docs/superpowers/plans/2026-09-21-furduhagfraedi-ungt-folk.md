# Furðuhagfræði unga fólksins — útfærsluáætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fimm nýjar greinar á `/furduhagfraedi/`, hver með grafmyndbandi og stuttum texta, tímasettar á Karp-rásirnar tvær í Postiz á þriðjudögum og fimmtudögum 24.9 til 8.10.

**Architecture:** Öll stærðfræði greinanna býr í prófaðri einingu `web/src/lib/furdu-ungt.mjs`. Ritstýrð, dagsett gögn með heimild í `web/src/data/furdu-ungt.json`. Púðatalningin er endurkeyranleg skripta sem skrifar `gogn/nikotinpudar.json`. Síðan les þetta þrennt við byggingu og teiknar sagartönnina sem SVG án JavaScript. Myndböndin nota varanlega hjálpareiningu utan repo (`dev\KARP\markadsefni\myndband\`) sem lota 5 notar líka, og reikna tölurnar með SÖMU föllum og síðan.

**Tech Stack:** Astro (SSG), node:test, @napi-rs/canvas + h264-mp4-encoder (WASM), postiz CLI 2.0.14 (bash-shim).

**Spekk:** `docs/superpowers/specs/2026-09-21-furduhagfraedi-ungt-folk-design.md`

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\_gc3-wt` (detached, fylgir origin/main). Deploy = `git push origin HEAD:main`; Workers Builds deployar hvert push. Commit-skilaboð enda á `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Commit-skilaboð með bakstrikum fara um `git commit -F -` með heredoc (bash keyrir bakstrik).
- Repo-ið er OPINBERT. `POSTIZ_API_KEY` er í umhverfinu; ALDREI prenta hann.
- Hver tala á síðunni ber heimild og dagsetningu. Verð eru dagsett skyndimynd, ekki skrap.
- Nikótíngreinin fjallar um hvernig löggjafinn hannaði gjaldið og hvað ríkið fær. Aldrei um varninginn; ENGIN vörumerki á síðu né í myndbandi.
- Hver forsenda stendur upphátt: skot í íslatte, g og mg í kaffibolla, 10% útborgun, hlutastarf undir skattleysismörkum, 105 mg Nocco.
- Tilgátan sem stóðst ekki (hópun á þrepamörkum) er sögð á síðunni.
- Engin emojí og engin „live"-merki í sýnilegu viðmóti síðunnar.
- Myndbönd: 1080×1350, 30 fps, 18 s. Bak `#0b0f1a`, gull `#f6b13b`, grænt `#46e08a`. „KARP · FURÐUHAGFRÆÐI" efst, `karp.is/furduhagfraedi/#<akkeri>` neðst. ✔ U+2714, aldrei ✓ U+2713. EITT myndband á node-ferli. Test-PNG skoðað með Read ÁÐUR en encode-að er. Staðfesta að hver .mp4 sé til og yfir 100 KB (`| tail` felur hrun).
- Postiz: AÐEINS LinkedIn `cmt92pcw000r9p20yv7b53018` og Facebook `cmt92q6mr00pbmp0ykfa92r3v` (FB með `--settings '{"post_type":"post"}'`), `--no-shortLink`, `-t schedule`, kl. `08:30:00Z`. Reikningurinn ber líka EWB (`cmpvni6bb00hpmt0yuatcjamo`, `cmpvnh6pl00gwmt0ym3pbee5w`) og Steinsson|Greykdal (`cmt92pqzk00rqp20yakkcqau9`): aldrei þar.
- Dagatal: fim 24.9 `nikotingjald` · þri 29.9 `nocco-vinnutimi` · fim 1.10 `dosin` · þri 6.10 `koffinkrona` · fim 8.10 `islattar`. 12., 14., 16. og 19.10 kl. 08:30Z eru frátekin fyrir lotu 5.
- Textar: stuttir. Tala, snúningur, hlekkur. Fá þankastrik.

## Staðfestar tölur (21.9.2026)

| tala | gildi | heimild |
|---|---|---|
| Nikótíngjald | 1–8 mg/g 8,30 · 8,1–12 12,45 · 12,1–16 15,55 · 16,1–20 20,75 kr/g | lög 96/1995, 10. gr. d (fjárhæðir skv. l. 99/2025, 4. gr.) |
| Vindlingar | 806,70 kr á 20 stk. pakka | l. 96/1995, 10. gr. (skv. l. 99/2025, 3. gr.) |
| Nocco 330 ml | 304 kr, 105 mg | Neytandinn, Bónus 31.8.2026 (Limón; „nocco limón 105mg" staðfestir styrkinn). ⚠ Focus-línan kann að vera sterkari, ekki nota hana |
| Red Bull 250 ml | 233 kr, 80 mg | Neytandinn, Bónus 6.9.2026 |
| Monster Ultra 500 ml | 249 kr, 150 mg | Neytandinn, Bónus 13.9.2026 |
| Merrild 103 500 g | 1.298 kr; 8 g og 90 mg í bolla | Neytandinn, Bónus 9.9.2026; EFSA |
| Íslatte Te & Kaffi | ⏳ bíður Arons; 2 skot × 63 mg | Te & Kaffi birtir ekki verð kaffihúsanna |
| Taxti 16 ára | 2.410,52 kr/klst frá 1.4.2026 | VR og SA, afgreiðslufólk |
| Persónuafsláttur | 72.492 kr/mán; 1. þrep 31,49% | `web/src/pages/reiknivelar.astro` LAUN2026 |
| Meðallaun | 568.818,37 kr/mán eftir skatt | `gogn/numbeo.json` idx 53 (14.9.2026) |
| 230 fjölbýli | 54.500.000 kr, 145 sölur, sept. 2025–ág. 2026 | reiknað við byggingu úr kaupskrá |
| Útborgun fyrstu kaupenda | 10% | SÍ, hámark veðsetningar 90% frá lokum okt. 2025 |
| Skilagjald | 23 kr (20,73 án vsk) | l. 52/1989, 1. gr. (skv. l. 99/2025, 43. gr.); Endurvinnslan |
| Umbúðir 2024 | 240 m á markað, 211 m skilað, 20 kr | Endurvinnslan, mbl.is 4.3.2025 |

## Skráakort

| skrá | ábyrgð |
|---|---|
| `web/src/lib/furdu-ungt.mjs` (nýtt) | öll stærðfræði greinanna fimm |
| `web/test/furdu-ungt.test.mjs` (nýtt) | próf fyrir hana |
| `web/src/data/furdu-ungt.json` (nýtt) | ritstýrð, dagsett gögn með heimild |
| `web/test/furdu-ungt-gogn.test.mjs` (nýtt) | engin tala án dagsetningar og heimildar |
| `skriptur/lib/nikotinpudar.mjs` (nýtt) | þáttun á vörusíðum Svens |
| `skriptur/lib/nikotinpudar.test.mjs` (nýtt) | próf; CI keyrir `skriptur/lib/*.test.mjs` |
| `skriptur/saekja_nikotinpuda.mjs` (nýtt) | endurkeyranleg talning → `gogn/nikotinpudar.json` |
| `web/src/pages/furduhagfraedi.astro` (breytt) | fimm hlutar, SVG-sagartönn, súlur í HTML |
| `dev\KARP\markadsefni\myndband\karp-myndband.cjs` + próf + LESTU-MIG (nýtt, utan repo) | varanleg hjálpareining myndbanda |
| `dev\KARP\markadsefni\furduhagfraedi-ungt\myndbond.cjs`, `tima.sh`, `*.txt` (nýtt) | fimm myndbönd, textar, tímasetning |
| `~\.claude\scheduled-tasks\karp-markadsefni-lota-5\SKILL.md` (breytt) | athugar eigin daga, rétt repo, hjálpareiningin |

---

### Task 1: Reikningseiningin

**Files:**
- Create: `web/src/lib/furdu-ungt.mjs`
- Test: `web/test/furdu-ungt.test.mjs`

**Interfaces:**
- Produces: `NIKOTIN_THREP`, `THREPAMORK`, `gjaldPerGramm(mgG)`, `gjaldADos(mgG, dosG)`, `sagartonn({fra, til})`, `hillutalning(vorur)`, `aThrepamorkum(vorur)`, `rettYfirThrepi(vorur)`, `koffinKrona(verd, mg)`, `kaffibolli({pakkiVerd, pakkiG, gBolli})`, `nettoAnSkatts(brutto, lifeyrir)`, `skattleysismork({personuafslattur, skattur1, lifeyrir})`, `minutur(verd, timakaup)`, `midgildi(tolur)`, `tolfManudir('YYYY-MM')`, `midgildiSolu(rows, {teg, nu})`, `islattarIUtborgun({verdIbudar, hlutfall, islatteVerd})`, `skilagjaldHlutfall(skilagjald, verd)`, `oskilad({aMarkad, skilad, gjald})`. `vorur` = `[{ nafn, mgG, dosG, verd }]`.

- [ ] **Step 1: Skrifa prófin**

```js
// web/test/furdu-ungt.test.mjs
// Furðuhagfræði unga fólksins. ⚠ Öll stærðfræðin er hér, aldrei í .astro (sjá karp-lanshaefismat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NIKOTIN_THREP, gjaldPerGramm, gjaldADos, sagartonn, hillutalning, aThrepamorkum, rettYfirThrepi,
  koffinKrona, kaffibolli, nettoAnSkatts, skattleysismork, minutur, midgildi, tolfManudir,
  midgildiSolu, islattarIUtborgun, skilagjaldHlutfall, oskilad,
} from '../src/lib/furdu-ungt.mjs';

const naer = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('þrepin eru orðrétt úr 10. gr. d laga 96/1995', () => {
  assert.deepEqual(NIKOTIN_THREP.map((t) => t.krG), [8.30, 12.45, 15.55, 20.75]);
  for (const [mg, kr] of [[1, 8.30], [8, 8.30], [8.1, 12.45], [12, 12.45], [12.1, 15.55], [16, 15.55], [16.1, 20.75], [20, 20.75]]) {
    assert.equal(gjaldPerGramm(mg), kr, `${mg} mg/g`);
  }
});

test('utan þrepa er ekkert gjald skilgreint', () => {
  assert.equal(gjaldPerGramm(0.5), null);
  assert.equal(gjaldPerGramm(20.1), null);
  assert.equal(gjaldPerGramm(NaN), null);
});

test('frá 8,0 í 8,1 mg/g hækkar gjaldið á gramm um 50%', () => {
  naer(gjaldPerGramm(8.1) / gjaldPerGramm(8), 1.5);
});

test('gjald á 14 g dós: 290,5 kr á 16,5 mg/g en 217,7 á 16,0', () => {
  naer(gjaldADos(16.5, 14), 290.5);
  naer(gjaldADos(16, 14), 217.7);
  assert.equal(gjaldADos(16.5, 0), null);
});

test('sagartönnin: kr á hvert mg, 0,1 skref', () => {
  const t = sagartonn({ fra: 4, til: 20 });
  assert.equal(t.length, 161);
  assert.deepEqual(t[0], { mgG: 4, krMg: 8.30 / 4 });
  naer(t.find((q) => q.mgG === 8.1).krMg, 12.45 / 8.1);
  naer(sagartonn()[0].krMg, 8.30);
});

const PUDAR = [
  ...Array.from({ length: 9 }, (_, i) => ({ nafn: 'A' + i, mgG: 16.5, dosG: 14, verd: 1245 })),
  { nafn: 'B1', mgG: 16, dosG: 14, verd: 1100 },
  { nafn: 'B2', mgG: 16, dosG: 14, verd: 1100 },
  { nafn: 'C', mgG: 12.5, dosG: 10, verd: 900 },
  { nafn: 'D', mgG: 8, dosG: 10, verd: 800 },
  { nafn: 'E', mgG: 20, dosG: 10, verd: 800 },
];

test('hillutalning: algengast fyrst', () => {
  assert.deepEqual(hillutalning(PUDAR).slice(0, 2), [{ mgG: 16.5, n: 9 }, { mgG: 16, n: 2 }]);
});

test('á þrepamörkum 8, 12 og 16 (20 er lagalegt hámark, ekki þrep)', () => {
  assert.equal(aThrepamorkum(PUDAR), 3);
});

test('rétt yfir þrepi: 73 kr meira á dós fyrir 3% meira nikótín', () => {
  const [h] = rettYfirThrepi(PUDAR);
  assert.equal(h.mgG, 16.5); assert.equal(h.n, 9); assert.equal(h.thak, 16); assert.equal(h.verd, 1245);
  naer(h.aukagjald, 72.8);
  naer(h.aukaNikotin, 0.03125);
  naer(h.hlutfallAfVerdi, 290.5 / 1245);
  assert.ok(!rettYfirThrepi(PUDAR).some((g) => g.mgG === 16), 'á þakinu sjálfu er ekki yfir þrepi');
});

test('koffínkrónan: kr á hver 100 mg', () => {
  naer(koffinKrona(304, 105), 289.5238095, 1e-6);
  naer(koffinKrona(233, 80), 291.25);
  assert.equal(koffinKrona(100, 0), null);
});

test('kaffibolli úr 500 g pakka á 1.298 kr, 8 g í bolla', () => {
  naer(kaffibolli({ pakkiVerd: 1298, pakkiG: 500, gBolli: 8 }), 20.768);
});

test('16 ára í hlutastarfi: enginn tekjuskattur, 4% lífeyrir', () => {
  naer(nettoAnSkatts(2410.52, 0.04), 2314.0992);
  assert.equal(Math.round(skattleysismork({ personuafslattur: 72492, skattur1: 0.3149, lifeyrir: 0.04 })), 239798);
});

test('mínútur af vinnu', () => {
  assert.equal(minutur(300, 1800), 10);
  assert.ok(Math.abs(minutur(304, 2314.0992) - 7.88) < 0.01);
  assert.equal(minutur(304, 0), null);
});

test('miðgildi', () => {
  assert.equal(midgildi([3, 1, 2]), 2);
  assert.equal(midgildi([4, 1, 3, 2]), 2.5);
  assert.equal(midgildi([]), null);
});

test('tólf HEILIR mánuðir á undan líðandi mánuði', () => {
  assert.deepEqual(tolfManudir('2026-09'), { fra: '2025-09', til: '2026-08' });
  assert.deepEqual(tolfManudir('2026-01'), { fra: '2025-01', til: '2025-12' });
});

test('miðgildi sölu: aðeins réttur flokkur og gluggi, lv í þús. kr', () => {
  const rows = [
    { teg: 'Fjölbýli', ld: '2025-08', lv: 100 }, { teg: 'Fjölbýli', ld: '2025-09', lv: 200 },
    { teg: 'Fjölbýli', ld: '2026-08', lv: 400 }, { teg: 'Fjölbýli', ld: '2026-09', lv: 900 },
    { teg: 'Einbýli', ld: '2026-01', lv: 999 }, { teg: 'Fjölbýli', ld: '2026-02', lv: 0 },
  ];
  assert.deepEqual(midgildiSolu(rows, { teg: 'Fjölbýli', nu: '2026-09' }), { fra: '2025-09', til: '2026-08', n: 2, midgildi: 300000 });
});

test('íslattar í útborgun', () => {
  const r = islattarIUtborgun({ verdIbudar: 54500000, hlutfall: 0.10, islatteVerd: 1100 });
  naer(r.utborgun, 5450000);
  naer(r.fjoldi, 4954.545454, 1e-5);
  naer(r.arMedEinumADag, 4954.545454 / 365, 1e-6);
});

test('dósin', () => {
  naer(skilagjaldHlutfall(23, 304), 23 / 304);
  const o = oskilad({ aMarkad: 240e6, skilad: 211e6, gjald: 20 });
  assert.equal(o.n, 29e6); assert.equal(o.kr, 580e6); naer(o.skilahlutfall, 211 / 240);
});
```

- [ ] **Step 2: Keyra og sjá falla**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && node --test test/furdu-ungt.test.mjs`
Expected: FAIL, `Cannot find module '.../src/lib/furdu-ungt.mjs'`

- [ ] **Step 3: Skrifa eininguna**

```js
// web/src/lib/furdu-ungt.mjs — furðuhagfræði unga fólksins (21.9.2026).
//
// ⚠ Öll stærðfræði greinanna fimm býr HÉR, prófuð í web/test/furdu-ungt.test.mjs, aldrei í .astro.
// Myndböndin (markadsefni/furduhagfraedi-ungt/myndbond.cjs) flytja SÖMU föll inn, svo síða og
// myndband geta ekki sagt tvær ólíkar tölur.

/**
 * Nikótíngjald á púða, kr á hvert gramm vöru. Lög nr. 96/1995, 10. gr. d; fjárhæðirnar komu með
 * lögum nr. 99/2025, 4. gr. Mörkin eru „1 til og með 8 mg/g", „8,1 til og með 12" o.s.frv.
 * ⚠ Gjaldið leggst á UPPGEFINN styrk á umbúðum (sama grein), ekki mældan.
 */
export const NIKOTIN_THREP = [
  { fra: 1, til: 8, krG: 8.30 },
  { fra: 8.1, til: 12, krG: 12.45 },
  { fra: 12.1, til: 16, krG: 15.55 },
  { fra: 16.1, til: 20, krG: 20.75 },
];

/** Þökin þar sem gjaldið stekkur. 20 mg/g er lagalegt hámark, ekki þrep. */
export const THREPAMORK = [8, 12, 16];

/** kr á gramm fyrir styrk í mg/g, eða null utan 1–20 mg/g. */
export function gjaldPerGramm(mgG) {
  if (!(mgG >= 1) || mgG > 20) return null;
  return NIKOTIN_THREP.find((t) => mgG <= t.til).krG;
}

/** Gjald á eina dós, kr. */
export function gjaldADos(mgG, dosG) {
  const k = gjaldPerGramm(mgG);
  return k == null || !(dosG > 0) ? null : k * dosG;
}

/** Sagartönnin: kr á hvert mg nikótíns eftir styrk, í 0,1 mg/g skrefum. */
export function sagartonn({ fra = 1, til = 20 } = {}) {
  const ut = [];
  for (let i = Math.round(fra * 10); i <= Math.round(til * 10); i++) {
    const mgG = i / 10;
    ut.push({ mgG, krMg: gjaldPerGramm(mgG) / mgG });
  }
  return ut;
}

/** Fjöldi púða á hverjum styrk, algengast fyrst. */
export function hillutalning(vorur) {
  const m = new Map();
  for (const v of vorur) m.set(v.mgG, (m.get(v.mgG) || 0) + 1);
  return [...m].map(([mgG, n]) => ({ mgG, n })).sort((a, b) => b.n - a.n || a.mgG - b.mgG);
}

/** Hve margir púðar sitja nákvæmlega á þrepamörkum. Tilgátan var að þeir yrðu margir. */
export const aThrepamorkum = (vorur) => vorur.filter((v) => THREPAMORK.includes(v.mgG)).length;

/**
 * Púðar sem sitja rétt YFIR þrepamörkum (innan 1 mg/g) og hvað það kostar í gjaldi á dós miðað
 * við þakið fyrir neðan. Hópað á styrk og dósarþyngd; verð hóps = miðgildi.
 */
export function rettYfirThrepi(vorur) {
  const hopar = new Map();
  for (const v of vorur) {
    const thak = THREPAMORK.find((t) => v.mgG > t && v.mgG <= t + 1);
    if (thak == null || !(v.dosG > 0)) continue;
    const lykill = `${v.mgG}|${v.dosG}`;
    const h = hopar.get(lykill) || { mgG: v.mgG, dosG: v.dosG, thak, verdin: [] };
    h.verdin.push(v.verd);
    hopar.set(lykill, h);
  }
  return [...hopar.values()].map(({ verdin, ...h }) => {
    const verd = midgildi(verdin);
    const gjald = gjaldADos(h.mgG, h.dosG);
    const gjaldAThaki = gjaldADos(h.thak, h.dosG);
    return {
      ...h, n: verdin.length, verd, gjald, gjaldAThaki,
      aukagjald: gjald - gjaldAThaki,
      aukaNikotin: h.mgG / h.thak - 1,
      hlutfallAfVerdi: verd > 0 ? gjald / verd : null,
    };
  }).sort((a, b) => b.n - a.n);
}

/** Verð á hver 100 mg af koffíni. */
export const koffinKrona = (verd, mg) => (mg > 0 && verd >= 0 ? (verd / mg) * 100 : null);

/** Verð á bolla af uppáhelltu kaffi úr pakka. */
export const kaffibolli = ({ pakkiVerd, pakkiG, gBolli }) => pakkiVerd / (pakkiG / gBolli);

/** Nettó tímakaup þegar enginn tekjuskattur er greiddur: aðeins lífeyrir dreginn frá. */
export const nettoAnSkatts = (brutto, lifeyrir = 0.04) => brutto * (1 - lifeyrir);

/** Mánaðartekjur sem persónuafslátturinn dekkar að fullu (enginn tekjuskattur undir þeim). */
export const skattleysismork = ({ personuafslattur, skattur1, lifeyrir = 0.04 }) =>
  personuafslattur / skattur1 / (1 - lifeyrir);

/** Mínútur af vinnu fyrir vöru. */
export const minutur = (verd, timakaup) => (timakaup > 0 ? (verd / timakaup) * 60 : null);

export function midgildi(tolur) {
  const s = tolur.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/** Tólf HEILIR mánuðir á undan mánuðinum `nu` ('YYYY-MM'). */
export function tolfManudir(nu) {
  const [ar, man] = nu.split('-').map(Number);
  const aftur = (n) => {
    const i = ar * 12 + (man - 1) - n;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  };
  return { fra: aftur(12), til: aftur(1) };
}

/**
 * Miðgildi kaupverðs (kr) úr fasteignaskra/<pn>.json yfir 12 heila mánuði á undan `nu`.
 * ld = 'YYYY-MM' síðustu sölu, lv = kaupverð í þús. kr.
 * ⚠ Skráin geymir SÍÐUSTU sölu hverrar eignar: eign sem seldist tvisvar telst einu sinni.
 */
export function midgildiSolu(rows, { teg, nu }) {
  const { fra, til } = tolfManudir(nu);
  const v = rows.filter((r) => r.teg === teg && r.ld >= fra && r.ld <= til && r.lv > 0).map((r) => r.lv * 1000);
  return { fra, til, n: v.length, midgildi: midgildi(v) };
}

/** Útborgunin talin í íslöttum. */
export function islattarIUtborgun({ verdIbudar, hlutfall, islatteVerd }) {
  const utborgun = verdIbudar * hlutfall;
  const fjoldi = utborgun / islatteVerd;
  return { utborgun, fjoldi, arMedEinumADag: fjoldi / 365 };
}

/** Skilagjald sem hlutfall af verði drykkjar. */
export const skilagjaldHlutfall = (skilagjald, verd) => (verd > 0 ? skilagjald / verd : null);

/** Umbúðir sem skiluðu sér ekki og skilagjaldið sem enginn sótti. */
export function oskilad({ aMarkad, skilad, gjald }) {
  const n = aMarkad - skilad;
  return { n, kr: n * gjald, skilahlutfall: skilad / aMarkad };
}
```

- [ ] **Step 4: Keyra og sjá standast**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && node --test test/furdu-ungt.test.mjs`
Expected: `# pass 17`, `# fail 0`

- [ ] **Step 5: Allt prófasafnið**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && npm test 2>&1 | tail -8`
Expected: `# fail 0`

- [ ] **Step 6: Commit**

```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt && git add web/src/lib/furdu-ungt.mjs web/test/furdu-ungt.test.mjs && git commit -q -F - <<'EOF'
furduhagfraedi: reikningseining fyrir fimm greinar unga folksins

Nikotingjaldsthrepin (l. 96/1995, 10. gr. d, fjarhaedir skv. l. 99/2025, 4. gr.), koffinkronan,
islattar i utborgun, Nocco i vinnutima og dosin. Oll staerdfraedin her, profud; sidan og
myndbondin flytja somu foll inn svo thau geti ekki sagt tvaer olikar tolur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Endurkeyranleg púðatalning

**Files:**
- Create: `skriptur/lib/nikotinpudar.mjs`
- Test: `skriptur/lib/nikotinpudar.test.mjs`
- Create: `skriptur/saekja_nikotinpuda.mjs`
- Output: `gogn/nikotinpudar.json`

**Interfaces:**
- Produces: `gogn/nikotinpudar.json` = `{ dags:'YYYY-MM-DD', heimild:'svens.is', slodir:int, n:int, othattad:[{nafn,slod,strengur}], villur:[…], vorur:[{ nafn, slod, verd, dosG, strengur, mgPudi, mgG }] }`. Task 1 les `vorur` (`mgG`, `dosG`, `verd`).

- [ ] **Step 1: Skrifa prófin** (HTML-bútarnir eru sama snið og raunsíða Svens 21.9.2026)

```js
// skriptur/lib/nikotinpudar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thattaSitemap, thattaToflu, thattaStyrk, thattaVerd, thattaVoru } from './nikotinpudar.mjs';

const SIDA = `<h1 class="product_title entry-title">Zyn Blackcurrant Ice #5</h1>
<p class="price"><del aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi>1.395&nbsp;<span>kr.</span></bdi></span></del>
<ins aria-hidden="true"><span class="woocommerce-Price-amount amount"><bdi>1.295&nbsp;<span>kr.</span></bdi></span></ins></p>
<script type="application/ld+json">{"@context":"https://schema.org/","@graph":[{"@type":"Product","name":"Zyn Blackcurrant Ice #5","offers":[{"@type":"Offer","priceSpecification":[{"@type":"UnitPriceSpecification","price":"1295","priceCurrency":"ISK"},{"@type":"UnitPriceSpecification","price":"1395","priceCurrency":"ISK","priceType":"https://schema.org/ListPrice"}]}]}]}</script>
<table><tr><td>Vörumerki</td><td>Zyn</td></tr>
<tr><td>Magn í dós (g)</td><td>14,7</td></tr>
<tr><td>Nikótínstyrkur (mg/púði) (mg/g)</td><td>13,5 &#8211; 19,3</td></tr>
<tr><td>Púðar í dós</td><td>21</td></tr></table>`;

test('veftréð: aðeins vörusíður', () => {
  const xml = '<url><loc>https://svens.is/products/a/</loc></url><url><loc>https://svens.is/collections/b/</loc></url>';
  assert.deepEqual(thattaSitemap(xml), ['https://svens.is/products/a/']);
});

test('⚠ taflan er <td> í BÁÐUM dálkum — fyrsta talningin las <th> og fékk ekkert', () => {
  const t = thattaToflu(SIDA);
  assert.equal(t['Magn í dós (g)'], '14,7');
  assert.equal(t['Nikótínstyrkur (mg/púði) (mg/g)'], '13,5 – 19,3');
});

test('styrkur: bæði „13,5 – 19,3" og „12,5-20"', () => {
  assert.deepEqual(thattaStyrk('13,5 – 19,3'), { mgPudi: 13.5, mgG: 19.3 });
  assert.deepEqual(thattaStyrk('12,5-20'), { mgPudi: 12.5, mgG: 20 });
});

test('annað snið er ÓÞÁTTAÐ, aldrei giskað', () => {
  assert.equal(thattaStyrk('12mg, 20mg'), null);
  assert.equal(thattaStyrk(''), null);
  assert.equal(thattaStyrk(null), null);
});

test('verð: núverandi verð úr JSON-LD, ekki listaverðið fyrir útsölu', () => {
  assert.equal(thattaVerd(SIDA), 1295);
});

test('verð: varaleið um <ins> ef JSON-LD vantar', () => {
  const an = SIDA.replace(/<script[\s\S]*?<\/script>/, '');
  assert.equal(thattaVerd(an), 1295);
});

test('ein vörusíða → færsla', () => {
  assert.deepEqual(thattaVoru(SIDA, 'https://svens.is/products/x/'), {
    nafn: 'Zyn Blackcurrant Ice #5', slod: 'https://svens.is/products/x/', verd: 1295,
    dosG: 14.7, strengur: '13,5 – 19,3', mgPudi: 13.5, mgG: 19.3,
  });
});

test('síða án nikótínstyrks (aukahlutur) skilar strengur=null', () => {
  const v = thattaVoru('<h1>Dósahylki</h1><table><tr><td>Litur</td><td>Svart</td></tr></table>', 's');
  assert.equal(v.strengur, null); assert.equal(v.mgG, null);
});
```

- [ ] **Step 2: Keyra og sjá falla**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt && node --test skriptur/lib/nikotinpudar.test.mjs`
Expected: FAIL, `Cannot find module`

- [ ] **Step 3: Skrifa þáttunina**

```js
// skriptur/lib/nikotinpudar.mjs — þáttun á vörusíðum Svens fyrir /furduhagfraedi/#nikotingjald.
//
// ⚠ Töflur Svens eru <td> í BÁÐUM dálkum, ekkert <th>. Fyrsta talningin (21.9.2026) leitaði að <th>
//   og fékk ekkert. Hér er tekið við hvoru tveggja.
// ⚠ Styrkur er „mg/púði – mg/g", t.d. „13,5 – 19,3" eða „12,5-20". Annað snið („12mg, 20mg") er
//   skilað sem óþáttuðu og TALIÐ SÉR. Aldrei giskað á hvor talan er hvað.

const dec = (s) => Number(String(s).trim().replace(',', '.'));

const hreinsa = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&ndash;/g, '–')
  .replace(/\s+/g, ' ').trim();

/** Slóðir vörusíðna úr product-sitemap.xml. */
export const thattaSitemap = (xml) => [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].trim()).filter((u) => /\/products\//.test(u));

/** Merking → gildi úr öllum tveggja dálka töfluröðum síðunnar. */
export function thattaToflu(html) {
  const ut = {};
  for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const reitir = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => hreinsa(c[1]));
    if (reitir.length === 2 && reitir[0]) ut[reitir[0]] = reitir[1];
  }
  return ut;
}

/** „13,5 – 19,3" → { mgPudi: 13.5, mgG: 19.3 }; annað snið → null. */
export function thattaStyrk(s) {
  const m = String(s ?? '').replace(/[–—]/g, '-').replace(/\s+/g, '')
    .match(/^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/);
  return m ? { mgPudi: dec(m[1]), mgG: dec(m[2]) } : null;
}

/**
 * Núverandi verð vörunnar. JSON-LD Product → offers → priceSpecification ÁN priceType
 * (sú MEÐ priceType er ListPrice, verðið fyrir útsölu). Varaleið: <ins> í <p class="price">.
 */
export function thattaVerd(html) {
  for (const m of String(html).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    const hlutir = Array.isArray(j) ? j : (j['@graph'] || [j]);
    for (const g of hlutir) {
      const tegund = [].concat(g?.['@type'] || []);
      if (!tegund.includes('Product')) continue;
      for (const o of [].concat(g.offers || [])) {
        const nu = [].concat(o.priceSpecification || []).find((p) => p && !p.priceType);
        const v = Number(nu ? nu.price : o.price);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  }
  const p = String(html).match(/<p class="price">([\s\S]*?)<\/p>/);
  const s = p && (p[1].match(/<ins[\s\S]*?<bdi>([\d.]+)/) || p[1].match(/<bdi>([\d.]+)/));
  return s ? Number(s[1].replace(/\./g, '')) : null;
}

/** Ein vörusíða → færsla. strengur=null þýðir að síðan er ekki púði. */
export function thattaVoru(html, slod) {
  const tafla = thattaToflu(html);
  const lykill = (re) => Object.keys(tafla).find((k) => re.test(k));
  const kStyrkur = lykill(/nikótínstyrkur/i);
  const kDos = lykill(/magn í dós/i);
  const strengur = kStyrkur ? tafla[kStyrkur] : null;
  const styrkur = thattaStyrk(strengur);
  return {
    nafn: hreinsa((String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''),
    slod,
    verd: thattaVerd(html),
    dosG: kDos ? dec(tafla[kDos]) : null,
    strengur,
    mgPudi: styrkur ? styrkur.mgPudi : null,
    mgG: styrkur ? styrkur.mgG : null,
  };
}
```

- [ ] **Step 4: Keyra og sjá standast**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt && node --test skriptur/lib/nikotinpudar.test.mjs`
Expected: `# pass 8`, `# fail 0`

- [ ] **Step 5: Skrifa talningarskriptuna**

```js
#!/usr/bin/env node
// saekja_nikotinpuda.mjs — telur nikótínpúða á hillu Svens eftir UPPGEFNUM styrk (mg/g).
//
// Fyrir /furduhagfraedi/#nikotingjald. Tala sem enginn getur endurtekið er minning, ekki mæling
// (sama regla og maela_verdmat.mjs). Keyrð í höndunum, EKKI í cron.
//
//   node skriptur/saekja_nikotinpuda.mjs      → gogn/nikotinpudar.json   (~8 mín, 1 s bil)
//
// ⚠ Einn vefsali. Talan lýsir hillu Svens á tilteknum degi, ekki landinu, og síðan segir það.
// ⚠ Ein beiðni í einu með 1 s bili. Svens er lítil verslun, ekki API.
// ⚠ Hættir með villu ef meira en 10% síðna mistakast: hálf talning má ekki líta út eins og heil.
import { writeFileSync } from 'node:fs';
import { thattaSitemap, thattaVoru } from './lib/nikotinpudar.mjs';

const SITEMAP = 'https://svens.is/product-sitemap.xml';
const BIL_MS = 1000;
const HAUS = { 'user-agent': 'Mozilla/5.0 (Karp furduhagfraedi; aron@karp.is)' };
const bida = (ms) => new Promise((r) => setTimeout(r, ms));

const svar = await fetch(SITEMAP, { headers: HAUS });
if (!svar.ok) { console.error(`Veftré svaraði ${svar.status}`); process.exit(1); }
const slodir = thattaSitemap(await svar.text());
if (!slodir.length) { console.error('Engar vörur í veftré. Breyttist sniðið?'); process.exit(1); }

const vorur = []; const othattad = []; const villur = [];
for (const [i, slod] of slodir.entries()) {
  try {
    const r = await fetch(slod, { headers: HAUS });
    if (!r.ok) villur.push({ slod, status: r.status });
    else {
      const v = thattaVoru(await r.text(), slod);
      if (v.strengur != null && v.mgG == null) othattad.push({ nafn: v.nafn, slod, strengur: v.strengur });
      else if (v.mgG != null) vorur.push(v);
    }
  } catch (e) {
    villur.push({ slod, villa: String(e.message || e) });
  }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${slodir.length}: ${vorur.length} púðar með styrk`);
  await bida(BIL_MS);
}

const dags = new Date().toISOString().slice(0, 10);
const ut = { dags, heimild: 'svens.is', slodir: slodir.length, n: vorur.length, othattad, villur, vorur };
writeFileSync(new URL('../gogn/nikotinpudar.json', import.meta.url), JSON.stringify(ut, null, 1) + '\n');
console.log(`${dags}: ${vorur.length} púðar með styrk, ${othattad.length} á öðru sniði, ${villur.length} villur af ${slodir.length} síðum.`);
if (villur.length > slodir.length * 0.1) { console.error('⚠ Yfir 10% villur. Talningin er EKKI marktæk.'); process.exit(1); }
```

- [ ] **Step 6: Keyra talninguna (í bakgrunni, ~8 mín)**

Run (Bash, `run_in_background: true`): `cd /c/Users/aronh/dev/KARP/_gc3-wt && node skriptur/saekja_nikotinpuda.mjs > /c/Users/aronh/AppData/Local/Temp/claude/C--Users-aronh-OneDrive-Documents-KARP/5d1f89c0-a956-4dcd-a5f8-bdfa0ae9606a/scratchpad/pudar.log 2>&1; echo "exit $?" >> /c/Users/aronh/AppData/Local/Temp/claude/C--Users-aronh-OneDrive-Documents-KARP/5d1f89c0-a956-4dcd-a5f8-bdfa0ae9606a/scratchpad/pudar.log`
Expected: síðasta lína `exit 0`, línan á undan `2026-09-21: N púðar með styrk …` með N á bilinu 60–150.

- [ ] **Step 7: Bera saman við fyrri talningu**

Run:
```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt/web && node --input-type=module -e "
import P from '../gogn/nikotinpudar.json' with { type: 'json' };
import { hillutalning, aThrepamorkum, rettYfirThrepi } from './src/lib/furdu-ungt.mjs';
console.log('n', P.n, 'othattad', P.othattad.length, 'villur', P.villur.length);
console.log('hilla', hillutalning(P.vorur).slice(0, 6));
console.log('a morkum', aThrepamorkum(P.vorur));
const y = rettYfirThrepi(P.vorur)[0]; console.log('yfir', y && { mgG: y.mgG, n: y.n, dosG: y.dosG, verd: y.verd, aukagjald: y.aukagjald.toFixed(1) });"
```
Expected (21.9 fyrri talning): n ≈ 83; 15 og 20 mg/g efst (19 hvor); 16,5 mg/g hópur með 9, dós 14 g, aukagjald ≈ 72,8. Víki tölurnar frá: nýja talningin gildir (síða og myndband reikna úr skránni). Skráðu frávikið í commit-skilaboðin.

- [ ] **Step 8: CI-prófasafnið fyrir skriptur**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt && node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs 2>&1 | tail -4`
Expected: `# fail 0`

- [ ] **Step 9: Commit**

```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt && git add skriptur/lib/nikotinpudar.mjs skriptur/lib/nikotinpudar.test.mjs skriptur/saekja_nikotinpuda.mjs gogn/nikotinpudar.json && git commit -q -F - <<'EOF'
furduhagfraedi: endurkeyranleg talning nikotinpuda hja Svens

skriptur/saekja_nikotinpuda.mjs les veftre Svens, styrk ur toflu hverrar voru (td i badum
dalkum) og skrifar gogn/nikotinpudar.json. Annad snid a styrk er talid ser, aldrei giskad.
Haettir med villu yfir 10% misheppnadra sidna svo halft skrap liti ekki ut sem heilt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Ritstýrðu gögnin

**Files:**
- Create: `web/src/data/furdu-ungt.json`
- Test: `web/test/furdu-ungt-gogn.test.mjs`

**Interfaces:**
- Produces: JSON sem Task 4 og 7 lesa. Lyklar: `athugad`, `nikotin{heimild, slod, vindlingar{gjaldPakki, stk, heimild}, pudiDaemi{g, mgG}}`, `koffin{verdHeimild, drykkir[{id, heiti, verd, mg, dags, athugasemd}], kaffi{heiti, vara, pakkiVerd, pakkiG, dags, gBolli, mgBolli, athugasemd}, islatte{heiti, verd, dags, heimild, skot, mgSkot, athugasemd}}`, `laun{heimild, gildir, taxti16, taxti17, byrjun, lifeyrir, personuafslattur, skattur1, skatturHeimild}`, `utborgun{pn, stadur, teg, hlutfall, heimild}`, `dosin{skilagjald, gildirFra, lagaFjarhaed, heimild, ar2024{aMarkad, skilad, gjald, heimild}}`.

- [ ] **Step 1: Skrifa prófið** (engin tala án dagsetningar og heimildar)

```js
// web/test/furdu-ungt-gogn.test.mjs
// ⚠ Engin tala fer á síðuna án dagsetningar og heimildar. Numbeo-skrapið lá dautt í þrjár vikur án
// þess að nokkur tæki eftir því; tala sem segir hvenær hún var athuguð getur ekki úrelst í þögn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const U = JSON.parse(readFileSync(new URL('../src/data/furdu-ungt.json', import.meta.url), 'utf8'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

test('hver drykkur ber verð, koffín og dagsetningu', () => {
  assert.ok(U.koffin.verdHeimild);
  for (const d of U.koffin.drykkir) {
    assert.ok(d.verd > 0 && d.mg > 0, d.id);
    assert.match(d.dags, ISO, d.id);
    assert.ok(d.athugasemd, d.id);
  }
  assert.ok(U.koffin.drykkir.some((d) => d.id === 'nocco'), 'Nocco knýr þrjár greinar');
});

test('kaffið: forsendan um g og mg í bolla stendur upphátt', () => {
  const k = U.koffin.kaffi;
  assert.ok(k.pakkiVerd > 0 && k.pakkiG > 0 && k.gBolli > 0 && k.mgBolli > 0);
  assert.match(k.dags, ISO); assert.match(k.athugasemd, /EFSA/);
});

test('íslatte: verð aðeins MEÐ dagsetningu og heimild', () => {
  const i = U.koffin.islatte;
  assert.ok(i.skot > 0 && i.mgSkot > 0);
  if (i.verd != null) { assert.ok(i.verd > 0); assert.match(i.dags, ISO); assert.ok(i.heimild); }
});

test('laun, útborgun og dósin bera heimild', () => {
  assert.match(U.laun.gildir, ISO); assert.ok(U.laun.heimild && U.laun.skatturHeimild);
  assert.equal(U.utborgun.hlutfall, 0.10, 'fyrstu kaupendur: 90% veðsetning frá lokum okt. 2025');
  assert.ok(U.utborgun.heimild);
  assert.ok(U.dosin.heimild && U.dosin.ar2024.heimild);
  assert.equal(U.dosin.skilagjald, 23);
});

test('nikótínið vísar í lagagreinina', () => {
  assert.match(U.nikotin.heimild, /96\/1995/);
  assert.match(U.nikotin.heimild, /99\/2025, 4\. gr\./);
});
```

- [ ] **Step 2: Keyra og sjá falla**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && node --test test/furdu-ungt-gogn.test.mjs`
Expected: FAIL, `ENOENT … furdu-ungt.json`

- [ ] **Step 3: Skrifa gögnin**

```json
{
  "athugad": "2026-09-21",
  "nikotin": {
    "heimild": "Lög nr. 96/1995, 10. gr. d. Fjárhæðir skv. lögum nr. 99/2025, 4. gr.",
    "slod": "https://www.althingi.is/lagas/nuna/1995096.html",
    "vindlingar": { "gjaldPakki": 806.70, "stk": 20, "heimild": "Lög nr. 96/1995, 10. gr. Fjárhæð skv. lögum nr. 99/2025, 3. gr." },
    "pudiDaemi": { "g": 0.7, "mgG": 12 }
  },
  "koffin": {
    "verdHeimild": "Neytandinn (verð af kassastrimlum notenda), Bónus",
    "drykkir": [
      { "id": "nocco", "heiti": "Nocco 330 ml", "verd": 304, "mg": 105, "dags": "2026-08-31", "athugasemd": "íslenska útgáfan, 105 mg í dós" },
      { "id": "redbull", "heiti": "Red Bull 250 ml", "verd": 233, "mg": 80, "dags": "2026-09-06", "athugasemd": "32 mg í 100 ml samkvæmt umbúðum" },
      { "id": "monster", "heiti": "Monster Ultra 500 ml", "verd": 249, "mg": 150, "dags": "2026-09-13", "athugasemd": "30 mg í 100 ml samkvæmt evrópskum umbúðum" }
    ],
    "kaffi": { "heiti": "Uppáhellt kaffi", "vara": "Merrild 103, 500 g", "pakkiVerd": 1298, "pakkiG": 500, "dags": "2026-09-09", "gBolli": 8, "mgBolli": 90, "athugasemd": "8 g í bolla; 90 mg koffín í 200 ml bolla er viðmið EFSA" },
    "islatte": { "heiti": "Íslatte, Te & Kaffi", "verd": null, "dags": null, "heimild": null, "skot": 2, "mgSkot": 63, "athugasemd": "tvö espressóskot, 63 mg í skoti (USDA)" }
  },
  "laun": {
    "heimild": "kjarasamnings VR og SA, afgreiðslufólk í verslunum",
    "gildir": "2026-04-01",
    "taxti16": 2410.52,
    "taxti17": 2554.00,
    "byrjun": 2869.67,
    "lifeyrir": 0.04,
    "personuafslattur": 72492,
    "skattur1": 0.3149,
    "skatturHeimild": "Persónuafsláttur 2026 og 1. skattþrep, 16,55% auk meðalútsvars 14,94%"
  },
  "utborgun": {
    "pn": "230",
    "stadur": "Reykjanesbæ",
    "teg": "Fjölbýli",
    "hlutfall": 0.10,
    "heimild": "Seðlabanki Íslands, hámark veðsetningarhlutfalls fyrstu kaupenda 90% frá lokum október 2025"
  },
  "dosin": {
    "skilagjald": 23,
    "gildirFra": "2026-03-01",
    "lagaFjarhaed": 20.73,
    "heimild": "Skilagjald 23 kr frá mars 2026 (20,73 kr án vsk, lög nr. 52/1989, 1. gr., skv. lögum nr. 99/2025, 43. gr.).",
    "ar2024": { "aMarkad": 240000000, "skilad": 211000000, "gjald": 20, "heimild": "Endurvinnslan, mbl.is 4.3.2025" }
  }
}
```

- [ ] **Step 4: Keyra og sjá standast**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && node --test test/furdu-ungt-gogn.test.mjs`
Expected: `# pass 5`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt && git add web/src/data/furdu-ungt.json web/test/furdu-ungt-gogn.test.mjs && git commit -q -F - <<'EOF'
furduhagfraedi: ritstyrd, dagsett gogn med heimild fyrir greinarnar fimm

Proffid hafnar tolu an dagsetningar og heimildar. Islatteverdid er null: Te & Kaffi birtir ekki
verd kaffihusanna a vefnum og Aron stadfestir thad. Skilagjaldid er 23 kr til neytanda
(20,73 an vsk skv. l. 99/2025, 43. gr.), ekki 20,73 eins og stod fyrst i spekkinu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Síðan — fimm hlutar

**Files:**
- Modify: `web/src/pages/furduhagfraedi.astro` (frontmatter eftir línu 31; markup milli `{RACE && (…)}` og `<p class="note">`; `<style>`)

**Interfaces:**
- Consumes: öll föll úr Task 1; `web/src/data/furdu-ungt.json` (Task 3); `gogn/nikotinpudar.json` (Task 2); `web/public/gogn/fasteignaskra/230.json` (til; uppfært af refresh-data).

- [ ] **Step 1: Frontmatter.** Breyta innflutningslínu format.mjs í `import { fmtNum, groupThousands, MON_LONG } from '@lib/format.mjs';`. Innflutningarnir hér að neðan fara í innflutningsblokkina EFST (á eftir `import DATA …`); afgangurinn á eftir `const desc = …`:

```js
// ── Unga kynslóðin (21.9.2026). Stærðfræðin býr í lib/furdu-ungt.mjs; hér er aðeins framsetning.
import UNGT from '../data/furdu-ungt.json';
import PUDAR from '@gogn/nikotinpudar.json';
import SOLUR230 from '../../public/gogn/fasteignaskra/230.json';
import {
  NIKOTIN_THREP, gjaldPerGramm, sagartonn, hillutalning, aThrepamorkum, rettYfirThrepi, koffinKrona,
  kaffibolli, nettoAnSkatts, skattleysismork, minutur, midgildiSolu, islattarIUtborgun,
  skilagjaldHlutfall, oskilad,
} from '../lib/furdu-ungt.mjs';

const pro = (x, d = 1) => fmtNum(x * 100, d) + '%';
const dagsIs = (iso) => { const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; };
const manudur = (ym) => { const [y, m] = ym.split('-'); return `${MON_LONG[+m - 1]} ${y}`; };
const mg = (v) => fmtNum(v, v % 1 ? 1 : 0);
const nocco = UNGT.koffin.drykkir.find((d) => d.id === 'nocco');

// 1. Nikótíngjaldið: sagartönnin sem SVG, reiknuð við byggingu (ekkert JS).
const TONN = (() => {
  const B = 720, HH = 300, ml = 52, mr = 14, mt = 14, mb = 34;
  const X = (v) => ml + ((v - 4) / 16) * (B - ml - mr);
  const Y = (v) => mt + (1 - v / 2.2) * (HH - mt - mb);
  return {
    B, HH, x0: ml, x1: B - mr, y0: mt, y1: HH - mb,
    lina: sagartonn({ fra: 4, til: 20 }).map((q, i) => `${i ? 'L' : 'M'}${X(q.mgG).toFixed(1)} ${Y(q.krMg).toFixed(1)}`).join(' '),
    y: [0.5, 1, 1.5, 2].map((v) => ({ y: Y(v), t: fmtNum(v, 1) })),
    x: [4, 8, 12, 16, 20].map((v) => ({ x: X(v), t: String(v) })),
    mork: [8, 12, 16].map(X),
  };
})();
const HILLA = hillutalning(PUDAR.vorur).slice(0, 5);
const A_MORKUM = aThrepamorkum(PUDAR.vorur);
const YFIR = rettYfirThrepi(PUDAR.vorur)[0] || null;
const VINDL = UNGT.nikotin.vindlingar;
const PUDI = UNGT.nikotin.pudiDaemi;

// 2. Koffínkrónan. Íslattinn bætist við þegar verðið er staðfest.
const KB = kaffibolli(UNGT.koffin.kaffi);
const ISL = UNGT.koffin.islatte;
const KOFFIN = [
  ...UNGT.koffin.drykkir.map((d) => ({ heiti: d.heiti, kr: koffinKrona(d.verd, d.mg), skyring: `${d.verd} kr, ${d.mg} mg (${d.athugasemd}), ${dagsIs(d.dags)}` })),
  { heiti: UNGT.koffin.kaffi.heiti, kr: koffinKrona(KB, UNGT.koffin.kaffi.mgBolli), kaffi: true,
    skyring: `${UNGT.koffin.kaffi.vara} á ${groupThousands(UNGT.koffin.kaffi.pakkiVerd)} kr, ${dagsIs(UNGT.koffin.kaffi.dags)}. ${UNGT.koffin.kaffi.athugasemd}` },
  ...(ISL.verd != null ? [{ heiti: ISL.heiti, kr: koffinKrona(ISL.verd, ISL.skot * ISL.mgSkot), skyring: `${groupThousands(ISL.verd)} kr, ${ISL.heimild}, ${dagsIs(ISL.dags)}. ${ISL.athugasemd}` }] : []),
].sort((a, b) => b.kr - a.kr);
const KMAX = KOFFIN[0].kr;
const KOFFIN_MARGF = Math.floor(koffinKrona(nocco.verd, nocco.mg) / koffinKrona(KB, UNGT.koffin.kaffi.mgBolli));

// 3. Íslattar í útborgun: 12 heilir mánuðir á undan byggingarmánuði.
const SALA = midgildiSolu(SOLUR230, { teg: UNGT.utborgun.teg, nu: new Date().toISOString().slice(0, 7) });
const ISLATTAR = ISL.verd != null && SALA.midgildi
  ? islattarIUtborgun({ verdIbudar: SALA.midgildi, hlutfall: UNGT.utborgun.hlutfall, islatteVerd: ISL.verd }) : null;

// 4. Nocco í vinnutíma.
const LA = UNGT.laun;
const T16 = nettoAnSkatts(LA.taxti16, LA.lifeyrir);
const M16 = minutur(nocco.verd, T16);
const MMED = hourly ? minutur(nocco.verd, hourly) : null;
const MMAX = Math.max(M16, MMED || 0);
const KLST_MAN = (30 * nocco.verd) / T16;
const SKATTLAUST = skattleysismork(LA);

// 5. Dósin.
const DOS = UNGT.dosin;
const DOS_HL = skilagjaldHlutfall(DOS.skilagjald, nocco.verd);
const OSK = oskilad(DOS.ar2024);
```

- [ ] **Step 2: Markup.** Setja á milli lokunar `{RACE && (…)}` og `<p class="note">`:

```astro
    <h2 id="unga-kynslodin">Unga kynslóðin</h2>
    <nav class="fu-nav" aria-label="Greinar um unga kynslóðina">
      <a href="#nikotingjald">Nikótíngjaldið</a>
      <a href="#koffinkrona">Koffínkrónan</a>
      {ISLATTAR && <a href="#islattar">Íslattar í útborgun</a>}
      <a href="#nocco-vinnutimi">Nocco í vinnutíma</a>
      <a href="#dosin">Dósin</a>
    </nav>

    <section class="fu" id="nikotingjald">
      <h3>Þrepin í nikótíngjaldinu</h3>
      <p>Gjaldið á nikótínpúðum fer eftir styrk, í fjórum þrepum. Reiknað á hvert milligramm nikótíns verður það sagartönn: ódýrast á þaki hvers þreps og stökk rétt fyrir ofan. Frá 8,0 í 8,1 mg/g hækkar gjaldið um 50% fyrir 1,25% meira nikótín.</p>
      <table class="fu-tafla">
        <thead><tr><th>Styrkur</th><th>Gjald á gramm</th></tr></thead>
        <tbody>{NIKOTIN_THREP.map((t) => <tr><td>{mg(t.fra)} til {mg(t.til)} mg/g</td><td>{fmtNum(t.krG, 2)} kr</td></tr>)}</tbody>
      </table>
      <figure class="fu-graf">
        <svg viewBox={`0 0 ${TONN.B} ${TONN.HH}`} role="img" aria-label="Gjald á hvert milligramm nikótíns eftir styrk, 4 til 20 mg/g">
          {TONN.y.map((g) => <g><line class="grid" x1={TONN.x0} x2={TONN.x1} y1={g.y} y2={g.y} /><text class="lbl" x={TONN.x0 - 8} y={g.y + 4} text-anchor="end">{g.t}</text></g>)}
          {TONN.mork.map((x) => <line class="mork" x1={x} x2={x} y1={TONN.y0} y2={TONN.y1} />)}
          {TONN.x.map((g) => <text class="lbl" x={g.x} y={TONN.HH - 10} text-anchor="middle">{g.t}</text>)}
          <path class="lina" d={TONN.lina} />
        </svg>
        <figcaption>Gjald á hvert mg nikótíns í krónum eftir styrk púðans í mg/g. Undir 4 mg/g hækkar það enn: 8,30 kr á 1 mg/g.</figcaption>
      </figure>
      <p><strong>Á hillunni.</strong> Við töldum {PUDAR.n} púða með uppgefinn styrk hjá Svens {dagsIs(PUDAR.dags)}. Algengustu styrkirnir: {HILLA.map((h) => `${mg(h.mgG)} mg/g (${h.n})`).join(', ')}.</p>
      <p>Tilgátan var að framleiðendur röðuðu sér á þrepamörkin, 8, 12 og 16 mg/g. Þar sitja {A_MORKUM} af {PUDAR.n}. Líklegasta skýringin er að púðarnir eru hannaðir fyrir Svíþjóð, ekki íslensku þrepin.</p>
      {YFIR && <div class="fu-lykill"><b>{groupThousands(YFIR.aukagjald)} kr meira á dós.</b> {YFIR.n} púðar sitja á {mg(YFIR.mgG)} mg/g, {fmtNum(YFIR.mgG - YFIR.thak, 1)} mg yfir þrepi. Á {mg(YFIR.dosG)} g dós bera þeir {groupThousands(YFIR.gjald)} kr í gjald en bæru {groupThousands(YFIR.gjaldAThaki)} kr á {YFIR.thak} mg/g, fyrir {pro(YFIR.aukaNikotin, 0)} meira nikótín. Gjaldið eitt er {pro(YFIR.hlutfallAfVerdi, 0)} af verðinu.</div>}
      <p class="fu-smatt">Til samanburðar er gjaldið á einn vindling {fmtNum(VINDL.gjaldPakki / VINDL.stk, 2)} kr ({fmtNum(VINDL.gjaldPakki, 2)} kr á {VINDL.stk} stk. pakka) en {fmtNum(gjaldPerGramm(PUDI.mgG) * PUDI.g, 2)} kr á einn {fmtNum(PUDI.g, 1)} g púða á {PUDI.mgG} mg/g. Ein eining er ekki sami skammtur, svo samanburðurinn segir meira um gjaldið en neysluna.</p>
      <p class="fu-heimild">Heimild: {UNGT.nikotin.heimild} Gjaldið leggst á uppgefinn styrk á umbúðum. Talning: svens.is {dagsIs(PUDAR.dags)}, einn vefsali. Endurkeyranleg með skriptur/saekja_nikotinpuda.mjs.</p>
    </section>

    <section class="fu" id="koffinkrona">
      <h3>Koffínkrónan</h3>
      <p>Hvað kosta 100 mg af koffíni? Í Nocco er koffínið rúmlega {KOFFIN_MARGF} sinnum dýrara en í uppáhelltu kaffi heima.</p>
      <div class="fu-sulur">
        {KOFFIN.map((k) => (
          <div class="fu-rod">
            <span class="fu-heiti">{k.heiti}</span>
            <span class="fu-sula"><span class={k.kaffi ? 'fylling graent' : 'fylling'} style={`width:${Math.max(2, (k.kr / KMAX) * 100).toFixed(1)}%`}></span></span>
            <span class="fu-gildi">{groupThousands(k.kr)} kr</span>
          </div>
        ))}
      </div>
      <ul class="fu-forsendur">{KOFFIN.map((k) => <li><b>{k.heiti}:</b> {k.skyring}</li>)}</ul>
      <p class="fu-heimild">Verð: {UNGT.koffin.verdHeimild}. Ein verslun og ein heimild fyrir alla drykki svo samanburðurinn sé sanngjarn.</p>
    </section>

    {ISLATTAR && (
      <section class="fu" id="islattar">
        <h3>Íslattar í útborgun</h3>
        <p>Miðgildi kaupverðs fjölbýlis í {UNGT.utborgun.pn} {UNGT.utborgun.stadur} frá {manudur(SALA.fra)} til {manudur(SALA.til)} var {groupThousands(SALA.midgildi)} kr ({SALA.n} sölur). Fyrstu kaupendur mega fá 90% lán, svo útborgunin er 10%: {groupThousands(ISLATTAR.utborgun)} kr.</p>
        <div class="fu-lykill"><b>{groupThousands(ISLATTAR.fjoldi)} íslattar.</b> Einn á dag í {fmtNum(ISLATTAR.arMedEinumADag, 1)} ár.</div>
        <p class="fu-heimild">Íslatte: {ISL.heiti}, {groupThousands(ISL.verd)} kr ({ISL.heimild}, {dagsIs(ISL.dags)}). Kaupverð: HMS kaupskrá, síðasta þinglýsta sala hverrar eignar. {UNGT.utborgun.heimild}.</p>
      </section>
    )}

    <section class="fu" id="nocco-vinnutimi">
      <h3>Nocco í vinnutíma</h3>
      <p>Sextán ára afgreiðslumaður í verslun vinnur í {fmtNum(M16, 1)} mínútur fyrir einni Nocco. Nocco á dag í mánuð kostar hann {fmtNum(KLST_MAN, 1)} vinnustundir.</p>
      <div class="fu-sulur">
        <div class="fu-rod"><span class="fu-heiti">16 ára, afgreiðsla</span><span class="fu-sula"><span class="fylling" style={`width:${((M16 / MMAX) * 100).toFixed(1)}%`}></span></span><span class="fu-gildi">{fmtNum(M16, 1)} mín</span></div>
        {MMED && <div class="fu-rod"><span class="fu-heiti">Meðallaun</span><span class="fu-sula"><span class="fylling grar" style={`width:${((MMED / MMAX) * 100).toFixed(1)}%`}></span></span><span class="fu-gildi">{fmtNum(MMED, 1)} mín</span></div>}
      </div>
      <p class="fu-heimild">Taxti {LA.heimild}: {fmtNum(LA.taxti16, 2)} kr á klst. fyrir 16 ára frá {dagsIs(LA.gildir)}. Í hlutastarfi undir {groupThousands(SKATTLAUST)} kr á mánuði greiðist enginn tekjuskattur, aðeins {pro(LA.lifeyrir, 0)} í lífeyrissjóð, svo eftir standa {fmtNum(T16, 0)} kr á klst. Félagsgjald stéttarfélags er ekki dregið frá. Skatthlutfall barna, 6%, á aðeins við um þau sem fædd eru 2011 eða síðar. {LA.skatturHeimild}. Meðallaun: Numbeo, {wage ? groupThousands(wage) : ''} kr á mánuði eftir skatt, 160 stundir. Nocco {nocco.verd} kr í Bónus {dagsIs(nocco.dags)}.</p>
    </section>

    <section class="fu" id="dosin">
      <h3>Dósin</h3>
      <p>{DOS.skilagjald} krónur af hverri Nocco eru skilagjald, {pro(DOS_HL, 1)} af verðinu. Þær færðu aftur ef þú skilar dósinni.</p>
      <div class="fu-lykill"><b>Um {groupThousands(OSK.kr / 1e6)} milljónir króna</b> í skilagjaldi voru aldrei sóttar árið 2024. Um {groupThousands(DOS.ar2024.aMarkad / 1e6)} milljónir umbúða fóru á markað og {groupThousands(DOS.ar2024.skilad / 1e6)} milljónir skiluðu sér ({pro(OSK.skilahlutfall, 0)}). {groupThousands(OSK.n / 1e6)} milljónir gerðu það ekki, á {DOS.ar2024.gjald} kr stykkið.</div>
      <p class="fu-heimild">{DOS.heimild} Tölur 2024: {DOS.ar2024.heimild}. Lög nr. 52/1989, 2. gr. heimila að skilagjald óskilaðra umbúða renni til Endurvinnslunnar.</p>
    </section>
```

- [ ] **Step 3: Stílar.** Bæta aftast í `<style>`:

```css
    h3 { font-size: 19px; margin: 0 0 8px; }
    .fu { margin: 24px 0 0; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.08); scroll-margin-top: 80px; }
    .fu-nav { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13.5px; margin: 6px 0 2px; }
    .fu-nav a { color: var(--gold); text-decoration: none; }
    .fu-tafla { border-collapse: collapse; font-size: 13.5px; margin: 10px 0; }
    .fu-tafla th, .fu-tafla td { text-align: left; padding: 5px 16px 5px 0; border-bottom: 1px solid rgba(255,255,255,.08); font-variant-numeric: tabular-nums; }
    .fu-tafla th { font-size: 11.5px; color: var(--faint); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .fu-graf { margin: 12px 0; }
    .fu-graf svg { width: 100%; height: auto; display: block; }
    .fu-graf .grid { stroke: rgba(255,255,255,.08); stroke-width: 1; }
    .fu-graf .mork { stroke: rgba(255,255,255,.2); stroke-dasharray: 4 4; }
    .fu-graf .lbl { fill: var(--faint); font-size: 11px; }
    .fu-graf .lina { fill: none; stroke: var(--gold); stroke-width: 2.4; stroke-linejoin: round; }
    .fu-graf figcaption { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .fu-lykill { font-size: 14px; background: rgba(246,177,59,.07); border: 1px solid rgba(246,177,59,.28); border-radius: 10px; padding: 11px 14px; margin: 12px 0; line-height: 1.55; }
    .fu-lykill b { color: var(--gold); }
    .fu-sulur { display: grid; gap: 7px; margin: 12px 0; }
    .fu-rod { display: grid; grid-template-columns: minmax(110px, 190px) 1fr 72px; gap: 10px; align-items: center; font-size: 13px; }
    .fu-sula { background: rgba(255,255,255,.05); border-radius: 6px; height: 14px; overflow: hidden; }
    .fu-sula .fylling { display: block; height: 100%; background: var(--gold); border-radius: 6px; }
    .fu-sula .fylling.graent { background: #46e08a; }
    .fu-sula .fylling.grar { background: #9fb0c8; }
    .fu-gildi { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
    .fu-forsendur { font-size: 12px; color: var(--muted); padding-left: 18px; margin: 6px 0; }
    .fu-smatt { font-size: 13px; color: var(--muted); }
    .fu-heimild { font-size: 11.5px; color: var(--faint); margin-top: 8px; }
```

- [ ] **Step 4: Lýsing.** Í `const desc = …` bæta við á undan lokagæsalöppinni: ` Og unga kynslóðin: nikótíngjaldið, koffínkrónan, Nocco í vinnutíma og dósin.`

- [ ] **Step 5: Byggja**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt/web && ([ -x node_modules/.bin/astro ] || npm ci) && npm run build 2>&1 | tail -5`
Expected: `Complete!` og engin villa. (⚠ Brotni `.bin/astro`: `npm install`.)

- [ ] **Step 6: Sannreyna byggða HTML-ið**

Run:
```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt/web && f=dist/furduhagfraedi/index.html && for a in nikotingjald koffinkrona nocco-vinnutimi dosin unga-kynslodin; do printf "%s " "$a"; grep -c "id=\"$a\"" $f; done; grep -c 'id="islattar"' $f; grep -o '[0-9.]* kr meira á dós' $f; grep -o 'rúmlega [0-9]* sinnum' $f; grep -o '[0-9],[0-9] mínútur' $f; grep -o 'Um [0-9.]* milljónir króna' $f; sed -n '/id="unga-kynslodin"/,/class="note"/p' $f | grep -c -P '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]'
```
Expected: 1 fyrir hvert akkeri nema `islattar` = 0 (íslatteverð null); `73 kr meira á dós` (eða tala nýrrar talningar); `rúmlega 12 sinnum`; `7,9 mínútur`; `Um 580 milljónir króna`; emojí í nýju hlutunum 0 (aðeins þeir taldir: valmynd síðunnar ber ✕, sem er vísvitandi undantekning).

- [ ] **Step 7: Skoða í vafra, bæði breiddum.** Bæta við `C:\Users\aronh\OneDrive\Documents\KARP\.claude\launch.json` stillingu `{"name":"gc3-dist","runtimeExecutable":"python","runtimeArgs":["-m","http.server","4412","--directory","C:/Users/aronh/dev/KARP/_gc3-wt/web/dist"],"port":4412}`, ræsa með `preview_start {name:"gc3-dist"}`, fara á `/furduhagfraedi/#nikotingjald`, skjámynd; `resize_window {preset:"mobile"}`, skjámynd af `#koffinkrona`; `resize_window {preset:"desktop"}`. Athuga: sagartönnin sýnir fjórar tennur, súlurnar lesast, engin lárétt skrun á 375 px.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/aronh/dev/KARP/_gc3-wt && git add web/src/pages/furduhagfraedi.astro && git commit -q -F - <<'EOF'
furduhagfraedi: fimm greinar um unga kynslodina

Nikotingjaldid (sagartonn sem SVG vid byggingu, ekkert JS), koffinkronan, Nocco i vinnutima og
dosin. Islattar i utborgun birtast thegar islatteverdid er stadfest. Oll staerdfraedin i
lib/furdu-ungt.mjs; sidan setur adeins fram.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Deploy og sannreyna í loftinu

- [ ] **Step 1: Ýta**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt && git fetch -q origin main && git rebase -q origin/main && git push -q origin HEAD:main && git log --oneline -1`

- [ ] **Step 2: CI grænt**

Run: `cd /c/Users/aronh/dev/KARP/_gc3-wt && sleep 5; gh run list --limit 4 --json name,status,conclusion,headSha --jq '.[] | "\(.name) \(.status) \(.conclusion) \(.headSha[0:8])"'`
Expected: ci.yml á nýja SHA endar `completed success`. Ef rautt: `gh run view <id> --log-failed`, laga, nýtt commit.

- [ ] **Step 3: Síðan í loftinu** (Workers Builds, ~3–6 mín)

Run: `for i in $(seq 1 20); do n=$(curl -s "https://karp.is/furduhagfraedi/?v=$RANDOM" | grep -c 'id="nikotingjald"'); [ "$n" = 1 ] && { echo LIVE; break; }; sleep 30; done`
Expected: `LIVE`. Svo `get_page_text` á `https://karp.is/furduhagfraedi/` í vafranum og lesa hlutana fimm.

---

### Task 6: Varanlega myndbandseiningin (utan repo)

**Files (allt í `C:\Users\aronh\dev\KARP\markadsefni\myndband\`):**
- Create: `package.json`, `karp-myndband.cjs`, `karp-myndband.test.cjs`, `LESTU-MIG.md`

**Interfaces:**
- Produces: `W, H, FPS, LENGD_S, LITIR, skraLetur, klippaEmoji, hreinsaTakn, maelaTexta, passaStaerd, teiknaTexta, brjota, rr, klemma, mjukt, bil, bakgrunnur, haus, fotur, sena(ctx, sek, u), linurit(ctx, pts, p, box, opt), sulurit(ctx, radir, p, box, opt), skrifaPng(slod, teikna, sek), skrifaMp4(slod, teikna, opt)`. `u` = `{ kafli?, fyrirsogn, undirfyrirsogn?, graf(ctx, p, sek, box), lykiltala, lykiltexti, slod }`. `box` = `{ x, y, w, h }`. ALLUR texti strengir.

- [ ] **Step 1: package.json og uppsetning**

```json
{
  "name": "karp-myndband",
  "private": true,
  "description": "Hjálpareining fyrir grafmyndbönd Karp. Sjá LESTU-MIG.md.",
  "scripts": { "test": "node --test karp-myndband.test.cjs" },
  "dependencies": { "@napi-rs/canvas": "^0.1.65", "h264-mp4-encoder": "^1.0.12" }
}
```

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/myndband && npm install 2>&1 | tail -3`
Expected: `added N packages`, engin villa.

- [ ] **Step 2: Skrifa prófin**

```js
// karp-myndband.test.cjs — hver gildra úr fyrri lotum á sitt próf.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const K = require('./karp-myndband.cjs');

test('klippaEmoji skilur emoji frá texta (Skia fellur ekki til baka mitt í streng)', () => {
  assert.deepEqual(K.klippaEmoji('Já ✔ nei'), [
    { t: 'Já ', emoji: false }, { t: '✔', emoji: true }, { t: ' nei', emoji: false },
  ]);
});

test('✓ U+2713 verður ✔ U+2714: ✓ vantar í seguiemj.ttf og verður tofu', () => {
  assert.equal(K.hreinsaTakn('✓ lokið'), '✔ lokið');
});

test('teiknaTexta hafnar tölum: 1.708,5 varð „1.709,5" gegnum toLocaleString', () => {
  K.skraLetur();
  const ctx = createCanvas(50, 50).getContext('2d');
  assert.throws(() => K.teiknaTexta(ctx, 1708.5, 0, 0), TypeError);
});

test('passaStaerd minnkar letur þar til textinn passar', () => {
  K.skraLetur();
  const ctx = createCanvas(50, 50).getContext('2d');
  const s = K.passaStaerd(ctx, 'karp.is/furduhagfraedi/#nocco-vinnutimi', 900, 50, true);
  assert.ok(s <= 50 && K.maelaTexta(ctx, 'karp.is/furduhagfraedi/#nocco-vinnutimi', s, true) <= 900);
});

test('bil og mjukt', () => {
  assert.equal(K.bil(5, 0, 10), 0.5);
  assert.equal(K.bil(-1, 0, 10), 0);
  assert.equal(K.mjukt(1), 1);
});

test('skrifaMp4 skrifar raunverulega mp4 (ftyp-kassi)', async () => {
  const slod = path.join(os.tmpdir(), 'karp-myndband-prof.mp4');
  const r = await K.skrifaMp4(slod, (ctx, sek) => { ctx.fillStyle = sek < 0.5 ? '#000' : '#fff'; ctx.fillRect(0, 0, 64, 64); },
    { lengd: 1, breidd: 64, haed: 64, lagmark: 100 });
  assert.equal(r.rammar, 30);
  assert.equal(fs.readFileSync(slod).subarray(4, 8).toString(), 'ftyp');
});

test('skrifaMp4 kastar ef skráin verður of lítil: hrun má ekki líta út sem árangur', async () => {
  const slod = path.join(os.tmpdir(), 'karp-myndband-litid.mp4');
  await assert.rejects(K.skrifaMp4(slod, () => {}, { lengd: 0.1, breidd: 16, haed: 16, lagmark: 1e9 }), /encode mistókst/);
});
```

- [ ] **Step 3: Keyra og sjá falla**

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/myndband && node --test karp-myndband.test.cjs 2>&1 | tail -3`
Expected: FAIL, `Cannot find module './karp-myndband.cjs'`

- [ ] **Step 4: Skrifa eininguna**

```js
// karp-myndband.cjs — hjálpareining fyrir grafmyndbönd Karp (Facebook + LinkedIn).
//
// Smíðuð 21.9.2026 svo hún LIFI. Fyrri hjálparföll lágu í vinnusvæðum lota sem voru hreinsuð;
// minnið lýsti tækninni í orðum en geymdi engan kóða, og verkkeyrslan fyrir lotu 5 vísaði á blokk
// sem var ekki til. Lestu LESTU-MIG.md. Fyrirmynd: ../furduhagfraedi-ungt/myndbond.cjs.
//
// ⚠ GILDRUR SEM BITU:
//  • ✓ U+2713 VANTAR í seguiemj.ttf → tofu. teiknaTexta skiptir í ✔ U+2714.
//  • Skia fellur EKKI til baka á emoji-letur mitt í streng → teiknað í keyrslum (klippaEmoji).
//  • Rust-canvas springur (OOM) við ~5.400 ramma í EINU ferli og `| tail` felur útgangskóðann.
//    EITT myndband á node-ferli; skrifaMp4 kastar ef skráin verður ekki til eða er of lítil.
//  • toLocaleString námundaði 1.708,5 í „1.709,5". teiknaTexta tekur AÐEINS strengi.
//  • Skoðaðu test-PNG (skrifaPng + Read) ÁÐUR en þú encode-ar 540 ramma.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const W = 1080, H = 1350, FPS = 30, LENGD_S = 18;
const LITIR = {
  bak: '#0b0f1a', gull: '#f6b13b', graent: '#46e08a', texti: '#eaf1fb',
  daufur: '#9fb0c8', lina: 'rgba(255,255,255,0.10)', rautt: '#ff7a6b',
};
const LETUR = 'Segoe UI', EMOJI = 'Segoe UI Emoji';

let skrad = false;
function skraLetur() {
  if (skrad) return;
  const f = 'C:/Windows/Fonts/';
  GlobalFonts.registerFromPath(f + 'segoeui.ttf', LETUR);
  GlobalFonts.registerFromPath(f + 'segoeuib.ttf', LETUR);
  GlobalFonts.registerFromPath(f + 'seguiemj.ttf', EMOJI);
  skrad = true;
}

const EMOJI_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u;
/** Streng → keyrslur [{ t, emoji }]. */
const klippaEmoji = (s) => String(s).split(EMOJI_RE).filter((t) => t !== '')
  .map((t) => ({ t, emoji: /^\p{Extended_Pictographic}/u.test(t) }));

/** ✓ (U+2713) vantar í seguiemj.ttf; ✔ (U+2714) er til. */
const hreinsaTakn = (s) => String(s).replace(/\u2713/g, '\u2714');

const letur = (staerd, feitt) => `${feitt ? 'bold ' : ''}${staerd}px "${LETUR}"`;

function maelaTexta(ctx, s, staerd, feitt) {
  let b = 0;
  for (const k of klippaEmoji(hreinsaTakn(s))) {
    ctx.font = k.emoji ? `${staerd}px "${EMOJI}"` : letur(staerd, feitt);
    b += ctx.measureText(k.t).width;
  }
  return b;
}

/** Stærsta letur ≤ staerd sem kemur `s` fyrir í `breidd`. */
function passaStaerd(ctx, s, breidd, staerd, feitt) {
  let st = staerd;
  while (st > 12 && maelaTexta(ctx, s, st, feitt) > breidd) st -= 2;
  return st;
}

/** Teiknar texta. ⚠ AÐEINS strengir: tala verður að vera sniðin áður. */
function teiknaTexta(ctx, s, x, y, { staerd = 40, feitt = false, litur = LITIR.texti, jofnun = 'left', gegnsaei = 1 } = {}) {
  if (typeof s !== 'string') throw new TypeError(`teiknaTexta tekur aðeins strengi, fékk ${typeof s}: ${s}`);
  const t = hreinsaTakn(s);
  const breidd = maelaTexta(ctx, t, staerd, feitt);
  let cx = jofnun === 'center' ? x - breidd / 2 : jofnun === 'right' ? x - breidd : x;
  ctx.save();
  ctx.globalAlpha *= gegnsaei;
  ctx.fillStyle = litur;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const k of klippaEmoji(t)) {
    ctx.font = k.emoji ? `${staerd}px "${EMOJI}"` : letur(staerd, feitt);
    ctx.fillText(k.t, cx, y);
    cx += ctx.measureText(k.t).width;
  }
  ctx.restore();
  return breidd;
}

/** Brýtur texta í línur sem passa í `breidd`. */
function brjota(ctx, s, breidd, staerd, feitt) {
  const linur = []; let lina = '';
  for (const o of String(s).split(/\s+/)) {
    const prof = lina ? `${lina} ${o}` : o;
    if (lina && maelaTexta(ctx, prof, staerd, feitt) > breidd) { linur.push(lina); lina = o; } else lina = prof;
  }
  if (lina) linur.push(lina);
  return linur;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const klemma = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mjukt = (t) => 1 - Math.pow(1 - klemma(t), 3);
/** Framvinda 0..1 milli sekúndna a og b. */
const bil = (sek, a, b) => klemma((sek - a) / (b - a));

function bakgrunnur(ctx) { ctx.fillStyle = LITIR.bak; ctx.fillRect(0, 0, W, H); }

function haus(ctx, kafli = 'FURÐUHAGFRÆÐI') {
  const b = teiknaTexta(ctx, 'KARP', 72, 110, { staerd: 34, feitt: true, litur: LITIR.gull });
  teiknaTexta(ctx, ` · ${kafli}`, 72 + b, 110, { staerd: 34, litur: LITIR.daufur });
}

function fotur(ctx, slod) {
  ctx.fillStyle = LITIR.lina; ctx.fillRect(72, H - 150, W - 144, 2);
  teiknaTexta(ctx, slod, 72, H - 88, { staerd: passaStaerd(ctx, slod, W - 144, 36, true), feitt: true, litur: LITIR.gull });
}

/**
 * Staðlaða myndbandið, 18 s: 0–1,4 s fyrirsögn · 2,5–9 s grafið teiknast · 11–12 s lykiltalan
 * rennur inn · 15–18 s lokaspjald með hlekknum.
 */
function sena(ctx, sek, u) {
  bakgrunnur(ctx);
  haus(ctx, u.kafli);
  const a1 = mjukt(bil(sek, 0.2, 1.4));
  ctx.save(); ctx.translate(0, (1 - a1) * 24);
  let y = 230;
  for (const l of brjota(ctx, u.fyrirsogn, W - 144, 64, true)) { teiknaTexta(ctx, l, 72, y, { staerd: 64, feitt: true, gegnsaei: a1 }); y += 76; }
  if (u.undirfyrirsogn) for (const l of brjota(ctx, u.undirfyrirsogn, W - 144, 34, false)) { teiknaTexta(ctx, l, 72, y + 4, { staerd: 34, litur: LITIR.daufur, gegnsaei: a1 }); y += 44; }
  ctx.restore();
  if (sek >= 2.5) u.graf(ctx, mjukt(bil(sek, 2.5, 9)), sek, { x: 72, y: 470, w: W - 144, h: 470 });
  if (sek >= 11) {
    const a3 = mjukt(bil(sek, 11, 12));
    ctx.save(); ctx.globalAlpha = a3; ctx.translate(0, (1 - a3) * 30);
    rr(ctx, 72, 975, W - 144, 170, 22);
    ctx.fillStyle = 'rgba(246,177,59,0.10)'; ctx.fill();
    ctx.strokeStyle = 'rgba(246,177,59,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    teiknaTexta(ctx, u.lykiltala, 104, 1058, { staerd: passaStaerd(ctx, u.lykiltala, W - 208, 64, true), feitt: true, litur: LITIR.gull });
    let ly = 1106;
    for (const l of brjota(ctx, u.lykiltexti, W - 208, 30, false).slice(0, 2)) { teiknaTexta(ctx, l, 104, ly, { staerd: 30 }); ly += 36; }
    ctx.restore();
  }
  if (sek >= 15) {
    const a4 = mjukt(bil(sek, 15, 15.8));
    ctx.save(); ctx.globalAlpha = a4 * 0.94; ctx.fillStyle = LITIR.bak; ctx.fillRect(0, 150, W, H - 320); ctx.restore();
    teiknaTexta(ctx, 'Forsendur og heimildir á', W / 2, 640, { staerd: 40, litur: LITIR.daufur, jofnun: 'center', gegnsaei: a4 });
    teiknaTexta(ctx, u.slod, W / 2, 720, { staerd: passaStaerd(ctx, u.slod, W - 144, 52, true), feitt: true, litur: LITIR.gull, jofnun: 'center', gegnsaei: a4 });
  }
  fotur(ctx, u.slod);
}

/** Línurit: pts [{x,y}] teiknaðir frá vinstri upp að framvindu p. */
function linurit(ctx, pts, p, box, { xMin, xMax, yMin, yMax, xMerki = [], yMerki = [], snidX, snidY, lodrettar = [], litur = LITIR.gull }) {
  const X = (v) => box.x + ((v - xMin) / (xMax - xMin)) * box.w;
  const Y = (v) => box.y + box.h - ((v - yMin) / (yMax - yMin)) * box.h;
  ctx.save();
  ctx.strokeStyle = LITIR.lina; ctx.lineWidth = 2;
  for (const v of yMerki) {
    ctx.beginPath(); ctx.moveTo(box.x, Y(v)); ctx.lineTo(box.x + box.w, Y(v)); ctx.stroke();
    teiknaTexta(ctx, snidY(v), box.x, Y(v) - 8, { staerd: 24, litur: LITIR.daufur });
  }
  ctx.setLineDash([8, 8]);
  for (const v of lodrettar) { ctx.beginPath(); ctx.moveTo(X(v), box.y); ctx.lineTo(X(v), box.y + box.h); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const v of xMerki) teiknaTexta(ctx, snidX(v), X(v), box.y + box.h + 36, { staerd: 26, litur: LITIR.daufur, jofnun: 'center' });
  const n = Math.max(2, Math.round(pts.length * p));
  ctx.beginPath(); ctx.strokeStyle = litur; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  pts.slice(0, n).forEach((q, i) => (i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y))));
  ctx.stroke();
  ctx.restore();
}

/** Láréttar súlur [{ heiti, gildi, texti, litur? }] sem vaxa upp að framvindu p. */
function sulurit(ctx, radir, p, box, { hamark } = {}) {
  const max = hamark || Math.max(...radir.map((r) => r.gildi));
  const h = box.h / radir.length;
  const sula = Math.min(44, h - 64);
  radir.forEach((r, i) => {
    const y = box.y + i * h;
    const litur = r.litur || LITIR.gull;
    teiknaTexta(ctx, r.heiti, box.x, y + 34, { staerd: 32, feitt: true });
    rr(ctx, box.x, y + 48, Math.max(6, (box.w * r.gildi / max) * p), sula, Math.min(10, sula / 2));
    ctx.fillStyle = litur; ctx.fill();
    if (p > 0.6) teiknaTexta(ctx, r.texti, box.x + box.w, y + 34, { staerd: 32, feitt: true, litur, jofnun: 'right', gegnsaei: klemma((p - 0.6) / 0.4) });
  });
}

/** Einn rammi sem PNG til skoðunar með Read. */
async function skrifaPng(slod, teikna, sek) {
  skraLetur();
  const c = createCanvas(W, H);
  teikna(c.getContext('2d'), sek);
  fs.mkdirSync(path.dirname(slod), { recursive: true });
  fs.writeFileSync(slod, await c.encode('png'));
  return slod;
}

/** Encode-ar myndband. ⚠ Eitt á ferli. Kastar ef skráin verður ekki til eða er undir `lagmark` bætum. */
async function skrifaMp4(slod, teikna, { lengd = LENGD_S, breidd = W, haed = H, gaedi = 20, lagmark = 100000 } = {}) {
  skraLetur();
  const HME = require('h264-mp4-encoder');
  const enc = await HME.createH264MP4Encoder();
  enc.width = breidd; enc.height = haed; enc.frameRate = FPS; enc.quantizationParameter = gaedi;
  enc.initialize();
  const c = createCanvas(breidd, haed); const ctx = c.getContext('2d');
  const rammar = Math.round(lengd * FPS);
  for (let i = 0; i < rammar; i++) {
    teikna(ctx, i / FPS);
    enc.addFrameRgba(ctx.getImageData(0, 0, breidd, haed).data);
  }
  enc.finalize();
  const gogn = enc.FS.readFile(enc.outputFilename);
  enc.delete();
  fs.mkdirSync(path.dirname(slod), { recursive: true });
  fs.writeFileSync(slod, gogn);
  const baeti = fs.existsSync(slod) ? fs.statSync(slod).size : 0;
  if (baeti < lagmark) throw new Error(`${slod}: ${baeti} bæti, encode mistókst`);
  return { slod, rammar, baeti };
}

module.exports = {
  W, H, FPS, LENGD_S, LITIR, skraLetur, klippaEmoji, hreinsaTakn, maelaTexta, passaStaerd, teiknaTexta,
  brjota, rr, klemma, mjukt, bil, bakgrunnur, haus, fotur, sena, linurit, sulurit, skrifaPng, skrifaMp4,
};
```

- [ ] **Step 5: Keyra og sjá standast**

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/myndband && node --test karp-myndband.test.cjs 2>&1 | tail -4`
Expected: `# pass 7`, `# fail 0`

- [ ] **Step 6: LESTU-MIG.md**

```markdown
# karp-myndband — hjálpareining fyrir grafmyndbönd Karp

Smíðuð 21.9.2026 svo hún lifi milli lota. `npm install` einu sinni í þessari möppu.

    const K = require('C:/Users/aronh/dev/KARP/markadsefni/myndband/karp-myndband.cjs');
    const u = { fyrirsogn, undirfyrirsogn, graf: (ctx, p, sek, box) => K.sulurit(ctx, radir, p, box),
                lykiltala, lykiltexti, slod: 'karp.is/...' };
    await K.skrifaPng('prof/x-8s.png', (ctx, sek) => K.sena(ctx, sek, u), 8);   // SKOÐA með Read
    await K.skrifaMp4('x.mp4', (ctx, sek) => K.sena(ctx, sek, u));             // eitt á ferli

Fyrirmynd með fimm myndböndum: `../furduhagfraedi-ungt/myndbond.cjs`.

## Gildrur (hver á sitt próf í karp-myndband.test.cjs)
- ✓ U+2713 vantar í seguiemj.ttf og verður tofu. `teiknaTexta` skiptir í ✔ U+2714.
- Skia fellur ekki til baka á emoji-letur mitt í streng; teiknað í keyrslum.
- ~5.400 rammar í einu ferli = rust-canvas OOM, og `| tail` felur útgangskóðann. Eitt myndband á
  ferli; `skrifaMp4` kastar ef skráin er undir 100 KB.
- toLocaleString námundaði 1.708,5 í „1.709,5". `teiknaTexta` tekur aðeins strengi.
- Skoðaðu test-PNG áður en 540 rammar eru encode-aðir (~2 mín á myndband).
- Postiz: `postiz upload x.mp4`, slóðin úr svarinu fer í `-m`. Sjá `../furduhagfraedi-ungt/tima.sh`.
```

(Engin commit: mappan er utan repo og ekki í git.)

---

### Task 7: Myndbönd 1, 4 og 5

**Files:**
- Create: `C:\Users\aronh\dev\KARP\markadsefni\furduhagfraedi-ungt\myndbond.cjs`
- Output: `prof\<nafn>-{2,8,13,17}s.png`, `nikotingjald.mp4`, `nocco-vinnutimi.mp4`, `dosin.mp4`

**Interfaces:**
- Consumes: `karp-myndband.cjs` (Task 6); `web/src/lib/furdu-ungt.mjs` (Task 1); `web/src/data/furdu-ungt.json` (Task 3); `gogn/nikotinpudar.json` (Task 2); `gogn/numbeo.json`; `web/public/gogn/fasteignaskra/230.json`. Repo-slóð úr `KARP_REPO`, sjálfgefið worktree-ið.

- [ ] **Step 1: Skrifa myndbond.cjs**

```js
// myndbond.cjs — furðuhagfræði unga fólksins, fimm grafmyndbönd (21.9.2026).
//
// EITT myndband á ferli (rust-canvas OOM):
//   node myndbond.cjs png <nafn>     → prof/<nafn>-{2,8,13,17}s.png   (SKOÐA með Read fyrst)
//   node myndbond.cjs mp4 <nafn>     → <nafn>.mp4
// nöfn: nikotingjald · nocco-vinnutimi · dosin · koffinkrona · islattar
//
// Tölurnar eru REIKNAÐAR með sömu föllum og síðan (web/src/lib/furdu-ungt.mjs) úr sömu skrám,
// svo myndband og síða geta ekki sagt tvær ólíkar tölur. Sniðið er meðvitað og skilar strengjum.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const K = require('../myndband/karp-myndband.cjs');

const REPO = process.env.KARP_REPO || 'C:/Users/aronh/dev/KARP/_gc3-wt';
const lesa = (s) => JSON.parse(fs.readFileSync(path.join(REPO, s), 'utf8'));
const heil = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const tug = (n, d = 1) => { const [a, b] = Number(n).toFixed(d).split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? `,${b}` : ''); };
const pro = (x, d = 1) => `${tug(x * 100, d)}%`;
const mg = (v) => tug(v, v % 1 ? 1 : 0);
const slod = (a) => `karp.is/furduhagfraedi/#${a}`;
const KREFST_ISLATTE = ['koffinkrona', 'islattar'];

async function uppsetningar() {
  const L = await import(pathToFileURL(path.join(REPO, 'web/src/lib/furdu-ungt.mjs')).href);
  const U = lesa('web/src/data/furdu-ungt.json');
  const P = lesa('gogn/nikotinpudar.json');
  const wage = lesa('gogn/numbeo.json').prices.Reykjavik[53];
  const nocco = U.koffin.drykkir.find((d) => d.id === 'nocco');
  const ut = {};

  const tonn = L.sagartonn({ fra: 4, til: 20 }).map((q) => ({ x: q.mgG, y: q.krMg }));
  const yfir = L.rettYfirThrepi(P.vorur)[0];
  ut.nikotingjald = {
    fyrirsogn: 'Nikótíngjaldið er sagartönn',
    undirfyrirsogn: 'Gjald á hvert mg nikótíns eftir styrk púðans (mg/g)',
    graf: (ctx, p, sek, box) => K.linurit(ctx, tonn, p, box, {
      xMin: 4, xMax: 20, yMin: 0, yMax: 2.2, xMerki: [4, 8, 12, 16, 20], yMerki: [0.5, 1, 1.5, 2],
      snidX: (v) => String(v), snidY: (v) => `${tug(v, 1)} kr`, lodrettar: [8, 12, 16] }),
    lykiltala: `+${heil(yfir.aukagjald)} kr á dós`,
    lykiltexti: `${heil(yfir.n)} púðar á hillunni sitja á ${mg(yfir.mgG)} mg/g, ${tug(yfir.mgG - yfir.thak, 1)} mg yfir þrepi. Það er ${pro(yfir.aukaNikotin, 0)} meira nikótín.`,
    slod: slod('nikotingjald'),
  };

  const t16 = L.nettoAnSkatts(U.laun.taxti16, U.laun.lifeyrir);
  const m16 = L.minutur(nocco.verd, t16);
  const mMed = L.minutur(nocco.verd, wage / 160);
  ut['nocco-vinnutimi'] = {
    fyrirsogn: 'Hvað vinnur 16 ára lengi fyrir einni Nocco?',
    undirfyrirsogn: 'Mínútur af vinnu, eftir skatt og lífeyri',
    graf: (ctx, p, sek, box) => K.sulurit(ctx, [
      { heiti: '16 ára, afgreiðsla', gildi: m16, texti: `${tug(m16, 1)} mín` },
      { heiti: 'Meðallaun', gildi: mMed, texti: `${tug(mMed, 1)} mín`, litur: K.LITIR.daufur },
    ], p, box),
    lykiltala: `${tug((30 * nocco.verd) / t16, 1)} vinnustundir`,
    lykiltexti: 'kostar Nocco á dag í mánuð 16 ára afgreiðslumann.',
    slod: slod('nocco-vinnutimi'),
  };

  const o = L.oskilad(U.dosin.ar2024);
  ut.dosin = {
    fyrirsogn: `${U.dosin.skilagjald} kr af hverri Nocco eru skilagjald`,
    undirfyrirsogn: `${pro(L.skilagjaldHlutfall(U.dosin.skilagjald, nocco.verd), 1)} af verðinu. Þú færð þær aftur ef þú skilar dósinni.`,
    graf: (ctx, p, sek, box) => K.sulurit(ctx, [
      { heiti: 'Á markað 2024', gildi: U.dosin.ar2024.aMarkad, texti: `${heil(U.dosin.ar2024.aMarkad / 1e6)} milljónir` },
      { heiti: 'Skiluðu sér', gildi: U.dosin.ar2024.skilad, texti: `${heil(U.dosin.ar2024.skilad / 1e6)} milljónir`, litur: K.LITIR.graent },
      { heiti: 'Skiluðu sér ekki', gildi: o.n, texti: `${heil(o.n / 1e6)} milljónir`, litur: K.LITIR.rautt },
    ], p, box),
    lykiltala: `Um ${heil(o.kr / 1e6)} milljónir kr`,
    lykiltexti: 'í skilagjaldi voru aldrei sóttar árið 2024.',
    slod: slod('dosin'),
  };

  const isl = U.koffin.islatte;
  if (isl.verd != null) {
    const kb = L.kaffibolli(U.koffin.kaffi);
    const kaffiKr = L.koffinKrona(kb, U.koffin.kaffi.mgBolli);
    const radir = [
      ...U.koffin.drykkir.map((d) => ({ heiti: d.heiti.replace(/ \d+ ml$/, ''), gildi: L.koffinKrona(d.verd, d.mg) })),
      { heiti: 'Íslatte', gildi: L.koffinKrona(isl.verd, isl.skot * isl.mgSkot) },
      { heiti: 'Kaffi heima', gildi: kaffiKr, litur: K.LITIR.graent },
    ].sort((a, b) => b.gildi - a.gildi).map((r) => ({ ...r, texti: `${heil(r.gildi)} kr` }));
    ut.koffinkrona = {
      fyrirsogn: 'Koffínkrónan',
      undirfyrirsogn: 'Hvað kosta 100 mg af koffíni?',
      graf: (ctx, p, sek, box) => K.sulurit(ctx, radir, p, box),
      lykiltala: `Rúmlega ${Math.floor(L.koffinKrona(nocco.verd, nocco.mg) / kaffiKr)} sinnum dýrara`,
      lykiltexti: 'er koffínið í Nocco en í uppáhelltu kaffi heima.',
      slod: slod('koffinkrona'),
    };

    const sala = L.midgildiSolu(lesa('web/public/gogn/fasteignaskra/230.json'), { teg: U.utborgun.teg, nu: new Date().toISOString().slice(0, 7) });
    const r = L.islattarIUtborgun({ verdIbudar: sala.midgildi, hlutfall: U.utborgun.hlutfall, islatteVerd: isl.verd });
    ut.islattar = {
      fyrirsogn: 'Útborgun í íbúð í Reykjanesbæ, talin í íslöttum',
      undirfyrirsogn: `Miðgildi fjölbýlis ${tug(sala.midgildi / 1e6, 1)} milljónir. Fyrstu kaupendur greiða 10%: ${heil(r.utborgun)} kr.`,
      graf: (ctx, p, sek, box) => {
        K.teiknaTexta(ctx, heil(r.fjoldi * p), box.x + box.w / 2, box.y + 250, { staerd: 190, feitt: true, litur: K.LITIR.gull, jofnun: 'center' });
        K.teiknaTexta(ctx, 'íslattar', box.x + box.w / 2, box.y + 340, { staerd: 56, jofnun: 'center', gegnsaei: p });
      },
      lykiltala: `${tug(r.arMedEinumADag, 1)} ár`,
      lykiltexti: `með einum íslatte á dag, á ${heil(isl.verd)} kr hjá Te & Kaffi.`,
      slod: slod('islattar'),
    };
  }
  return ut;
}

(async () => {
  const [hamur, nafn] = process.argv.slice(2);
  const allt = await uppsetningar();
  const u = allt[nafn];
  if (!u && KREFST_ISLATTE.includes(nafn)) throw new Error(`${nafn} þarf íslatteverð í web/src/data/furdu-ungt.json (koffin.islatte.verd)`);
  if (!u) throw new Error(`Óþekkt nafn: ${nafn}. Til: ${Object.keys(allt).join(', ')}`);
  const teikna = (ctx, sek) => K.sena(ctx, sek, u);
  if (hamur === 'png') {
    for (const s of [2, 8, 13, 17]) console.log(await K.skrifaPng(path.join(__dirname, 'prof', `${nafn}-${s}s.png`), teikna, s));
  } else if (hamur === 'mp4') {
    const r = await K.skrifaMp4(path.join(__dirname, `${nafn}.mp4`), teikna);
    console.log(`${r.slod}: ${r.rammar} rammar, ${Math.round(r.baeti / 1024)} KB`);
  } else throw new Error('hamur: png eða mp4');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Test-PNG fyrir 1, 4 og 5**

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/furduhagfraedi-ungt && for n in nikotingjald nocco-vinnutimi dosin; do node myndbond.cjs png $n || echo "FELL $n"; done`
Expected: 12 slóðir prentaðar, ekkert `FELL`.

- [ ] **Step 3: SKOÐA hvert PNG með Read** (12 myndir). Athuga: fyrirsögn innan ramma og ekki ofan í grafinu; sagartönnin sýnir fjórar tennur og strikaðar línur á 8, 12, 16; súlumerki skarast ekki við heiti; lykiltalan og textinn innan kassans; lokaspjaldið (17 s) sýnir hlekkinn heilan; engir tofu-kassar; íslenskir stafir réttir. Laga `myndbond.cjs` eða `karp-myndband.cjs` og endurtaka Step 2 þar til allt stenst.

- [ ] **Step 4: Encode, eitt á ferli, í bakgrunni (~6 mín alls)**

Run (Bash, `run_in_background: true`): `cd /c/Users/aronh/dev/KARP/markadsefni/furduhagfraedi-ungt && for n in nikotingjald nocco-vinnutimi dosin; do node myndbond.cjs mp4 $n; echo "exit $n $?"; done > mp4.log 2>&1`

- [ ] **Step 5: Staðfesta skrárnar** (`| tail` felur hrun, svo stærð og ftyp)

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/furduhagfraedi-ungt && cat mp4.log && for n in nikotingjald nocco-vinnutimi dosin; do printf "%s " $n; [ -s $n.mp4 ] && stat -c %s $n.mp4 && head -c 12 $n.mp4 | tail -c 8; echo; done`
Expected: þrjár línur `exit <nafn> 0`; hver skrá yfir 100000 bæti og inniheldur `ftyp`.

---

### Task 8: Textar og Postiz (24.9, 29.9, 1.10)

**Files:**
- Create: `markadsefni\furduhagfraedi-ungt\nikotingjald.txt`, `nocco-vinnutimi.txt`, `dosin.txt`, `tima.sh`

- [ ] **Step 1: Textarnir.** Tölurnar úr PNG-unum í Task 7 (sama reikningur). Með talningu 21.9:

`nikotingjald.txt`
```
Nikótíngjaldið á púðum er í fjórum þrepum eftir styrk. Reiknað á hvert mg nikótíns verður það sagartönn. Frá 8,0 í 8,1 mg/g hækkar gjaldið um 50% fyrir 1,25% meira nikótín.

Níu púðar á hillunni sitja hálfu mg yfir þrepi. Það kostar 73 kr meira í gjald á hverja dós.

karp.is/furduhagfraedi/#nikotingjald
```

`nocco-vinnutimi.txt`
```
Sextán ára afgreiðslumaður í verslun vinnur í tæpar 8 mínútur fyrir einni Nocco. Nocco á dag í mánuð kostar hann næstum fjóra vinnutíma.

karp.is/furduhagfraedi/#nocco-vinnutimi
```

`dosin.txt`
```
23 krónur af hverri Nocco eru skilagjald, 7,6% af verðinu. Árið 2024 skiluðu 29 milljónir umbúða sér ekki. Það eru um 580 milljónir króna sem enginn sótti.

karp.is/furduhagfraedi/#dosin
```

⚠ Ef ný talning í Task 2 breytti „níu" eða „73 kr": laga `nikotingjald.txt` að PNG-inu.

- [ ] **Step 2: tima.sh**

```bash
#!/usr/bin/env bash
# tima.sh <nafn> <YYYY-MM-DD> — hleður <nafn>.mp4 upp á Postiz og tímasetur <nafn>.txt kl. 08:30Z
# á BÁÐAR Karp-rásirnar og AÐEINS þær. ⚠ POSTIZ_API_KEY er í umhverfinu; ALDREI prenta hann.
# ⚠ Postiz-reikningurinn ber líka EWB og Steinsson|Greykdal. Rásar-ID eru föst hér, aldrei úr lista.
set -euo pipefail
cd "$(dirname "$0")"
NAFN="$1"; DAGS="$2"
[[ "$DAGS" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "dags á forminu YYYY-MM-DD"; exit 1; }
[ -s "$NAFN.mp4" ] && [ -s "$NAFN.txt" ] || { echo "vantar $NAFN.mp4 eða $NAFN.txt"; exit 1; }
URL=$(postiz upload "$NAFN.mp4" | grep -o 'https://uploads\.postiz\.com/[^"]*' | head -1 || true)
[ -n "$URL" ] || { echo "upload skilaði engri slóð"; exit 1; }
TEXTI="$(cat "$NAFN.txt")"
postiz posts:create -c "$TEXTI" -m "$URL" -i cmt92pcw000r9p20yv7b53018 -s "${DAGS}T08:30:00Z" -t schedule --no-shortLink
postiz posts:create -c "$TEXTI" -m "$URL" -i cmt92q6mr00pbmp0ykfa92r3v -s "${DAGS}T08:30:00Z" -t schedule --no-shortLink --settings '{"post_type":"post"}'
echo "$NAFN: $DAGS 08:30Z á LinkedIn og Facebook"
```

- [ ] **Step 3: Tímasetja** (heimild Arons 21.9: „setja inná postiz þar sem það er laust pláss")

Run: `cd /c/Users/aronh/dev/KARP/markadsefni/furduhagfraedi-ungt && bash tima.sh nikotingjald 2026-09-24 && bash tima.sh nocco-vinnutimi 2026-09-29 && bash tima.sh dosin 2026-10-01`
Expected: þrjár `…: <dags> 08:30Z á LinkedIn og Facebook` línur.

- [ ] **Step 4: Sannreyna biðröðina**

Run:
```bash
cd /c/Users/aronh/AppData/Local/Temp/claude/C--Users-aronh-OneDrive-Documents-KARP/5d1f89c0-a956-4dcd-a5f8-bdfa0ae9606a/scratchpad && postiz posts:list > pz2.txt && python - <<'PY'
import json
s=open('pz2.txt',encoding='utf-8').read(); dec=json.JSONDecoder(); i=0; posts=[]
while i<len(s):
    while i<len(s) and s[i] in ' \r\n\t': i+=1
    if i>=len(s): break
    try: v,i=dec.raw_decode(s,i)
    except ValueError: i+=1; continue
    posts+= v.get('posts',[]) if isinstance(v,dict) else (v if isinstance(v,list) else [])
KARP={'cmt92pcw000r9p20yv7b53018':'LI','cmt92q6mr00pbmp0ykfa92r3v':'FB'}
for p in sorted(posts,key=lambda p:p.get('publishDate','')):
    d=p.get('publishDate','')
    if not ('2026-09-24'<=d[:10]<='2026-10-01'): continue
    k=KARP.get((p.get('integration') or {}).get('id') or p.get('integrationId'),'ANNAD')
    print(d[:16],k,p.get('state'),p.get('id','')[-6:],(p.get('content') or '')[:40].encode('unicode_escape').decode())
PY
```
Expected: 24.9, 29.9 og 1.10 kl. 08:30 hvert með einni `LI` og einni `FB` í `QUEUE`; ENGIN `ANNAD` á þeim tímum; `\xed`/`\xf3`/`\xf0` í efninu (íslenskan heil).

- [ ] **Step 5: Senda Aroni myndböndin**

`SendUserFile` með `nikotingjald.mp4`, `nocco-vinnutimi.mp4`, `dosin.mp4`, caption: „Tímasett 24.9, 29.9 og 1.10 kl. 08:30. API-ið sýnir ekki viðhengi; kíktu á eina færslu í Postiz."

---

### Task 9: Verkkeyrslan fyrir lotu 5

**Files:**
- Modify: `C:\Users\aronh\.claude\scheduled-tasks\karp-markadsefni-lota-5\SKILL.md`

- [ ] **Step 1: Skref 1, eigin dagar.** Skipta út setningunni `Ef lota 5 er þegar tímasett á 12.10+ (önnur sessjón búin að því): HÆTTU og skilaðu því.` fyrir:

```
Athugaðu AÐEINS þína eigin fjóra tíma: 12., 14., 16. og 19.10 kl. 08:30Z á Karp-rásunum tveimur. Ef færslur eru þegar á ÞEIM tímum (önnur sessjón búin): HÆTTU og skilaðu því. ⚠ Aðrar færslur frá 12.10 og síðar (t.d. furðuhagfræðin, sem birtist á þriðjudögum og fimmtudögum) mega EKKI stöðva þig. Fyrri útgáfa þessa skrefs sagði „ef EITTHVAÐ er á 12.10+" og hefði þaggað niður heila lotu án þess að nokkur tæki eftir því.
```

- [ ] **Step 2: Skref 2, rétt repo.** Skipta `C:/Users/aronh/dev/karp-fyrirtaeki` út fyrir `C:/Users/aronh/dev/KARP/GIT repository - hagvisir` (sú fyrri er ekki til).

- [ ] **Step 3: Skref 4, hjálpareiningin.** Skipta `Skrifaðu render5.cjs í scratchpad (afritaðu helper-blokkina úr verklaginu í topic-skránni: drawText m/ emoji-runs, rr, bg, header, ctaScene), test-PNG` út fyrir:

```
Skrifaðu render5.cjs í C:\Users\aronh\dev\KARP\markadsefni\lota5\ og notaðu hjálpareininguna C:\Users\aronh\dev\KARP\markadsefni\myndband\karp-myndband.cjs (lestu LESTU-MIG.md þar; sena, linurit, sulurit, skrifaPng, skrifaMp4). Fyrirmynd með fimm myndböndum: markadsefni\furduhagfraedi-ungt\myndbond.cjs. Tímasetning: sama mynstur og furduhagfraedi-ungt\tima.sh (bash, rásar-ID föst). Test-PNG
```

- [ ] **Step 4: Staðfesta**

Run: `grep -n -E "eigin fjóra|GIT repository - hagvisir|karp-myndband.cjs" /c/Users/aronh/.claude/scheduled-tasks/karp-markadsefni-lota-5/SKILL.md | wc -l; grep -c "karp-fyrirtaeki" /c/Users/aronh/.claude/scheduled-tasks/karp-markadsefni-lota-5/SKILL.md`
Expected: `3` og `0`.

---

### Task 10: Minni

- [ ] **Step 1:** Nýtt minni `karp-furduhagfraedi-ungt.md` (type project): dagsetningar og akkeri, post-ID úr Task 8, staðfestu tölurnar og heimildirnar (lagagreinarnar tvær sem voru rangar í fyrstu, 23 kr, 105 mg Nocco, miðgildið sem endurtókst ekki), að Te & Kaffi birtir ekki verð og að Neytandinn leitar með `https://www.neytandinn.is/wa/SMAction/search?searchString=<orð>` (þjónninn skilar HTML-töflu), og að greinar 2–3 bíða íslatteverðs.
- [ ] **Step 2:** Uppfæra `karp-markadsefni.md`: hjálpareiningin `markadsefni\myndband\` (varanleg, prófuð), `tima.sh`-mynstrið, `postiz posts:create -i` (ekki `-c`) fyrir rás, furðuhagfræðin á þri/fim.
- [ ] **Step 3:** MEMORY.md: ein lína fyrir nýja minnið og uppfærð Markaðsefni-lína.

---

### Task 11: Greinar 2 og 3 (bíður íslatteverðs frá Aroni)

**Forsenda:** Aron staðfestir verð á íslatte hjá Te & Kaffi.

- [ ] **Step 1:** Í `web/src/data/furdu-ungt.json` setja `koffin.islatte.verd` = staðfesta verðið, `dags` = dagurinn sem það var staðfest, `heimild` = `"verð staðfest af Karp"`.
- [ ] **Step 2:** `cd web && node --test test/furdu-ungt-gogn.test.mjs test/furdu-ungt.test.mjs` → `# fail 0`; `npm run build`; `grep -c 'id="islattar"' dist/furduhagfraedi/index.html` → `1`.
- [ ] **Step 3:** Commit (`furduhagfraedi: islatteverd stadfest, islattar i utborgun birtast`) og Task 5 aftur (push, CI, live).
- [ ] **Step 4:** Task 7 Step 2–5 fyrir `koffinkrona` og `islattar`.
- [ ] **Step 5:** Textar `koffinkrona.txt` og `islattar.txt` í sama stíl (tala, snúningur, hlekkur), `bash tima.sh koffinkrona 2026-10-06 && bash tima.sh islattar 2026-10-08`, sannreyna með Task 8 Step 4 (dagabil 6.10–8.10).
