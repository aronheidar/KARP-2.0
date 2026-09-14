# /stjorn/ starfsmannamiðað viðmót (Hluti A) — útfærslu-áætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Breyta `/stjorn/` úr einni súlu með tíu blokkum í forstofu sem svarar „hvað bíður mín?" strax, með andlitarönd sem skiptir yfir í spjald Sigrúnar eða Hrafns.

**Architecture:** Öll teikniröksemd flyst í fjórar **hreinar** einingar undir `web/src/lib/stjorn/` sem taka gögn og skila HTML-streng — þær prófast með `node --test` og eru fluttar inn af `<script>`-blokk síðunnar (Vite byggir; `stjorn.astro` gerir þetta þegar fyrir `personur.mjs`). `stjorn.astro` verður umgjörð: sækir gögn, teiknar forstofu, skiptir um spjald eftir `location.hash`. Ný worker-eining `bilanir.mjs` sækir bilanalista úr GitHub með 10 mínútna fyrningu í `stjorn_sync`.

**Tech Stack:** Astro 5 (SSG) + Cloudflare Worker (V8 isolate) + D1. Vanilla ESM (`.mjs`), `node:test` + `node:assert/strict`. Engin ný dependency.

**Hönnun:** `docs/superpowers/specs/2026-09-14-stjorn-starfsmannavidmot-design.md`

**Vinnusvæði:** `C:\Users\aronh\dev\karp-hjalp` (grein `hjalp-agent`, byggð á `origin/main`). Deploy = `git push origin hjalp-agent:main`. **Committaðu strax eftir hvert verk** — önnur lota ýtir á `main` margsinnis á dag og `git rebase origin/main` er gerður fyrir hverja ýtingu.

---

## Global Constraints

- **Ein uppspretta fyrir „bíður þín".** Forstofan og „Bíður þín"-hólf spjaldanna lesa SAMA lista úr `bidur_thin.mjs`, bara síaðan. Tölurnar mega aldrei stangast á.
- **Engin tóm andlit.** Andlitaröndin sýnir aðeins `sigrun` og `hrafn`. Bjarki bætist við í hluta B; Unnur/Elín/Egill síðar. Ekki bæta við andliti án vélar á bak við það.
- **Tómt hólf birtist ekki.** `spjald()` sleppir hólfi sem hefur engar línur — aldrei „0" til að fylla formið.
- **Öryggisreglur óbreyttar:** agent sendir sjálfur AÐEINS sniðmáts-staðfestingu og orðrétt KB-svar; Moot breytir aldrei stöðu og sendir aldrei póst; `samthykkja` og `atkvaedi` krefjast innskráðrar lotu (X-Admin-Key hafnað); CSRF-gát á öllum kökulotu-POST-um.
- **Nýi endapunkturinn fylgir sama mynstri:** `GET /api/admin/bilanir` má með `X-Admin-Key`, en `POST {verk}` krefst lotu — það ræsir kóðabreytingu í framleiðslu.
- **CSS í `<style is:global>`.** Astro tré-hristir scoped-CSS sem aðeins er notað í runtime-`innerHTML`. Allar nýjar `.stj-*`-reglur fara í global-blokkina sem er þegar til í `stjorn.astro`.
- **Rofi Sigrúnar heldur lyklinum `hjalp_agent_off`** — ekkert endurnefnt, engin gagnafærsla, `processNewTicket` ósnert.
- **`ci_worker_bindings.mjs` er CI-hlið:** worker-einingar mega ekki lýsa yfir toppstigs-nöfnum sem rekast á staðbundin nöfn annarra skráa. Notaðu `_bl`-forskeyti í `bilanir.mjs` (`_blNow`, `_blGh`). Keyrðu `node skriptur/ci_worker_bindings.mjs` ÁÐUR en þú committar worker-breytingu.
- Athugasemdir á íslensku, í stíl við kringliggjandi kóða. Commit-skilaboð á íslensku með `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- `npm`-skipanir keyra úr `web/`, `git`-skipanir úr rót worktree-sins.
- **730 próf eru græn fyrir.** Engin breyting má fækka þeim eða gera eitt rautt.

---

## File Structure

| Skrá | Ábyrgð |
|---|---|
| `web/src/lib/stjorn/bidur_thin.mjs` | **Hrein.** `tickets` + `bilanir` → einn raðaður listi yfir það sem bíður Arons |
| `web/src/lib/stjorn/spjald.mjs` | **Hrein.** Beinagrindin (5 hólf) → HTML-strengur. Á líka `esc()` sem síðan notar |
| `web/src/lib/stjorn/sigrun.mjs` | **Hrein.** `overview` → hólfin fimm hjá Sigrúnu |
| `web/src/lib/stjorn/hrafn.mjs` | **Hrein.** `overview` + `bilanir` → hólfin fimm hjá Hrafni |
| `web/src/worker/bilanir.mjs` | **I/O.** GitHub-fyrirspurnir, fyrning í `stjorn_sync`, `/api/admin/bilanir` |
| `web/src/lib/personur.mjs` | Hrafn verður forritari; `ROFAR`-kort starfsmaður → rofi-lykill |
| `web/src/worker/hjalp_agent.mjs` | `_ghDispatch` fluttur út + virðir `rofi_hrafn`; `rofi`-aðgerð tekur starfsmann; `ticketsOverview` skilar `sjalfvirk` |
| `web/src/worker/stjornbord.mjs` | Gamli `stjorn`-farmurinn fjarlægður úr svarinu |
| `web/worker.js` | Leið `/api/admin/bilanir` |
| `.github/workflows/cto.yml` | Tekur frjálst `verk` auk `ticket` |
| `web/src/pages/stjorn.astro` | Umgjörð: forstofa, andlitarönd, hash-leið, spjöldin tvö |

---

### Task 1: Hrafn verður forritari + rofi-kort

**Files:**
- Modify: `web/src/lib/personur.mjs` (færslan `hrafn`, ~lína 23)
- Modify: `web/src/lib/personur.test.mjs`
- Modify: `.github/workflows/cto.yml` (persónulína í `cto_prompt.tmpl`)

**Interfaces:**
- Produces: `ROFAR` (hlutur `{sigrun:'hjalp_agent_off', hrafn:'rofi_hrafn'}`), `rofiLykill(id) -> string|null`

- [ ] **Step 1: Skrifaðu fallandi próf**

Bættu aftast í `web/src/lib/personur.test.mjs`:

```js
test('Hrafn er forritari, ekki CTO — titill og undirskrift fylgjast að', () => {
  const h = persona('hrafn');
  assert.equal(h.hlutverk, 'forritari');
  assert.equal(h.undirskrift, 'Hrafn — forritari Karp');
  assert.ok(!JSON.stringify(PERSONUR).includes('CTO'), 'ekkert „CTO" eftir í persónuskránni');
});

test('ROFAR: aðeins starfsmenn með vél fá rofa; Sigrún heldur gamla lyklinum', () => {
  assert.equal(rofiLykill('sigrun'), 'hjalp_agent_off');   // ⚠ ekkert endurnefnt — flæðið í loftinu les þennan lykil
  assert.equal(rofiLykill('hrafn'), 'rofi_hrafn');
  assert.equal(rofiLykill('kari'), null);
  assert.equal(rofiLykill('ekki-til'), null);
  assert.equal(rofiLykill(null), null);
  for (const id of Object.keys(ROFAR)) assert.ok(PERSONA_IDS.includes(id), id + ' er til');
});
```

Bættu `ROFAR, rofiLykill` við `import`-línuna efst í prófskránni.

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/personur.test.mjs`
Expected: FAIL — `rofiLykill is not a function`

- [ ] **Step 3: Breyttu persónunni**

Í `web/src/lib/personur.mjs`, færslan `hrafn`:

```js
    id: 'hrafn', nafn: 'Hrafn', hlutverk: 'forritari', emoji: '🛠️', kyn: 'kk', litur: '#5b8dd6',
```
og
```js
    undirskrift: 'Hrafn — forritari Karp',
```

- [ ] **Step 4: Bættu rofa-kortinu við**

Beint á eftir `export function persona(id) { … }` í sömu skrá:

```js
/** Starfsmenn sem hafa VÉL sem má slökkva á → lykill í stjorn_sync. Persóna án vélar (Moot-sæti eitt og sér)
 *  fær engan rofa. ⚠ Sigrún heldur upprunalega lyklinum 'hjalp_agent_off': flæðið sem er í loftinu les hann
 *  (processNewTicket) og endurnefning myndi þagga sjálfvirknina án þess að nokkuð sýndist að. */
export const ROFAR = { sigrun: 'hjalp_agent_off', hrafn: 'rofi_hrafn' };
export function rofiLykill(id) {
  return (typeof id === 'string' && Object.prototype.hasOwnProperty.call(ROFAR, id)) ? ROFAR[id] : null;
}
```

- [ ] **Step 5: Keyrðu prófið aftur**

Run: `cd web && node --test src/lib/personur.test.mjs`
Expected: PASS

- [ ] **Step 6: Uppfærðu persónulýsingu Hrafns í CTO-workflow-inu**

Í `.github/workflows/cto.yml`, fyrsta lína `cto_prompt.tmpl`:

```
          Þú ert Hrafn, forritari Karp (karp.is — Astro-vefur í web/ + Cloudflare Worker web/worker.js og web/src/worker/*.mjs, gögn í gogn/ byggð af skriptur/).
```

- [ ] **Step 7: Staðfestu YAML og allt prófasettið**

Run: `cd web && npm test`
Expected: `pass 731` (730 + nýja rofa-prófið; titil-prófið er í sömu skrá)

