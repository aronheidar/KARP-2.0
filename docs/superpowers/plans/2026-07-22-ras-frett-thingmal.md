# RÁS-afleiðingar í fréttavél og þingmálum — útfærsluáætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bæta „📊 Samkvæmt RÁS"-kassa á fréttasíður (`/frettavel/<id>/`) og þingmál (`/thingmal/`) sem sýnir áhrif atburðar/frumvarps samkvæmt RÁS-þjóðhagsherminum, með djúp-hlekk í herminn.

**Architecture:** Ein hrein isomorphic eining (`src/lib/roads/frett-ras.mjs`) knýr allt: `simulate` fyrir drifkrafta (lever/shock) og fyrsta-stigs tengsla-lestur fyrir útkomur. Deilt HTML-teiknari (`render-ras-box.mjs`). Fréttavél varpar per skynjara (regla, byggingartími); þingmál fá flokkun úr ódýru Claude-kalli (nýtt einangrað skript). Allt bakað í HTML á byggingartíma; vélin (`engine.mjs`) er óbreytt.

**Tech Stack:** Node.js (ESM einingar + CommonJS byggingaskript með `await import()`), Astro (SSG), `@anthropic-ai/sdk`, RÁS-vél (`src/lib/roads/engine.mjs`).

## Global Constraints

- **Worktree:** allar skrár í `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (EKKI OneDrive). Breyta Í worktree.
- **Deploy:** `git push origin b2b-topbar:main` (deployar síðu + worker).
- **Vél óbreytt:** `src/lib/roads/engine.mjs` er EKKI breytt í þessu verki.
- **Byggingartími:** engin ný client-hermun; kassar bakaðir í HTML (SEO).
- **Fyrirvari skylda (opinber síða):** hver kassi með óvissri stærð BER „dæmi til skýringar" + „ekki spá". Aldrei framsett sem raunspá.
- **Ein heimild fyrir POLARITY:** `baseline.outcomes[k].polarity` (bætt í `build_roads.mjs`).
- **CSS:** ný stétt-nöfn með `r-`-forskeyti (Astro `is:global` lekur almenn nöfn).
- **Gogn-slóð:** skrifa í repo-rót `gogn/` (það sem `@gogn`-alías les), EKKI OneDrive-hagvisir.
- **Sannreyna í vafra** (`localhost` preview „mitt-svaedi" á porti 4405), EKKI curl|grep (hashed bundle → falskt neg fyrir JS).
- **Prófkeyrsla:** RÁS-próf keyra beint með `node <skrá>` (ekkert `npm test`-skript til). Próf nota einfalt `ok(name, cond)`-mynstur eins og `src/lib/roads/engine.test.mjs`, prenta samantekt og `process.exit(fail?1:0)`.
- **Tafla POLARITY (verbatim, notuð í Task 1):** `{ hagvoxtur:1, kaupmattur:1, launaskrid:0, afkoma:1, utflutningur:1, vinnuafl:1, byggdajofnudur:1, nyskopun:1, fiskistofn:1, verdbolga:-1, atvinnuleysi:-1, husnaedi:-1, husnaedi_hbs:-1, husnaedi_land:-1, leiga:-1, greidslubyrdi:-1, skuldir:-1, losun:-1, vanskil:-1, framfaersla:-1, mannfjoldi:0, folksfjoldi:0, gengi_endo:0, lifeyriseignir:1, hlutabref:1, vidskiptajofnudur:1, niip:1, jofnudur:1, peningamagn:0, utlanavoxtur:0, vaxtaalag:-1, heimilaskuldir:-1, einkajofnudur:0, vlf_sjavar:1, vlf_ferda:1, vlf_idnadur:1 }`

---

## Skráakort (hvað verður til / breytist)

| Skrá | Ábyrgð | Aðgerð |
|---|---|---|
| `skriptur/build_roads.mjs` | Bætir `polarity` í hverja útkomu → `baseline.json` | Breyta |
| `src/lib/roads/frett-ras.mjs` | `projectRas(trigger, ctx)` — kjarna-vörpun trigger → projection | Búa til |
| `src/lib/roads/frett-ras.test.mjs` | Einingapróf fyrir `projectRas` | Búa til |
| `src/lib/roads/render-ras-box.mjs` | `renderRasBox(projection)` → HTML-strengur | Búa til |
| `src/lib/roads/render-ras-box.test.mjs` | Einingapróf fyrir `renderRasBox` | Búa til |
| `skriptur/build_frettavel.js` | Vörpunar-tafla + `ev.facts.ras` | Breyta |
| `web/src/pages/frettavel/[id].astro` | Teikna RÁS-kassa úr `it.facts.ras` + CSS | Breyta |
| `skriptur/build_thingmal_ras.mjs` | Nýtt einangrað skript: haiku-flokkun frumvarpa → `b.ras` | Búa til |
| `web/src/pages/thingmal.astro` | RÁS-flís á spjaldi + kassi í glugga | Breyta |

---

## Task 1: `polarity` í baseline (ein heimild)

**Files:**
- Modify: `skriptur/build_roads.mjs` (útkomu-skilgreiningar, línur 108–154; write á 515)
- Test: `src/lib/roads/polarity.test.mjs` (Create)

**Interfaces:**
- Produces: `gogn/roads/baseline.json` þar sem hver `outcomes[k]` hefur `polarity: -1|0|1`.

- [ ] **Step 1: Skrifa fallandi próf**

Create `src/lib/roads/polarity.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const EXPECT = { hagvoxtur:1, kaupmattur:1, launaskrid:0, afkoma:1, utflutningur:1, vinnuafl:1, byggdajofnudur:1, nyskopun:1, fiskistofn:1, verdbolga:-1, atvinnuleysi:-1, husnaedi:-1, husnaedi_hbs:-1, husnaedi_land:-1, leiga:-1, greidslubyrdi:-1, skuldir:-1, losun:-1, vanskil:-1, framfaersla:-1, mannfjoldi:0, folksfjoldi:0, gengi_endo:0, lifeyriseignir:1, hlutabref:1, vidskiptajofnudur:1, niip:1, jofnudur:1, peningamagn:0, utlanavoxtur:0, vaxtaalag:-1, heimilaskuldir:-1, einkajofnudur:0, vlf_sjavar:1, vlf_ferda:1, vlf_idnadur:1 };
for (const k of Object.keys(baseline.outcomes)) ok('polarity present: ' + k, typeof baseline.outcomes[k].polarity === 'number');
for (const k in EXPECT) ok('polarity value: ' + k, baseline.outcomes[k] && baseline.outcomes[k].polarity === EXPECT[k]);
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra próf → á að falla**

Run: `node src/lib/roads/polarity.test.mjs`
Expected: FAIL — margar `polarity present`-línur falla (`polarity` er `undefined`), `process.exit(1)`.

- [ ] **Step 3: Bæta `polarity` við hverja útkomu í `build_roads.mjs`**

