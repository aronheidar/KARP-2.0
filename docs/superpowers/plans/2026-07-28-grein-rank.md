# Þitt-félag-vs-grein (grein-rank) v1 — útfærsluáætlun

> **Fyrir agentic-verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Ferskur subagent per verk + rýni. Skref nota `- [ ]`.

**Markmið:** Auðga F2-kassann („🏭 Samanburður við atvinnugrein", `fsWireSector`) á fyrirtækjaprófílnum með röðun félagsins í grein (#N af M) + hlekk á `/atvinnugreinar/<slug>/` + EBIT-hlutfall + hagkerfis-grunnlínu.

**Arkitektúr:** Ný hrein `sectorForIsat` (finnur grein úr ÍSAT) → nýr OPINN worker-endapunktur `/api/grein-rank?kt=` (röðun úr D1, nýjasta ár per kt) → client auðgar F2-kassann sem er þegar til. Spec: `docs/superpowers/specs/2026-07-28-grein-rank-design.md`.

**Tæknistafli:** Astro (client-script í `.astro`) + Cloudflare Worker (D1 `env.TENGSL`) + node:test.

## Global Constraints (öll verk)

- **Sameiginlegur worktree — samhliða session breytir `web/worker.js`:** Verk 2 STAGE-ar AÐEINS sína hunka (`git apply --cached` af eigin diff, staðfest ENGIN `nemandi`/`gameUser`/óskyld lína), ALDREI `git add web/worker.js`/`-A`. Önnur skrár (`atvinnugrein.mjs`, `atvinnugrein.test.mjs`, `fyrirtaeki.astro`) = berur `git add <slóð>` (staðfestu `git diff --cached --name-only` áður en committað). Committa STRAX, EKKI pusha (orchestrator pushar).
- **KARP-venjur:** worker-villur = HTTP 200 + `{ok:false,error}` (`_ajson`); D1 með `.catch(()=>null)`/`.catch(()=>({results:[]}))`.
- **Opinn endapunktur:** `/api/grein-rank` hefur ENGA gátt (speglar publicness Topplistanna). Skilar aðeins stöðu+fjölda+eigin-veltu efnis-félagsins.
- **Grænt hlið (per verk):** `cd web && node --test src/lib/atvinnugrein.test.mjs` · `node --check web/worker.js` (á COMMITTUÐU blob-inu ef hunk-stagað) · `cd web && npx astro build` (~3647, engar nýjar síður).

---

### Task 1: Hrein `sectorForIsat` + próf

**Files:** Modify `web/src/lib/atvinnugrein.mjs`, `web/src/lib/atvinnugrein.test.mjs`.

**Produces:** `export function sectorForIsat(sectors, isat)` → greinin (úr `sectorsFromMap`-úttaki `[{slug,label,kpi,isats,excl}]`) sem á ÍSAT-kóða `isat`, eða `null`. Lengsta-forskeyti-match á `isats`; virðir `excl` („án X"). Notað af Task 2 (worker) + Task 3 (client fallback).

- [ ] **Skref 1 — próf fyrst.** Bæta í `web/src/lib/atvinnugrein.test.mjs` (efst: `import { sectorForIsat } from './atvinnugrein.mjs';` ef ekki þegar með `import * as`):

```js
const _SF = [
  { slug: 'sjavarutvegur', label: 'Sjávarútvegur', isats: ['031', '102'], excl: [] },
  { slug: 'matvaeli-an-fisk', label: 'Matvælaframleiðsla, án fiskvinnslu', isats: ['10'], excl: ['102'] },
  { slug: 'fjarskipti', label: 'Fjarskipti', isats: ['61'], excl: [] },
];
test('sectorForIsat: lengsta forskeyti — 10.20.0 → sjávarútvegur (um 102)', () => {
  assert.equal(sectorForIsat(_SF, '10.20.0').slug, 'sjavarutvegur');
});
test('sectorForIsat: 10.11.0 → matvæli (10, ekki útilokað)', () => {
  assert.equal(sectorForIsat(_SF, '10.11.0').slug, 'matvaeli-an-fisk');
});
test('sectorForIsat: útilokun — 10.29.0 (undir 102) → sjávarútvegur, EKKI matvæli', () => {
  assert.equal(sectorForIsat(_SF, '10.29.0').slug, 'sjavarutvegur');
});
test('sectorForIsat: einfalt match 61.10.0 → fjarskipti', () => {
  assert.equal(sectorForIsat(_SF, '61.10.0').slug, 'fjarskipti');
});
test('sectorForIsat: óþekkt → null', () => {
  assert.equal(sectorForIsat(_SF, '99.99'), null);
});
test('sectorForIsat: tómt/nullish → null', () => {
  assert.equal(sectorForIsat(_SF, ''), null);
  assert.equal(sectorForIsat(_SF, null), null);
});
```

- [ ] **Skref 2 — keyra próf → FAIL.** `cd web && node --test src/lib/atvinnugrein.test.mjs` → nýju prófin FALLA (`sectorForIsat is not a function`).

- [ ] **Skref 3 — útfæra.** Bæta í `web/src/lib/atvinnugrein.mjs` (nálægt `sectorsFromMap`):

```js
// Finnur grein (úr sectorsFromMap-úttaki) sem á ÍSAT-kóða félagsins. Lengsta-forskeyti-match á
// s.isats; virðir s.excl ("án X" → félag útilokað úr þeirri grein). Skilar grein-hlut eða null.
export function sectorForIsat(sectors, isat) {
  const digits = String(isat == null ? '' : isat).replace(/\D/g, '');
  if (!digits || !Array.isArray(sectors)) return null;
  let best = null, bestLen = -1;
  for (const s of sectors) {
    if (s.excl && s.excl.some((e) => digits.startsWith(e))) continue;   // útilokað úr þessari grein
    for (const c of (s.isats || [])) {
      if (digits.startsWith(c) && c.length > bestLen) { best = s; bestLen = c.length; }
    }
  }
  return best;
}
```

- [ ] **Skref 4 — keyra próf → PASS.** `cd web && node --test src/lib/atvinnugrein.test.mjs` → allt grænt (39 + 6 ný).

- [ ] **Skref 5 — commit** (ber `git add`, staðfestu staged-sett):

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
git add web/src/lib/atvinnugrein.mjs web/src/lib/atvinnugrein.test.mjs
git diff --cached --name-only    # STAÐFESTA: aðeins þessar 2 skrár
git commit -m "grein-rank: hrein sectorForIsat + prof"
```

---

### Task 2: Worker — `greinRankHandler` → `GET /api/grein-rank?kt=` (HUNK-STAGE worker.js)

**Files:** Modify `web/worker.js`. Read-first: `atvinnugreinHandler` (~L3083, isatClause+excl+binds), `roadsSectorsHandler` (~L3134, dedup-idiom `JOIN (SELECT kt,sala,MAX(ar) ar ... GROUP BY kt)`), import-lína `from './src/lib/atvinnugrein.mjs'`, route-blokk (~L4587), `_ajson`, `augGet`.

**Consumes:** `sectorForIsat` (Task 1), `sectorsFromMap` (til), `augGet('sector_kpi.json')`, D1 `felog`+`fjarhagur`. **Produces:** `GET /api/grein-rank?kt=` → `{ok:true, kt, slug, label, rank, total, sala}` (opinn).

- [ ] **Skref 1 — bæta `sectorForIsat` í import.** Finna línuna `import { sectorsFromMap, herfindahl, toppNShare } from './src/lib/atvinnugrein.mjs';` og bæta `sectorForIsat` við: `import { sectorsFromMap, herfindahl, toppNShare, sectorForIsat } from './src/lib/atvinnugrein.mjs';`

- [ ] **Skref 2 — bæta handler** rétt á eftir `atvinnugreinHandler` (á eftir línu ~3128, `}` þess):

```js
// ── 🏭 Grein-rank: röðun félags í atvinnugrein sinni (OPIÐ, úr opinberum ársreikningum) ──
// GET /api/grein-rank?kt= → { rank, total, slug, label, sala }. Nýjasta ár per kt (dedup), engin gátt.
async function greinRankHandler(request, env, ctx) {
  const url = new URL(request.url);
  const kt = (url.searchParams.get('kt') || '').replace(/\D/g, '');
  if (!kt) return _ajson({ ok: false, error: 'kt' });
  if (!env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/grein-rank?kt=' + kt);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  // grein félagsins úr bökuðum viðmiðum
  const felag = await env.TENGSL.prepare('SELECT isat_primary FROM felog WHERE kt=?').bind(kt).first().catch(() => null);
  const sk = await augGet(env, 'sector_kpi.json').catch(() => null);
  const sec = (felag && felag.isat_primary && sk && sk.map) ? sectorForIsat(sectorsFromMap(sk.map), felag.isat_primary) : null;
  if (!sec) return _ajson({ ok: true, kt, slug: null, label: null, rank: null, total: null, sala: null });
  // greinar-sía (eins og atvinnugreinHandler): mis-löng forskeyti + útilokun, kóðar bundnir (?), aðeins c.length í streng
  const binds = [];
  const isatClause = sec.isats.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
  let where = '(' + isatClause + ')';
  if (sec.excl && sec.excl.length) {
    const exClause = sec.excl.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
    where += ' AND NOT (' + exClause + ')';
  }
  // efnis-félagsins velta (nýjasta ár); getur verið null → rank verður null
  const me = await env.TENGSL.prepare('SELECT sala FROM fjarhagur WHERE kt=? AND sala IS NOT NULL ORDER BY ar DESC LIMIT 1').bind(kt).first().catch(() => null);
  const sala = (me && me.sala != null) ? me.sala : null;
  // talning yfir grein — nýjasta ár PER kt (dedup, eins og roadsSectorsHandler; annars tvítelur fjölár)
  const cnt = await env.TENGSL.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN fj.sala > ? THEN 1 ELSE 0 END) higher
     FROM felog f JOIN (SELECT kt, sala, MAX(ar) ar FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj ON fj.kt=f.kt
     WHERE ${where}`
  ).bind(sala == null ? -1 : sala, ...binds).first().catch(() => null);
  const total = (cnt && cnt.total != null) ? cnt.total : null;
  const rank = (sala != null && cnt && cnt.higher != null) ? cnt.higher + 1 : null;
  const payload = JSON.stringify({ ok: true, kt, slug: sec.slug, label: sec.label, rank, total, sala });
  const resp = new Response(payload, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
```

- [ ] **Skref 3 — route.** Rétt hjá `/api/atvinnugrein`-route (~L4587) bæta við:

```js
    if (url.pathname === '/api/grein-rank') return greinRankHandler(request, env, ctx);   // grein-rank: röðun félags í grein (opið)
```

- [ ] **Skref 4 — verify + HUNK-STAGE.** `node --check` á COMMITTUÐU blob-i:

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
# stage AÐEINS þína hunka í worker.js (ekki nemandi/gameUser-hunka samhliða session):
git diff web/worker.js > /tmp/wk.diff        # skoða — aðeins greinRankHandler/import/route
git apply --cached /tmp/wk.diff               # EF diff-ið inniheldur BARA þína hunka; annars handvirkt hunk-val
git diff --cached --name-only                 # STAÐFESTA: web/worker.js (+ ekkert óskylt)
git show :web/worker.js > /tmp/w.js && node --check /tmp/w.js && echo WORKER_OK
git commit -m "grein-rank: /api/grein-rank (opinn rankendapunktur ur D1)"
```

Ef `git diff web/worker.js` inniheldur samhliða `nemandi`/`gameUser`-breytingar → EKKI `git apply --cached` á heildinni; nota `git apply --cached` á handvirkt-síaðan diff sem inniheldur AÐEINS `greinRankHandler`, import-línuna og route-línuna.

---

### Task 3: Client — auðga `fsWireSector` (fyrirtaeki.astro)

**Files:** Modify `web/src/pages/fyrirtaeki.astro`. Read-first: `fsWireSector` (~L1406-1442), F2-CSS (~L299-302), lobbyvakt-import (~L494).

**Consumes:** `GET /api/grein-rank?kt=` (Task 2), `slugify` (til í `atvinnugrein.mjs`). **Produces:** ekkert (loka-lag).

- [ ] **Skref 1 — import slugify.** Nálægt línu 494 (`import { isatToSector, SECTORS, filterFeed } from '../lib/lobbyvakt.mjs';`) bæta við:

```js
    import { slugify } from '../lib/atvinnugrein.mjs';
```

- [ ] **Skref 2 — CSS.** Nálægt F2-CSS (eftir `.fs-sector { margin-top: 8px; }`, ~L300) bæta við:

```css
    .fs-sec-rank { font-size: 13px; color: #eaf1fb; margin: 5px 0 3px; }
    .fs-sec-rank b { color: #f6b13b; }
    .fs-sec-h { display: block; color: #8595ad; font-size: 11px; margin-top: 1px; }
    .fs-sec-link { display: inline-block; margin-top: 7px; color: #f6b13b; text-decoration: none; font-size: 13px; font-weight: 600; }
    .fs-sec-link:hover { text-decoration: underline; }
```

- [ ] **Skref 3 — auðga `fsWireSector`.** Í `fsWireSector(f)` (~L1406): (a) ræsa rank-fetch samhliða `fsSectorData`; (b) bæta EBIT + hagkerfi (`H`) í `defs`; (c) uppfæra body-map fyrir nýja tuple-röð + hagkerfis-frumu; (d) röð-lína + hlekkur í `host.innerHTML`.

**(a)** Beint á eftir `if (!host || !f || !f.fjarhagur || !f.fjarhagur.length) return;` (L1408) bæta:

```js
      const rankP = fetch('/api/grein-rank?kt=' + encodeURIComponent(f.kt || '')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
```

**(b)** Skipta út `defs`-fylkinu (L1420-1427) fyrir (bætir EBIT-hlutfalli + hagkerfis-dálki `H` í hvern tuple → `[label, cv, sv, hv, fmt, hi]`):

```js
      const H = sec.heild || {};
      const defs = [
        ['Framlegð', k.framlegd, S.framlegd, H.framlegd, fsPct1, true],
        ['Hagnaðarhlutfall', k.hagnhlutf, S.hagnadarhlutfall, H.hagnadarhlutfall, fsPct1, true],
        ['EBIT-hlutfall', k.rekstrarhlutf, S.ebit_hlutfall, H.ebit_hlutfall, fsPct1, true],
        ['Eiginfjárhlutfall', k.eiginfjarhlutf, S.eiginfjarhlutfall, H.eiginfjarhlutfall, fsPct1, true],
        ['Eignavelta', k.eignavelta, S.eignavelta, H.eignavelta, fsRat, true],
        ['Tekjur á starfsmann', tps, S.tekjur_pr_starfsm_mkr, H.tekjur_pr_starfsm_mkr, mkrPer, true],
        ['Skuldir / eigið fé', k.de, S.skuldahlutfall_DE, H.skuldahlutfall_DE, fsRat, false],
      ].filter((d) => d[1] != null && d[2] != null);
```

**(c)** Skipta út body-map (L1429-1437) fyrir (nýir vísar: `d[3]=hv, d[4]=fmt, d[5]=hi`; hagkerfis-fruma):

```js
      const body = defs.map((d) => {
        const cv = d[1], sv = d[2], hv = d[3], fmt = d[4], hi = d[5], better = hi ? cv >= sv : cv <= sv;
        const mx = Math.max(Math.abs(cv), Math.abs(sv)) || 1;
        const cw = Math.max(2, Math.min(100, Math.abs(cv) / mx * 100)), tick = Math.max(0, Math.min(100, Math.abs(sv) / mx * 100));
        const hcell = (hv != null) ? '<span class="fs-sec-h">hagkerfi ' + fmt(hv) + '</span>' : '';
        return '<div class="fs-sec-r"><span class="fs-sec-l">' + d[0] + '</span>'
          + '<span class="fs-sec-bar"><i class="fs-sec-fill ' + (better ? 'up' : 'dn') + '" style="width:' + cw.toFixed(0) + '%"></i><i class="fs-sec-tick" style="left:' + tick.toFixed(0) + '%" title="Greinar-viðmið"></i></span>'
          + '<span class="fs-sec-c ' + (better ? 'up' : 'dn') + '">' + fmt(cv) + '</span>'
          + '<span class="fs-sec-s">grein ' + fmt(sv) + hcell + '</span></div>';
      }).join('');
```

**(d)** Beint á eftir `body`-línunni (fyrir `host.hidden = false;`, L1438) bæta rank-línu + hlekk, og skjóta þeim inn í `host.innerHTML`:

```js
      const rk = await rankP;
      const rankLine = (rk && rk.ok && rk.rank) ? '<div class="fs-sec-rank">Þitt félag er <b>#' + rk.rank + '</b> stærst af ' + rk.total + ' í greininni (velta)</div>' : '';
      const rslug = (rk && rk.ok && rk.slug) ? rk.slug : (S.label ? slugify(S.label) : '');
      const linkLine = '<a class="fs-sec-link" href="/atvinnugreinar/' + (rslug ? rslug + '/' : '') + '">→ Sjá alla greinina (stærstu félög + samþjöppun)</a>';
```

Svo breyta `host.innerHTML = ...` (L1439-1441) þannig að `rankLine` komi á eftir `fs-sub`-titlinum og `linkLine` á eftir `fs-sec-grid`:

```js
      host.hidden = false;
      host.innerHTML = '<div class="fs-sub">🏭 Samanburður við atvinnugrein <i class="tip" tabindex="0" data-tip="Leiðbeinandi viðmið úr heild atvinnugreinarinnar (Hagstofa FYR08010, ' + (S.ar || sec.ar || '') + '). Grein: ' + escF(S.label || '') + '. Grænt = betra en greinin. Ekki fjárfestingarráðgjöf.">ⓘ</i></div>'
        + rankLine
        + '<div class="fs-sec-grid">' + body + '</div>'
        + linkLine
        + '<div class="fs-sec-note">Viðmið: ' + escF(S.label || '') + ' · Hagstofa ' + (S.ar || sec.ar || '') + ' — leiðbeinandi, ekki nákvæmt jafngildi lykiltalna félagsins.</div>';
```

- [ ] **Skref 4 — verify.** `cd web && npx astro build` → tekst (~3647 síður, engar nýjar). Sjónræn staðfesting kemur í Task 4 (live).

- [ ] **Skref 5 — commit** (ber `git add`):

```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt"
git add web/src/pages/fyrirtaeki.astro
git diff --cached --name-only    # STAÐFESTA: aðeins fyrirtaeki.astro
git commit -m "grein-rank: audga F2-kassann (rodun + hlekkur + EBIT + hagkerfi)"
```

---

### Task 4: Loka-verify + deploy

- [ ] **Skref 1 — full grænt hlið:** `cd web && node --test src/lib/atvinnugrein.test.mjs` (grænt) · `git show HEAD:web/worker.js > /tmp/w.js && node --check /tmp/w.js && echo OK` · `cd web && npx astro build`.
- [ ] **Skref 2 — deploy:** pusha commit-unum 3 (`git push origin HEAD:main`; rebase ef á eftir). Ef working tree óhreint af samhliða vinnu → cherry-pick á throwaway deploy-worktree (`git worktree add --detach <tmp> origin/main` → cherry-pick → push).
- [ ] **Skref 3 — live-verify** (eftir deploy-lag, browser/JS-eval): `GET /api/grein-rank?kt=<þekkt félag með ársreikning>` → `{ok:true, rank, total, slug}` óinnskráð (opinn); fyrirtækjaprófíll með ársreikning sýnir „Þitt félag er #N stærst af M" + „→ Sjá alla greinina"-hlekk á rétta `/atvinnugreinar/<slug>/`.

## Self-review

Spec-þekja: `sectorForIsat`(T1) · opinn `/api/grein-rank`(T2) · F2-auðgun rank+hlekkur+EBIT+hagkerfi(T3) · prófun(T1,T4) · dedup nýjasta-ár(T2 cnt-fyrirspurn) · persónuvernd=opinbert/eigin-velta(T2 skilar aðeins stöðu+fjölda) — allt dekkað. Viðmót: `sectorForIsat` skilgreint T1, notað T2+T3(via slug í svari). Tuple-röð `defs`=`[label,cv,sv,hv,fmt,hi]` samræmd milli (b)+(c) í T3. Engir placeholders. T2 einn á worker.js (hunk-stage). Dedup-idiom = staðfest `roadsSectorsHandler`-mynstur. Launahlutfall vísvitandi frestað (spec §7).
