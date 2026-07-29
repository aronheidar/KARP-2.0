# Lobbývakt 2.0 — sameina leitarorðavakt — útfærsluáætlun

> **Fyrir agentic-verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Ferskur subagent per verk + rýni. Skref nota `- [ ]`.

**Markmið:** Steypa leitarorðavakt (frí, fréttir) inn í Lobbývaktina (Fyrirtæki+, þingmál/samráð) — sama nafn/URL. Tvö lög: frítt frétta-lag + Fyrirtæki+ reglu-lag.

**Arkitektúr:** Ein leitarorða-listi (`union(lobbyvakt_ord, leitvakt.ord)`) matchar þvert á fréttir + þingmál + samráð. Þrepaskiptur `/api/lobbyvakt` (fréttir alltaf, reglur ef `_lobbyGate`), sameinaður digest-kafli, `/lobbyvakt/` opnast innskráðum. Spec: `docs/superpowers/specs/2026-07-29-lobbyvakt-merge-design.md`.

**Tæknistafli:** Astro (client-eyja) + Cloudflare Worker (D1 `env.TENGSL`) + node:test.

## Global Constraints (öll verk)

- **Sameiginlegur worktree — samhliða session breytir `web/worker.js`:** Verk 2 STAGE-ar AÐEINS sína hunka (`git apply --cached` af eigin diff, staðfest ENGIN `nemandi`/`gameUser`/óskyld lína), ALDREI `git add web/worker.js`/`-A`. Aðrar skrár (`lobbyvakt.mjs`, `lobbyvakt.test.mjs`, `lobbyvakt.astro`, `vaktir.astro`) = berur `git add <slóð>` + staðfestu `git diff --cached --name-only`. Committa STRAX, EKKI pusha (orchestrator pushar).
- **Gátun (KJARNI):** fréttir = FRÍTT (innskráð, engin afturför); reglur (þingmál/samráð + brief) = Fyrirtæki+ (`_lobbyGate`, account-based). Skrif á vaktir = login-only (óbreytt).
- **KARP-venjur:** worker-villur = HTTP 200 + `{ok:false,error}` (`_ajson`); D1/JSON `.catch`; `_esc`/`esc` á öllu client-megin.
- **Grænt hlið (per verk):** `cd web && node --test src/lib/lobbyvakt.test.mjs` · `node --check web/worker.js` (á COMMITTUÐU blob ef hunk-stagað) · `cd web && npx astro build`.

---

### Task 1: Hrein `matchNews` + próf

**Files:** Modify `web/src/lib/lobbyvakt.mjs`, `web/src/lib/lobbyvakt.test.mjs`.

**Produces:** `export function matchNews(item, ord)` → `true` ef eitthvert `ord` (lágstafað) er hlutstrengur af `(item.title + ' ' + (item.body||item.text)).toLowerCase()`. Fréttir bera `title`/`body` (endapunktur) eða `title`/`text` (digest `sh.news`). Notað af Task 2.

- [ ] **Skref 1 — próf fyrst.** Bæta `matchNews` í import efst í `lobbyvakt.test.mjs` (þar sem `matchKeyword` er flutt inn), og bæta prófum aftast:

```js
test('matchNews: leitarorð í titli → true', () => {
  assert.equal(matchNews({ title: 'Veiðigjald hækkar', body: '' }, ['veiðigjald']), true);
});
test('matchNews: leitarorð í body, case-insensitive → true', () => {
  assert.equal(matchNews({ title: 'Frétt', body: 'Um LAXELDI í firði' }, ['laxeldi']), true);
});
test('matchNews: les text-reit (sh.news-form) → true', () => {
  assert.equal(matchNews({ title: 'X', text: 'kvótinn seldur' }, ['kvóti']), true);
});
test('matchNews: ekkert match → false', () => {
  assert.equal(matchNews({ title: 'Óskylt', body: 'ekkert hér' }, ['veiðigjald']), false);
});
test('matchNews: tómt ord → false', () => {
  assert.equal(matchNews({ title: 'Veiðigjald', body: '' }, []), false);
});
```

- [ ] **Skref 2 — keyra → FAIL** (`matchNews is not a function`): `cd web && node --test src/lib/lobbyvakt.test.mjs`.

- [ ] **Skref 3 — útfæra.** Bæta í `lobbyvakt.mjs` beint á eftir `matchKeyword` (lína ~86, á undan `feedFor`):