Run: `python -c "import yaml,io; yaml.safe_load(io.open('.github/workflows/cto.yml',encoding='utf-8')); print('yaml ok')"` (úr rót worktree)
Expected: `yaml ok`

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/personur.mjs web/src/lib/personur.test.mjs .github/workflows/cto.yml
git commit -m "Hrafn er forritari, ekki CTO — og rofi verður per starfsmaður"
```

---

### Task 2: `bidur_thin.mjs` — einn samræmdur listi

**Files:**
- Create: `web/src/lib/stjorn/bidur_thin.mjs`
- Create: `web/src/lib/stjorn/bidur_thin.test.mjs`

**Interfaces:**
- Consumes: `overview.tickets` (`{list, open, by, moot_bida, moot_osent}`) og bilanalista úr Task 6 (`[{uppspretta, lysing, sidan, alvarleiki, slod}]`)
- Produces: `bidurThin({tickets, bilanir, now}) -> Rod[]` þar sem `Rod = {starfsmadur, tegund, titill, vidbot, sidan, slod, bid, adkallandi}`, raðað elst fyrst · `bidurFyrir(listi, starfsmadur) -> Rod[]` · `ADKALLANDI_SEK`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/stjorn/bidur_thin.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADKALLANDI_SEK, bidurFyrir, bidurThin } from './bidur_thin.mjs';

const NU = 1_800_000_000;
const t = (id, stada, updated, auka = {}) => Object.assign({ id, stada, updated, created: updated - 60, efni: 'Efni ' + id }, auka);

test('ein lína á hverja beiðni — sértækasta ástandið ræður', () => {
  const r = bidurThin({ now: NU, tickets: {
    list: [t(1, 'stadfest', NU - 100), t(2, 'stadfest', NU - 200), t(3, 'stadfest', NU - 300)],
    moot_osent: [2], moot_bida: [3],
  } });
  assert.deepEqual(r.map((x) => [x.tegund, x.titill]), [
    ['moot', '#3 — Moot bíður atkvæðis'],
    ['moot_osent', '#2 — samþykkt svar ósent'],
    ['svar', '#1 — bíður svars'],
  ], 'elst fyrst, og hver beiðni birtist aðeins einu sinni');
  assert.equal(r.length, 3);
});

test('beiðnir Sigrúnar og verk Hrafns lenda á réttum starfsmanni', () => {
  const r = bidurThin({ now: NU, tickets: { list: [
    t(1, 'stadfest', NU - 10),
    t(2, 'tillaga', NU - 20, { cto_pr: 'https://github.com/aronheidar/KARP-2.0/pull/10' }),
    t(3, 'cto', NU - 7200),
    t(4, 'svarad', NU - 30),
    t(5, 'lokad', NU - 40),
  ] } });
  assert.deepEqual(r.map((x) => x.starfsmadur + ':' + x.tegund), ['hrafn:cto_fast', 'hrafn:tillaga', 'sigrun:svar']);
  assert.equal(bidurFyrir(r, 'sigrun').length, 1);
  assert.equal(bidurFyrir(r, 'hrafn').length, 2);
});

test('beiðni í stöðu cto telst föst fyrst eftir klukkustund', () => {
  const nyleg = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 600)] } });
  assert.deepEqual(nyleg, []);
  const fost = bidurThin({ now: NU, tickets: { list: [t(3, 'cto', NU - 3601)] } });
  assert.equal(fost[0].tegund, 'cto_fast');
});

test('aðkallandi eftir 48 klst; bid er reiknað í sekúndum', () => {
  const r = bidurThin({ now: NU, tickets: { list: [t(1, 'stadfest', NU - ADKALLANDI_SEK - 1), t(2, 'stadfest', NU - 60)] } });
  assert.equal(r[0].adkallandi, true);
  assert.equal(r[0].bid, ADKALLANDI_SEK + 1);
  assert.equal(r[1].adkallandi, false);
});

test('aðeins HÁ bilun bíður þín — miðlungs og lág fara ekki á listann', () => {
  const bilanir = [
    { uppspretta: 'CI', lysing: 'main er rautt', sidan: NU - 500, alvarleiki: 'hatt', slod: '#hrafn' },
    { uppspretta: 'PR', lysing: 'PR #3 opinn í 60 daga', sidan: NU - 900, alvarleiki: 'midlungs', slod: '#hrafn' },
  ];
  const r = bidurThin({ now: NU, tickets: {}, bilanir });
  assert.equal(r.length, 1);
  assert.equal(r[0].starfsmadur, 'hrafn');
  assert.equal(r[0].titill, 'main er rautt');
  assert.equal(r[0].vidbot, 'CI');
});

test('tóm eða gölluð gögn skila tómum lista í stað þess að kasta', () => {
  assert.deepEqual(bidurThin({}), []);
  assert.deepEqual(bidurThin({ tickets: { list: null }, bilanir: null, now: NU }), []);
  assert.deepEqual(bidurThin(), []);
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/stjorn/bidur_thin.test.mjs`
Expected: FAIL — `Cannot find module … bidur_thin.mjs`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/stjorn/bidur_thin.mjs`:

```js
// bidur_thin.mjs — HREIN eining: yfirlit + bilanir → EINN listi yfir það sem bíður Arons.
//
// Forstofan sýnir listann sameinaðan, „Bíður þín"-hólf hvers spjalds sýnir hann síaðan á eiganda.
// EIN uppspretta er kjarninn: tvær talningar á sama hlut enda alltaf á því að stangast á, og þá
// hættir maður að treysta báðum.

export const ADKALLANDI_SEK = 48 * 3600;   // beiðni sem hefur beðið svo lengi fær áherslu, ekki eigin línu
const CTO_FAST_SEK = 3600;                 // CTO-keyrsla tekur mínútur; klukkustund þýðir að eitthvað féll

function rod(starfsmadur, tegund, titill, vidbot, sidan, slod) {
  return { starfsmadur, tegund, titill, vidbot: vidbot || '', sidan: Number(sidan) || 0, slod };
}

/** @returns {Array} raðað elst fyrst — það sem hefur beðið lengst er efst. */
export function bidurThin({ tickets = {}, bilanir = [], now = 0 } = {}) {
  const ut = [];
  const listi = Array.isArray(tickets && tickets.list) ? tickets.list : [];
  const osent = new Set((tickets && tickets.moot_osent) || []);
  const mootBida = new Set((tickets && tickets.moot_bida) || []);
  for (const t of listi) {
    if (!t || !t.id) continue;
    const sidan = Number(t.updated || t.created || 0);
    const slod = '#ticket-' + t.id;
    // Sértækasta ástandið ræður svo hver beiðni birtist AÐEINS einu sinni.
    if (osent.has(t.id)) ut.push(rod('sigrun', 'moot_osent', '#' + t.id + ' — samþykkt svar ósent', t.efni, sidan, slod));
    else if (mootBida.has(t.id)) ut.push(rod('sigrun', 'moot', '#' + t.id + ' — Moot bíður atkvæðis', t.efni, sidan, slod));
    else if (t.stada === 'nytt' || t.stada === 'stadfest') ut.push(rod('sigrun', 'svar', '#' + t.id + ' — bíður svars', t.efni, sidan, slod));
    else if (t.stada === 'tillaga') ut.push(rod('hrafn', 'tillaga', '#' + t.id + ' — CTO-tillaga tilbúin', t.efni, sidan, slod));
    else if (t.stada === 'cto' && Number(now) - sidan > CTO_FAST_SEK) ut.push(rod('hrafn', 'cto_fast', '#' + t.id + ' — keyrsla hefur staðið í meira en klukkustund', t.efni, sidan, slod));
  }
  for (const b of (Array.isArray(bilanir) ? bilanir : [])) {
    if (!b || b.alvarleiki !== 'hatt') continue;   // miðlungs/lágt sést á spjaldi Hrafns, truflar ekki forstofuna
    ut.push(rod('hrafn', 'bilun', b.lysing, b.uppspretta, b.sidan, b.slod || '#hrafn'));
  }
  const nu = Number(now) || 0;
  return ut
    .map((r) => Object.assign(r, { bid: Math.max(0, nu - r.sidan), adkallandi: nu - r.sidan > ADKALLANDI_SEK }))
    .sort((a, b) => a.sidan - b.sidan);
}

export function bidurFyrir(listi, starfsmadur) {
  return (Array.isArray(listi) ? listi : []).filter((r) => r && r.starfsmadur === starfsmadur);
}
```

- [ ] **Step 4: Keyrðu prófið aftur**

Run: `cd web && node --test src/lib/stjorn/bidur_thin.test.mjs`
Expected: PASS — `pass 6`

- [ ] **Step 5: Staðfestu að prófaskipunin nái nýju möppunni**

Run: `cd web && node -e "console.log(require('./package.json').scripts.test)"`

Ef `test`-skipunin er `node --test src/lib/*.test.mjs …` þarf að bæta `src/lib/stjorn/*.test.mjs` við hana. Breyttu `package.json`:

```json
"test": "node --test src/lib/*.test.mjs src/lib/stjorn/*.test.mjs src/worker/*.test.mjs test/*.test.mjs"
```

(Haltu þeim slóðum sem fyrir eru — bættu aðeins `src/lib/stjorn/*.test.mjs` við.)

Run: `cd web && npm test`
Expected: `pass 737` (731 + 6)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/stjorn/bidur_thin.mjs web/src/lib/stjorn/bidur_thin.test.mjs web/package.json
git commit -m "Bíður þín: einn listi sem forstofan og spjöldin deila"
```

---

### Task 3: `spjald.mjs` — beinagrindin sem öll spjöld deila

**Files:**
- Create: `web/src/lib/stjorn/spjald.mjs`
- Create: `web/src/lib/stjorn/spjald.test.mjs`

**Interfaces:**
- Produces: `esc(s) -> string` · `spjald({id, nafn, hlutverk, avatar, stada, sidast, bidur, vinnsla, tolur, heimildir, rofi}) -> string` (HTML)
- Consumes: raðir frá `bidurThin` í `bidur`-sviðinu

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/stjorn/spjald.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, spjald } from './spjald.mjs';

const GRUNNUR = { id: 'sigrun', nafn: 'Sigrún', hlutverk: 'þjónustufulltrúi', avatar: '<svg id="a"></svg>', stada: '1 opin beiðni', sidast: 'í dag 18:00' };

test('esc: gerir < > & " og einkvæmt úrfellingarmerki skaðlaus', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(esc("O'Brien & co"), 'O&#39;Brien &amp; co');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});

test('haus ber nafn, hlutverk og stöðu — og avatarinn fer ÓBREYTTUR inn (fast SVG)', () => {
  const h = spjald(GRUNNUR);
  assert.match(h, /Sigrún/);
  assert.match(h, /þjónustufulltrúi/);
  assert.match(h, /1 opin beiðni/);
  assert.ok(h.includes('<svg id="a"></svg>'), 'avatar er ekki esc-aður');
  assert.match(h, /data-starfsmadur="sigrun"/);
});

test('tómt hólf birtist EKKI — engin núll til að fylla formið', () => {
  const h = spjald(GRUNNUR);
  assert.ok(!h.includes('Bíður þín'));
  assert.ok(!h.includes('Í vinnslu'));
  assert.ok(!h.includes('Tölur sem ég vakta'));
  assert.ok(!h.includes('Það sem ég má gera'));
});

test('hólf birtast þegar þau hafa innihald, og talan fylgir fyrirsögninni', () => {
  const h = spjald(Object.assign({}, GRUNNUR, {
    bidur: [{ titill: '#1 — bíður svars', vidbot: 'Villa á síma', slod: '#ticket-1', bid: 7200, adkallandi: false, tegund: 'svar' }],
    vinnsla: [{ texti: 'Staðfesting send á #2', hvenaer: 'í gær' }],
    tolur: [{ n: '3', l: 'opnar beiðnir', s: '1 ný' }],
    heimildir: ['sendir staðfestingu sjálf', 'aldrei AI-saminn texta'],
  }));
  assert.match(h, /Bíður þín <span[^>]*>1<\/span>/);
  assert.match(h, /#1 — bíður svars/);
  assert.match(h, /Villa á síma/);
  assert.match(h, /href="#ticket-1"/);
  assert.match(h, /Staðfesting send á #2/);
  assert.match(h, /opnar beiðnir/);
  assert.match(h, /aldrei AI-saminn texta/);
});

test('allt módel-/notendatengt er esc-að', () => {
  const h = spjald(Object.assign({}, GRUNNUR, {
    nafn: '<b>x</b>',
    bidur: [{ titill: '<script>a()</script>', vidbot: '"gæsalappir"', slod: '#t', bid: 0, adkallandi: false, tegund: 'svar' }],
  }));
  assert.ok(!h.includes('<script>a()</script>'));
  assert.ok(!h.includes('<b>x</b>'));
  assert.match(h, /&lt;script&gt;/);
});

test('aðkallandi lína fær merkingu sem hægt er að stílsetja', () => {
  const h = spjald(Object.assign({}, GRUNNUR, { bidur: [{ titill: 'gamalt', vidbot: '', slod: '#a', bid: 200000, adkallandi: true, tegund: 'svar' }] }));
  assert.match(h, /stj-bidur-rod--adkallandi/);
});

test('rofi birtist aðeins þegar lykill fylgir, og textinn segir hvað smellur gerir', () => {
  assert.ok(!spjald(GRUNNUR).includes('stj-rofi'));
  const a = spjald(Object.assign({}, GRUNNUR, { rofi: { lykill: 'hjalp_agent_off', off: false } }));
  assert.match(a, /data-rofi="hjalp_agent_off"/);
  assert.match(a, /slökkva/);
  const b = spjald(Object.assign({}, GRUNNUR, { rofi: { lykill: 'hjalp_agent_off', off: true } }));
  assert.match(b, /kveikja/);
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/stjorn/spjald.test.mjs`
Expected: FAIL — `Cannot find module … spjald.mjs`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/stjorn/spjald.mjs`:

```js
// spjald.mjs — HREIN eining: beinagrind starfsmannaspjalds → HTML-strengur.
//
// Fimm hólf, alltaf í sömu röð: haus · bíður þín · í vinnslu · tölur · það sem ég má gera.
// Það er þessi endurtekning sem gerir spjöldin að liði frekar en ólíkum mælaborðum — og hún
// er ástæða þess að beinagrindin er ein eining en ekki afrituð inn í hvert spjald.
//
// ⚠ ALLT sem kemur úr gögnum fer gegnum esc(). EINA hráa innsetningin er `avatar` — fast,
//   forritað SVG úr personur.mjs (sama regla og Moot-salurinn fylgir).

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** „fyrir 2 klst" / „fyrir 3 daga" — biðtími er það sem segir hvort eitthvað sé að gleymast. */
export function bidTexti(sek) {
  const s = Math.max(0, Math.floor(Number(sek) || 0));
  if (s < 3600) return 'fyrir ' + Math.max(1, Math.round(s / 60)) + ' mín';
  if (s < 86400) return 'fyrir ' + Math.round(s / 3600) + ' klst';
  return 'fyrir ' + Math.round(s / 86400) + ' daga';
}

