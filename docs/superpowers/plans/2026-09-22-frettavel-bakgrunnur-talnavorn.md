# Fréttavél: bakgrunnur + talnavörn — útfærsluáætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lengri og ítarlegri vélskrifaðar fréttir á karp.is/frettavel/ þar sem hver tala er rekjanleg til gagna.

**Architecture:** Þrjár nýjar hreinar ESM-einingar í `skriptur/lib/`: `talnavorn.mjs` (sannreynir tölur í texta gegn `facts`), `frettasamhengi.mjs` (bætir `facts.bakgrunnur` úr gögnum Karp) og `frettaskrif.mjs` (ein frétt í hverju kalli til Claude, talnavörn, eitt endurskrif, annars sniðmát). `skriptur/build_frettavel.js` (CommonJS; `main()` keyrir við hleðslu) hleður þær með `await import()` á bak við rofa. Birting fær málsgreinar.

**Tech Stack:** Node 22 (CI) / 24 (staðbundið), `node:test`, `@anthropic-ai/sdk` ^0.106 (þegar í rótar-`package.json`), Astro 7.

**Forskrift:** `docs/superpowers/specs/2026-09-22-frettavel-bakgrunnur-talnavorn-design.md`

## Global Constraints

- Vinnutré: `C:\Users\aronh\dev\karp-hjalp`, grein `hjalp-agent`. Deploy: `git fetch origin && git rebase origin/main && git push origin hjalp-agent:main`.
- Próf: `node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs` úr rót OG `npm test` úr `web/`. CI keyrir líka `node skriptur/ci_worker_bindings.mjs`, `npx astro build`, `npx wrangler deploy --dry-run`, `node skriptur/check_links.js`.
- Reglan helst: Claude skrifar AÐEINS úr `facts`; engar orsakaskýringar, spádómar eða gildishlaðin orð.
- **Rofi:** nýja leiðin keyrir aðeins ef `KARP_FRETTAVEL_NYTT=1` eða `--thurr`. `refresh-data.yml` fær EKKI rofann í þessari áætlun (Aron samþykkir sýnishorn fyrst).
- `--thurr` má ALDREI skrifa skrá (state, seen, straum, safn, RSS).
- Persónuvernd: fyrirtækjasamhengi aðeins fyrir lögaðila (kt byrjar á 4–7, eða ótvíræð samsvörun í `felagaskra.json`, sem geymir aðeins lögaðila). Gefin kt einstaklings → EKKERT samhengi (ekki falla á nafnaleit).
- Nýtt líkan: `claude-opus-5` (sjálfgefið í nýju leiðinni; `KARP_FRETTAVEL_MODEL` yfirskrifar). Gamla leiðin óbreytt.
- ⚠ `AbortSignal.timeout` er unref-aður í Node: próf sem bíður AÐEINS á honum þarf `setInterval`-handfang.
- ⚠ Skrár í vinnutrénu eru CRLF; git geymir LF. Edit-tólið varðveitir línuendingar.
- Athugasemdir í kóða á íslensku, í stíl umhverfisins (⚠ + „AF HVERJU" þar sem ástæðan er óljós).
- Commit-skilaboð enda á `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Skrár

| Skrá | Hlutverk |
|---|---|
| `skriptur/lib/talnavorn.mjs` (ný) | `talnaTokar`, `leyfd`, `athugaTolur` |
| `skriptur/lib/talnavorn.test.mjs` (ný) | próf með raundæmum úr straumnum 22.9 |
| `skriptur/lib/frettasamhengi.mjs` (ný) | `stadlaNafn`, `erLogadili`, `nafnaskra`, `ktFraNafni`, `fyrirtaeki`, hópar, `baetaVidBakgrunni`, `STUDDAR_TEGUNDIR` |
| `skriptur/lib/frettasamhengi.test.mjs` (ný) | próf á hvern hóp |
| `skriptur/lib/frettaskrif.mjs` (ný) | `KERFI`, `snidFyrir`, `thattaSvar`, `skrifaFrettir`, `samantektMd` |
| `skriptur/lib/frettaskrif.test.mjs` (ný) | gervi-client próf |
| `skriptur/build_frettavel.js` | rofi, bakgrunnur, prufuhamur, `lyfFyrst`, `kt` á atburðum, RSS-málsgreinar |
| `skriptur/build_frettavel_thurr.test.mjs` (ný) | prufuhamur skrifar ekkert |
| `.github/workflows/frettavel_prufa.yml` (ný) | handræst prufukeyrsla með lykli |
| `web/src/lib/frettavel.mjs` | `malsgreinar` |
| `web/src/lib/frettavel-malsgreinar.test.mjs` (ný) | próf |
| `web/src/lib/frettavel-export.mjs` | CSV flatar hreiðruð `facts` |
| `web/src/lib/frettavel-export.test.mjs` | próf á flötun |
| `web/src/pages/frettavel/[id].astro`, `web/src/pages/frettavel.astro` | málsgreinar |

---

### Task 1: Talnavörn

**Files:**
- Create: `skriptur/lib/talnavorn.mjs`
- Test: `skriptur/lib/talnavorn.test.mjs`

**Interfaces:**
- Produces: `athugaTolur(texti: string, facts: object) → { ok: boolean, rangar: string[] }`; `talnaTokar(texti) → Array<{hratt, tegund: 'numer'|'tala'|'hlutfall', gildi?, nakvaemni?}>`; `leyfd(facts) → { gildi: number[], texti: string }`.

- [ ] **Step 1: Write the failing test** — `skriptur/lib/talnavorn.test.mjs`:

```js
// Talnavörnin er tryggingin fyrir reglunni „aðeins úr facts". Dæmin eru RAUNFRÉTTIR úr straumnum 22.9.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athugaTolur, talnaTokar, leyfd } from './talnavorn.mjs';

const SIMINN = { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 };
const DAGAR = { titill: 'Ræsting á Keflavíkurflugvelli', kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], verdmaeti: 1024188084, dags: '2026-09-21', tedNr: '649909-2026' };
const THEMA = { manudur: '2026-08', rikisgreidslur: 17698591083, staersti_birgir: 'Distica hf.', ny_utbod_30d: 42, styrkir_alls: 11318801491 };
const DOMUR = { domstoll: 'Hæstiréttur', malsnr: '28/2026', svid: 'Einkamál', dags: '2026-09-17' };

test('raunfréttir úr straumnum standast', () => {
  assert.deepEqual(athugaTolur('Síminn lækkar um 7,3%\nHlutabréf í Símanum hf. lækkuðu um 7,3% og stóð gengið í 10,2.', SIMINN), { ok: true, rangar: [] });
  assert.equal(athugaTolur('Dagar hf. varð hlutskarpast með tilboði að verðmæti 1.024.188.084 krónur. Niðurstaðan var birt 21. september 2026. Útboðið er skráð undir tilkynningarnúmerinu 649909-2026.', DAGAR).ok, true);
  assert.equal(athugaTolur('Í ágúst 2026 námu ríkisgreiðslur 17,7 milljörðum króna. Á síðustu 30 dögum voru 42 ný útboð birt. Styrkir námu samtals 11,3 milljörðum króna.', { ...THEMA, dagar: 30 }).ok, true);
  assert.equal(athugaTolur('Hæstiréttur vísaði frá einkamáli nr. 28/2026 þann 17. september 2026.', DOMUR).ok, true);
});

test('uppspunnin tala, ártal og rangt námundað gildi falla', () => {
  assert.deepEqual(athugaTolur('Hlutabréf í Símanum lækkuðu um 7,5%.', SIMINN).rangar, ['7,5%']);
  assert.deepEqual(athugaTolur('Málið hófst árið 2025.', DOMUR).rangar, ['2025']);
  assert.deepEqual(athugaTolur('Ríkisgreiðslur námu 17,9 milljörðum.', THEMA).rangar, ['17,9 milljörðum']);
  assert.deepEqual(athugaTolur('Mál nr. 29/2026.', DOMUR).rangar, ['29/2026']);
});

test('námundun innan birtrar nákvæmni er leyfð, líka með einingum', () => {
  assert.equal(athugaTolur('um 18 milljarðar', THEMA).ok, true);            // 17,7 ma → 18 ma (nákvæmni 1 ma)
  assert.equal(athugaTolur('1.024 m.kr.', DAGAR).ok, true);                 // 1.024.188.084 → 1.024 milljónir
  assert.equal(athugaTolur('atvinnuleysi 4%', { atvinnuleysi: 3.95 }).ok, true);
  assert.equal(athugaTolur('1,5 prósentustig', { breyting: 1.5 }).ok, true);
});