Í `skriptur/build_roads.mjs`, bæta `polarity: <gildi>` í hvern útkomu-hlut (línur 109–153). Nota gildin úr `EXPECT`-kortinu að ofan. Dæmi um breyttar línur:
```js
    verdbolga: { label: 'Verðbólga', unit: '%', path: bau(inflNow, 2.6), polarity: -1 },
    hagvoxtur: { label: 'Hagvöxtur (VLF)', unit: '%', path: bau(gdpF[10] ?? 1.9, gdpF[gdpF.length - 1] ?? 2.4), polarity: 1 },
    atvinnuleysi: { label: 'Atvinnuleysi', unit: '%', path: bau(unemNow, 4.0), polarity: -1 },
    launaskrid: { label: 'Launaskrið (nafnlaun umfram samninga)', unit: '%', path: bau(0, 0), polarity: 0 },
    kaupmattur: { label: 'Kaupmáttur launa', unit: '%', path: bau(0.8, 1.5), polarity: 1 },
    husnaedi: { label: 'Húsnæðisverð (12-mán)', unit: '%', path: bau(houseNow, 3.0), polarity: -1 },
    leiga: { label: 'Leiga (12-mán)', unit: '%', path: bau(rentNow, 4.0), polarity: -1 },
    greidslubyrdi: { label: 'Greiðslubyrði (vísit.)', unit: '', path: bau(100, 100), polarity: -1 },
    mannfjoldi: { label: 'Fólksfjölgun', unit: '%', path: bau(popNow, 1.0), polarity: 0 },
    vinnuafl: { label: 'Vinnuaflsvöxtur', unit: '%', path: bau(1.5, 1.2), polarity: 1 },
    afkoma: { label: 'Afkoma ríkissjóðs', unit: '% VLF', path: afkomaPath, polarity: 1 },
    skuldir: { label: 'Skuldir ríkis', unit: '% VLF', path: skuldirPath, polarity: -1 },
    utflutningur: { label: 'Útflutningsvöxtur', unit: '%', path: bau(2, 2.5), polarity: 1 },
    losun: { label: 'CO₂-losun (vísit.)', unit: '', path: bau(100, 100), polarity: -1 },
    vanskil: { label: 'Vanskil (vísit.)', unit: '', path: bau(100, 100), polarity: -1 },
    folksfjoldi: { label: 'Fólksfjöldi (vísit., frávik)', unit: '', path: bau(100, 100), polarity: 0 },
    framfaersla: { label: 'Framfærsluhlutfall (vísit.)', unit: '', path: glideFull(100, 106), polarity: -1 },
    byggdajofnudur: { label: 'Byggðajöfnuður (vísit.)', unit: '', path: glideFull(100, 96), polarity: 1 },
    nyskopun: { label: 'Nýsköpun & hugvit (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
    fiskistofn: { label: 'Fiskistofn (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
    husnaedi_hbs: { label: 'Húsnæði — höfuðborg (12-mán)', unit: '%', path: bau(houseNow, 3.5), polarity: -1 },
    husnaedi_land: { label: 'Húsnæði — landsbyggð (12-mán)', unit: '%', path: bau(houseNow, 2.0), polarity: -1 },
    gengi_endo: { label: 'Gengi krónu — endógen (styrking +)', unit: '%', path: bau(0, 0), polarity: 0 },
    peningamagn: { label: 'Peningamagn M3 (árs-breyting)', unit: '%', path: bau(7, 5), polarity: 0 },
    utlanavoxtur: { label: 'Útlánavöxtur (árs-breyting)', unit: '%', path: bau(6, 5), polarity: 0 },
    lifeyriseignir: { label: 'Lífeyrissjóða-eignir (% VLF)', unit: '% VLF', path: bau(175, 182), polarity: 1 },
    hlutabref: { label: 'Hlutabréf (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
    vaxtaalag: { label: 'Vaxtaálag ríkis (pp)', unit: 'pp', path: bau(0.8, 0.7), polarity: -1 },
    vidskiptajofnudur: { label: 'Viðskiptajöfnuður (% VLF)', unit: '% VLF', path: caPath, polarity: 1 },
    niip: { label: 'Erlend staða þjóðarbús (% VLF)', unit: '% VLF', path: bau(30, 35), polarity: 1 },
    jofnudur: { label: 'Tekjujöfnuður (vísit., hærra=jafnara)', unit: '', path: bau(100, 100), polarity: 1 },
    heimilaskuldir: { label: 'Skuldir heimila (vísit.)', unit: '', path: bau(100, 100), polarity: -1 },
    einkajofnudur: { label: 'Einkageira-jöfnuður (% VLF, sparn.−fjárf.)', unit: '% VLF', path: einkaPath, polarity: 0 },
    vlf_sjavar: { label: 'Sjávarútvegur — virðisauki (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
    vlf_ferda: { label: 'Ferðaþjónusta — virðisauki (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
    vlf_idnadur: { label: 'Iðnaður & orka — virðisauki (vísit.)', unit: '', path: bau(100, 100), polarity: 1 },
```
(`launaskrid` línan er skilgreind með athugasemdum á 112–114 — bæta `polarity: 0` við hlutinn á línu 114.)

- [ ] **Step 4: Endurbyggja módelið**

Run: `node skriptur/build_roads.mjs`
Expected: `ROADS módel byggt: 36 útkomur, …` (engin villa).

- [ ] **Step 5: Keyra próf → á að standast**

Run: `node src/lib/roads/polarity.test.mjs`
Expected: `36+ pass, 0 fail`, `process.exit(0)`.

- [ ] **Step 6: Staðfesta að vélar-prófin séu enn græn (baseline breyttist)**

Run: `node src/lib/roads/engine.test.mjs` og `node skriptur/backtest_roads.mjs`
Expected: engin `✗`-lína (polarity er hlutlaust svið, breytir engum útreikningi).

- [ ] **Step 7: Commit**
```bash
git add skriptur/build_roads.mjs gogn/roads/baseline.json src/lib/roads/polarity.test.mjs
git commit -m "RÁS: polarity á útkomur í baseline (ein heimild fyrir valens)"
```

---

## Task 2: `frett-ras.mjs` — kjarna-vörpun

**Files:**
- Create: `src/lib/roads/frett-ras.mjs`
- Test: `src/lib/roads/frett-ras.test.mjs`

**Interfaces:**
- Consumes: `simulate` úr `./engine.mjs`; `baseline.json`/`links.json`/`scenarios.json` (send inn sem `ctx`).
- Produces: `export function projectRas(trigger, ctx) → RasProjection | null`.
  - `trigger`: `{kind:'lever'|'shock', key, value, illustrative?}` | `{kind:'outcome', key, bump?}` | `{kind:'preset', id}`.
  - `ctx`: `{ baseline, links, scenarios }` (scenarios valkvætt).
  - `RasProjection`: `{ mode:'sim'|'links', illustrative:bool, inputLabel:string|null, inputKey:string|null, perUnit?:string, horizonQuarters:12, topEffects:[{key,label,delta,dir,unit,valence,lag?}], sentence:string, deepLink:string, source:'RÁS-hermir' }`.

- [ ] **Step 1: Skrifa fallandi próf**

