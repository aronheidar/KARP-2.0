# Eftirlits- + byggingavaktir → raun-vaktir — útfærsluáætlun

> **Fyrir agentic-verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Ferskur subagent per verk + rýni. Skref nota `- [ ]`.

**Markmið:** Gera /eftirlit/ + /byggingarvakt/ að raun-vöktum — eftirlit (kt) → Fyrirtækjavaktin (`firmavakt`), bygging (heimilisfang/póstnr) → Fasteignavaktin (`fastvakt`): tveir digest-kaflar + „Vakta"-hnappar. Engin ný stök vakt.

**Arkitektúr:** Hrein `vaktir-signals.mjs` (`eftNylegt`/`byggMatch`); worker digest les `eftirlit.json`+`byggingarleyfi_vakt.json` og bætir 2 köflum sem para við firmavakt.kt / fastvakt.q; síður fá Vakta-hnappa sem RENNA í firmavakt/fastvakt (endurnýta `fyrirtaeki.astro:1844` / `fasteignavakt.astro:381`). Spec: `docs/superpowers/specs/2026-07-29-eftirlit-bygg-vaktir-design.md`.

**Tæknistafli:** Astro (client) + Cloudflare Worker (digest-cron) + node:test.

## Global Constraints (öll verk)

- **Sameiginlegur worktree — samhliða session breytir `web/worker.js`:** Verk 2 STAGE-ar AÐEINS sína hunka (`git apply --cached` af eigin diff, ENGIN `nemandi`/`gameUser`/óskyld lína), ALDREI `git add web/worker.js`/`-A`. Aðrar skrár berur `git add <slóð>` + `git diff --cached --name-only`. Committa STRAX, EKKI pusha (orchestrator pushar).
- **Gögn opinber (RVK):** engin ný gátt (erfa firmavakt/fastvakt). Bygging GDPR-ritskoðuð þegar (engin kt/nöfn). Vakta-skrif = login-only (óinnskráð → `loginHref()`).
- **KARP-venjur:** `_dget` skilar `null`→tómt (kaflar sleppast); `_esc`/`esc` á öllu.
- **Grænt hlið (per verk):** `cd web && node --test src/lib/vaktir-signals.test.mjs` · `node --check web/worker.js` (COMMITTAÐ blob ef hunk-stagað) · `cd web && npx astro build`.

---

### Task 1: Hrein `vaktir-signals.mjs` + próf

**Files:** Create `web/src/lib/vaktir-signals.mjs`, `web/src/lib/vaktir-signals.test.mjs`.

**Produces:** `eftNylegt(iso, wkDate)` → bool; `byggMatch(item, q)` → bool. Notað af Verki 2.

- [ ] **Skref 1 — próf fyrst.** `web/src/lib/vaktir-signals.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { eftNylegt, byggMatch } from './vaktir-signals.mjs';

test('eftNylegt: nýleg dagsetning (>=wk) → true', () => { assert.equal(eftNylegt('2026-07-25', '2026-07-22'), true); });
test('eftNylegt: full ISO slice → true', () => { assert.equal(eftNylegt('2026-07-25T10:00:00Z', '2026-07-22'), true); });
test('eftNylegt: gömul dagsetning → false', () => { assert.equal(eftNylegt('2026-07-20', '2026-07-22'), false); });
test('eftNylegt: tómt/nullish → false', () => { assert.equal(eftNylegt('', '2026-07-22'), false); assert.equal(eftNylegt(null, '2026-07-22'), false); });
test('byggMatch: póstnúmer (3ja stafa q) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, '101'), true); });
test('byggMatch: rangt póstnúmer → false', () => { assert.equal(byggMatch({ pn: '105', a: 'Bragagata 26' }, '101'), false); });
test('byggMatch: gatna-forskeyti (case-insensitive) → true', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'braga'), true); });
test('byggMatch: ósamsvarandi gata → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, 'Laufás'), false); });
test('byggMatch: tómt q → false', () => { assert.equal(byggMatch({ pn: '101', a: 'Bragagata 26' }, ''), false); });
```

- [ ] **Skref 2 — keyra → FAIL.** `cd web && node --test src/lib/vaktir-signals.test.mjs`.

- [ ] **Skref 3 — útfæra.** `web/src/lib/vaktir-signals.mjs`:

```js
// vaktir-signals.mjs — hrein rökvél fyrir eftirlits-/byggingar-vöktun (engin I/O; prófuð).
// Deilt af worker.js digest (eftirlit→firmavakt, bygging→fastvakt).

// Nýleiki eftir ISO-dagsetningu vs viku-mörk (yyyy-mm-dd streng, sama og digest wkDate). true ef iso >= wkDate.
export function eftNylegt(iso, wkDate) {
  const d = String(iso == null ? '' : iso).slice(0, 10);
  return !!d && !!wkDate && d >= String(wkDate);
}

// Byggingar-pörun við fastvakt-leitarorð q: 3ja-stafa q → póstnúmer (item.pn===q); annars gatna-forskeyti
// (item.a lágstafað byrjar á q). Tómt q → false. Sleppir sv (byggingar bera hverfi, ekki kaupskrá-svæði).
export function byggMatch(item, q) {
  const s = String(q == null ? '' : q).toLowerCase().trim();
  if (!s || !item) return false;
  if (/^\d{3}$/.test(s)) return String(item.pn || '') === s;
  return String(item.a || '').toLowerCase().startsWith(s);
}
```