```js
// Frétta-hliðstæða matchKeyword: fréttir bera title/body (endapunktur) eða title/text (digest sh.news),
// EKKI titill/brief/efni. true ef eitthvert ord (lágstafað) er hlutstrengur af (title + ' ' + (body||text)).
export function matchNews(item, ord) {
  const words = Array.isArray(ord) ? ord : [];
  if (!words.length) return false;
  const hay = `${(item && item.title) || ''} ${(item && (item.body || item.text)) || ''}`.toLowerCase();
  return words.some((w) => { const s = String(w == null ? '' : w).toLowerCase(); return !!s && hay.includes(s); });
}
```

- [ ] **Skref 4 — keyra → PASS** (allt grænt, ~29 + 5 ný).

- [ ] **Skref 5 — commit:** `git add web/src/lib/lobbyvakt.mjs web/src/lib/lobbyvakt.test.mjs` → `git diff --cached --name-only` (aðeins þessar 2) → `git commit -m "Lobbyvakt 2.0: hrein matchNews + prof"`.

---

### Task 2: Worker — þrepaskiptur endapunktur + digest-sameining (HUNK-STAGE worker.js)

**Files:** Modify `web/worker.js`. Read-first: `lobbyvaktHandler` (L2803-2819), `_lobbyGate` (L2802), `newsSince` (L4195), `accountOwner`, digest: `digestBuild` leitvakt-kafli (L4059-4064) + lobbyvakt-kafli (L4091-4107), `digestRun` (L4113-4144), import-lína `from './src/lib/lobbyvakt.mjs'`.

**Consumes:** `matchNews` (Task 1). **Produces:** `/api/lobbyvakt` → `{ok:true, entitled, greinar, ord, frettir:[{title,url,source,date}], reglur:[…], updated, needsSetup}`.

- [ ] **Skref 1 — import.** Bæta `matchNews` við í `import { … } from './src/lib/lobbyvakt.mjs'` (hefur nú þegar `feedFor, matchItem, matchKeyword, newSince, SECTORS` o.fl.).

- [ ] **Skref 2 — endapunktur.** Skipta ÖLLUM `lobbyvaktHandler`-body (L2804-2818, milli `{` og lokun) út fyrir:

```js
  const uid = await readSession(env, request);
  const now = Math.floor(Date.now() / 1000);
  if (!uid) return _ajson({ ok: false, error: 'login' });
  const u = await env.TENGSL.prepare('SELECT id,email,is_admin,free_access,tier,tier_until,parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
  const owner = await accountOwner(env, u);   // reglu-lag er account-based (meðlimur erfir þrep eiganda)
  const entitled = _lobbyGate(owner, now);
  // Sameinuð efnisvakt: lobbyvakt_ord + gömlu leitvakt.ord (union) → fréttir (frí) OG þingmál/samráð (Fyrirtæki+).
  const greinar = await _prefGet(env, uid, 'lobbyvakt_greinar', []);
  const lobbyOrd = await _prefGet(env, uid, 'lobbyvakt_ord', []);
  const lv = await _prefGet(env, uid, 'leitvakt', {});
  const gArr = Array.isArray(greinar) ? greinar : [];
  const oArr = [...new Set([...(Array.isArray(lobbyOrd) ? lobbyOrd : []), ...((lv && Array.isArray(lv.ord)) ? lv.ord : [])].map((w) => String(w == null ? '' : w).toLowerCase().trim()).filter(Boolean))];
  if (!gArr.length && !oArr.length) return _ajson({ ok: true, entitled, greinar: [], ord: [], frettir: [], reglur: [], needsSetup: true });
  // Fréttir (frí): leitarorð → nýlegar fréttir úr D1.
  const news = await newsSince(env, 30, 500).catch(() => []);
  const frettir = news.filter((n) => matchNews(n, oArr)).slice(0, 30).map((n) => ({ title: n.title, url: n.url, source: n.source, date: n.date }));
  // Reglur (Fyrirtæki+): þingmál/samráð eftir greinum + orðum.
  let reglur = [], updated = null;
  if (entitled) {
    const data = await augGet(env, 'lobbyvakt.json').catch(() => null);
    reglur = feedFor((data && data.items) || [], { greinar: gArr, ord: oArr });
    updated = (data && data.updated) || null;
  }
  return _ajson({ ok: true, entitled, greinar: gArr, ord: oArr, frettir, reglur, updated, needsSetup: false });
```

- [ ] **Skref 3 — digestBuild: EYÐA sér-leitvakt-kaflanum** (L4059-4064, blokk sem byrjar `const ord = (prefs.leitvakt …` og endar á `if (sec) { rows += H('🔎', 'Leitarorðin þín í fréttum vikunnar') + sec; personal = true; } }`). Fjarlægja allan þann blokk (fréttir færast í sameinaða kaflann, Skref 4).