function hola(titill, innihald, n, aukastett) {
  if (!innihald) return '';
  return '<section class="stj-hola' + (aukastett ? ' ' + aukastett : '') + '"><h3>' + esc(titill)
    + (n ? ' <span class="stj-hola-n">' + esc(String(n)) + '</span>' : '') + '</h3>' + innihald + '</section>';
}

export function spjald({ id, nafn, hlutverk, avatar = '', stada = '', sidast = '', bidur = [], vinnsla = [], tolur = [], heimildir = [], rofi = null } = {}) {
  const bidurHtml = (bidur || []).map((r) => '<a class="stj-bidur-rod' + (r.adkallandi ? ' stj-bidur-rod--adkallandi' : '') + '" href="' + esc(r.slod) + '" data-tegund="' + esc(r.tegund) + '">'
    + '<span class="stj-bidur-titill">' + esc(r.titill) + '</span>'
    + (r.vidbot ? '<span class="stj-bidur-vidbot">' + esc(r.vidbot) + '</span>' : '')
    + '<span class="stj-bidur-bid">' + esc(bidTexti(r.bid)) + '</span></a>').join('');
  const vinnslaHtml = (vinnsla || []).map((v) => '<li><span class="stj-vinnsla-texti">' + esc(v.texti) + '</span>'
    + (v.hvenaer ? '<span class="stj-vinnsla-hvenaer">' + esc(v.hvenaer) + '</span>' : '') + '</li>').join('');
  const tolurHtml = (tolur || []).map((t) => '<div class="stj-card"><div class="n">' + esc(t.n) + '</div><div class="l">' + esc(t.l) + '</div>'
    + (t.s ? '<div class="s">' + esc(t.s) + '</div>' : '') + '</div>').join('');
  const heimildirHtml = (heimildir || []).map((h) => '<li>' + esc(h) + '</li>').join('');
  const rofiHtml = rofi && rofi.lykill
    ? '<button type="button" class="stj-btn stj-btn-sm stj-rofi" data-rofi="' + esc(rofi.lykill) + '" data-off="' + (rofi.off ? '1' : '0') + '">'
      + (rofi.off ? '⛔ Sjálfvirkni slökkt — kveikja' : '🟢 Sjálfvirkni á — slökkva') + '</button>'
    : '';

  return '<div class="stj-spjald" data-starfsmadur="' + esc(id) + '">'
    + '<div class="stj-spjald-haus">' + avatar
    + '<div class="stj-spjald-nafn"><h2>' + esc(nafn) + ' <span>' + esc(hlutverk) + '</span></h2>'
    + (stada ? '<p class="stj-spjald-stada">' + esc(stada) + '</p>' : '')
    + (sidast ? '<p class="stj-spjald-sidast">síðast virk(ur): ' + esc(sidast) + '</p>' : '') + '</div>'
    + rofiHtml + '</div>'
    + hola('Bíður þín', bidurHtml, (bidur || []).length, 'stj-hola--bidur')
    + hola('Í vinnslu / síðast gert', vinnslaHtml ? '<ul class="stj-vinnsla">' + vinnslaHtml + '</ul>' : '')
    + hola('Tölur sem ég vakta', tolurHtml ? '<div class="stj-cards">' + tolurHtml + '</div>' : '')
    + hola('Það sem ég má gera', heimildirHtml ? '<ul class="stj-heimildir">' + heimildirHtml + '</ul>' : '')
    + '</div>';
}
```

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/lib/stjorn/spjald.test.mjs`
Expected: PASS — `pass 7`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/stjorn/spjald.mjs web/src/lib/stjorn/spjald.test.mjs
git commit -m "Spjald-beinagrindin: fimm hólf, og tómt hólf birtist ekki"
```

---

### Task 4: Spjald Sigrúnar + `sjalfvirk`-talan úr D1

**Files:**
- Create: `web/src/lib/stjorn/sigrun.mjs`
- Create: `web/src/lib/stjorn/sigrun.test.mjs`
- Modify: `web/src/worker/hjalp_agent.mjs` (`ticketsOverview`, ~lína 264)
- Modify: `web/src/worker/hjalp_agent.test.mjs`

**Interfaces:**
- Consumes: `bidurFyrir` (Task 2), `overview.tickets` með nýju sviði `sjalfvirk`
- Produces: `sigrunGogn(overview, bidurListi, now) -> {stada, sidast, bidur, vinnsla, tolur, heimildir, rofi}` — nákvæmlega þau svið sem `spjald()` tekur (fyrir utan `id/nafn/hlutverk/avatar`)

- [ ] **Step 1: Skrifaðu fallandi próf fyrir hreinu eininguna**

Búðu til `web/src/lib/stjorn/sigrun.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sigrunGogn } from './sigrun.mjs';

const NU = 1_800_000_000;
const OV = {
  now: NU,
  tickets: {
    open: 3, off: false, sjalfvirk: 2,
    by: { stadfest: 2, svarad: 4, lokad: 1 },
    list: [
      { id: 1, stada: 'stadfest', created: NU - 7200, updated: NU - 3600, efni: 'Villa á síma', ack_sent: NU - 7100, svar_sent: null },
      { id: 2, stada: 'svarad', created: NU - 172800, updated: NU - 86400, efni: 'Tvírukkun', ack_sent: NU - 172700, svar_sent: NU - 86400 },
      { id: 3, stada: 'lokad', created: NU - 864000, updated: NU - 800000, efni: 'Gamalt', ack_sent: NU - 863900, svar_sent: NU - 860000 },
    ],
  },
};

test('staða og tölur eru reiknaðar úr yfirlitinu', () => {
  const g = sigrunGogn(OV, [], NU);
  assert.match(g.stada, /3 opnar beiðnir/);
  const merkin = g.tolur.map((t) => t.l);
  assert.ok(merkin.includes('opnar beiðnir'));
  assert.ok(merkin.includes('miðgildi svartíma'));
  assert.ok(merkin.includes('leyst án þín'));
  assert.ok(merkin.includes('nýjar 7 daga'));
});

test('miðgildi svartíma er reiknað úr svar_sent − created, aðeins af svöruðum beiðnum', () => {
  const g = sigrunGogn(OV, [], NU);
  const t = g.tolur.find((x) => x.l === 'miðgildi svartíma');
  // Svöruðu beiðnirnar eru #2 (86.400 sek) og #3 (4.000 sek). Miðgildi tveggja gilda = meðaltal
  // þeirra = 45.200 sek ⇒ round(45200/3600) = 13 klst. #1 er ósvarað og telur ekki með.
  assert.equal(t.n, '13 klst');
  assert.equal(t.s, '2 svöruð');
});

test('engin svöruð beiðni → miðgildi sýnir striklu en fellur ekki', () => {
  const g = sigrunGogn({ now: NU, tickets: { open: 0, by: {}, list: [{ id: 9, stada: 'nytt', created: NU, updated: NU, efni: 'x' }] } }, [], NU);
  assert.equal(g.tolur.find((x) => x.l === 'miðgildi svartíma').n, '—');
});

test('bíður þín-raðir eru síaðar á Sigrúnu', () => {
  const listi = [
    { starfsmadur: 'sigrun', tegund: 'svar', titill: 'a', vidbot: '', slod: '#t1', bid: 10, adkallandi: false },
    { starfsmadur: 'hrafn', tegund: 'tillaga', titill: 'b', vidbot: '', slod: '#t2', bid: 10, adkallandi: false },
  ];
  assert.deepEqual(sigrunGogn(OV, listi, NU).bidur.map((r) => r.titill), ['a']);
});

test('rofinn ber lykil Sigrúnar og núverandi stöðu', () => {
  assert.deepEqual(sigrunGogn(OV, [], NU).rofi, { lykill: 'hjalp_agent_off', off: false });
  assert.deepEqual(sigrunGogn({ tickets: { off: true, list: [], by: {} } }, [], NU).rofi, { lykill: 'hjalp_agent_off', off: true });
});

test('heimildirnar segja skýrt hvað hún má EKKI', () => {
  const h = sigrunGogn(OV, [], NU).heimildir.join(' | ');
  assert.match(h, /aldrei/i);
  assert.match(h, /KB-svar/);
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = sigrunGogn({}, [], NU);
  assert.equal(g.bidur.length, 0);
  assert.ok(Array.isArray(g.tolur));
});
```

⚠ Væntingarnar hér að ofan eru réttar eins og þær standa — **ekki breyta prófi til að passa við útfærslu** sem skilar öðru. Skili útfærslan ekki `13 klst` er útfærslan röng, ekki prófið.

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/stjorn/sigrun.test.mjs`
Expected: FAIL — `Cannot find module … sigrun.mjs`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/stjorn/sigrun.mjs`:

```js
// sigrun.mjs — HREIN eining: yfirlit → hólfin fimm á spjaldi Sigrúnar (þjónustufulltrúi).
// Engin fetch, engin D1 — allt kemur úr /api/admin/overview svo spjaldið kosti ekkert aukalega.
import { bidurFyrir } from './bidur_thin.mjs';

