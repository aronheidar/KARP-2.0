# Bjarki markaðsfulltrúi (Hluti B) — útfærslu-áætlun

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gefa Bjarka vélina á bak við andlitið: hann veit hvað við höfum búið til, sér hvað fór út og hvenær, leggur til efni sem passar við umfjöllun vikunnar, og getur framleitt það — en birtir aldrei sjálfur.

**Architecture:** Tvær hreinar einingar (`markadsefni.mjs` = dagatal og safn · `markadsefni_tillogur.mjs` = fjölmiðlatillögur) bera alla rökfræði og prófast með `node --test`. Worker-eining talar við Postiz-API og D1-töfluna `markadsefni` (migration 0016). Spjaldið les þetta gegnum `lib/stjorn/bjarki.mjs` og fellur inn í andlitaröndina sem þriðja andlitið. Framleiðslan flyst í GitHub Action sem skilar mp4 og **drögum** í Postiz.

**Tech Stack:** Astro 5 (SSG) + Cloudflare Worker (V8 isolate) + D1. Vanilla ESM (`.mjs`), `node:test`. Postiz public API. Engin ný dependency í worker.

**Hönnun:** `docs/superpowers/specs/2026-09-15-bjarki-markadsfulltrui-design.md`
**Undanfari:** Hluti A (forstofa + spjöld Sigrúnar og Hrafns) er LIVE — sömu einingar og mynstur eru til reiðu.

**Vinnusvæði:** `C:\Users\aronh\dev\karp-hjalp` (grein `hjalp-agent`). Deploy = `git push origin hjalp-agent:main`. **Committaðu strax eftir hvert verk.**

---

## Global Constraints

- **Bjarki birtir ALDREI sjálfur.** Hann skrifar drög (`state` í Postiz sem drög, `birt = NULL` í D1). Birting er smellur Arons. Þetta er sama regla og gildir um Sigrúnu og póst.
- **Postiz-reikningurinn ber FLEIRI rásir en Karp.** Á honum eru líka `EWB Iceland`, `Engineers Without Borders Iceland` og `Steinsson|Greykdal`. Allt sem Bjarki sýnir eða telur VERÐUR að vera síað á Karp-rásirnar tvær:
  - LinkedIn: `cmt92pcw000r9p20yv7b53018`
  - Facebook: `cmt92q6mr00pbmp0ykfa92r3v`
  Ósíuð tala er ekki „næstum rétt" — hún er röng og hún lítur út fyrir að vera rétt.