- [ ] **Skref 4 — keyra → PASS.** Skref 5 — commit: `git add web/src/lib/vaktir-signals.mjs web/src/lib/vaktir-signals.test.mjs` → `git diff --cached --name-only` (aðeins þessar 2) → `git commit -m "Eftirlit/bygg-vaktir: hrein vaktir-signals + prof"`.

---

### Task 2: Worker — 2 digest-kaflar (HUNK-STAGE worker.js)

**Files:** Modify `web/worker.js`. Read-first: `digestShared` (~L4020-4039, `wkDate`+`sh`+`_dget`), `digestBuild` firmavakt-kafli (`H('🅡', 'Ný vörumerki…')`) + fastvakt-kafli (`H('🏠', 'Fasteignavaktin…')`), import-blokk efst.

**Consumes:** `eftNylegt`/`byggMatch` (Task 1), `_dget`, `_esc`, `li`, `dIS`, `H`. **Produces:** 🍽️/🏗️ digest-kaflar.

- [ ] **Skref 1 — import.** Bæta nýrri línu hjá lobbyvakt-import (lína ~7): `import { eftNylegt, byggMatch } from './src/lib/vaktir-signals.mjs';   // Eftirlits-/byggingar-vöktun (digest-pörun)`

- [ ] **Skref 2 — digestShared.** Beint á undan `return sh;` (enda digestShared) bæta:

```js
  sh.wkDate = wkDate;
  // Eftirlit (heilbrigðiseftirlit RVK) — byKt fyrir firmavakt-pörun.
  const _eft = await _dget(env, '/gogn/eftirlit.json');
  sh.eftByKt = {};
  for (const s of ((_eft && _eft.stadir) || [])) { if (s && s.kt) { const k = String(s.kt).replace(/\D/g, ''); (sh.eftByKt[k] || (sh.eftByKt[k] = [])).push(s); } }
  // Byggingarleyfi RVK — nýleg mál (7 dagar) fyrir fastvakt-pörun.
  const _bygg = await _dget(env, '/gogn/byggingarleyfi_vakt.json');
  sh.bygg7 = (((_bygg && _bygg.recent) || []).filter((x) => x && String(x.date || '').slice(0, 10) >= wkDate));
```

- [ ] **Skref 3 — digestBuild: 2 kaflar.** Beint á eftir firmavakt-kaflanum (línan `if (sec) { rows += H('🅡', 'Ný vörumerki hjá félögum á vaktinni') + sec; personal = true; }` og lokandi `}` hans) bæta báðum köflum:

```js
  // ── 🍽️ Heilbrigðiseftirlit — nýjar skoðanir hjá vökuðum félögum (firmavakt → eftirlit eftir kt) ──
  const fmvE = prefs.firmavakt;
  if (fmvE && fmvE.on && Array.isArray(fmvE.felog) && fmvE.felog.length && sh.eftByKt) {
    let sec = '', n = 0;
    for (const co of fmvE.felog) {
      if (!co || !co.kt) continue;
      const kt = String(co.kt).replace(/\D/g, '');
      for (const s of (sh.eftByKt[kt] || [])) {
        if (!eftNylegt(s.lastInspectionISO, sh.wkDate)) continue;
        n++; if (n > 10) break;
        const bad = (s.rating != null && s.rating <= 1);
        sec += li((bad ? '⚠️ ' : '') + (s.name || co.nafn || kt) + ' — einkunn ' + (s.rating != null ? s.rating : '?') + (s.ratingLabel ? ' (' + s.ratingLabel + ')' : ''), (co.nafn || '') + (s.street ? ' · ' + s.street : ''), s.reportUrl || '');
      }
      if (n > 10) break;
    }
    if (sec) { rows += H('🍽️', 'Nýtt heilbrigðiseftirlit hjá félögum á vaktinni') + sec; personal = true; }
  }
  // ── 🏗️ Byggingarleyfi — ný mál á vökuðum svæðum (fastvakt → bygg eftir póstnr/götu) ──
  const fvB = prefs.fastvakt;
  if (fvB && fvB.on && Array.isArray(fvB.vaktir) && fvB.vaktir.length && Array.isArray(sh.bygg7) && sh.bygg7.length) {
    let sec = '', n = 0; const seen = new Set();
    for (const x of sh.bygg7) {
      if (!(fvB.vaktir.some((w) => w && byggMatch(x, w.q)))) continue;
      const key = x.caseNo || (String(x.a || '') + x.date);
      if (seen.has(key)) continue; seen.add(key);
      n++; if (n <= 8) sec += li((x.addr || x.a || '') + (x.desc ? ' — ' + String(x.desc).slice(0, 70) : ''), (dIS(x.date) + (x.hverfi ? ' · ' + x.hverfi : '') + (x.decisionCode ? ' · ' + x.decisionCode : '')).trim(), 'https://karp.is/byggingarvakt/');
    }
    if (n) { rows += H('🏗️', 'Ný byggingarleyfi á svæðum á vaktinni') + sec; if (n > 8) rows += li('… og ' + (n - 8) + ' til viðbótar', '', 'https://karp.is/byggingarvakt/'); personal = true; }
  }
```