- [ ] **Skref 4 — digestBuild: SKIPTA lobbyvakt-kaflanum** (L4091-4107, frá `// ── Lobbývakt: „Reglur í pípunni"…` að og með `personal = true; }`) út fyrir sameinaðan kafla:

```js
  // ── 🏛️ Lobbývaktin þín (sameinuð efnisvakt): fréttir (öllum) + reglur (Fyrirtæki+, reiknað+gátað í digestRun) ──
  const efniOrd = [...new Set([
    ...((prefs.leitvakt && Array.isArray(prefs.leitvakt.ord)) ? prefs.leitvakt.ord : []),
    ...(Array.isArray(prefs.lobbyvakt_ord) ? prefs.lobbyvakt_ord : []),
  ].map((w) => String(w == null ? '' : w).toLowerCase().trim()).filter(Boolean))];
  const lobbyNew = Array.isArray(prefs._lobbyNew) ? prefs._lobbyNew : [];   // aðeins Fyrirtæki+ (digestRun gátar)
  {
    let sec = '';
    for (const w of efniOrd.slice(0, 12)) { const hit = _newsHits(sh.news, w, 2); if (!hit.n) continue; sec += li('🔎 „' + w + '" — ' + hit.n + ' ' + (hit.n === 1 ? 'frétt' : 'fréttir') + ' í vikunni', '', 'https://karp.is/frettir/'); for (const r of hit.rows) sec += li('· ' + r.title.slice(0, 90), r.source || '', _u(r.url)); }
    const stigCol = (s) => ({ 'Mikil': '#ff6b6b', 'Miðlungs': '#f6b13b', 'Lítil': '#7fb2ff' }[s] || '#f6b13b');
    for (const it of lobbyNew) {
      const badge = '<span style="display:inline-block;background:#141c2b;border:1px solid ' + stigCol(it.stig) + ';border-radius:7px;padding:1px 7px;margin-right:6px;color:' + stigCol(it.stig) + ';font-size:11px;font-weight:700">' + _esc(it.stig || 'Miðlungs') + '</span>';
      const bits = [];
      if (it.frestur) bits.push('Frestur ' + dIS(it.frestur));
      if (it.stada) bits.push(_esc(it.stada));
      const title = '<a href="' + _esc(_u(it.hlekkur)) + '" style="color:#eaf1fb;font-size:14.5px;text-decoration:none;font-weight:600">' + (it.kind === 'samrad' ? '💬 ' : '📜 ') + _esc(it.titill) + '</a>';
      sec += '<tr><td style="padding:8px 20px;border-bottom:1px solid #1d2733">' + title + '<br>' + badge + (bits.length ? '<span style="color:#8a93a8;font-size:12px">' + bits.join(' · ') + '</span>' : '') + (it.brief ? '<div style="color:#b6c0d4;font-size:12.5px;margin-top:5px;line-height:1.5">' + _esc(it.brief) + '</div>' : '') + '</td></tr>';
    }
    if (sec) {
      rows += H('🏛️', 'Lobbývaktin þín') + sec;
      if (lobbyNew.length) rows += '<tr><td style="padding:0 20px 12px;color:#5c6678;font-size:11px;line-height:1.5">⚠ Sjálfvirk túlkun (gervigreind) á reglum, ekki lögfræðiráðgjöf.</td></tr>';
      personal = true;
    }
  }
```

- [ ] **Skref 5 — digestRun: gáta reglu-hlutann.** Í `digestRun`: (a) bæta `const now = Math.floor(Date.now() / 1000);` beint á eftir `if (!users.length) return { sent: 0, users: 0 };`. (b) Víkka users-fyrirspurnina (L4115) svo hún sæki þrep-reiti:

```js
  const rows = await env.TENGSL.prepare("SELECT DISTINCT p.user_id AS uid, u.email, u.name, u.is_admin, u.free_access, u.tier, u.tier_until, u.parent_account_id FROM user_prefs p JOIN users u ON u.id=p.user_id WHERE p.k='digest' AND p.v LIKE '%\"on\":true%'").all().catch(() => ({ results: [] }));
```

(c) Skipta lobbyNew-blokk (L4126-4133) út fyrir (bætir `entitled`-gátt):

