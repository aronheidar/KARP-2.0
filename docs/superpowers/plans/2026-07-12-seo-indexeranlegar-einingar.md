# Indexeranlegar einingar (SEO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gera einingar Karps (fyrirtæki, lyf, útboð) indexeranlegar hjá Google svo langa-hala-leit raðist, og tengja í sölutrekt (990 skýrsla / áskrift).

**Architecture:** Fyrirtæki `/fyrirtaeki/<kt>/` = worker-SSR (`web/worker.js`) sem sækir byggða Astro-skel úr ASSETS og string-replace-ar `%%KARP_*%%` tóka fyrir per-félag efni + Organization JSON-LD, 24 klst edge-cache. Lyf `/lyf/<slug>/` og útboð `/utbod/<id>/` = pre-build (Astro `getStaticPaths`) úr `gogn/lyf.json` / `gogn/utbod.json`, fara sjálfkrafa í Astro-sitemap. Fyrirtæki fá sér `sitemap-fyrirtaeki.xml` úr kt-lykluðum gögnum.

**Tech Stack:** Astro (static SSG, `@astrojs/sitemap`), Cloudflare Worker (`web/worker.js`, ASSETS-binding + `caches.default`), Node build-skript, `wrangler dev` til staðprófunar.

## Global Constraints

- Vinna Í worktree: `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`, branch `b2b-topbar`. EDIT-a í worktree (aldrei breyta á main + cp).
- Deploy = `git push origin b2b-topbar:main` (rebase — margar sessionir á main). EKKI í þessari áætlun nema Task 7.
- Astro er `output:'static'`, `build.format:'directory'` → hver síða = `<slóð>/index.html`.
- Worker-injectað HTML MÁ AÐEINS nota `is:global`-skilgreinda klasa eða inline-stíla (Astro scoped-CSS tré-hristist í runtime-innerHTML — sama gildra og skjalfest í macro-dashboard). CSS fyrir félagssíðuna lifir í `is:global` blokk í skel-síðunni.
- Persónuvernd: AÐEINS lögaðila-kt fá síðu — 10 tölur OG fyrstu 2 í 41–71 (`erLogadili`). Einstaklingar → 404 (fall-through í ASSETS). Endanlegir eigendur eru einstaklingar → á ókeypis síðunni birtist AÐEINS fjöldi + CTA, ekki nöfn (PII-vörn + trekt).
- Placeholder-tókar VERÐA að vera einstakir strengir sem birtast hvergi annars staðar í skel-HTML: `%%KARP_TITLE%%`, `%%KARP_OGTITLE%%`, `%%KARP_DESC%%`, `%%KARP_CANON%%`, `%%KARP_JSONLD%%`, `%%KARP_MAIN%%`.
- Öll RSK/notenda-gildi HTML-escape-uð með `htmlEsc` áður en þau fara í HTML.
- Canonical alltaf `https://karp.is/...` með enda-slash.
- `.replace(str, str)` skiptir aðeins FYRSTA tilviki — `%%KARP_DESC%%` birtist TVISVAR (meta description + og:description). Nota `split(t).join(v)` (replaceAll) fyrir alla tóka.

---

## File Structure

- **Create** `web/src/pages/skel-fyrirtaeki.astro` — worker-skel (Layout + tókar + `is:global` CSS `.kf-*`). Ber aldrei fram beint.
- **Modify** `web/worker.js` — bæta helpers (`htmlEsc`, `ktSep`, `erLogadili`, `isoDate`, `orgJsonLd`, `felagMainHtml`) + `fyrirtaekiSidaHandler` + route fyrir línu ~2605.
- **Modify** `web/src/pages/fyrirtaeki.astro` — hits → `<a href="/fyrirtaeki/<kt>/">` (crawlanlegt) + preventDefault heldur inline-hegðun.
- **Modify** `web/astro.config.mjs` — útiloka `skel-fyrirtaeki` úr sitemap.
- **Create** `web/src/pages/lyf/[slug].astro` — per-lyf síða + Drug JSON-LD.
- **Modify** `web/src/pages/lyf.astro` — leitar-niðurstöður hlekkja í `/lyf/<slug>/`.
- **Create** `web/src/pages/utbod/[id].astro` — per-útboð síða.
- **Modify** `web/src/pages/utbod.astro` — (valkvætt) hlekkja í `/utbod/<id>/`.
- **Create** `skriptur/build_sitemap_fyrirtaeki.mjs` — býr til `web/public/sitemap-fyrirtaeki.xml`.
- **Modify** `web/public/robots.txt` — `app.karp.is`→`karp.is` + bæta fyrirtæki-sitemap + Disallow skel.

Person JSON-LD á þingmönnum er ÞEGAR til (`web/src/pages/althingi/[slug].astro:42`) — ekkert verk.

---

## Task 1: Skel-síða fyrir /fyrirtaeki/<kt>/ + sitemap-útilokun

**Files:**
- Create: `web/src/pages/skel-fyrirtaeki.astro`
- Modify: `web/astro.config.mjs`

**Interfaces:**
- Produces: byggða HTML á `dist/skel-fyrirtaeki/index.html` sem inniheldur nákvæmlega tókana `%%KARP_TITLE%%`, `%%KARP_OGTITLE%%`, `%%KARP_DESC%%`, `%%KARP_CANON%%`, `"%%KARP_JSONLD%%"` (með gæsalöppum, inni í ld+json script), `%%KARP_MAIN%%` (inni í `<main>`). Notar `is:global` klasa `.kf-wrap .kf-h1 .kf-kt .kf-chips .kf-chip .kf-grid .kf-cell .kf-l .kf-v .kf-sec .kf-tbl .kf-cta .kf-cta-main .kf-cta-sec .kf-links .kf-note`.

- [ ] **Step 1: Búa til skel-síðuna**

Create `web/src/pages/skel-fyrirtaeki.astro`:

```astro
---
// ─────────────────────────────────────────────────────────────
// WORKER-SSR SKEL fyrir /fyrirtaeki/<kt>/ (SEO — indexeranleg félagssíða).
// RENDERAST ALDREI beint. worker.js:fyrirtaekiSidaHandler sækir þessa byggðu
// HTML úr ASSETS og string-replace-ar %%KARP_*%% tóka fyrir per-félag efni.
// Þannig fæst sami haus/nav/footer/global-CSS og allar aðrar síður án þess að
// tvírita Layout. noindex hér (raw skel aldrei indexað); worker fjarlægir
// robots-meta þegar hann ber fram raunfélag. Útilokuð úr sitemap (astro.config).
// CSS = is:global (worker-injectað efni má ekki reiða sig á scoped CSS).
// ─────────────────────────────────────────────────────────────
import Layout from '../layouts/Layout.astro';
---
<Layout
  title="%%KARP_TITLE%%"
  description="%%KARP_DESC%%"
  canonical="%%KARP_CANON%%"
  ogTitle="%%KARP_OGTITLE%%"
  jsonLd={"%%KARP_JSONLD%%"}
  noindex={true}
>
  <main class="kf-wrap" data-pg="fyrirtaeki-kt">%%KARP_MAIN%%</main>

  <style is:global>
    main.kf-wrap { max-width: 900px; margin: 0 auto; padding: 40px 20px 72px; }
    .kf-h1 { font-size: 30px; margin: 0 0 4px; color: var(--ink); }
    .kf-kt { color: var(--faint); font-variant-numeric: tabular-nums; font-size: 15px; }
    .kf-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 22px; }
    .kf-chip { font-size: 12.5px; border: 1px solid var(--line); border-radius: 999px; padding: 3px 11px; color: var(--muted); }
    .kf-chip.b { color: #e78284; border-color: rgba(231,130,132,.4); }
    .kf-chip.g { color: #42d086; border-color: rgba(66,208,134,.4); }
    .kf-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; margin: 0 0 26px; }
    .kf-cell { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel); }
    .kf-l { display: block; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--faint); margin-bottom: 3px; }
    .kf-v { color: var(--ink); font-size: 14.5px; }
    .kf-sec { margin: 0 0 26px; }
    .kf-sec h2 { font-size: 17px; margin: 0 0 10px; color: var(--ink); }
    .kf-tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .kf-tbl th, .kf-tbl td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); color: var(--muted); }
    .kf-tbl th { color: var(--faint); font-weight: 600; }
    .kf-cta { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0 26px; }
    .kf-cta-main { background: var(--gold); color: #101623; border-radius: 10px; padding: 11px 18px; font-weight: 700; font-size: 14px; text-decoration: none; }
    .kf-cta-sec { border: 1px solid rgba(246,177,59,.5); color: var(--gold); border-radius: 10px; padding: 11px 18px; font-weight: 700; font-size: 14px; text-decoration: none; }
    .kf-links { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
    .kf-links a { color: var(--gold); }
    .kf-note { font-size: 12px; color: var(--faint); border-top: 1px solid var(--line); padding-top: 12px; margin-top: 24px; }
  </style>
</Layout>
```

- [ ] **Step 2: Útiloka skel úr sitemap**

Modify `web/astro.config.mjs` línu með `sitemap(...)`:

```js
integrations: [sitemap({ filter: (page) => !/\/mitt-svaedi\/?$/.test(page) && !/\/skel-fyrirtaeki\/?$/.test(page) })],
```

- [ ] **Step 3: Byggja og staðfesta tóka í output**

Run:
```bash
cd web && npx astro build 2>&1 | tail -5 && grep -o '%%KARP_[A-Z]*%%' dist/skel-fyrirtaeki/index.html | sort -u
```
Expected: build klárar; grep skilar `%%KARP_CANON%% %%KARP_DESC%% %%KARP_MAIN%% %%KARP_OGTITLE%% %%KARP_TITLE%%` og `"%%KARP_JSONLD%%"` sést í ld+json script:
```bash
grep -c '"%%KARP_JSONLD%%"' dist/skel-fyrirtaeki/index.html
```
Expected: `1`. Og noindex-meta til staðar:
```bash
grep -c 'name="robots" content="noindex' dist/skel-fyrirtaeki/index.html
```
Expected: `1`.

- [ ] **Step 4: Staðfesta að skel er EKKI í sitemap**

Run:
```bash
grep -c 'skel-fyrirtaeki' dist/sitemap-0.xml
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/skel-fyrirtaeki.astro web/astro.config.mjs
git commit -m "SEO: worker-skel fyrir /fyrirtaeki/<kt>/ + sitemap-útilokun"
```

---

## Task 2: Worker-route + handler fyrir /fyrirtaeki/<kt>/

**Files:**
- Modify: `web/worker.js` (bæta helpers + handler nálægt `fyrirtaekiHandler` línu ~2005; bæta route fyrir `return env.ASSETS.fetch(request)` línu ~2605)

**Interfaces:**
- Consumes: `fyrirtaekiHandler(request, env, ctx)` (til, línu 2005) → `{ felag: { nafn, kt, form, isat[], postfang, logheimili, svf, skrad, afskrad, stada, hlutafe, mynt, vsk[{nr}], radamenn[], fyrirsvar[], arsreikningar[{ar,skil,teg}], eigendur[], eigendurTomt, heiti[] } }`. Skel á `dist/skel-fyrirtaeki/index.html` (Task 1).
- Produces: route `/fyrirtaeki/<10 tölur>/` → 200 text/html indexeranleg síða, eða 301 (án slash), eða fall-through 404.

- [ ] **Step 1: Bæta helper-föllum**

Í `web/worker.js`, bæta blokk beint FYRIR `async function fyrirtaekiHandler` (línu ~2005):