**ATH:** `byggMatch` les `item.a` (fastvakt-snið) EN byggingar-met bera `addr`. Því: í digestShared-síunni (Skref 2) bæta `a`-samnefni svo `byggMatch` virki — breyta `sh.bygg7`-línu í: `sh.bygg7 = (((_bygg && _bygg.recent) || []).filter((x) => x && String(x.date || '').slice(0,10) >= wkDate).map((x) => ({ ...x, a: x.addr, pn: x.postnr })));` (bætir `a`/`pn` sem `byggMatch` og `li` nota).

- [ ] **Skref 4 — verify + HUNK-STAGE.** `git diff web/worker.js` → staðfesta AÐEINS þínir hunkar (import + digestShared + 2 kaflar; engin `nemandi`/`gameUser`). `git apply --cached` (síaðan diff ef þarf) → `git show :web/worker.js > /tmp/w.js && node --check /tmp/w.js && echo WORKER_OK` → `git commit -m "Eftirlit/bygg-vaktir: digest-kaflar (eftirlit->firmavakt, bygg->fastvakt)"`.

---

### Task 3: Vakta-hnappar á báðum síðum (subagent)

**Files:** Modify `web/src/pages/eftirlit.astro`, `web/src/pages/byggingarvakt.astro`. Read-first: allur `eftirlit.astro` (leitanleg skrá/kort + client-eyja), `byggingarvakt.astro`; `fyrirtaeki.astro:1844-1855` (firmavakt-toggle), `fasteignavakt.astro:380-381` (fastvakt-save).

- [ ] **Skref 1 — /eftirlit/ Vakta→firmavakt.** Bæta hnapp „🔔 Vakta félagið" per stað (eða áberandi per valinn stað) í leitanlegu skránni. Login-aware, **speglar `fyrirtaeki.astro:1844`**: `import { karpGet, karpPost, loginHref } from '../lib/auth.js'`. Smellur: ef óinnskráð (`karpGet('/firmavakt')` skilar ekki `felog`) → `location.href = loginHref()`; annars toggle `{kt: s.kt, nafn: s.name}` í `felog` → `karpPost('/firmavakt', { on:true, felog })`; texti „✓ Á vaktinni". `esc` á öllu. Nota `s.kt`+`s.name` úr eftirlits-metinu.

- [ ] **Skref 2 — /byggingarvakt/ Vakta→fastvakt.** Bæta hnapp „🔔 Vakta þetta svæði" per mál/heimilisfang (eða per hverfi/póstnúmer). Login-aware, **speglar `fasteignavakt.astro:380-381`**: `karpGet('/fastvakt')` → ef ekki þegar með `{q: x.postnr}` → `vaktir.concat([{ q: String(x.postnr) }]).slice(0,6)` → `karpPost('/fastvakt', { on:true, vaktir })`; óinnskráð → `loginHref()`. (Nota póstnúmer `x.postnr` sem `q` — virkar strax með digest-`byggMatch`.)

- [ ] **Skref 3 — verify + commit.** `cd web && npx astro build` (tekst). `git add web/src/pages/eftirlit.astro web/src/pages/byggingarvakt.astro` → `git diff --cached --name-only` (aðeins þessar 2) → `git commit -m "Eftirlit/bygg-vaktir: Vakta-hnappar (firmavakt/fastvakt)"`.

---

### Task 4: Loka-verify + deploy

- [ ] **Skref 1 — grænt hlið:** `cd web && node --test src/lib/vaktir-signals.test.mjs` · `git show HEAD:web/worker.js > /tmp/w.js && node --check /tmp/w.js` · `cd web && npx astro build`.
- [ ] **Skref 2 — deploy:** `git push origin HEAD:main` (cherry-pick á throwaway deploy-worktree ef origin á undan / working tree óhreint).
- [ ] **Skref 3 — live-verify:** `/eftirlit/` + `/byggingarvakt/` sýna „Vakta"-hnapp; óinnskráð smellur → innskráning. (Digest 🍽️/🏗️ + logged-in vaktun = Aron staðfestir í næstu mánudags-keyrslu / handvirkt.)

## Self-review

Spec-þekja: `eftNylegt`/`byggMatch`(T1) · digestShared eft/bygg + 2 digestBuild-kaflar(T2) · Vakta-hnappar(T3) · prófun(T1,T4) — allt dekkað. Viðmót: `byggMatch(item,q)` les `item.a`/`item.pn` → digestShared kortleggur `addr→a`,`postnr→pn` (Skref 3 ATH). firmavakt/fastvakt add-mynstur = staðfestur raun-kóði. Engir placeholders. T2 einn á worker.js (hunk-stage). Frestað: einkunn-lækkun (saga), hverfi↔svæði, strax/daglegt.