Create `src/lib/roads/frett-ras.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projectRas } from './frett-ras.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const rj = (f) => JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/' + f), 'utf8'));
const baseline = rj('baseline.json'), links = rj('links.json'), scenarios = rj('scenarios.json');
const ctx = { baseline, links, scenarios };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const eff = (p, key) => (p.topEffects.find((e) => e.key === key) || null);

// 1) sim: vaxtalækkun (lægri vextir) → hagvöxtur upp
{
  const now = baseline.levers.vextir.base;
  const p = projectRas({ kind: 'lever', key: 'vextir', value: now - 1 }, ctx);
  ok('rate cut → sim projection', p && p.mode === 'sim');
  ok('rate cut → hagvoxtur dir > 0', p && eff(p, 'hagvoxtur') && eff(p, 'hagvoxtur').dir > 0);
  ok('rate cut → topEffects ≤ 4', p && p.topEffects.length <= 4);
  ok('rate cut → deepLink lever-hash', p && p.deepLink === '/hermir/#l.vextir=' + (now - 1));
}
// 2) sim: olíu-sjokk → verðbólga upp
{
  const p = projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx);
  ok('oil shock → verdbolga dir > 0', p && eff(p, 'verdbolga') && eff(p, 'verdbolga').dir > 0);
  ok('oil shock → deepLink shock-hash', p && p.deepLink === '/hermir/#s.olia=40');
}
// 3) links: verðbólga (Type B) → kaupmáttur niður, greiðslubyrði upp
{
  const p = projectRas({ kind: 'outcome', key: 'verdbolga' }, ctx);
  ok('verdbolga → links mode', p && p.mode === 'links');
  ok('verdbolga → illustrative', p && p.illustrative === true);
  ok('verdbolga → kaupmattur dir < 0', p && eff(p, 'kaupmattur') && eff(p, 'kaupmattur').dir < 0);
  ok('verdbolga → greidslubyrdi dir > 0', p && eff(p, 'greidslubyrdi') && eff(p, 'greidslubyrdi').dir > 0);
  ok('verdbolga → deepLink model tab', p && p.deepLink === '/hermir/#tb=model');
}
// 4) links á útkomu án niðurstreymis (leiga) → null
{
  ok('leiga (engin niðurstreymis-tengsl) → null', projectRas({ kind: 'outcome', key: 'leiga' }, ctx) === null);
}
// 5) null-tilfelli
{
  ok('óþekktur lever → null', projectRas({ kind: 'lever', key: 'ekki_til', value: 1 }, ctx) === null);
  ok('óþekkt kind → null', projectRas({ kind: 'blah' }, ctx) === null);
}
// 6) valence = dir * polarity
{
  const p = projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx);
  const e = eff(p, 'verdbolga');   // verðbólga upp, polarity -1 → valence -1 (slæmt)
  ok('valence = dir*polarity', e && e.valence === -1);
}
// 7) determinismi
{
  const a = JSON.stringify(projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx));
  const b = JSON.stringify(projectRas({ kind: 'shock', key: 'olia', value: 40 }, ctx));
  ok('determinismi', a === b);
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra próf → á að falla**

Run: `node src/lib/roads/frett-ras.test.mjs`
Expected: FAIL — `Cannot find module './frett-ras.mjs'` eða `projectRas is not a function`.

- [ ] **Step 3: Útfæra `frett-ras.mjs`**

Create `src/lib/roads/frett-ras.mjs`:
```js
// Isomorphic (node bygging + vafri). Varpar frétta/þingmáls-„trigger" í tilbúið RÁS-spjald.
// Sim-hamur (lever/shock/preset): keyrir simulate → stærstu áhrif eftir 3 ár.
// Links-hamur (outcome, Type B): les fyrsta-stigs niðurstreymis-tengsl (útkoma er EKKI inntak).
import { simulate } from './engine.mjs';

const HORIZON = 12;                                        // 3 ár (ársfjórðungar)
const EPS = { '%': 0.05, 'pp': 0.05, '% VLF': 0.05, '': 0.3 };  // hverfandi-þröskuldur per einingu
const TOP_N = 4;
const epsFor = (u) => EPS[u] ?? 0.05;
const polarityOf = (baseline, k) => (baseline.outcomes[k] && typeof baseline.outcomes[k].polarity === 'number') ? baseline.outcomes[k].polarity : 0;

function deepLinkSim(levers, shocks) {
  const parts = [];
  for (const k in levers) parts.push('l.' + k + '=' + levers[k]);
  for (const k in shocks) parts.push('s.' + k + '=' + shocks[k]);
  return '/hermir/#' + parts.join('&');
}
function matchScenario(scenarios, levers, shocks) {
  if (!scenarios) return null;
  const eq = (a, b) => { const ak = Object.keys(a), bk = Object.keys(b); return ak.length === bk.length && ak.every((k) => b[k] === a[k]); };
  return scenarios.find((s) => eq(s.levers || {}, levers) && eq(s.shocks || {}, shocks)) || null;
}
function composeSentence(top) {
  const t = top.slice(0, 3).map((e) => e.label.toLowerCase() + ' ' + (e.dir > 0 ? 'hækkar' : 'lækkar'));
  return 'Samkvæmt RÁS: ' + t.join(', ') + ' (3 ára sýn).';
}
function composeLinksSentence(label, top) {
  const t = top.slice(0, 3).map((e) => e.label.toLowerCase() + ' ' + (e.dir > 0 ? '↑' : '↓'));
  return 'Breyting á «' + label + '» tengist skv. RÁS: ' + t.join(', ') + '.';
}

function simProjection(levers, shocks, ctx, opts) {
  const { baseline, links, scenarios } = ctx;
  let r;
  try { r = simulate({ baseline, links, levers, shocks, quarters: HORIZON }); }
  catch (e) { return null; }
  const last = HORIZON - 1, effects = [];
  for (const k in r.outcomes) {
    const o = r.outcomes[k], delta = o.mid[last] - o.baseline[last];
    if (!Number.isFinite(delta) || Math.abs(delta) < epsFor(o.unit)) continue;
    const dir = Math.sign(delta);
    effects.push({ key: k, label: o.label, delta: +delta.toFixed(3), dir, unit: o.unit, valence: dir * polarityOf(baseline, k) });
  }
  if (!effects.length) return null;
  effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topEffects = effects.slice(0, TOP_N);
  const sc = opts.sentence ? null : matchScenario(scenarios, levers, shocks);
  return {
    mode: 'sim', illustrative: !!opts.illustrative,
    inputLabel: opts.inputLabel || null,
    inputKey: opts.inputKey || Object.keys(levers)[0] || Object.keys(shocks)[0] || null,
    horizonQuarters: HORIZON, topEffects,
    sentence: opts.sentence || (sc && sc.sentence) || composeSentence(topEffects),
    deepLink: deepLinkSim(levers, shocks), source: 'RÁS-hermir',
  };
}

