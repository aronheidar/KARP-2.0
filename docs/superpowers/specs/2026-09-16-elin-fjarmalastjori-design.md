# Elín fjármálastjóri — hönnun

**Dagsetning:** 2026-09-16
**Staða:** samþykkt af Aroni

## Markmið

Elín svarar einni spurningu sem enginn svarar í dag: **er talan sem stjórnborðið sýnir sú sama og
Áskell er að rukka?** Hún er fjórða starfsmannaspjaldið á `/stjorn/`, á eftir Sigrúnu, Hrafni og Bjarka.

## Hvers vegna — gatið sem hún fyllir

MRR er **þegar reiknað** í `web/src/worker/stjornbord.mjs`, en alfarið úr D1:

```js
const PRICE_TIER = { grunnur: 2900, fyrirtaeki: 6900, fyrirtaeki_plus: 12900 };
for (const s of sSubs) mrr += PRICE_SVC[s.service] || 0;
for (const u of sUList) if (u.tier) mrr += PRICE_TIER[u.tier] || 0;
```

Það eru **virk réttindi margfölduð með verði sem stendur í kóðanum**. Áskell kemur hvergi nálægt.
Þar með mælir talan hvað við höfum *veitt*, ekki hvað er *rukkað*.

Þetta tvennt fer í sundur nákvæmlega þegar peningar hætta að berast: kort hafnar endurnýjun, réttindin
í D1 standa samt til `until`, og MRR telur tekjur sem koma aldrei. `greidslur.mjs` veit þetta — þar
stendur orðrétt **„Áskell = sannleikur"**, og heil vara-leið er byggð utan um það að vistaða
`askell_id` í D1 geti rekið sig frá Áskeli (útboð veitt um `/sub/trial` fá aldrei `askell_id`;
hreinsaðir samningar skilja eftir dautt id).

⚠ Umfang misræmisins í dag er **ómælt** — það krefst `ASKELL_PRIVATE_KEY`, sem er worker-leyndarmál.
Fyrsta mæling Elínar er sjálf mælingin. Hönnunin gerir því ekki ráð fyrir neinni tiltekinni tölu.

## Uppspretturnar þrjár — hvað er raunverulega í boði

| Uppspretta | Niðurstaða | Ástæða |
|---|---|---|
| **Áskell** | ✅ notuð | REST-API þegar lesið í `greidslur.mjs`: `/api/v2/subscription-contracts/`, `/api/v2/catalog/products/`, `/api/v2/catalog/prices/`, `/api/customers/` |
| **Teya** | ⛔ utan umfangs | Aðeins greiðslu-upphaf í kóða (HMAC + gateway), á bak við `TEYA_LIVE`-rofa, engin skýrsluleið. Varaleið sem nær hvort eð er aðeins yfir brot |
| **Arion** | ⛔ ekki mögulegt | Aðgangur okkar er **Open Data** (gjaldmiðlar + Stefnis-sjóðir). Eigin fyrirtækjareikningur krefst PSD2-leyfis (afskrifað 4.7.2026) eða Business/B2B-API með **samningi og skilríkjum** frá bankanum. `ARION_*`-lyklarnir fjórir í GitHub opna það ekki |

Heildarmynd af fjárhag **með bankanum** er því pappírsvinna við Arion, ekki forritun. Þessi hönnun nær
yfir **endurteknar tekjur**, sem er meginhluti teknanna meðan vörurnar eru áskriftir.

## Arkitektúr

Fylgir mynstri Bjarka nákvæmlega — hrein eining fyrir framsetningu, worker-eining fyrir I/O.

```
web/src/lib/stjorn/elin.mjs        HREIN: (svar, bidurListi, now) → spjaldgögn
web/src/lib/fjarmal.mjs            HREIN: samstemming Áskell × D1 → misræmislisti + MRR
web/src/worker/fjarmal.mjs         I/O: /api/admin/fjarmal — Áskels-köll, D1-lestur, geymsla
web/src/lib/stjorn/bidur_thin.mjs  BREYTT: fjórða uppsprettan (`fjarmal`)
web/src/pages/stjorn.astro         BREYTT: fjórða andlitið + skúffan
web/src/lib/personur.mjs           BREYTT: ROFAR fær `elin: 'rofi_elin'`
```

### Gagnaflæði

1. `/stjorn/` sækir `/api/admin/fjarmal`.
2. Worker les **samtímis**: Áskels-samninga (`subscription-contracts?page_size=100`, síðuflett til enda),
   Áskels-verðskrá (`catalog/products` + `catalog/prices`), og úr D1 `sub_service` + `users`.
3. `samstemma()` í `lib/fjarmal.mjs` — hrein — skilar misræmislista og tveimur MRR-tölum.
4. Niðurstaðan geymd í `stjorn_sync` með fyrningu (`_FJ_FYRNING = 900`, 15 mín) eins og Postiz-lesturinn.
5. `elinGogn()` breytir svarinu í spjaldgögn; `bidurThin()` dregur raðirnar á forstofuna.