```js
// ── /fyrirtaeki/<kt>/ — indexeranleg opinber félagssíða (worker-SSR, SEO) ──
// Sækir byggða Astro-skel (skel-fyrirtaeki) úr ASSETS og skiptir %%KARP_*%%
// tókum út fyrir per-félag efni. Öll gögn koma úr fyrirtaekiHandler (RSK).
const htmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ktSep = (kt) => (/^\d{10}$/.test(kt) ? kt.slice(0, 6) + '-' + kt.slice(6) : String(kt || ''));
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +String(kt).slice(0, 2) >= 41 && +String(kt).slice(0, 2) <= 71;
const isoDate = (s) => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined; };
const repAll = (h, t, v) => h.split(t).join(v);

function orgJsonLd(f, kt, canonical) {
  const ld = { '@context': 'https://schema.org', '@type': 'Organization', name: f.nafn, identifier: kt, taxID: kt, url: canonical };
  const addr = f.postfang || f.logheimili;
  if (addr) ld.address = { '@type': 'PostalAddress', streetAddress: addr, ...(f.svf ? { addressLocality: f.svf } : {}), addressCountry: 'IS' };
  if (Array.isArray(f.heiti) && f.heiti.length) ld.alternateName = f.heiti.slice(0, 6);
  if (f.form) ld.additionalType = f.form;
  const fd = isoDate(f.skrad);
  if (fd) ld.foundingDate = fd;
  if (f.vsk && f.vsk[0] && f.vsk[0].nr) ld.vatID = 'IS' + f.vsk[0].nr;
  return ld;
}

function felagMainHtml(f, kt) {
  const e = htmlEsc;
  const virk = f.afskrad ? '<span class="kf-chip b">Afskráð</span>' : `<span class="kf-chip g">${e(f.stada || 'Virk skráning')}</span>`;
  const chips = [virk, f.form ? `<span class="kf-chip">${e(f.form)}</span>` : '', (f.isat && f.isat[0]) ? `<span class="kf-chip">${e(f.isat[0])}</span>` : ''].filter(Boolean).join('');
  const cell = (l, v) => (v ? `<div class="kf-cell"><span class="kf-l">${e(l)}</span><span class="kf-v">${e(v)}</span></div>` : '');
  const grid = [
    cell('Heimilisfang', f.postfang || f.logheimili),
    cell('Sveitarfélag', f.svf),
    cell('Rekstrarform', f.form),
    cell('Stofnað / skráð', f.skrad),
    cell('Hlutafé', f.hlutafe ? `${f.hlutafe}${f.mynt ? ' ' + f.mynt : ''}` : ''),
    cell('VSK-númer', f.vsk && f.vsk[0] ? f.vsk[0].nr : ''),
  ].filter(Boolean).join('');
  const isatSec = (f.isat && f.isat.length) ? `<div class="kf-sec"><h2>ÍSAT atvinnugrein</h2><div class="kf-links">${f.isat.map((x) => e(x)).join('<br>')}</div></div>` : '';
  const fyrirsvar = Array.isArray(f.fyrirsvar) && f.fyrirsvar.length ? f.fyrirsvar.map((t) => e(t.nafn || t)).slice(0, 12)
    : (f.radamenn || []).map((x) => e(x)).slice(0, 12);
  const fyrirsvarSec = fyrirsvar.length ? `<div class="kf-sec"><h2>Fyrirsvar</h2><div class="kf-links">${fyrirsvar.join('<br>')}</div></div>` : '';
  const ars = (f.arsreikningar || []).slice(0, 8);
  const arsSec = ars.length ? `<div class="kf-sec"><h2>Skil ársreikninga</h2><table class="kf-tbl"><tr><th>Ár</th><th>Skil</th><th>Tegund</th></tr>${ars.map((a) => `<tr><td>${e(a.ar)}</td><td>${e(a.skil || '—')}</td><td>${e(a.teg || '—')}</td></tr>`).join('')}</table></div>` : '';
  const nEig = Array.isArray(f.eigendur) ? f.eigendur.length : 0;
  const eigTeaser = `<div class="kf-sec"><h2>Endanlegir eigendur</h2><div class="kf-note" style="border:0;padding:0;margin:0 0 10px">${nEig ? `${nEig} raunverulegir eigendur skráðir (>25%).` : (f.eigendurTomt ? 'Enginn með >25% skráður.' : 'Eigendagreining í boði.')} Fullt eignarhald, þrepaskipting og félagakeðja í eigendaskýrslunni.</div></div>`;
  const cta = `<div class="kf-cta">
    <a class="kf-cta-main" href="/fyrirtaeki/?q=${e(kt)}">🛒 Fyrirtækjaskýrsla — 990 kr</a>
    <a class="kf-cta-sec" href="/eigendur/?kt=${e(kt)}">Endanlegir eigendur — 990 kr</a>
    <a class="kf-cta-sec" href="/lausnir/fyrirtaekjavaktin/">Fyrirtækjavaktin</a>
  </div>`;
  const links = `<p class="kf-links">Sjá einnig: <a href="/fyrirtaeki/?q=${e(kt)}">lifandi uppfletting</a> · <a href="/birgjar/">greiðslur ríkisins</a> · <a href="/frettir/">fjölmiðlaumfjöllun</a> · <a href="/utbod/">útboð</a></p>`;
  return `<p class="kf-links"><a href="/fyrirtaeki/">← Fyrirtækjaskrá</a></p>
    <h1 class="kf-h1">${e(f.nafn)}</h1>
    <div class="kf-kt">kt. ${e(ktSep(kt))}</div>
    <div class="kf-chips">${chips}</div>
    <div class="kf-grid">${grid}</div>
    ${isatSec}${fyrirsvarSec}${arsSec}${eigTeaser}${cta}${links}
    <p class="kf-note">Grunngögn úr opinberri fyrirtækjaskrá Skattsins (skatturinn.is), sótt lifandi. Ekki vottorð. Formleg fyrirtækjaskýrsla og eigendaskýrsla fást keyptar hér að ofan.</p>`;
}

async function fyrirtaekiSidaHandler(request, env, ctx) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/fyrirtaeki\/(\d{10})\/?$/);
  if (!m) return env.ASSETS.fetch(request);
  const kt = m[1];
  if (!url.pathname.endsWith('/')) return Response.redirect(url.origin + '/fyrirtaeki/' + kt + '/', 301);
  if (!erLogadili(kt)) return env.ASSETS.fetch(request);   // einstaklingar → 404 (persónuvernd)
  const cache = caches.default;
  const cacheKey = new Request('https://cache.karp.internal/pg/fyrirtaeki/' + kt);
  let res = await cache.match(cacheKey);
  if (res) return res;
  const dr = await fyrirtaekiHandler(new Request('https://k.internal/api/fyrirtaeki?q=' + kt), env, ctx);
  const d = await dr.json().catch(() => null);
  const f = d && d.felag;
  if (!f || !f.nafn) return env.ASSETS.fetch(request);      // ekkert raunfélag → 404, EKKI tóm 200
  const canonical = 'https://karp.is/fyrirtaeki/' + kt + '/';
  const title = htmlEsc(f.nafn) + ' (' + ktSep(kt) + ') — ársreikningur, eigendur, kennitala | Karp';
  const dParts = [f.form, f.isat && f.isat[0], f.postfang || f.logheimili, f.afskrad ? 'Afskráð' : (f.stada || 'Virk skráning')].filter(Boolean).join(' · ');
  const desc = htmlEsc(f.nafn + ' — kt. ' + ktSep(kt) + '. ' + dParts + '. Ársreikningar, endanlegir eigendur, tengsl og umfjöllun á Karp.').slice(0, 300);
  const ld = JSON.stringify(orgJsonLd(f, kt, canonical));
  let html = await (await env.ASSETS.fetch(new Request('https://karp.internal/skel-fyrirtaeki/'))).text();
  html = html.replace(/<meta name="robots"[^>]*>\s*/i, '');   // gera indexeranlegt
  html = repAll(html, '%%KARP_TITLE%%', title);
  html = repAll(html, '%%KARP_OGTITLE%%', htmlEsc(f.nafn + ' — ' + ktSep(kt)));
  html = repAll(html, '%%KARP_DESC%%', desc);
  html = repAll(html, '%%KARP_CANON%%', canonical);
  html = repAll(html, '"%%KARP_JSONLD%%"', ld);
  html = repAll(html, '%%KARP_MAIN%%', felagMainHtml(f, kt));
  res = new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
```