const KLST = 3600;
function midgildi(tolur) {
  if (!tolur.length) return null;
  const r = tolur.slice().sort((a, b) => a - b), m = Math.floor(r.length / 2);
  return r.length % 2 ? r[m] : Math.round((r[m - 1] + r[m]) / 2);
}
function timiTexti(sek) {
  if (sek == null) return '—';
  return sek < KLST ? Math.max(1, Math.round(sek / 60)) + ' mín' : sek < 86400 ? Math.round(sek / KLST) + ' klst' : Math.round(sek / 86400) + ' dagar';
}
function dagsTexti(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export function sigrunGogn(overview = {}, bidurListi = [], now = 0) {
  const tx = overview.tickets || {};
  const listi = Array.isArray(tx.list) ? tx.list : [];
  const nu = Number(now) || Number(overview.now) || 0;
  const svarad = listi.filter((t) => t.svar_sent && t.created).map((t) => Number(t.svar_sent) - Number(t.created));
  const ny7 = listi.filter((t) => Number(t.created) > nu - 7 * 86400).length;
  const sidastVirk = listi.reduce((m, t) => Math.max(m, Number(t.updated) || 0), 0);
  const opnar = Number(tx.open) || 0;

  return {
    stada: opnar ? opnar + (opnar === 1 ? ' opin beiðni' : ' opnar beiðnir') : 'engin opin beiðni',
    sidast: dagsTexti(sidastVirk),
    bidur: bidurFyrir(bidurListi, 'sigrun'),
    // Þráður hverrar beiðni er á sínum stað í listanum neðar á spjaldinu; hér er aðeins nýjasta hreyfingin.
    vinnsla: listi.slice(0, 5).map((t) => ({ texti: '#' + t.id + ' ' + (t.efni || ''), hvenaer: dagsTexti(t.updated) })),
    tolur: [
      { n: String(opnar), l: 'opnar beiðnir', s: (tx.by && tx.by.nytt ? tx.by.nytt + ' nýjar' : '') },
      { n: timiTexti(midgildi(svarad)), l: 'miðgildi svartíma', s: svarad.length + ' svöruð' },
      { n: String(Number(tx.sjalfvirk) || 0), l: 'leyst án þín', s: 'agent svaraði sjálfur' },
      { n: String(ny7), l: 'nýjar 7 daga', s: '' },
    ],
    heimildir: [
      'sendir staðfestingu sjálf (fast sniðmát)',
      'sendir KB-svar ORÐRÉTT þegar vissa er ≥ 0,9',
      'les hjalp@karp.is og býr til beiðnir',
      'aldrei texta sem AI samdi — hann bíður þín',
    ],
    rofi: { lykill: 'hjalp_agent_off', off: !!tx.off },
  };
}
```

- [ ] **Step 4: Keyrðu prófið, leiðréttu miðgildis-væntinguna og staðfestu**

Run: `cd web && node --test src/lib/stjorn/sigrun.test.mjs`
Expected: PASS — `pass 7`

- [ ] **Step 5: Skrifaðu fallandi próf fyrir `sjalfvirk` í worker**

Bættu við `web/src/worker/hjalp_agent.test.mjs` (nýtir `fakeDb`/`mkState`/`mkEnv` sem eru þegar í skránni — bættu SQL-línunni við `fakeDb` í næsta skrefi):

```js
test('ticketsOverview skilar sjalfvirk: fjölda mála sem agentinn svaraði sjálfur', async () => {
  const state = mkState();
  state.tickets[1].stada = 'svarad';
  state.sjalfvirk = 2;
  const r = await ticketsOverview(mkEnv(state));
  assert.equal(r.sjalfvirk, 2);
});
```

Bættu `ticketsOverview` við `import`-línuna efst í prófskránni.

- [ ] **Step 6: Bættu SQL-inu við fölsuðu D1 og keyrðu prófið**

Í `fakeDb` í `web/src/worker/hjalp_agent.test.mjs`, á undan `throw new Error('fakeDb: óþekkt SQL')`:

```js
    if (/^SELECT COUNT\(DISTINCT ticket_id\) n FROM ticket_msgs WHERE dir='out' AND sent_by='agent'$/.test(sql)) return { n: state.sjalfvirk || 0 };
```

Bættu líka við þeim SELECT-um sem `ticketsOverview` keyrir nú þegar ef fölsuðu D1 vantar þá (`SELECT id, created, … FROM tickets ORDER BY created DESC LIMIT 60`, `moot_bida`- og `moot_osent`-fyrirspurnirnar) — keyrðu prófið og bættu við þeim sem `fakeDb` kvartar undan, einni í einu.

Run: `cd web && node --test src/worker/hjalp_agent.test.mjs`
Expected: FAIL — `r.sjalfvirk` er `undefined`

- [ ] **Step 7: Bættu tölunni við `ticketsOverview`**

Í `web/src/worker/hjalp_agent.mjs`, inni í `ticketsOverview` rétt á undan `return`:

```js
  // „Leyst án þín": beiðnir þar sem agentinn sendi sjálfur efnislegt svar (KB orðrétt). Ein talning
  // yfir alla sögu — mælikvarði á hvort sjálfvirknin sé raunverulega að létta af Aroni.
  const sjalfv = await env.TENGSL.prepare("SELECT COUNT(DISTINCT ticket_id) n FROM ticket_msgs WHERE dir='out' AND sent_by='agent'").first().catch(() => null);
```

og bættu `sjalfvirk: Number(sjalfv && sjalfv.n) || 0,` við hlutinn sem skilað er.

- [ ] **Step 8: Keyrðu öll prófin**

Run: `cd web && npm test`
Expected: `pass 745` (737 + 7 Sigrún + 1 worker)

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/stjorn/sigrun.mjs web/src/lib/stjorn/sigrun.test.mjs web/src/worker/hjalp_agent.mjs web/src/worker/hjalp_agent.test.mjs
git commit -m "Spjald Sigrúnar: svartími, leyst án þín og beiðnirnar sem bíða"
```

---

### Task 5: Rofi Hrafns + `_ghDispatch` fluttur út + frjálst verk í cto.yml

**Files:**
- Modify: `web/src/worker/hjalp_agent.mjs` (`_ghDispatch` ~lína 157, `rofi`-aðgerð ~lína 191)
- Modify: `web/src/worker/hjalp_agent.test.mjs`
- Modify: `.github/workflows/cto.yml`

**Interfaces:**
- Produces: `_ghDispatch(env, eventType, payload)` útflutt (Task 6 notar) · `rofi`-aðgerð tekur `{starfsmadur, off}` · `cto.yml` tekur `verk`

- [ ] **Step 1: Skrifaðu fallandi próf**

Bættu við `web/src/worker/hjalp_agent.test.mjs`:

```js
test('rofi: sjálfgefið er Sigrún (gamla hegðunin) en starfsmadur velur lykilinn', async (t) => {
  const state = mkState(); const env = mkEnv(state); stubFetch(t);
  await js(await adminTicketHandler(req({ action: 'rofi', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {}));
  assert.equal(state.sync.hjalp_agent_off, '1', 'án starfsmanns fer rofinn á Sigrúnu — ekkert brotnar hjá þeim sem kalla eins og áður');
  await js(await adminTicketHandler(req({ action: 'rofi', starfsmadur: 'hrafn', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {}));
  assert.equal(state.sync.rofi_hrafn, '1');
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'rofi', starfsmadur: 'kari', off: true }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: false, error: 'starfsmadur' });
});

test('slökkt á Hrafni stöðvar CTO-ræsingu — engin dispatch fer út', async (t) => {
  const state = mkState({ stada: 'stadfest' }); state.sync.rofi_hrafn = '1';
  const env = mkEnv(state); const log = stubFetch(t);
  assert.deepEqual(await js(await adminTicketHandler(req({ action: 'cto', id: 1 }, { 'X-Admin-Key': 'adm-key' }), env, {})), { ok: false, error: 'rofi' });
  assert.deepEqual(dispatches(log), []);
  assert.equal(state.tickets[1].stada, 'stadfest', 'staðan hreyfist ekki');
});
```

Bættu við `fakeDb` (í sömu skrá) svo `stjorn_sync`-lestur virki fyrir hvaða lykil sem er:

```js
    if (/SELECT v FROM stjorn_sync WHERE k='(\w+)'/.test(sql)) { const k = sql.match(/k='(\w+)'/)[1]; return state.sync[k] != null ? { v: state.sync[k] } : null; }
    if (/^INSERT INTO stjorn_sync \(k, v, updated\)/.test(sql)) { state.sync[args[0]] = args[1]; return { meta: {} }; }
```

og bættu `sync: {}` við `mkState()` ef það vantar.

- [ ] **Step 2: Keyrðu prófin og staðfestu að þau falli**

Run: `cd web && node --test src/worker/hjalp_agent.test.mjs`
Expected: FAIL — rofinn hunsar `starfsmadur`, og `cto` sendir dispatch þrátt fyrir `rofi_hrafn`

- [ ] **Step 3: Flyttu `_ghDispatch` út og láttu hann virða rofann**

Í `web/src/worker/hjalp_agent.mjs`, breyttu undirskriftinni:

```js
/** repository_dispatch á KARP-2.0. Virðir rofa starfsmannsins: slökkt á Hrafni ⇒ engin keyrsla ræst. */
export async function _ghDispatch(env, eventType, payload) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  if (eventType === 'cto' && await _rofiA(env, 'rofi_hrafn')) return { ok: false, error: 'rofi' };
```

(afgangur fallsins óbreyttur)

Bættu við almennum rofa-lesara við hliðina á `_rofiOff`:

```js
/** Almennur rofa-lestur: k='hjalp_agent_off' | 'rofi_hrafn' | … Skilar true þegar SLÖKKT er. */
async function _rofiA(env, lykill) {
  const r = await env.TENGSL.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
  return !!(r && String(r.v) === '1');
}
```

⚠ `_rofiOff` heldur sér óbreytt (það les `hjalp_agent_off` með föstum streng og er kallað úr `processNewTicket`) — ekki sameina þau í þessu verki.

- [ ] **Step 4: Láttu `rofi`-aðgerðina taka starfsmann**

Skiptu `rofi`-blokkinni í `adminTicketHandler` út fyrir:

```js
  if (action === 'rofi') {
    // Sjálfgefið Sigrún: eldri kallendur (og vistuð bókamerki) sendu engan starfsmann.
    const lykill = rofiLykill(b.starfsmadur ? String(b.starfsmadur) : 'sigrun');
    if (!lykill) return _ajson({ ok: false, error: 'starfsmadur' });
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated').bind(lykill, b.off ? '1' : '0', _nowSek()).run().catch(() => {});
    return _ajson({ ok: true, lykill, off: !!b.off });
  }
```

og bættu `rofiLykill` við `personur.mjs`-innflutninginn efst í skránni.

- [ ] **Step 5: Keyrðu prófin**

Run: `cd web && node --test src/worker/hjalp_agent.test.mjs`
Expected: PASS

- [ ] **Step 6: Láttu cto.yml taka frjálst verk**

Í `.github/workflows/cto.yml`:

a) Bættu við inntaki undir `workflow_dispatch.inputs`:

```yaml
      verk:
        description: 'Frjálst verkefni (í stað beiðnar) — t.d. „karp2-byggingin fellur við hvert push"'
        required: false
```

b) Bættu `VERK` við `env`-blokk verksins:

```yaml
      VERK: ${{ github.event.client_payload.verk || inputs.verk }}
```

c) Gerðu ticket-skrefin skilyrt og bættu við verk-leið. Skiptu skrefinu „Sækja ticket úr karp.is" út fyrir:

```yaml
      - name: Sækja ticket úr karp.is (sleppt þegar frjálst verk er sent)
        if: env.TICKET != ''
        run: |
          curl -sf -H "X-Admin-Key: $KARP_ADMIN_KEY" "https://karp.is/api/admin/ticket?id=$TICKET" -o ticket.json
          node -e "const t=require('./ticket.json'); if(!t.ok) throw new Error('ticket '+JSON.stringify(t)); console.log('#'+t.ticket.id, t.ticket.tegund, '—', t.ticket.efni)"
      - name: Verkefni án beiðnar
        if: env.TICKET == ''
        run: |
          node -e "
            const v = (process.env.VERK || '').trim();
            if (v.length < 10) throw new Error('hvorki ticket né nothæft verk');
            require('fs').writeFileSync('ticket.json', JSON.stringify({ ok: true, ticket: { id: 'verk', flokkur: 'Bilun', tegund: 'villa', lysing: v, ai_greining: '{}' } }));
            console.log('frjálst verk:', v.slice(0, 120));
          "
```

d) Gerðu Moot-skrefið skilyrt: bættu `if: env.TICKET != ''` við skrefið „Sækja Moot (verkbeiðni Hrafns) úr karp.is" og búðu til tóma skrá fyrir hina leiðina með því að breyta fyrstu línu þess skrefs sem á eftir kemur — einfaldast er að bæta `touch moot.json || true` fremst í „Claude Code — greina og laga"-skrefið:

```yaml
          [ -f moot.json ] || echo '{}' > moot.json
```

e) Greinarnafn og skil: í skrefinu „Grein + PR", skiptu `BR="cto/ticket-$TICKET"` út fyrir:

```bash
          BR="cto/${TICKET:-verk-$GITHUB_RUN_ID}"
```

og gerðu `cto_result`-skilin skilyrt með því að bæta við fremst í „Skila niðurstöðu á karp.is"-skrefinu:

```bash
          if [ -z "$TICKET" ]; then echo "frjálst verk — engin beiðni að uppfæra"; exit 0; fi
```

- [ ] **Step 7: Staðfestu YAML og öll prófin**

Run (úr rót): `python -c "import yaml,io; d=yaml.safe_load(io.open('.github/workflows/cto.yml',encoding='utf-8')); print('yaml ok', len(d['jobs']['laga']['steps']), 'skref')"`
Expected: `yaml ok 8 skref` (eða fleiri — talan má vera hærri, aðeins `yaml ok` skiptir máli)

Run: `cd web && npm test`
Expected: `pass 747`

Run (úr rót): `node skriptur/ci_worker_bindings.mjs`
Expected: `✅ Öll nöfn leyst`

- [ ] **Step 8: Commit**

```bash
git add web/src/worker/hjalp_agent.mjs web/src/worker/hjalp_agent.test.mjs .github/workflows/cto.yml
git commit -m "Rofi per starfsmann og Hrafn tekur við frjálsu verki"
```

---

### Task 6: Bilanalistinn — `bilanir.mjs` og `/api/admin/bilanir`

**Files:**
- Create: `web/src/worker/bilanir.mjs`
- Create: `web/src/worker/bilanir.test.mjs`
- Modify: `web/worker.js` (innflutningur ~lína 26, leið ~lína 2840)

**Interfaces:**
- Consumes: `env.GITHUB_DISPATCH_TOKEN`, `env.ADMIN_API_KEY`, `env.TENGSL`, `adminCsrfVilla` og `_ghDispatch` úr `hjalp_agent.mjs` (**Task 5 flytur `_ghDispatch` út — það verk verður að vera búið**)
- Produces: `saekjaBilanir(env, {thvinga}) -> {ok, sott, bilanir, villa?}` · `adminBilanirHandler(request, env, ctx)` · bilun = `{uppspretta, lysing, sidan, alvarleiki:'hatt'|'midlungs'|'lagt', slod}`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/worker/bilanir.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminBilanirHandler, saekjaBilanir } from './bilanir.mjs';

const NU = () => Math.floor(Date.now() / 1000);
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='bilanir'/.test(sql)) return state.bilanir || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('bilanir'/.test(sql)) { state.bilanir = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkEnv = (state, over = {}) => Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', GITHUB_DISPATCH_TOKEN: 'ghp_x' }, over);
const mkState = () => ({ users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } } });

/** Stubbar GitHub-svör eftir slóðarbroti. */
function stubGh(t, svor) {
  const orig = globalThis.fetch; const log = [];
  globalThis.fetch = async (url) => {
    log.push(String(url));
    for (const [brot, gogn] of Object.entries(svor)) {
      if (String(url).includes(brot)) return { ok: gogn.status !== 500, status: gogn.status || 200, json: async () => gogn.d };
    }
    throw new Error('óvænt fetch: ' + url);
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
const GH_ALLT_GOTT = {
  'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'success', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'u' }] } },
  'workflows/cto.yml/runs': { d: { workflow_runs: [] } },
  'commits/main/check-runs': { d: { check_runs: [{ name: 'Workers Builds: karp21', conclusion: 'success', completed_at: '2026-09-14T10:05:00Z', details_url: 'u' }] } },
  'pulls?state=open': { d: [] },
};

test('allt í lagi → tómur bilanalisti', async (t) => {
  stubGh(t, GH_ALLT_GOTT);
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.bilanir, []);
});

test('rautt main er HÁ bilun; fallin bygging og gamall PR eru vægari', async (t) => {
  const gamall = new Date(Date.now() - 30 * 86400000).toISOString();
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, {
    'workflows/ci.yml/runs': { d: { workflow_runs: [{ conclusion: 'failure', head_sha: 'abc', created_at: '2026-09-14T10:00:00Z', html_url: 'ci-url' }] } },
    'commits/main/check-runs': { d: { check_runs: [{ name: 'Workers Builds: karp2', conclusion: 'failure', completed_at: '2026-09-14T10:05:00Z', details_url: 'b-url' }] } },
    'pulls?state=open': { d: [{ number: 3, title: 'Gamall PR', created_at: gamall, html_url: 'pr-url', head: { ref: 'x' } }] },
  }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  const eftir = (u) => r.bilanir.find((b) => b.uppspretta === u);
  assert.equal(eftir('CI').alvarleiki, 'hatt');
  assert.equal(eftir('Bygging').alvarleiki, 'midlungs');
  assert.equal(eftir('PR').alvarleiki, 'midlungs');
  assert.match(eftir('PR').lysing, /#3/);
});

test('nýlegur opinn PR er EKKI bilun (sjö daga viðmið)', async (t) => {
  const nyr = new Date(Date.now() - 2 * 86400000).toISOString();
  stubGh(t, Object.assign({}, GH_ALLT_GOTT, { 'pulls?state=open': { d: [{ number: 9, title: 'Nýr', created_at: nyr, html_url: 'u', head: { ref: 'y' } }] } }));
  const r = await saekjaBilanir(mkEnv(mkState()), { thvinga: true });
  assert.deepEqual(r.bilanir, []);
});

test('niðurstaðan er geymd og endurnotuð innan 10 mínútna — GitHub er ekki hamrað', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  const log = stubGh(t, GH_ALLT_GOTT);
  await saekjaBilanir(env, { thvinga: true });
  const n = log.length;
  const aftur = await saekjaBilanir(env, {});
  assert.equal(log.length, n, 'engin ný GitHub-köll');
  assert.equal(aftur.ok, true);
});

test('GitHub niðri → síðasti þekkti listi heldur sér og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubGh(t, GH_ALLT_GOTT);
  await saekjaBilanir(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaBilanir(env, { thvinga: true });
  assert.equal(r.villa, 'github');
  assert.ok(Array.isArray(r.bilanir), 'listinn hverfur ekki þótt GitHub svari ekki');
});

test('án GITHUB_DISPATCH_TOKEN er svarið ostillt en ekki villa', async () => {
  const r = await saekjaBilanir(mkEnv(mkState(), { GITHUB_DISPATCH_TOKEN: '' }), { thvinga: true });
  assert.deepEqual(r, { ok: false, error: 'unconfigured' });
});

test('endapunktur: GET má með lykli, POST verk KREFST lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubGh(t, GH_ALLT_GOTT);
  const req = (m, h, b) => new Request('https://karp.is/api/admin/bilanir', { method: m, headers: Object.assign(b ? { 'content-type': 'application/json' } : {}, h), body: b ? JSON.stringify(b) : undefined });
  const js = (r) => r.json();
  assert.deepEqual(await js(await adminBilanirHandler(req('GET', {}), env, {})), { ok: false, error: 'admin' });
  const K = { 'X-Admin-Key': 'adm-key' };
  assert.equal((await js(await adminBilanirHandler(req('GET', K), env, {}))).ok, true);
  assert.deepEqual(await js(await adminBilanirHandler(req('POST', K, { verk: 'laga karp2' }), env, {})), { ok: false, error: 'lota' });
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/worker/bilanir.test.mjs`
Expected: FAIL — `Cannot find module … bilanir.mjs`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/worker/bilanir.mjs`:

```js
// bilanir.mjs — bilanalisti Hrafns: hvað er brotið sem enginn kvartaði yfir.
//
// Flest sem bilar á karp.is kvartar enginn notandi yfir: tvær CI-keyrslur féllu 14.9 og enginn tók
// eftir, og karp2-byggingin fellur við hvert einasta push. Hér eru þessar uppsprettur sóttar í GitHub
// og settar á einn lista sem Hrafn getur verið sendur á.
//
// ⚠ 10 mínútna fyrning í stjorn_sync: /stjorn/ má hvorki hægja á sér né hamra GitHub-kvótann.
// ⚠ GitHub niðri má ALDREI fella spjaldið — þá stendur síðasti þekkti listi og villan er merkt.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';

const _blNow = () => Math.floor(Date.now() / 1000);
const _blRepo = 'aronheidar/KARP-2.0';
const _BL_FYRNING = 600;          // sek
const _BL_PR_DAGAR = 7;           // opinn PR eldri en þetta telst gleymdur

async function _blGh(env, slod) {
  const r = await fetch('https://api.github.com/repos/' + _blRepo + '/' + slod, {
    headers: { Authorization: 'Bearer ' + env.GITHUB_DISPATCH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'karp21-worker' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('gh ' + r.status);
  return r.json();
}
const _blSek = (iso) => Math.floor(new Date(iso || 0).getTime() / 1000) || 0;

async function _blAdminUid(env, request) {
  const uid = await readSession(env, request);
  if (!uid || !env.TENGSL) return 0;
  const u = await env.TENGSL.prepare('SELECT is_admin FROM users WHERE id=?').bind(uid).first().catch(() => null);
  return (u && u.is_admin === 1) ? uid : 0;
}

async function _blGeymt(env) {
  const r = await env.TENGSL.prepare("SELECT v, updated FROM stjorn_sync WHERE k='bilanir'").first().catch(() => null);
  if (!r) return null;
  try { return { gogn: JSON.parse(r.v), uppfaert: Number(r.updated) }; } catch (e) { return null; }
}

/** Sækir bilanalistann (eða skilar geymdum innan fyrningar). */
export async function saekjaBilanir(env, { thvinga = false } = {}) {
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: 'unconfigured' };
  const geymt = await _blGeymt(env);
  if (!thvinga && geymt && geymt.uppfaert > _blNow() - _BL_FYRNING) return Object.assign({ ok: true, sott: geymt.uppfaert }, geymt.gogn);

  const bilanir = [];
  try {
    const [ci, cto, checks, prs] = await Promise.all([
      _blGh(env, 'actions/workflows/ci.yml/runs?branch=main&per_page=5'),
      _blGh(env, 'actions/workflows/cto.yml/runs?per_page=5'),
      _blGh(env, 'commits/main/check-runs'),
      _blGh(env, 'pulls?state=open'),
    ]);
    const sidasta = ((ci && ci.workflow_runs) || [])[0];
    if (sidasta && sidasta.conclusion === 'failure') {
      bilanir.push({ uppspretta: 'CI', lysing: 'main er rautt — síðasta keyrsla féll', sidan: _blSek(sidasta.created_at), alvarleiki: 'hatt', slod: sidasta.html_url });
    }
    for (const c of ((checks && checks.check_runs) || [])) {
      if (c.conclusion !== 'failure') continue;
      bilanir.push({ uppspretta: 'Bygging', lysing: c.name + ' fellur á main', sidan: _blSek(c.completed_at), alvarleiki: 'midlungs', slod: c.details_url });
    }
    const ctoFell = ((cto && cto.workflow_runs) || []).filter((r) => r.conclusion === 'failure')[0];
    if (ctoFell) {
      bilanir.push({ uppspretta: 'CTO', lysing: 'síðasta CTO-keyrsla féll', sidan: _blSek(ctoFell.created_at), alvarleiki: 'lagt', slod: ctoFell.html_url });
    }
    const markPr = _blNow() - _BL_PR_DAGAR * 86400;
    for (const p of (Array.isArray(prs) ? prs : [])) {
      const stofnad = _blSek(p.created_at);
      if (stofnad > markPr) continue;
      bilanir.push({ uppspretta: 'PR', lysing: 'PR #' + p.number + ' hefur staðið opinn: ' + (p.title || ''), sidan: stofnad, alvarleiki: 'midlungs', slod: p.html_url });
    }
  } catch (e) {
    // Síðasti þekkti listi stendur; spjaldið segir frá því að hann sé ekki ferskur.
    return Object.assign({ ok: true, villa: 'github', sott: geymt ? geymt.uppfaert : 0 }, (geymt && geymt.gogn) || { bilanir: [] });
  }

  const gogn = { bilanir };
  await env.TENGSL.prepare("INSERT INTO stjorn_sync (k, v, updated) VALUES ('bilanir', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated")
    .bind(JSON.stringify(gogn).slice(0, 8000), _blNow()).run().catch(() => {});
  return { ok: true, sott: _blNow(), bilanir };
}

/** /api/admin/bilanir — GET listinn · POST {verk} ræsir Hrafn á frjálsu verkefni.
 *  Auth: GET má með X-Admin-Key; POST KREFST lotu — það ræsir kóðabreytingu í framleiðslu. */
export async function adminBilanirHandler(request, env, ctx) {
  const key = request.headers.get('X-Admin-Key');
  const byKey = !!(key && env.ADMIN_API_KEY && key === env.ADMIN_API_KEY);
  const uid = byKey ? 0 : await _blAdminUid(env, request);
  if (!byKey && !uid) return _ajson({ ok: false, error: 'admin' });
  if (request.method === 'GET') {
    const thvinga = new URL(request.url).searchParams.get('thvinga') === '1';
    return _ajson(await saekjaBilanir(env, { thvinga }));
  }
  if (request.method !== 'POST') return _ajson({ ok: false, error: 'method' });
  if (!byKey) { const csrf = adminCsrfVilla(request); if (csrf) return _ajson({ ok: false, error: csrf }); }
  const b = (await request.json().catch(() => null)) || {};
  if (!uid) return _ajson({ ok: false, error: 'lota' });   // X-Admin-Key má lesa en ekki ræsa kóðabreytingu
  const verk = String(b.verk || '').trim().slice(0, 2000);
  if (verk.length < 10) return _ajson({ ok: false, error: 'verk' });
  const d = await _ghDispatch(env, 'cto', { verk });
  return _ajson({ ok: d.ok, dispatch: d });
}
```

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/worker/bilanir.test.mjs`
Expected: PASS — `pass 7`

- [ ] **Step 5: Tengdu leiðina í worker.js**

Bættu við innflutningi á eftir `gmail_intake`-línunni (~lína 26):

```js
import { adminBilanirHandler } from './src/worker/bilanir.mjs';   // 🛠️ bilanalisti Hrafns: CI, byggingar, gleymdir PR-ar
```

og leið á eftir `/api/admin/gmail`-línunni:

```js
    if (url.pathname === '/api/admin/bilanir') return adminBilanirHandler(request, env, ctx);   // 🛠️ GET listinn · POST {verk} ræsir Hrafn
```

- [ ] **Step 6: Keyrðu CI-hliðið og allt prófasettið**

Run (úr rót): `node skriptur/ci_worker_bindings.mjs`
Expected: `✅ Öll nöfn leyst — engin laus tenging.`

Run: `cd web && npm test`
Expected: `pass 754`

- [ ] **Step 7: Commit**

```bash
git add web/src/worker/bilanir.mjs web/src/worker/bilanir.test.mjs web/worker.js
git commit -m "Bilanalisti: það sem er brotið en enginn kvartaði yfir"
```

---

### Task 7: Spjald Hrafns

**Files:**
- Create: `web/src/lib/stjorn/hrafn.mjs`
- Create: `web/src/lib/stjorn/hrafn.test.mjs`

**Interfaces:**
- Consumes: `bidurFyrir` (Task 2), `overview.tickets`, `{bilanir, sott, villa}` frá `/api/admin/bilanir` (Task 6)
- Produces: `hrafnGogn(overview, bilanirSvar, bidurListi, now) -> {stada, sidast, bidur, vinnsla, tolur, heimildir, rofi}`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/stjorn/hrafn.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hrafnGogn } from './hrafn.mjs';

const NU = 1_800_000_000;
const PR = 'https://github.com/aronheidar/KARP-2.0/pull/10';
const OV = { now: NU, tickets: { list: [
  { id: 1, stada: 'lokad', updated: NU - 86400, efni: 'Leirdalur', cto_pr: PR },
  { id: 2, stada: 'tillaga', updated: NU - 3600, efni: 'Önnur villa', cto_pr: PR },
  { id: 3, stada: 'cto', updated: NU - 600, efni: 'Í vinnslu', cto_pr: null },
], by: {} } };

test('staðan segir hvort main sé grænt', () => {
  assert.match(hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).stada, /main grænt/);
  assert.match(hrafnGogn(OV, { ok: true, bilanir: [{ uppspretta: 'CI', lysing: 'main er rautt', alvarleiki: 'hatt', sidan: NU - 100, slod: 'u' }] }, [], NU).stada, /main rautt/);
});

test('lagfæringar eru taldar eftir PR, ekki eftir merkingu keyrslunnar', () => {
  const t = hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).tolur.find((x) => x.l === 'skiluðu lagfæringu');
  assert.equal(t.n, '2', 'báðar beiðnir með cto_pr teljast — önnur keyrslan er merkt failure í GitHub');
});

test('bilanir sem eru ekki HÁAR birtast samt á spjaldinu', () => {
  const g = hrafnGogn(OV, { ok: true, bilanir: [
    { uppspretta: 'Bygging', lysing: 'Workers Builds: karp2 fellur á main', alvarleiki: 'midlungs', sidan: NU - 500, slod: 'u' },
  ] }, [], NU);
  assert.ok(g.vinnsla.some((v) => /karp2/.test(v.texti)), 'miðlungs bilun sést hér þótt hún trufli ekki forstofuna');
});

test('úrelt gögn eru merkt í stað þess að þykjast fersk', () => {
  const g = hrafnGogn(OV, { ok: true, villa: 'github', bilanir: [], sott: NU - 7200 }, [], NU);
  assert.match(g.stada, /GitHub svarar ekki/);
});

test('rofinn er Hrafns, ekki Sigrúnar', () => {
  assert.equal(hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).rofi.lykill, 'rofi_hrafn');
});

test('heimildirnar nefna girðingarnar sem cto.yml framfylgir', () => {
  const h = hrafnGogn(OV, { ok: true, bilanir: [] }, [], NU).heimildir.join(' | ');
  assert.match(h, /web\//);
  assert.match(h, /prófin/);
  assert.match(h, /merge/);
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = hrafnGogn({}, {}, [], NU);
  assert.ok(Array.isArray(g.tolur));
  assert.equal(g.bidur.length, 0);
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/stjorn/hrafn.test.mjs`
Expected: FAIL — `Cannot find module … hrafn.mjs`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/stjorn/hrafn.mjs`:

```js
// hrafn.mjs — HREIN eining: yfirlit + bilanalisti → hólfin fimm á spjaldi Hrafns (forritari).
//
// ⚠ Niðurstaða keyrslu er metin EFTIR VERKINU, ekki exit-kóða: báðar CTO-keyrslur 13.9 eru merktar
//   „failure" í GitHub þótt önnur hafi skilað PR #10 (PR-stofnun féll, lagfæringin stóð). Þess vegna
//   er talið eftir `cto_pr` á beiðninni.
import { bidurFyrir } from './bidur_thin.mjs';

function dagsTexti(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '. kl. ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export function hrafnGogn(overview = {}, bilanirSvar = {}, bidurListi = [], now = 0) {
  const tx = overview.tickets || {};
  const listi = Array.isArray(tx.list) ? tx.list : [];
  const bilanir = Array.isArray(bilanirSvar.bilanir) ? bilanirSvar.bilanir : [];
  const rautt = bilanir.some((b) => b.uppspretta === 'CI');
  const lagfaeringar = listi.filter((t) => t.cto_pr).length;
  const iVinnslu = listi.filter((t) => t.stada === 'cto').length;
  const sidast = listi.filter((t) => t.cto_pr).reduce((m, t) => Math.max(m, Number(t.updated) || 0), 0);

  const stada = bilanirSvar.villa === 'github'
    ? 'GitHub svarar ekki — listinn er frá ' + (dagsTexti(bilanirSvar.sott) || 'fyrri keyrslu')
    : (rautt ? 'main rautt' : 'main grænt') + (iVinnslu ? ' · ' + iVinnslu + ' í vinnslu' : ' · ekkert í vinnslu');

  return {
    stada,
    sidast: dagsTexti(sidast),
    bidur: bidurFyrir(bidurListi, 'hrafn'),
    // Allar bilanir sjást hér — líka þær sem eru of vægar til að trufla forstofuna.
    vinnsla: bilanir.map((b) => ({ texti: b.lysing, hvenaer: dagsTexti(b.sidan) }))
      .concat(listi.filter((t) => t.cto_pr).slice(0, 3).map((t) => ({ texti: '#' + t.id + ' ' + (t.efni || '') + ' — PR tilbúinn', hvenaer: dagsTexti(t.updated) })))
      .slice(0, 5),
    tolur: [
      { n: rautt ? 'rautt' : 'grænt', l: 'main', s: bilanir.length + ' bilanir' },
      { n: String(lagfaeringar), l: 'skiluðu lagfæringu', s: 'talið eftir PR' },
      { n: String(iVinnslu), l: 'í vinnslu', s: '' },
      { n: String(bilanir.filter((b) => b.alvarleiki === 'hatt').length), l: 'háar bilanir', s: '' },
    ],
    heimildir: [
      'breytir aðeins web/ og skriptur/',
      'prófin verða að vera græn — annars skilar hann engu',
      'aldrei migrations, wrangler, .github, leyndarmál eða greiðslukóði',
      'merge aðeins eftir þitt samþykki',
    ],
    // Rofa-staðan kemur með yfirlitinu (tickets.rofar) — sjá Step 5, sem bætir henni við ticketsOverview.
    rofi: { lykill: 'rofi_hrafn', off: !!(tx.rofar && tx.rofar.rofi_hrafn) },
  };
}
```

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/lib/stjorn/hrafn.test.mjs`
Expected: PASS — `pass 7`

- [ ] **Step 5: Skilaðu rofa-stöðunum með yfirlitinu**

Í `web/src/worker/hjalp_agent.mjs`, `ticketsOverview`, bættu við á undan `return` (svo spjöldin viti hvort slökkt sé):

```js
  const rofaRadir = await env.TENGSL.prepare("SELECT k, v FROM stjorn_sync WHERE k IN ('hjalp_agent_off','rofi_hrafn')").all().catch(() => ({ results: [] }));
  const rofar = {}; for (const r of (rofaRadir.results || [])) rofar[r.k] = String(r.v) === '1';
```

og bættu `rofar,` við hlutinn sem skilað er. `hrafnGogn` les það þegar úr `overview.tickets.rofar` (Step 3) — engin breyting þar. Bættu prófi við `hrafn.test.mjs`:

```js
test('rofa-staða kemur úr tickets.rofar', () => {
  const g = hrafnGogn({ tickets: { list: [], rofar: { rofi_hrafn: true } } }, {}, [], NU);
  assert.equal(g.rofi.off, true);
});
```

- [ ] **Step 6: Keyrðu allt**

Run: `cd web && npm test`
Expected: `pass 762`

Run (úr rót): `node skriptur/ci_worker_bindings.mjs`
Expected: `✅ Öll nöfn leyst`

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/stjorn/hrafn.mjs web/src/lib/stjorn/hrafn.test.mjs web/src/worker/hjalp_agent.mjs
git commit -m "Spjald Hrafns: bilanir, lagfæringar taldar eftir PR og rofinn hans"
```

---

### Task 8: Forstofan og andlitaröndin í `stjorn.astro`

**Files:**
- Modify: `web/src/pages/stjorn.astro` (markup ~línur 18–110, script ~línur 328–360, global CSS-blokk)

**Interfaces:**
- Consumes: `bidurThin`, `spjald`, `esc`, `bidTexti` (Task 2–3), `persona`, `avatarSvg`, `ROFAR` (Task 1)
- Produces: `#stj-forstofa`, `#stj-rond`, `#stj-spjald`-hólf og `syna(hash)`-leið sem Task 9 fyllir

- [ ] **Step 1: Bættu umgjörðinni við markup-ið**

Í `web/src/pages/stjorn.astro`, beint á eftir `</header>` og á UNDAN `<section class="stj-cards" id="stj-cards"></section>`:

```html
      <section class="stj-block" id="stj-bidur-wrap" hidden>
        <h2>Bíður þín <span class="stj-hola-n" id="stj-bidur-n"></span></h2>
        <div id="stj-bidur"></div>
      </section>

      <nav class="stj-rond" id="stj-rond" aria-label="Starfsfólk"></nav>
      <div id="stj-spjald" hidden></div>
      <div id="stj-forstofa"></div>
```

Færðu svo ALLAR núverandi `<section>`-blokkir (frá `stj-cards` að og með aðgerðaskránni) INN í `<div id="stj-forstofa">` — klipptu og límdu, ekkert efni breytist í þessu skrefi.

- [ ] **Step 2: Bættu innflutningi og leiðinni við skriptuna**

Efst í `<script>`-blokkinni, á eftir `personur.mjs`-innflutningnum:

```js
    import { bidurThin } from '../lib/stjorn/bidur_thin.mjs';
    import { spjald, bidTexti } from '../lib/stjorn/spjald.mjs';
    import { sigrunGogn } from '../lib/stjorn/sigrun.mjs';
    import { hrafnGogn } from '../lib/stjorn/hrafn.mjs';
```

Bættu við á eftir `dIS`-skilgreiningunni:

```js
    // Starfsmenn með spjald. ⚠ Bættu EKKI við andliti fyrr en vélin á bak við það er komin —
    // tóm skúffa þjálfar mann í að hætta að opna skúffur (hönnunarákvörðun 14.9).
    const STARFSMENN = ['sigrun', 'hrafn'];
    let sidastaSvar = null, sidustuBilanir = { ok: false, bilanir: [] };

    function syna(hash) {
      const id = String(hash || '').replace(/^#/, '');
      const virkur = STARFSMENN.includes(id) ? id : '';
      $('stj-forstofa').hidden = !!virkur;
      $('stj-bidur-wrap').hidden = !!virkur || !($('stj-bidur').children.length);
      $('stj-spjald').hidden = !virkur;
      $('stj-rond').querySelectorAll('.stj-andlit').forEach((a) => a.classList.toggle('stj-andlit--virkt', a.dataset.id === virkur));
      if (virkur) teiknaSpjald(virkur);
    }
```

- [ ] **Step 3: Teiknaðu röndina og „bíður þín" í boot()**

Bættu við í lok `boot()` (á eftir því sem fyrir er, áður en fallinu lýkur):

```js
      sidastaSvar = d;   // `d` er svarið úr /api/admin/overview eins og það heitir ofar í boot()
      sidustuBilanir = await fetch('/api/admin/bilanir', { credentials: 'include' }).then((r) => r.json()).catch(() => ({ ok: false, bilanir: [] }));
      const bidur = bidurThin({ tickets: d.tickets || {}, bilanir: sidustuBilanir.bilanir || [], now: d.now || Math.floor(Date.now() / 1000) });

      $('stj-bidur').innerHTML = bidur.map((r) => {
        const p = persona(r.starfsmadur) || { nafn: '', emoji: '' };
        return `<a class="stj-bidur-rod${r.adkallandi ? ' stj-bidur-rod--adkallandi' : ''}" href="${esc(r.slod)}" data-starfsmadur="${esc(r.starfsmadur)}">`
          + `<span class="stj-bidur-hver">${esc(p.emoji)} ${esc(p.nafn)}</span>`
          + `<span class="stj-bidur-titill">${esc(r.titill)}</span>`
          + `<span class="stj-bidur-vidbot">${esc(r.vidbot || '')}</span>`
          + `<span class="stj-bidur-bid">${esc(bidTexti(r.bid))}</span></a>`;
      }).join('');
      $('stj-bidur-n').textContent = bidur.length ? String(bidur.length) : '';
      $('stj-bidur-wrap').hidden = !bidur.length;

      $('stj-rond').innerHTML = STARFSMENN.map((id) => {
        const p = persona(id), n = bidur.filter((r) => r.starfsmadur === id).length;
        return `<a class="stj-andlit" href="#${id}" data-id="${id}" title="${esc(p.nafn)} — ${esc(p.hlutverk)}">`
          + avatarSvg(id, { size: 64 })
          + `<span class="stj-andlit-nafn">${esc(p.nafn)}</span>`
          + `<span class="stj-andlit-hlutverk">${esc(p.hlutverk)}</span>`
          + (n ? `<span class="stj-andlit-tala">${n}</span>` : '') + '</a>';
      }).join('');

      syna(location.hash);
```

- [ ] **Step 4: Tengdu hash-breytingar**

Beint á undan `if (document.readyState !== 'loading') boot();` í lok skriptunnar:

```js
    window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#ticket-')) syna(location.hash); });
```

- [ ] **Step 5: Bættu CSS við global-blokkina**

Í `<style is:global>` í `stjorn.astro` (⚠ EKKI scoped — Astro tré-hristir scoped-reglur sem aðeins eru notaðar í runtime-`innerHTML`):

```css
      .stj-rond { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0 22px; }
      .stj-andlit { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; text-decoration: none; color: inherit; background: var(--card); transition: border-color .15s, transform .15s; }
      .stj-andlit:hover { border-color: var(--gold); transform: translateY(-2px); }
      .stj-andlit--virkt { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; }
      .stj-andlit-nafn { font-weight: 600; font-size: 14px; }
      .stj-andlit-hlutverk { font-size: 11px; color: var(--faint); }
      .stj-andlit-tala { position: absolute; top: 6px; right: 8px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #c0392b; color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
      .stj-bidur-rod { display: grid; grid-template-columns: minmax(0,auto) minmax(0,1fr) minmax(0,1fr) auto; gap: 10px; align-items: baseline; padding: 9px 12px; border-bottom: 1px solid var(--line); text-decoration: none; color: inherit; }
      .stj-bidur-rod:hover { background: rgba(246,177,59,.06); }
      .stj-bidur-rod--adkallandi { border-left: 3px solid #c0392b; padding-left: 9px; }
      .stj-bidur-hver { font-size: 13px; color: var(--faint); white-space: nowrap; }
      .stj-bidur-titill { font-weight: 600; }
      .stj-bidur-vidbot, .stj-bidur-bid { color: var(--faint); font-size: 13px; }
      .stj-bidur-bid { text-align: right; white-space: nowrap; }
      .stj-spjald-haus { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
      .stj-spjald-nafn h2 { margin: 0; }
      .stj-spjald-nafn h2 span { font-weight: 400; font-size: 14px; color: var(--faint); }
      .stj-spjald-stada, .stj-spjald-sidast { margin: 2px 0 0; font-size: 13px; color: var(--faint); }
      .stj-hola { margin: 0 0 22px; }
      .stj-hola h3 { margin: 0 0 8px; font-size: 15px; }
      .stj-hola-n { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #c0392b; color: #fff; font-size: 12px; font-weight: 700; vertical-align: middle; }
      .stj-hola--bidur .stj-bidur-rod { grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; }
      .stj-vinnsla { list-style: none; margin: 0; padding: 0; }
      .stj-vinnsla li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
      .stj-vinnsla-hvenaer { color: var(--faint); white-space: nowrap; }
      .stj-heimildir { margin: 0; padding-left: 18px; color: var(--faint); font-size: 14px; }
      .stj-heimildir li { margin: 3px 0; }
      .stj-tilbaka { display: inline-block; margin-bottom: 14px; color: var(--faint); text-decoration: none; }
      .stj-tilbaka:hover { color: var(--gold); }
```

- [ ] **Step 6: Byggðu og staðfestu í vafra**

Run: `cd web && npx astro build`
Expected: `Complete!` án villu

Ræstu forskoðun (`preview_start` með `.claude/launch.json`-stillingu verkefnisins) og opnaðu `/stjorn/`.
Expected: forstofan sést, andlitin tvö birtast með nöfnum og hlutverkum (Hrafn segir „forritari"), og smellur á andlit felur forstofuna. Spjaldið sjálft er tómt — Task 9 fyllir það.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/stjorn.astro
git commit -m "Forstofa og andlitarönd: hvað bíður þín, og hver á það"
```

---

### Task 9: Spjöldin tvö fyllt — Sigrún fær beiðnirnar, Hrafn bilanirnar

**Files:**
- Modify: `web/src/pages/stjorn.astro`

**Interfaces:**
- Consumes: `sigrunGogn`, `hrafnGogn`, `spjald`, `STARFSMENN`, `sidastaSvar`, `sidustuBilanir` (Task 8)

- [ ] **Step 1: Skrifaðu `teiknaSpjald`**

Bættu við í skriptunni, á eftir `syna()`:

```js
    function teiknaSpjald(id) {
      const d = sidastaSvar || {}, nu = d.now || Math.floor(Date.now() / 1000);
      const bidur = bidurThin({ tickets: d.tickets || {}, bilanir: sidustuBilanir.bilanir || [], now: nu });
      const p = persona(id);
      const gogn = id === 'sigrun' ? sigrunGogn(d, bidur, nu) : hrafnGogn(d, sidustuBilanir, bidur, nu);
      $('stj-spjald').innerHTML = '<a class="stj-tilbaka" href="#">← Forstofa</a>'
        + spjald(Object.assign({ id, nafn: p.nafn, hlutverk: p.hlutverk, avatar: avatarSvg(id, { size: 64 }) }, gogn))
        + (id === 'sigrun' ? '<div id="stj-spjald-tix"></div>' : '');
      if (id === 'sigrun') $('stj-spjald-tix').appendChild($('stj-tix-wrap'));   // beiðnalistinn FLYST, ekki afritast
      $('stj-spjald').querySelectorAll('.stj-rofi').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        await tixPost({ action: 'rofi', starfsmadur: id, off: b.dataset.off !== '1' });
        boot();
      }));
    }