function linksProjection(key, bump, ctx) {
  const { baseline, links } = ctx;
  const down = links.filter((l) => l.from === key && l.to !== key && baseline.outcomes[l.to]);
  const effects = [];
  for (const l of down) {
    const delta = l.coef * bump;
    if (!Number.isFinite(delta) || delta === 0) continue;
    const dir = Math.sign(delta);
    effects.push({ key: l.to, label: baseline.outcomes[l.to].label, delta: +delta.toFixed(3), dir, unit: baseline.outcomes[l.to].unit, valence: dir * polarityOf(baseline, l.to), lag: l.lag || 0 });
  }
  if (!effects.length) return null;
  effects.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    mode: 'links', illustrative: true,
    inputLabel: baseline.outcomes[key].label, inputKey: key, perUnit: baseline.outcomes[key].unit,
    horizonQuarters: HORIZON, topEffects: effects.slice(0, TOP_N),
    sentence: composeLinksSentence(baseline.outcomes[key].label, effects.slice(0, TOP_N)),
    deepLink: '/hermir/#tb=model', source: 'RÁS-hermir',
  };
}

export function projectRas(trigger, ctx) {
  if (!trigger || !ctx || !ctx.baseline || !ctx.links) return null;
  const { baseline, scenarios } = ctx;
  if (trigger.kind === 'preset') {
    const sc = (scenarios || []).find((s) => s.id === trigger.id);
    if (!sc) return null;
    return simProjection(sc.levers || {}, sc.shocks || {}, ctx, { illustrative: false, sentence: sc.sentence, inputLabel: sc.label });
  }
  if (trigger.kind === 'lever') {
    if (!baseline.levers[trigger.key]) return null;
    return simProjection({ [trigger.key]: trigger.value }, {}, ctx, { illustrative: !!trigger.illustrative, inputKey: trigger.key });
  }
  if (trigger.kind === 'shock') {
    if (!baseline.shocks[trigger.key]) return null;
    return simProjection({}, { [trigger.key]: trigger.value }, ctx, { illustrative: !!trigger.illustrative, inputKey: trigger.key });
  }
  if (trigger.kind === 'outcome') {
    if (!baseline.outcomes[trigger.key]) return null;
    return linksProjection(trigger.key, trigger.bump ?? 1, ctx);
  }
  return null;
}
```

- [ ] **Step 4: Keyra próf → á að standast**

Run: `node src/lib/roads/frett-ras.test.mjs`
Expected: `13 pass, 0 fail`, `process.exit(0)`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/roads/frett-ras.mjs src/lib/roads/frett-ras.test.mjs
git commit -m "RÁS: frett-ras.mjs — projectRas (sim + tengsla-lestur)"
```

---

## Task 3: `render-ras-box.mjs` — deilt HTML-teiknari

**Files:**
- Create: `src/lib/roads/render-ras-box.mjs`
- Test: `src/lib/roads/render-ras-box.test.mjs`

**Interfaces:**
- Consumes: `RasProjection` frá Task 2.
- Produces: `export function renderRasBox(projection) → string` (HTML; tómur strengur ef ógilt/tómt).

- [ ] **Step 1: Skrifa fallandi próf**

