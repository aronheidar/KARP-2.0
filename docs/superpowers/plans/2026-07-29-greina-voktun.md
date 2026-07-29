# Greina-vöktun í Fyrirtækjavaktina — útfærsluáætlun

> **Fyrir agentic-verkamenn:** superpowers:subagent-driven-development eða inline. Skref `- [ ]`.

**Markmið:** Vaktað félag (firmavakt) → vikuleg „🏭 Röð í grein breyttist"-viðvörun (áfangar topp-1/3/5/10 EÐA ≥3 sæti). Digest-only.

**Arkitektúr:** Hrein `rankMovement`; worker dregur út `computeGreinRank` (úr greinRankHandler), geymir viku-röð í D1 `grein_rank_last`, díffar í `digestShared` og bætir kafla í `digestBuild`. Spec: `docs/superpowers/specs/2026-07-29-greina-voktun-design.md`.

## Global Constraints

- Samhliða-session á `web/worker.js` → **hunk-stage AÐEINS þína hunka** (`git apply --cached`, engin `nemandi`/`gameUser`), ALDREI `git add web/worker.js`/`-A`. Aðrar skrár berur `git add`. Committa strax, EKKI pusha.
- Grænt hlið: `node --test src/lib/vaktir-signals.test.mjs` · `node --check web/worker.js` · `astro build`.

---

### Task 1: `rankMovement` + próf (vaktir-signals.mjs)

**Files:** Modify `web/src/lib/vaktir-signals.mjs`, `web/src/lib/vaktir-signals.test.mjs`.

- [ ] **Skref 1 — próf** (bæta `rankMovement` í import + aftast í test):

```js
test('rankMovement: inn í topp-3 (5→2) → milestone up', () => { const m = rankMovement({ rank: 5 }, { rank: 2 }); assert.equal(m.dir, 'up'); assert.equal(m.badge, '↑ í topp 3'); });
test('rankMovement: nýtt #1 (2→1)', () => { assert.equal(rankMovement({ rank: 2 }, { rank: 1 }).badge, '🥇 nýtt #1 í greininni'); });
test('rankMovement: út úr topp-5 (4→7) → milestone down', () => { assert.equal(rankMovement({ rank: 4 }, { rank: 7 }).badge, '↓ úr topp 5'); });
test('rankMovement: stökk niður (40→36) → jump', () => { const m = rankMovement({ rank: 40 }, { rank: 36 }); assert.equal(m.kind, 'jump'); assert.equal(m.badge, '↑ 4 sæti'); });
test('rankMovement: smá-rek (40→41) → null', () => { assert.equal(rankMovement({ rank: 40 }, { rank: 41 }), null); });
test('rankMovement: óbreytt/null → null', () => { assert.equal(rankMovement({ rank: 3 }, { rank: 3 }), null); assert.equal(rankMovement(null, { rank: 3 }), null); assert.equal(rankMovement({ rank: 3 }, { rank: null }), null); });
```

- [ ] **Skref 2 — FAIL.** Skref 3 — útfæra (bæta aftast í `vaktir-signals.mjs`):

```js
// Merkingarbær röð-hreyfing (áfangar + stór stökk) fyrir greina-vöktun. prev/cur = {rank}.
// Áfangar: inn/út úr topp-1/3/5/10. Stökk: |Δ|>=3. Smá-rek → null.
const _RANK_TIERS = [1, 3, 5, 10];
function _rankTier(r) { for (const t of _RANK_TIERS) if (r <= t) return t; return Infinity; }
export function rankMovement(prev, cur) {
  const p = (prev && Number.isFinite(prev.rank)) ? prev.rank : null;
  const c = (cur && Number.isFinite(cur.rank)) ? cur.rank : null;
  if (p == null || c == null || p === c) return null;
  const dir = c < p ? 'up' : 'down';
  const tp = _rankTier(p), tc = _rankTier(c);
  const delta = Math.abs(c - p);
  const milestone = tp !== tc;
  if (!milestone && delta < 3) return null;
  let badge;
  if (c === 1 && p > 1) badge = '🥇 nýtt #1 í greininni';
  else if (milestone && dir === 'up') badge = '↑ í topp ' + tc;
  else if (milestone && dir === 'down') badge = '↓ úr topp ' + tp;
  else badge = (dir === 'up' ? '↑ ' : '↓ ') + delta + ' sæti';
  return { dir, kind: milestone ? 'milestone' : 'jump', badge, fromRank: p, toRank: c };
}
```

