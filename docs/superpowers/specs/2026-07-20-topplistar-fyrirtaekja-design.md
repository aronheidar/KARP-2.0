# Topplistar fyrirtækja (Creditinfo-stíll) — hönnunar-spec

**Dagsetning:** 2026-07-20
**Staða:** Samþykkt hönnun (bíður spec-yfirferðar → writing-plans)

## Markmið

Borguð Karp+-vara: **topplistar íslenskra fyrirtækja eftir atvinnugrein**, raðaðir eftir
fjárhagsstærðum úr ársreikningum (velta, hagnaður, eignir, eigið fé) — eins og Creditinfo
selur („20 stærstu í sjávarútvegi" o.s.frv.). Læst bak við Karp+ (`hasTier(1)`), sýnileg á
síðu + niðurhal (PDF). Hvert félag á listanum tengist /fyrirtaeki/ + /eigendur/ (frekari sala).

Byggir á gögnum sem KARP á þegar: **6.320 félög með ÍSAT-flokkun** í tengslagrunni (D1) +
ársreikninga-þáttara (`build_arsreikningar.mjs` → sala/hagnaður/eignir/eigið fé, sannreynt
20.7: A. Wendel 535 m.kr velta þáttast rétt).

## Ákvarðanir (festar í brainstorming 2026-07-20)

1. **Staðsetning = borguð vara**, læst bak við **Karp+** (`hasTier(1)`), server-hlið gátað.
   Óinnskráðir/frí sjá **topp-3 agn** + „læst — Karp+". Áskrifandi sér fullan lista + PDF.
2. **Mælikvarðar** úr ársreikningum: velta (`sala`) sjálfgefið; raðanlegt líka eftir hagnaði,
   eignum, eigin fé. Allt þáttast nú þegar.
3. **Greinar úr ÍSAT-forskeytum:** Ísland allt (stærstu), sjávarútvegur (03), verslun (45–47),
   byggingar (41–43), fjarskipti/tækni (61–62), ferðaþjónusta (55–56), iðnaður (10–33),
   fjármál (64–66).
4. **Gögn:** ársreikningar fyllast gegnum **local-trickle** (íbúða-IP Arons, staðfest 20.7:
   ~9s/félag, virkar; step-1 www.skatturinn.is throttlar við magn → hægur taktur), forgangs-
   raðað eftir grein + stærð. Listinn sýnir „byggt á N greindum félögum" á meðan þekja vex.
5. **Þjónusta server-hlið** (worker-endapunktur, live D1-fyrirspurn), EKKI static — svo full
   gögn fari aðeins til réttindahafa (borguð vara).

## Gagnalíkan (D1, grunnur `tengsl`)

### Ný tafla `fjarhagur` — samantekt nýjasta ársreiknings per félag (fyrir röðun)
```sql
CREATE TABLE IF NOT EXISTS fjarhagur (
  kt TEXT PRIMARY KEY,          -- lögaðila-kt (dagur 41–71)
  ar TEXT,                      -- rekstrarár samantektarinnar (t.d. '2024')
  sala REAL,                    -- velta (rekstrartekjur)
  hagnadur REAL,                -- hagnaður eftir skatt
  eignir REAL,                  -- heildareignir
  eigid_fe REAL,                -- eigið fé
  sott TEXT                     -- ISO dags þegar ársreikningur var sóttur
);
CREATE INDEX IF NOT EXISTS idx_fjarhagur_sala ON fjarhagur(sala);
```
Full ársreikningur (öll ár, allir reitir) helst áfram í `web/public/gogn/arsreikningar/<kt>.json`
(fyrir skýrsluna); `fjarhagur` geymir AÐEINS nýjustu-árs samantekt til röðunar.

### `felog.isat_primary` — nýr dálkur (hrein greina-sía)
```sql
ALTER TABLE felog ADD COLUMN isat_primary TEXT;   -- fyrsti ÍSAT-kóði, t.d. '61.20.0'
```
`felog.isat` er JSON-fylki `[{"id":"61.20.0","nafn":"…"}]`. `isat_primary` = fyrsti `id`
(dregið út einu sinni í migration + viðhaldið af crawler). Greina-sía = `substr(isat_primary,1,2) IN (...)`.

## Gagnaöflun — ársreikninga-trickle (víkkun á local-skrapinu)

Nýtt `skriptur/arsreikningar_local.mjs` (systkin `scrape_local.mjs`) — keyrt af vél Arons
gegnum innskráð wrangler + puppeteer/Chrome:
1. Les úr D1: félög í MARKGREINUM sem vantar `fjarhagur`, forgangsraðað eftir `hlutafe` DESC
   (stærra hlutafé ≈ stærra félag → líklegir topp-listar fyrst). Þak per keyrslu (`AR_N`, sjálfg. 8).
2. Per félag: `build_arsreikningar.mjs`-flæðið (`skriptur/lib/rsk.mjs`: fetchItemids →
   addToCart → downloadPdf (puppeteer, vefur.rsk.is) → parse_arsreikningur.py) → nýjustu-árs
   sala/hagnaður/eignir/eigið fé. Skrifar `web/public/gogn/arsreikningar/<kt>.json` (fullt) OG
   `fjarhagur`-röð (samantekt) í D1 gegnum wrangler.
3. **Hraðatakmark-vörn:** ~7–9s milli félaga, back-off eftir N samfelldar bilanir (step-1 er
   www.skatturinn.is — sami múr og eigendur). Logg í `%TEMP%\karp-arsreikn.log`.
4. **Windows Scheduled Task** (systkin `KARP-tengsl-scrape`) keyrir það reglulega → fjárhagur
   fyllist hægt. Markgreinar fyrst → listar verða trúverðugir per grein eftir því sem þekja vex.

⚠ Full bulk-þekja allra ~35þ félaga er hæg (throttla); en topplistar þurfa aðeins STÆRSTU
félögin per grein (fá, auðþekkjanleg eftir hlutafé) → náanlegt á dögum/vikum per grein.

## Greina-vörpun

`web/src/lib/greinar.mjs` (ný, deild worker + framenda): fylki nefndra greina →
ÍSAT-2-stafa forskeyti.
```js
export const GREINAR = [
  { slug: 'island', nafn: 'Ísland allt (stærstu)', isat: null },        // engin sía
  { slug: 'sjavarutvegur', nafn: 'Sjávarútvegur', isat: ['03'] },
  { slug: 'verslun', nafn: 'Verslun', isat: ['45','46','47'] },
  { slug: 'byggingar', nafn: 'Byggingarstarfsemi', isat: ['41','42','43'] },
  { slug: 'fjarskipti', nafn: 'Fjarskipti & tækni', isat: ['61','62','63'] },
  { slug: 'ferdathjonusta', nafn: 'Ferðaþjónusta', isat: ['55','56','79'] },
  { slug: 'idnadur', nafn: 'Iðnaður & framleiðsla', isat: ['10','11','13','16','17','20','22','23','25','28','32','33'] },
  { slug: 'fjarmal', nafn: 'Fjármál & trygging', isat: ['64','65','66'] },
];
```

## Þjónusta + gátun (worker)

**Nýr endapunktur `GET /api/topplistar?grein=<slug>&radad=<sala|hagnadur|eignir|efe>`**
(`web/worker.js`, `topplistarHandler`):
- `karpUserId(request, env)` → uid; sækja `users.tier` + `tier_until` úr D1 → **`entitled = tier≥1 og ekki útrunnið`** (eða admin).
- D1-fyrirspurn: `SELECT f.kt, f.nafn, fj.sala, fj.hagnadur, fj.eignir, fj.eigid_fe, fj.ar
  FROM felog f JOIN fjarhagur fj ON fj.kt=f.kt
  WHERE (<greina-sía á isat_primary>) AND fj.sala IS NOT NULL
  ORDER BY fj.<radad> DESC LIMIT 100`.
- **Gátun server-hlið:** ef `entitled` → skila fullum 100. Annars → skila AÐEINS topp-3 +
  `{ locked: true, total: <fjöldi> }` (agn). Kt einstaklinga ekki við sögu (aðeins lögaðilar).
- Skila líka `coverage`: fjöldi greindra félaga í greininni / heildarfjöldi félaga í greininni
  (svo UI segi „byggt á N af M félögum").
- Cache 6–12 klst per (grein, radad, entitled) — listarnir breytast hægt.

## Framendi

**Ný síða `web/src/pages/topplistar-fyrirtaeki.astro`** (aðskilin frá /topplistar/ sem er
sveitarfélög): greina-flipar efst; raðanleg tafla (sæti · nafn+kt · velta · hagnaður · ár);
hvert nafn → hlekkur á `/fyrirtaeki/?q=<kt>` (+ /eigendur/). Áskrifandi sér 100; annars topp-3
+ Karp+-CTA (`karpCheckout`/`hasTier` mynstur úr ubo-report.js). „byggt á N af M félögum"-borði.
**PDF:** `window.print()` + prent-CSS (sama og skýrslu-PDF). Nav-hlekkur „Topplistar" í /karp-pro/.
Eyja-script sækir `/api/topplistar`, teiknar töflu, meðhöndlar flipa/röðun/print.

## Persónuvernd

Aðeins **lögaðilar** (dagur 41–71); ársreikningar eru OPINBERIR skv. lögum nr. 3/2006 og RSK
býður gjaldfrjálst niðurhal. Engin persónu-kt né einstaklings-PII á listunum. Fjárhagstölur
lögaðila eru opinberar. (Öfugt við eigenda-/tengsla-gögnin — engin DPIA-viðbót þörf hér.)

## Út fyrir umfang (v1.1)

- Excel/CSV-niðurhal (v1 = PDF + á-síðu).
- Söguleg þróun (velta milli ára), vöxtur-röðun.
- Fleiri greinar / undirgreinar; sveitarfélaga-sía.
- Stakt kaup per lista (v1 = Karp+-áskrift eingöngu).
- Sjálfvirk „stærðar-forgangsröðun" úr fleiri merkjum en hlutafé.

## Sannprófun

- **Unit (node:test):** greina-sía (ÍSAT-forskeyti → SQL), fjarhagur-upsert, entitled-gátun
  (tier≥1 vs teaser topp-3), coverage-reikningur.
- **Gagna-próf:** `arsreikningar_local.mjs` á 5 félög → `fjarhagur`-raðir réttar (sala þáttuð);
  keyrt af vél Arons (staðfest að sóknin virki 20.7).
- **Gátunar-próf (SKYLDA):** `/api/topplistar` óinnskráður → topp-3 + `locked:true`; Karp+ →
  fullir 100. Staðfesta að fullur listi fari EKKI til óinnskráðra (network-tab).
- `npx astro build` + `node --check web/worker.js` + `node --test`.
- Vafra-próf á /topplistar-fyrirtaeki/ (flipar, röðun, teaser vs fullur, PDF-prentun).

## Deploy

Vinna í worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (branch `b2b-topbar`).
Deploy = `git push origin b2b-topbar:main` (rebase á árekstra). D1-migration (fjarhagur +
isat_primary) beitt gegnum `wrangler d1 execute`. Local ársreikninga-trickle sett upp sem
Scheduled Task eins og [[karp-tengslagrunnur]] eigenda-trickle.
