# Creditinfo-jafngildi (stjórn + ársreikn-PDF + veðbókarvottorð) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fylla stjórn+prókúru í fyrirtækjaskýrsluna úr fríu RSK-yfirliti, bjóða ársreiknings-PDF til niðurhals, og tengja í veðbókarvottorð á fasteignaskýrslu.

**Architecture:** Stjórn kemur úr „Gjaldfrjálsu yfirliti" (RSK typeid 9) — PDF sem þarfnast puppeteer → sjálfstætt á-eftirspurnar-rör sem speglar `arsreikningur`/`eigendur` (frontend fetch → worker `repository_dispatch` → GH-Action `pdftotext`+þáttun → committar JSON). Ársreiknings-PDF er vistað úr núverandi ársreikninga-byggingu. Veðbókarvottorð er einfaldur tengill í opinberu þjónustuna.

**Tech Stack:** Node 22 (ESM), `node:test`, puppeteer-core + Chrome, `pdftotext` (poppler-utils, `-raw -enc UTF-8`), Astro SSG, Cloudflare Worker, GitHub Actions.

## Global Constraints

- **Allt viðmót á ÍSLENSKU**, dökkt þema (accent `#f6b13b`, texti `#eaf1fb`/`#cdd6e6`, deyft `#8fa0b8`).
- **Aðeins opinber gögn.** Ekkert lánshæfismat/vanskil. Veðbönd = tengill, ekki endurbirt.
- **🔒 Persónuvernd:** stjórn-JSON er committaður í opinbert repo → geymir/birtir **AÐEINS `{nafn, hlutverk}`**. ALDREI kennitölur eða heimilisföng einstaklinga.
- **RSK-kurteisi:** á-eftirspurn, aldrei fjöldakall, 1,2 s töf milli félaga í byggingu.
- **Dispatch-repo er `aronheidar/KARP-2.0`** (sama og hin rörin).
- **Vinna á grein** `claude/dreamy-kowalevski-60978d`, EKKI pusha á origin/main.
- **Staðfesting (allt verður að standast):** `cd web && npx astro build` (heppnast), `node --check web/worker.js`, `node --check` á breyttum `.mjs`, `node --test skriptur/test/`.
- **Git-vöxtur:** ársreiknings-PDF í repo þenur sögu → flagga R2 í lokasamantekt (ekki leysa núna).

---

### Task 1: Þáttari `parseStjornText()` (hrein fall + einingapróf)

Hrein fall sem þáttar stjórn úr `pdftotext -raw -enc UTF-8` texta yfirlitsins. Prófanlegt án nets (raunverulegur Brim-texti sem festi).

**Files:**
- Modify: `skriptur/lib/rsk.mjs` (bæta við export neðst)
- Test: `skriptur/test/stjorn.test.mjs` (nýtt)

**Interfaces:**
- Produces: `parseStjornText(txt: string) → { stjorn: Array<{nafn:string, hlutverk:string}>, firmaritun: string|null, dags: string|null }`

- [ ] **Step 1: Skrifa fallandi próf** — `skriptur/test/stjorn.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStjornText } from '../lib/rsk.mjs';

// Raunverulegur pdftotext -raw -enc UTF-8 texti (Brim hf., staðfest 2026-07-08).
const BRIM = [
  'Firmað rita: Meirihluti stjórnar',
  'Stjórn félagsins skipa samkvæmt fundi þann: 19.03.2026',
  '161160-2889 Kristján Þórarinn Davíðsson, Kirkjusandi 1, 105 Reykjavík, Stjórnarformaður',
  '290750-6879 Anna G Sverrisdóttir, Grjótaseli 13, 109 Reykjavík, Meðstjórnandi',
  '180465-4809 Guðmundur Marteinsson, Bæjarlind 5, 201 Kópavogur, Meðstjórnandi',
  '020758-6949 Hjálmar Þór Kristjánsson, Háarifi 15, 360 Hellissandur, Meðstjórnandi',
  '280871-4199 Kristrún Heimisdóttir, Hrólfsskálamel 10, 170 Seltjarnarnes, Meðstjórnandi',
  'Endurskoðandi/skoðunarmaður:',
  '521098-2449 Deloitte ehf., Dalvegi 30, 201 Kópavogur, Endurskoðandi',
  'Framkvæmdastjóri:',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Framkvæmdastjórn',
  'Prókúruhafar:',
  '220860-4429 Guðmundur Kristjánsson, Nesvegi 107, 170 Seltjarnarnes, Prókúruhafi',
  '290864-7719 Inga Jóna Friðgeirsdóttir, Gnitakór 14, 203 Kópavogur, Prókúruhafi',
].join('\n');

test('parseStjornText: full board, name+role only', () => {
  const r = parseStjornText(BRIM);
  assert.equal(r.firmaritun, 'Meirihluti stjórnar');
  assert.equal(r.dags, '19.03.2026');
  assert.equal(r.stjorn.length, 9);
  assert.deepEqual(r.stjorn[0], { nafn: 'Kristján Þórarinn Davíðsson', hlutverk: 'Stjórnarformaður' });
});

test('parseStjornText: normalises Framkvæmdastjórn -> Framkvæmdastjóri', () => {
  const r = parseStjornText(BRIM);
  assert.ok(r.stjorn.some((x) => x.nafn === 'Guðmundur Kristjánsson' && x.hlutverk === 'Framkvæmdastjóri'));
});

test('parseStjornText: company auditor kept with role', () => {
  const r = parseStjornText(BRIM);
  assert.ok(r.stjorn.some((x) => x.nafn === 'Deloitte ehf.' && x.hlutverk === 'Endurskoðandi'));
});

test('parseStjornText: PRIVACY — no kennitala or address leaks', () => {
  const r = parseStjornText(BRIM);
  for (const p of r.stjorn) {
    assert.deepEqual(Object.keys(p).sort(), ['hlutverk', 'nafn']);   // engir aðrir reitir
    assert.doesNotMatch(p.nafn, /\d{6}-?\d{4}/, 'nafn má ekki innihalda kt');
    assert.doesNotMatch(p.nafn, /,/, 'nafn má ekki innihalda heimilisfang');
  }
});

test('parseStjornText: garbage input yields empty, no throw', () => {
  const r = parseStjornText('einhver\nótengdur\ntexti');
  assert.deepEqual(r.stjorn, []);
});
```

