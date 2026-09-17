# Verðmatsgluggi fyrir allt.is — útfærsluáætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rammi á `karp.is/embed/verdmat/` sem Allt fasteignasala límir inn á sinn vef, tekur heimilisfang og skilar verðbili, í þeirra þema og læstur við þeirra lén.

**Architecture:** Astro-síða þjónuð af karp21. Verðmatsvélin (`lib/fasteignamat.mjs`) er notuð óbreytt. Ný hrein eining reiknar bilið úr punktmati og er eina leiðin að því. Worker setur ramma-hausana og telur notkun í D1.

**Tech Stack:** Astro, Cloudflare Workers, D1 (`TENGSL`), `node --test`.

Spekk: `docs/superpowers/specs/2026-09-17-allt-verdmatsgluggi-design.md`

## Global Constraints

- **Bilið er punktmat ± 10%.** ALDREI `lo`/`hi` úr `metaUrSolusogu` — það er fjórðungsbil sambærilegra eigna og raunverð lendir innan þess í aðeins 35,4% tilvika.
- **Orðalagið er orðrétt: „Rétt í fjórum af hverjum fimm tilvikum."** ±10% hittir 79,3% á Reykjanesi. Bilið má aldrei birtast án þessarar setningar.
- **Ekkert punktmat birtist.** Hvergi í viðmótinu.
- **Ekkert persónugreinanlegt er geymt.** Hvorki heimilisfang né fyrirspurn. Aðeins teljari.
- **`hnit` VERÐA að fylgja hverju kalli í `metaUrSolusogu`**, annars er radíus-sían óvirk í þögn.
- **Lyklar hnitaskrárinnar eru LÁGSTAFA.**
- Þema Allt: Raleway 16px · bakgrunnur `#f8fbfc` · dökkt `#0b1f28` · áhersla `#226079` · brauðtexti `#67777e`.
- Neðst í glugganum stendur **Powered by Karp.is**.
- Ein notkun telst **hvert skipti sem verðbil er BIRT**. Ekki misheppnuð uppfletting, ekki hætt við.
- Öll rökvísi fer í prófaða einingu í `web/src/lib/`, aldrei inn í `.astro`-skrána.

## File Structure

| skrá | ábyrgð |
|---|---|
| `web/src/lib/verdbil.mjs` (nýtt) | punktmat → verðbil + orðalag. Eina leiðin að bilinu. |
| `web/test/verdbil.test.mjs` (nýtt) | próf fyrir ofangreint |
| `web/migrations/0017_embed_notkun.sql` (nýtt) | teljaratafla |
| `web/src/worker/embed.mjs` (nýtt) | talningar-endapunktur + ramma-hausar |
| `web/src/worker/embed.test.mjs` (nýtt) | próf fyrir ofangreint |
| `web/worker.js` (breytt) | leiðaval á embed-handler |
| `web/wrangler.toml` (breytt) | `run_worker_first` fær `/embed/*` |
| `web/src/lib/verdmat-gluggi.mjs` (nýtt) | þáttun heimilisfangs, val á forsendum, forsendutexti |
| `web/test/verdmat-gluggi.test.mjs` (nýtt) | próf fyrir ofangreint |
| `web/src/pages/embed/verdmat.astro` (nýtt) | glugginn sjálfur — AÐEINS DOM-tenging, engin rökvísi |

---

### Task 1: Verðbilið sem hrein eining

Kjarninn. Einingin skilar **engri miðgildistölu**, svo viðmótið geti ekki sýnt punktmat þótt einhver vilji það síðar. Talan er einfaldlega ekki til í svarinu.

**Files:**
- Create: `web/src/lib/verdbil.mjs`
- Test: `web/test/verdbil.test.mjs`

**Interfaces:**
- Consumes: ekkert (hrein eining)
- Produces: `BIL_HLUTFALL: number`, `BIL_ORDALAG: string`, `verdbil(ppm: number, fm: number) -> { lagt: number, hatt: number, ordalag: string } | null`

- [ ] **Step 1: Write the failing test**

Búðu til `web/test/verdbil.test.mjs`:

