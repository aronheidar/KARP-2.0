# KARP heildarúttekt — 30.7.2026 (eftir Cloudflare-flutning)

Aðferð: 3 samhliða kóða-könnuðir (WordPress-leifar · dauður kóði/tiltekt · gagnapípa) + live-heilsutékk á karp.is (14 endapunktar, auth-síður, öryggishausar, wp.karp.is). Kóðamælingar á `origin/main` (worktree `mitt-svaedi-wt` var ~40 commit á eftir — sjá lið C9).

---

## 🔴 A — Brotið / hættulegt NÚNA

**A1. wp.karp.is redirectar á ótengt lén.** `https://wp.karp.is/*` → 302 á `airbrokericeland.is` — gamli WP-hýsillinn þjónar nú öðru vefsvæði og undirlén karp.is fylgir með. Traust-/öryggismál (undirlén sendir fólk á þriðja aðila) OG þrír worker-fetchar (A4) tala nú við rangan aðila. **Aðgerð: eyða wp-DNS-færslunni í Cloudflare strax.**

**A2. `/api/askell/config` — ógáttaður endapunktur með of mikil réttindi.** `worker.js:4851→1854-2004`. `?detail=<id>` maskar kennitölu aðeins á fyrstu 6 stöfum (síðustu 4 leka); `out.pp_raw` skilar fullu hráu Áskels-svari; gerir POST á lifandi Áskels-API ógáttað; harðkóðuð gervi-kt `1234567890` í POST-body (:1987). Merktur „EYÐA eftir að webhook er staðfestur" — webhook er staðfest. **Aðgerð: eyða route + handler (og `askellLastHandler` :1433-1469, dautt PII-cache-les í leiðinni).**

**A3. Lobbývaktin er efnislega tóm — eitrað AI-cache.** `lobbyvakt.json` (updated 30.7): **108/108 mál með `brief:""`**. Orsök: `lobbyvakt_cache.json` var fyllt 27.7 (þegar ANTHROPIC_API_KEY vantaði) með 228 færslum með tómt brief; `build_lobbyvakt.mjs:128` síar `todo` á `!cache[it.id]` → Claude er ALDREI kallaður aftur þótt lykillinn sé kominn. **Aðgerð: hreinsa cache-skrána (eða sía líka á `!cache[id].brief`) + ein keyrsla. Athuga sama mynstur í `build_utbod_haefi.mjs` + `build_thingmal_ras.mjs`.**

**A4. Uppsagnar-jarðsprengja við WP-slökkvun.** `worker.js:1381` (`subCancelHandler`) krefst enn `KARP_GRANT_SECRET` þótt bolurinn noti bara D1. Ef leyndarmálið er hreinsað þegar WP fer → `/api/sub/cancel` skilar `unconfigured` → **notendur komast ekki úr áskrift meðan Áskell rukkar áfram**. Þrjú fire-and-forget wp.karp.is-fetch (1289, 1672, 1807 — tvískrifun eftir D1) eru skaðlaus en 1672+1807 eru `await`-uð og bæta töf á greiðslustaðfestingu. **Aðgerð: fjarlægja KARP_GRANT_SECRET-skilyrðið úr :1381 + eyða öllum þremur wp-fetchunum.**

**A5. birgjar-weekly pípan virðist dauð.** `birgjar/sanctions/loftfor/skip_owners` öll 20-27 daga gömul þrátt fyrir viku-cron (mán 04:30) — 3-4 keyrslur án breytinga. **Aðgerð: skoða Actions-logga birgjar-weekly.yml.**

## 🟠 B — WordPress-staðan (svarið við spurningunni)

- **Auth/réttindi/greiðslur/póstur/vaktir: 100% flutt.** `auth.js` hrein (engin wp-json-slóð), öll 42 `/api/u/*`-köll á worker+D1, hjálp um Gmail, native /innskra/+/nyskraning/ virka live.
- **Enn stuðst við WP á aðeins 3 stöðum** — hljóðláta tvískrifunin í A4. Ekkert annað keyranlegt.
- **Gamla mælaborðið (`dashboard.html` → `dist/karp-app.js`) deyr með WP**: 67 wp-json-köll, keyrir aðeins innan WP-síðunnar. Nýja Astro-síðan þekur efnið. **Ákvörðun: sætta sig við að það fari (mælt með).**
- **`wordpress/` (12 PHP) + `wp/` (1 PHP) = úrelt WPCode-frumrit** — ekkert vísar á þau. Geyma `karp-frettir.php` sem heimild (wp_karp_news), annars má safnið í archive/eyðast.
- **Dómur: óhætt að slökkva á wp.karp.is** eftir (1) A4-lagfæringu á :1381 og (2) meðvitaða ákvörðun um gamla mælaborðið. DNS-hreinsunin (A1) er óháð og á að gerast strax.

## 🟡 C — Laga fljótlega (skuld sem bítur)