- **Ein færsla á mörgum rásum er EITT verk.** Postiz skilar sérfærslu per rás með sameiginlegt `group`-auðkenni. Dagatalið og allar talningar hópa á `group`, annars tvítelst hvert myndband.
- **Secret-gated:** vanti `POSTIZ_API_KEY` skilar endapunkturinn `{ok:false, error:'unconfigured'}` og spjaldið segir „Postiz-tenging óstillt". Ekkert brotnar. Sama mynstur og Áskell, Gmail og bilanalistinn.
- **POST krefst innskráðrar lotu** (X-Admin-Key má lesa) — það skrifar í Postiz og ræsir framleiðslu.
- **Ótraustur texti:** innihald færslna úr Postiz og fréttatitlar úr D1 fara gegnum `esc()` við birtingu.
- Hreinar einingar: engin `fetch`, engin `env`, **engin `Date.now()`** — tími kemur inn sem `nu`-viðfang.
- `ci_worker_bindings.mjs` er CI-hlið: toppstigs-nöfn í worker-einingu mega ekki rekast á staðbundin nöfn annarra skráa → `_me`-forskeyti í `worker/markadsefni.mjs`.
- Athugasemdir á íslensku. Commit-skilaboð á íslensku með `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Prófin eru 797 græn þegar þetta hefst.** Engin breyting má fækka þeim.

---

## File Structure

| Skrá | Ábyrgð |
|---|---|
| `web/migrations/0016_markadsefni.sql` | Taflan: eitt verk = ein lína, með efnistökum og tölunni sem það byggir á |
| `web/src/lib/markadsefni.mjs` | **Hrein.** Postiz-færslur → dagatal, hópun á `group`, síun á Karp-rásir, „hve langt nær dagatalið" |
| `web/src/lib/markadsefni_tillogur.mjs` | **Hrein.** Fréttir + málefni → hvað er óvenju heitt, og hvaða KARP-tala talar inn í það |
| `web/src/worker/markadsefni.mjs` | **I/O.** Postiz-API, samstilling í D1, `/api/admin/markadsefni`, Claude-drög |
| `web/src/lib/stjorn/bjarki.mjs` | **Hrein.** Hólfin fimm á spjaldi Bjarka |
| `web/src/pages/stjorn.astro` | Þriðja andlitið + spjaldið hans |
| `.github/workflows/markadsefni.yml` | Framleiðsla: mp4 → Postiz sem drög → lína í D1 |
| `web/src/lib/personur.mjs` | Bjarki verður markaðsfulltrúi; `rofi_bjarki` í ROFAR |

---

### Task 1: Bjarki verður markaðsfulltrúi + fær rofa

**Files:**
- Modify: `web/src/lib/personur.mjs` (færslan `bjarki`, `ROFAR`)
- Modify: `web/src/lib/personur.test.mjs`

**Interfaces:**
- Produces: `rofiLykill('bjarki') -> 'rofi_bjarki'`; `persona('bjarki').hlutverk === 'markaðsfulltrúi'`

- [ ] **Step 1: Skrifaðu fallandi próf**

Bættu aftast í `web/src/lib/personur.test.mjs`:

```js
test('Bjarki er markaðsfulltrúi og fær rofa — CMO lýsir stefnumótun sem Aron sinnir sjálfur', () => {
  const b = persona('bjarki');
  assert.equal(b.hlutverk, 'markaðsfulltrúi');
  assert.equal(b.undirskrift, 'Bjarki — markaðsfulltrúi Karp');
  assert.equal(rofiLykill('bjarki'), 'rofi_bjarki');
  assert.ok(!JSON.stringify(PERSONUR).includes('CMO'), 'ekkert „CMO" eftir í persónuskránni');
  for (const id of Object.keys(ROFAR)) assert.ok(PERSONA_IDS.includes(id), id + ' er til');
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/personur.test.mjs`
Expected: FAIL — `hlutverk` er `'CMO'`

- [ ] **Step 3: Breyttu persónunni og rofa-kortinu**

Í `web/src/lib/personur.mjs`, færslan `bjarki`: `hlutverk: 'markaðsfulltrúi'` og `undirskrift: 'Bjarki — markaðsfulltrúi Karp'`.
Í `ROFAR`: bættu við `bjarki: 'rofi_bjarki'`.

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && npm test`
Expected: `pass 798`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/personur.mjs web/src/lib/personur.test.mjs
git commit -m "Bjarki er markaðsfulltrúi, ekki CMO — og fær sinn eigin rofa"
```

---

### Task 2: Taflan `markadsefni` (migration 0016)

**Files:**
- Create: `web/migrations/0016_markadsefni.sql`

**Interfaces:**
- Produces: taflan `markadsefni` með dálkunum sem verk 5 skrifar í og verk 6 les

- [ ] **Step 1: Skrifaðu migration-skrána**

Búðu til `web/migrations/0016_markadsefni.sql`:

```sql
-- 0016_markadsefni.sql — efnissafn markaðsfulltrúans (Bjarki). Keyrt:
--   npx wrangler d1 execute tengsl --remote --file web/migrations/0016_markadsefni.sql
--
-- ⚠ Þetta er EKKI afrit af Postiz. Postiz er sannleikurinn um hvað fór út og hvenær; þessi tafla bætir
--   við því sem Postiz veit ekki: UM HVAÐ verkið fjallaði og HVAÐA TÖLU það byggði á. Án þess getur
--   Bjarki ekki svarað „höfum við sagt þetta áður?" — og þá er hann bara dagatal með andliti.
CREATE TABLE IF NOT EXISTS markadsefni (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created    INTEGER NOT NULL,
  titill     TEXT NOT NULL,
  tegund     TEXT NOT NULL DEFAULT 'myndband',   -- myndband | mynd | texti
  efnistok   TEXT,                               -- málefnaheiti úr malefni.json (NULL = óflokkað)
  tala       TEXT,                               -- talan sem verkið byggir á, sem TEXTI ("1.708,5 ma.kr.")
  heimild    TEXT,                               -- hvaðan talan kom
  lota       INTEGER,                            -- framleiðslulota
  postiz_id  TEXT,                               -- auðkenni HÓPS í Postiz (group), ekki stakrar færslu
  rasir      TEXT,                               -- JSON-fylki rásarheita
  birt       INTEGER,                            -- unix þegar það fór út (NULL = drög eða í röð)
  skra       TEXT                                -- skráarnafn (upplýsingar, ekki vefslóð)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_markadsefni_postiz ON markadsefni(postiz_id) WHERE postiz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markadsefni_birt ON markadsefni(birt);
CREATE INDEX IF NOT EXISTS idx_markadsefni_efnistok ON markadsefni(efnistok);
```

- [ ] **Step 2: Staðfestu SQL-ið án þess að keyra á lifandi grunn**

Run: `cd web && npx wrangler d1 execute tengsl --local --file migrations/0016_markadsefni.sql`
Expected: keyrist villulaust á staðbundnum grunni.

⚠ **Ekki keyra `--remote`** — verkefnisstjórinn gerir það sjálfur (migration á lifandi grunn er hans ákvörðun).

- [ ] **Step 3: Commit**

```bash
git add web/migrations/0016_markadsefni.sql
git commit -m "Efnissafn markaðsfulltrúans: ein lína á verk, með tölunni sem það byggir á"
```

---

### Task 3: `markadsefni.mjs` — dagatal og safn (hrein)

**Files:**
- Create: `web/src/lib/markadsefni.mjs`
- Create: `web/src/lib/markadsefni.test.mjs`

**Interfaces:**
- Consumes: Postiz-svar `{posts:[{id, content, publishDate, state, group, integration:{id, providerIdentifier, name}}]}`
- Produces: `KARP_RASIR` · `erKarpRas(id)` · `hopaFaerslur(posts) -> Verk[]` · `dagatal(verk, nu) -> {iRod, naesta, naerTil, dagarFram}` · `efnislina(verk)`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/markadsefni.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARP_RASIR, dagatal, efnislina, erKarpRas, hopaFaerslur } from './markadsefni.mjs';

const LI = 'cmt92pcw000r9p20yv7b53018', FB = 'cmt92q6mr00pbmp0ykfa92r3v', EWB = 'cmpvni6bb00hpmt0yuatcjamo';
const NU = Date.UTC(2026, 8, 15) / 1000;   // 15.9.2026
const p = (id, group, rasId, dagar, state = 'QUEUE', content = 'Texti um kvóta') => ({
  id, group, state, content,
  publishDate: new Date((NU + dagar * 86400) * 1000).toISOString(),
  integration: { id: rasId, providerIdentifier: rasId === FB ? 'facebook' : 'linkedin-page', name: rasId === EWB ? 'EWB Iceland' : 'Karp' },
});

test('EWB-rásir teljast ALDREI með — reikningurinn ber fleiri rásir en Karp', () => {
  assert.equal(erKarpRas(LI), true);
  assert.equal(erKarpRas(FB), true);
  assert.equal(erKarpRas(EWB), false);
  assert.equal(erKarpRas(''), false);
  assert.equal(erKarpRas(null), false);
  assert.deepEqual(KARP_RASIR.slice().sort(), [FB, LI].sort());
});

test('ein færsla á tveimur rásum er EITT verk — hópað á group', () => {
  const verk = hopaFaerslur([p('a1', 'g1', LI, 2), p('a2', 'g1', FB, 2), p('b1', 'g2', LI, 5)]);
  assert.equal(verk.length, 2);
  assert.deepEqual(verk[0].rasir.sort(), ['facebook', 'linkedin-page']);
  assert.equal(verk[0].group, 'g1');
  assert.equal(verk[1].rasir.length, 1);
});

test('færslur á EWB-rásum eru síaðar burt áður en hópað er', () => {
  const verk = hopaFaerslur([p('e1', 'ge', EWB, 1), p('a1', 'g1', LI, 2)]);
  assert.equal(verk.length, 1);
  assert.equal(verk[0].group, 'g1');
});

test('dagatal: hve langt nær það fram í tímann — talan sem segir hvort þú sért á eftir', () => {
  const verk = hopaFaerslur([p('a', 'g1', LI, 2), p('b', 'g2', LI, 9), p('c', 'g3', LI, -3, 'PUBLISHED')]);
  const d = dagatal(verk, NU);
  assert.equal(d.iRod, 2, 'aðeins framtíðar-færslur í röðinni');
  assert.equal(d.dagarFram, 9, 'nær níu daga fram');
  assert.equal(d.naesta.group, 'g1', 'næsta er sú sem fer fyrst út');
  assert.equal(d.birtSidast.group, 'g3');
});

test('dagatal: tómt safn skilar núllum en kastar ekki', () => {
  const d = dagatal([], NU);
  assert.equal(d.iRod, 0);
  assert.equal(d.dagarFram, 0);
  assert.equal(d.naesta, null);
  assert.equal(d.birtSidast, null);
  assert.deepEqual(dagatal(null, NU).iRod, 0);
});

test('efnislina: fyrsta setning innihaldsins, klippt, án línuskila', () => {
  assert.equal(efnislina({ content: 'Fyrsta setning. Önnur setning sem má hverfa.' }), 'Fyrsta setning.');
  assert.equal(efnislina({ content: 'Lína eitt\nlína tvö' }), 'Lína eitt lína tvö');
  assert.equal(efnislina({ content: 'x'.repeat(200) }).length, 120);
  assert.equal(efnislina({}), '(enginn texti)');
  assert.equal(efnislina(null), '(enginn texti)');
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/markadsefni.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/markadsefni.mjs`:

```js
// markadsefni.mjs — HREIN eining: Postiz-færslur → dagatal og verk-listi markaðsfulltrúans.
//
// ⚠ TVENNT sem gerir tölurnar rangar ef það gleymist:
//   1. Postiz-reikningurinn ber FLEIRI rásir en Karp (EWB Iceland, Engineers Without Borders Iceland,
//      Steinsson|Greykdal). Ósíaður listi lítur út fyrir að vera réttur en er það ekki.
//   2. Ein færsla á tveimur rásum kemur sem TVÆR færslur með sameiginlegt `group`. Án hópunar tvítelst
//      hvert einasta myndband.
export const KARP_RASIR = [
  'cmt92pcw000r9p20yv7b53018',   // Karp — LinkedIn
  'cmt92q6mr00pbmp0ykfa92r3v',   // Karp — Facebook
];
export function erKarpRas(id) {
  return typeof id === 'string' && KARP_RASIR.includes(id);
}

/** Fyrsta setning færslunnar, á einni línu — það sem sést í dagatalinu. */
export function efnislina(f) {
  const t = String((f && f.content) || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(enginn texti)';
  const setning = (t.match(/^[^.!?]*[.!?]/) || [t])[0].trim();
  return setning.slice(0, 120);
}

/** Postiz-færslur → eitt verk per `group`, aðeins Karp-rásir. Raðað eftir birtingartíma (elst fyrst). */
export function hopaFaerslur(posts) {
  const eftirHop = new Map();
  for (const f of (Array.isArray(posts) ? posts : [])) {
    if (!f || !erKarpRas(f.integration && f.integration.id)) continue;
    const lykill = f.group || f.id;
    const ts = Math.floor(new Date(f.publishDate || 0).getTime() / 1000) || 0;
    const fyrir = eftirHop.get(lykill);
    if (fyrir) {
      if (!fyrir.rasir.includes(f.integration.providerIdentifier)) fyrir.rasir.push(f.integration.providerIdentifier);
      if (f.state === 'PUBLISHED') fyrir.birt = true;
      continue;
    }
    eftirHop.set(lykill, {
      group: lykill, ts, texti: efnislina(f), state: f.state || '',
      birt: f.state === 'PUBLISHED', rasir: [f.integration.providerIdentifier],
    });
  }
  return [...eftirHop.values()].sort((a, b) => a.ts - b.ts);
}

/** Staða dagatalsins. `dagarFram` er talan sem segir hvort maður sé á eftir — ekki fjöldinn í röðinni. */
export function dagatal(verk, nu) {
  const listi = Array.isArray(verk) ? verk : [];
  const nuS = Number(nu) || 0;
  const framundan = listi.filter((v) => v.ts > nuS);
  const bakvid = listi.filter((v) => v.ts <= nuS);
  const sidasti = framundan.length ? framundan[framundan.length - 1].ts : 0;
  return {
    iRod: framundan.length,
    naesta: framundan[0] || null,
    birtSidast: bakvid.length ? bakvid[bakvid.length - 1] : null,
    naerTil: sidasti || 0,
    dagarFram: sidasti ? Math.round((sidasti - nuS) / 86400) : 0,
  };
}
```

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/lib/markadsefni.test.mjs`
Expected: PASS — `pass 6`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/markadsefni.mjs web/src/lib/markadsefni.test.mjs
git commit -m "Dagatal Bjarka: ein færsla á tveimur rásum er eitt verk, og EWB telst ekki með"
```

---

### Task 4: `markadsefni_tillogur.mjs` — fjölmiðlatillögur (hrein)

**Files:**
- Create: `web/src/lib/markadsefni_tillogur.mjs`
- Create: `web/src/lib/markadsefni_tillogur.test.mjs`

**Interfaces:**
- Consumes: `matchNews(item, ord)` úr `./lobbyvakt.mjs` (þegar til og prófuð) · `malefni.json` (`[{n, f, um, a}]`) · fréttaraðir `{title, body, ts}`
- Produces: `VORUKORT` · `heitMalefni(frettir, malefni, {nu, gluggi, vidmid, lagmark})` · `pararVidVoru(nafn)` · `tillogur(heitt, safn, nu)`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/markadsefni_tillogur.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VORUKORT, heitMalefni, pararVidVoru, tillogur } from './markadsefni_tillogur.mjs';

const NU = Date.UTC(2026, 8, 15) / 1000;
const MALEFNI = [
  { n: 'Sjávarútvegur', f: 'Atvinnuvegir', um: 'sjávarútveg', a: ['sjávarútveg', 'kvóta', 'fiskveiði'] },
  { n: 'Verðbólga', f: 'Efnahagur', um: 'verðbólgu', a: ['verðbólga', 'verðbólgu'] },
  { n: 'Veður', f: 'Samfélag', um: 'veður', a: ['veður', 'óveður'] },
];
/** n fréttir um `ord`, dreifðar yfir `dagarAftur` daga. */
const frettir = (ord, n, dagarAftur) => Array.from({ length: n }, (_, i) => ({
  title: 'Frétt um ' + ord + ' nr ' + i, body: '', ts: NU - Math.floor((i / Math.max(1, n - 1)) * dagarAftur * 86400),
}));

test('heitt málefni er HLUTFALL, ekki fjöldi — þrefalt venjulegt er frétt, þrjátíu greinar eru það ekki', () => {
  // kvóti: 12 greinar á 7 dögum, 24 á 90 dögum → grunnlína ~1,9/viku → hlutfall ~6
  // verðbólga: 30 greinar jafndreifðar á 90 daga → ~2,3 í vikunni, hlutfall ~1
  const f = [...frettir('kvóta', 12, 7), ...frettir('kvóta', 12, 90), ...frettir('verðbólgu', 30, 90)];
  const h = heitMalefni(f, MALEFNI, { nu: NU });
  assert.equal(h[0].malefni, 'Sjávarútvegur', 'sjávarútvegur er heitastur þótt verðbólga hafi fleiri greinar alls');
  assert.ok(h[0].hlutfall > 2, 'hlutfall yfir tvöfalt');
  const verdbolga = h.find((x) => x.malefni === 'Verðbólga');
  assert.ok(!verdbolga || verdbolga.hlutfall < 2, 'jafndreifð umfjöllun er ekki heit');
});

test('málefni með of fáar greinar í glugganum kemst ekki á listann — hávaði er ekki frétt', () => {
  const h = heitMalefni(frettir('óveður', 2, 3), MALEFNI, { nu: NU });
  assert.deepEqual(h.map((x) => x.malefni), [], 'tvær greinar duga ekki');
  const h2 = heitMalefni(frettir('óveður', 6, 5), MALEFNI, { nu: NU });
  assert.deepEqual(h2.map((x) => x.malefni), ['Veður']);
});

test('pararVidVoru: aðeins málefni sem við eigum RAUNVERULEGA tölu um', () => {
  const v = pararVidVoru('Sjávarútvegur');
  assert.ok(v && v.vara && v.slod, 'sjávarútvegur á sér vöru');
  assert.equal(pararVidVoru('Veður'), null, 'við eigum enga veðurtölu — engin tillaga');
  assert.equal(pararVidVoru(null), null);
  for (const [nafn, v2] of Object.entries(VORUKORT)) {
    assert.ok(v2.vara && v2.slod && v2.tala, nafn + ' ber vöru, slóð og lýsingu á tölunni');
  }
});

test('tillögur sleppa því sem við höfum þegar birt um síðustu 30 daga', () => {
  const heitt = [{ malefni: 'Sjávarútvegur', hlutfall: 4, vika: 12 }, { malefni: 'Verðbólga', hlutfall: 3, vika: 9 }];
  const safn = [{ efnistok: 'Sjávarútvegur', birt: NU - 10 * 86400 }];
  const t = tillogur(heitt, safn, NU);
  assert.deepEqual(t.map((x) => x.malefni), ['Verðbólga'], 'nýbirt efni endurtekst ekki');
  const gamalt = [{ efnistok: 'Sjávarútvegur', birt: NU - 60 * 86400 }];
  assert.equal(tillogur(heitt, gamalt, NU).length, 2, 'tveggja mánaða gamalt efni lokar ekki málefninu');
});

test('tillaga ber rökin með sér svo hún sé metanleg', () => {
  const t = tillogur([{ malefni: 'Sjávarútvegur', hlutfall: 3.4, vika: 12 }], [], NU);
  assert.equal(t.length, 1);
  assert.match(t[0].rok, /3,4/, 'hlutfallið stendur í rökunum');
  assert.match(t[0].rok, /12/, 'fjöldi greina stendur líka');
  assert.ok(t[0].vara && t[0].slod && t[0].tala);
});

test('tóm eða gölluð gögn skila tómum lista í stað þess að kasta', () => {
  assert.deepEqual(heitMalefni(null, null, { nu: NU }), []);
  assert.deepEqual(heitMalefni([], MALEFNI, { nu: NU }), []);
  assert.deepEqual(tillogur(null, null, NU), []);
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/markadsefni_tillogur.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/lib/markadsefni_tillogur.mjs`:

```js
// markadsefni_tillogur.mjs — HREIN eining: hvað er óvenju fyrirferðarmikið í umfjöllun vikunnar, og
// hvaða KARP-tala talar inn í það.
//
// ⚠ Mælikvarðinn er HLUTFALL, ekki fjöldi. „Þrjátíu greinar um verðbólgu" er venjuleg vika og engin
//   frétt; „þrefalt venjulegt um sjávarútveg" er tilefni. Fjöldi einn og sér myndi alltaf skila sömu
//   fjórum málefnum og tillagan yrði gagnslaus.
import { matchNews } from './lobbyvakt.mjs';

/** Málefni → KARP-vara sem á RAUNVERULEGA tölu um það. Málefni sem vantar hér fær enga tillögu —
 *  betra að þegja en að stinga upp á efni sem við getum ekki stutt með okkar eigin gögnum. */
export const VORUKORT = {
  'Sjávarútvegur': { vara: 'Kvótavaktin', slod: '/kvotavaktin/', tala: 'samþjöppun aflamarks — hlutur tíu stærstu' },
  'Fiskveiðar': { vara: 'Kvótavaktin', slod: '/kvotavaktin/', tala: 'samþjöppun aflamarks — hlutur tíu stærstu' },
  'Ríkisfjármál': { vara: 'Fjárlagagögnin', slod: '/rikisfjarmal/', tala: 'afkoma ríkissjóðs og skuldaþróun' },
  'Fjárlög': { vara: 'Fjárlagagögnin', slod: '/rikisfjarmal/', tala: 'afkoma ríkissjóðs og skuldaþróun' },
  'Skattar': { vara: 'Skattasíðan', slod: '/skattar/', tala: 'skattbyrði eftir tekjuhópum' },
  'Verðbólga': { vara: 'Vaxtasíðan', slod: '/vextir/', tala: 'verðbólga og stýrivextir í samhengi' },
  'Húsnæðismál': { vara: 'Fasteignavaktin', slod: '/fasteignaverd/', tala: 'fermetraverð eftir hverfum' },
  'Fasteignamarkaður': { vara: 'Fasteignavaktin', slod: '/fasteignaverd/', tala: 'fermetraverð eftir hverfum' },
  'Opinber innkaup': { vara: 'Útboðsvaktin', slod: '/utbod/', tala: 'umfang útboða og hverjir hreppa þau' },
  'Vinnumarkaður': { vara: 'Vinnumarkaðssíðan', slod: '/vinnumarkadur/', tala: 'atvinnuleysi eftir landshlutum' },
};
export function pararVidVoru(nafn) {
  return (typeof nafn === 'string' && Object.prototype.hasOwnProperty.call(VORUKORT, nafn)) ? VORUKORT[nafn] : null;
}

/** Hvaða málefni eru óvenju fyrirferðarmikil í glugganum miðað við eigin grunnlínu safnsins.
 *  `lagmark` ver gegn hávaða: þrjár greinar sem stökkva úr einni eru ekki tilefni. */
export function heitMalefni(frettir, malefni, { nu = 0, gluggi = 7, vidmid = 90, lagmark = 5 } = {}) {
  const f = Array.isArray(frettir) ? frettir : [];
  const m = Array.isArray(malefni) ? malefni : [];
  if (!f.length || !m.length) return [];
  const nuS = Number(nu) || 0;
  const fraGluggi = nuS - gluggi * 86400, fraVidmid = nuS - vidmid * 86400;
  const ut = [];
  for (const mal of m) {
    if (!mal || !Array.isArray(mal.a) || !mal.a.length) continue;
    let vika = 0, allt = 0;
    for (const frett of f) {
      const ts = Number(frett && frett.ts) || 0;
      if (ts < fraVidmid || ts > nuS) continue;
      if (!matchNews(frett, mal.a)) continue;
      allt++;
      if (ts >= fraGluggi) vika++;
    }
    if (vika < lagmark) continue;
    // Grunnlína = meðalvika yfir viðmiðunartímann. Gólf á 0,5 svo nýtt málefni (engin saga) verði ekki
    // með óendanlegt hlutfall og troðist alltaf efst.
    const grunnlina = Math.max(0.5, (allt / vidmid) * gluggi);
    ut.push({ malefni: mal.n, flokkur: mal.f, um: mal.um, vika, allt, hlutfall: Math.round((vika / grunnlina) * 10) / 10 });
  }
  return ut.sort((a, b) => b.hlutfall - a.hlutfall);
}

/** Heit málefni → áþreifanlegar tillögur. Sleppir því sem við höfum þegar birt um nýlega. */
export function tillogur(heitt, safn, nu, { nylegtDagar = 30, mest = 3 } = {}) {
  const h = Array.isArray(heitt) ? heitt : [];
  const s = Array.isArray(safn) ? safn : [];
  const nuS = Number(nu) || 0;
  const nylegt = new Set(s.filter((v) => v && v.efnistok && Number(v.birt) > nuS - nylegtDagar * 86400).map((v) => v.efnistok));
  const ut = [];
  for (const x of h) {
    if (!x || nylegt.has(x.malefni)) continue;
    const vara = pararVidVoru(x.malefni);
    if (!vara) continue;   // engin tala = engin tillaga
    ut.push({
      malefni: x.malefni, hlutfall: x.hlutfall, vika: x.vika,
      vara: vara.vara, slod: vara.slod, tala: vara.tala,
      rok: 'Umfjöllun um ' + (x.um || x.malefni) + ' er ' + String(x.hlutfall).replace('.', ',') + '× venjuleg þessa vikuna ('
        + x.vika + ' greinar). Við eigum töluna: ' + vara.tala + '.',
    });
    if (ut.length >= mest) break;
  }
  return ut;
}
```

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/lib/markadsefni_tillogur.test.mjs`
Expected: PASS — `pass 6`

⚠ Falli fyrsta prófið á hlutfalls-útreikningi: lagaðu ÚTFÆRSLUNA (grunnlínu eða gólfið), ekki væntinguna. Reglan sem prófið ver er að **jafndreifð umfjöllun má aldrei mælast heit**, hversu mörg sem eintökin eru.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/markadsefni_tillogur.mjs web/src/lib/markadsefni_tillogur.test.mjs
git commit -m "Fjölmiðlatillögur: hlutfall en ekki fjöldi, og þögn þegar við eigum enga tölu"
```

---

### Task 5: `worker/markadsefni.mjs` — Postiz, samstilling og endapunktur

**Files:**
- Create: `web/src/worker/markadsefni.mjs`
- Create: `web/src/worker/markadsefni.test.mjs`
- Modify: `web/worker.js` (innflutningur + leið)

**Interfaces:**
- Consumes: `hopaFaerslur`, `dagatal` (Task 3) · `heitMalefni`, `tillogur` (Task 4) · `adminCsrfVilla`, `_ghDispatch` úr `hjalp_agent.mjs` · `readSession` úr `auth.mjs` · `malefni.json`
- Produces: `saekjaPostiz(env, {thvinga})` · `samstillaEfni(env)` · `adminMarkadsefniHandler(request, env, ctx)`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/worker/markadsefni.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminMarkadsefniHandler, saekjaPostiz, samstillaEfni } from './markadsefni.mjs';
import { _hmac } from './felag.mjs';

const LI = 'cmt92pcw000r9p20yv7b53018', EWB = 'cmpvni6bb00hpmt0yuatcjamo';
function fakeDb(state) {
  const exec = (sql, args) => {
    if (/SELECT v, updated FROM stjorn_sync WHERE k='postiz'/.test(sql)) return state.postiz || null;
    if (/^INSERT INTO stjorn_sync \(k, v, updated\) VALUES \('postiz'/.test(sql)) { state.postiz = { v: args[0], updated: args[1] }; return { meta: {} }; }
    if (/^SELECT .* FROM markadsefni/.test(sql)) return { results: state.efni };
    if (/^INSERT INTO markadsefni/.test(sql)) { state.efni.push({ id: state.efni.length + 1, titill: args[1], postiz_id: args[7], birt: args[9] }); return { meta: { last_row_id: state.efni.length } }; }
    if (/^UPDATE markadsefni SET/.test(sql)) { state.uppfaert = (state.uppfaert || 0) + 1; return { meta: {} }; }
    if (/SELECT title, body, ts FROM news/.test(sql)) return { results: state.news || [] };
    if (/SELECT is_admin FROM users WHERE id=\?/.test(sql)) return state.users[args[0]] || null;
    throw new Error('fakeDb: óþekkt SQL: ' + sql);
  };
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return exec(sql, a); }, async all() { return exec(sql, a); }, async run() { return exec(sql, a); } }; return st; } };
}
const mkState = () => ({ efni: [], news: [], users: { 8: { is_admin: 1 }, 9: { is_admin: 0 } } });
const mkEnv = (state, over = {}) => Object.assign({ TENGSL: fakeDb(state), ADMIN_API_KEY: 'adm-key', SESSION_SECRET: 'leyndó', POSTIZ_API_KEY: 'pk_test' }, over);
function stubFetch(t, svar) {
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    log.push({ url: String(url), headers: (opts && opts.headers) || {} });
    if (svar instanceof Error) throw svar;
    return { ok: svar.status === 200, status: svar.status || 200, json: async () => svar.d };
  };
  t.after(() => { globalThis.fetch = orig; });
  return log;
}
const faersla = (id, group, rasId, iso, state = 'QUEUE') => ({ id, group, state, content: 'Texti', publishDate: iso, integration: { id: rasId, providerIdentifier: 'linkedin-page', name: 'Karp' } });

test('án POSTIZ_API_KEY er svarið unconfigured — ekkert brotnar', async () => {
  const r = await saekjaPostiz(mkEnv(mkState(), { POSTIZ_API_KEY: '' }), { thvinga: true });
  assert.deepEqual(r, { ok: false, error: 'unconfigured' });
});

test('lykillinn fer í Authorization-haus, ALDREI í slóð', async (t) => {
  const log = stubFetch(t, { status: 200, d: { posts: [] } });
  await saekjaPostiz(mkEnv(mkState()), { thvinga: true });
  assert.ok(log.length >= 1);
  assert.ok(!log[0].url.includes('pk_test'), 'lykillinn er hvergi í slóðinni');
  assert.equal(log[0].headers.Authorization, 'pk_test');
});

test('EWB-færslur eru síaðar burt og niðurstaðan geymd', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('e', 'ge', EWB, '2026-09-20T09:00:00.000Z'), faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  const r = await saekjaPostiz(env, { thvinga: true });
  assert.equal(r.ok, true);
  assert.equal(r.verk.length, 1, 'aðeins Karp-verkið');
  assert.ok(state.postiz, 'niðurstaðan geymd');
});

test('Postiz niðri → síðasta þekkta dagatal stendur og villan er merkt', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  await saekjaPostiz(env, { thvinga: true });
  globalThis.fetch = async () => { throw new Error('net'); };
  const r = await saekjaPostiz(env, { thvinga: true });
  assert.equal(r.villa, 'postiz');
  assert.equal(r.verk.length, 1, 'gamla dagatalið hvarf ekki');
});

test('samstilling skráir ný verk sem óflokkuð og tvískráir ekki það sem er þegar til', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [faersla('a', 'g1', LI, '2026-09-20T09:00:00.000Z')] } });
  const r1 = await samstillaEfni(env);
  assert.equal(r1.ny, 1);
  assert.equal(state.efni[0].postiz_id, 'g1');
  const r2 = await samstillaEfni(env);
  assert.equal(r2.ny, 0, 'sama færsla skráist ekki tvisvar');
});

test('endapunktur: GET má með lykli, POST krefst lotu', async (t) => {
  const state = mkState(); const env = mkEnv(state);
  stubFetch(t, { status: 200, d: { posts: [] } });
  const req = (m, h, b) => new Request('https://karp.is/api/admin/markadsefni', { method: m, headers: Object.assign(b ? { 'content-type': 'application/json' } : {}, h), body: b ? JSON.stringify(b) : undefined });
  const js = (r) => r.json();
  assert.deepEqual(await js(await adminMarkadsefniHandler(req('GET', {}), env, {})), { ok: false, error: 'admin' });
  const K = { 'X-Admin-Key': 'adm-key' };
  assert.equal((await js(await adminMarkadsefniHandler(req('GET', K), env, {}))).ok, true);
  assert.deepEqual(await js(await adminMarkadsefniHandler(req('POST', K, { action: 'samstilla' }), env, {})), { ok: false, error: 'lota' });
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/worker/markadsefni.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Skrifaðu eininguna**

Búðu til `web/src/worker/markadsefni.mjs` með þessari uppbyggingu (öll toppstigs-nöfn með `_me`-forskeyti vegna CI-hliðsins):

```js
// markadsefni.mjs (worker) — vél markaðsfulltrúans Bjarka: Postiz-dagatalið, efnissafnið í D1 og
// fjölmiðlatillögurnar.
//
// ⚠ Bjarki BIRTIR ALDREI. Hann skrifar drög; birting er smellur Arons. Sama regla og gildir um póst.
// ⚠ Postiz-reikningurinn ber fleiri rásir en Karp — síunin er í ../lib/markadsefni.mjs og verður að
//   gilda um ALLT sem héðan kemur.
import { _ajson } from './felag.mjs';
import { adminCsrfVilla, _ghDispatch } from './hjalp_agent.mjs';
import { readSession } from './auth.mjs';
import { dagatal, hopaFaerslur } from '../lib/markadsefni.mjs';
import { heitMalefni, tillogur } from '../lib/markadsefni_tillogur.mjs';
import MALEFNI from '../data/malefni.json' with { type: 'json' };

const _meNow = () => Math.floor(Date.now() / 1000);
const _ME_FYRNING = 600;
const _ME_API = 'https://api.postiz.com/public/v1';
```

Föllin sem á að skrifa:

1. `_meGh(env, slod)` — `fetch(_ME_API + slod, { headers: { Authorization: env.POSTIZ_API_KEY }, signal: AbortSignal.timeout(15000) })`, kastar `'postiz ' + status` ef ekki `ok`.
2. `_meAdminUid(env, request)` — sama og í `bilanir.mjs` (`readSession` + `SELECT is_admin`).
3. `saekjaPostiz(env, {thvinga})` — vantar `POSTIZ_API_KEY` → `{ok:false, error:'unconfigured'}`. Annars: geymt í `stjorn_sync k='postiz'` innan `_ME_FYRNING` → skila því. Annars `GET /posts?startDate=…&endDate=…` (±45 dagar), `hopaFaerslur`, geyma `{verk}` (klippt á 60 verk), skila `{ok:true, sott, verk}`. **Bregðist kallið: skila geymdu með `villa:'postiz'`** — aldrei tómu dagatali sem lítur út eins og „ekkert í röðinni".
4. `samstillaEfni(env)` — sækir verk, les `SELECT id, postiz_id, efnistok, birt FROM markadsefni`, skráir þau verk sem eiga sér engan `postiz_id` í töflunni (`efnistok = NULL` → birtast sem óflokkuð), og uppfærir `birt` á þeim sem hafa birst síðan. Skilar `{ok, ny, uppfaerd}`.
5. `_meTillogur(env, nu)` — `SELECT title, body, ts FROM news WHERE ts >= ?` (90 dagar), `heitMalefni(...)`, `SELECT efnistok, birt FROM markadsefni WHERE birt IS NOT NULL`, `tillogur(...)`. Skilar fylki.
6. `adminMarkadsefniHandler(request, env, ctx)`:
   - Auðkenning eins og í `bilanir.mjs`: `byKey` eða lota; hvorugt → `admin`.
   - `GET` → `{ok, postiz: {…}, dagatal: dagatal(verk, nu), safn: (SELECT … FROM markadsefni ORDER BY created DESC LIMIT 60), tillogur, rofi}`.
   - `POST` → CSRF-gát á kökulotu-leið; **`if (!uid) return 'lota'`**; `action`:
     - `samstilla` → `samstillaEfni(env)`
     - `merkja` → `{id, efnistok, tala, heimild}` → `UPDATE markadsefni SET …` (leyfðu aðeins `efnistok` sem er raunverulegt málefnaheiti úr `MALEFNI`, annars `{ok:false,error:'efnistok'}`)
     - `framleida` → `{verk}` (≥10 stafir) → `_ghDispatch(env, 'markadsefni', { verk })`
     - annað → `{ok:false, error:'action'}`

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/worker/markadsefni.test.mjs`
Expected: PASS — `pass 6`

- [ ] **Step 5: Tengdu leiðina í worker.js**

Innflutningur á eftir `bilanir`-línunni:

```js
import { adminMarkadsefniHandler } from './src/worker/markadsefni.mjs';   // 📣 markaðsfulltrúi: Postiz-dagatal, efnissafn, tillögur
```

og leið á eftir `/api/admin/bilanir`:

```js
    if (url.pathname === '/api/admin/markadsefni') return adminMarkadsefniHandler(request, env, ctx);   // 📣 GET dagatal+safn+tillögur · POST samstilla/merkja/framleida
```

- [ ] **Step 6: Keyrðu CI-hliðið og allt prófasettið**

Run (úr rót): `node skriptur/ci_worker_bindings.mjs`
Expected: `✅ Öll nöfn leyst — engin laus tenging.`

Run: `cd web && npm test`
Expected: engin fækkun; öll græn.

⚠ `import MALEFNI from '../data/malefni.json' with { type: 'json' }` — worker-megin ÞARF `with { type: 'json' }`, en biðlara-megin má það EKKI vera (Vite). Þessi eining er aðeins worker-megin, svo hér er það rétt.

- [ ] **Step 7: Commit**

```bash
git add web/src/worker/markadsefni.mjs web/src/worker/markadsefni.test.mjs web/worker.js
git commit -m "Vél Bjarka: Postiz-dagatalið, efnissafnið og tillögurnar á einum endapunkti"
```

---

### Task 6: `lib/stjorn/bjarki.mjs` — hólfin fimm

**Files:**
- Create: `web/src/lib/stjorn/bjarki.mjs`
- Create: `web/src/lib/stjorn/bjarki.test.mjs`

**Interfaces:**
- Consumes: `bidurFyrir` úr `./bidur_thin.mjs` · svar `/api/admin/markadsefni`
- Produces: `bjarkiGogn(svar, bidurListi, nu) -> {stada, sidast, bidur, vinnsla, tolur, heimildir, rofi}`

- [ ] **Step 1: Skrifaðu fallandi próf**

Búðu til `web/src/lib/stjorn/bjarki.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bjarkiGogn } from './bjarki.mjs';

const NU = Date.UTC(2026, 8, 15) / 1000;
const SVAR = {
  ok: true,
  dagatal: { iRod: 4, dagarFram: 9, naesta: { ts: NU + 2 * 86400, texti: 'Kvótinn þéttist', rasir: ['linkedin-page', 'facebook'] }, birtSidast: { ts: NU - 3 * 86400, texti: 'Fjárlögin' } },
  safn: [{ id: 1, titill: 'Kvótinn þéttist', efnistok: 'Sjávarútvegur', birt: NU - 3 * 86400 }, { id: 2, titill: 'Óflokkað verk', efnistok: null, birt: null }],
  tillogur: [{ malefni: 'Verðbólga', hlutfall: 3.1, vika: 9, vara: 'Vaxtasíðan', slod: '/vextir/', tala: 'verðbólga og stýrivextir', rok: 'Umfjöllun um verðbólgu er 3,1× venjuleg þessa vikuna (9 greinar).' }],
  rofi: false,
};

test('staðan segir hve langt dagatalið nær — talan sem segir hvort þú sért á eftir', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.match(g.stada, /9 daga/);
  assert.match(g.stada, /4/);
});

test('dagatalið að tæmast er ÁBENDING, ekki þögn', () => {
  const brátt = bjarkiGogn(Object.assign({}, SVAR, { dagatal: Object.assign({}, SVAR.dagatal, { dagarFram: 6 }) }), [], NU);
  assert.ok(brátt.bidur.some((r) => /dagatalið/i.test(r.titill)), 'sex dagar eftir → ábending');
  const nog = bjarkiGogn(SVAR, [], NU);
  assert.ok(!nog.bidur.some((r) => /dagatalið/i.test(r.titill)), 'níu dagar eru nóg');
});

test('óflokkuð verk bíða þín — annars veit hann ekki um hvað þau fjölluðu', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.ok(g.bidur.some((r) => /óflokk/i.test(r.titill)));
});

test('tillögur birtast með rökunum sínum', () => {
  const g = bjarkiGogn(SVAR, [], NU);
  assert.ok(g.bidur.some((r) => /Verðbólga/.test(r.titill)));
  assert.ok(g.bidur.some((r) => /3,1×/.test(r.vidbot)));
});

test('Postiz óstillt eða niðri → sagt berum orðum, engin ágiskun', () => {
  assert.match(bjarkiGogn({ ok: false, error: 'unconfigured' }, [], NU).stada, /óstillt/i);
  assert.match(bjarkiGogn({ ok: true, villa: 'postiz', dagatal: SVAR.dagatal }, [], NU).stada, /svarar ekki/i);
});

test('tóm gögn fella ekki spjaldið', () => {
  const g = bjarkiGogn({}, [], NU);
  assert.ok(Array.isArray(g.tolur));
  assert.equal(g.bidur.length, 0);
  assert.equal(g.rofi.lykill, 'rofi_bjarki');
});

test('heimildirnar segja skýrt að hann birti ekki sjálfur', () => {
  assert.match(bjarkiGogn(SVAR, [], NU).heimildir.join(' | '), /aldrei birta/i);
});
```

- [ ] **Step 2: Keyrðu prófið og staðfestu að það falli**

Run: `cd web && node --test src/lib/stjorn/bjarki.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Skrifaðu eininguna**

`web/src/lib/stjorn/bjarki.mjs` — sama form og `sigrun.mjs`/`hrafn.mjs`. Reglur sem prófin negla niður:
- `stada`: `unconfigured` → „Postiz-tenging óstillt"; `villa:'postiz'` → „Postiz svarar ekki — dagatalið er frá síðustu heppnuðu sókn"; annars „N í röðinni · dagatalið nær M daga fram".
- `bidur`: `bidurFyrir(bidurListi, 'bjarki')` + eigin raðir: dagatal < 10 dagar fram (`tegund:'dagatal'`), óflokkuð verk (`tegund:'oflokkad'`), hver tillaga (`tegund:'tillaga'`, `vidbot` = rökin).
- `vinnsla`: næstu fimm færslur dagatalsins með dagsetningu og rásum.
- `tolur`: í röðinni · dagar fram · birt í mánuðinum · verk í safninu.
- `heimildir`: semur efni og myndbönd · setur í röðina sem **drög** · **aldrei birta sjálfur — þú ýtir á hnappinn** · rofi.
- `rofi`: `{ lykill: 'rofi_bjarki', off: !!svar.rofi }`.

- [ ] **Step 4: Keyrðu prófin**

Run: `cd web && node --test src/lib/stjorn/bjarki.test.mjs`
Expected: PASS — `pass 7`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/stjorn/bjarki.mjs web/src/lib/stjorn/bjarki.test.mjs
git commit -m "Spjald Bjarka: hve langt dagatalið nær, og hvað bíður samþykkis"
```

---

### Task 7: Þriðja andlitið á `/stjorn/`

**Files:**
- Modify: `web/src/pages/stjorn.astro`

**Interfaces:**
- Consumes: `bjarkiGogn` (Task 6), `/api/admin/markadsefni` (Task 5)

- [ ] **Step 1: Bættu Bjarka við starfsmannalistann og gagnasóknina**

- Flyttu `bjarkiGogn` inn úr `'../lib/stjorn/bjarki.mjs'`.
- `const STARFSMENN = ['sigrun', 'hrafn', 'bjarki'];`
- Bættu við breytu `let sidastaMarkads = { ok: false };` við hlið `sidustuBilanir`.
- Í `boot()`, við hlið bilana-sóknarinnar:

```js
      sidastaMarkads = await fetch('/api/admin/markadsefni', { credentials: 'include' }).then((r) => r.json()).catch(() => ({ ok: false }));
```

- Í `teiknaSpjald(id)`, bættu þriðju greininni við gagna-valið:

```js
      const gogn = id === 'sigrun' ? sigrunGogn(d, bidur, nu)
        : id === 'hrafn' ? hrafnGogn(d, sidustuBilanir, bidur, nu)
        : bjarkiGogn(sidastaMarkads, bidur, nu);
```

- [ ] **Step 2: Bættu aðgerðum Bjarka við spjaldið**

Í `teiknaSpjald`, á eftir Hrafns-greininni, bættu við samsvarandi blokk fyrir Bjarka: hnappur **„🔄 Samstilla við Postiz"** (`POST {action:'samstilla'}`) og textareitur + hnappur **„📣 Semja efni"** (`POST {action:'framleida', verk}`), með sömu vörn og hjá Hrafni: `disabled` fyrsta samstillta línan, og innihald reitsins varðveitt yfir endurteikningu (`gamaltVerk`-mynstrið sem er þegar í skránni).

- [ ] **Step 3: Byggðu og staðfestu**

Run: `cd web && npx astro build`
Expected: `Complete!`

Run: `cd web && node -e "const s=require('fs').readFileSync('src/pages/stjorn.astro','utf8'); if(!s.includes('bjarkiGogn')) throw new Error('bjarki ekki tengdur'); if(!/STARFSMENN = \['sigrun', 'hrafn', 'bjarki'\]/.test(s)) throw new Error('andlitið vantar í röndina'); console.log('bjarki tengdur ok')"`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/stjorn.astro
git commit -m "Þriðja andlitið: Bjarki fær sæti í röndinni"
```

---

### Task 8: Framleiðsla í GitHub Action

**Files:**
- Create: `.github/workflows/markadsefni.yml`

- [ ] **Step 1: Skrifaðu keyrsluna**

`repository_dispatch` `markadsefni {verk}` + `workflow_dispatch`. Skref:
1. `actions/checkout@v7`, `actions/setup-node@v6` (node 22), `npm ci` í `web/`.
2. `npm i -g @anthropic-ai/claude-code`; Claude fær verkið og smíðar render-skriptu **í `skriptur/markadsefni/`** eftir sama mynstri og lotur 1–4 (canvas → mp4, 1080×1350, 30 fps, KARP-palettan).
3. **⚠ Gildrur úr núverandi pípu sem VERÐA að standa í promptinu:** hámark **2 myndbönd á hvert node-ferli** (OOM við ~5.400 ramma, og `| tail` felur útgöngukóðann — staðfestu að hver mp4-skrá sé raunverulega til áður en haldið er áfram) · `✓` (U+2713) er tófa, nota `✔` (U+2714) · `thN()`/`toLocaleString` námunda lykiltölur → skrifa þær sem FASTA STRENGI.
4. Hlaða mp4 upp í Postiz og skrá sem **drög** (`POSTIZ_API_KEY` sem GH-secret).
5. `POST /api/admin/markadsefni` með `X-Admin-Key` og `{action:'skra', titill, efnistok, tala, heimild, postiz_id}`.
6. Skila mp4 sem artifact svo Aron geti horft án þess að opna Postiz.

Girðingar: keyrslan snertir **aldrei** `web/`, `migrations/` eða `.github/`; hún birtir aldrei (aðeins drög).

⚠ Þessi keyrsla þarf `action: 'skra'` í endapunktinum frá Task 5 — bættu þeirri grein við þar ef hún vantar (skráir línu í `markadsefni` með `birt = NULL`).

- [ ] **Step 2: Staðfestu YAML**

Run (úr rót): `python -c "import yaml,io; d=yaml.safe_load(io.open('.github/workflows/markadsefni.yml',encoding='utf-8')); print('yaml ok', len(list(d['jobs'].values())[0]['steps']), 'skref')"`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/markadsefni.yml
git commit -m "Framleiðslan flyst í keyrslu — óháð því hvort einhver sé við"
```

---

### Task 9: Lokaverifun og útgáfa

- [ ] **Step 1: Öll hliðin**

```bash
cd web && npm test
node ../skriptur/ci_worker_bindings.mjs
cd web && npx astro build
cd web && npx wrangler deploy --dry-run
```
Expected: öll græn, `Complete!`, `--dry-run: exiting now.`

- [ ] **Step 2: Migration á lifandi grunn** — verkefnisstjórinn keyrir, ekki undiragent:

```bash
cd web && npx wrangler d1 execute tengsl --remote --file migrations/0016_markadsefni.sql
```

- [ ] **Step 3: Deploy og staðfesting í lofti**

```bash
git fetch origin && git rebase origin/main && git push origin hjalp-agent:main
```

Staðfestu svo (þarf `KARP_ADMIN_KEY`):
- `GET /api/admin/markadsefni` skilar `ok:true` með dagatali. Ef `unconfigured` → `POSTIZ_API_KEY` vantar sem worker-secret.
- `/stjorn/` sýnir þrjú andlit og `#bjarki` teiknar spjaldið.

---

## Sjálfsrýni á áætluninni

**Þekjun gagnvart hönnuninni:** efnissafn (T2) · Postiz-samstilling (T5) · fjölmiðlatillögur (T4+T5) · framleiðsla í Action (T8) · spjald (T6+T7) · titill og rofi (T1) · secret-gating (T5, negld með prófi) · „birtir aldrei sjálfur" (T6 heimildir + T8 girðing).

**Staðgenglar:** Task 5, 6 og 8 lýsa föllum í orðum með nákvæmum reglum í stað fullbúins kóða — þau eru I/O-þung og fylgja mynstrum sem eru ÞEGAR til í `bilanir.mjs`, `hrafn.mjs` og `cto.yml`. Prófkóðinn fyrir þau er hins vegar fullbúinn, svo krafan er ótvíræð.

**Samræmi nafna:** `hopaFaerslur`/`dagatal`/`efnislina` (T3) → notuð í T5 · `heitMalefni`/`tillogur` (T4) → T5 · `saekjaPostiz`/`samstillaEfni`/`adminMarkadsefniHandler` (T5) → T7 · `bjarkiGogn` (T6) → T7 · `rofi_bjarki` (T1) → T6.

**Röð:** T1–T4 eru óháð innbyrðis. T5 þarf T3+T4. T6 þarf T5-svarformið. T7 þarf T5+T6. T8 þarf `action:'skra'` úr T5.

**Utan umfangs:** árangursmælingar (áhorf/smellir), sjálfvirk birting, Unnur/Elín/Egill.