```js
// Verðbil gluggans á allt.is. ⚠⚠ Bilið er punktmat ± 10%, ALDREI lo/hi úr metaUrSolusogu.
// Það er fjórðungsbil SAMBÆRILEGRA eigna og raunverð lendir innan þess í aðeins 35,4% tilvika
// (mælt 17.9.2026). ±10% hittir 79,3% á Reykjanesi, og þá fullyrðingu má segja upphátt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIL_HLUTFALL, BIL_ORDALAG, verdbil } from '../src/lib/verdbil.mjs';

test('bilið er punktmat ± 10%', () => {
  const r = verdbil(600000, 100);            // 60.000.000 kr
  assert.equal(r.lagt, 54000000);
  assert.equal(r.hatt, 66000000);
  assert.equal(BIL_HLUTFALL, 0.10);
});

test('⚠ ENGIN miðgildistala í svarinu — viðmótið á ekki að GETA sýnt punktmat', () => {
  const r = verdbil(600000, 100);
  assert.deepEqual(Object.keys(r).sort(), ['hatt', 'lagt', 'ordalag']);
});

test('orðalagið fylgir ALLTAF bilinu og er orðrétt', () => {
  assert.equal(verdbil(600000, 100).ordalag, BIL_ORDALAG);
  assert.equal(BIL_ORDALAG, 'Rétt í fjórum af hverjum fimm tilvikum.');
});

test('námundað í heilar krónur', () => {
  const r = verdbil(123457, 87.3);
  assert.equal(r.lagt, Math.round(123457 * 87.3 * 0.9));
  assert.equal(Number.isInteger(r.lagt), true);
  assert.equal(Number.isInteger(r.hatt), true);
});

test('rusl skilar null, ekki tölu', () => {
  for (const [p, f] of [[0, 100], [600000, 0], [null, 100], [600000, null], ['x', 'y'], [-1, 100], [NaN, 100]]) {
    assert.equal(verdbil(p, f), null, JSON.stringify([p, f]) + ' á að skila null');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test test/verdbil.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/verdbil.mjs'`

- [ ] **Step 3: Write minimal implementation**

Búðu til `web/src/lib/verdbil.mjs`:

```js
// verdbil.mjs — verðbil fyrir allt.is-gluggann. Engin I/O.
//
// ⚠⚠ ÞETTA ER EINA LEIÐIN AÐ BILINU. Freistingin er að nota `lo`/`hi` úr metaUrSolusogu því þau
// líta út eins og bil. Þau eru það ekki. Þau eru fjórðungsbil SAMBÆRILEGRA eigna, 8,2% breitt að
// miðgildi, og raunverulegt söluverð lendir innan þeirra í aðeins 35,4% tilvika (mælt 17.9.2026).
// Bil sem er rangt tvisvar af hverjum þremur má ekki standa á vef fasteignasala.
//
// Bilið hér er punktmat ± 10%, kvarðað úr bakprófi á Reykjanesi (580 sölur, miðgildisskekkja 4,8%).
// ±10% hittir 79,3%, og þess vegna má orðalagið segja „fjórum af hverjum fimm".
//
// ⚠ Fallið skilar ENGRI miðgildistölu. Það er viljandi. Aron valdi bil en ekkert punktmat, því ein
// ákveðin tala á vef fasteignasala festir væntingar seljanda og svo þarf fasteignasalinn að rífast
// við okkar tölu. Ef talan er ekki í svarinu getur viðmótið ekki sýnt hana fyrir slysni síðar.

export const BIL_HLUTFALL = 0.10;
export const BIL_ORDALAG = 'Rétt í fjórum af hverjum fimm tilvikum.';

/**
 * @param {number} ppm  áætlað verð á fermetra (úr metaUrSolusogu `.m`)
 * @param {number} fm   stærð eignarinnar
 * @returns {{lagt:number, hatt:number, ordalag:string}|null}
 */
export function verdbil(ppm, fm) {
  const p = Number(ppm), f = Number(fm);
  if (!Number.isFinite(p) || !Number.isFinite(f) || p <= 0 || f <= 0) return null;
  const heild = p * f;
  return {
    lagt: Math.round(heild * (1 - BIL_HLUTFALL)),
    hatt: Math.round(heild * (1 + BIL_HLUTFALL)),
    ordalag: BIL_ORDALAG,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test test/verdbil.test.mjs`
Expected: PASS — `# pass 5`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/verdbil.mjs web/test/verdbil.test.mjs
git commit -m "Verdbil allt.is-gluggans: punktmat +-10%, engin midgildistala i svarinu"
```

---

### Task 2: Talningin

Fast mánaðargjald þarf samt tölu, annars er ekkert hægt að semja um endurnýjun. ⚠ Ekkert persónugreinanlegt geymt.

**Files:**
- Create: `web/migrations/0017_embed_notkun.sql`
- Create: `web/src/worker/embed.mjs`
- Create: `web/src/worker/embed.test.mjs`
- Modify: `web/worker.js` (leiðaval)

**Interfaces:**
- Consumes: ekkert úr fyrri verkum
- Produces: `embedTalningHandler(request, env) -> Response`, `EMBED_LEN: string[]`

- [ ] **Step 1: Write the failing test**

Búðu til `web/src/worker/embed.test.mjs`:

```js
// ⚠⚠ Teljarinn má ALDREI geyma heimilisfang. Manneskja sem flettir upp sínu eigin húsi á
// fasteignasöluvef er að gefa sterkt til kynna að hún sé að íhuga sölu. Sá listi verður ekki til.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMBED_LEN, embedTalningHandler } from './embed.mjs';

function fakeDb(state) {
  return {
    prepare(sql) {
      let a = [];
      const st = {
        bind(...x) { a = x; return st; },
        async run() { state.sql.push([sql, a]); return { meta: {} }; },
      };
      return st;
    },
  };
}
const mkEnv = (state) => ({ TENGSL: fakeDb(state) });
const mkState = () => ({ sql: [] });
const post = (uppspretta) => new Request('https://karp.is/api/embed/talning?u=' + uppspretta, { method: 'POST' });