```js
    let lobbyNew = [];
    const entitled = _lobbyGate(await accountOwner(env, { id: u.uid, is_admin: u.is_admin, free_access: u.free_access, tier: u.tier, tier_until: u.tier_until, parent_account_id: u.parent_account_id }), now);
    const lgrein = Array.isArray(pr.lobbyvakt_greinar) ? pr.lobbyvakt_greinar : [];
    const lord = Array.isArray(pr.lobbyvakt_ord) ? pr.lobbyvakt_ord : [];
    if (entitled && sh.lobbyvakt && (lgrein.length || lord.length)) {
      const lseen = Array.isArray(pr.lobbyvakt_seen) ? pr.lobbyvakt_seen : [];
      lobbyNew = newSince((sh.lobbyvakt.items) || [], 0, lseen).filter((it) => matchItem(it, lgrein) || matchKeyword(it, lord)).slice(0, 12);
      pr._lobbyNew = lobbyNew;
    }
```

- [ ] **Skref 6 — verify + HUNK-STAGE.** `git diff web/worker.js` → staðfesta AÐEINS lobbyvaktHandler/import/digest-hunkar (engin `nemandi`/`gameUser`). `git apply --cached` (síaðan diff ef þarf) → `git show :web/worker.js > /tmp/w.js && node --check /tmp/w.js && echo WORKER_OK` → `git commit -m "Lobbyvakt 2.0: threpaskiptur endapunktur (frettir fri + reglur Fyrirtaeki+) + sameinadur digest-kafli"`.

---

### Task 3: Síður — lobbyvakt.astro (frí fréttir + teased reglur) + vaktir.astro borði

**Files:** Modify `web/src/pages/lobbyvakt.astro`, `web/src/pages/vaktir.astro`. Read-first: allur `lobbyvakt.astro` (client `load()` L212-223, `showGate` L206-210, `renderFeed`/`itemCard` L165-186, hero L14-18, `#lv-app` L26-52).

**Consumes:** `/api/lobbyvakt` nýtt svar (Task 2): `{ok, entitled, greinar, ord, frettir, reglur, needsSetup}`.

- [ ] **Skref 1 — hero (lobbyvakt.astro L15-17 + `desc` L11).** Víkka: `kicker` „Karp+ · Fyrirtæki+" → „Karp+ · Vöktun"; `lead` → „Vaktaðu leitarorð og atvinnugreinar — fáðu fréttir, þingmál og samráðsmál sem snerta þig. Fréttir eru frjálsar; þingmál + samráð + áhrifa-brief eru Fyrirtæki+."; `desc` sömuleiðis (nefna fréttir + Fyrirtæki+).

- [ ] **Skref 2 — `#lv-app` bygging (L49-51).** Skipta „Straumurinn þinn" + `#lv-feed` út fyrir tvo strauma:

```html
      <h2>📰 Fréttir sem passa</h2>
      <p class="sub">Fréttir vikunnar sem nefna leitarorðin þín — frjálst, fyrir alla innskráða.</p>
      <div id="lv-frettir"></div>
      <p id="lv-frettir-empty" class="lv-empty" hidden>Engar fréttir nefna orðin þín eins og er.</p>

      <h2>🏛️ Þingmál &amp; samráð <span class="lv-plus">Fyrirtæki+</span></h2>
      <div id="lv-reglur"></div>
      <p id="lv-empty" class="lv-empty" hidden>Engin þingmál/samráð passa við valið eins og er — „Þvert á greinar"-mál birtast sjálfkrafa.</p>
```

- [ ] **Skref 3 — client `load()` (L212-223).** Endurskrifa svo það les nýja svarið + rendrar tvö lög; enginn tier-gate lengur (aðeins login):

```js
    async function load() {
      const d = await fetchFeed();
      if (!d || !d.ok) { showGate(d && d.error === 'login' ? 'login' : 'err'); return; }
      $('#lv-gate').hidden = true;
      $('#lv-app').hidden = false;
      applySelection(d.greinar);
      keywords = Array.isArray(d.ord) ? d.ord.slice() : [];
      renderChips();
      $('#lv-setup-msg').hidden = !d.needsSetup;
      renderNews(d.frettir || []);
      renderReg(d.reglur || [], !!d.entitled);
    }
```

- [ ] **Skref 4 — render-föll.** Bæta við (t.d. á eftir `renderFeed`, L186) `renderNews` + `renderReg` (endurnýtir `itemCard` fyrir reglur):