⚠ **Pörun samnings við notanda** er á `customer_reference` (kt), sama og `greidslur.mjs` notar
(`String(c.customer_reference).replace(/\D/g,'') === kt`). `askell_id` í `sub_service` er flýtileið sem
má nota þegar hún stemmir en ALDREI treysta ein — hún er nákvæmlega það sem rekur sig.

## Samstemmingarreglurnar

Fyrir hvern virkan Áskels-samning og hverja virka heimild í D1:

| Ástand | Merking | Alvarleiki |
|---|---|---|
| Samningur rukkar, engin heimild í D1 | **Viðskiptavinur borgar fyrir ekkert** | hátt — fer í „bíður þín" |
| Heimild í D1, enginn virkur samningur | **Við gefum vöruna** | hátt — fer í „bíður þín" |
| Samningur í fríprófun, heimild til | **Ekki misræmi og ekki tekjur** — sérflokkur, sjá neðar | lágt — eigin tala |
| Bæði til, verð stemma ekki | Verðskrá rekur sig | miðlungs — sést á spjaldinu |
| Bæði til og stemma | Í lagi | — |

⚠ **Hvað telst virkur samningur** er ÞEGAR skilgreint í `greidslur.mjs` og Elín VERÐUR að nota sömu
skilgreiningu, annars fáum við tvær talningar á sama hlut sem stangast á:

```js
const virk = (st) => /active|trial|current/i.test(String(st || '')) && !/cancel|fail|expire|inactive/i.test(String(st || ''));
```

⚠⚠ **Fríprófanir eru þriðji flokkur, hvorki misræmi né tekjur.** Sub2-leiðin (`granted()` í
`greidslur.mjs`) stofnar RAUNVERULEGAN samning í Áskeli í `trial`-stöðu og vistar `askell_id` — þær eru
því ekki „gefins". En Áskell rukkar 0 meðan prófunin stendur, á meðan `PRICE_TIER` telur þær á fullu
verði. **Fríprófanir eru þar með stór hluti bilsins milli D1-MRR og Áskels-MRR, og það bil er réttmætt.**
Þær fá eigin tölu: „x í fríprófun, verða y kr/mán haldi þeir áfram", og teljast hvergi með rukkuðum
tekjum.

⚠ **Undanþágur sem eru EKKI misræmi** og mega aldrei rata í listann, annars verður hann hávaði sem
enginn les: `users.free_access=1`, `users.is_admin=1`, `users.nemandi=1`, og heimildir úr GÖMLU
`/sub/trial`-leiðinni sem stofnaði aldrei Áskels-samning (`greidslur.mjs` kallar það `no-billing`).
Þetta er vísvitandi gjafaaðgangur, ekki leki. ⚠ Ruglaðu þeirri leið EKKI saman við sub2-fríprófunina að
ofan — sú fyrri hefur engan samning, sú síðari hefur samning í `trial`-stöðu.

## Spjaldið

**Efsta talan:** MRR úr Áskeli. Stemmi hún ekki við D1-töluna standa báðar hlið við hlið með mismuninum.

⚠ Náist ekki í Áskel stendur **`óvíst`**, aldrei D1-talan ein og aldrei grænt. Þetta er beinn lærdómur
af `hrafn.mjs`, þar sem þrjú ástönd (ólíkt leyndarmál, netvilla, admin-hlið) sýndu öll „main grænt".

**`tolur` (fjórar flísar):**

| n | l | s |
|---|---|---|
| MRR úr Áskeli, eða `óvíst` | `kr/mán rukkað` | mismunur við D1 þegar hann er ekki núll |
| fjöldi misræma | `misræmi` | `x borga fyrir ekkert · y fá gefins` |
| fjöldi í fríprófun | `í fríprófun` | `verða y kr/mán haldi þeir áfram` |
| fjöldi sem endurnýjast ≤30 d | `endurnýjast` | `z innan viku` |

⚠ Fríprófanir fá eigin flís af því þær eru **stærsta réttmæta skýringin á bilinu** milli D1-MRR og
Áskels-MRR. Án hennar lítur bilið út eins og villa og maður fer að leita að bilun sem er ekki til.

**`vinnsla` (skúffan):** misræmislistinn, elsta fyrst, hver lína með kt-grímu, vöru, hvorum megin
misræmið liggur og hvað það kostar á mánuði. Neðst: uppsagnir og útrunnið síðustu 90 daga.

**`bidur` (fjórar tegundir raða, smíðaðar í `bidurThin`, ekki hér):**

- `borgar_fyrir_ekkert` — samningur rukkar án heimildar
- `gefins` — heimild án samnings
- `rennur_ut` — áskrift rennur út innan 7 daga
- `uppsogn` — uppsögn síðan síðast (`stjorn_sync` geymir síðast séð)

⚠ Raðirnar VERÐA að smíðast í `bidurThin`, ekki inni í `elin.mjs`. Bjarki féll á þessu: raðirnar hans
lágu utan `bidurThin` og sáust hvorki á forstofunni né í tölunni á andlitinu, með sjö græn próf.

