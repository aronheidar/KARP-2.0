# RÁS-Leikurinn (S1: Game core) — hönnunarskjal

**Dagsetning:** 2026-07-26
**Höfundur:** Claude (brainstorming með Aroni)
**Staða:** Samþykkt hönnun, bíður yfirlestrar fyrir útfærsluáætlun
**Umfang:** Sub-project **S1** af stærra verkefni (Approach 2). S1 = spilanlegur kjarni. S2–S6 á vegvísi (neðst).

## Markmið

Turn-based fjölspilunar-kennsluleikur í þjóðhagfræði, sniðinn að Íslandi, á `karp.is/leikur/` — í anda IESE EXSIM. **Keppandi „ríkisstjórnar"-lið** stýra hvert sínu Íslandi gegnum umferðir, taka fáar en þungar stefnu-ákvarðanir, og eru stiguð eftir sameiginlegu umboði (markmiðum). Leikurinn endurnýtir RÁS-vélina (`src/lib/roads/engine.mjs`) sem keyrir **á þjóni** (Cloudflare Worker) — leikstjóra-stjórnborð + lifandi stigatafla.

## Grunn-ákvarðanir (úr brainstorm)

| Ákvörðun | Niðurstaða |
|---|---|
| Hlutverk & keppni | **Keppandi ríkisstjórnir (lið)** — hvert lið sitt Ísland, sömu sjokk, keppa um stig. |
| Málhópur | **Executive / stjórnendur** — fáar þungar ákvarðanir, áhersla á umræðu + debrief, styttri lotur. |
| Samstilling | **Fullur leikur með kóða + bakendi** (Worker + D1, þjóns-vald á vélinni). |
| Markmið/stig | **Sameiginlegt umboð** (sömu markmið öll lið) + stig eftir hversu vel hitt. |
| Forskoðun | **Blind ákvörðun** — engin tölu-forskoðun áður en læst er (umræðu-drifið, EXSIM-stíll). |
| Slóð | `karp.is/leikur/` (path, ekki undirlén — endurnýtir deploy). |
| Kóði | **Nýtt app sem endurnýtir `engine.mjs`** — EKKI afrit af `hermir.astro`. hermir ósnert. |

## Hlutverk

- **Leikstjóri (facilitator):** býr til leik, stillir (v1: sjálfgefið), pacear umferðir (opna → afhjúpa → leysa → næsta), sér öll lið + stigatöflu.
- **Lið (team):** gengur inn með kóða + liðsnafn, ræðir, sendir/læsir ákvörðunum, sér niðurstöður + skorkort + stigatöflu.
- (Áhorfandi = S6, síðar.)

## Hluti 1 — Umferðar-lykkja

**Ástands-vél leiks:** `lobby` → (umferð r=1..N: `reveal` → `decide` → `resolved`) → `ended`.

**Sjálfgefið: 8 umferðir × 4 ársfjórðungar = 8 ár.**