- [ ] **Step 2: Keyra prófið, staðfesta að það falli**

Run: `node --test skriptur/test/stjorn.test.mjs`
Expected: FAIL — `parseStjornText is not a function` (export vantar).

- [ ] **Step 3: Útfæra `parseStjornText`** — bæta neðst í `skriptur/lib/rsk.mjs`

```js
// ---- Nýtt: stjórn úr "Gjaldfrjálsu yfirliti" (RSK typeid 9), pdftotext -raw -enc UTF-8 texti ----
// 🔒 Skilar AÐEINS {nafn, hlutverk} — sleppir kennitölum og heimilisföngum einstaklinga (persónuvernd).
export function parseStjornText(txt) {
  const lines = String(txt || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // <kt> <nafn>, <heimilisfang>, <póstnr borg>, <hlutverk>
  const LINE = /^\d{6}-?\d{4}\s+(.+?),\s*.+?,\s*.+?,\s*([^,]+?)\s*$/;
  const normRole = (r) => {
    const s = (r || '').replace(/[.,\s]+$/, '').trim();
    if (/^Framkvæmdastjór/i.test(s)) return 'Framkvæmdastjóri';   // skjalið segir "Framkvæmdastjórn"
    return s;
  };
  const sectionRole = (h) => /Endursko/i.test(h) ? 'Endurskoðandi'
    : /Framkv/i.test(h) ? 'Framkvæmdastjóri'
    : /Prókúr/i.test(h) ? 'Prókúruhafi' : null;
  const out = [];
  let firmaritun = null, dags = null, section = null, m;
  for (const ln of lines) {
    if ((m = ln.match(/^Firma[ðđ]?\s*rita:?\s*(.+)$/i))) { firmaritun = m[1].trim() || null; continue; }
    if ((m = ln.match(/skipa samkvæmt fundi þann:?\s*([\d.]+)/i))) { dags = m[1] || null; continue; }
    if (/:\s*$/.test(ln)) { section = sectionRole(ln); continue; }   // kaflahaus
    if ((m = ln.match(LINE))) {
      const nafn = m[1].trim();
      const hlutverk = normRole(m[2]) || section || 'Stjórn';
      if (nafn && !/^\d{6}-?\d{4}$/.test(nafn)) out.push({ nafn, hlutverk });
    }
  }
  const ORDER = ['stjórnarformaður', 'varaformaður', 'meðstjórnandi', 'stjórnarmaður', 'varamaður', 'framkvæmdastjóri', 'prókúruhafi', 'endurskoðandi'];
  const rank = (h) => { const i = ORDER.indexOf((h || '').toLowerCase()); return i < 0 ? ORDER.length : i; };
  out.sort((a, b) => rank(a.hlutverk) - rank(b.hlutverk));   // stöðug röðun (Node) heldur skjalaröð innan flokks
  return { stjorn: out, firmaritun, dags };
}
```

- [ ] **Step 4: Keyra prófið, staðfesta að það standist**