test('hreiðruð gildi í bakgrunni og dagsetningar í strengjum teljast', () => {
  const f = { felag: 'Dagar hf.', bakgrunnur: { sigurvegari: { utbod_unnin: { fjoldi: 3, sidast: '2026-06-01' } } } };
  assert.equal(athugaTolur('Félagið hefur unnið 3 útboð, síðast 1. júní 2026.', f).ok, true);
  assert.equal(athugaTolur('Atvinnuleysi í ágúst 2026', { manudur: '2026M08' }).ok, true);
});

test('táknun: númer, hlutföll og einingar greinast rétt', () => {
  const t = talnaTokar('nr. 28/2026 · 7,3% · 17,7 milljörðum · 1.024.188.084 kr.');
  assert.deepEqual(t.map((x) => x.tegund), ['numer', 'hlutfall', 'tala', 'tala']);
  assert.equal(t[2].gildi, 17.7e9);
  assert.equal(t[3].gildi, 1024188084);
  assert.ok(leyfd({ d: '2026-09-21' }).gildi.includes(21));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/lib/talnavorn.test.mjs`
Expected: FAIL — `Cannot find module ... talnavorn.mjs`

- [ ] **Step 3: Write minimal implementation** — `skriptur/lib/talnavorn.mjs`:

```js
// talnavorn.mjs — hver tala í vélskrifaðri frétt verður að finnast í staðreyndunum (facts).
//
// AF HVERJU (22.9.2026): fréttavélin fær lengri texta með bakgrunni úr gögnum Karp. Meiri texti eykur hættuna á
// uppspuna. Reglan „aðeins úr facts" í fyrirmælunum er ósk; þessi athugun er tryggingin. Fréttin fellur ef tala
// í titli eða texta á sér ekki stoð í facts, að teknu tilliti til námundunar og eininga.

const RE_NUMER = /\d+(?:[/-]\d+)+/g;                             // 28/2026 · 649909-2026 · 80/400 · 2026-09-21
const RE_TALA = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;   // 1.024.188.084 · 17,7 · 42

function margfaldari(eftir) {
  const s = eftir.toLowerCase();
  if (/^\s*(milljar[ðd]|milljör[ðd])/.test(s) || /^\s*m[aö]\.\s?kr/.test(s)) return 1e9;
  if (/^\s*millj[óo]n/.test(s) || /^\s*m\.\s?kr/.test(s)) return 1e6;
  if (/^\s*(þúsund|þús\.|þ\.\s?kr)/.test(s)) return 1e3;
  return 1;
}
const erHlutfall = (eftir) => /^\s*(%|prósent)/i.test(eftir);
const stadlaStrik = (s) => String(s).replace(/[‐‑‒–—]/g, '-');

/** Tölur í texta: { hratt, tegund: 'numer'|'tala'|'hlutfall', gildi?, nakvaemni? } */
export function talnaTokar(texti) {
  const s = stadlaStrik(texti || '');
  const tokar = [], numerSvid = [];
  for (const m of s.matchAll(RE_NUMER)) { tokar.push({ hratt: m[0], tegund: 'numer' }); numerSvid.push([m.index, m.index + m[0].length]); }
  for (const m of s.matchAll(RE_TALA)) {
    const a = m.index, b = a + m[0].length;
    if (numerSvid.some(([x, y]) => a >= x && b <= y)) continue;   // hluti af númeri, þegar talið
    const [heil, brot = ''] = m[0].split(',');
    const eftir = s.slice(b, b + 16);
    const marg = margfaldari(eftir), hlutfall = erHlutfall(eftir);
    tokar.push({
      hratt: m[0] + (hlutfall ? '%' : marg > 1 ? ' ' + eftir.trim().split(/\s+/)[0] : ''),
      tegund: hlutfall ? 'hlutfall' : 'tala',
      gildi: Number(heil.replace(/\./g, '') + (brot ? '.' + brot : '')) * marg,
      nakvaemni: Math.pow(10, -brot.length) * marg,
    });
  }
  return tokar;
}

/** Leyfileg gildi úr facts: allar tölur (líka inni í strengjum) + dagur, mánuður og ár úr dagsetningum. */
export function leyfd(facts) {
  const gildi = [], strengir = [];
  const ganga = (v) => {
    if (v == null || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (Number.isFinite(v)) gildi.push(v); return; }
    if (typeof v === 'string') {
      const s = stadlaStrik(v);
      strengir.push(s);
      for (const m of s.matchAll(/(\d{4})M(\d{2})/g)) gildi.push(+m[1], +m[2]);   // 2026M08 (Hagstofa)
      for (const t of talnaTokar(s)) {
        if (t.tegund === 'numer') for (const p of t.hratt.split(/[/-]/)) gildi.push(Number(p));
        else gildi.push(t.gildi);
      }
      return;
    }
    if (Array.isArray(v)) { v.forEach(ganga); return; }
    if (typeof v === 'object') Object.values(v).forEach(ganga);
  };
  ganga(facts);
  return { gildi, texti: strengir.join(' \u0001 ') };
}

/** { ok, rangar } — rangar = tölur í textanum sem eiga sér ekki stoð í facts. */
export function athugaTolur(texti, facts) {
  const { gildi, texti: fstr } = leyfd(facts);
  const rangar = [];
  for (const t of talnaTokar(texti)) {
    if (t.tegund === 'numer') { if (!fstr.includes(t.hratt)) rangar.push(t.hratt); continue; }
    const g = Math.abs(t.gildi), tol = t.nakvaemni / 2 + 1e-9;
    const passar = gildi.some((v) => {
      const a = Math.abs(v);
      return Math.abs(g - a) <= tol || (t.tegund === 'hlutfall' && Math.abs(g - a * 100) <= tol);
    });
    if (!passar) rangar.push(t.hratt);
  }
  return { ok: rangar.length === 0, rangar: [...new Set(rangar)] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test skriptur/lib/talnavorn.test.mjs`
Expected: `ℹ pass 5`, `ℹ fail 0`

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/talnavorn.mjs skriptur/lib/talnavorn.test.mjs
git commit -m "Fréttavél: talnavörn — hver tala í vélskrifaðri frétt verður að finnast í facts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bakgrunnur I — fyrirtæki, útboð, styrkir, vörumerki, gjaldþrot

**Files:**
- Create: `skriptur/lib/frettasamhengi.mjs`
- Test: `skriptur/lib/frettasamhengi.test.mjs`

**Interfaces:**
- Consumes: ekkert úr fyrri verkum.
- Produces: `baetaVidBakgrunni(events: Array<{id,type,facts,kt?}>, gogn: object, o: { idag: 'YYYY-MM-DD', state?: object, skra?: fn }) → number` (fjöldi atburða sem fengu `facts.bakgrunnur`); `STUDDAR_TEGUNDIR: string[]`; `fyrirtaeki(nafn, gogn, { kt?, utanUtbods?, utanStyrks?, idag }) → object|null`; `stadlaNafn(n) → string`; `erLogadili(kt) → boolean`.
- `gogn` = `{ felagaskra: {felog:[{kt,nafn}]}, birgjar: {fra,til,vendors:[{n,t,c,o}]}, utbod_urslit: {awards:[{nr,t,buyer,winners,value,cur,d}]}, styrkir: {styrkir:[{nafn,kt,sjodur,upphaed,ar,slug}]}, arsreikningur: (kt) => json|null, markadir, sedlabanki, atvinnuleysi, lyf }` (hin fjögur síðustu notuð í Task 3).

- [ ] **Step 1: Write the failing test** — `skriptur/lib/frettasamhengi.test.mjs`:

```js
// Bakgrunnur fréttar úr gögnum Karp. Gögnin hér eru á RAUNSNIÐI skránna (staðfest 22.9.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baetaVidBakgrunni, fyrirtaeki, stadlaNafn, erLogadili, STUDDAR_TEGUNDIR } from './frettasamhengi.mjs';

const IDAG = '2026-09-22';
export const GOGN = () => ({
  felagaskra: { felog: [
    { kt: '5501692829', nafn: 'Dagar hf.' },
    { kt: '4101690299', nafn: 'Aðalstræti 4 ehf' },
    { kt: '6001001001', nafn: 'Tvínefni ehf.' },
    { kt: '6001001002', nafn: 'Tvínefni hf.' },
    { kt: '6101001003', nafn: 'Jón Jónsson ehf.' },
  ] },
  utbod_urslit: { awards: [
    { nr: 'A1', t: 'Ræsting', buyer: 'Isavia ohf', winners: ['Dagar hf.'], value: 1000000, cur: 'ISK', d: '2026-03-01' },
    { nr: 'A2', t: 'Ræsting 2', buyer: 'Isavia ohf', winners: ['Dagar hf.', 'Annað ehf.'], value: 600000, cur: 'ISK', d: '2026-06-01' },
    { nr: 'NU', t: 'Ræsting KEF', buyer: 'Isavia ohf', winners: ['Dagar hf.'], value: 1024188084, cur: 'ISK', d: '2026-09-21' },
    { nr: 'G', t: 'Gamalt', buyer: 'Isavia ohf', winners: ['Annað ehf.'], value: 5, cur: 'ISK', d: '2025-01-01' },
  ] },
  birgjar: { fra: '2025-09', til: '2026-08-31', vendors: [{ n: 'Dagar hf.', t: 250000000, c: 40, o: 'Isavia' }] },
  styrkir: { styrkir: [
    { nafn: 'Dagar hf.', kt: null, sjodur: 'Tækniþróunarsjóður', upphaed: 20000000, ar: 2025, slug: 'dagar' },
    { nafn: 'Dagar hf.', kt: null, sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026, slug: 'dagar' },
  ] },
  arsreikningur: (kt) => (kt === '5501692829'
    ? { kt, ar: { 2023: { kvardi: 1000, rekstur: { sala: 4000000, hagnadur: 90000 } }, 2024: { kvardi: 1000, rekstur: { sala: 5000000, hagnadur: 120000 } } } }
    : null),
});

test('stöðlun nafna og lögaðilapróf', () => {
  assert.equal(stadlaNafn('Dagar hf.'), 'dagar');
  assert.equal(stadlaNafn('Íslenska gámafélagið ehf.'), 'íslenska gámafélagið');
  assert.equal(erLogadili('5501692829'), true);
  assert.equal(erLogadili('0101801234'), false, 'einstaklingur');
});

test('fyrirtæki: útboð (utan fréttarinnar sjálfrar), ríkisgreiðslur, styrkir og ársreikningur með kvarða', () => {
  const f = fyrirtaeki('Dagar hf.', GOGN(), { utanUtbods: 'NU', idag: IDAG });
  assert.deepEqual(f, {
    utbod_unnin: { fjoldi: 2, samtals_kr: 1300000, sidast: '2026-06-01' },
    rikisgreidslur_12man: { samtals_kr: 250000000, fra: '2025-09', til: '2026-08' },
    styrkir_fyrri: { fjoldi: 2, samtals_kr: 50000000 },
    arsreikningur: { ar: 2024, sala_kr: 5000000000, hagnadur_kr: 120000000 },
  });
});

test('tvíræð eða óþekkt nafn gefur EKKERT, frekar en að giska', () => {
  assert.equal(fyrirtaeki('Tvínefni ehf.', GOGN(), { idag: IDAG }), null);
  assert.equal(fyrirtaeki('Óþekkt Erlent B.V.', GOGN(), { idag: IDAG }), null);
});

test('kennitala einstaklings stöðvar samhengið, líka þótt nafnið finnist sem félag', () => {
  assert.equal(fyrirtaeki('Jón Jónsson', GOGN(), { kt: '0101801234', idag: IDAG }), null);
});

test('útboð: sigurvegari + önnur útboð kaupandans síðustu 12 mánuði', () => {
  const e = { id: 'urslit-NU', type: 'urslit', facts: { titill: 'Ræsting KEF', kaupandi: 'Isavia ohf', sigurvegarar: ['Dagar hf.'], verdmaeti: 1024188084, dags: '2026-09-21', tedNr: 'NU' } };
  assert.equal(baetaVidBakgrunni([e], GOGN(), { idag: IDAG }), 1);
  assert.equal(e.facts.bakgrunnur.kaupandi_onnur_utbod_12man, 2);
  assert.equal(e.facts.bakgrunnur.sigurvegari.utbod_unnin.fjoldi, 2);
});

test('styrkur: fyrri styrkir án styrksins sem fréttin fjallar um', () => {
  const e = { id: 'styrkur-dagar-2026', type: 'styrkur', facts: { thegi: 'Dagar hf.', sjodur: 'Tækniþróunarsjóður', upphaed: 30000000, ar: 2026 } };
  baetaVidBakgrunni([e], GOGN(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur.thegi.styrkir_fyrri, { fjoldi: 1, samtals_kr: 20000000 });
});

test('vörumerki og gjaldþrot nota kennitölu atburðarins', () => {
  const vm = { id: 'vorumerki-1', type: 'vorumerki', kt: '5501692829', facts: { merki: 'DAGAR', eigandi: 'Dagar hf.' } };
  const vmEinst = { id: 'vorumerki-2', type: 'vorumerki', kt: '0101801234', facts: { merki: 'JÓN', eigandi: 'Jón Jónsson' } };
  const gj = { id: 'gjaldthrot-1', type: 'gjaldthrot', kt: '5501692829', facts: { felag: 'Dagar hf.', tegund: 'Gjaldþrotaskiptabeiðni' } };
  assert.equal(baetaVidBakgrunni([vm, vmEinst, gj], GOGN(), { idag: IDAG }), 2);
  assert.ok(vm.facts.bakgrunnur.eigandi.arsreikningur);
  assert.equal(vmEinst.facts.bakgrunnur, undefined, 'einstaklingur fær ekkert');
  assert.equal(gj.facts.bakgrunnur.felagid.arsreikningur.ar, 2024);
});

test('villa í einum atburði fellir ekki hina; óstuddar tegundir ósnertar', () => {
  const vondur = { id: 'urslit-x', type: 'urslit', facts: { sigurvegarar: ['Dagar hf.'], tedNr: 'X' } };
  const gogn = GOGN(); gogn.arsreikningur = () => { throw new Error('bilað'); };
  const domur = { id: 'domur-1', type: 'domur', facts: { domstoll: 'Hæstiréttur' } };
  const skilabod = [];
  assert.equal(baetaVidBakgrunni([vondur, domur], gogn, { idag: IDAG, skra: (m) => skilabod.push(m) }), 0);
  assert.equal(domur.facts.bakgrunnur, undefined);
  assert.match(skilabod[0], /urslit-x/);
  assert.ok(STUDDAR_TEGUNDIR.includes('gjaldthrot') && !STUDDAR_TEGUNDIR.includes('domur'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/lib/frettasamhengi.test.mjs`
Expected: FAIL — `Cannot find module ... frettasamhengi.mjs`

- [ ] **Step 3: Write minimal implementation** — `skriptur/lib/frettasamhengi.mjs`:

```js
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
```

⚠ `STUDDAR_TEGUNDIR` er reiknað úr `HOPAR` á línunni beint á eftir. Task 3 breytir `HOPAR`-línunni sjálfri, svo `STUDDAR_TEGUNDIR` fylgir sjálfkrafa.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test skriptur/lib/frettasamhengi.test.mjs`
Expected: `ℹ pass 8`, `ℹ fail 0`

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/frettasamhengi.mjs skriptur/lib/frettasamhengi.test.mjs
git commit -m "Fréttavél: bakgrunnur um fyrirtæki (útboð, ríkisgreiðslur, styrkir, ársreikningur) á útboð, styrki, vörumerki og gjaldþrot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Bakgrunnur II — markaðir, hagtölur, lyf

**Files:**
- Modify: `skriptur/lib/frettasamhengi.mjs` (bæta við hópum; `HOPAR` og `STUDDAR_TEGUNDIR`)
- Test: `skriptur/lib/frettasamhengi.test.mjs` (bæta við prófum)

**Interfaces:**
- Consumes: `hreinsa`, `r1`, `r2`, `baetaVidBakgrunni` úr Task 2.
- Produces: `STUDDAR_TEGUNDIR` inniheldur nú líka `mark`, `verdbolga`, `vextir`, `vika`, `lyf`. `o.state.lyfFyrst: {slug: 'YYYY-MM-DD'|'ohekkt'}` lesið fyrir `lyf`.

- [ ] **Step 1: Write the failing tests** — bæta aftast í `skriptur/lib/frettasamhengi.test.mjs`:

```js
// ── Task 3: markaðir, hagtölur, lyf ──────────────────────────────────────────
// ⚠ Í markadir.json er gengi DAGSINS síðasta gildið í `hist` (staðfest 22.9: 190 == price, síðasta hreyfing = chgPct).
const MARKADIR = { indices: [{ sym: '^OMXI15', chgPct: 2.014 }], stocks: [
  { sym: 'SIMINN', name: 'Siminn hf', price: 10.2, chgPct: -7.3, hist: [10, 10.5, 11, 10.8, 11, 11.2, 11, 10.2] },
] };
const pt = (y, m, v) => [`${y}-${String(m).padStart(2, '0')}-01`, v];
const SEDLABANKI = { datasets: {
  verdbolga: { series: [{ name: 'Vísitala neysluverðs', points: [pt(2025, 8, 4.0), pt(2025, 9, 4.1), pt(2025, 10, 4.2), pt(2025, 11, 4.3), pt(2025, 12, 4.5), pt(2026, 1, 4.6), pt(2026, 2, 4.8), pt(2026, 3, 4.9), pt(2026, 4, 5.0), pt(2026, 5, 5.1), pt(2026, 6, 5.2), pt(2026, 7, 5.3), pt(2026, 8, 5.6)] }] },
  vextir_si: { series: [{ name: 'Meginvextir (vextir á 7 daga bundnum innlánum)', points: [['2026-05-20', 7.5], ['2026-05-27', 7.75], ['2026-06-03', 7.75], ['2026-08-26', 8], ['2026-09-02', 8]] }] },
} };
const ATVINNULEYSI = { monthly: [{ t: '2025M08', v: 3.4 }, { t: '2026M07', v: 4 }, { t: '2026M08', v: 3.95 }] };
const LYF = { shortageCount: 241, lyf: [
  { slug: 'cotrim-1', name: 'Cotrim', atc: { code: 'J01EE01' }, shortage: true, essential: true },
  { slug: 'cotrim-2', name: 'Cotrim forte', atc: { code: 'J01EE01' }, shortage: false },
  { slug: 'bactrim', name: 'Bactrim', atc: { code: 'J01EE01' }, shortage: true },
  { slug: 'annad', name: 'Annað', atc: { code: 'N05AX12' }, shortage: false },
] };
const GOGN2 = () => ({ ...GOGN(), markadir: MARKADIR, sedlabanki: SEDLABANKI, atvinnuleysi: ATVINNULEYSI, lyf: LYF });

test('markaðir: röðin, stærsta FYRRI dagshreyfing (án dagsins) og úrvalsvísitalan', () => {
  const e = { id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur, {
    vidskiptadagar_i_rod: 8, haesta_i_rod: 11.2, laegsta_i_rod: 10,
    breyting_fra_upphafi_rodar_pct: 2, staersta_fyrri_dagshreyfing_pct: 5,
    hreyfing_dagsins_su_staersta: true, urvalsvisitala_breyting_pct: 2,
  });
});

test('verðbólga: 12 mánuðum fyrr, hámark/lágmark og markmið', () => {
  const e = { id: 'verdbolga-2026-08-01', type: 'verdbolga', facts: { verdbolga: 5.6, fyrri: 5.3, dags: '2026-08-01' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.deepEqual(e.facts.bakgrunnur, { verdbolga: 5.6, maeling: '2026-08', verdbolga_12man_fyrr: 4, haesta_12man: 5.6, laegsta_12man: 4.1, verdbolgumarkmid: 2.5, fravik_fra_markmidi: 3.1 });
});

test('vextir: breytingin á undan og raunstýrivextir', () => {
  const e = { id: 'vextir-2026-08-26', type: 'vextir', facts: { nyir: 8, fyrri: 7.75, dags: '2026-08-26' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  const b = e.facts.bakgrunnur;
  assert.deepEqual(b.sidasta_breyting, { dags: '2026-08-26', fra: 7.75, i: 8 });
  assert.deepEqual(b.breytingin_a_undan, { dags: '2026-05-27', fra: 7.5, i: 7.75 });
  assert.equal(b.raunstyrivextir, 2.4);
});

test('vikan: atvinnuleysi og verðbólga 12 mánuðum fyrr', () => {
  const e = { id: 'vika-x', type: 'vika', facts: { verdbolga: 5.6, meginvextir: 8, atvinnuleysi: 3.95 } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG });
  assert.equal(e.facts.bakgrunnur.atvinnuleysi_12man_fyrr, 3.4);
  assert.equal(e.facts.bakgrunnur.verdbolga_12man_fyrr, 4);
});

test('lyf: önnur lyf með sama virka efni (ATC), þar af í skorti, og hvenær skortur sást fyrst', () => {
  const e = { id: 'lyfskortur-cotrim-1', type: 'lyf', facts: { lyf: 'Cotrim' } };
  baetaVidBakgrunni([e], GOGN2(), { idag: IDAG, state: { lyfFyrst: { 'cotrim-1': '2026-09-10' } } });
  assert.deepEqual(e.facts.bakgrunnur, { atc_kodi: 'J01EE01', onnur_lyf_sama_efni: 2, thar_af_i_skorti: 1, lyf_i_skorti_alls: 241, skortur_skradur_fra: '2026-09-10' });
  const ohekkt = { id: 'lyfskortur-cotrim-1', type: 'lyf', facts: { lyf: 'Cotrim' } };
  baetaVidBakgrunni([ohekkt], GOGN2(), { idag: IDAG, state: { lyfFyrst: { 'cotrim-1': 'ohekkt' } } });
  assert.equal(ohekkt.facts.bakgrunnur.skortur_skradur_fra, undefined, 'óþekkt upphaf er EKKI dagsetning');
});

test('vantandi gagnaskrá fellir ekki: markaðsfrétt án markadir.json fær engan bakgrunn', () => {
  const e = { id: 'mark-y', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3 } };
  assert.equal(baetaVidBakgrunni([e], { ...GOGN(), markadir: null }, { idag: IDAG }), 0);
  assert.ok(['mark', 'verdbolga', 'vextir', 'vika', 'lyf'].every((t) => STUDDAR_TEGUNDIR.includes(t)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/lib/frettasamhengi.test.mjs`
Expected: FAIL — nýju prófin (bakgrunnur `undefined` fyrir mark/verdbolga/vextir/vika/lyf).

- [ ] **Step 3: Implement** — í `skriptur/lib/frettasamhengi.mjs`, setja eftirfarandi á undan línunni `const HOPAR = { urslit, styrkur, vorumerki, gjaldthrot };`:

```js
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
```

og breyta línunni `const HOPAR = { urslit, styrkur, vorumerki, gjaldthrot };` í:

```js
const HOPAR = { urslit, styrkur, vorumerki, gjaldthrot, mark, verdbolga: hagtolur, vextir: hagtolur, vika: hagtolur, lyf };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test skriptur/lib/frettasamhengi.test.mjs`
Expected: `ℹ pass 14`, `ℹ fail 0`

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/frettasamhengi.mjs skriptur/lib/frettasamhengi.test.mjs
git commit -m "Fréttavél: bakgrunnur á markaði, hagtölur og lyf

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Ritun — ein frétt í hverju kalli, talnavörn, endurskrif, sniðmát

**Files:**
- Create: `skriptur/lib/frettaskrif.mjs`
- Test: `skriptur/lib/frettaskrif.test.mjs`

**Interfaces:**
- Consumes: `athugaTolur(texti, facts)` úr Task 1.
- Produces: `skrifaFrettir(events, { client, model?, hamark?, skra? }) → Promise<{ skrifadar, endurskrifadar, hafnad, villur, sleppt }>` — breytir `e.title`, `e.text`, `e.ai = true` á samþykktum; setur `e.talnavorn = rangar[]` á höfnuðum. `samantektMd(events, { titill }) → string`. `SJALFGEFID_LIKAN = 'claude-opus-5'`. `client` er `new Anthropic()` (eða gervi með `messages.create`).

- [ ] **Step 1: Write the failing test** — `skriptur/lib/frettaskrif.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skrifaFrettir, thattaSvar, samantektMd, snidFyrir, SJALFGEFID_LIKAN } from './frettaskrif.mjs';

/** Gervi-client: hvert kall tekur næsta svar (strengur, fall af beiðni, eða Error sem kastast). */
function gervi(svor) {
  const kol = [];
  return { kol, messages: { create: async (req) => {
    kol.push(JSON.parse(JSON.stringify(req)));
    const s = svor.shift();
    if (s instanceof Error) throw s;
    return { content: [{ type: 'text', text: typeof s === 'function' ? s(req) : s }] };
  } } };
}
const SIMINN = () => ({ id: 'mark-x', type: 'mark', facts: { felag: 'Siminn hf', breyting: -7.3, verd: 10.2 }, title: 'gamall titill', text: 'gamall texti' });
const J = (title, text) => JSON.stringify({ title, text });
const GOTT = J('Síminn lækkar um 7,3%', 'Hlutabréf í Símanum lækkuðu um 7,3% og stóð gengið í 10,2.');
const RANGT = J('Síminn lækkar um 7,5%', 'Hlutabréf í Símanum lækkuðu um 7,5%.');

test('stenst í fyrstu atrennu: nýr texti, nýtt líkan, skyndiminni á fyrirmælum, tölusnið', async () => {
  const c = gervi([GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.deepEqual(t, { skrifadar: 1, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0 });
  assert.equal(e.ai, true);
  assert.equal(e.title, 'Síminn lækkar um 7,3%');
  assert.equal(c.kol[0].model, SJALFGEFID_LIKAN);
  assert.equal(c.kol[0].system[0].cache_control.type, 'ephemeral');
  assert.equal(JSON.parse(c.kol[0].messages[0].content).snid, 'tolur');
});

test('talnavörn fellir → EITT endurskrif sem nefnir röngu töluna', async () => {
  const c = gervi([RANGT, GOTT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.endurskrifadar, 1);
  assert.equal(t.skrifadar, 1);
  assert.equal(c.kol.length, 2);
  const sidast = c.kol[1].messages[c.kol[1].messages.length - 1].content;
  assert.match(sidast, /7,5%/);
  assert.equal(c.kol[1].messages[1].role, 'assistant');
});

test('fellur tvisvar → sniðmát helst og röngu tölurnar skráðar', async () => {
  const c = gervi([RANGT, RANGT]); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.hafnad, 1);
  assert.equal(e.ai, undefined);
  assert.equal(e.title, 'gamall titill');
  assert.deepEqual(e.talnavorn, ['7,5%']);
});

test('ógilt JSON → endurskrif; ógilt aftur → sniðmát', async () => {
  const c = gervi(['ekki json', 'ekki heldur']); const e = SIMINN();
  const t = await skrifaFrettir([e], { client: c });
  assert.equal(t.hafnad, 1);
  assert.equal(c.kol.length, 2);
  assert.equal(e.text, 'gamall texti');
});

test('hrá línuskil inni í JSON-streng eru löguð (þekkt Claude-gildra)', () => {
  const r = thattaSvar('{"title":"T","text":"Fyrsta málsgrein.\n\nÖnnur málsgrein."}');
  assert.equal(r.text, 'Fyrsta málsgrein.\n\nÖnnur málsgrein.');
});

test('API-villa fellir ekki næstu frétt; þak og noai virt', async () => {
  const c = gervi([new Error('529 overloaded'), GOTT]);
  const a = SIMINN(), b = SIMINN(), n = { ...SIMINN(), id: 'vikan-x', noai: true }, d = SIMINN();
  const t = await skrifaFrettir([a, n, b, d], { client: c, hamark: 2, skra: () => {} });
  assert.equal(t.villur, 1);
  assert.equal(t.skrifadar, 1);
  assert.equal(t.sleppt, 1, 'd er utan þaks');
  assert.equal(a.text, 'gamall texti');
  assert.equal(b.ai, true);
  assert.equal(c.kol.length, 2, 'noai sent aldrei');
});

test('efnismál fá efnissnið; samantekt sýnir áður/nýtt, bakgrunn og höfnun', () => {
  assert.equal(snidFyrir('urslit'), 'efni');
  assert.equal(snidFyrir('mark'), 'tolur');
  const md = samantektMd([
    { id: 'a', type: 'urslit', ai: true, title: 'Nýtt', text: 'Nýr texti.', gamall: { title: 'Gamalt', text: 'Gamall texti.' }, facts: { bakgrunnur: { x: 1 } } },
    { id: 'b', type: 'mark', title: 'Sniðmát', text: 'S.', talnavorn: ['7,5%'], facts: {} },
  ], { titill: 'Prófun' });
  assert.match(md, /Áður/);
  assert.match(md, /"x":1/);
  assert.match(md, /Talnavörn hafnaði.*7,5%/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/lib/frettaskrif.test.mjs`
Expected: FAIL — `Cannot find module ... frettaskrif.mjs`

- [ ] **Step 3: Write minimal implementation** — `skriptur/lib/frettaskrif.mjs`:

```js
// frettaskrif.mjs — ein frétt í hverju kalli til Claude, talnavörn eftir hverja, eitt endurskrif, annars sniðmát.
//
// AF HVERJU (22.9.2026): áður fóru allar fréttir dagsins í EITT kall (16 fréttir, 5.000 tókar) og fengu 1–2
// setningar hver. Nú fær hver frétt eigið kall og bakgrunn (frettasamhengi.mjs), og talnavörnin (talnavorn.mjs)
// tryggir að lengri texti beri ekki uppspunnar tölur. Falli frétt tvisvar helst sniðmátstexti skynjarans.
import { athugaTolur } from './talnavorn.mjs';

export const SJALFGEFID_LIKAN = 'claude-opus-5';
export const HAMARK = 30;   // kostnaðarþak á keyrslu; umfram fréttir halda sniðmátstexta
export const TOLUFRETTIR = new Set(['mark', 'vextir', 'verdbolga', 'vika', 'fylgi', 'fast', 'fastthr', 'samanburdur', 'gengi', 'spike']);
export const snidFyrir = (type) => (TOLUFRETTIR.has(type) ? 'tolur' : 'efni');

export const KERFI = [
  'Þú ert fréttavél Karp (karp.is). Þú skrifar EINA hlutlausa frétt á íslensku EINGÖNGU úr staðreyndunum í facts.',
  'facts.bakgrunnur er samhengi úr gögnum Karp. Notaðu það til að setja fréttina í samhengi, en aðeins það sem stendur þar.',
  'SNIÐ: ef snid er "tolur" skaltu skrifa 2–4 setningar í einni málsgrein. Ef snid er "efni" skaltu skrifa 2–3 málsgreinar aðskildar með auðri línu: fyrst hvað gerðist, síðan samhengi úr bakgrunni, loks annað sem máli skiptir. Séu staðreyndirnar fáar skaltu skrifa stutt. ALDREI teygja textann með endurtekningu eða almennum orðum.',
  'STRANGT BANN: engar tölur, nöfn, dagsetningar eða fullyrðingar sem ekki standa í facts. Ekki reikna nýjar tölur (hvorki mismun, hlutföll né samtölur) nema þær standi í facts. Engar orsakaskýringar eða spádómar. Engin gildishlaðin orð og engin upphrópunarmerki. Ekki nefna facts, bakgrunn eða heiti sviða. Einstaklingar sem heita X í facts haldast nafnlausir.',
  'Tölur á íslensku sniði: 1.024.188.084 kr., 7,3%, 17,7 milljarðar króna.',
  'Skilaðu AÐEINS JSON-hlut: {"title":"...","text":"..."}. title hámark 90 stafir, text hámark 2000 stafir, málsgreinar aðskildar með \\n\\n.',
].join('\n');

// Claude setur stundum hrá línuskil inni í JSON-streng (þekkt gildra úr hjálparfulltrúanum), sem JSON.parse hafnar.
function lagaLinuskil(json) {
  let ut = '', iStreng = false, flotta = false;
  for (const c of json) {
    if (iStreng) {
      if (flotta) { ut += c; flotta = false; continue; }
      if (c === '\\') { ut += c; flotta = true; continue; }
      if (c === '"') { iStreng = false; ut += c; continue; }
      if (c === '\n') { ut += '\\n'; continue; }
      if (c === '\r') continue;
      ut += c;
    } else { if (c === '"') iStreng = true; ut += c; }
  }
  return ut;
}

/** {title, text} úr svari, eða null. */
export function thattaSvar(raw) {
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  for (const kandidat of [s.slice(a, b + 1), lagaLinuskil(s.slice(a, b + 1))]) {
    try {
      const o = JSON.parse(kandidat);
      if (o && typeof o.title === 'string' && typeof o.text === 'string' && o.title.trim() && o.text.trim()) return { title: o.title.trim(), text: o.text.trim() };
    } catch (e) { /* næsta tilraun */ }
  }
  return null;
}

async function kalla(client, model, messages) {
  const msg = await client.messages.create({ model, max_tokens: 1500, system: [{ type: 'text', text: KERFI, cache_control: { type: 'ephemeral' } }], messages });
  return (msg.content || []).map((c) => c.text || '').join('');
}

export async function skrifaFrettir(events, { client, model = SJALFGEFID_LIKAN, hamark = HAMARK, skra = console.log } = {}) {
  const t = { skrifadar: 0, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0 };
  if (!client) return t;
  const hopur = (events || []).filter((e) => e && !e.noai);
  t.sleppt = Math.max(0, hopur.length - hamark);
  for (const e of hopur.slice(0, hamark)) {
    const facts = e.facts || {};
    const skilabod = [{ role: 'user', content: JSON.stringify({ type: e.type, snid: snidFyrir(e.type), facts }) }];
    try {
      let raw = await kalla(client, model, skilabod);
      let ut = thattaSvar(raw);
      let vorn = ut ? athugaTolur(ut.title + '\n' + ut.text, facts) : null;
      if (!ut || !vorn.ok) {
        t.endurskrifadar++;
        const athugasemd = ut
          ? 'Þessar tölur standa ekki í facts: ' + vorn.rangar.join(', ') + '. Skrifaðu fréttina aftur án þeirra eða með réttum gildum úr facts. Skilaðu AÐEINS JSON-hlutnum.'
          : 'Svarið var ekki gildur JSON-hlutur. Skilaðu AÐEINS {"title":"...","text":"..."}.';
        skilabod.push({ role: 'assistant', content: raw || '(tómt)' }, { role: 'user', content: athugasemd });
        raw = await kalla(client, model, skilabod);
        ut = thattaSvar(raw);
        vorn = ut ? athugaTolur(ut.title + '\n' + ut.text, facts) : null;
      }
      if (ut && vorn && vorn.ok) { e.title = ut.title.slice(0, 120); e.text = ut.text.slice(0, 2200); e.ai = true; t.skrifadar++; }
      else { t.hafnad++; if (vorn && !vorn.ok) e.talnavorn = vorn.rangar; }
    } catch (err) { t.villur++; skra('• ritun brást fyrir ' + e.id + ': ' + String(err).slice(0, 100)); }
  }
  return t;
}

/** Læsileg samantekt prufukeyrslu (markdown): áður/nýtt, bakgrunnur, höfnun talnavarnar. */
export function samantektMd(events, { titill = 'Prufukeyrsla fréttavélar' } = {}) {
  const l = ['## ' + titill, ''];
  for (const e of (events || [])) {
    l.push('### ' + e.type + ' · ' + e.id);
    if (e.gamall) l.push('**Áður:** ' + e.gamall.title, '', e.gamall.text || '', '');
    l.push('**' + (e.ai ? 'Nýtt' : 'Sniðmát (ekki vélskrifað)') + ':** ' + e.title, '', e.text || '', '');
    const bg = e.facts && e.facts.bakgrunnur;
    l.push('_Bakgrunnur:_ ' + (bg ? '`' + JSON.stringify(bg) + '`' : 'enginn'));
    if (e.talnavorn) l.push('_Talnavörn hafnaði:_ ' + e.talnavorn.join(', '));
    l.push('');
  }
  return l.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test skriptur/lib/frettaskrif.test.mjs`
Expected: `ℹ pass 7`, `ℹ fail 0`

- [ ] **Step 5: Commit**

```bash
git add skriptur/lib/frettaskrif.mjs skriptur/lib/frettaskrif.test.mjs
git commit -m "Fréttavél: ein frétt í hverju kalli, talnavörn, eitt endurskrif, annars sniðmát

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Samþætting í build_frettavel.js + prufuvinnuflæði

**Files:**
- Modify: `skriptur/build_frettavel.js` (fastar ~l. 28; lyf-skynjari ~l. 536–550; gjaldþrot ~l. 467; vörumerki ~l. 561; `rss()` ~l. 912; `main()` ~l. 925–958)
- Create: `skriptur/build_frettavel_thurr.test.mjs`
- Create: `.github/workflows/frettavel_prufa.yml`

**Interfaces:**
- Consumes: `baetaVidBakgrunni`, `STUDDAR_TEGUNDIR` (Tasks 2–3); `skrifaFrettir`, `samantektMd` (Task 4).
- Produces: `node skriptur/build_frettavel.js --thurr [--endurskrifa N]` (skrifar ekkert, prentar `===== PRUFUKEYRSLA` + samantekt); rofi `KARP_FRETTAVEL_NYTT=1`; `state.lyfFyrst`.

- [ ] **Step 1: Write the failing integration test** — `skriptur/build_frettavel_thurr.test.mjs`:

```js
// Prufuhamurinn keyrir alla fréttavélina á raungögnum en MÁ EKKERT SKRIFA. Án lykils: bakgrunnur án ritunar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAKTADAR = ['gogn/frettavel.json', 'gogn/frettavel_state.json', 'gogn/frettavel_seen.json', 'gogn/frettavel_archive.json',
  'web/public/frettavel.xml', 'web/public/gogn/frettavel.json', 'web/public/gogn/frettavel_archive.json'];
const fingrafar = () => Object.fromEntries(VAKTADAR.map((f) => {
  const p = path.join(ROT, f);
  return [f, existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : null];
}));

test('--thurr skrifar ekkert og sýnir bakgrunn á sýnishornum úr safninu', { timeout: 120000 }, () => {
  const fyrir = fingrafar();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; delete env.GITHUB_STEP_SUMMARY; delete env.KARP_FRETTAVEL_NYTT;
  const r = spawnSync(process.execPath, ['skriptur/build_frettavel.js', '--thurr', '--endurskrifa', '12'], { cwd: ROT, env, encoding: 'utf8', timeout: 110000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /===== PRUFUKEYRSLA/);
  assert.match(r.stdout, /_Bakgrunnur:_ `\{/, 'a.m.k. eitt sýnishorn fær bakgrunn úr raungögnum');
  assert.deepEqual(fingrafar(), fyrir, 'prufuhamur má ekki snerta birt gögn');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test skriptur/build_frettavel_thurr.test.mjs`
Expected: FAIL — stdout inniheldur ekki `PRUFUKEYRSLA` (og keyrslan skrifar skrár → fingrafar breytist). **Eftir þetta skref: `git checkout -- gogn web/public` til að afturkalla skrárnar sem gamla keyrslan skrifaði.**

- [ ] **Step 3a: Fastar** — í `skriptur/build_frettavel.js`, beint á eftir línunni `const MODEL = process.env.KARP_FRETTAVEL_MODEL || 'claude-opus-4-8';`:

```js
// Nýja ritunin (bakgrunnur + ein frétt/kall + talnavörn, 22.9.2026) keyrir AÐEINS á rofa þar til Aron hefur
// samþykkt sýnishorn úr prufukeyrslu. Án rofans er gamla leiðin (aiWrite) nákvæmlega óbreytt.
const THURR = process.argv.includes('--thurr');
const NYTT = THURR || process.env.KARP_FRETTAVEL_NYTT === '1';
const _eI = process.argv.indexOf('--endurskrifa');
const ENDURSKRIFA = _eI > 0 ? Math.max(0, Math.min(40, parseInt(process.argv[_eI + 1], 10) || 0)) : 0;
```

- [ ] **Step 3b: `lyfFyrst`** — í lyf-skynjaranum, beint á eftir línunni `state.lyfSeen = inShort.map((x) => x.slug).slice(0, 4000);`:

```js
    // Hvenær skortur sást FYRST (bakgrunnur fréttar). Fyrsta keyrsla merkir núverandi skort 'ohekkt', annars stæði
    // að skortur á lyfi sem hefur vantað í marga mánuði hefði „hafist" daginn sem þessi kóði fór í loftið.
    const _fyrst = state.lyfFyrst || null, _lf = {};
    for (const x of inShort) _lf[x.slug] = _fyrst ? (_fyrst[x.slug] || TODAY) : 'ohekkt';
    state.lyfFyrst = _lf;
```

- [ ] **Step 3c: kennitala á atburðum** (utan `facts`, svo hún fari hvorki til Claude né í texta):
  - Í gjaldþrotaskynjaranum: skipta `type: 'gjaldthrot', facts:` út fyrir `type: 'gjaldthrot', kt: n.kt, facts:`.
  - Í vörumerkjaskynjaranum: skipta `type: 'vorumerki', facts:` út fyrir `type: 'vorumerki', kt: t.kt, facts:`.

- [ ] **Step 3d: RSS-málsgreinar** — í `rss()`: skipta `<description>${xesc(x.text)} (Vélskrifuð` út fyrir:

```js
    <description>${xesc(String(x.text || '').replace(/\s*\n\s*\n\s*/g, ' '))} (Vélskrifuð
```

- [ ] **Step 3e: hjálparföll** — setja á undan línunni `// ── Aðal ──────`:

```js
// ── Nýja ritunin: gögn bakgrunns, client og prufuhamur ────────
function gognBakgrunns() {
  const ARS = path.join(__dirname, '..', 'web', 'public', 'gogn', 'arsreikningar');
  return {
    felagaskra: J('felagaskra.json'), birgjar: J('birgjar.json'), utbod_urslit: J('utbod_urslit.json'), styrkir: J('styrkir.json'),
    markadir: J('markadir.json'), sedlabanki: J('sedlabanki.json'), atvinnuleysi: J('atvinnuleysi.json'), lyf: J('lyf.json'),
    arsreikningur: (kt) => { if (!/^\d{10}$/.test(String(kt))) return null; try { return JSON.parse(fs.readFileSync(path.join(ARS, kt + '.json'), 'utf8')); } catch (e) { return null; } },
  };
}
function nyrClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try { const p = require('@anthropic-ai/sdk'); const A = p.Anthropic || p.default || p; return new A(); }
  catch (e) { console.log('• @anthropic-ai/sdk ekki til — sniðmátstextar notaðir.'); return null; }
}
// ⚠ Prufuhamur skrifar EKKERT. Hann skrifar fréttir dagsins og N nýlegar úr safninu (áður vs nýtt) og prentar
//   samantekt, líka í $GITHUB_STEP_SUMMARY. Markaðsfréttum eldri en 2 daga er sleppt (verðsagan hefur hreyfst).
async function prufukeyrsla(published, state) {
  const { baetaVidBakgrunni, STUDDAR_TEGUNDIR } = await import('./lib/frettasamhengi.mjs');
  const { skrifaFrettir, samantektMd } = await import('./lib/frettaskrif.mjs');
  const synishorn = [];
  if (ENDURSKRIFA) {
    const markMork = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const hopar = {};
    for (const a of ((J('frettavel_archive.json') || {}).items || [])) {
      if (!a || !a.facts || (!STUDDAR_TEGUNDIR.includes(a.type) && a.type !== 'domur')) continue;
      if (a.type === 'mark' && String(a.date) < markMork) continue;
      (hopar[a.type] = hopar[a.type] || []).push(a);
    }
    const rodir = Object.values(hopar);   // hringferð yfir tegundir svo sýnishornið nái yfir sem flesta hópa
    for (let i = 0; synishorn.length < ENDURSKRIFA && rodir.some((r) => r.length); i++) {
      const r = rodir[i % rodir.length];
      if (!r.length) continue;
      const a = r.shift();
      const f = JSON.parse(JSON.stringify(a.facts)); delete f.bakgrunnur;
      synishorn.push({ id: 'prufa-' + a.id, type: a.type, facts: f, title: a.title, text: a.text, gamall: { title: a.title, text: a.text } });
    }
    baetaVidBakgrunni(synishorn, gognBakgrunns(), { idag: TODAY, state });
  }
  const allt = published.concat(synishorn);
  const client = nyrClient();
  const t = client ? await skrifaFrettir(allt, { client, model: process.env.KARP_FRETTAVEL_MODEL || undefined }) : null;
  const md = samantektMd(allt, { titill: 'Prufukeyrsla fréttavélar ' + TODAY + (client ? '' : ' (enginn lykill: aðeins bakgrunnur)') })
    + (t ? '\n\nTölfræði: ' + JSON.stringify(t) : '');
  console.log('\n===== PRUFUKEYRSLA — ekkert skrifað =====\n' + md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
```

- [ ] **Step 3f: `main()`** — (1) skipta línunni `  fs.writeFileSync(G('frettavel_state.json'), JSON.stringify(state));` út fyrir:

```js
  if (NYTT) {
    const { baetaVidBakgrunni } = await import('./lib/frettasamhengi.mjs');
    console.log('Bakgrunnur bættur við', baetaVidBakgrunni(events, gognBakgrunns(), { idag: TODAY, state }), 'atburði');
  }
  if (!THURR) fs.writeFileSync(G('frettavel_state.json'), JSON.stringify(state));
```

(2) beint á eftir línunni sem byrjar á `  console.log('Atburðir fundnir:'`:

```js
  if (THURR) { await prufukeyrsla(published, state); return; }
```

(3) skipta þessum tveimur línum:

```js
  const aiN = await aiWrite(published);
  console.log('AI-skrifaðar:', aiN, 'af', Math.min(published.length, 16), process.env.ANTHROPIC_API_KEY ? '' : '(enginn lykill — sniðmát)');
```

út fyrir:

```js
  if (NYTT) {
    const { skrifaFrettir } = await import('./lib/frettaskrif.mjs');
    const client = nyrClient();
    const t = client ? await skrifaFrettir(published, { client, model: process.env.KARP_FRETTAVEL_MODEL || undefined }) : null;
    console.log('Ný ritun:', t ? JSON.stringify(t) : '(enginn lykill — sniðmát)');
  } else {
    const aiN = await aiWrite(published);
    console.log('AI-skrifaðar:', aiN, 'af', Math.min(published.length, 16), process.env.ANTHROPIC_API_KEY ? '' : '(enginn lykill — sniðmát)');
  }
```

- [ ] **Step 3g: vinnuflæði** — `.github/workflows/frettavel_prufa.yml`:

```yaml
# Prufukeyrsla nýju fréttaritunarinnar (bakgrunnur + talnavörn) með alvöru lykli. Skrifar EKKERT og commit-ar
# ekkert: sýnishornin birtast í samantekt keyrslunnar og í logginum. Handræst eingöngu.
name: frettavel-prufa
on:
  workflow_dispatch:
    inputs:
      endurskrifa:
        description: 'Fjöldi nýlegra frétta úr safninu til að endurskrifa sem sýnishorn'
        default: '12'
permissions:
  contents: read
jobs:
  prufa:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - run: npm ci
      - name: Prufukeyrsla fréttavélar (skrifar ekkert)
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ENDURSKRIFA: ${{ inputs.endurskrifa }}
        run: node skriptur/build_frettavel.js --thurr --endurskrifa "$ENDURSKRIFA"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test skriptur/build_frettavel_thurr.test.mjs && git status --short gogn web/public`
Expected: `ℹ pass 1`; `git status` sýnir ENGAR breytingar í `gogn/` eða `web/public/`.
Run: `node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs`
Expected: `ℹ fail 0`
Run: `node --check skriptur/build_frettavel.js && node skriptur/build_frettavel.js --thurr --endurskrifa 4 | head -40`
Expected: prentar `===== PRUFUKEYRSLA — ekkert skrifað =====` og sýnishorn með `_Bakgrunnur:_`.

- [ ] **Step 5: Commit**

```bash
git add skriptur/build_frettavel.js skriptur/build_frettavel_thurr.test.mjs .github/workflows/frettavel_prufa.yml
git commit -m "Fréttavél: nýja ritunin á rofa, prufuhamur sem skrifar ekkert og handræst prufuvinnuflæði

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Birting málsgreina + flatur CSV-útflutningur

**Files:**
- Modify: `web/src/lib/frettavel.mjs` (bæta við `malsgreinar`)
- Create: `web/src/lib/frettavel-malsgreinar.test.mjs`
- Modify: `web/src/pages/frettavel/[id].astro:7` (innflutningur), `:35` (desc), `:65` (meginmál)
- Modify: `web/src/pages/frettavel.astro:10` (innflutningur), `:40` (aðalfrétt), `:68` (kort)
- Modify: `web/src/lib/frettavel-export.mjs` (`exportCsv` flatar hreiðruð `facts`)
- Test: `web/src/lib/frettavel-export.test.mjs`

**Interfaces:**
- Produces: `malsgreinar(texti: string) → string[]`.

- [ ] **Step 1: Write the failing tests** — `web/src/lib/frettavel-malsgreinar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { malsgreinar } from './frettavel.mjs';

test('skipt á auðum línum; eldri texti án þeirra er ein málsgrein', () => {
  assert.deepEqual(malsgreinar('Fyrsta.\n\nÖnnur,\nsama málsgrein.\n\n\nÞriðja.'), ['Fyrsta.', 'Önnur, sama málsgrein.', 'Þriðja.']);
  assert.deepEqual(malsgreinar('Gamall texti í einni línu.'), ['Gamall texti í einni línu.']);
  assert.deepEqual(malsgreinar(''), []);
  assert.deepEqual(malsgreinar(null), []);
});
```

og bæta aftast í `web/src/lib/frettavel-export.test.mjs`:

```js
test('CSV flatar hreiðruð facts (bakgrunnur, RÁS) í stað „[object Object]"', async () => {
  const { exportCsv } = await import('./frettavel-export.mjs');
  const csv = exportCsv({ id: 'x', type: 'urslit', title: 'T', date: '2026-09-22', url: '/utbod/',
    facts: { sigurvegarar: ['Dagar hf.', 'Annað ehf.'], bakgrunnur: { sigurvegari: { utbod_unnin: { fjoldi: 2 } } } } });
  assert.ok(!csv.includes('[object Object]'));
  assert.match(csv, /bakgrunnur\.sigurvegari\.utbod_unnin\.fjoldi;2/);
  assert.match(csv, /sigurvegarar;Dagar hf\.,Annað ehf\./, 'fylki af gildum óbreytt');
});
```

(ef `frettavel-export.test.mjs` flytur ekki inn `test`/`assert` efst, eru þau þegar innflutt þar — athuga fyrst með `head -5`.)

- [ ] **Step 2: Run tests to verify they fail**

Run (úr `web/`): `node --test src/lib/frettavel-malsgreinar.test.mjs src/lib/frettavel-export.test.mjs`
Expected: FAIL — `malsgreinar` ekki útflutt; CSV inniheldur `[object Object]`.

- [ ] **Step 3: Implement**
  - `web/src/lib/frettavel.mjs` — bæta aftast:

```js
/** Málsgreinar vélskrifaðrar fréttar (auð lína skilur á milli). Eldri textar án auðra lína = ein málsgrein. */
export const malsgreinar = (t) => String(t || '').split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
```

  - `web/src/lib/frettavel-export.mjs` — í `exportCsv`, skipta línunni
    `if (j.facts) for (const [k, v] of Object.entries(j.facts)) lines.push(esc(k) + ';' + cell(v));`
    út fyrir:

```js
  // Hreiðruð facts (bakgrunnur, RÁS, listar af hlutum) flöt í punkta-lykla; fylki af gildum eins og áður.
  const flata = (o, fs = '', ut = []) => {
    for (const [k, v] of Object.entries(o)) {
      const lk = fs ? fs + '.' + k : k;
      if (Array.isArray(v) && !v.some((x) => x && typeof x === 'object')) ut.push([lk, String(v)]);
      else if (v && typeof v === 'object') flata(v, lk, ut);
      else ut.push([lk, v]);
    }
    return ut;
  };
  if (j.facts) for (const [k, v] of flata(j.facts)) lines.push(esc(k) + ';' + cell(v));
```

  - `web/src/pages/frettavel/[id].astro`: lína 7 — bæta `malsgreinar` í innflutninginn:
    `import { catOf, asciiId, imgFor, artHref, dIS, spark, malsgreinar } from '../../lib/frettavel.mjs';`
    lína ~35: `const desc = String(it.text || '').slice(0, 200);` → `const desc = (malsgreinar(it.text)[0] || '').slice(0, 200);`
    lína ~65: `<p class="fv-body">{it.text}</p>` → `{malsgreinar(it.text).map((m) => <p class="fv-body">{m}</p>)}`
  - `web/src/pages/frettavel.astro`: lína 10 — bæta `malsgreinar` í innflutninginn frá `'../lib/frettavel.mjs'`;
    lína ~40: `<p>{hero.text}</p>` → `{malsgreinar(hero.text).slice(0, 2).map((m) => <p>{m}</p>)}`;
    lína ~68: `<p>{it.text}</p>` → `<p>{malsgreinar(it.text)[0] || ''}</p>`.

- [ ] **Step 4: Run tests and build to verify**

Run (úr `web/`): `node --test src/lib/frettavel-malsgreinar.test.mjs src/lib/frettavel-export.test.mjs && npm test`
Expected: `ℹ fail 0`
Run (úr `web/`): `npx astro build 2>&1 | tail -3 && git checkout -- .astro/`
Expected: `Complete!` og ~4.300 síður.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/frettavel.mjs web/src/lib/frettavel-malsgreinar.test.mjs web/src/lib/frettavel-export.mjs web/src/lib/frettavel-export.test.mjs "web/src/pages/frettavel/[id].astro" web/src/pages/frettavel.astro
git commit -m "Fréttavél: málsgreinar á fréttasíðu, forsíðu og RSS; CSV flatar hreiðruð facts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Heildarprófun, yfirferð, deploy, prufukeyrsla í CI

**Files:** engar nýjar.

- [ ] **Step 1: Full test suite** — úr rót: `node --test skriptur/*.test.mjs skriptur/lib/*.test.mjs` og `node skriptur/ci_worker_bindings.mjs`; úr `web/`: `npm test`. Expected: `ℹ fail 0`, `ℹ cancelled 0`, „Öll nöfn leyst".
- [ ] **Step 2: Stökkbreytipróf** — fyrir hverja: breyta, keyra viðkomandi próf, staðfesta fall, afturkalla:
  - `talnavorn.mjs`: `tol = t.nakvaemni / 2 + 1e-9` → `tol = Infinity` (allt stenst) → talnavarnarpróf verða að falla.
  - `frettaskrif.mjs`: fjarlægja endurskrifið (`if (!ut || !vorn.ok) { ... }` → `if (false) { ... }`) → endurskrifspróf verður að falla.
  - `frettasamhengi.mjs`: `for (let i = 1; i < rod.length - 1; i++)` → `i < rod.length` (tekur dag með) → markaðspróf verður að falla.
  - `frettasamhengi.mjs`: `if (!erLogadili(kt)) return null;` → fjarlægja → einstaklingspróf verður að falla.
  - `build_frettavel.js`: `if (!THURR) fs.writeFileSync(G('frettavel_state.json')...` → án `if (!THURR)` → `build_frettavel_thurr.test.mjs` verður að falla (og `git checkout -- gogn web/public` á eftir).
- [ ] **Step 3: Heildaryfirferð á greininni** (óháður rýnir) gegn forskriftinni; laga það sem finnst.
- [ ] **Step 4: Deploy** — `git fetch origin && git rebase origin/main && git push origin hjalp-agent:main`; fylgjast með CI og Workers Build (karp21) á commit-inu (fullt SHA í `gh run list --commit`).
- [ ] **Step 5: Prufukeyrsla í CI** — `gh workflow run frettavel_prufa.yml --repo aronheidar/KARP-2.0 -f endurskrifa=12`; bíða; lesa loggann (`gh run view <id> --log`), draga út `===== PRUFUKEYRSLA` hlutann og sýna Aroni sýnishorn (áður vs nýtt) ásamt tölfræði (`skrifadar`, `endurskrifadar`, `hafnad`).
- [ ] **Step 6:** Rofinn fer EKKI í `refresh-data.yml` fyrr en Aron hefur samþykkt. Eftir samþykki: bæta `KARP_FRETTAVEL_NYTT: '1'` í `env` fréttavélarskrefsins í `refresh-data.yml` (sér commit).