Create `src/lib/roads/render-ras-box.test.mjs`:
```js
import { renderRasBox } from './render-ras-box.mjs';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const sim = { mode: 'sim', illustrative: false, inputLabel: 'Stýrivextir 9,00% → 8,50%', inputKey: 'vextir', horizonQuarters: 12,
  topEffects: [{ key: 'hagvoxtur', label: 'Hagvöxtur', delta: 0.4, dir: 1, unit: '%', valence: 1 }, { key: 'verdbolga', label: 'Verðbólga', delta: 0.3, dir: 1, unit: '%', valence: -1 }],
  sentence: 'Samkvæmt RÁS: hagvöxtur hækkar, verðbólga hækkar (3 ára sýn).', deepLink: '/hermir/#l.vextir=8.5', source: 'RÁS-hermir' };
const illu = { ...sim, illustrative: true };

ok('empty on null', renderRasBox(null) === '');
ok('empty on no effects', renderRasBox({ mode: 'sim', topEffects: [] }) === '');
const h = renderRasBox(sim);
ok('has header', h.includes('Samkvæmt RÁS'));
ok('has input label', h.includes('Stýrivextir 9,00% → 8,50%'));
ok('has effect label', h.includes('Hagvöxtur'));
ok('has deep link', h.includes('href="/hermir/#l.vextir=8.5"'));
ok('has disclaimer', h.includes('ekki spá'));
ok('no badge when not illustrative', !h.includes('dæmi til skýringar'));
ok('good color for +valence', h.includes('#54d08a'));
ok('bad color for -valence', h.includes('#e78284'));
ok('badge when illustrative', renderRasBox(illu).includes('dæmi til skýringar'));
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Keyra próf → á að falla**

Run: `node src/lib/roads/render-ras-box.test.mjs`
Expected: FAIL — `Cannot find module './render-ras-box.mjs'`.

- [ ] **Step 3: Útfæra `render-ras-box.mjs`**

Create `src/lib/roads/render-ras-box.mjs`:
```js
// Isomorphic HTML-strengs teiknari fyrir „Samkvæmt RÁS"-kassa (fréttavél + þingmál).
// Litir eftir valens (POLARITY·dir): grænt=gott, rautt=slæmt, blátt=hlutlaust. Sömu gildi og hermir.astro.
const COL = { '1': '#54d08a', '0': '#6ea8fe', '-1': '#e78284' };
const arrow = (dir) => dir > 0 ? '▲' : dir < 0 ? '▼' : '■';
function fmt(delta, unit) {
  const u = unit === '% VLF' ? '%' : unit;
  const dec = Math.abs(delta) < 1 ? 2 : 1;
  return (delta > 0 ? '+' : '') + delta.toLocaleString('is-IS', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (u ? ' ' + u : '');
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderRasBox(p) {
  if (!p || !Array.isArray(p.topEffects) || !p.topEffects.length) return '';
  const badge = p.illustrative ? '<span class="r-ras-badge">dæmi til skýringar</span>' : '';
  const perNote = p.mode === 'links' ? ' <span class="r-ras-per">(á hverja +1 ' + esc((p.perUnit === '' || p.perUnit == null) ? 'ein.' : p.perUnit) + ')</span>' : '';
  const rows = p.topEffects.map((e) => {
    const c = COL[String(e.valence)] || COL['0'];
    return '<div class="r-ras-row"><span class="r-ras-lbl">' + esc(e.label) + '</span>'
      + '<span class="r-ras-val" style="color:' + c + '">' + arrow(e.dir) + ' ' + esc(fmt(e.delta, e.unit)) + '</span></div>';
  }).join('');
  const disc = 'Stílfærð sviðsmynd úr opna RÁS-hermin um — ekki spá.' + (p.illustrative ? ' Byggt á dæmi-stærð.' : '');
  const cta = p.deepLink ? '<a class="r-ras-cta" href="' + esc(p.deepLink) + '">Prófa í RÁS →</a>' : '';
  return '<div class="r-ras">'
    + '<div class="r-ras-h">📊 Samkvæmt RÁS-hermi' + perNote + ' ' + badge + '</div>'
    + (p.inputLabel ? '<div class="r-ras-in">' + esc(p.inputLabel) + '</div>' : '')
    + '<div class="r-ras-rows">' + rows + '</div>'
    + (p.sentence ? '<p class="r-ras-s">' + esc(p.sentence) + '</p>' : '')
    + '<div class="r-ras-foot"><span class="r-ras-disc">' + esc(disc) + '</span>' + cta + '</div>'
    + '</div>';
}
```

- [ ] **Step 4: Keyra próf → á að standast**

Run: `node src/lib/roads/render-ras-box.test.mjs`
Expected: `11 pass, 0 fail`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/roads/render-ras-box.mjs src/lib/roads/render-ras-box.test.mjs
git commit -m "RÁS: render-ras-box.mjs — deilt HTML-teiknari"
```

---

## Task 4: Fréttavél — vörpun + kassi á fréttasíðu

**Files:**
- Modify: `skriptur/build_frettavel.js` (top-imports ~20; í `main()` áður en `published`/archive byggist, ~fyrir línu 943)
- Modify: `web/src/pages/frettavel/[id].astro` (frontmatter-import ~5–10; markup ~eftir línu 65; CSS ~eftir 177)

**Interfaces:**
- Consumes: `projectRas` (Task 2), `renderRasBox` (Task 3), `it.facts.ras` úr archive.
- Produces: `ev.facts.ras` (RasProjection) á macro-fréttum; teiknaður kassi á `/frettavel/<id>/`.

**Vörpunar-tafla (regla):**
| `type` | trigger | tegund |
|---|---|---|
| `vextir` | `{kind:'lever', key:'vextir', value: facts.nyir}` | A · sim (tölur) |
| `gengi` | `{kind:'shock', key:'gengi', value: facts.met==='hæsta' ? -5 : 5, illustrative:true}` | A · sim (dæmi-stærð; met=hæsta→veikari króna→neikvætt sjokk) |
| `verdbolga` | `{kind:'outcome', key:'verdbolga'}` | B · links |
| `atv` | `{kind:'outcome', key:'atvinnuleysi'}` | B · links |
| `fast` / `fastthr` | `{kind:'outcome', key:'husnaedi'}` | B · links |

(`leiga` er SLEPPT — `husnaedi` er eina húsnæðis-útkoman með niðurstreymis-tengsl; `leiga` skilar `null`. `vika`/`thema` sleppt í fyrsta kasti.)

- [ ] **Step 1: Bæta RÁS-vörpun í `build_frettavel.js`**

Efst í `skriptur/build_frettavel.js` (eftir línu 27, `const TODAY = …`), bæta við hleðslu módel-gagna og vörpunar-korti:
```js
// RÁS-vörpun: macro-fréttir fá projection úr þjóðhags-herminum (bakað í facts → archive → article-síðu).
const RAS_ROOT = path.join(__dirname, '..', 'gogn', 'roads');
const RJ = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RAS_ROOT, f), 'utf8')); } catch (e) { return null; } };
const RAS_CTX = (() => { const b = RJ('baseline.json'), l = RJ('links.json'), s = RJ('scenarios.json'); return (b && l) ? { baseline: b, links: l, scenarios: s || [] } : null; })();
const RAS_MAP = {
  vextir: (f) => (typeof f.nyir === 'number' ? { kind: 'lever', key: 'vextir', value: f.nyir } : null),
  gengi: (f) => ({ kind: 'shock', key: 'gengi', value: f.met === 'hæsta' ? -5 : 5, illustrative: true }),
  verdbolga: () => ({ kind: 'outcome', key: 'verdbolga' }),
  atv: () => ({ kind: 'outcome', key: 'atvinnuleysi' }),
  fast: () => ({ kind: 'outcome', key: 'husnaedi' }),
  fastthr: () => ({ kind: 'outcome', key: 'husnaedi' }),
};
```

Í `main()` (`async function main()` — það er ESM-CJS blendingur; `main` er async), rétt eftir að `ev` er fullbyggt af `detect(...)` og áður en fréttir eru birtar/archiveaðar (þ.e. áður en `published`/`archById` byggist, ~lína 943), bæta við:
```js
  // RÁS-projection á macro-fréttir (regla per skynjara). Þögult ef módel vantar eða projection = null.
  if (RAS_CTX) {
    const { projectRas } = await import('../src/lib/roads/frett-ras.mjs');
    for (const e of ev) {
      const mk = RAS_MAP[e.type];
      if (!mk || !e.facts) continue;
      const trig = mk(e.facts);
      if (!trig) continue;
      const proj = projectRas(trig, RAS_CTX);
      if (proj) e.facts.ras = proj;
    }
  }
```
(Ef `detect` skilar öðru breytu-nafni en `ev`, nota það nafn. Staðfesta að `ev` sé fylkið sem verður að `published`; ef `main` er ekki þegar `async`, gera hana `async` eða nota `require`-samhæfða dynamíska hleðslu.)

- [ ] **Step 2: Keyra fréttavél-byggingu og staðfesta `ras` í archive**

Run: `node skriptur/build_frettavel.js`
Síðan:
```bash
node -e 'const a=require("./gogn/frettavel_archive.json");const n=a.items.filter(it=>it.facts&&it.facts.ras).length;console.log("fréttir með ras:",n);const s=a.items.find(it=>it.facts&&it.facts.ras);console.log(s?JSON.stringify(s.facts.ras,null,1).slice(0,400):"(engin núna)")'
```
Expected: prentar fjölda (getur verið 0 í dag ef engin macro-frétt fór af stað — það er í lagi; ef 0, halda áfram og treysta einingaprófunum). Ef > 0, `ras`-hluturinn hefur `mode`, `topEffects`, `deepLink`.

- [ ] **Step 3: Teikna kassann á fréttasíðu**

Í `web/src/pages/frettavel/[id].astro`, bæta imporri í frontmatter (eftir línu 10, með hinum lib-imporunum):
```js
import { renderRasBox } from '@lib/roads/render-ras-box.mjs';
```
Bæta reiknuðum streng eftir `const dags = dIS(it.date);` (~lína 29):
```js
const rasHtml = it.facts && it.facts.ras ? renderRasBox(it.facts.ras) : '';
```
Í markup, beint eftir `fv-samhengi`-blokkinni (eftir línu 65), bæta við:
```astro
      {rasHtml && <div class="r-ras-wrap" set:html={rasHtml} />}
```

- [ ] **Step 4: Bæta CSS fyrir kassann**

Í `<style>` `web/src/pages/frettavel/[id].astro` (eftir `.fv-samhengi`-reglurnar, ~lína 177), bæta við (`is:global` ekki þörf — Astro scoped CSS nær `set:html` börnum EF við notum `:global()`; nota `:global()` þar sem við á):
```css
    .r-ras-wrap { margin: 0 0 22px; }
    .r-ras-wrap :global(.r-ras) { border: 1px solid color-mix(in srgb, #6ea8fe 30%, transparent); background: color-mix(in srgb, #6ea8fe 7%, transparent); border-radius: 12px; padding: 14px 16px; }
    .r-ras-wrap :global(.r-ras-h) { font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #9db6e6; font-weight: 700; margin-bottom: 8px; }
    .r-ras-wrap :global(.r-ras-badge) { font-size: 10.5px; text-transform: none; letter-spacing: 0; background: #3a2a12; color: #f6b13b; border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
    .r-ras-wrap :global(.r-ras-per) { font-size: 10.5px; text-transform: none; letter-spacing: 0; color: var(--muted, #9fb0c8); }
    .r-ras-wrap :global(.r-ras-in) { font-size: 13.5px; font-weight: 600; color: var(--ink); margin-bottom: 8px; }
    .r-ras-wrap :global(.r-ras-row) { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; padding: 3px 0; border-top: 1px solid rgba(255,255,255,.06); }
    .r-ras-wrap :global(.r-ras-row:first-child) { border-top: 0; }
    .r-ras-wrap :global(.r-ras-val) { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .r-ras-wrap :global(.r-ras-s) { font-size: 13.5px; line-height: 1.5; color: var(--ink); margin: 10px 0 0; }
    .r-ras-wrap :global(.r-ras-foot) { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
    .r-ras-wrap :global(.r-ras-disc) { font-size: 11px; color: var(--faint, #7b879c); }
    .r-ras-wrap :global(.r-ras-cta) { font-size: 12.5px; font-weight: 700; color: #6ea8fe; text-decoration: none; white-space: nowrap; }
```

- [ ] **Step 5: Byggja og staðfesta í vafra**

Run: `cd web && npx astro build` (Expected: `Complete!`, engin villa).
Ræsa preview „mitt-svaedi" (port 4405), fletta á fréttasíðu með `ras` (finna slug: `node -e 'const a=require("./gogn/frettavel_archive.json");const s=a.items.find(it=>it.facts&&it.facts.ras);console.log(s?require("./web/src/lib/frettavel.mjs").asciiId(s.id):"(engin)")'` — ef „(engin)", byggja tímabundna prófunar-frétt eða staðfesta með einingaprófunum í stað vafra).
Í vafra: `read_console_messages` (engar villur) + `javascript_tool`: staðfesta `.r-ras` er til og `.r-ras-cta` href byrjar á `/hermir/#`.

- [ ] **Step 6: Commit**
```bash
git add skriptur/build_frettavel.js web/src/pages/frettavel/[id].astro gogn/frettavel_archive.json web/public/gogn/frettavel_archive.json
git commit -m "RÁS: fréttavél — projection á macro-fréttir + kassi á fréttasíðu"
```

---

## Task 5: Þingmál — haiku-flokkun frumvarpa (einangrað skript)

**Files:**
- Create: `skriptur/build_thingmal_ras.mjs`

**Interfaces:**
- Consumes: `gogn/frumvorp.json`, `gogn/roads/{baseline,links,scenarios}.json`, `projectRas` (Task 2), `@anthropic-ai/sdk`.
- Produces: `b.ras` (RasProjection með `illustrative:true`) á efnahagslega markverðum frumvörpum í `gogn/frumvorp.json`; cache `gogn/thingmal_ras.json` (lykill `157_<nr>`).

**Athugasemd (frávik frá spec):** Spec sagði „víkka sömu `build_summaries.js`-köllun". Þessi áætlun notar í staðinn NÝTT einangrað skript með ÓDÝRU haiku-líkani — til að snerta ekki lifandi/cache-aða opus-samantektar-slóðina (áhættuminna) og halda kostnaði lágum. Flaggað notanda við afhendingu.

**`RAS_SIZE`-tafla (curað dæmi-stærðir):**
```js
const RAS_SIZE = {
  skattar:{lítil:3,meðal:5,stór:10}, fjarmagnstekjuskattur:{lítil:3,meðal:5,stór:10}, tryggingagjald:{lítil:3,meðal:5,stór:10},
  utgjold:{lítil:5,meðal:10,stór:20}, innvidir:{lítil:5,meðal:10,stór:20},
  kolefnisgjald:{lítil:25,meðal:50,stór:100},
  kvoti:{lítil:10,meðal:20,stór:30}, veidigjald:{lítil:10,meðal:20,stór:30},
  orka:{lítil:10,meðal:15,stór:30}, orkuskipti:{lítil:10,meðal:15,stór:30}, skograekt:{lítil:10,meðal:15,stór:30},
  frambod:{lítil:10,meðal:20,stór:30}, leiguhusnaedi:{lítil:10,meðal:20,stór:30}, lodaframbod:{lítil:10,meðal:20,stór:30},
};
```

- [ ] **Step 1: Skrifa skriptið með `--dry`-prófham**

Create `skriptur/build_thingmal_ras.mjs`:
```js
// Efnahagsleg RÁS-flokkun frumvarpa (einangrað, ódýrt haiku-líkan). Bakar b.ras í frumvorp.json.
// Keyra: node skriptur/build_thingmal_ras.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRas } from '../src/lib/roads/frett-ras.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOGN = join(__dirname, '..', 'gogn');
const RAS = join(GOGN, 'roads');
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));
const LTHING = process.env.KARP_LTHING || '157';
const MODEL = process.env.KARP_THINGRAS_MODEL || 'claude-haiku-4-5-20251001';
const DRY = process.argv.includes('--dry');

const baseline = rj(join(RAS, 'baseline.json'));
const links = rj(join(RAS, 'links.json'));
const scenarios = existsSync(join(RAS, 'scenarios.json')) ? rj(join(RAS, 'scenarios.json')) : [];
const CTX = { baseline, links, scenarios };
const LEVER_KEYS = Object.keys(baseline.levers);
const SHOCK_KEYS = Object.keys(baseline.shocks);
const RAS_SIZE = { skattar:{lítil:3,meðal:5,stór:10}, fjarmagnstekjuskattur:{lítil:3,meðal:5,stór:10}, tryggingagjald:{lítil:3,meðal:5,stór:10}, utgjold:{lítil:5,meðal:10,stór:20}, innvidir:{lítil:5,meðal:10,stór:20}, kolefnisgjald:{lítil:25,meðal:50,stór:100}, kvoti:{lítil:10,meðal:20,stór:30}, veidigjald:{lítil:10,meðal:20,stór:30}, orka:{lítil:10,meðal:15,stór:30}, orkuskipti:{lítil:10,meðal:15,stór:30}, skograekt:{lítil:10,meðal:15,stór:30}, frambod:{lítil:10,meðal:20,stór:30}, leiguhusnaedi:{lítil:10,meðal:20,stór:30}, lodaframbod:{lítil:10,meðal:20,stór:30} };
// Efnahags-hlið: aðeins kalla LLM fyrir mál sem líklega snerta líkanið (spara kostnað).
const ECON_KW = /skatt|virðisauk|tolla|gjald|fjárlög|fjáraukalög|ríkisfj|útgj|húsnæð|íbúð|leigu|byggingarl|lóða|fisk|kvóta|veiðig|orku|orka|kolefni|loftslag|innvið|vegal|samgöng|nýsköp|ívilnan|lífeyri|kjarasamn|tryggingagj|skógrækt|votlend|fiskeldi/i;

function magOf(key, dir, size) {
  const tbl = RAS_SIZE[key];
  const base = tbl ? (tbl[size] ?? tbl['meðal']) : ((baseline.levers[key]?.step || 5) * (size === 'lítil' ? 1 : size === 'stór' ? 4 : 2));
  return dir * base;
}

const SYSTEM = [
  'Þú flokkar íslensk þingmál eftir áhrifum á þjóðhagslíkan (RÁS).',
  'Skilaðu AÐEINS JSON: {"relevant":bool,"key":streng|null,"dir":1|-1,"size":"lítil"|"meðal"|"stór","why":streng}.',
  'relevant=false ef málið hefur ENGIN bein þjóðhagsleg áhrif (þá key=null).',
  'key VERÐUR að vera einn af þessum inntökum líkansins (annars relevant=false):',
  'SLEÐAR: ' + LEVER_KEYS.join(', '),
  'SJOKK: ' + SHOCK_KEYS.join(', '),
  'dir=1 ef málið HÆKKAR/EYKUR inntakið, dir=-1 ef það LÆKKAR/MINNKAR það.',
  'size = gróft umfang breytingar. why = stutt röksemd (<12 orð).',
].join('\n');

function parseRas(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
    const o = JSON.parse(m[0]);
    if (!o.relevant || !o.key) return null;
    if (!LEVER_KEYS.includes(o.key) && !SHOCK_KEYS.includes(o.key)) return null;
    const dir = o.dir === -1 ? -1 : 1;
    const size = ['lítil', 'meðal', 'stór'].includes(o.size) ? o.size : 'meðal';
    return { key: o.key, dir, size, why: String(o.why || '').slice(0, 120) };
  } catch (e) { return null; }
}

async function main() {
  const bills = rj(join(GOGN, 'frumvorp.json'));
  const cachePath = join(GOGN, 'thingmal_ras.json');
  let cache = {}; if (existsSync(cachePath)) { try { cache = rj(cachePath); } catch (e) {} }
  const todo = bills.filter((b) => (b.hs === 'Frv.' || b.hs === 'Till.') && ECON_KW.test((b.titill || '') + ' ' + (b.sam || '')) && !cache[LTHING + '_' + b.nr]);
  console.log(`RÁS-þingmál: ${todo.length} ný mál til flokkunar (af ${bills.length}).`);

  let client = null;
  if (!DRY && todo.length) {
    const p = await import('@anthropic-ai/sdk'); const Anthropic = p.Anthropic || p.default || p;
    client = new Anthropic();
  }
  for (const b of todo) {
    let cls = null;
    if (client) {
      try {
        const user = 'Titill: ' + (b.titill || '') + '\nTegund: ' + (b.teg || '') + '\nSamantekt: ' + (b.sam || '—');
        const msg = await client.messages.create({ model: MODEL, max_tokens: 160, system: SYSTEM, messages: [{ role: 'user', content: user }] });
        const blk = (msg.content || []).find((x) => x.type === 'text');
        cls = blk ? parseRas(blk.text) : null;
      } catch (e) { console.log('  villa', b.nr, e.message); }
    }
    cache[LTHING + '_' + b.nr] = cls || { none: true };
  }

  // Baka projection inn í bills úr cache (öll mál, líka áður cache-uð).
  let n = 0;
  for (const b of bills) {
    const c = cache[LTHING + '_' + b.nr];
    if (!c || c.none) { if (b.ras) delete b.ras; continue; }
    const value = magOf(c.key, c.dir, c.size);
    const kind = LEVER_KEYS.includes(c.key) ? 'lever' : 'shock';
    const proj = projectRas({ kind, key: c.key, value, illustrative: true }, CTX);
    if (proj) { b.ras = { ...proj, illustrative: true, why: c.why }; n++; } else if (b.ras) delete b.ras;
  }
  console.log(`RÁS-þingmál: ${n} mál með projection.`);
  if (!DRY) {
    writeFileSync(cachePath, JSON.stringify(cache));
    writeFileSync(join(GOGN, 'frumvorp.json'), JSON.stringify(bills));
    console.log('Skrifað: gogn/frumvorp.json + gogn/thingmal_ras.json');
  } else console.log('(--dry: engin skrif)');
}
main();
```

- [ ] **Step 2: Þurr-keyra (engin API-köllun, engin skrif)**

Run: `node skriptur/build_thingmal_ras.mjs --dry`
Expected: prentar `RÁS-þingmál: <N> ný mál til flokkunar (af <M>).` og `0 mál með projection.` (enginn cache enn) og `(--dry: engin skrif)`. Engin villa, engin API-lykill þörf.

- [ ] **Step 3: Raun-keyra (þarf `ANTHROPIC_API_KEY`)**

Run: `node skriptur/build_thingmal_ras.mjs`
Expected: `<N> ný mál til flokkunar`, síðan `<n> mál með projection`, `Skrifað: …`. Staðfesta:
```bash
node -e 'const b=require("./gogn/frumvorp.json");const r=b.filter(x=>x.ras);console.log("frumvörp með ras:",r.length);if(r[0])console.log(JSON.stringify(r[0].ras,null,1).slice(0,400))'
```
Expected: `frumvörp með ras: <n>` (> 0 ef einhver efnahags-mál eru til), fyrsta `ras` hefur `mode`, `topEffects`, `illustrative:true`, `deepLink`.

(Ef `ANTHROPIC_API_KEY` vantar í dev: hoppa yfir Step 3, láta Task 6 nota handvirkt sett prófunar-`ras` á eitt mál til vafra-staðfestingar, og treysta á CI/nætur-keyrslu fyrir raun-gögn. Skjalfesta þessa ákvörðun í commit.)

- [ ] **Step 4: Commit**
```bash
git add skriptur/build_thingmal_ras.mjs gogn/frumvorp.json gogn/thingmal_ras.json
git commit -m "RÁS: þingmál — haiku-flokkun frumvarpa → b.ras (einangrað skript)"
```

---

## Task 6: Þingmál — flís á spjaldi + kassi í glugga

**Files:**
- Modify: `web/src/pages/thingmal.astro` (bill-map ~16–36; `#d-bills` blob ~lína 40; card ~135–150; `<script>`-import + `bmOpen` ~330–353; CSS)

**Interfaces:**
- Consumes: `b.ras` úr `frumvorp.json` (Task 5), `renderRasBox` (Task 3).
- Produces: RÁS-flís á spjaldi + fullur kassi í `bmOpen`-glugga.

- [ ] **Step 1: Bera `ras` inn í bill-map og `#d-bills`**

Í frontmatter `web/src/pages/thingmal.astro`, í `.map((b) => {...})` (línur 16–36), bæta `ras` í skilaða hlutinn (eftir `parties:`-línuna):
```js
      ras: b.ras || null,
```
Finna `#d-bills` JSON-blobbið (byggt í frontmatter ~lína 40, `BILLS`-kortið keyed `mal_<nr>`) og bæta `ras: b.ras || null` við hvern hlut þar líka (svo `bmOpen`'s `d.ras` sé til). Ef `BILLS` er byggt úr sömu `bills`-uppsprettu, dugar eitt `ras`-svið.

- [ ] **Step 2: Flís á spjaldi**

Í card-markup (eftir `{b.sam && <p class="b-sam">{b.sam}</p>}`, ~lína 143), bæta við flís með stærsta áhrifi:
```astro
          {b.ras && b.ras.topEffects && b.ras.topEffects[0] && (
            <p class="b-ras-chip">📊 RÁS: {b.ras.topEffects[0].label} {b.ras.topEffects[0].dir > 0 ? '▲' : '▼'}<span class="b-ras-more"> · sjá nánar</span></p>
          )}
```

- [ ] **Step 3: Kassi í glugga (`bmOpen`)**

Efst í `<script>`-blokk `thingmal.astro` (þar sem client-JS er), bæta imporri:
```js
import { renderRasBox } from '@lib/roads/render-ras-box.mjs';
```
Í `bmOpen`, eftir `bm-sam`-línuna (`if (d.sam) h += …`, ~lína 341), bæta við:
```js
      if (d.ras) h += renderRasBox(d.ras);
```

- [ ] **Step 4: CSS fyrir flís + kassa í glugga**

Í `<style>` `thingmal.astro`, bæta við (nota `:global()` fyrir kassa sem kemur úr `innerHTML`; flísin er í Astro-markup svo scoped):
```css
  .b-ras-chip { font-size: 12px; color: #9db6e6; margin: 4px 0 0; }
  .b-ras-more { color: var(--muted, #9fb0c8); }
  :global(.bm-body .r-ras) { border: 1px solid color-mix(in srgb, #6ea8fe 30%, transparent); background: color-mix(in srgb, #6ea8fe 8%, transparent); border-radius: 10px; padding: 12px 14px; margin: 12px 0 0; }
  :global(.bm-body .r-ras-h) { font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: #9db6e6; font-weight: 700; margin-bottom: 7px; }
  :global(.bm-body .r-ras-badge) { font-size: 10px; text-transform: none; letter-spacing: 0; background: #3a2a12; color: #f6b13b; border-radius: 5px; padding: 1px 5px; margin-left: 4px; }
  :global(.bm-body .r-ras-per) { font-size: 10px; text-transform: none; letter-spacing: 0; color: var(--muted, #9fb0c8); }
  :global(.bm-body .r-ras-in) { font-size: 13px; font-weight: 600; margin-bottom: 7px; }
  :global(.bm-body .r-ras-row) { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 3px 0; border-top: 1px solid rgba(255,255,255,.06); }
  :global(.bm-body .r-ras-row:first-child) { border-top: 0; }
  :global(.bm-body .r-ras-val) { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  :global(.bm-body .r-ras-s) { font-size: 13px; line-height: 1.5; margin: 9px 0 0; }
  :global(.bm-body .r-ras-foot) { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 9px; flex-wrap: wrap; }
  :global(.bm-body .r-ras-disc) { font-size: 10.5px; color: var(--faint, #7b879c); }
  :global(.bm-body .r-ras-cta) { font-size: 12px; font-weight: 700; color: #6ea8fe; text-decoration: none; white-space: nowrap; }
```

- [ ] **Step 5: Byggja og staðfesta í vafra**

Run: `cd web && npx astro build` (Expected: `Complete!`).
Ef ekkert raun-`ras`-mál er til (Task 5 Step 3 sleppt), setja tímabundið prófunar-`ras` á eitt mál í `gogn/frumvorp.json` handvirkt til staðfestingar (afturkalla eftir).
Preview „mitt-svaedi" (4405) → `/thingmal/`: staðfesta flís á spjaldi (`.b-ras-chip`), opna glugga (smella á titil), staðfesta `.r-ras` í `.bm-body`, `.r-ras-cta` href á `/hermir/#`. `read_console_messages`: engar villur.

- [ ] **Step 6: Commit**
```bash
git add web/src/pages/thingmal.astro
git commit -m "RÁS: þingmál — flís á spjaldi + kassi í glugga"
```

---

## Task 7: Heildar-bygging, vafra-staðfesting og deploy

**Files:** engin (verifun + deploy).

- [ ] **Step 1: Keyra öll ný/snert próf**

Run hvert og eitt, öll `0 fail`:
```
node src/lib/roads/polarity.test.mjs
node src/lib/roads/frett-ras.test.mjs
node src/lib/roads/render-ras-box.test.mjs
node src/lib/roads/engine.test.mjs
node skriptur/backtest_roads.mjs
```

- [ ] **Step 2: Heildar-bygging**

Run: `cd web && npx astro build`
Expected: `Complete!`, ~3529 síður, engin villa.

- [ ] **Step 3: Vafra-staðfesting beggja síðna**

Preview „mitt-svaedi" (port 4405). Staðfesta með `read_console_messages` (engar villur), `javascript_tool`/`read_page`:
- Ein fréttasíða með `ras` → `.r-ras` sýnilegt, `.r-ras-cta` → `/hermir/#…`.
- `/thingmal/` → flís á a.m.k. einu spjaldi, gluggi sýnir kassa.
- Fylgja einum „Prófa í RÁS →" hlekk → `/hermir/#…` hleður réttri sviðsmynd (sleði/sjokk færður).

- [ ] **Step 4: Deploy**

```bash
git push origin b2b-topbar:main
```
Expected: `… b2b-topbar -> main`. Cloudflare Pages + worker byggja sjálfkrafa.

- [ ] **Step 5: Uppfæra minni**

Uppfæra `MEMORY.md` + `karp-roads-hermir.md` (og/eða `karp-frettavel.md`, `karp-thingmannaskyrsla.md`) með nýrri RÁS↔frétt/þingmál-tengingu og commit-hash.

---

## Self-review (spec-þekja)

- Umfang bæði (A sim / B links): Task 2 (`projectRas` sim+links) + Task 4 (vörpun) ✓
- Skýringar-stærð með tölum: gengi (Task 4) + þingmál `RAS_SIZE` (Task 5), `illustrative`+badge+fyrirvari (Task 3) ✓
- Regla fréttavél / LLM þingmál: Task 4 (RAS_MAP) / Task 5 (haiku) ✓
- Byggingartími, vél óbreytt: Tasks 4–6 baka í HTML; engin `engine.mjs`-breyting ✓
- POLARITY ein heimild: Task 1 ✓
- Djúp-hlekkur `#l./#s./#tb`: `frett-ras.mjs` (Task 2), prófað ✓
- Deilt teiknari: `render-ras-box.mjs` (Task 3), notað í Tasks 4 & 6 ✓
- gogn-slóð repo (ekki OneDrive): Task 5 skrifar `gogn/` ✓
- **Frávik frá spec (flagga notanda):** (1) `leiga` sleppt — engin niðurstreymis-tengsl; (2) `gengi` er illustrative (facts hafa enga %-breytingu); (3) þingmál nota nýtt einangrað haiku-skript í stað þess að víkka opus-samantektar-köllunina (áhættuminna).