- [ ] **Step 2: Skrá route í fetch-dispatch**

Í `web/worker.js`, bæta línu beint FYRIR `return env.ASSETS.fetch(request);` (línu ~2605):

```js
    if (/^\/fyrirtaeki\/\d{10}\/?$/.test(url.pathname)) return fyrirtaekiSidaHandler(request, env, ctx);
```

- [ ] **Step 3: Byggja skel svo ASSETS á skel-fyrirtaeki**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3 && ls dist/skel-fyrirtaeki/index.html
```
Expected: skráin til.

- [ ] **Step 4: Ræsa wrangler dev (bakgrunnur) og curl-a raunfélag**

Run (frá `web/`):
```bash
cd web && npx wrangler dev --port 8799 &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8799/fyrirtaeki/6912002990/
```
Expected: `200`. (kt 6912002990 = lögaðili með gögn; ef RSK-net óaðgengilegt í dev, sleppa yfir í Task 7 live-prófun.)

- [ ] **Step 5: Staðfesta efni + schema + canonical í svarinu**

Run:
```bash
curl -s http://localhost:8799/fyrirtaeki/6912002990/ > /tmp/kf.html
grep -c 'class="kf-h1"' /tmp/kf.html                       # 1 (h1 til)
grep -c '"@type":"Organization"' /tmp/kf.html              # 1 (JSON-LD injectað)
grep -c 'rel="canonical" href="https://karp.is/fyrirtaeki/6912002990/"' /tmp/kf.html   # 1
grep -c 'name="robots" content="noindex' /tmp/kf.html      # 0 (noindex fjarlægt)
grep -c '%%KARP_' /tmp/kf.html                             # 0 (engir tókar eftir)
```
Expected: `1`, `1`, `1`, `0`, `0`.

- [ ] **Step 6: Staðfesta 301 (án slash) og 404 (einstaklingur/ekkert félag)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8799/fyrirtaeki/6912002990   # 301
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8799/fyrirtaeki/0101801234/  # 404 (einstaklingur, byrjar 01)
```
Expected: `301`, `404`. Drepa svo wrangler: `kill %1` (eða loka bakgrunns-ferli).

- [ ] **Step 7: Commit**

```bash
git add web/worker.js
git commit -m "SEO: worker-route /fyrirtaeki/<kt>/ — SSR félagssíða + Organization JSON-LD"
```

---

## Task 3: Leitar-niðurstöður hlekkja í /fyrirtaeki/<kt>/

**Files:**
- Modify: `web/src/pages/fyrirtaeki.astro` (hit-render línu ~1794, wiring ~1796-1800, `.fs-hit` CSS línu ~49)

**Interfaces:**
- Consumes: `/fyrirtaeki/<kt>/` route (Task 2), `escF`, `ktFmt`, `leita(kt, true)` (til í skránni).
- Produces: crawlanleg `<a>`-hlekki í hverri niðurstöðu; normal-smellur heldur inline-hleðslu.

- [ ] **Step 1: Breyta hit-`div` í `a` með href**

Í `web/src/pages/fyrirtaeki.astro` línu ~1794, skipta út `d.hits.map(...)`-strengnum:

Frá:
```js
skila('<div class="fs-hits">' + d.hits.map((h) => `<div class="fs-hit${h.afskrad ? ' af' : ''}" role="button" tabindex="0" data-kt="${escF(h.kt)}"><span class="kt">${escF(ktFmt(h.kt))}</span><span class="n">${escF(h.nafn)}${h.afskrad ? ' <span class="fs-badge">afskráð</span>' : ''}</span><span class="h">${escF(h.heimili || '')}</span></div>`).join('') + '</div>'
```
Í:
```js
skila('<div class="fs-hits">' + d.hits.map((h) => `<a class="fs-hit${h.afskrad ? ' af' : ''}" href="/fyrirtaeki/${escF(h.kt)}/" data-kt="${escF(h.kt)}"><span class="kt">${escF(ktFmt(h.kt))}</span><span class="n">${escF(h.nafn)}${h.afskrad ? ' <span class="fs-badge">afskráð</span>' : ''}</span><span class="h">${escF(h.heimili || '')}</span></a>`).join('') + '</div>'
```