Run: `node --test skriptur/test/stjorn.test.mjs`
Expected: PASS (5 próf).

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/rsk.mjs skriptur/test/stjorn.test.mjs
git commit -m "Stjórn-þáttari (parseStjornText) + einingapróf (nafn+hlutverk, persónuvernd)"
```

---

### Task 2: `fetchStjorn(kt)` — sækja + pdftotext + þátta

Nettengt fall sem sækir yfirlitið (typeid 9) og keyrir `parseStjornText`. Speglar `fetchHluthafar`.

**Files:**
- Modify: `skriptur/lib/rsk.mjs` (bæta við `pdftotextRaw` helper + `fetchStjorn`)

**Interfaces:**
- Consumes: `addToCart(kt, itemid, typeid, opts)`, `downloadPdf(kid, opts)`, `parseStjornText(txt)` (Task 1)
- Produces: `fetchStjorn(kt, opts?) → { nafn: string|null, stjorn: [...], firmaritun, dags }`

- [ ] **Step 1: Útfæra `pdftotextRaw` + `fetchStjorn`** — bæta í `skriptur/lib/rsk.mjs` (fyrir ofan `parseStjornText`)

```js
// pdftotext (poppler) -raw -enc UTF-8 → hreinn texti með bilum í nöfnum (staðfest á RSK-yfirliti).
export function pdftotextRaw(pdfPath, { PDFTOTEXT = process.env.PDFTOTEXT || 'pdftotext' } = {}) {
  const r = spawnSync(PDFTOTEXT, ['-raw', '-enc', 'UTF-8', pdfPath, '-'], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('pdftotext: ' + (r.stderr || (r.error && r.error.message) || 'status ' + r.status));
  return r.stdout;
}

// Stjórn úr fríu "Gjaldfrjálsu yfirliti" (typeid 9). Krefst puppeteer (downloadPdf) → keyrir í GH-Action, ekki worker.
export async function fetchStjorn(kt, opts = {}) {
  const kid = await addToCart(kt, kt, 9, opts);          // itemid = kt fyrir yfirlits-hnappinn (typeid 9)
  const pdf = await downloadPdf(kid, opts);
  const tmp = path.join(__dirname, `_tmp_stj_${kt}.pdf`);
  fs.writeFileSync(tmp, pdf);
  try {
    const txt = pdftotextRaw(tmp, opts);
    const nm = txt.match(/([^\n]+?)\s+Reg Id:\s*\d/) || [];   // enski hlutinn: "Brim hf. Reg Id: 541185-0389"
    return { nafn: (nm[1] || '').trim() || null, ...parseStjornText(txt) };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}
```

- [ ] **Step 2: Staðfesta að einingin þáttist (engin ný próf brotni)**

Run: `node --check skriptur/lib/rsk.mjs && node --test skriptur/test/stjorn.test.mjs`
Expected: engin syntax-villa; 5 próf standast enn.

- [ ] **Step 3: Handvirk nettenging-sönnun** (þarf Chrome + net; eitt félag)

Run: `node -e "import('./skriptur/lib/rsk.mjs').then(async m=>{const r=await m.fetchStjorn('5411850389');console.log(JSON.stringify(r,null,1))})"`
Expected: `nafn:"Brim hf."`, `stjorn` með ~9 aðilum, HVERGI kt/heimilisfang. (Ef `pdftotext` finnst ekki á Windows: `PDFTOTEXT="C:\Program Files\Git\mingw64\bin\pdftotext.exe"`.)

- [ ] **Step 4: Commit**

```bash
git add skriptur/lib/rsk.mjs
git commit -m "fetchStjorn: sækir frítt RSK-yfirlit (typeid 9) + pdftotext + þáttar stjórn"
```

---

### Task 3: `build_stjorn.mjs` — CLI → `gogn/stjorn/<kt>.json`

Speglar `build_arsreikningar.mjs`: skrifar JSON, eða `{engin:true}` merki svo framendi festist ekki.

**Files:**
- Create: `skriptur/build_stjorn.mjs`

**Interfaces:**
- Consumes: `fetchStjorn(kt)` (Task 2)
- Produces: `web/public/gogn/stjorn/<kt>.json` = `{kt,nafn,sott,heimild,firmaritun,dags,stjorn:[{nafn,hlutverk}]}` eða `{kt,nafn,sott,engin:true,astaeda}`

- [ ] **Step 1: Skrifa `skriptur/build_stjorn.mjs`**

```js
#!/usr/bin/env node
// =============================================================================
//  build_stjorn.mjs — Sækir OPINBERT "Gjaldfrjálst yfirlit" (RSK typeid 9) og
//  þáttar STJÓRN/prókúru/framkvæmdastjóra/endurskoðanda í gogn/stjorn/<kt>.json.
//  🔒 Geymir AÐEINS {nafn, hlutverk} — ALDREI kennitölur/heimilisföng einstaklinga.
//  ⚠ ON-DEMAND (eitt félag við skoðun). ALDREI fjöldakall. Speglar build_arsreikningar.mjs.
//  Notkun: node skriptur/build_stjorn.mjs <kt> [<kt> ...]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchStjorn } from './lib/rsk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'web', 'public', 'gogn', 'stjorn');   // þjónað af /gogn/stjorn/<kt>.json

async function buildForKt(kt) {
  const r = await fetchStjorn(kt);
  const dest = path.join(OUTDIR, `${kt}.json`);
  const sott = new Date().toISOString().slice(0, 10);
  if (!r.stjorn.length) {
    console.log(`  ${kt} ${r.nafn || ''}: engin skráð stjórn þáttaðist — skrifa merki-JSON`);
    fs.writeFileSync(dest, JSON.stringify({ kt, nafn: r.nafn, sott, engin: true, astaeda: 'Engin skráð stjórn fannst í gjaldfrjálsu yfirliti fyrirtækjaskrár (t.d. nýskráð eða óvenjulegt snið).' }, null, 1));
    return;
  }
  const out = { kt, nafn: r.nafn, sott, heimild: 'RSK fyrirtækjaskrá — Gjaldfrjálst yfirlit (gjaldfrjálst)', firmaritun: r.firmaritun, dags: r.dags, stjorn: r.stjorn };
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`  -> ${path.relative(ROOT, dest)}  (${r.stjorn.length} aðilar)`);
}

const kts = process.argv.slice(2).map((a) => a.replace(/\D/g, '')).filter((a) => a.length === 10);
if (!kts.length) { console.log('Notkun: node build_stjorn.mjs <kt> [<kt> ...]'); process.exit(0); }
fs.mkdirSync(OUTDIR, { recursive: true });
console.log(`Stjórn RSK -> gogn/stjorn/  (${kts.length} félög)`);
for (const kt of kts) {
  try { await buildForKt(kt); await new Promise((x) => setTimeout(x, 1200)); }   // hófsemi gagnvart RSK
  catch (e) { console.error(`  ${kt}: VILLA — ${e.message}`); }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check skriptur/build_stjorn.mjs`
Expected: engin villa.

- [ ] **Step 3: Handvirk sönnun (eitt félag) + persónuverndar-eftirlit**

Run: `node skriptur/build_stjorn.mjs 5411850389`
Expected: skrifar `web/public/gogn/stjorn/5411850389.json`. Opna hana og staðfesta: `stjorn` með nafn+hlutverk, `firmaritun:"Meirihluti stjórnar"`, og **ENGA** 10-stafa kennitölu eða heimilisfang í skránni.

- [ ] **Step 4: Commit** (skránni 5411850389.json má halda sem sýni — speglar `6912002990.json` fyrir ársreikninga)

```bash
git add skriptur/build_stjorn.mjs web/public/gogn/stjorn/5411850389.json
git commit -m "build_stjorn.mjs: byggir gogn/stjorn/<kt>.json (nafn+hlutverk, persónuvernd)"
```

---

### Task 4: GitHub-Action `stjorn.yml`

Afrit af `.github/workflows/arsreikningur.yml` með `poppler-utils` (fyrir `pdftotext`).

**Files:**
- Create: `.github/workflows/stjorn.yml`

- [ ] **Step 1: Skrifa `.github/workflows/stjorn.yml`**

```yaml
name: Stjórn (on-demand RSK-yfirlit)

# On-demand: worker (karp21) sendir repository_dispatch { kt } þegar skýrsla hefur enga byggða stjórn.
# Keyrir puppeteer + pdftotext (getur ekki keyrt í Cloudflare-worker) → build_stjorn.mjs →
# web/public/gogn/stjorn/<kt>.json → commitar. Handvirkt: Actions → þessi workflow → Run workflow.

on:
  repository_dispatch:
    types: [stjorn]
  workflow_dispatch:
    inputs:
      kt:
        description: 'Ein kennitala lögaðila (10 tölur)'
        required: false
      kts:
        description: 'Magn-prófun: listi kennitalna (bil eða komma á milli)'
        required: false

permissions:
  contents: write

concurrency:
  group: stjorn
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
      - name: Uppsetning (puppeteer-core + poppler-utils)
        run: |
          npm install puppeteer-core --no-save
          sudo apt-get update && sudo apt-get install -y poppler-utils
      - name: Byggja stjórn
        env:
          CHROME_PATH: /usr/bin/google-chrome   # foruppsett á ubuntu-latest
          RAW_PAYLOAD: ${{ github.event.client_payload.kt }}   # untrusted → um env (ekki bein innskeyting) gegn shell-injection
          RAW_KT: ${{ github.event.inputs.kt }}
          RAW_KTS: ${{ github.event.inputs.kts }}
        run: |
          RAW="$RAW_PAYLOAD $RAW_KT $RAW_KTS"
          KTS="$(echo "$RAW" | sed -E 's/([0-9]{6})-([0-9]{4})/\1\2/g' | grep -oE '[0-9]{10}' | sort -u | tr '\n' ' ')"
          if [ -z "$KTS" ]; then echo "Engin gild kennitala í '$RAW' — hætti."; exit 0; fi
          echo "Byggi stjórn fyrir: $KTS"
          node skriptur/build_stjorn.mjs $KTS
      - name: Commit JSON (ef ný gögn)
        run: |
          git config user.name "karp-stjorn[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add web/public/gogn/stjorn/ 2>/dev/null || true
          if git diff --cached --quiet; then
            echo "Engin ný stjórnargögn."; exit 0
          fi
          git commit -m "Stjórn byggð (on-demand, GH Action)"
          for i in 1 2 3 4 5; do
            if git push; then echo "Push tókst (tilraun $i)"; exit 0; fi
            echo "Push hafnað (tilraun $i) — sæki + rebasa á origin/main..."
            git fetch origin main && git rebase origin/main || git rebase --abort 2>/dev/null || true
            sleep $((i * 3))
          done
          echo "❌ Push mistókst eftir 5 tilraunir"; exit 1
```

- [ ] **Step 2: YAML-gilding**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/stjorn.yml','utf8'); if(!/types: \[stjorn\]/.test(y)||!/build_stjorn\.mjs/.test(y)||!/poppler-utils/.test(y)) throw new Error('vantar lykil-línu'); console.log('OK stjorn.yml')"`
Expected: `OK stjorn.yml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/stjorn.yml
git commit -m "GH-Action stjorn.yml: on-demand stjórn-bygging (poppler-utils)"
```

---

### Task 5: Worker `stjornRequestHandler` + leið

Afrit af `arsreikningurRequestHandler` með `event_type:'stjorn'`.

**Files:**
- Modify: `web/worker.js` (nýtt fall eftir `eigendurRequestHandler` ~lína 1281; ný leið í `fetch`-switch ~lína 1536)

- [ ] **Step 1: Bæta `stjornRequestHandler` við** (eftir `eigendurRequestHandler`, fyrir `async function fyrirtaekiHandler`)

```js
// ── On-demand stjórn — dispatchar GitHub Action (speglar ársreikning/eigendur) ──
// /fyrirtaeki/ kallar hér þegar skýrsla hefur enga byggða stjórn. repository_dispatch { kt } →
// .github/workflows/stjorn.yml → web/public/gogn/stjorn/<kt>.json. Aðeins innskráðir → gegn misnotkun.
async function stjornRequestHandler(request, env, ctx) {
  const kt = (new URL(request.url).searchParams.get('kt') || '').replace(/\D/g, '');
  if (kt.length !== 10) return sjson({ error: 'kt' });
  if (!env.GITHUB_DISPATCH_TOKEN) return sjson({ error: 'unconfigured' });
  const uid = await karpUserId(request);
  if (!uid) return sjson({ error: 'login' });
  try {
    const r = await fetch('https://api.github.com/repos/aronheidar/KARP-2.0/dispatches', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'karp21-worker', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'stjorn', client_payload: { kt } }),
    });
    return r.status === 204 ? sjson({ ok: true, kt }) : sjson({ error: 'dispatch', status: r.status });
  } catch (e) { return sjson({ error: 'upstream' }); }
}
```

- [ ] **Step 2: Bæta leið við** — í `fetch`-switch, við hlið `/api/arsreikningur/request` (~lína 1536)

Finna línuna:
```js
    if (url.pathname === '/api/arsreikningur/request') return arsreikningurRequestHandler(request, env, ctx);
```
Bæta beint fyrir neðan:
```js
    if (url.pathname === '/api/stjorn/request') return stjornRequestHandler(request, env, ctx);
```

- [ ] **Step 3: Syntax-check**

Run: `node --check web/worker.js`
Expected: engin villa.

- [ ] **Step 4: Commit**

```bash
git add web/worker.js
git commit -m "Worker: /api/stjorn/request dispatchar stjórn-byggingu"
```

---

### Task 6: Frontend — fylla „🪑 Stjórn & prókúra"-hólfið

`fsStjorn` sækir JSON; hólfið birtir fulla stjórn (eða frí-teaser úr `f.radamenn`); poll ef í vinnslu.

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro`

**Interfaces:**
- Consumes: `/gogn/stjorn/<kt>.json` (Task 3), `/api/stjorn/request` (Task 5), `f.radamenn` (til staðar)

- [ ] **Step 1: Bæta `fsStjorn` helper** — við hlið `fsFjarhagur` (~eftir lína 946)

```js
    async function fsStjorn(kt, owned) {
      const id = String(kt).replace(/\D/g, '');
      try {
        const r = await fetch('/gogn/stjorn/' + id + '.json?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); return j && j.engin ? { engin: true } : j; }
      } catch (e) { return null; }
      if (owned) { try { fetch('/api/stjorn/request?kt=' + id, { method: 'POST', credentials: 'include' }); } catch (e) {} return { pending: true }; }
      return null;
    }
    // Poll-ar byggða stjórn og endurhleður hólfið þegar hún er komin (léttari en fsPollArsreikningur).
    function fsPollStjorn(kt) {
      const id = String(kt).replace(/\D/g, '');
      let n = 0;
      const poll = setInterval(async () => {
        const cell = document.getElementById('fs-stjorn-cell');
        if (!cell || n++ > 60) { clearInterval(poll); return; }
        try {
          const r = await fetch('/gogn/stjorn/' + id + '.json?t=' + Date.now(), { cache: 'no-store' });
          if (r.ok) { const j = await r.json(); if (j && !j.engin) { clearInterval(poll); cell.outerHTML = fsStjornCell(j); } else if (j && j.engin) { clearInterval(poll); } }
        } catch (e) {}
      }, 4000);
    }
```

- [ ] **Step 2: Bæta `fsStjornCell(rep)` render-hjálp** — nálægt öðrum render-föllum (t.d. fyrir ofan `fsKort`)

```js
    // Byggð stjórn (nafn + hlutverk) — fyllir grind-hólfið. rep = gogn/stjorn/<kt>.json.
    function fsStjornCell(rep) {
      if (!rep || !(rep.stjorn || []).length) return '';
      const rows = rep.stjorn.map((p) => '<span class="fs-stj-r"><span class="fs-stj-n">' + escF(p.nafn) + '</span><span class="fs-stj-h">' + escF(p.hlutverk) + '</span></span>').join('');
      const fr = rep.firmaritun ? '<span class="fs-stj-fr">Firmað rita: ' + escF(rep.firmaritun) + '</span>' : '';
      return '<div class="fs-ph filled" id="fs-stjorn-cell"><b>🪑 Stjórn &amp; prókúra</b><div class="fs-stj-list">' + rows + '</div>' + fr + '<span class="fs-ph-src">Skráð stjórn, framkvæmdastjórn, prókúra og endurskoðendur — fyrirtækjaskrá Skattsins (gjaldfrjálst yfirlit)</span></div>';
    }
```

- [ ] **Step 3: Skipta út föstu stjórn-hólfi** — [fyrirtaeki.astro:864](../../../web/src/pages/fyrirtaeki.astro)

Finna núverandi línu (ATH: nákvæm bæti við keyrslu):
```js
            <div class="fs-ph"><b>🪑 Stjórn & prókúra</b><span>${(f.radamenn || []).length ? 'Forráðamaður: <b style="color:#cdd6e6">' + escF((f.radamenn || []).join(' · ')) + '</b>. ' : ''}Fullur stjórnarlisti og prókúruhafar bíða API-aðgangs að hlutafélagaskrá.</span></div>
```
Skipta út fyrir (full stjórn ef byggð, annars fágaður forráðamanns-teaser án „bíða API"):
```js
            ${(f.stjorn || []).length
              ? fsStjornCell({ stjorn: f.stjorn, firmaritun: f.stjornFirmaritun })
              : `<div class="fs-ph${(f.radamenn || []).length ? ' filled' : ''}" id="fs-stjorn-cell"><b>🪑 Stjórn & prókúra</b>${(f.radamenn || []).length ? '<div class="fs-stj-list"><span class="fs-stj-r"><span class="fs-stj-n">' + escF((f.radamenn || []).join(' · ')) + '</span><span class="fs-stj-h">skráður forráðamaður</span></span></div><span class="fs-ph-src">Skráður forráðamaður — fyrirtækjaskrá Skattsins. Full stjórn birtist í keyptri skýrslu.</span>' : '<span>Stjórn, prókúra og framkvæmdastjórn birtast hér úr fyrirtækjaskrá Skattsins.</span>'}</div>`}
```

- [ ] **Step 4: Sækja stjórn fyrir render + poll** — í render-flæðinu hjá `fsFjarhagur`-kallinu (~lína 1146)

Beint eftir `const fj = await fsFjarhagur(f.kt, true);` blokkina (fyrir `skila(fsKort(f, d.rsk))`, ~lína 1150), bæta við:
```js
              const stj = await fsStjorn(f.kt, true);
              f.stjorn = stj && stj.stjorn ? stj.stjorn : null;
              f.stjornFirmaritun = stj && stj.firmaritun ? stj.firmaritun : null;
              f.stjornPending = !!(stj && stj.pending);
```
Og eftir `if (f.fjarhagurPending) fsPollArsreikningur(f.kt);` (~lína 1175):
```js
              if (f.stjornPending) fsPollStjorn(f.kt);
```

- [ ] **Step 5: Bæta CSS** — hjá `.fs-ph`-stílunum (~lína 162-177)

```css
    .fs-stj-list { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 2px; }
    .fs-stj-r { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    .fs-stj-n { color: #eaf1fb; }
    .fs-stj-h { color: #8fa0b8; white-space: nowrap; }
    .fs-stj-fr { display: block; color: #8fa0b8; font-size: 11px; margin-top: 4px; }
```

- [ ] **Step 6: Byggja + staðfesta**

Run: `cd web && npx astro build`
Expected: heppnast (~197 síður), engin villa.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "Fyrirtækjaskýrsla: fylla stjórn+prókúru úr byggðu RSK-yfirliti (+ forráðamanns-teaser)"
```

---

### Task 7: Vista ársreiknings-PDF (verk 2 bakendi)

`build_arsreikningar.mjs` vistar nýjasta árs PDF í stað þess að henda því; skráir `pdf`-reit.

**Files:**
- Modify: `skriptur/build_arsreikningar.mjs`

- [ ] **Step 1: Vista PDF + skrá reit** — í `buildForKt` (~línur 71-103)

Bæta PDF-möppu efst í fallinu (eftir `const tmp = ...`, ~lína 71):
```js
  const pdfDir = path.join(OUTDIR, 'pdf');
  fs.mkdirSync(pdfDir, { recursive: true });
```
Í for-lykkjunni, EFTIR `fs.writeFileSync(tmp, pdf);` (~lína 77), vista nýjasta árs PDF (fyrsta í `nyjust`):
```js
    if (r === nyjust[0]) { fs.copyFileSync(tmp, path.join(pdfDir, `${kt}.pdf`)); out.pdf = `pdf/${kt}.pdf`; out.pdfAr = r.ar; }   // opinbert skjal (lög 3/2006) — endurhýst á-eftirspurn
```

- [ ] **Step 2: Syntax-check**

Run: `node --check skriptur/build_arsreikningar.mjs`
Expected: engin villa.

- [ ] **Step 3: Handvirk sönnun**

Run: `node skriptur/build_arsreikningar.mjs 5411850389`
Expected: `web/public/gogn/arsreikningar/pdf/5411850389.pdf` verður til, og `5411850389.json` inniheldur `"pdf": "pdf/5411850389.pdf"` og `"pdfAr"`.

- [ ] **Step 4: Commit** (aðeins kóðann; PDF-skrár eru afurð Actions — sjá .gitignore-athugun)

```bash
git add skriptur/build_arsreikningar.mjs
git commit -m "build_arsreikningar: vista nýjasta árs PDF (gogn/arsreikningar/pdf/<kt>.pdf) + pdf-reit"
```

---

### Task 8: Frontend — „📄 Sækja ársreikning (PDF)"-tengill (verk 2 framendi)

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro`

- [ ] **Step 1: Bera `pdf`-reit í gegnum `fsMapArs`** — finna `fsMapArs`/`fsFjarhagur` og láta `pdf`/`pdfAr` fylgja röðunum

Í `fsFjarhagur`, þar sem `return fsMapArs(j);` (~lína 939), skipta út fyrir:
```js
          const rows = fsMapArs(j); if (Array.isArray(rows)) { rows.pdf = j.pdf || null; rows.pdfAr = j.pdfAr || null; } return rows;
```

- [ ] **Step 2: Birta tengil í KPI-hausnum** — í `fsKpiHtml` (~lína 999)

Skipta út `fs-sub`-línunni:
```js
      return '<div class="fs-sub">📊 Fjárhagsmælaborð — lykiltölur úr ársreikningi (' + rows.map((r) => r.ar).join(' · ') + ')</div>'
```
fyrir (bætir tengli þegar `rows.pdf` er til):
```js
      const pdfLink = rows.pdf ? '<a class="fs-pdf-dl" href="/gogn/arsreikningar/' + rows.pdf + '" download title="Opinber ársreikningur (RSK, gjaldfrjáls)">📄 Sækja ársreikning' + (rows.pdfAr ? ' ' + escF(String(rows.pdfAr)) : '') + ' (PDF)</a>' : '';
      return '<div class="fs-sub">📊 Fjárhagsmælaborð — lykiltölur úr ársreikningi (' + rows.map((r) => r.ar).join(' · ') + ')' + pdfLink + '</div>'
```

- [ ] **Step 3: CSS fyrir tengilinn** — hjá KPI-stílunum

```css
    .fs-pdf-dl { float: right; color: #f6b13b; font-size: 12px; font-weight: 600; text-decoration: none; }
    .fs-pdf-dl:hover { text-decoration: underline; }
```

- [ ] **Step 4: Byggja + staðfesta**

Run: `cd web && npx astro build`
Expected: heppnast, engin villa.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "Fyrirtækjaskýrsla: 📄 Sækja ársreikning (PDF) tengill þegar PDF er til"
```

---

### Task 9: Veðbókarvottorðs-tengill á fasteignaskýrslu (verk 3)

**Files:**
- Modify: `web/src/pages/fasteignavakt.astro`

- [ ] **Step 1: Bæta tengli við skýrslu-aðgerðir** — hjá `#fvm-buy`-hnappnum (~lína 38)

Finna:
```html
      <button id="fvm-buy" class="cta cta-alt" type="button" hidden>🛒 Kaupa matsskýrslu — 990 kr</button>
```
Bæta beint fyrir neðan:
```html
      <a id="fvm-vedbok" class="cta cta-ghost" href="https://island.is/vedbokarvottord" target="_blank" rel="noopener" hidden title="Opinbert veðbókarvottorð — veðbönd og þinglýst skjöl (island.is, rafræn skilríki)">🔗 Sækja veðbókarvottorð</a>
```

- [ ] **Step 2: Sýna tengilinn þegar skýrsla er tilbúin** — þar sem `fvm-buy` birtist (~lína 826-830)

Finna blokkina sem afhjúpar `fvm-buy` (`bb.hidden = false; ...`) og bæta við (samhliða):
```js
        const vb2 = document.getElementById('fvm-vedbok'); if (vb2) vb2.hidden = false;
```

- [ ] **Step 3: CSS `cta-ghost` (ef ekki til) + skýring**

Athuga hvort `.cta-ghost` sé til; ef ekki, bæta við hjá `.cta`-stílunum:
```css
    main[data-pg="fastvakt"] .cta-ghost { background: transparent; border-color: rgba(246,177,59,.4); color: #f6b13b; }
    main[data-pg="fastvakt"] .cta-ghost::after { content: ' (opinbert vottorð, 3.100 kr, greitt á island.is)'; color: #7e8ca6; font-size: 10.5px; font-weight: 400; }
```

- [ ] **Step 4: Byggja + staðfesta**

Run: `cd web && npx astro build`
Expected: heppnast, engin villa.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fasteignavakt.astro
git commit -m "Fasteignaskýrsla: 🔗 Sækja veðbókarvottorð tengill (island.is, opinber þjónusta)"
```

---

### Task 10: Lokastaðfesting + samantekt

- [ ] **Step 1: Heildarbygging + öll próf/checks**

Run:
```bash
cd web && npx astro build && cd ..
node --check web/worker.js
node --check skriptur/build_stjorn.mjs
node --check skriptur/build_arsreikningar.mjs
node --check skriptur/lib/rsk.mjs
node --test skriptur/test/
```
Expected: allt grænt (astro ~197 síður; öll node:test próf standast).

- [ ] **Step 2: Athuga .gitignore fyrir PDF-vöxt**

Kanna hvort `web/public/gogn/arsreikningar/pdf/` eigi að vera í `.gitignore` (afurð Actions) EÐA committað (þjónað af Pages). Núverandi mynstur: `arsreikningar/<kt>.json` ER committað af Actions → PDF fylgir sama mynstri (committað). **Skrá athugasemd í samantekt: PDF þenur git-sögu → færa í Cloudflare R2 ef þetta vex mikið.**

- [ ] **Step 3: Skrifa samantekt fyrir Aron** (í svari, ekki skrá): hvað var byggt, DoD-staða (stjórn birtist, PDF-tengill virkar, veðbókarvottorð tengt), R2-ábending fyrir PDF-geymslu, og afmörkun gagnvart samhliða `/eigendur/`-grein.

## Self-Review

**Spec coverage:**
- Verk 1 (full stjórn): Tasks 1–6 ✓ (þáttari, fetch, build, workflow, worker, framendi).
- Verk 2 (ársreiknings-PDF): Tasks 7–8 ✓ (vistun + tengill).
- Verk 3 (veðbókarvottorð): Task 9 ✓.
- Persónuvernd (nafn+hlutverk, engin kt/heimilisfang): Task 1 Step 1 (próf) + Task 3 Step 3 (handvirkt eftirlit) ✓.
- Aðgangsstýring (owned-gated dispatch): Task 5 (`karpUserId`) + Task 6 (`fsStjorn(kt, owned)`) ✓.
- Build grænn / node --check / astro: Task 10 ✓.
- R2-ábending: Task 10 Step 2–3 ✓.

**Placeholder scan:** Engin „TBD/TODO"; öll skref hafa raunverulegan kóða eða nákvæma keyrslu. Astro-skref tilgreina nákvæm akkeri (bæti staðfest við keyrslu).

**Type consistency:** `parseStjornText → {stjorn,firmaritun,dags}` (Task 1) notað í `fetchStjorn` (Task 2), `build_stjorn` (Task 3), `fsStjornCell`/`fsStjorn` (Task 6). JSON-reitir `stjorn/firmaritun/dags/engin/pdf/pdfAr` samræmdir milli producer (build) og consumer (astro). `fs-stjorn-cell` id samræmt milli render (Task 6 Step 2/3) og poll (Task 6 Step 1).