test('talning skrifar eina færslu á dag og uppsprettu', async () => {
  const s = mkState();
  const r = await embedTalningHandler(post('allt'), mkEnv(s));
  assert.equal(r.status, 200);
  assert.equal(s.sql.length, 1);
  assert.match(s.sql[0][0], /INSERT INTO embed_notkun/);
  assert.match(s.sql[0][0], /ON CONFLICT/);
  assert.equal(s.sql[0][1][1], 'allt');
});

test('⚠ ekkert persónugreinanlegt fer í SQL — engin heimilisföng, engar fyrirspurnir', async () => {
  const s = mkState();
  await embedTalningHandler(new Request('https://karp.is/api/embed/talning?u=allt&a=Heidarbraut%2012', { method: 'POST' }), mkEnv(s));
  const allt = JSON.stringify(s.sql);
  assert.equal(/Heidarbraut|Heiðarbraut/i.test(allt), false, 'heimilisfang má ALDREI rata í teljarann');
});

test('óþekkt uppspretta er hafnað — teljarinn er ekki opinn öllum', async () => {
  const s = mkState();
  const r = await embedTalningHandler(post('einhver-annar'), mkEnv(s));
  assert.equal(r.status, 400);
  assert.equal(s.sql.length, 0);
});

test('aðeins POST', async () => {
  const s = mkState();
  const r = await embedTalningHandler(new Request('https://karp.is/api/embed/talning?u=allt'), mkEnv(s));
  assert.equal(r.status, 405);
  assert.equal(s.sql.length, 0);
});

test('D1 niðri fellir ekki gluggann — talning er aukaatriði, matið er aðalatriði', async () => {
  const env = { TENGSL: { prepare() { throw new Error('D1 niðri'); } } };
  const r = await embedTalningHandler(post('allt'), env);
  assert.equal(r.status, 200);
});