```js
    function newsCard(n) {
      const t = esc((n && n.title) || '');
      const href = esc((n && n.url) || '#');
      const meta = [esc((n && n.source) || ''), esc((n && n.date) || '')].filter(Boolean).join(' · ');
      return '<article class="lv-card"><h3 class="lv-title"><a href="' + href + '" target="_blank" rel="noopener">' + t + '</a></h3>'
        + (meta ? '<div class="lv-meta">' + meta + '</div>' : '') + '</article>';
    }
    function renderNews(frettir) {
      $('#lv-frettir').innerHTML = (frettir || []).map(newsCard).join('');
      $('#lv-frettir-empty').hidden = (frettir || []).length > 0;
    }
    function renderReg(reglur, entitled) {
      const host = $('#lv-reglur'); const empty = $('#lv-empty');
      if (!entitled) {
        empty.hidden = true;
        host.innerHTML = '<div class="lv-card lv-lock"><p class="lv-brief">🔒 Þingmál og samráðsmál sem snerta greinarnar þínar — með áhrifa-briefi, relevans-stigi og fresti — eru hluti af <b>Fyrirtæki+</b>.</p><a class="lv-upsell" href="/karp-pro/#verd">Sjá Fyrirtæki+ →</a></div>';
        return;
      }
      host.innerHTML = (reglur || []).map(itemCard).join('');
      empty.hidden = (reglur || []).length > 0;
    }
```

- [ ] **Skref 5 — CSS.** Bæta í `<style>` (t.d. hjá `.lv-empty`): `.lv-plus { font-size:11px;font-weight:700;color:#f6b13b;border:1px solid rgba(246,177,59,.4);border-radius:999px;padding:1px 8px;vertical-align:middle;margin-left:6px; }` og í `<style is:global>` (main[data-pg="lobbyvakt"]): `.lv-lock { border-style:dashed; } .lv-upsell { display:inline-block;margin-top:6px;color:#f6b13b;font-weight:700;text-decoration:none; }`.

- [ ] **Skref 6 — vaktir.astro borði.** Beint á eftir `<h1>🔔 Leitarorðavaktin</h1>` + `<p class="sub">…</p>` (L17-18) bæta áberandi hlekk:

```html
    <p class="lv-cross"><a href="/lobbyvakt/">🏛️ <b>Nýtt:</b> leitarorðin þín birtast nú líka í Lobbývaktinni — með þingmálum og samráðsmálum í pípunni →</a></p>
```

CSS í `<style>` vaktir.astro: `.lv-cross { margin: 6px 0 14px; } .lv-cross a { display:inline-block; background:rgba(246,177,59,.08); border:1px solid rgba(246,177,59,.3); border-radius:10px; padding:9px 13px; color:#f6b13b; text-decoration:none; font-size:13.5px; } .lv-cross a:hover { border-color:rgba(246,177,59,.6); }`

- [ ] **Skref 7 — verify + commit.** `cd web && npx astro build` (tekst). `git add web/src/pages/lobbyvakt.astro web/src/pages/vaktir.astro` → `git diff --cached --name-only` (aðeins þessar 2) → `git commit -m "Lobbyvakt 2.0: fri frettir + teased reglur a sidu + vaktir-tengsl"`.

---

### Task 4: Loka-verify + deploy

- [ ] **Skref 1 — grænt hlið:** `cd web && node --test src/lib/lobbyvakt.test.mjs` · `git show HEAD:web/worker.js > /tmp/w.js && node --check /tmp/w.js` · `cd web && npx astro build`.
- [ ] **Skref 2 — deploy:** `git push origin HEAD:main` (rebase/cherry-pick á deploy-worktree ef working tree óhreint).
- [ ] **Skref 3 — live-verify** (deploy-lag; browser/JS-eval): óinnskráð `/api/lobbyvakt` → `{ok:false,error:'login'}`; `/lobbyvakt/` óinnskráð → login-hvatning (ekki tier-lás). (Innskráð frí/Fyrirtæki+ staðfestir Aron: frí sér `📰 Fréttir` + `🔒`-teased reglur; Fyrirtæki+ sér bæði.) Digest-þurrkeyrsla → einn `🏛️ Lobbývaktin þín`-kafli.

## Self-review

Spec-þekja: `matchNews`(T1) · þrepaskiptur endapunktur(T2 Skref2) · digest-sameining + entitled-gátt(T2 Skref3-5) · síðu-lög + teaser(T3) · vaktir-borði(T3 Skref6) · prófun(T1,T4) — allt dekkað. Viðmót: `matchNews(item,ord)` skilgreint T1, notað T2. Svar `{entitled,frettir,reglur}` samræmt T2↔T3. Gátun: fréttir frí (login-only endapunktur skilar þeim), reglur `_lobbyGate` (endapunktur + digestRun). Engir placeholders. T2 einn á worker.js (hunk-stage). Frestað: full gagna-sameining leitvakt.ord→lobbyvakt_ord, eftirlits-/byggingavaktir.