1. **Forsalur (`lobby`):** leikstjóri býr til leik → 4–6 stafa kóði. Lið ganga inn (nafn); leikstjóri sér þau birtast, byrjar leik þegar tilbúið. Innganga aðeins leyfð í `lobby` (v1).
2. **Umferð r:**
   - **Atburður (`reveal`):** atburðakort umferðar sýnt ÖLLUM liðum samtímis (t.d. „Umferð 3: Olíuverð +40%, kjarasamningar lausir"). Sami atburður fyrir öll lið.
   - **Ákvörðun (`decide`):** hvert lið stillir 5 ákvarðanir + **læsir** („Læsa ákvörðunum"); má endurskoða þar til læst eða leikstjóri lokar. Leikstjóri sér „3/5 lið tilbúin".
   - **Úrlausn (`resolved`):** þegar öll læst (eða leikstjóri þvingar) → Worker færir hagkerfi HVERS liðs áfram um 1 ár (4 ársfj.) með ákvörðunum liðsins + sameiginlega atburðinum, **ofan á uppsafnað ástand liðsins**.
   - **Niðurstöður + debrief:** hvert lið sér KPI-hreyfingu vs umboð, umferðar-stig, og stigatöflu. Leikstjóri pacear umræðu → opnar næstu umferð.
3. **Leikslok (`ended`):** lokastigatafla, ferill hvers liðs, samantekt.

**Kjarna-vélbúnaður — ákvarðanir safnast upp.** Hvert lið ber viðvarandi hag-feril milli umferða: vaxtahækkun í umferð 3 bergmálar enn í umferð 5. Leikurinn er EINN samfelldur N-ára ferill, leystur ár í einu (ekki 8 aðskildar þrautir). Pacing er leikstjóra-drifið (handvirkt) með valkvæðum mjúkum umferðar-tímamæli.

## Hluti 2 — Ákvarðanasett (5 per umferð)

Executive = **stak-þrepa afstöður, ekki fínir sleðar**. Lið ræða ÁTT, ekki 7,25%. Öll varpast á núverandi RÁS-sleða → **engin vélar-breyting**.

| # | Ákvörðun | Val | → RÁS-sleði | Líkan |
|---|---|---|---|---|
| 1 | Peningastefna | Herða mikið · Herða · Óbreytt · Slaka · Slaka mikið | `vextir` | **Δ á hlaupandi stig** (±1.0/±0.5/0), klippt í [min,max] |
| 2 | Ríkisútgjöld | Mikið aðhald → Mikil örvun (5 þrep) | `utgjold` | Δ á hlaupandi stig |
| 3 | Skattstefna | Hækka mikið → Lækka mikið (5 þrep) | `skattar` | Δ á hlaupandi stig |
| 4 | Fjárfesting/umbót (1 spjald) | Innviðir · Orkuskipti · Húsnæði · Menntun/nýsköpun · *engin* | viðeigandi sleði | **eins-árs púls** + kostnaður á afkomu það ár |
| 5 | Viðbragð við atburði | 2–3 valkostir bundnir atburði | sleða-/sjokk-stilling | samhengisháð (púls eða Δ) |

**Líkan ákvarðana (nákvæmt í `resolve.mjs`):**
- **#1–3 (afstöður):** hver afstaða er **Δ á hlaupandi stig sleðans** (`level_r = clamp(level_{r-1} + Δ, min, max)`), haldið yfir 4 ársfj. umferðarinnar. Þetta gefur ferils-háðni (raunhæft: „hækka vexti um 0,5pp"), ekki aðeins árlegt núllstillt.
- **#4 (spjald):** eins-árs púls — setur viðeigandi sleða upp fyrir ÞÁ 4 ársfj. + versnar afkomu það ár; til að viðhalda þarf að velja aftur. „Engin" = spara svigrúm.
- **#5 (viðbragð):** valkostir atburðar varpast á sleða/sjokk (púls eða Δ) — skilgreint per atburði í `scenario.mjs`.
- Aðrir ~25 sleðar haldast á grunngildi (0 frávik) — leikurinn er valið hlutmengi.

Hver afstaða ber eina-línu eigindlega vísbendingu („Slaka → örvar hagvöxt, þrýstir á verðbólgu"). Töluleg „af hverju" = S3-debrief (síðar).

**Blind ákvörðun:** ENGIN tölu-forskoðun í client áður en læst er. Client keyrir EKKI vélina í S1 (þjónn leysir). Þunn client.

## Hluti 3 — Umboð & stigagjöf

**Umboð = fá, ANDSTÆÐ markmið**, sýnileg öllum frá byrjun. Sjálfgefið v1-umboð (stillanlegt í S4):

| Markmið | Target | Band (full stig) |
|---|---|---|
| Verðbólga | 2,5% | ±1,0 pp |
| Atvinnuleysi | ≤ 4,5% | upp í 5,5% |
| Skuldir ríkis | ≤ 40% VLF, ekki hækkandi | upp í 45% |
| Hagvöxtur | ≥ 2,0% | niður í 1,0% |

Markmiðin eru **vísvitandi í togstreitu** — engin ríkjandi stefna; leikurinn verðlaunar JAFNVÆGI.

**Stigagjöf (`scoring.mjs`), per umferð:**
1. **KPI-stig (0–100):** full stig innan bands; línuleg rýrnun utan þess að `zeroAt`-fjarlægð, klippt [0,100]. Fall: `scoreKpi(value, {target|max|min, band, zeroAt})`.
2. **Samsett** = vegið meðaltal KPI-stiga (v1: jafnt vægi 25% hvert, stillanlegt í S4).
3. **Uppsöfnuð stigatafla** = summa umferðar-samsettra stiga → verðlaunar VIÐVARANDI árangur, ekki lokaspretti; stigatafla hreyfist hverja umferð.
4. **Kreppu-refsing:** rjúfi KPI hörð mörk í umferð (verðbólga > 10%, atvinnuleysi > 12%, skuldir > 90% VLF) → umferðar-samsett × 0,3 + **„⚠ Kreppa"**-merki í debrief.

**Gagnsæi:** eftir úrlausn sér hvert lið **skorkort** — súla per KPI (fjarlægð frá markmiði) + umferðar-samsett + stigatöflu-sæti. Lið vita HVAR þau tapa stigum → drífur umræðuna. Umboð + regla eru opin.

## Hluti 4 — Tæknileg útfærsla

**Isomorphic leik-rökfræði** (`src/lib/leikur/`, hrein & einingaprófanleg, deilt worker + client):
- `decisions.mjs` — varpar 5 afstöðum → RÁS-sleða-gildi (Δ-uppsöfnun + klipping; spjald-púls).
- `scenario.mjs` — sjálfgefin sjokk-runa + atburðakort (1 per umferð) + viðbragðs-valkostir.
- `resolve.mjs` — byggir **fylki-gild** sleða/sjokk-leiðir úr ALLRI ákvörðanasögu liðs og kallar `simulate(…, quarters: r×4)`. **Þannig safnast ástand upp án vélar-breytingar** (vélin styður fylki-sleða, heldur síðasta gildi). Skilar KPI við lokafjórðung = staða liðs.
- `scoring.mjs` — umboðs-mat → KPI-stig → samsett → kreppu-refsing → uppsafnað.
- `mandate.mjs` (eða hluti scoring) — sjálfgefið umboð (töflu að ofan) sem gögn.

**Þjóns-vald (Worker).** Worker flytur inn `engine.mjs` + `baseline/links`-JSON (búnt á byggingartíma) og keyrir `resolve.mjs` fyrir öll lið við umferðar-lokun. Client reiknar ALDREI vélina (blind ákvörðun þarf enga vél í client → þunn client). Stigatafla ófölsuð.

**Endapunktar Worker** (`/api/leikur/*`), auðkenning gegnum HMAC-undirrituð tákn Worker (leikstjóra-tákn vs lið-tákn):

| Aðferð | Leið | Hlutverk | Skilar |
|---|---|---|---|
| `POST` | `/api/leikur/create` | leikstjóri: nýr leikur (config) | `{code, facToken}` |
| `POST` | `/api/leikur/<code>/join` | lið: gengur inn (`{name}`) | `{teamToken, teamId}` |
| `GET` | `/api/leikur/<code>/state` | poll; tákn skammtar sýn | hlutverks-háð ástand |
| `POST` | `/api/leikur/<code>/decisions` | lið: senda/læsa (`{round, decisions, locked}`) | `{ok}` |
| `POST` | `/api/leikur/<code>/control` | leikstjóri: `open`/`reveal`/`resolve`/`next`/`start` | `{ok, phase}` |

- **Tákn:** `facToken` = HMAC({code, role:'fac'}); `teamToken` = HMAC({code, teamId, role:'team'}). Endurnýtir undirritunar-tól Worker (sama og innskráningar-kaka). Engin leyndarmál í client-læsanlegu formi.
- **`GET /state`** skilar hlutverks-skammtaðri sýn: lið sér EKKI ákvarðanir annarra liða fyrir úrlausn; leikstjóri sér „x/y læst" + stigatöflu.

**D1-skema** (4 nýjar töflur á núverandi D1-binding — AÐEINS viðbót, engin snerting á núverandi töflum):
- `leikur_games`(code PK, config TEXT[json: rounds, mandate, scenarioId], phase TEXT, current_round INT, fac_secret TEXT, created INT)
- `leikur_teams`(id PK, game_code, name, token_secret TEXT, joined INT)
- `leikur_decisions`(game_code, round INT, team_id, decisions TEXT[json], locked INT, submitted_at INT) — uppsöfnuð ákvörðunasaga.
- `leikur_results`(game_code, round INT, team_id, kpis TEXT[json], round_score REAL, cumulative REAL) — leystar niðurstöður.

**Samstilling & endurtenging.** Client pollar `GET /state` á ~2–3 s fresti. Allt ástand í D1 (þjóns-vald) → refresh/rejoin les bara ástand með tákni → **endurtenging ókeypis**; engin WebSockets/Durable Objects í v1 (leikstjóra-pacea umferðir, léttur álag: vinnustofa = fá lið).

**Client** (þunn): `web/src/pages/leikur/`:
- `index.astro` — lending: „Búa til leik" (leikstjóri) / „Ganga inn með kóða" (lið).
- `stjorn.astro` (eða client-sýn) — leikstjóra-stjórnborð: kóði, listi liða, umferðar-stýring, stigatafla.
- `lid.astro` — leik-skjár liðs: atburðakort, 5 ákvarðanir + læsa, niðurstöður/skorkort, stigatafla.
- Client-JS í `web/src/lib/leikur-client/` (polling, teikning, sending). Engin vél í client.

**Deploy:** `git push origin b2b-topbar:main` (síða + worker saman). Ein D1-færsla (migration) fyrir töflurnar 4.
⚠ **Útfærslu-nóta (staðfesta í plani):** að Worker sé module-format svo hann geti flutt inn `engine.mjs` + JSON; ef ekki, aðlaga.

## Gagnaflæði (samantekt)

1. Leikstjóri `create` → `leikur_games` (phase=lobby). Lið `join` → `leikur_teams`.
2. Leikstjóri `start`/`reveal` → phase=reveal/decide, current_round=r, atburður úr `scenario.mjs`.
3. Lið `decisions` (læst) → `leikur_decisions`.
4. Leikstjóri `resolve` → Worker: fyrir hvert lið, `resolve.mjs`(öll ákvörðunasaga) → `simulate` → KPI; `scoring.mjs` → stig; skrifa `leikur_results`; phase=resolved.
5. Client pollar `state` → sér niðurstöður + stigatöflu. Leikstjóri `next` → r+1 (eða `ended`).

## Villumeðferð (kerfis-stig)

- Ógildur/útrunninn kóði → 404.
- Innganga eftir að leikur byrjar → hafnað í v1 (aðeins í `lobby`).
- Endursending fyrir læsingu → leyfð (yfirskrifar). Eftir læsingu → hafnað þar til ný umferð.
- **Úrlausn idempotent:** leysa umferð tvisvar má EKKI tvítelja — vörður: leysa aðeins ef phase=decide/reveal og `leikur_results` fyrir (round,team) ekki til.
- **Þvinguð úrlausn** með ólæst lið → nota síðast-sendu ákvarðanir, eða sjálfgefið „Óbreytt/engin" fyrir ósend; merkja hvaða lið læstu ekki.
- Ógilt tákn → aftur á inngöngu.
- Samhliða control-köll → phase-vörður + D1 (les-breyta-skrifa með varúð; einn leikstjóri í reynd).
- Sleða-stig út fyrir [min,max] → klippt í `decisions.mjs` (safnast ekki ótakmarkað).

## Prófstefna

- **Einingapróf (node, `ok(name,cond)`-mynstur eins og roads-prófin):**
  - `decisions.mjs`: afstaða→Δ, uppsöfnun milli umferða, klipping í [min,max], spjald-púls, „engin".
  - `scenario.mjs`: rétt fjöldi atburða (=rounds), hver með viðbragðs-valkostum sem varpast á gilda sleða/sjokk.
  - `resolve.mjs`: þekkt ákvörðunasaga → væntar KPI-áttir (t.d. „slaka vöxtum + örva → hagvöxtur↑, verðbólga↑ tafið"); rétt fylki-lengd (r×4); determinismi; ástand safnast (umferð 3 ákvörðun hefur enn áhrif í umferð 5).
  - `scoring.mjs`: KPI-stig á band-jöðrum (0/100), utan bands rýrnun, kreppu-refsing, samsett vægi, uppsöfnun.
- **Worker-endapunktar:** scriptað enda-í-enda smokkpróf (create→join→decisions→resolve→state) gegn staðbundnum `wrangler dev`/miniflare D1 (eða mock-D1 fyrir handler-rökfræði). Idempotency-próf á resolve.
- **Vafra-staðfesting (controller):** full lykkja með 2 liðum — leikstjóri býr til, tvö lið ganga inn (tveir flipar), spila umferð, leysa, stigatafla uppfærist; endurtenging (refresh liðs-flipa heldur ástandi); engar console-villur.
- Vélar-prófin fjögur **óbreytt** (vélin ósnert).

## Umfang S1 (og hvað er UTAN)

**Inni í S1:** spilanlegur kjarni — forsalur, innganga með kóða, 8-umferða lykkja (reveal→decide→resolve→debrief), 5 ákvarðanir, EIN innbyggð sviðsmynd + EITT innbyggt umboð, þjóns-vald úrlausn, gagnsætt skorkort + uppsöfnuð stigatafla, grunn leikstjóra-stýring, endurtenging um poll.

**UTAN S1 (á vegvísi, eigin lotur):**
- **S3** Orsaka-keðju debrief (endurnýtir `frett-ras.mjs`/`render-ras-box.mjs`).
- **S2** Rík leikstjóra-greining (þver-liða samanburður).
- **S4** Sviðsmynda- & umboðs-ritill (sérsniðnar sjokk-runur/markmið).
- **S5** Leynileg/ólík umboð per lið.
- **S6** Áhorfenda-sýn.

## Global Constraints (gilda um öll verk-skref)

- **Worktree:** allar skrár í `C:\Users\aronh\dev\KARP\mitt-svaedi-wt` (EKKI OneDrive). Breyta Í worktree.
- **Deploy:** `git push origin b2b-topbar:main` (síða + worker).
- **Vél óbreytt:** `src/lib/roads/engine.mjs` ekki breytt (notar fylki-sleða-stuðning sem er til).
- **hermir.astro ósnert.**
- **Nýtt app á `/leikur/`**, endurnýtir `engine.mjs` — ekki afrit af hermi.
- **Isomorphic hrein leik-rökfræði** í `src/lib/leikur/` (node + worker + vafri), einingaprófanleg.
- **Worker:** staðfesta module-format; flytja inn engine + `baseline/links`-JSON búnt; endurnýta HMAC-undirritun fyrir tákn; engin leyndarmál í client.
- **D1:** aðeins viðbótar-migration (4 `leikur_*` töflur); ekki snerta núverandi töflur.
- **Íslenskt UI**, opinbert.
- **Blind ákvörðun** í S1 (engin client-vél/forskoðun).
- **Prófkeyrsla:** `node <skrá>` (ekkert npm test); roads-stíl `ok()`-próf.
- **Sannreyna í vafra** (localhost preview + tveir flipar), EKKI curl|grep.