- [ ] **Step 2: Uppfæra click-wiring svo normal-smellur haldi inline-hegðun**

Í sömu skrá línu ~1796-1800, skipta út:

Frá:
```js
              out.querySelectorAll('.fs-hit').forEach((el) => {
                const opna = () => leita(el.dataset.kt, true);
                el.onclick = opna;
                el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opna(); } };
              });
```
Í:
```js
              out.querySelectorAll('.fs-hit').forEach((el) => {
                // <a href> er crawlanlegt + cmd/ctrl/miðju-smellur opnar raunsíðu;
                // venjulegur smellur heldur inline-hleðslunni (progressive enhancement).
                el.onclick = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); leita(el.dataset.kt, true); };
              });
```

- [ ] **Step 3: Bæta `text-decoration:none` á `.fs-hit` (var `div`, nú `a`)**

Í sömu skrá línu ~49, breyta `.fs-hit`-reglunni — bæta `text-decoration:none; color:inherit;` fremst í yfirlýsinguna:

Frá:
```css
    .fs-hit { display: flex; gap: 12px; align-items: baseline; padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; font-size: 13.5px; }
```
Í:
```css
    .fs-hit { text-decoration: none; color: inherit; display: flex; gap: 12px; align-items: baseline; padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; font-size: 13.5px; }
```

- [ ] **Step 4: Byggja og staðfesta href í leitar-JS (bakað í HTML)**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3 && grep -c 'href="/fyrirtaeki/${escF(h.kt)}/"' dist/fyrirtaeki/index.html
```
Expected: `1` (JS-strengurinn bakast í síðuna).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fyrirtaeki.astro
git commit -m "SEO: leitar-niðurstöður hlekkja í /fyrirtaeki/<kt>/ (crawlanlegt + inline)"
```

---

## Task 4: Per-lyf síður /lyf/<slug>/ + Drug JSON-LD

**Files:**
- Create: `web/src/pages/lyf/[slug].astro`
- Test: byggð `dist/lyf/<slug>/index.html`

**Interfaces:**
- Consumes: `@gogn/lyf.json` → `{ lyf: [{ name, slug, atc:{code,name}, strength, form, ingredients[], holder, agent, shortage, rx, priceLow, priceHigh, packages, essential, narcotic }] }`.
- Produces: 1 static síða per lyf með `slug`, hver með `Drug` JSON-LD.

- [ ] **Step 1: Búa til [slug].astro**

Create `web/src/pages/lyf/[slug].astro`:

```astro
---
// PROGRAMMATIC SEO — síða per lyf. getStaticPaths úr gogn/lyf.json (Algolia-
// snapshot Sérlyfjaskrár). Drug JSON-LD. Leitin er /lyf/ (lyf.astro).
import Layout from '../../layouts/Layout.astro';
import LYF from '@gogn/lyf.json';

export function getStaticPaths() {
  const seen = new Set();
  return (LYF.lyf || []).filter((l) => l.slug && !seen.has(l.slug) && seen.add(l.slug))
    .map((l) => ({ params: { slug: l.slug }, props: { l } }));
}

const { l } = Astro.props;
const canonical = `https://karp.is/lyf/${l.slug}/`;
const ingr = (l.ingredients || []).filter(Boolean);
const atcName = l.atc && l.atc.name ? l.atc.name : '';
const kr = (v) => (v || v === 0 ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' kr' : '');
const verd = l.priceLow ? (l.priceHigh && l.priceHigh !== l.priceLow ? `${kr(l.priceLow)}–${kr(l.priceHigh)}` : kr(l.priceLow)) : '';
const title = `${l.name}${l.strength ? ' ' + l.strength : ''} — verð, ATC, markaðsleyfi | Karp`;
const desc = `${l.name} — ${ingr.join(', ') || atcName}${l.strength ? ', ' + l.strength : ''}${l.form ? ', ' + l.form : ''}. Markaðsleyfishafi ${l.holder || '—'}.${verd ? ' Verð ' + verd + '.' : ''}${l.shortage ? ' Lyfjaskortur skráður.' : ''}`.slice(0, 300);

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'Drug', name: l.name, url: canonical,
  ...(ingr.length ? { activeIngredient: ingr } : {}),
  ...(l.atc && l.atc.code ? { code: { '@type': 'MedicalCode', code: l.atc.code, codingSystem: 'ATC' } } : {}),
  ...(l.form ? { dosageForm: l.form } : {}),
  ...(l.strength ? { availableStrength: { '@type': 'DrugStrength', description: l.strength } } : {}),
  ...(l.holder ? { manufacturer: { '@type': 'Organization', name: l.holder } } : {}),
  ...(l.rx ? { prescriptionStatus: /R|lyfseðil/i.test(l.rx) ? 'https://schema.org/PrescriptionOnly' : 'https://schema.org/OTC' } : {}),
};