**C1. Bilanir í gagnapípunni eru ósýnilegar Í HÖNNUN.** 80× `|| true` í refresh-data.yml + „commit aðeins ef breyting" ⇒ hrunin skripta og óbreytt veita líta eins út. Þetta er rótin að OneDrive-frostinu og 52-skráa tapinu. Lágmark: OK/FAIL per skref í `$GITHUB_STEP_SUMMARY` + loka-skref fellur ef >N mistókust. (`build_heilsa.mjs` mælir ferskleika eftir á en fellir/varar ekkert.)
**C2. Engin próf keyra í CI.** 16 test-skrár (m.a. atvinnugrein 45, lobbyvakt 34, vaktir-signals 34, kyc 12) — ci.yml keyrir ekkert `node --test`, engin `test`-skripta í package.json. Prófin rotna óséð.
**C3. Öryggishausa vantar á karp.is:** enginn HSTS, enginn CSP, ekkert X-Frame-Options (nosniff+referrer eru til). Auðveld herðing í worker/_headers.
**C4. `?debug=1` á `/api/rsk`** (:3012) hjáveitir jaðar-cache á hraðatakmarkað/mælt Azure-uppstreymi — kvóta-/kostnaðarvigur, ógáttað. Fjarlægja (merkt TÍMABUNDIÐ).
**C5. RÁS-þingmálaflokkunin keyrir aldrei sjálfkrafa.** `build_thingmal_ras.mjs` er utan CI; `build_frumvorp.js` yfirskrifar daglega → `ras`-reitirnir hverfa/staðna. Bæta í refresh-data með ANTHROPIC_API_KEY-env.
**C6. Fjórar gogn-skrár eiga engan framleiðanda** (`ivilnanir`, `skattar`, `utgjold`, `landshlutar` — 20-26d) og `build_sveitarfelog_geo.js` + `build_sitemap_fyrirtaeki.mjs` eru utan CI. Ákveða: skriptu-væða, CI-setja eða merkja „handvirkt viljandi".
**C7. Tvöfalda gagnatréð** `gogn/` vs `web/public/gogn/` með hvítlista-`build_ragcopy.js` ⇒ mælanleg ósamstilling (cabinet 31d vs 26d) + 27 rótar-skrár frosnar 29.6. Sameina eða gera afritun sjálfvirka fyrir allt.
**C8. D1-heimildaveggur framundan:** CI-tokenið vantar list-heimild; `build_sentiment_ai.mjs` var lagað (database_id beint) en `crawl_tengsl.mjs` + `export_tengsl_fonix.mjs` nota enn `wrangler d1 execute tengsl` → falla á sama vegg, þögult (bak við `|| true`).
**C9. Worktree-drift sem vinnulag:** `mitt-svaedi-wt` var 4 daga/~40 commit á eftir main við úttekt — greiningar+breytingar gerast þá á móti kóða sem er ekki sá sem keyrir (OneDrive-fixið „vantaði" t.d. bara í worktree-ið). Venja: `git fetch && git rebase origin/main` (eða a.m.k. fetch+samanburður) í upphafi hverrar lotu.
**C10. worker.js komið yfir þolmörk:** 4.907 línur, 73 handlers, 5 cron á einni keðju. Klofningsfletir tilbúnir: greiðslur (~830 l.), auth, cron+digest. Sama gildir um `fyrirtaeki.astro` (1.946 l., ein script-eyja).

## 🟢 D — Tiltekt (hvenær sem er)

- Dauður kóði: `askellLastHandler` (fer með A2), lobbyvakt.astro `renderFeed`+`showGate('tier')`+`#lv-gate-tier` (staðfest ónáanlegt), `eftNylegt` (lifir aðeins á eigin prófum), ónotuð import `KYC_SEV`+`filterFeed`, `[stub].astro` (byggir 0 síður), X-WP-Nonce-línan í auth.js.
- Villandi WP-comments (segja „sendir á WP" þar sem D1/Gmail er raunin): worker.js:424-431, 1378/1409/1422; auth.js:3-8; utbod.astro:506; hjalp.astro:3. Lagfæra við næstu snertingu.
- OneDrive-leifar (handvirkar, ekki CI): `build_seats.js`, `gen_static.js`, `build_embed.js`, `refresh-althingi.bat` — laga eða merkja úreltar; `create_pages.js`+`gen_static.js` (royal-mcp WP-síðugerð) munaðarlausar → eyða.
- `_apptest.html`/`_preview.html` + dashboard-byggingarpípan (`build_app.js`, `build_embed.js`, karp-dashboard.pages.dev) → fjarlægja þegar gamla mælaborðið er kvatt.
- Prófalausar lykil-modúlur: `auth.js` (583 l.) stærst; svo `ubo-report.js`, `ubo-core.mjs`, `frettavel.mjs` o.fl.

## ✅ E — Það sem er hreint (staðfest)

Live: forsíða án console-villna, 14/14 lykil-endapunktar rétt svör+gátun, native auth-flæði virkt, sitemap+robots í lagi. Kóði: **0** console.log í client, **engar** munaðarlausar síður (93 slóðir allar tengdar), **engin** TODO/FIXME-skuld (174 ⚠ eru skjölunarvenja), engin brotin próf-import, engar `_`-lekaskrár í pages, wrangler/workflows án WP-vísana. Pípan á lífi (60/74 skrár ferskar daglega). Paywall er meðvitað harðkóðað `false` (worker.js:3456) — viðskiptaákvörðun, ekki galli.

## Forgangsröðun

**Dagur 1 (klst-verk):** A1 DNS · A2 eyða askell/config+last · A3 lobbyvakt-cache · A4 :1381+3 wp-fetch · A5 kíkja á birgjar-loggana.
**Vika:** C1 step-summary/fail-gate · C2 próf í CI · C3 öryggishausar · C4 debug-param · C5 RÁS í CI · C8 D1-heimildir.
**Mánuður:** B gamla mælaborðið kvatt + wp.karp.is slökkt + PHP-safn í archive · C6/C7 gagnatré · C10 worker.js-klofningur · D-tiltektin jafnóðum.