```

- [ ] **Step 2: Gerðu beiðnablokkina færanlega**

Beiðnablokkin `#stj-tix-wrap` er í dag inni í forstofunni. Hún á að lifa inni á spjaldi Sigrúnar en `boot()` teiknar innihald hennar. Bættu því við í lok `boot()`, á undan `syna(location.hash)`:

```js
      // Beiðnablokkin er EIN í DOM-inu og flyst milli forstofu og spjalds — ekki afrituð,
      // svo atburðahlustarar og opnir þræðir haldi sér þegar skipt er um sýn.
      if (!STARFSMENN.includes(location.hash.replace('#', ''))) $('stj-forstofa').appendChild($('stj-tix-wrap'));
```

- [ ] **Step 3: Bættu bilana-hnappnum við spjald Hrafns**

Í `teiknaSpjald`, bættu við á eftir `$('stj-spjald').innerHTML = …` fyrir Hrafn:

```js
      if (id === 'hrafn') {
        const verkHtml = '<section class="stj-hola"><h3>Senda Hrafn á verk</h3>'
          + '<textarea id="stj-verk" rows="2" placeholder="T.d. karp2-byggingin fellur við hvert push — finndu hvers vegna og lagaðu eða slökktu á henni"></textarea>'
          + '<button type="button" class="stj-btn" id="stj-verk-send">🛠️ Senda á Hrafn</button>'
          + '<span class="stj-note" id="stj-verk-svar"></span></section>';
        $('stj-spjald').insertAdjacentHTML('beforeend', verkHtml);
        $('stj-verk-send').onclick = async () => {
          const verk = $('stj-verk').value.trim();
          if (verk.length < 10) { $('stj-verk-svar').textContent = 'Lýstu verkinu aðeins nánar.'; return; }
          $('stj-verk-send').disabled = true;
          const r = await fetch('/api/admin/bilanir', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verk }) }).then((x) => x.json()).catch(() => null);
          $('stj-verk-send').disabled = false;
          $('stj-verk-svar').textContent = r && r.ok ? 'Keyrsla ræst — PR birtist hér þegar hún skilar.'
            : r && r.error === 'rofi' ? 'Slökkt er á Hrafni.' : 'Villa — reyndu aftur.';
        };
      }
```