const row = (label, val) => val;
---
<Layout title={title} description={desc} canonical={canonical} jsonLd={jsonLd}>
  <main class="lyf-kt">
    <p class="bk"><a href="/lyf/">← Lyf & lyfjaverð</a></p>
    <h1>{l.name}</h1>
    <p class="sub">{[l.strength, l.form].filter(Boolean).join(' · ')}</p>
    <div class="chips">
      {l.shortage && <span class="chip b">⚠ Lyfjaskortur</span>}
      {l.rx && <span class="chip">{l.rx}</span>}
      {l.essential && <span class="chip">Nauðsynjalyf</span>}
      {l.narcotic && <span class="chip b">Ávana/fíkn</span>}
      {l.vet && <span class="chip">Dýralyf</span>}
    </div>
    <div class="grid">
      {ingr.length > 0 && <div class="cell"><span class="l">Virk innihaldsefni</span><span class="v">{ingr.join(', ')}</span></div>}
      {l.atc && l.atc.code && <div class="cell"><span class="l">ATC-flokkur</span><span class="v">{l.atc.code}{atcName ? ' — ' + atcName : ''}</span></div>}
      {l.strength && <div class="cell"><span class="l">Styrkur</span><span class="v">{l.strength}</span></div>}
      {l.form && <div class="cell"><span class="l">Lyfjaform</span><span class="v">{l.form}</span></div>}
      {l.holder && <div class="cell"><span class="l">Markaðsleyfishafi</span><span class="v">{l.holder}</span></div>}
      {l.agent && <div class="cell"><span class="l">Umboðsaðili</span><span class="v">{l.agent}</span></div>}
      {verd && <div class="cell"><span class="l">Verð (smásölu)</span><span class="v">{verd}</span></div>}
    </div>
    <p class="note">Heimild: Sérlyfjaskrá Lyfjastofnunar. Verð og framboð geta breyst — sjá <a href="/lyf/">lyfjaleit</a> fyrir nýjustu stöðu.</p>
  </main>

  <style>
    main.lyf-kt { max-width: 820px; margin: 0 auto; padding: 40px 20px 64px; }
    .bk a { color: var(--gold); font-size: 13px; text-decoration: none; }
    h1 { font-size: 30px; margin: 8px 0 4px; }
    .sub { color: var(--muted); margin: 0 0 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
    .chip { font-size: 12.5px; border: 1px solid var(--line); border-radius: 999px; padding: 3px 11px; color: var(--muted); }
    .chip.b { color: #e78284; border-color: rgba(231,130,132,.4); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
    .cell { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel); }
    .l { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); margin-bottom: 3px; }
    .v { color: var(--ink); font-size: 14.5px; }
    .note { font-size: 12.5px; color: var(--faint); margin-top: 22px; } .note a { color: var(--gold); }
  </style>
</Layout>
```

- [ ] **Step 2: Byggja og staðfesta lyf-síður + Drug schema**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3
ls dist/lyf/ | head
SLUG=$(node -e "console.log((require('../gogn/lyf.json').lyf.find(x=>x.slug)).slug)")
grep -c '"@type":"Drug"' dist/lyf/$SLUG/index.html
grep -c 'rel="canonical"' dist/lyf/$SLUG/index.html
```
Expected: build klárar; `dist/lyf/<slug>/index.html` til; `"@type":"Drug"` = `1`; canonical = `1`.

- [ ] **Step 3: Staðfesta fjölda síðna (~3023)**

Run:
```bash
ls dist/lyf/ | grep -v 'index.html' | wc -l
```
Expected: ~3000+ möppur (afmarkað af einstökum slug-um).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/lyf/\[slug\].astro
git commit -m "SEO: per-lyf síður /lyf/<slug>/ + Drug JSON-LD"
```

---

## Task 5: Leit-lyf hlekkir í /lyf/<slug>/

**Files:**
- Modify: `web/src/pages/lyf.astro` (þar sem leitar-niðurstöður eru rendraðar)

**Interfaces:**
- Consumes: `/lyf/<slug>/` (Task 4). Hvert lyf-hit hefur `slug`.
- Produces: crawlanlega hlekki úr leitinni.

- [ ] **Step 1: Finna hvar leitar-niðurstöður eru rendraðar**

Run:
```bash
grep -n 'slug\|innerHTML\|\.map(\|result\|hit\|<a ' web/src/pages/lyf.astro | head -20
```
Skoða úttakið til að finna template-strenginn sem býr til hvern lyf-hlut (leita að `l.name`/`.map(`).

- [ ] **Step 2: Vefja lyf-heiti í hlekk**

Í niðurstöðu-template-strengnum í `lyf.astro`, gera heiti lyfsins að `<a href="/lyf/${slug}/">…</a>` (nota sömu escape-fall og skráin notar; ef lyf-hlutur heitir `d`/`l`/`x`, nota `${x.slug}`). Ef leitin er client-Algolia sem sækir ekki `slug`, bæta `slug` í `attributesToRetrieve`/select. Halda núverandi útliti; aðeins bæta hlekk á heitið.

> Nákvæmur strengur ræðst af núverandi kóða (Step 1). Meginregla: hvert sýnt lyf fær `<a href="/lyf/<slug>/">`. Ef `slug` vantar í leitar-svarið en `name` er til, nota `slugify` úr `@lib/format.mjs` EKKI (slug í gögnum er Algolia-ID-slug, ekki nafn-slug) — í staðinn tryggja að leitin skili `slug`-reitnum.

- [ ] **Step 3: Byggja og staðfesta**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3 && grep -c '/lyf/' dist/lyf/index.html
```
Expected: build klárar; `>0` tilvik af `/lyf/` hlekk-forskeyti í leitar-JS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/lyf.astro
git commit -m "SEO: lyfjaleit hlekkir í /lyf/<slug>/"
```

---

## Task 6: Per-útboð síður /utbod/<id>/

**Files:**
- Create: `web/src/pages/utbod/[id].astro`

**Interfaces:**
- Consumes: `@gogn/utbod.json` → `{ tenders: [{ t, buyer, d, deadline, u, src, cat }], cats }`. Enginn stöðugur `id` → afleiddur `tenderSlug`.
- Produces: 1 static síða per útboð. Enginn JSON-LD (schema.org á enga hreina útboðs-tegund; sleppt vísvitandi).

- [ ] **Step 1: Búa til [id].astro með stöðugum slug**

Create `web/src/pages/utbod/[id].astro`:

```astro
---
// PROGRAMMATIC SEO — síða per útboð. getStaticPaths úr gogn/utbod.json.
// Enginn stöðugur id í gögnum → tenderSlug = slugify(titill) + '-' + hash(u).
// Enginn JSON-LD (engin hrein schema.org útboðs-tegund). Leitin er /utbod/.
import Layout from '../../layouts/Layout.astro';
import UTBOD from '@gogn/utbod.json';
import { slugify } from '@lib/format.mjs';

const hash = (s) => { let h = 5381; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); };
const tenderSlug = (x) => (slugify(x.t || 'utbod').slice(0, 60) || 'utbod') + '-' + hash(x.u || x.t);

export function getStaticPaths() {
  const seen = new Set();
  return (UTBOD.tenders || []).map((x) => ({ ...x, _id: tenderSlug(x) }))
    .filter((x) => !seen.has(x._id) && seen.add(x._id))
    .map((x) => ({ params: { id: x._id }, props: { x } }));
}

