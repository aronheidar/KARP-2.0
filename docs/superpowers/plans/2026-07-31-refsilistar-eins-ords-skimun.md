# Refsilista-skimun: eins-orðs nöfn í aðskildu veiku lagi — útfærslu-áætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gera eins-orðs refsilista-færslur (Rosneft, Hamas, PKK — 3.419 talsins) sýnilegar í worker sem aðskilið *veikt* lag sem getur aldrei framkallað krítíska viðvörun, áhættueinkunnina „Há" eða lækkað lánshæfismat.

**Architecture:** Lyklunar-rökin flytjast úr `veitur.mjs` í nýja hreina einingu `web/src/lib/refsilistar.mjs` (leysir memo-vandamálið — `SANCTIONS_IDX` er modúl-breyta sem prófin komast ekki að). Einingin byggir **tvær** vísitölur: `sterk` (`fyrsta|síðasta`, bitfyrir-bit óbreytt) og `veik` (fullt tóken, aðeins raunveruleg eins-orðs nöfn). Veikar samsvaranir fara í systur-sviðið `veikar` — aldrei í `hits`. Þar sem allir fjórir alvarlegu neytendurnir lesa eingöngu `.hits`, er vörnin byggingarleg.

**Tech Stack:** Vanilla ESM (`.mjs`), Cloudflare Workers (V8 isolate), `node:test` + `node:assert/strict`. Engin ný dependency.

**Hönnun:** `docs/superpowers/specs/2026-07-31-refsilistar-eins-ords-skimun-design.md`

**Vinnusvæði:** `C:\Users\aronh\dev\KARP\refsilistar-wt` (detached worktree af `origin/main`). **Committaðu strax eftir hvert verk** — automation keyrir `git reset --hard origin/main` og klobbar óskuldbundið.

---

## Global Constraints