**`heimildir` (hvað hún má, sýnt notanda):**

```
les Áskel og D1 og ber saman
sækir ferskt þegar þú biður um það
réttir Hrafni misræmi sem krefst kóðabreytingar — bíður þín
hreyfir aldrei peninga
```

## Aðgerðir og girðingar

| Aðgerð | Heimild | Bíður samþykkis |
|---|---|---|
| `GET` yfirlit | lota EÐA `X-Admin-Key` | nei |
| `saekja` (ferskt úr Áskeli) | **lota** | nei — þú ýtir sjálfur |
| `hrafn` (rétta misræmi áfram) | **lota** | **já** — AI-saminn texti |

⚠⚠ **Elín hreyfir aldrei peninga.** Engar greiðslur, engar endurgreiðslur, engar millifærslur, og hún
segir ekki upp áskriftum þótt `greidslur.mjs` kunni það — sú aðgerð tilheyrir notandanum sjálfum.
Þetta er negld með prófi sem fellur ef `POST`-leiðin tekur við nokkurri aðgerð utan hvítalistans.

⚠ Hún snertir aldrei kóða. Misræmi sem krefst lagfæringar fer til Hrafns um `_ghDispatch`, sem heldur
girðingunni að aðeins hann skrifi í `web/` og `skriptur/`.

⚠ Rofi `rofi_elin` í `personur.mjs` `ROFAR`, lesinn eins og `rofi_bjarki`. Hann stöðvar **sjálfvirka
sókn og dispatch**, aldrei lesturinn sjálfan — spjald sem slokknar alveg lítur út eins og bilun.

## Villumeðferð

- Áskell niðri → `villa: 'askell'`, síðasta þekkta mynd stendur með tímastimpli, MRR verður `óvíst`.
  Sama mynstur og `saekjaPostiz`.
- `ASKELL_PRIVATE_KEY` vantar → `{ ok: false, error: 'unconfigured' }`, ekkert brotnar, spjaldið segir
  „óstillt". Negld með prófi.
- D1-lestur brestur → `Promise.allSettled`, hlutaniðurstaða merkt, aldrei þögult núll.
- Áskels-svar sem er ekki fylki → meðhöndlað sem villa, ekki sem tómur listi. Tómur listi og bilað svar
  líta eins út og þá sýnist „engin misræmi" þegar ekkert var mælt.

## Prófanir

Eining (`web/src/lib/fjarmal.test.mjs`):

- samningur án heimildar → `borgar_fyrir_ekkert`
- heimild án samnings → `gefins`
- `free_access`, `is_admin`, `nemandi`, gamla `/sub/trial` án samnings → **ekki** misræmi (fjögur aðskilin próf)
- **sub2-fríprófun (samningur í `trial`-stöðu + heimild) → hvorki misræmi né rukkaðar tekjur**, telst í
  eigin flokk. ⚠ Þetta próf ver stærstu villuna sem hönnunin gat framleitt: án þess teldust allar
  fríprófanir sem „borgar fyrir ekkert" og listinn fylltist af fólki sem er nákvæmlega í réttri stöðu
- `virk()`-skilgreiningin er sú SAMA og í `greidslur.mjs` — próf sem ber strengina saman
  (`active`/`trial`/`current` já, `cancelled`/`failed`/`expired`/`inactive` nei), svo talningarnar tvær
  geti ekki rekið sig í sundur
- verð úr Áskeli ólíkt `PRICE_TIER` → verðrek merkt, ekki misræmi
- MRR úr Áskeli reiknað af raunverðum, ekki föstu töflunni; fríprófanir leggja 0 til
- tómur Áskels-listi vs bilað svar → ólíkar niðurstöður

Spjald (`web/src/lib/stjorn/elin.test.mjs`):

- `svar.error` **hreiðrað eins og raunsvarið** — Bjarki féll á flötum prófgögnum sem földu að
  `bjarkiGogn` las rangt hreiðurdýpi, og „óstillt" hefði aldrei birst
- Áskell ónáanlegur → MRR `óvíst`, aldrei D1-talan ein
- raðir koma úr `bidurFyrir(bidurListi, 'elin')`, ekki smíðaðar í einingunni

Worker (`web/src/worker/fjarmal.test.mjs`):

- `X-Admin-Key` má lesa, má ekki `saekja` né `hrafn`
- `rofi_elin` stöðvar dispatch en ekki lestur
- síðuflett Áskels-svar (>100 samningar) nær þeim öllum

CI: `node skriptur/ci_worker_bindings.mjs` **úr rót** (ekki úr `web/` — leiðin í fyrri áætlun er röng).

## Utan umfangs

- Teya-skýrslur og Arion-bankareikningur (sjá töfluna að ofan)
- Raunverulegar greiðslufærslur, mislukkaðar greiðslur og endurgreiðslur — engin greiðslutafla er til
  í D1 og óstaðfest hvort Áskell birti þær í API. Sérstakt verk ef þess þarf
- Spár og áætlanir. Elín mælir það sem er, hún spáir ekki
- Unnur, Hildur og Egill