const { x } = Astro.props;
const canonical = `https://karp.is/utbod/${x._id || (slugify(x.t || 'utbod').slice(0, 60) + '-' + hash(x.u || x.t))}/`;
const dIS = (d) => { const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : ''; };
const catLabel = (UTBOD.cats && UTBOD.cats[x.cat] ? UTBOD.cats[x.cat][0] : x.cat) || '';
const SRC = { rk: 'Útboðsvefur Ríkiskaupa', ted: 'TED (EES)', rvk: 'Reykjavíkurborg', fax: 'Faxaflóahafnir', lv: 'Landsvirkjun' };
const title = `${x.t} — útboð${x.buyer ? ', ' + x.buyer : ''} | Karp`;
const desc = `Opinbert útboð: ${x.t}. Kaupandi ${x.buyer || SRC[x.src] || '—'}.${x.deadline ? ' Tilboðsfrestur ' + dIS(x.deadline) + '.' : ''}${catLabel ? ' Flokkur: ' + catLabel + '.' : ''} Sjá öll útboð á Karp.`.slice(0, 300);
---
<Layout title={title} description={desc} canonical={canonical}>
  <main class="ut-kt">
    <p class="bk"><a href="/utbod/">← Útboðsgátt</a></p>
    <h1>{x.t}</h1>
    <div class="grid">
      {x.buyer && <div class="cell"><span class="l">Kaupandi</span><span class="v">{x.buyer}</span></div>}
      <div class="cell"><span class="l">Gátt</span><span class="v">{SRC[x.src] || x.src}</span></div>
      {catLabel && <div class="cell"><span class="l">Flokkur</span><span class="v">{catLabel}</span></div>}
      {x.d && <div class="cell"><span class="l">Birt</span><span class="v">{dIS(x.d)}</span></div>}
      {x.deadline && <div class="cell"><span class="l">Tilboðsfrestur</span><span class="v">{dIS(x.deadline)}</span></div>}
    </div>
    {x.u && <p class="src"><a href={x.u} target="_blank" rel="nofollow noopener">Opna útboð í upprunagátt ↗</a></p>}
    <p class="note">Heimild: {SRC[x.src] || x.src}. Karp safnar opinberum útboðum frá öllum helstu gáttum — sjá <a href="/utbod/">útboðsgáttina</a> og <a href="/lausnir/utbodsvaktin/">Útboðsvaktina</a> (tölvupósts-vakt fyrir verktaka).</p>
  </main>

  <style>
    main.ut-kt { max-width: 820px; margin: 0 auto; padding: 40px 20px 64px; }
    .bk a { color: var(--gold); font-size: 13px; text-decoration: none; }
    h1 { font-size: 26px; margin: 8px 0 18px; line-height: 1.3; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; }
    .cell { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel); }
    .l { display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--faint); margin-bottom: 3px; }
    .v { color: var(--ink); font-size: 14.5px; }
    .src { margin: 20px 0 0; } .src a { color: var(--gold); font-weight: 600; }
    .note { font-size: 12.5px; color: var(--faint); margin-top: 20px; } .note a { color: var(--gold); }
  </style>
