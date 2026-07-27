# Lobbývakt v1 — hönnunarskjal (design spec)

**Dagsetning:** 2026-07-27
**Staða:** samþykkt hönnun (Aron), bíður spec-yfirferðar → útfærsluáætlun (writing-plans).

## 1. Markmið

Fyrirtæki+ áskrifandi velur atvinnugrein(ar) og fær **persónulegan straum + email-digest** af reglum í pípunni — **frumvörpum/þingmálum (Alþingi)** og **samráðsmálum (samráðsgátt island.is)** — sem snerta hans grein. Hvert mál fær **AI-áhrifa-brief** („hvað þýðir þetta fyrir þig"), **relevans/áhættu-stig** og **frest/stöðu**. B2B reglu-vöktun (gov-affairs), ekki lobbý-gagnsæi.

Sérstaða: enginn íslenskur aðili sameinar Alþingi + samráðsgátt + AI-greina-samsvörun í persónulega reglu-vakt. Nýtir gögn (Alþingis-XML, samráðsgátt) og Claude-í-CI innviði sem Karp á þegar.

## 2. Meginval (úr brainstorm)

- **Kjarni:** B2B reglu-vöktun (fyrirtæki vakta reglur sem snerta þau).
- **Samsvörun:** AI-efnisflokkun → föst KARP-greina-taxonomy, sjálfvirkt (engin notenda-uppsetning umfram greina-val).
- **Heimildir:** Alþingi frumvörp/þingmál + samráðsgátt.
- **Afhending:** email-vakt + `/lobbyvakt/` mælaborð.
- **Nálgun:** „Áhrifa-brief" (AI-flokkun + áhrifa-samantekt + stig + frestir).
- **Þrep:** Fyrirtæki+ (`hasTier('fyrirtaeki_plus')` eða admin), eins og KYC.

## 3. Greina-taxonomy (föst, ~16 greinar)

Notuð BÆÐI fyrir AI-flokkun (Claude fær listann og velur úr honum) OG notenda-val. EKKI hrátt ÍSAT (of fínt/margþætt) — föst grófgreining gefur hreina samsvörun.

```
sjavarutvegur      Sjávarútvegur (veiðar, vinnsla, fiskeldi)
landbunadur        Landbúnaður & matvælaframleiðsla
ferdathjonusta     Ferðaþjónusta
bygging            Bygging & mannvirkjagerð
fasteignir         Fasteignir & leigumarkaður
verslun            Verslun & almenn þjónusta
idnadur            Framleiðsla & iðnaður (þ.m.t. orkufrekur/stóriðja)
orka               Orka & veitur
fjarmal            Fjármál, tryggingar & fjártækni
ut                 Upplýsingatækni & fjarskipti
heilbrigdi         Heilbrigði, lyf & velferð
menntun            Menntun & rannsóknir
flutningar         Flutningar & samgöngur
fjolmidlar         Fjölmiðlar & skapandi greinar
umhverfi           Umhverfi, úrgangur & sjálfbærni
almennt            Þvert á greinar / almennt atvinnulíf (skattar, vinnuréttur,
                   félagaréttur, persónuvernd) — birtist ÖLLUM notendum
```

`almennt` er sértilfelli: mál merkt `almennt` snerta öll fyrirtæki og eru ALLTAF með í straumi/digest hvers notanda, óháð greina-vali. Taxonomy-in er skilgreind í `web/src/lib/lobbyvakt.mjs` (`SECTORS`) — ein uppspretta fyrir vél, worker og UI.

## 4. Arkitektúr (3 lög — speglar RÁS/frettavél/vaktir)

### 4.1 Nætur-flokkun (CI build) — `skriptur/build_lobbyvakt.mjs`

**Inntak:** ný þingmál + samráðsmál.
- **Þingmál:** sömu Alþingis-XML-veitu og `/thingmal/` + `build_thingmal_ras.mjs` nota (frumvörp/tillögur með titli, stöðu, hlekk). Endurnýta `frumvorp.json`/þingmála-veituna sem er þegar sótt.
- **Samráðsmál:** samráðsgátt-veitu island.is sem „Samráðsvaktin" (`/vaktir/`) notar þegar (titill, lýsing, mál-flokkur, samráðsfrestur, hlekkur).

**Flokkun:** fyrir hvert NÝTT mál (dedup á `id` gegn `lobbyvakt_seen`-mengi, eins og frettavél seen-state) → Claude **haiku** (eins og `build_thingmal_ras.mjs`) fær titil + tiltæka lýsingu + fasta greina-listann og skilar STRÖNGU JSON:
```json
{ "greinar": ["sjavarutvegur","almennt"], "brief": "1–2 setninga áhrifa-túlkun á mannamáli",
  "stig": "Miðlungs", "efni": ["veiðigjald","skattar"] }
```
- `greinar` = 0–4 úr föstum lista (validera: henda óþekktum). Tómt → merkja `almennt` ef ekkert passar (fail-open svo mál týnist ekki).
- `stig` ∈ {`Lítil`,`Miðlungs`,`Mikil`} (validera, default `Miðlungs`).
- `brief` = hlutlaus áhrifa-túlkun, engin lögfræðileg niðurstaða.
- Malformað Claude-svar → sleppa AI-reitum fyrir það mál (greinar úr heuristík, enginn brief), EKKI brjóta bygginguna.

**Frestur/staða:** samráðsmál → `frestur` = samráðsfrestur (ISO-dags); þingmál → `stada` = þing-staða (t.d. „1. umræða", „nefnd"). 

**Úttak:** `web/public/gogn/lobbyvakt.json`:
```json
{ "updated": "2026-07-27",
  "items": [
    { "id": "thm-156-42", "kind": "thingmal", "titill": "...", "hlekkur": "https://althingi.is/...",
      "greinar": ["sjavarutvegur"], "brief": "...", "stig": "Mikil", "efni": ["veiðigjald"],
      "frestur": null, "stada": "1. umræða", "dags": "2026-07-20" },
    { "id": "sam-2026-118", "kind": "samrad", "titill": "...", "hlekkur": "https://samradsgatt.island.is/...",
      "greinar": ["bygging","almennt"], "brief": "...", "stig": "Miðlungs", "efni": ["byggingarreglugerð"],
      "frestur": "2026-08-15", "stada": "Til umsagnar", "dags": "2026-07-18" }
  ],
  "bySector": { "sjavarutvegur": ["thm-156-42"], "bygging": ["sam-2026-118"], "almennt": ["sam-2026-118"] } }
```
- Heldur síðustu ~90 daga málum (rúllandi gluggi) svo straumurinn sé stjórnanlegur; `bySector` er index fyrir hraða síun.
- **Cache/seen:** flokkuð mál geymd í `lobbyvakt_cache.json` (id → AI-reitir) → aðeins ný mál fara í Claude → ódýrt (haiku, fá mál/dag).
- **Fallback:** gated á `ANTHROPIC_API_KEY` (komið í CI-secrets). Án lykils → greina-heuristík (leitarorð→grein úr `SECTOR_HINTS` í `lobbyvakt.mjs`), enginn `brief`, `stig="Miðlungs"`.
- **Sanity-guard:** ef 0 items → henda (ekki skrifa tóma skrá yfir góða).
- **CI:** ný lína í `.github/workflows/refresh-data.yml` (`node skriptur/build_lobbyvakt.mjs || true`), daglegt, næst á eftir þingmála-/frettavél-þrepum (svo `frumvorp.json` sé ferskt).

### 4.2 Worker — þjónusta + email

- **`GET /api/lobbyvakt`** (`lobbyvaktHandler`): les session → notanda-röð; **Fyrirtæki+ gátt** (`_lobbyGate(owner)` = admin || virkt fyrirtaeki_plus, eins og `_kycGate`; meðlimur erfir þrep um `accountOwner`). Les valdar greinar úr `user_prefs` (`lobbyvakt_greinar`, account-scoped um `accountId`). Les `lobbyvakt.json` (augGet) → sía með `filterFeed(items, greinar)` → skilar `{ ok:true, greinar, items: [...], updated }`. Engar greinar valdar → `{ ok:true, greinar:[], items:[], needsSetup:true }` (UI biður um val, forfyllt úr account-ÍSAT). Villa/augGet null → `{ ok:true, items:[] }` (aldrei 500). KARP-venja: HTTP 200 + `{ok:false,error}` fyrir gátt-höfnun.
- **`POST /api/u/lobbyvakt`** (í `userDataHandler`, `/lobbyvakt`-path): vista valdar greinar (`{ greinar:[...] }` → validera gegn `SECTORS`) í `user_prefs` account-scoped. Sömu mynstur og `/ktwatch`.
- **Email-digest:** teng inn í digest-cron sem er til (vikulegur mánud. 08:10 + frettavaktir 3-tíma cron). Fyrir hvern áskrifanda með `lobbyvakt_greinar`: ný mál síðan síðasti digest (`newSince(items, sinceTs, seenIds)`) sem passa við greinarnar → nýr „🏛️ Reglur í pípunni"-kafli í digest-póstinum. Virðir cadence-stillingu notandans (strax/dagl./vikul.) eins og aðrar vaktir. Per-notandi seen-merki svo ekki tvítilkynnt.

### 4.3 UI — `/lobbyvakt/` (Astro, Fyrirtæki+ gated)

- Layout eins og `/areidanleikavaktin/`: `#lv-gate` (óg_áskrifandi → hlekkur á /karp-pro/#verd), annars mælaborð.
- **Greina-velja:** fjölvals-pillur úr `SECTORS`; forfyllt úr account-félags-ÍSAT (map ÍSAT→grein) við fyrstu heimsókn; vista um `POST /api/u/lobbyvakt`.
- **Straumur:** kort per mál — málategund-merki (📜 þingmál / 💬 samráð), titill+hlekkur á upprunann, greina-tögg, **áhrifa-brief**, `stig`-merki (litakóðað), frestur/staða. Raðað: virkir frestir fyrst (næsti frestur efst), svo nýjustu. Client `fetch('/api/lobbyvakt')`.
- **Fyrirvari (áberandi):** „⚠ Áhrifa-túlkun er sjálfvirk (gervigreind) og til glöggvunar — ekki lögfræðiráðgjöf. Staðfestu í frumtextanum." Á síðu + í hverjum digest.
- Nav-hlekkur + skráning á `/karp-pro/`.

## 5. Hrein rökvél — `web/src/lib/lobbyvakt.mjs` (einingaprófuð)

Engin I/O; deilt af build, worker og UI-forfyllingu.
- `export const SECTORS` — fasti (kóði→heiti), taxonomy §3.
- `export const SECTOR_HINTS` — leitarorð→grein fyrir heuristík-fallback.
- `matchItem(item, userSectors)` → bool: `item.greinar ∩ userSectors ≠ ∅` EÐA `item.greinar.includes('almennt')`.
- `filterFeed(items, userSectors)` → síuð + röðuð (frestur↑ svo dags↓).
- `newSince(items, sinceTs, seenIds)` → mál til að tilkynna í digest.
- `classifyHeuristic(titill, lysing)` → greinar úr `SECTOR_HINTS` (fallback án API-lykils).
- `stigRank(stig)` → tala (röðun/þröskuldur).
- `isatToSector(isat)` → grein (forfylling úr account-ÍSAT).

## 6. Villumeðferð

- **Build:** API-lykill vantar → heuristík-fallback (engin brief); malformað Claude-JSON → sleppa AI-reitum þess máls; 0 items → henda (ekki yfirskrifa); `|| true` í CI (bilun blokkar ekki workflow).
- **Worker:** augGet null → tómur straumur; gátt-höfnun = HTTP 200 `{ok:false,error:'tier'}`; engar greinar → `needsSetup`; allar D1/fetch með `.catch()`.
- **Persónuvernd:** aðeins opinber mál (engin persónugögn); notanda-greina-val account-scoped eins og önnur vöktun. Fyrirvari um að AI-túlkun sé ekki ráðgjöf.

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/lobbyvakt.mjs` (eða `lobbyvakt.test.mjs`): `matchItem` (greina-skörun + `almennt`-regla), `filterFeed` (röðun frestur/dags), `newSince` (seen-sía), `classifyHeuristic`, `isatToSector`, `stigRank`.
- `node skriptur/build_lobbyvakt.mjs` (þurr-keyrsla með API-lykli EÐA fallback) → skrifar `lobbyvakt.json` með skynsamlegan fjölda.
- `node --check web/worker.js`.
- `cd web && npx astro build` (≈3581 síður).
- Live-verify eftir deploy: `/api/lobbyvakt` með Fyrirtæki+ session (eða admin) → straumur; browser-próf á `/lobbyvakt/`.

## 8. Utan v1 (vísvitandi — fast-follows)

Leitarorða-fínstilling (ofan á AI-grunn); EES-tilskipanir sem heimild; tímalínu-/„ferill máls"-sýn; „hverjir aðrir beita sér" (samráðs-umsagnaraðilar = lobbý-gagnsæi); „reglur í pípunni"-kassi á fyrirtækjaprófíl + Mitt svæði; standalone-verð (v1 = innifalið í Fyrirtæki+); breytinga-vakt á stöðu einstakra mála sem notandi fylgir.

## 9. Skrár (yfirlit)

- **Ný:** `web/src/lib/lobbyvakt.mjs`, `web/src/lib/lobbyvakt.test.mjs`, `skriptur/build_lobbyvakt.mjs`, `web/public/gogn/lobbyvakt.json` (build-úttak), `web/src/pages/lobbyvakt.astro`.
- **Breytt:** `web/worker.js` (`lobbyvaktHandler` + `/api/lobbyvakt` route + `/lobbyvakt` pref-path í `userDataHandler` + digest-cron kafli), `.github/workflows/refresh-data.yml` (build-þrep), nav/`karp-pro`-skráning.
- ⚠ Samhliða-session í `mitt-svaedi-wt`: berur `git add <skrár>`, ALDREI `-A`.