- **Eina reglan sem má ekki brjóta:** veik samsvörun kemst ALDREI í `hits`, hvorki í `sanctionsHandler` né `kycScreenKt`. Fjórir neytendur lesa `.hits` og hver þeirra framkallar alvarlega afleiðingu — sjá „Ósnertanlegu línurnar" hér að neðan.
- **Sterka lagið er bitfyrir-bit óbreytt.** Fjöl-orða hegðun má ekki breytast á nokkurn hátt: sama `fyrsta|síðasta`-lyklun, sama „fyrsta færsla vinnur"-regla (`if (!idx.has(key))`), sama 40-nafna þak.
- **Skilagildi `hits` heldur núverandi lögun:** `{ nafn, listi, listar }` í `sanctionsHandler`, `{ name }` í `kycScreenKt`. Ekki samræma þau — `kyc.mjs` lyklar á `x.name`.
- Hrein eining: engin `env`, ekkert `fetch`, engin memo-un, engin `Date.now()`.
- Athugasemdir á íslensku, í stíl við kringliggjandi kóða.
- Commit-skilaboð á íslensku með `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Prófin keyrð með `cd web && npm test` (`node --test src/lib/*.test.mjs test/*.test.mjs`).
- **Slóðir:** `npm`-skipanir keyra úr `web/`, `git`-skipanir úr rót worktree-sins. Farðu aftur í rótina áður en þú committar.
- **Línunúmer eru vísbending, ekki lykill.** Task 2 breytir lengd `veitur.mjs`, svo númerin í Task 3 færast til. Finndu blokkirnar á innihaldinu sem tilgreint er, ekki á númerinu.
- **Ekkert commit má skilja kóðann eftir brotinn.** `sanctionsIndex` er deilt milli þriggja kallstaða; ef skilagildi þess breytist í einu verki verða hinir að vera aðlagaðir í SAMA commit-i. Þess vegna á Task 2 skref 1b. Automation ýtir á main daglega — hálfklárað millistig kemst í loftið.

### Ósnertanlegu línurnar

Ekkert verk í þessari áætlun má breyta þessum fjórum stöðum. Þeir lesa `.hits` og eiga að halda áfram að gera það:

| Skrá | Lína | Afleiðing af `.hits` |
|---|---|---|
| `web/src/lib/kyc.mjs` | 24 | `kind:'sanctions_hit', severity:'critical'` |
| `web/src/lib/kyc.mjs` | 60 | `deriveRisk → 'Há'` |
| `web/src/worker/cron.mjs` | 23 | `kycCriticalCron` → tafarlaus póstur |
| `web/src/pages/fyrirtaeki.astro` | 1279 | lánshæfismat `delta:-50, cap:20` → E |

---

## File Structure

| Skrá | Aðgerð | Ábyrgð |
|---|---|---|
| `web/src/lib/refsilistar.mjs` | **ný** | Öll lyklunar- og samsvörunarrök. Hrein. |
| `web/src/lib/refsilistar.test.mjs` | **ný** | Einingapróf fyrir ofangreint. |
| `web/src/worker/veitur.mjs` | breytt | `sanctionsIndex` + `sanctionsHandler` + `kycScreenKt` nota eininguna. |
| `web/src/lib/kyc.test.mjs` | breytt | Varnarpróf: `veikar` framkallar hvorki atburð né „Há". |
| `web/src/pages/fyrirtaeki.astro` | breytt | F9-flís birtir veika lagið á aðskilinni línu. |

---

## Task 1: Hrein eining `refsilistar.mjs`

**Files:**
- Create: `web/src/lib/refsilistar.mjs`
- Test: `web/src/lib/refsilistar.test.mjs`

**Interfaces:**
- Consumes: ekkert (fyrsta verk).
- Produces:
  - `sancNorm(s: string) → string` — normaliserar nafn (óbreytt frá `veitur.mjs:45`).
  - `byggjaVisitolu(names: Array<{n,nafn,listar}>) → { sterk: Map, veik: Map }` — gildi beggja korta er `{ nafn, listar }`.
  - `skima(visitala: {sterk,veik}, rawNafn: string) → null | { flokkur: 'sterk'|'veik', lykill: string, listi: string, listar: string }`.

- [ ] **Step 1: Write the failing test**

Búðu til `web/src/lib/refsilistar.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { byggjaVisitolu, sancNorm, skima } from './refsilistar.mjs';

// Raunveruleg sýnishorn úr web/public/gogn/sanctions.json (2026-07-31).
const NAMES = [
  // fjöl-orða — sterka lagið
  { n: 'saddam hussein al tikriti', nafn: 'Saddam Hussein Al-Tikriti', listar: 'ESB,SÞ,OFAC' },
  // raunveruleg eins-orðs nöfn — veika lagið
  { n: 'hamas', nafn: 'Hamas', listar: 'ESB,OFAC' },
  { n: 'pkk', nafn: 'PKK', listar: 'ESB,OFAC' },
  { n: 'pij', nafn: 'PIJ', listar: 'ESB,OFAC' },
  { n: 'rosneft', nafn: 'ROSNEFT', listar: 'OFAC' },
  { n: 'nova', nafn: 'NOVA', listar: 'OFAC' },
  { n: 'ssl', nafn: 'SSL', listar: 'ESB' },
  // eitt orð í birtingu EN með tölu-viðskeyti — sancNorm hendir tölunni, svo lykillinn
  // verður berorða ('maia'). Færslan á heima í vísitölunni en má aðeins samsvara
  // stafréttri fyrirspurn, ekki berorðinu einu.
  { n: 'maia', nafn: 'MAIA-1', listar: 'OFAC' },
  { n: 'netex', nafn: 'NETEX24', listar: 'OFAC' },
  // gervifærslur — normaliseringin bjó til eins-orðs nafn úr fjöl-orða nafni
  { n: 'omega', nafn: 'полковник Omega', listar: 'ESB' },
  { n: 'department', nafn: 'Department 140/16', listar: 'ESB,OFAC' },
  { n: 'navis', nafn: 'NAVIS 6', listar: 'OFAC' },
  { n: 'kani', nafn: 'бригада Kani', listar: 'ESB' },
];
const VT = byggjaVisitolu(NAMES);

test('sancNorm: lágstafar, fjarlægir broddstafi, heldur ð/þ/æ', () => {
  assert.equal(sancNorm('Þórður Ævarsson'), 'þorður ævarsson');
  assert.equal(sancNorm('  Al-Qaida  '), 'al qaida');
  assert.equal(sancNorm(null), '');
});

test('sterka lagið: fjöl-orða lyklun óbreytt (fyrsta|síðasta)', () => {
  assert.equal(VT.sterk.get('saddam|tikriti').nafn, 'Saddam Hussein Al-Tikriti');
  const m = skima(VT, 'Saddam Hussein Al-Tikriti');
  assert.equal(m.flokkur, 'sterk');
  assert.equal(m.listar, 'ESB,SÞ,OFAC');
});

test('sterka lagið heldur millinafna-frjálsri lyklun', () => {
  // fyrsta+síðasta ræður — millinöfn skipta ekki máli (núverandi hegðun)
  assert.equal(skima(VT, 'Saddam Al Tikriti').flokkur, 'sterk');
});

test('veika lagið: raunveruleg eins-orðs nöfn finnast', () => {
  for (const [q, listi] of [['Hamas', 'Hamas'], ['PKK', 'PKK'], ['PIJ', 'PIJ'], ['Rosneft', 'ROSNEFT']]) {
    const m = skima(VT, q);
    assert.ok(m, q + ' átti að finnast');
    assert.equal(m.flokkur, 'veik');
    assert.equal(m.listi, listi);
  }
});

test('VÖRN: eins-orðs samsvörun er ALDREI sterk', () => {
  // Þetta er prófið sem ver söluvöruna — Nova hf. má aldrei verða krítísk.
  const m = skima(VT, 'Nova');
  assert.equal(m.flokkur, 'veik');
  assert.equal(VT.sterk.size, 1, 'aðeins fjöl-orða færslan á heima í sterku vísitölunni');
});

test('VÖRN: normaliserunar-gervifærslur komast ekki í veiku vísitöluna', () => {
  for (const t of ['omega', 'department', 'navis', 'kani']) {
    assert.equal(VT.veik.has(t), false, t + ' er gervifærsla og á ekki heima í vísitölunni');
  }
  assert.equal(skima(VT, 'Omega'), null);
  assert.equal(skima(VT, 'Kani'), null);
});

test('VÖRN: fyrirspurn verður að vera stafrétt sama nafn og færslan', () => {
  assert.equal(skima(VT, 'SSL25'), null, '"SSL25" má ekki styttast í "ssl" og samsvara SSL');
  assert.equal(skima(VT, 'Maia'), null, '"Maia" má ekki samsvara "MAIA-1"');
  assert.equal(skima(VT, 'Netex'), null, '"Netex" má ekki samsvara "NETEX24"');
  assert.equal(skima(VT, 'Hamas.').flokkur, 'veik', 'greinarmerki eitt og sér má ekki fella samsvörun');
});

test('stafrétt fyrirspurn með tölu-viðskeyti samsvarar sinni færslu', () => {
  // Öfuga hliðin á vörninni: færslan má ekki verða ófinnanleg með SÍNU EIGIN nafni.
  assert.equal(skima(VT, 'MAIA-1').listi, 'MAIA-1');
  assert.equal(skima(VT, 'NETEX24').listi, 'NETEX24');
});

test('hver færsla í veiku vísitölunni samsvarar sínu eigin birtingarnafni', () => {
  for (const [, gildi] of VT.veik) {
    const m = skima(VT, gildi.nafn);
    assert.ok(m, gildi.nafn + ' fann ekki sjálfa sig');
    assert.equal(m.listi, gildi.nafn);
  }
});

test('krossuppfletting er ekki leyfð', () => {
  assert.equal(skima(VT, 'Hamas Hamas'), null, 'fjöl-orða fyrirspurn nær ekki í veiku vísitöluna');
  assert.equal(skima(VT, 'Saddam'), null, 'eins-orðs fyrirspurn nær ekki í sterku vísitöluna');
});

test('jaðartilvik: tómt, rusl, gölluð gögn', () => {
  assert.equal(skima(VT, ''), null);
  assert.equal(skima(VT, '123 456'), null, 'normaliserast í tóman streng — engin tóken');
  assert.equal(skima(VT, 'Zzz Qqq'), null, 'tvö tóken sem hvergi finnast → sterka leiðin skilar null');
  assert.equal(skima(VT, null), null);
  const tom = byggjaVisitolu(null);
  assert.equal(tom.sterk.size, 0);
  assert.equal(tom.veik.size, 0);
  assert.equal(skima(tom, 'Hamas'), null);
});

test('fyrsta færsla vinnur við árekstur — bæði lögin', () => {
  const vt = byggjaVisitolu([
    { n: 'alfa', nafn: 'Alfa', listar: 'ESB' },
    { n: 'alfa', nafn: 'ALFA', listar: 'OFAC' },
    { n: 'jon jonsson', nafn: 'Jón Jónsson', listar: 'ESB' },
    { n: 'jon jonsson', nafn: 'Jon Jonsson', listar: 'OFAC' },
  ]);
  assert.equal(vt.veik.get('alfa').listar, 'ESB');
  assert.equal(vt.sterk.get('jon|jonsson').listar, 'ESB', 'sterka lagið heldur sömu fyrsta-vinnur reglu');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web && node --test src/lib/refsilistar.test.mjs
```

Expected: FAIL — `Cannot find module ... refsilistar.mjs`

- [ ] **Step 3: Write minimal implementation**

Búðu til `web/src/lib/refsilistar.mjs`:

```js
// refsilistar.mjs — hrein lyklunar- og samsvörunarrök refsilista-skimunar (F9).
// Flutt úr worker/veitur.mjs 31.7.2026 svo hægt sé að prófa þau: sanctionsIndex er
// memo-að í modúl-breytu (SANCTIONS_IDX) sem prófin komast ekki framhjá.
//
// TVÖ LÖG, viljandi aðskilin:
//   sterk — fjöl-orða nöfn, lykill 'fyrsta|síðasta'. ÓBREYTT hegðun.
//   veik  — raunveruleg eins-orðs nöfn, lykill = fullt tóken, NÁKVÆMT jafnræði.
// Veik samsvörun má ALDREI enda í sanctions.hits: hits keyrir severity:'critical',
// deriveRisk→'Há', kycCriticalCron-póst og lánshæfis-þak (cap 20 → E).
// Mæling 31.7.2026: nákvæm eins-orðs samsvörun gaf 17 samsvaranir á 8.240 íslenskum
// nöfnum — allar falskar (Nova, Saga, Orion, Titan, Fox …). Þess vegna veikt lag.

export const sancNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Eins og sancNorm en heldur TÖLUSTÖFUM og hendir bilum — til að bera fyrirspurn
// saman við birtingarnafn færslunnar. Greinarmerki og broddstafir hunsuð.
const alnum = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ðþæ]/g, '');

export function byggjaVisitolu(names) {
  const sterk = new Map(), veik = new Map();
  for (const x of (names || [])) {
    const t = String((x && x.n) || '').split(' ').filter(Boolean);
    const gildi = { nafn: x && x.nafn, listar: x && x.listar };
    if (t.length >= 2) {
      const key = t[0] + '|' + t[t.length - 1];
      if (!sterk.has(key)) sterk.set(key, gildi);
    } else if (t.length === 1) {
      // Aðeins RAUNVERULEG eins-orðs nöfn. Ef birtingarnafnið er fleiri en eitt orð
      // varð eins-orðs myndin til við normaliseringu (kýrillískt/grískt/tölur falla
      // burt): "полковник Omega"→omega, "Department 140/16"→department, "NAVIS 6"→navis.
      // 217 af 3.419 færslum eru slíkar og eru verstu falsjákvæðurnar.
      const disp = String((x && x.nafn) || '').trim().split(/\s+/).filter(Boolean);
      if (disp.length !== 1) continue;
      if (!veik.has(t[0])) veik.set(t[0], gildi);
    }
  }
  return { sterk, veik };
}

export function skima(visitala, rawNafn) {
  const sterk = (visitala && visitala.sterk) || new Map();
  const veik = (visitala && visitala.veik) || new Map();
  const t = sancNorm(rawNafn).split(' ').filter(Boolean);

  if (t.length >= 2) {
    const lykill = t[0] + '|' + t[t.length - 1];
    const m = sterk.get(lykill);
    return m ? { flokkur: 'sterk', lykill, listi: m.nafn, listar: m.listar } : null;
  }
  if (t.length === 1) {
    const m = veik.get(t[0]);
    // Fyrirspurnar-vörn: lyklunin ein og sér hleypir of miklu í gegn, því sancNorm
    // hendir tölustöfum. Krefjumst þess að fyrirspurnin sé stafrétt sama nafn og
    // BIRTINGARNAFN færslunnar — annars samsvarar "SSL25" ESB-færslunni SSL og
    // "Maia" OFAC-færslunni MAIA-1. Greinarmerki hunsuð: "Hamas." samsvarar "Hamas".
    if (!m || alnum(rawNafn) !== alnum(m.nafn)) return null;
    return { flokkur: 'veik', lykill: t[0], listi: m.nafn, listar: m.listar };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd web && node --test src/lib/refsilistar.test.mjs
```

Expected: PASS — 12 pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/refsilistar.mjs web/src/lib/refsilistar.test.mjs
git commit -m "feat(refsilistar): hrein eining með aðskildu sterku/veiku lagi

Lyklunar-rökin flutt úr veitur.mjs svo hægt sé að prófa þau (sanctionsIndex
er memo-að í modúl-breytu). Tvær vísitölur: sterk (fyrsta|síðasta, óbreytt)
og veik (fullt tóken, nákvæmt jafnræði, aðeins raunveruleg eins-orðs nöfn).

Ver gegn 217 normaliserunar-gervifærslum og gegn fyrirspurnum sem tapa
stöfum (SSL25 → ssl). Engin vírun enn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Víra `sanctionsIndex` + `sanctionsHandler`

**Files:**
- Modify: `web/src/worker/veitur.mjs:43-74`

**Interfaces:**
- Consumes: `byggjaVisitolu`, `sancNorm`, `skima` úr Task 1.
- Produces: `sanctionsIndex(env) → { sterk: Map, veik: Map, updated: string|null }` (var `{ idx, updated }`). Svar `/api/sanctions` → `{ hits, veikar, updated, n, nVeik }`.

⚠️ `sancNorm` er líka notað í `kycPepIndex` (lína 84) og PEP-samsvörun (lína 147). Eyddu `const sancNorm` staðbundið en **haltu þeim notkunum** — þær nota innflutta útgáfu.

- [ ] **Step 1: Skipta út sanctions-blokkinni**

Skiptu **allri** blokkinni frá línunni `let SANCTIONS_IDX = null;` að og með lokasvigi `sanctionsHandler` (línan `}` strax á eftir `return sjson({ hits, updated, n: idx.size });`) út fyrir:

```js
let SANCTIONS_IDX = null;

async function sanctionsIndex(env) {
  if (SANCTIONS_IDX) return SANCTIONS_IDX;
  const j = await augGet(env, 'sanctions.json');
  if (!j || !j.names) return { sterk: new Map(), veik: new Map(), updated: null };   // ekki memo-a bilun → reynir aftur síðar
  const { sterk, veik } = byggjaVisitolu(j.names);
  SANCTIONS_IDX = { sterk, veik, updated: j.updated || null };
  return SANCTIONS_IDX;
}

export async function sanctionsHandler(request, env, ctx) {
  const names = (new URL(request.url).searchParams.get('names') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const { sterk, veik, updated } = await sanctionsIndex(env);
  const hits = [], veikar = [], seen = new Set();
  for (const raw of names) {
    const m = skima({ sterk, veik }, raw);
    if (!m) continue;
    const dedup = m.flokkur + '|' + m.lykill;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    // hits = staðfestanleg fjöl-orða samsvörun. veikar = eins-orðs, óstaðfest.
    // ALDREI sameina: hits keyrir critical-atburð, 'Há'-áhættu, póst og lánshæfis-þak.
    (m.flokkur === 'sterk' ? hits : veikar).push({ nafn: raw, listi: m.listi, listar: m.listar });
  }
  return sjson({ hits, veikar, updated, n: sterk.size, nVeik: veik.size });
}
```

- [ ] **Step 1b: Verja þriðja kallstaðinn gegn brotnu millistigi**

`sanctionsIndex` skilar nú `{ sterk, veik, updated }` en `kycScreenKt` — sem Task 3 á — les enn `{ idx: sIdx }` og kallar `sIdx.get(key)`. Ef þessu er sleppt er `sIdx` `undefined` og **öll skimun hrynur** fyrir hvert félag með fjöl-orða nafni: `/api/kyc/watch` og handvirk endurskimun kasta villu, og `kycDiffCron`/`kycCriticalCron` kyngja henni þögult (`.catch(() => ({ newEvents: [] }))`) svo öll vöktunin hættir að virka án nokkurs merkis.

Gamla `idx` var sterka vísitalan, svo eitt orð dugar. Í `kycScreenKt`, breyttu:

```js
  const { idx: sIdx } = await sanctionsIndex(env);
```

í:

```js
  const { sterk: sIdx } = await sanctionsIndex(env);   // bráðabirgða — Task 3 skiptir blokkinni út
```

Hegðun `kycScreenKt` verður þar með nákvæmlega óbreytt. Ekki snerta neitt annað í því falli — Task 3 á það.

- [ ] **Step 2: Bæta innflutningi við**

Í `web/src/worker/veitur.mjs`, á eftir línunni `import { traceUbo as kycTraceUbo } from '../lib/ubo-core.mjs';`:

```js
import { byggjaVisitolu, sancNorm, skima } from '../lib/refsilistar.mjs';
```

- [ ] **Step 3: Staðfesta að `sancNorm` sé ekki lengur skilgreint staðbundið**

```bash
cd web && grep -n "const sancNorm" src/worker/veitur.mjs
```

Expected: engin úttak — staðbundna skilgreiningin á að vera farin, `sancNorm` kemur nú úr innflutningi.

```bash
cd web && grep -n "sancNorm" src/worker/veitur.mjs
```

Expected: **fjórar kóðalínur** (auk tveggja athugasemda í `kycScreenKt` sem Task 3 fjarlægir):
- `import { byggjaVisitolu, sancNorm, skima } …`
- `idx.set(sancNorm(nafn), …)` í `kycPepIndex`
- `const t = sancNorm(nm)…` í `kycScreenKt` — **á enn að vera til staðar**, Task 3 fjarlægir hana
- `pIdx.get(sancNorm(nm))` í PEP-samsvörun

Ef `kycPepIndex`- eða PEP-línan er horfin hefurðu fjarlægt of mikið — bakkaðu.

- [ ] **Step 4: Keyra öll prófin**

```bash
cd web && npm test
```

Expected: PASS — engin afturför í neinni prófskrá.

- [ ] **Step 5: Staðfesta að lögin séu aðskilin í svarinu**

```bash
cd web && node --input-type=module -e "
import { byggjaVisitolu, skima } from './src/lib/refsilistar.mjs';
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('public/gogn/sanctions.json','utf8'));
const vt = byggjaVisitolu(j.names);
console.log('sterk:', vt.sterk.size, ' veik:', vt.veik.size);
for (const q of ['Hamas','Rosneft','Nova','Tak','Omega','SSL25','Maia','MAIA-1','Saddam Hussein Al-Tikriti']) {
  const m = skima(vt, q);
  console.log(q.padEnd(28), m ? m.flokkur + ' → ' + m.listi : 'engin');
}
"
```

Expected (á gögnum dags. 2026-07-30; **stærðirnar eru fjöldi ÓLÍKRA LYKLA, ekki færslna** — 58.852 fjöl-orða færslur þjappast í 49.124 `fyrsta|síðasta`-lykla):
```
sterk: 49124  veik: 3230
Hamas                        veik → Hamas
Rosneft                      veik → ROSNEFT
Nova                         veik → NOVA
Tak                          veik → TAK
Omega                        engin
SSL25                        engin
Maia                         engin
MAIA-1                       veik → MAIA-1
Saddam Hussein Al-Tikriti    sterk → Saddam Hussein Al-Tikriti
```

Lykilatriði: **ekkert eins-orðs nafn skilar `sterk`.** `veik` er 3.230 af 3.449 eins-orðs færslum — 219 gervifærslur felldar.

⚠️ **Línuendingar.** `veitur.mjs` er eina skráin í repo-inu sem er vistuð með CRLF; allar aðrar eru LF. Með `core.autocrlf=true` umritar venjulegt `git add` alla skrána og býr til 860-línu diff sem felur raunverulegu breytinguna og býður upp á árekstra við næturkeyrsluna. Bættu skránni við með `git -c core.autocrlf=false add web/src/worker/veitur.mjs` og staðfestu að `git diff --stat` sýni innan við 40 breyttar línur.

- [ ] **Step 6: Commit**

```bash
git add web/src/worker/veitur.mjs
git commit -m "feat(refsilistar): /api/sanctions skilar veiku lagi sér

sanctionsIndex byggir nú tvær vísitölur um refsilistar.mjs og svarið fær
nýtt svið 'veikar' (+ nVeik). 'hits' heldur nákvæmlega sinni merkingu og
lögun svo núverandi neytendur breytast ekki.

sancNorm kemur nú úr einingunni — kycPepIndex og PEP-samsvörun nota hana áfram.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Víra `kycScreenKt` + varnarpróf gegn `kyc.mjs`

**Files:**
- Modify: `web/src/worker/veitur.mjs` — sanctions-blokkin inni í `kycScreenKt`, og `sanctions:`-línan í skilagildi sama falls
- Modify: `web/src/lib/kyc.test.mjs`

**Interfaces:**
- Consumes: `skima`, `sanctionsIndex` úr Task 1–2.
- Produces: `kycScreenKt(...).sanctions → { hits: [{name}], veikar: [{name, listi, listar}] }`.

**Bakgrunnur sem má ekki misskilja:** `_kycRunDiff` skrifar snapshot-hash í hverri keyrslu, en atburðir koma **eingöngu** frá `kycSignalEvents`. Að bæta `veikar` við payload breytir því hash-inu en framkallar **engan** atburð og **engan** póst (`_kycAfterEvents` fer strax út ef `!res.newEvents.length`). Þetta er ætlað.

- [ ] **Step 1: Write the failing test**

Bættu aftast við `web/src/lib/kyc.test.mjs`:

```js
// ── Vörn: veikar refsilista-samsvaranir mega ALDREI hegða sér eins og hits ──
// Eins-orðs nafnasamsvörun (Nova, Saga, Fox …) er óstaðfest og fer í sér-svið.
// Ef þessi próf falla er söluvaran farin að senda falskar krítískar viðvaranir.
test('veikar refsilista-samsvaranir framkalla engan atburð', () => {
  const prev = { hits: [], veikar: [] };
  const cur = { hits: [], veikar: [{ name: 'Nova hf.' }, { name: 'Saga ehf.' }] };
  assert.deepEqual(signalEvents('sanctions', prev, cur), []);
});

test('veikar refsilista-samsvaranir hækka ekki áhættueinkunn', () => {
  const s = { sanctions: { hits: [], veikar: [{ name: 'Nova hf.' }] }, status: {}, legal: {}, pep: {}, tax: {}, skil: {}, media: {} };
  assert.equal(deriveRisk(s), 'Lág');
});

test('sterk samsvörun heldur áfram að vera critical og Há', () => {
  const evs = signalEvents('sanctions', { hits: [] }, { hits: [{ name: 'Saddam Hussein' }], veikar: [] });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].kind, 'sanctions_hit');
  assert.equal(evs[0].severity, 'critical');
  const s = { sanctions: { hits: [{ name: 'Saddam Hussein' }], veikar: [] }, status: {}, legal: {}, pep: {}, tax: {}, skil: {}, media: {} };
  assert.equal(deriveRisk(s), 'Há');
});
```

Athugaðu efst í skránni að `signalEvents` og `deriveRisk` séu bæði flutt inn; bættu þeim við innflutninginn ef þau vantar.

- [ ] **Step 2: Run test to verify it passes already**

```bash
cd web && node --test src/lib/kyc.test.mjs
```

Expected: PASS strax. Þetta eru **læsingar-próf**, ekki drifpróf — þau festa núverandi hegðun `kyc.mjs` svo Task 3 geti ekki brotið hana óvart. Ef eitthvert þeirra fellur núna er `kyc.mjs` þegar gallað — stöðvaðu og tilkynntu.

- [ ] **Step 3: Skipta út sanctions-blokkinni í `kycScreenKt`**

Í `web/src/worker/veitur.mjs`, inni í `kycScreenKt`, finndu blokkina sem hefst á athugasemdinni `// sanctions — endurnýtir sanctionsIndex/sancNorm` og endar á `}` sem lokar `for (const nm of nameList)`-lykkjunni (11 línur, rétt á undan `// pep`). Skiptu henni út fyrir:

```js
  // sanctions — tvö lög um refsilistar.mjs. hits = fjöl-orða samsvörun (critical-atburður,
  // 'Há'-áhætta, tafarlaus póstur). veikar = eins-orðs, óstaðfest — sér-svið sem kyc.mjs
  // les EKKI, því eins-orðs nafnasamsvörun á íslenskum félagsnöfnum er nær alltaf fölsk
  // (mæling 31.7.2026: 17 af 17 falskar). Ekki sameina þessi tvö.
  const { sterk: sSterk, veik: sVeik } = await sanctionsIndex(env);
  const sHits = [], sVeikar = [];
  for (const nm of nameList) {
    const m = skima({ sterk: sSterk, veik: sVeik }, nm);
    if (!m) continue;
    if (m.flokkur === 'sterk') sHits.push({ name: nm });
    else sVeikar.push({ name: nm, listi: m.listi, listar: m.listar });
  }
```

- [ ] **Step 4: Bæta `veikar` við skilagildið**

Í skilagildi sama falls, breyttu línunni:

```js
    sanctions: { hits: sHits },
```

í:

```js
    sanctions: { hits: sHits, veikar: sVeikar },
```

- [ ] **Step 5: Staðfesta að `t.length < 2` sé horfið alls staðar**

```bash
cd web && grep -n "t.length < 2" src/worker/veitur.mjs
```

Expected: engin úttak — allir þrír kallstaðirnir nota nú `skima`.

```bash
cd web && grep -n "sancNorm" src/worker/veitur.mjs
```

Expected: nákvæmlega **þrjár** línur — innflutningurinn, `kycPepIndex` og PEP-samsvörunin. Refsilista-leiðin notar hana ekki lengur beint; PEP-leiðin gerir það áfram og á að gera það.

- [ ] **Step 6: Keyra öll prófin**

```bash
cd web && npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/worker/veitur.mjs web/src/lib/kyc.test.mjs
git commit -m "fix(kyc): þriðji kallstaðurinn skimar eins-orðs nöfn — í veiku lagi

kycScreenKt hafði sömu t.length<2-síu og hinir tveir; hún var utan
upphaflega erindisins og er sá staður sem skiptir mestu (Áreiðanleikavaktin).
Veikar samsvaranir fara í sanctions.veikar sem kyc.mjs les ekki — hvorki
signalEvents né deriveRisk snerta það svið.

Þrjú læsingar-próf festa þá hegðun: veikar gefa engan atburð og enga
'Há'-áhættu, en sterk samsvörun heldur áfram að gefa hvort tveggja.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Birting veika lagsins í F9-flísinni

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` — föllin `fsSanctionHits` (~l. 1236) og `fsWireSanction` (~l. 681), auk `<style>`-blokkar

**Interfaces:**
- Consumes: `veikar` úr svari `/api/sanctions` (Task 2).
- Produces: `fsSanctionHits(f) → { hits, veikar, names, skorid } | null`.

⚠️ **Lína 1279 má ekki breytast.** Lánshæfismatið les `s.hits` og setur `cap: 20` → E. Nýja sviðið `s.veikar` má aldrei komast þangað inn.

- [ ] **Step 1: Skila `veikar` úr hjálparfallinu**

Finndu athugasemdina `// F9-hjálpari: eigenda-/forráðamanna-/félags-nöfn gegn worker /api/sanctions.` og fallið `fsSanctionHits` strax á eftir. Skiptu báðum út fyrir:

```js
    // F9-hjálpari: eigenda-/forráðamanna-/félags-nöfn gegn worker /api/sanctions.
    // null = villa; annars {hits,veikar,names,skorid}. hits = staðfestanleg fjöl-orða
    // samsvörun (drífur lánshæfis-þak); veikar = eins-orðs, óstaðfest (drífur EKKERT mat).
    async function fsSanctionHits(f) {
      const n = sanctionNames(f.nafn ? fsStutt(f.nafn) : '', f.eigendur, f.radamenn);
      if (!n.names.length) return { hits: [], veikar: [], names: 0, skorid: 0 };
      try { const res = await fetch('/api/sanctions?names=' + encodeURIComponent(n.names.join(','))).then((r) => (r.ok ? r.json() : null)); return res ? { hits: res.hits || [], veikar: res.veikar || [], names: n.alls, skorid: n.skorid } : null; } catch (e) { return null; }
    }
```

- [ ] **Step 2: Birta veika lagið á aðskilinni línu**

Skiptu öllu fallinu `async function fsWireSanction(f) { … }` (á eftir athugasemdinni `// F9 — Þvingunaraðgerða-skimun:`) út fyrir:

```js
    async function fsWireSanction(f) {
      const chip = document.getElementById('fs-ar-sanction'); if (!chip) return;
      const v = chip.querySelector('.fs-ar-v');
      const res = await fsSanctionHits(f);   // deilt með lánshæfismatinu (F9)
      if (res == null) { chip.className = 'fs-ar n'; if (v) v.textContent = '—'; return; }
      if (!res.names) { chip.className = 'fs-ar n'; if (v) v.textContent = 'Engir aðilar'; return; }
      const hits = res.hits, veikar = res.veikar || [];
      const d = document.getElementById('fs-ar-sanction-detail');
      // Veika línan: eins-orðs nafnasamsvörun. Sérstök lína, hlutlaus, og hún ræður
      // ALDREI lit flísarinnar — rautt (fs-ar b) er eingöngu drifið af hits.
      const veikTxt = !veikar.length ? '' :
        '<div class="fs-ar-veik">ℹ️ <b>' + veikar.length + ' eins-orðs samsvörun</b> — nafnið er eitt orð og samsvörunin því veik. Krefst auðkennis-staðfestingar: '
        + veikar.map((h) => escF(h.nafn) + ' <span class="fs-ar-role">→ ' + escF(h.listi) + ' [' + escF(h.listar) + ']</span>').join('; ') + '</div>';
      if (!hits.length) {
        chip.className = 'fs-ar g';
        if (v) v.textContent = veikar.length ? 'Engin staðfest' : 'Engin samsvörun';
        if (d) d.innerHTML = veikTxt;
        return;
      }
      chip.className = 'fs-ar b';
      if (v) v.textContent = hits.length + ' möguleg';
      if (d) d.innerHTML = '⚠️ <b>Möguleg samsvörun við refsilista</b> (ESB/SÞ/OFAC) — nafnasamsvörun, <b>EKKI staðfesting</b>, staðfestu auðkenni: '
        + hits.map((h) => escF(h.nafn) + ' <span class="fs-ar-role">→ ' + escF(h.listi) + ' [' + escF(h.listar) + ']</span>').join('; ') + veikTxt;
    }
```

- [ ] **Step 3: Bæta stíl við**

Finndu `.fs-ar-detail` í `<style>`-blokk skrárinnar og bættu strax á eftir við:

```css
    .fs-ar-veik { margin-top: .4rem; opacity: .85; font-size: .92em; }
```

- [ ] **Step 4: Staðfesta að lánshæfismatið sé ósnert**

```bash
cd web && grep -n "cap: 20" src/pages/fyrirtaeki.astro
```

Expected: ein lína (1279-ish) sem les `s.hits && s.hits.length` — **ekki** `veikar`.

```bash
cd web && grep -n "veikar" src/pages/fyrirtaeki.astro
```

Expected: aðeins línur innan `fsSanctionHits` og `fsWireSanction`. Ef `veikar` birtist nálægt `fsLhSet('sanction'` er vörnin brotin — bakkaðu.

- [ ] **Step 5: Byggja og staðfesta í vafra**

```bash
cd web && npm run build
```

Expected: build tekst. (Ef `.bin/astro` er brotið: `cd web && npm install` fyrst.)

Ræstu síðan forskoðun með `preview_start` og farðu á `/fyrirtaeki/<kt>/` fyrir félag með eins-orðs nafni. Staðfestu með `read_page`:
- flísin „Þvingunaraðgerðir" er **græn**, ekki rauð, þegar aðeins veikar samsvaranir finnast,
- veika línan birtist með „krefst auðkennis-staðfestingar",
- lánshæfis-spjaldið sýnir **enga** „Refsilista-samsvörun"-línu.

Taktu skjámynd sem sönnun.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "feat(F9): birta eins-orðs samsvaranir sem aðskilið veikt lag

Veika línan er hlutlaus, merkt 'krefst auðkennis-staðfestingar' og ræður
aldrei lit flísarinnar — rautt er áfram eingöngu drifið af hits. Flís með
veikar samsvaranir en engar sterkar er græn ('Engin staðfest').

Lánshæfismatið (cap 20 → E) les áfram eingöngu s.hits.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Lokastaðfesting

- [ ] **Öll próf græn**

```bash
cd web && npm test
```

- [ ] **Vörnin heldur — handvirk yfirferð**

Farðu yfir `git diff origin/main --stat` og staðfestu að **engin** af fjórum ósnertanlegu línunum sé í diff-inu:

```bash
git diff origin/main -- web/src/lib/kyc.mjs web/src/worker/cron.mjs
```

Expected: engin úttak (hvorug skráin breyttist).

```bash
git diff -U0 origin/main -- web/src/pages/fyrirtaeki.astro | grep -n "cap: 20\|fsLhSet('sanction'"
```

Expected: engin úttak (lánshæfis-línan ósnert). `-U0` slekkur á samhengislínum svo grep-ið mæli aðeins raunverulegar breytingar.

- [ ] **Deploy**

Sjá `docs/superpowers/specs/...` §7 fyrir framhaldsverk. Deploy er `git push origin HEAD:main` úr þessu worktree — það deployar bæði síðu og worker.

---

## Viðauki A — flokkunin færð í prófaða einingu (2026-07-31)

**Af hverju:** rýni á Task 3 keyrði stökkbreytingarpróf á `kycScreenKt`: að sameina bæði lögin í `sHits` — nákvæmlega sú villa sem öll tveggja-laga hönnunin á að útiloka — lét **öll 336 prófin standast**. `kycScreenKt` er hvorki flutt út né prófanlegt án þess að móka D1, fjögur `augGet`-gögn og `fetch` á skatturinn.is. Þrír af fjórum hættulegu neytendunum (krítískur atburður, „Há"-áhætta, sjálfvirkur póstur) hanga á þessari einu lúkku.

Verkin sem hér fóru á undan afrituðu flokkunar-ákvörðunina inn í báða kallstaði. Hún færist nú á einn stað.

**Breyting á Task 1:** `refsilistar.mjs` fær

```js
export function flokkaNofn(visitala, nofn, { dedup = false } = {}) {
  const sterkar = [], veikar = [], seen = new Set();
  for (const raw of (nofn || [])) {
    const m = skima(visitala, raw);
    if (!m) continue;
    if (dedup) { const k = m.flokkur + '|' + m.lykill; if (seen.has(k)) continue; seen.add(k); }
    (m.flokkur === 'sterk' ? sterkar : veikar).push({ nafn: raw, listi: m.listi, listar: m.listar });
  }
  return { sterkar, veikar };
}
```

**Breyting á Task 2** — `sanctionsHandler` hættir að afrita lúkkuna:

```js
  const { sterk, veik, updated } = await sanctionsIndex(env);
  const { sterkar, veikar } = flokkaNofn({ sterk, veik }, names, { dedup: true });
  return sjson({ hits: sterkar, veikar, updated, n: sterk.size, nVeik: veik.size });
```

**Breyting á Task 3** — `kycScreenKt` sömuleiðis, með sínum eigin færslu-lögunum:

```js
  const { sterk: sSterk, veik: sVeik } = await sanctionsIndex(env);
  const flokkad = flokkaNofn({ sterk: sSterk, veik: sVeik }, nameList);
  const sHits = flokkad.sterkar.map((x) => ({ name: x.nafn }));
  const sVeikar = flokkad.veikar.map((x) => ({ name: x.nafn, listi: x.listi, listar: x.listar }));
```

**Óbreytt:** ytri hegðun beggja kallstaða, lögun `hits` beggja megin (`{ name }` vs `{ nafn, listi, listar }`), dedup í endapunktinum, ekkert dedup í `kycScreenKt`.

### Viðauki A2 — lögunin líka, svo aðeins tilvísun standi eftir

Rýni eftir A sýndi að gatið hafði færst, ekki lokast: flokkunin er prófuð, en lögunin sem breytir henni í `{ hits, veikar }` sat áfram óprófuð í `kycScreenKt`, og stökkbreyting á þeim tveimur línum sameinaði lögin án þess að nokkurt af 342 prófunum félli.

Þessi aðhvarfsröð endar ekki fyrr en ekkert nema **ber tilvísun** stendur utan prófaðs kóða. Þess vegna færist lögunin líka:

```js
// refsilistar.mjs — skilar nákvæmlega því sem kycScreenKt setur í sanctions-sviðið.
export function skimunarNidurstada(visitala, nofn) {
  const { sterkar, veikar } = flokkaNofn(visitala, nofn);
  return {
    hits: sterkar.map((x) => ({ name: x.nafn })),
    veikar: veikar.map((x) => ({ name: x.nafn, listi: x.listi, listar: x.listar })),
  };
}
```

`kycScreenKt` verður þá:

```js
  const { sterk: sSterk, veik: sVeik } = await sanctionsIndex(env);
  const sanctions = skimunarNidurstada({ sterk: sSterk, veik: sVeik }, nameList);
```

og í skilagildinu stendur `sanctions,` eitt og sér. Eftir þetta er ekki hægt að sameina lögin án þess að breyta prófaðri einingu.

Einnig: `sanctionsHandler` tilgreinir `{ dedup: true }`; `kycScreenKt` á að tilgreina `{ dedup: false }` berum orðum í stað þess að reiða sig á sjálfgefna gildið — dedup-hegðunin er skráð sem fast skilyrði og á að sjást á kallstaðnum.