test('uppsprettulistinn er lokaður listi', () => {
  assert.deepEqual(EMBED_LEN, ['allt']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test src/worker/embed.test.mjs`
Expected: FAIL — `Cannot find module './embed.mjs'`

- [ ] **Step 3: Write the migration and the handler**

Búðu til `web/migrations/0017_embed_notkun.sql`:

```sql
-- Teljari fyrir innfellda glugga (allt.is o.fl.). Fast mánaðargjald þarf samt tölu.
-- ⚠⚠ ENGIN persónugreinanleg gögn. Ekki heimilisfang, ekki fyrirspurn, ekki IP. Aðeins talning.
CREATE TABLE IF NOT EXISTS embed_notkun (
  dagur       TEXT NOT NULL,          -- YYYY-MM-DD (UTC)
  uppspretta  TEXT NOT NULL,          -- lokaður listi, sjá EMBED_LEN í src/worker/embed.mjs
  fjoldi      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dagur, uppspretta)
);
```

Búðu til `web/src/worker/embed.mjs`:

```js
// embed.mjs — innfelldir gluggar á vefjum samstarfsaðila (allt.is fyrst).
//
// ⚠⚠ TELJARINN GEYMIR EKKERT PERSÓNUGREINANLEGT. Heimilisfang er persónugreinanlegt, og manneskja
// sem flettir upp sínu eigin húsi á fasteignasöluvef er að gefa sterkt til kynna að hún sé að íhuga
// sölu. Sá listi fer hvorki til samstarfsaðilans né í okkar geymslu. Karp selur áreiðanleikakannanir
// og má ekki vera fyrirtækið sem lekur uppflettingum.
//
// Ein notkun telst hvert skipti sem verðbil er BIRT. Ekki misheppnuð uppfletting, ekki hætt við.

/** Lokaður listi. Nýr samstarfsaðili kemur inn hér, hvergi annars staðar. */
export const EMBED_LEN = ['allt'];

/** Lén sem mega ramma inn gluggann. Lykill = uppspretta úr EMBED_LEN. */
export const EMBED_RAMMAR = { allt: ['https://allt.is', 'https://www.allt.is'] };

const svar = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function embedTalningHandler(request, env) {
  if (request.method !== 'POST') return svar(405, { error: 'method' });
  const u = new URL(request.url).searchParams.get('u') || '';
  if (!EMBED_LEN.includes(u)) return svar(400, { error: 'uppspretta' });
  const dagur = new Date().toISOString().slice(0, 10);
  try {
    // ⚠ Aðeins dagur og uppspretta fara inn. Ekkert annað úr beiðninni snertir gagnagrunninn.
    await env.TENGSL.prepare(
      'INSERT INTO embed_notkun (dagur, uppspretta, fjoldi) VALUES (?,?,1) '
      + 'ON CONFLICT(dagur, uppspretta) DO UPDATE SET fjoldi = fjoldi + 1',
    ).bind(dagur, u).run();
  } catch (e) {
    // ⚠ Talning má ALDREI fella gluggann. Matið er aðalatriðið, talningin er reikningsgerð.
  }
  return svar(200, { ok: true });
}
```

- [ ] **Step 4: Wire the route in worker.js**

Í `web/worker.js`, bættu `embedTalningHandler` við innflutningslistann efst (við hlið hinna `src/worker/`-innflutninga):

```js
import { EMBED_RAMMAR, embedTalningHandler } from './src/worker/embed.mjs';   // innfelldir gluggar samstarfsaðila
```

Og bættu leiðinni við hjá hinum `/api/`-leiðunum (við hlið `if (url.pathname === '/api/tengslanet')`):

```js
    if (url.pathname === '/api/embed/talning') return embedTalningHandler(request, env);
```

- [ ] **Step 5: Run tests and bindings check**

Run: `cd web && node --test src/worker/embed.test.mjs && node --check worker.js && cd .. && node skriptur/ci_worker_bindings.mjs`
Expected: `# pass 6`, `# fail 0`, svo `✅ Öll nöfn leyst — engin laus tenging.`

- [ ] **Step 6: Apply the migration**

Run: `cd web && npx wrangler d1 execute tengsl --remote --file=migrations/0017_embed_notkun.sql`
Expected: `Executed 1 command`

- [ ] **Step 7: Commit**

```bash
git add web/migrations/0017_embed_notkun.sql web/src/worker/embed.mjs web/src/worker/embed.test.mjs web/worker.js
git commit -m "Talning innfelldra glugga: dagur og uppspretta, ekkert personugreinanlegt"
```

---

### Task 3: Rammalásinn

⚠⚠ `web/public/_headers` ber `X-Frame-Options: SAMEORIGIN` og `frame-ancestors 'self'`. Hvort tveggja lokar glugganum úti hjá Allt, og `X-Frame-Options` er harðari en CSP. Worker verður að setja hausana fyrir þessa leið eina, því `_headers` gildir á kyrrstæðar eignir.

**Files:**
- Modify: `web/wrangler.toml` (`run_worker_first`)
- Modify: `web/src/worker/embed.mjs` (hausa-fall)
- Modify: `web/src/worker/embed.test.mjs` (próf)
- Modify: `web/worker.js` (leiðaval)

**Interfaces:**
- Consumes: `EMBED_RAMMAR` úr Task 2
- Produces: `embedSidaHandler(request, env) -> Response|null`

- [ ] **Step 1: Write the failing test**

Bættu aftast í `web/src/worker/embed.test.mjs`:

```js
import { embedSidaHandler } from './embed.mjs';

const mkAssets = () => ({ fetch: async () => new Response('<html>gluggi</html>', { headers: { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN' } }) });

test('⚠⚠ X-Frame-Options er FJARLÆGT — annars opnast glugginn aldrei hjá Allt', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/embed/verdmat/'), { ASSETS: mkAssets() });
  assert.equal(r.headers.get('x-frame-options'), null);
});

test('frame-ancestors hleypir Allt inn og engum öðrum', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/embed/verdmat/'), { ASSETS: mkAssets() });
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors/);
  assert.match(csp, /https:\/\/allt\.is/);
  assert.match(csp, /https:\/\/www\.allt\.is/);
  assert.equal(/frame-ancestors[^;]*\*/.test(csp), false, 'aldrei stjörnumerki í frame-ancestors');
});

test('aðrar leiðir fara ÓSNERTAR áfram — undantekningin nær aðeins til /embed/', async () => {
  const r = await embedSidaHandler(new Request('https://karp.is/fasteignavakt/'), { ASSETS: mkAssets() });
  assert.equal(r, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test src/worker/embed.test.mjs`
Expected: FAIL — `embedSidaHandler is not a function`

- [ ] **Step 3: Implement the handler**

Bættu aftast í `web/src/worker/embed.mjs`:

```js
/**
 * Ber fram innfelldu síðuna með RÉTTUM ramma-hausum.
 *
 * ⚠⚠ `web/public/_headers` setur `X-Frame-Options: SAMEORIGIN` og `frame-ancestors 'self'` á allt.
 * Hvort tveggja lokar glugganum úti hjá samstarfsaðilanum, og X-Frame-Options er HARÐARI en CSP —
 * enginn CSP-haus vinnur hana upp í eldri vöfrum. Hún verður að hverfa fyrir ÞESSA leið eina.
 *
 * ⚠ Undantekningin nær aðeins til /embed/. Aldrei víðar. Skilar null fyrir aðrar leiðir svo
 * venjulega leiðavalið taki við óbreytt.
 *
 * @returns {Promise<Response|null>}
 */
export async function embedSidaHandler(request, env) {
  const slod = new URL(request.url).pathname;
  if (!slod.startsWith('/embed/')) return null;
  const upp = await env.ASSETS.fetch(request);
  const h = new Headers(upp.headers);
  h.delete('x-frame-options');
  const len = [...new Set(Object.values(EMBED_RAMMAR).flat())].join(' ');
  h.set('content-security-policy', "frame-ancestors 'self' " + len);
  return new Response(upp.body, { status: upp.status, headers: h });
}
```

- [ ] **Step 4: Let the worker run first for /embed/**

Í `web/wrangler.toml`, breyttu `run_worker_first`-línunni í:

```toml
run_worker_first = ["/gogn/eigendur/*", "/gogn/arsreikningar/*", "/gogn/stjorn/*", "/embed/*"]
```

Í `web/worker.js`, bættu þessu við rétt á undan `return env.ASSETS.fetch(request);` neðst í fetch-handlernum:

```js
    // Innfelldir gluggar: worker ber þá fram svo hann nái að fjarlægja X-Frame-Options (sjá embed.mjs).
    { const r = await embedSidaHandler(request, env); if (r) return r; }
```

- [ ] **Step 5: Run tests**

Run: `cd web && node --test src/worker/embed.test.mjs && node --check worker.js && cd .. && node skriptur/ci_worker_bindings.mjs`
Expected: `# pass 9`, `# fail 0`, `✅ Öll nöfn leyst`

- [ ] **Step 6: Commit**

```bash
git add web/wrangler.toml web/src/worker/embed.mjs web/src/worker/embed.test.mjs web/worker.js
git commit -m "Rammalas: X-Frame-Options fjarlaegt a /embed/ einni, frame-ancestors laest a allt.is"
```

---

### Task 4: Rökvísi gluggans sem hrein eining

⚠ Spekkin krefst fjögurra prófa. Eitt er í Task 1. Hin þrjú eiga heima hér, því annars enda þau inni í `.astro`-skránni þar sem ekkert próf nær til þeirra.

**Files:**
- Create: `web/src/lib/verdmat-gluggi.mjs`
- Test: `web/test/verdmat-gluggi.test.mjs`

**Interfaces:**
- Consumes: ekkert
- Produces: `thattaFang(s) -> { fang: string, pn: string|null }`, `veljaForsendur(eign, innslattur) -> { teg, fm, ar, fraNotanda } | null`, `grunnurTexti(r, pn, fraNotanda) -> string`, `hnitAfFangi(hnit, fang) -> [number,number]|null`

- [ ] **Step 1: Write the failing test**

Búðu til `web/test/verdmat-gluggi.test.mjs`:

```js
// Rökvísi verðmatsgluggans. Hún má ekki liggja í .astro-skránni, þar nær ekkert próf til hennar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grunnurTexti, hnitAfFangi, thattaFang, veljaForsendur } from '../src/lib/verdmat-gluggi.mjs';

test('þáttar heimilisfang með póstnúmeri', () => {
  assert.deepEqual(thattaFang('Heiðarbraut 12, 230'), { fang: 'heiðarbraut 12', pn: '230' });
  assert.deepEqual(thattaFang('  Heiðarbraut 12   230 '), { fang: 'heiðarbraut 12', pn: '230' });
});

test('án póstnúmers skilar pn null en fellur ekki', () => {
  assert.deepEqual(thattaFang('Heiðarbraut 12'), { fang: 'heiðarbraut 12', pn: null });
  assert.deepEqual(thattaFang(''), { fang: '', pn: null });
  assert.deepEqual(thattaFang(null), { fang: '', pn: null });
});

test('ÞEKKT eign — forsendur koma úr skránni, ekki frá notanda', () => {
  const r = veljaForsendur({ teg: 'Fjölbýli', fm: 96.4, ar: 1998 }, null);
  assert.deepEqual(r, { teg: 'Fjölbýli', fm: 96.4, ar: 1998, fraNotanda: false });
});

test('ÓÞEKKT eign með innslætti notanda skilar forsendum og MERKIR þær', () => {
  const r = veljaForsendur(null, { teg: 'Raðhús', fm: '142', ar: '2004' });
  assert.deepEqual(r, { teg: 'Raðhús', fm: 142, ar: 2004, fraNotanda: true });
});

test('óþekkt eign ÁN innsláttar skilar null, ekki villu', () => {
  assert.equal(veljaForsendur(null, null), null);
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '', ar: '' }), null);
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '4', ar: '2000' }), null, 'fm undir 15 er ekki eign');
});

test('skráð eign án nothæfrar stærðar fellur í notanda-innslátt', () => {
  assert.equal(veljaForsendur({ teg: 'Fjölbýli', fm: 0, ar: 1998 }, null), null);
});

test('byggingarár má vanta — það þrengir bara valið', () => {
  assert.equal(veljaForsendur(null, { teg: 'Fjölbýli', fm: '80', ar: '' }).ar, null);
});

test('forsendutextinn segir SATT um hvaðan stærðin kom', () => {
  const r = { n: 17, arSia: true, radiusKm: 1 };
  assert.match(grunnurTexti(r, '230', true), /sem þú slóst inn/);
  assert.equal(/sem þú slóst inn/.test(grunnurTexti(r, '230', false)), false);
});

test('forsendutextinn nefnir fjölda, póstnúmer og virkar síur', () => {
  const t = grunnurTexti({ n: 17, arSia: true, radiusKm: 1 }, '230', false);
  assert.match(t, /17 sambærilegar/);
  assert.match(t, /230/);
  assert.match(t, /±15 ár/);
  assert.match(t, /1 km/);
});

test('síur sem voru EKKI virkar eru ekki nefndar', () => {
  const t = grunnurTexti({ n: 8, arSia: false, radiusKm: null }, '260', false);
  assert.equal(/±15 ár/.test(t), false);
  assert.equal(/km/.test(t), false);
});

test('⚠ hnit finnast á LÁGSTAFA lykli og eru skilað sem [lat, lon]', () => {
  const hnit = { 'heiðarbraut 12': [63.99, -22.56, 'hverfi', 1, 2, 3] };
  assert.deepEqual(hnitAfFangi(hnit, 'Heiðarbraut 12'), [63.99, -22.56]);
  assert.equal(hnitAfFangi(hnit, 'engin gata 1'), null);
  assert.equal(hnitAfFangi(null, 'heiðarbraut 12'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test test/verdmat-gluggi.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/verdmat-gluggi.mjs'`

- [ ] **Step 3: Write the implementation**

Búðu til `web/src/lib/verdmat-gluggi.mjs`:

```js
// verdmat-gluggi.mjs — rökvísi verðmatsgluggans á allt.is. Engin I/O, ekkert DOM.
//
// Hér liggur allt sem hægt er að hafa rangt fyrir sér um. Skráin embed/verdmat.astro tengir aðeins
// DOM við þessi föll og tekur engar ákvarðanir sjálf.
//
// ⚠ 47% eigna á Reykjanesi eru ekki í kaupskránni (mælt 17.9.2026). Þá kemur stærðin frá notandanum
// og það VERÐUR að standa undir niðurstöðunni, svo enginn haldi að við höfum flett henni upp.

const nlyk = (s) => String(s == null ? '' : s).trim().toLowerCase();

/** „Heiðarbraut 12, 230" -> { fang:'heiðarbraut 12', pn:'230' }. Kommað er valfrjálst. */
export function thattaFang(s) {
  const t = String(s == null ? '' : s).trim();
  const m = t.match(/^(.*?)[,\s]+(\d{3})\s*$/);
  return m ? { fang: nlyk(m[1]), pn: m[2] } : { fang: nlyk(t), pn: null };
}

/**
 * Velur forsendur matsins. Skráð eign gengur fyrir; annars innsláttur notandans.
 * @returns {{teg:string, fm:number, ar:(number|null), fraNotanda:boolean}|null}
 */
export function veljaForsendur(eign, innslattur) {
  if (eign && Number(eign.fm) > 15) {
    return { teg: eign.teg, fm: Number(eign.fm), ar: Number(eign.ar) || null, fraNotanda: false };
  }
  if (!innslattur) return null;
  const fm = Number(innslattur.fm);
  if (!Number.isFinite(fm) || fm <= 15) return null;
  return { teg: innslattur.teg, fm, ar: Number(innslattur.ar) || null, fraNotanda: true };
}

/** Línan undir bilinu. Nefnir AÐEINS þær síur sem voru raunverulega virkar. */
export function grunnurTexti(r, pn, fraNotanda) {
  return [
    (r && r.n) + ' sambærilegar sölur í ' + pn,
    r && r.arSia ? 'byggingarár ±15 ár' : null,
    r && r.radiusKm ? 'innan ' + r.radiusKm + ' km' : null,
    fraNotanda ? 'miðað við stærð og byggingarár sem þú slóst inn' : null,
  ].filter(Boolean).join(' · ');
}

/** ⚠ Lyklar hnitaskrárinnar eru LÁGSTAFA. Skilar [lat, lon] eða null. */
export function hnitAfFangi(hnit, fang) {
  const h = hnit && hnit[nlyk(fang)];
  return (h && Number.isFinite(h[0]) && Number.isFinite(h[1])) ? [h[0], h[1]] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && node --test test/verdmat-gluggi.test.mjs`
Expected: PASS — `# pass 11`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/verdmat-gluggi.mjs web/test/verdmat-gluggi.test.mjs
git commit -m "Rokvisi verdmatsgluggans i profada einingu, ekki inn i .astro"
```

---

### Task 5: Glugginn sjálfur

Skráin tengir DOM við einingarnar úr Task 1 og Task 4 og tekur engar ákvarðanir sjálf.

**Files:**
- Create: `web/src/pages/embed/verdmat.astro`

**Interfaces:**
- Consumes: `verdbil` (Task 1), `/api/embed/talning` (Task 2), `thattaFang`/`veljaForsendur`/`grunnurTexti`/`hnitAfFangi` (Task 4), `metaUrSolusogu` úr `lib/fasteignamat.mjs`
- Produces: ekkert

- [ ] **Step 1: Create the page**

Búðu til `web/src/pages/embed/verdmat.astro`:

```astro
---
// Verðmatsgluggi fyrir allt.is. Sjálfstæð síða ÁN Layout — hún lifir inni í ramma á öðrum vef og
// má hvorki bera haus, valmynd né hitt útlit karp.is. Þema Allt, mælt af allt.is 17.9.2026.
//
// ⚠⚠ Bilið kemur EINGÖNGU úr lib/verdbil.mjs. Aldrei lo/hi úr vélinni (35,4% hittni).
// ⚠ Ekkert punktmat birtist. Orðalagið fylgir bilinu alltaf.
// ⚠ ENGIN rökvísi hér — hún er í lib/verdmat-gluggi.mjs þar sem prófin ná til hennar.
---
<html lang="is">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Verðmat eignar</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&display=swap" />
<style>
  :root { --bg:#f8fbfc; --dokkt:#0b1f28; --ahersla:#226079; --texti:#67777e; }
  * { box-sizing:border-box }
  body { margin:0; font:400 16px/1.55 Raleway,system-ui,sans-serif; color:var(--texti); background:var(--bg) }
  .v { max-width:520px; margin:0 auto; padding:20px }
  h2 { margin:0 0 4px; font-size:20px; font-weight:700; color:var(--dokkt) }
  .undir { margin:0 0 16px; font-size:14px }
  label { display:block; margin:10px 0 4px; font-size:13px; font-weight:600; color:var(--dokkt) }
  input, select { width:100%; padding:11px 12px; border:1px solid #d7e2e6; border-radius:6px; font:inherit; background:#fff; color:var(--dokkt) }
  input:focus, select:focus { outline:2px solid var(--ahersla); outline-offset:1px }
  button { width:100%; margin-top:14px; padding:12px; border:0; border-radius:6px; background:var(--ahersla); color:#fff; font:600 16px Raleway,sans-serif; cursor:pointer }
  button:disabled { opacity:.5; cursor:default }
  .bil { margin:18px 0 0; padding:18px; background:#fff; border:1px solid #d7e2e6; border-radius:8px; text-align:center }
  .bil b { display:block; font-size:26px; font-weight:700; color:var(--dokkt); line-height:1.25 }
  .bil .vissa { display:block; margin-top:8px; font-size:13px }
  .grunnur { margin:10px 0 0; font-size:12.5px; line-height:1.5 }
  .cta { display:block; margin-top:14px; padding:11px; text-align:center; border:1px solid var(--ahersla); border-radius:6px; color:var(--ahersla); text-decoration:none; font-weight:600 }
  .merki { margin:16px 0 0; text-align:center; font-size:12px }
  .merki a { color:var(--texti) }
  .fela { display:none }
</style>
</head>
<body>
<div class="v">
  <h2>Hvað er eignin þín virði?</h2>
  <p class="undir">Áætlað verðbil úr þinglýstum kaupsamningum.</p>

  <label for="fang">Heimilisfang</label>
  <input id="fang" list="fong" autocomplete="off" placeholder="Heiðarbraut 12, 230" />
  <datalist id="fong"></datalist>

  <div id="innslattur" class="fela">
    <p class="grunnur">Þessi eign hefur ekki selst síðan 2006, svo stærð hennar er ekki í skránni okkar. Sláðu inn þrjú atriði og við metum hana samt.</p>
    <label for="teg">Tegund</label>
    <select id="teg"><option>Fjölbýli</option><option>Sérbýli</option><option>Raðhús</option><option>Parhús</option><option>Einbýli</option></select>
    <label for="fm">Stærð í fermetrum</label>
    <input id="fm" type="number" min="15" max="2000" inputmode="numeric" />
    <label for="ar">Byggingarár</label>
    <input id="ar" type="number" min="1850" max="2030" inputmode="numeric" />
  </div>

  <button id="reikna">Reikna verðbil</button>
  <div id="ut"></div>
  <p class="merki">Powered by <a href="https://karp.is/" target="_blank" rel="noopener">Karp.is</a></p>
</div>

<script>
  import { metaUrSolusogu } from '../../lib/fasteignamat.mjs';
  import { verdbil } from '../../lib/verdbil.mjs';
  import { grunnurTexti, hnitAfFangi, thattaFang, veljaForsendur } from '../../lib/verdmat-gluggi.mjs';

  const UPPSPRETTA = 'allt';
  const $ = (id) => document.getElementById(id);
  const kr = (n) => Math.round(n / 1e6).toLocaleString('is-IS') + ' m.kr.';
  const segja = (t) => { $('ut').innerHTML = '<p class="grunnur">' + t + '</p>'; };

  let GOTUR = null; const HNIT = {}; const SOL = {}; const SKRA = {};
  const saekja = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const gotur = async () => (GOTUR || (GOTUR = await saekja('/gogn/hnit/gotur.json')));
  const hnitPn = async (pn) => (HNIT[pn] || (HNIT[pn] = await saekja('/gogn/hnit/' + pn + '.json')));
  const solPn = async (pn) => (SOL[pn] || (SOL[pn] = await saekja('/gogn/solusaga/' + pn + '.json')));
  const skraPn = async (pn) => (SKRA[pn] || (SKRA[pn] = await saekja('/gogn/fasteignaskra/' + pn + '.json')));

  $('fang').addEventListener('input', async () => {
    const { fang } = thattaFang($('fang').value);
    if (fang.length < 3) return;
    const g = await gotur(); if (!g) return;
    const dl = $('fong'); dl.innerHTML = '';
    for (const n of Object.keys(g).filter((x) => x.startsWith(fang)).slice(0, 8)) {
      const o = document.createElement('option'); o.value = n + ', ' + g[n][0]; dl.appendChild(o);
    }
  });

  $('reikna').addEventListener('click', async () => {
    const b = $('reikna'); b.disabled = true; $('ut').innerHTML = '';
    try {
      let { fang, pn } = thattaFang($('fang').value);
      if (!pn) {
        const g = (await gotur()) || {};
        const lykill = Object.keys(g).find((n) => fang.startsWith(n));
        if (lykill) pn = g[lykill][0];
      }
      if (!pn) return segja('Fann ekki heimilisfangið. Sláðu inn götu, númer og póstnúmer.');

      const [hnit, sales, skra] = await Promise.all([hnitPn(pn), solPn(pn), skraPn(pn)]);
      if (!sales || !sales.length) return segja('Of fáar þinglýstar sölur í þessu póstnúmeri til að meta eign.');

      const eign = (Array.isArray(skra) ? skra : []).find((r) => String(r.a || '').trim().toLowerCase() === fang) || null;
      const synir = !$('innslattur').classList.contains('fela');
      const innslattur = synir ? { teg: $('teg').value, fm: $('fm').value, ar: $('ar').value } : null;
      const f = veljaForsendur(eign, innslattur);

      if (!f) {
        // 47% tilvika. Fyrst sýnum við reitina, svo reiknum við þegar notandinn hefur fyllt út.
        if (!synir) { $('innslattur').classList.remove('fela'); return; }
        return segja('Sláðu inn stærð eignarinnar í fermetrum.');
      }

      // ⚠ hnit VERÐA að fylgja, annars er radíus-sían óvirk í þögn.
      const r = metaUrSolusogu(sales, { teg: f.teg, fm: f.fm, ar: f.ar, a: fang, hnit: hnitAfFangi(hnit, fang) }, { now: Date.now(), hnit });
      const bil = r ? verdbil(r.m, f.fm) : null;
      if (!bil) return segja('Of fáar sambærilegar eignir til að meta þessa með vissu.');

      $('ut').innerHTML = '<div class="bil"><b>' + kr(bil.lagt) + ' – ' + kr(bil.hatt) + '</b>'
        + '<span class="vissa">' + bil.ordalag + '</span></div>'
        + '<p class="grunnur">' + grunnurTexti(r, pn, f.fraNotanda) + '.</p>'
        + '<a class="cta" href="https://karp.is/fasteignavakt/?fang=' + encodeURIComponent($('fang').value)
        + '&uppspretta=' + UPPSPRETTA + '" target="_blank" rel="noopener">Sjá fulla skýrslu á Karp.is</a>';

      // Ein notkun telst þegar bilið er BIRT. ⚠ Engin fyrirspurn fylgir, aðeins uppsprettan.
      fetch('/api/embed/talning?u=' + UPPSPRETTA, { method: 'POST' }).catch(() => {});
    } finally { b.disabled = false; }
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Build and verify the page exists**

Run: `cd web && npx astro build && ls dist/embed/verdmat/index.html`
Expected: `Complete!` og skráin er til.

- [ ] **Step 3: Run the full suites**

Run: `cd web && npm test && npx wrangler deploy --dry-run`
Expected: `# fail 0` og `Total Upload:` án villu.

- [ ] **Step 4: Commit and push**

```bash
git add web/src/pages/embed/verdmat.astro
git commit -m "Verdmatsgluggi allt.is: heimilisfang inn, verdbil ut, thema Allt"
git push origin HEAD:main
```

- [ ] **Step 5: Verify live in a browser**

Bíddu eftir CI og opnaðu `https://karp.is/embed/verdmat/`.

Staðfestu þrennt:
1. Enginn `X-Frame-Options`-haus.
2. `content-security-policy` ber `frame-ancestors` sem nefnir `allt.is`.
3. Uppfletting á þekktu heimilisfangi í 230 skilar bili með setningunni „Rétt í fjórum af hverjum fimm tilvikum."

⚠ Staðfestu í VAFRA, ekki með curl á byggða búnta — curl gefur falskt neikvætt á hashaðar eignir.

---

## Eftir að þetta er komið í loftið

Ekki hluti af þessari áætlun, en næstu skref í réttri röð.

1. Senda Páli og Elínu límanlegu línuna og láta þau prófa á sínum vef.
2. Ákveða mánaðargjaldið (opið í spekkinni).
3. Ákveða söguna gagnvart Páli um að trektin fari á karp.is (opið í spekkinni).
4. Plugin 2, bráðabirgðagreiðslumat. ⚠ Forsendurnar eru verkefnið, ekki viðmótið.
5. Plugin 3, fasteignafréttir af Reykjanesi.