- [ ] **Step 4: Fella viðskiptavinalistann saman**

Finndu `<section class="stj-block">` sem inniheldur `<h2>👥 Notendur` og settu innihald hennar í `<details>`:

```html
        <details id="stj-notendur-d">
          <summary><h2 style="display:inline">👥 Viðskiptavinir (<span id="stj-ucount">0</span>)</h2></summary>
          <!-- núverandi innihald blokkarinnar óbreytt hér -->
        </details>
```

⚠ `id="stj-ucount"` verður að haldast — `boot()` skrifar í það.

- [ ] **Step 5: Byggðu og staðfestu í vafra**

Run: `cd web && npx astro build`
Expected: `Complete!`

Opnaðu `/stjorn/` í forskoðun og staðfestu:
- Forstofan sýnir „Bíður þín" með andliti á hverri línu.
- Smellur á Sigrúnu sýnir spjaldið hennar MEÐ beiðnalistanum; þræðir opnast eins og áður.
- Smellur á „← Forstofa" skilar beiðnalistanum niður á forstofuna.
- Smellur á Hrafn sýnir bilanir og verk-reitinn.
- Rofinn á spjaldi Sigrúnar slekkur og kveikir (staðfestu með því að endurhlaða).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/stjorn.astro
git commit -m "Spjöldin fyllt: beiðnir Sigrúnar og bilanir Hrafns"
```

---

### Task 10: Gamli Node-farmurinn út + lokaverifun + deploy

**Files:**
- Modify: `web/src/worker/stjornbord.mjs` (`stjorn` í skilagildi ~lína 103)

- [ ] **Step 1: Staðfestu að enginn lesi farminn**

Run (úr rót): `grep -rn "\.stjorn\b" web/src/pages/stjorn.astro | wc -l`
Expected: `0`

- [ ] **Step 2: Fjarlægðu hann úr svarinu**

Í `web/src/worker/stjornbord.mjs`, fjarlægðu `stjorn,` úr hlutnum sem `_ajson` fær, og fjarlægðu breytuna `stjorn` og `stjorn_sync`-lesturinn sem fyllir hana ef hún er hvergi notuð eftir það. Bættu athugasemd þar sem hún stóð:

```js
    // ⚠ 14.9: `stjorn`-farmur gamla Node-appsins fjarlægður. Hann var enn sendur (1,5 kB á hverja
    // uppfærslu), enginn las hann, og ticket-listinn í honum stangaðist á við D1 — hann sýndi þrjú
    // mál sem eru ekki til. Appið sjálft var aflagt 13.9.
```

- [ ] **Step 3: Keyrðu allt prófasettið og hliðin**

Run: `cd web && npm test`
Expected: `pass 762` (engin fækkun)

Run (úr rót): `node skriptur/ci_worker_bindings.mjs`
Expected: `✅ Öll nöfn leyst — engin laus tenging.`

Run: `cd web && npx astro build`
Expected: `Complete!`

Run: `cd web && npx wrangler deploy --dry-run`
Expected: listi yfir bindingar (`env.TENGSL`, `env.ASSETS`) og `--dry-run: exiting now.`

- [ ] **Step 4: Commit og deploy**

```bash
git add web/src/worker/stjornbord.mjs
git commit -m "Gamli Node-farmurinn fer úr yfirlitinu — enginn las hann og hann sagði ósatt"
git fetch origin && git rebase origin/main
git push origin hjalp-agent:main
```

- [ ] **Step 5: Staðfestu í lofti**

Bíddu ~90 sek eftir Cloudflare-byggingu og staðfestu:

```bash
curl -s -H "X-Admin-Key: $KARP_ADMIN_KEY" https://karp.is/api/admin/bilanir | head -c 400
```
Expected: JSON með `{"ok":true,...,"bilanir":[...]}`

Opnaðu `https://karp.is/stjorn/` innskráð(ur) og staðfestu forstofuna, bæði andlitin og að `#sigrun` og `#hrafn` virki sem bókamerki.

⚠ Ekki treysta `curl` á `/stjorn/` til að staðfesta útlitsbreytingu: síðu-skriptan er í hashed `/_astro/`-búnti og CSS-þjappan styttir reglur. Staðfestu í vafra eða með því að sækja búntið sjálft.

---

## Sjálfsrýni á áætluninni

**Þekjun gagnvart spec-inu:** Forstofa (Task 8) · spjald-beinagrind (Task 3) · Sigrún (Task 4) · Hrafn + bilanalisti (Task 5, 7, 9) · titilbreyting (Task 1) · `cto.yml` frjálst verk (Task 6) · rofar per starfsmann (Task 1, 6) · gamli farmurinn (Task 10) · skráaskipan (Task 2–5, 7) · Moot úr blokk í beiðni — **ath.:** Moot-blokkin (`#stj-moot-wrap`) flyst ekki í þessari áætlun; hún verður áfram á forstofunni og Moot opnast úr beiðni eins og í dag. Það uppfyllir virknina en ekki alveg orðalag spec-sins um að hún „hætti að vera blokk". Færslan er hrein DOM-tilfærsla og ætti að fylgja í eftirverki ef hún truflar.

**Staðgenglar:** engir — hvert skref ber raunverulegan kóða eða nákvæma skipun.

**Samræmi nafna:** `bidurThin`/`bidurFyrir` (Task 2) eru notuð óbreytt í Task 4, 7, 8, 9 · `spjald`/`esc`/`bidTexti` (Task 3) í Task 8, 9 · `sigrunGogn`/`hrafnGogn` skila nákvæmlega þeim sviðum sem `spjald()` tekur · `rofiLykill`/`ROFAR` (Task 1) notuð í Task 5 · `_ghDispatch` er fluttur út í Task 5 og notaður í Task 6 — **verkin eru í réttri röð; ekki víxla þeim.**

**Prófatalning gegnum áætlunina:** 730 (fyrir) → 731 (T1) → 737 (T2) → 744 (T3) → 745 (T4) → 747 (T5) → 754 (T6) → 762 (T7). Tölurnar í hverju verki gera ráð fyrir að verkin á undan séu búin; falli talan ekki saman hefur eitthvað verk skilið eftir rautt eða sleppt prófi.