- [ ] **Skref 4 — PASS.** Skref 5 — commit: `git add web/src/lib/vaktir-signals.mjs web/src/lib/vaktir-signals.test.mjs && git commit -m "Greina-voktun: hrein rankMovement + prof"`.

---

### Task 2: Worker — computeGreinRank útdráttur + grein_rank_last + digest (HUNK-STAGE)

**Files:** Modify `web/worker.js`. Read-first: `greinRankHandler` (L3142-3179), `digestShared` (sh.bygg7 + `return sh;`), digestBuild 🏗️-kafli + 🏛️-lobbyvakt-comment, `eftNylegt/byggMatch` import.

- [ ] **Skref 1 — import.** Bæta `rankMovement` í `import { eftNylegt, byggMatch } from './src/lib/vaktir-signals.mjs';` → `import { eftNylegt, byggMatch, rankMovement } from './src/lib/vaktir-signals.mjs';`

- [ ] **Skref 2 — computeGreinRank + þunnur handler.** Skipta `greinRankHandler` (L3142-3179) út fyrir:

```js
// Reiknar röð félags í atvinnugrein sinni (deilt af greinRankHandler + digest greina-vöktun).
async function computeGreinRank(env, kt) {
  if (!env || !env.TENGSL || !kt) return { slug: null, label: null, rank: null, total: null, sala: null };
  const felag = await env.TENGSL.prepare('SELECT isat_primary FROM felog WHERE kt=?').bind(kt).first().catch(() => null);
  const sk = await augGet(env, 'sector_kpi.json').catch(() => null);
  const sec = (felag && felag.isat_primary && sk && sk.map) ? sectorForIsat(sectorsFromMap(sk.map), felag.isat_primary) : null;
  if (!sec) return { slug: null, label: null, rank: null, total: null, sala: null };
  const binds = [];
  const isatClause = sec.isats.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
  let where = '(' + isatClause + ')';
  if (sec.excl && sec.excl.length) {
    const exClause = sec.excl.map((c) => { binds.push(c); return `substr(f.isat_primary,1,${c.length})=?`; }).join(' OR ');
    where += ' AND NOT (' + exClause + ')';
  }
  const me = await env.TENGSL.prepare('SELECT sala FROM fjarhagur WHERE kt=? AND sala IS NOT NULL ORDER BY ar DESC LIMIT 1').bind(kt).first().catch(() => null);
  const sala = (me && me.sala != null) ? me.sala : null;
  const cnt = await env.TENGSL.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN fj.sala > ? THEN 1 ELSE 0 END) higher
     FROM felog f JOIN (SELECT kt, sala, MAX(ar) ar FROM fjarhagur WHERE sala IS NOT NULL GROUP BY kt) fj ON fj.kt=f.kt
     WHERE ${where}`
  ).bind(sala == null ? -1 : sala, ...binds).first().catch(() => null);
  const total = (cnt && cnt.total != null) ? cnt.total : null;
  const rank = (sala != null && cnt && cnt.higher != null) ? cnt.higher + 1 : null;
  return { slug: sec.slug, label: sec.label, rank, total, sala };
}
async function greinRankHandler(request, env, ctx) {
  const url = new URL(request.url);
  const kt = (url.searchParams.get('kt') || '').replace(/\D/g, '');
  if (!kt) return _ajson({ ok: false, error: 'kt' });
  if (!env.TENGSL) return _ajson({ ok: false, error: 'unconfigured' });
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/api/grein-rank?kt=' + kt);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const r = await computeGreinRank(env, kt);
  const payload = JSON.stringify({ ok: true, kt, slug: r.slug, label: r.label, rank: r.rank, total: r.total, sala: r.sala });
  const resp = new Response(payload, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
```

- [ ] **Skref 3 — digestShared.** Beint á undan `return sh;` (eftir `sh.bygg7 = ...`-línuna) bæta:

```js
  // Greina-vöktun: röð-hreyfing vöktaðra félaga (firmavakt) í grein sinni (grein_rank_last viku-díff).
  sh.rankMoves = {};
  await env.TENGSL.prepare('CREATE TABLE IF NOT EXISTS grein_rank_last (kt TEXT PRIMARY KEY, slug TEXT, label TEXT, rank INTEGER, total INTEGER, sala INTEGER, ts INTEGER)').run().catch(() => {});
  const _watchKts = new Set();
  for (const row of (((await env.TENGSL.prepare("SELECT v FROM user_prefs WHERE k='firmavakt'").all().catch(() => ({ results: [] }))).results) || [])) {
    try { const fv = JSON.parse(row.v); if (fv && Array.isArray(fv.felog)) for (const co of fv.felog) { if (co && co.kt) _watchKts.add(String(co.kt).replace(/\D/g, '')); } } catch (e) {}
  }
  for (const kt of _watchKts) {
    const cur = await computeGreinRank(env, kt);
    if (cur.rank == null) continue;
    const prev = await env.TENGSL.prepare('SELECT rank, total FROM grein_rank_last WHERE kt=?').bind(kt).first().catch(() => null);
    const mv = rankMovement(prev, cur);
    if (mv) sh.rankMoves[kt] = { ...mv, slug: cur.slug, label: cur.label, total: cur.total };
    await env.TENGSL.prepare('INSERT INTO grein_rank_last (kt,slug,label,rank,total,sala,ts) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kt) DO UPDATE SET slug=excluded.slug,label=excluded.label,rank=excluded.rank,total=excluded.total,sala=excluded.sala,ts=excluded.ts').bind(kt, cur.slug, cur.label, cur.rank, cur.total, cur.sala, now).run().catch(() => {});
  }
```

- [ ] **Skref 4 — digestBuild.** Beint á undan `// ── 🏛️ Lobbývaktin þín`-kaflanum (á eftir 🏗️-blokkinni) bæta:

```js
  // ── 🏭 Röð í atvinnugrein — vöktað félag færðist til (firmavakt → grein_rank_last díff) ──
  const fmvR = prefs.firmavakt;
  if (fmvR && fmvR.on && Array.isArray(fmvR.felog) && fmvR.felog.length && sh.rankMoves && Object.keys(sh.rankMoves).length) {
    let sec = '';
    for (const co of fmvR.felog) {
      if (!co || !co.kt) continue;
      const mv = sh.rankMoves[String(co.kt).replace(/\D/g, '')];
      if (!mv) continue;
      sec += li('🏭 ' + (co.nafn || co.kt) + ' — ' + mv.badge, 'færðist úr #' + mv.fromRank + ' í #' + mv.toRank + ' af ' + mv.total + ' í ' + (mv.label || 'greininni'), 'https://karp.is/atvinnugreinar/' + (mv.slug ? mv.slug + '/' : ''));
    }
    if (sec) { rows += H('🏭', 'Röð í atvinnugrein breyttist') + sec; personal = true; }
  }
```

- [ ] **Skref 5 — verify + HUNK-STAGE.** `node --check` á COMMITTUÐU blob → commit „Greina-voktun: computeGreinRank utdrattur + grein_rank_last vikudiff + digest-kafli".

---

### Task 3: Loka-verify + deploy

- [ ] Grænt hlið (test/check/build). Deploy (push / cherry-pick á throwaway worktree ef divergað). Live: `/api/grein-rank?kt=<þekkt>` óbreytt (útdráttur breytir ekki svari); digest 🏭 = Aron í mánudags-keyrslu.

## Self-review

Þekja: `rankMovement`(T1) · `computeGreinRank`+snapshot+digest(T2) · próf(T1). Viðmót: `rankMovement(prev,cur)` T1→T2; `computeGreinRank` skilar `{slug,label,rank,total,sala}` notað bæði í handler+digest. `/api/grein-rank`-svar ÓBREYTT (útdráttur). Engir placeholders. Frestað: prófíl-merki, strax/daglegt.