</Layout>
```

- [ ] **Step 2: Byggja og staðfesta útboðs-síður**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3
ls dist/utbod/ | grep -v index.html | wc -l
D=$(ls dist/utbod/ | grep -v index.html | head -1)
grep -c 'rel="canonical"' dist/utbod/$D/index.html
grep -c '<h1>' dist/utbod/$D/index.html
```
Expected: build klárar; ~160 möppur; canonical `1`; h1 `1`.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/utbod/\[id\].astro
git commit -m "SEO: per-útboð síður /utbod/<id>/ (stöðugur slug úr titli+hash)"
```

---

## Task 7: Sitemap fyrir fyrirtæki + robots.txt fix

**Files:**
- Create: `skriptur/build_sitemap_fyrirtaeki.mjs`
- Modify: `web/public/robots.txt`

**Interfaces:**
- Consumes: `gogn/arsreikningar/*.json` (skráarnöfn = kt), `gogn/eigendur/*.json` (skráarnöfn = kt), `gogn/logbirting.json` (`byKt` lyklar). Allt valkvætt (CI-byggt) — skriptið höndlar fjarveru.
- Produces: `web/public/sitemap-fyrirtaeki.xml` (fer í `dist/` sem static asset), aðeins gild lögaðila-kt, dedup-uð.

- [ ] **Step 1: Búa til build-skriptið**

Create `skriptur/build_sitemap_fyrirtaeki.mjs`:

```js
// Byggir web/public/sitemap-fyrirtaeki.xml úr ÖLLUM kt-lykluðum Karp-gögnum.
// Uppsprettur (allar valkvæðar — CI-byggðar): arsreikningar/, eigendur/, logbirting.byKt.
// ⚠ birgjar.json 't' er EKKI kennitala (obfuskerað) → EKKI notað.
// Aðeins gild lögaðila-kt (10 tölur, fyrstu 2 í 41–71).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gogn = (p) => join(ROOT, 'gogn', p);
const erLogadili = (kt) => /^\d{10}$/.test(kt) && +kt.slice(0, 2) >= 41 && +kt.slice(0, 2) <= 71;

const kts = new Set();
const addDir = (dir) => { try { if (existsSync(gogn(dir))) for (const f of readdirSync(gogn(dir))) { const kt = f.replace(/\.json$/, ''); if (erLogadili(kt)) kts.add(kt); } } catch {} };
addDir('arsreikningar');
addDir('eigendur');
try { const lb = JSON.parse(readFileSync(gogn('logbirting.json'), 'utf8')); for (const kt of Object.keys(lb.byKt || {})) if (erLogadili(kt)) kts.add(kt); } catch {}

const list = [...kts].sort();
const urls = list.map((kt) => `  <url><loc>https://karp.is/fyrirtaeki/${kt}/</loc><changefreq>monthly</changefreq></url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(ROOT, 'web', 'public', 'sitemap-fyrirtaeki.xml'), xml);
console.log(`sitemap-fyrirtaeki.xml: ${list.length} kt`);
```

- [ ] **Step 2: Keyra skriptið**

Run:
```bash
node skriptur/build_sitemap_fyrirtaeki.mjs
head -6 web/public/sitemap-fyrirtaeki.xml
```
Expected: prentar fjölda (≥1 — a.m.k. arsreikningar/6912002990); XML gilt með `<loc>https://karp.is/fyrirtaeki/6912002990/</loc>`.

- [ ] **Step 3: Laga robots.txt**

Skipta út `web/public/robots.txt` að fullu:

```
User-agent: *
Allow: /
Disallow: /skel-fyrirtaeki/

Sitemap: https://karp.is/sitemap-index.xml
Sitemap: https://karp.is/sitemap-fyrirtaeki.xml
```

- [ ] **Step 4: Byggja og staðfesta að sitemap-skráin fer í dist**

Run:
```bash
cd web && npx astro build 2>&1 | tail -3
grep -c 'karp.is/fyrirtaeki/' dist/sitemap-fyrirtaeki.xml
grep -c 'app.karp.is' dist/robots.txt
grep -c 'sitemap-fyrirtaeki.xml' dist/robots.txt
```
Expected: sitemap `≥1`; `app.karp.is` = `0` (lagað); fyrirtæki-sitemap í robots = `1`.

- [ ] **Step 5: Commit**

```bash
git add skriptur/build_sitemap_fyrirtaeki.mjs web/public/robots.txt web/public/sitemap-fyrirtaeki.xml
git commit -m "SEO: sitemap-fyrirtaeki.xml (kt-lykluð gögn) + robots.txt karp.is-fix"
```

---

## Task 8: Heildarbygging, staðfesting og deploy

**Files:** engin ný — heildar-verifikation.

- [ ] **Step 1: Hrein heildarbygging**

Run:
```bash
cd web && rm -rf dist && npx astro build 2>&1 | tail -8
```
Expected: klárar án villu; „Completed" með fjölda síðna (grunnur ~208 + ~3023 lyf + ~160 útboð).

- [ ] **Step 2: Staðfesta allar þrjár einingar í dist**

Run:
```bash
ls dist/skel-fyrirtaeki/index.html
ls -d dist/lyf/*/ | wc -l
ls -d dist/utbod/*/ | wc -l
grep -c 'fyrirtaeki' dist/sitemap-fyrirtaeki.xml
```
Expected: skel til; lyf ~3000; útboð ~160; sitemap ≥1.

- [ ] **Step 3: Wrangler dev heildar-smoke (worker + static saman)**

Run:
```bash
cd web && npx wrangler dev --port 8799 &
sleep 8
for u in /fyrirtaeki/6912002990/ /lyf/ /utbod/ /robots.txt /sitemap-fyrirtaeki.xml; do
  printf "%s -> " "$u"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8799$u
done
kill %1
```
Expected: allt `200` (fyrirtæki-slóð 200 ef RSK-net til staðar).

- [ ] **Step 4: Google Rich Results — handvirk staðfesting**

Segðu Aroni að keyra eftir deploy: líma `https://karp.is/fyrirtaeki/6912002990/`, `https://karp.is/lyf/<slug>/` í https://search.google.com/test/rich-results og staðfesta `Organization` / `Drug` án villu. (Ekki hægt sjálfvirkt í dev — krefst opinberrar slóðar.)

- [ ] **Step 5: Deploy (rebase á main)**

Run:
```bash
cd /c/Users/aronh/dev/KARP/mitt-svaedi-wt
git fetch origin
git rebase origin/main
git push origin b2b-topbar:main
```
Expected: fast-forward push (eða rebase leyst). Cloudflare byggir og deploy-ar sjálfkrafa (síða + worker).

- [ ] **Step 6: Live-staðfesting eftir deploy**

Run (bíða ~2 mín eftir CF-byggingu):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://karp.is/fyrirtaeki/6912002990/
curl -s https://karp.is/fyrirtaeki/6912002990/ | grep -c '"@type":"Organization"'
curl -s https://karp.is/robots.txt | grep -c 'app.karp.is'
```
Expected: `200`; Organization `1`; `app.karp.is` = `0`.

---

## Self-Review

**Spec coverage:**
- Fyrirtæki worker-SSR `/fyrirtaeki/<kt>/` → Task 1-2 ✓
- Organization JSON-LD → Task 2 (`orgJsonLd`) ✓
- Sölutrekt-CTA → Task 2 (`felagMainHtml` .kf-cta) ✓
- Innri hlekkir (?q→canonical) → Task 3 ✓
- Lyf `/lyf/<slug>/` + Drug JSON-LD → Task 4 ✓; leitar-hlekkir → Task 5 ✓
- Útboð `/utbod/<id>/` → Task 6 ✓ (JSON-LD sleppt vísvitandi, sbr. spec)
- Breið sitemap → Task 7 (kt-lykluð sammengi; birgjar-`t` réttilega útilokað) ✓
- robots.txt fix → Task 7 ✓
- Person JSON-LD á þingmönnum → ÞEGAR til, ekkert verk (skjalfest í File Structure) ✓
- Thin-content vörn: hver síða raun-efni; einstaklinga-kt → 404; skel noindex+Disallow ✓

**Placeholder scan:** Task 5 Step 2 er lýsandi (ekki fastur strengur) af nauðsyn — leitar-render í `lyf.astro` er óþekkt þar til Step 1 grep keyrir; meginregla + fallback gefin. Ekkert „TODO/TBD".

**Type consistency:** `erLogadili`/`ktSep`/`htmlEsc`/`repAll`/`orgJsonLd`/`felagMainHtml`/`fyrirtaekiSidaHandler` skilgreind í Task 2 og notuð þar. `tenderSlug`/`hash` skilgreind + notuð í Task 6. Tókar `%%KARP_*%%` samræmdir milli Task 1 (skel) og Task 2 (worker replace). `slugify` úr `@lib/format.mjs` (staðfest til).
