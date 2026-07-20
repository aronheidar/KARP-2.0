# Fréttavaktir (fréttamanna- og notenda-vaktir) — hönnun

**Dagsetning:** 2026-07-20
**Staða:** Samþykkt hönnun, bíður útfærslu-plans.
**Höfundur:** Aron + Claude (brainstorming)

## Markmið

Gera notendum karp.is (fréttamönnum og áskrifendum) kleift að **setja upp vaktir á Karp fréttir** og fá **tölvupóst þegar nýtt mál kviknar** sem passar. Þetta breytir fréttavélinni úr „síðu sem maður heimsækir" í „veitu sem lætur vita" — sem er lykilnotagildi fyrir fréttamenn (vera fyrstir) og notendur (fylgjast með sínu).

**Árangursviðmið:** innskráður notandi getur (1) valið fréttaflokka og/eða leitarorð/einingar að vakta, (2) valið tíðni tölvupósts, og (3) fengið réttan, ó-endurtekinn tölvupóst með nýjum málum + hlekk á frumgögn.

## Ákvarðanir (úr brainstorming)

| # | Ákvörðun | Val |
|---|---|---|
| Q1 | Skráningarleið | **Innskráð** (karp.is-aðgangur) — fréttamanna- og notenda-vaktir renna saman í eitt kerfi. Ekkert opið form/tvöföld staðfesting. |
| Q2 | Á hverju er vaktað | **Bæði** — (a) efnisflokkar (~37 fréttategundir) og (b) leitarorð/einingar (endurnýtir `leitvakt`/`follows`/`ktwatch`), samsett. |
| Q3 | Afhending | **Tölvupóstur með tíðnivali**: `strax` / `daglegt` / `vikulegt`. |
| Arkitektúr | Hvar mátun+sending | **Worker `scheduled()` cron** (3-tíma greinin) — endurnýtir D1, `sendGmail` og fréttavélar-feed í einu keyrsluumhverfi. |

**Utan v1 (síðari áfangar):** í-appi „Þínar vaktir"-straumur; RSS-hlekkur per vakt; webhooks; notandi-skilgreindir þröskuldar (flokkarnir bera nú þegar innbyggða fréttnæmis-þröskulda).

## Núverandi innviðir sem eru endurnýttir

- **Tölvupóstur:** `sendGmail(env, {to, subject, html, text, replyTo})` (`web/worker.js:2946`), Gmail REST, mjúk-fellur ef `GMAIL_*` secrets vantar.
- **D1 `user_prefs (user_id, k, v, updated)`** (`web/migrations/0003_userdata.sql`) — allar vaktir eru JSON-blob per lykil. `_prefGet`/`_prefSet` (`worker.js:3010`).
- **`/api/u/*` `userDataHandler`** (`worker.js:3031`) — POST krefst innskráningar (`uid` úr `readSession`); `_U_BLOBS` listinn skilgreinir hvaða lyklar eru geymdir sem blob.
- **Fréttavélar-feed:** `_dget(env, '/gogn/frettavel.json')` (`worker.js:3226`) um `ASSETS`. Atriðaform: `{id, date, type, title, text, url, ai, spark?, samhengi?}`.
- **Flokka-skilgreining:** `CAT` + `SECTIONS` í `web/src/lib/frettavel.mjs` — ~37 tegundir hópaðar í 5 deildir (Viðskipti/Stjórnmál/Efnahagur/Dómsmál/Samfélag).
- **Leitarorða-mátun:** `_newsHits(items, word, limit)` (`worker.js:3283`) — hlutstrengs-samsvörun orðs við `title + ' ' + text`.
- **`news`-tafla** (RSS fjölmiðlafréttir, `url,title,source,ts,body,sent`; `worker.js` `newsSince` `:3407`) — sótt af cron á 3 klst. fresti (`newsIngest` `:3391`).
- **Cron:** `web/wrangler.toml` `crons = ["10 8 * * 1", "0 */3 * * *"]`; `scheduled()` (`worker.js:3745`) greinir eftir `event.cron`.

## Hönnun

### 1. Geymsla

Ný `user_prefs`-lykill **`frettavakt`** (JSON-blob per notanda):

```json
{
  "on": true,
  "flokkar": ["gjaldthrot", "utbod", "fonix", "styrkur"],
  "cadence": "daglegt",
  "lastSent": 1721470000,
  "seenIds": ["gjaldthrot-...", "https://mbl.is/...", "..."]
}
```

- `flokkar` = listi fréttategunda (gildar tegundir = lyklar í `CAT`).
- `cadence` ∈ `strax | daglegt | vikulegt`. Sjálfgefið **`daglegt`** við fyrstu uppsetningu.
- `lastSent` = epoch síðustu sendingar (stýrir tíðni).
- `seenIds` = hringur síðustu ~300 sendra atriða-id/url (dedup, óháð dagsetningar-grófleika).

Leitarorð/einingar eru **ekki afrituð** hingað — mátarinn les núverandi `leitvakt.ord`, `follows` og `ktwatch` beint. `frettavakt` bætir aðeins við flokka-vöktun + afhendingar-stillingum.

Skrifað um nýjan **sér-endapunkt** `/api/u/frettavakt` (EKKI generíska `_U_BLOBS`-mynstrið, því það geymir allt body óbreytt og myndi leyfa framenda að yfirskrifa dedup-stöðuna). Handler-inn (eftir mynstri `/follows`, `/ktwatch` í `userDataHandler`):
- **GET:** skilar `_prefGet(env, uid, 'frettavakt', {on:false, flokkar:[], cadence:'daglegt'})`.
- **POST:** les núverandi blob, **sameinar aðeins** `on`, `flokkar` (síað: aðeins gildir `CAT`-lyklar), og `cadence` (síað: aðeins `strax|daglegt|vikulegt`) úr body — **heldur server-stjórnuðu `seenIds`/`lastSent` óbreyttum** — og `_prefSet`. Þannig getur framendinn ekki spillt dedup-stöðunni.

### 2. Mátari — hrein, prófanleg eining

`frettavaktMatch(feedItems, newsRows, ctx)` þar sem `ctx = { flokkar, ord, follows, ktwatch, seenIds }`:

- **Flokka-samsvörun** (aðeins fréttavélar-atriði): `feedItems.filter(it => flokkar.includes(it.type))`.
- **Leitarorð/eining** (bæði fréttavélar-atriði OG `newsRows`): fyrir hvert orð í `ord`/`follows`/nafna-uppfletting `ktwatch` → `_newsHits`. (Einingar eru nafna-hlutstrengur eins og digest gerir í dag; kt→nafn er utan v1 nema það sé þegar til.)
- **Dedup:** sameina, henda atriðum þar sem `id` (eða `url` fyrir news) er í `seenIds`. Skila fylki nýrra atriða (nýjust fyrst), þak `MAX_PER_EMAIL = 30`.
- **Hrein fall:** engin D1/net-köll inni — tekur gögn inn, skilar lista. Prófanleg með fixtures.

### 3. Cron-samhæfing (`scheduled()`, 3-tíma greinin, eftir `newsIngest`)

Fyrir hverja keyrslu:
1. Sækja fréttavélar-feed einu sinni (`_dget`) + nýjar `news`-raðir (`newsSince(env, 2, 500)`).
2. `SELECT user_id, v FROM user_prefs WHERE k='frettavakt' AND v LIKE '%"on":true%'`.
3. Fyrir hvern notanda:
   - **Tíðni-hlið:** `strax` → alltaf; `daglegt` → aðeins ef `now - lastSent >= 20h`; `vikulegt` → aðeins ef `now - lastSent >= 6.5d`.
   - Ef hliðið opnast: sækja `leitvakt/follows/ktwatch` fyrir notandann, kalla `frettavaktMatch`.
   - Ef **engin ný mál** → sleppa (ekki senda tóman póst, ekki uppfæra `lastSent`).
   - Annars: byggja HTML, `sendGmail`, bæta id-um í `seenIds` (klippa í 300), setja `lastSent = now`, `_prefSet`.
   - Villa hjá einum notanda er gripin → fellir ekki hina.

*(„vikulegt" er meðhöndlað hér, aðskilið frá gamla mánudags-digest-inum — hreinni einangrun. Sameining við digest er möguleg síðar.)*

### 4. Tölvupóstur

Endurnýtir stíl `digestBuild` (`worker.js:3288`):
- **Efni:** `🔔 Fréttavakt: N ný mál` (eða `1 nýtt mál`).
- **Meginmál:** atriði raðað eftir flokki (deildar-hausar úr `SECTIONS`), hvert með titli (hlekkur á `https://karp.is/frettavel/<id>/`), stuttum texta, flokka-merki og heimild.
- **Fótur:** hlekkur „Stilla vaktir" (Mitt svæði) + „Slökkva á fréttavakt".
- Ef `> MAX_PER_EMAIL` mál: sýna 30 efstu + „og N til viðbótar → skoða á karp.is/frettavel/".

### 5. Viðmót — „Fréttavaktir"-kafli í Mitt svæði

- Nýr kafli á Mitt svæði (`web/src/pages/mitt-svaedi.astro`) — við hlið núverandi vakta.
- **Flokka-val:** gátreitir fyrir ~37 flokkana, **hópaðir eftir 5 deildum** (`SECTIONS` úr `frettavel.mjs`, importað á byggingartíma), með „velja alla deild"-rofa + einstökum. Hver reitur sýnir emoji + heiti úr `CAT`.
- **Tíðnival:** `strax / daglegt / vikulegt` (radio).
- **Af/á-rofi** fyrir alla fréttavaktina.
- Núverandi leitarorða-/einingavaktir (`leitvakt`/`follows`/`ktwatch`) sýndar/tengdar á sama stað svo notandinn sjái allt sitt vaktakerfi.
- Vistar um `POST /api/u/frettavakt` (`{on, flokkar, cadence}`).
- **Óinnskráðir:** kaflinn sýnir „Skráðu þig inn til að setja upp vaktir" (POST krefst `uid` server-hlið hvort eð er).

### 6. Villumeðferð + spam-varnir

- `sendGmail` óstillt → cron sleppir hljóðlega (engin secrets → engin sending), skráir ekki `lastSent` (svo það sendist þegar stillt er).
- **Safnað per keyrsla:** eitt tölvupóst per notanda per keyrsla með ÖLLUM nýjum málum — „öll gjaldþrot" verður eitt yfirlit, ekki 20 póstar.
- `seenIds`-hringur kemur í veg fyrir endurtekningar þótt fréttavélin sé endur-mynduð eða atriði færist í feed.
- Þak `MAX_PER_EMAIL = 30`.
- Skali: notendafjöldi er lítill; feed sótt einu sinni per keyrsla; ein D1-fyrirspurn + per-notanda blob-lestur. Nægjanlegt á núverandi skala; endurskoða ef notendur > ~nokkur þúsund.

## Einingar (aðgreining)

| Eining | Hvað | Háð |
|---|---|---|
| `frettavaktMatch(feed, news, ctx)` | Hrein mátun → listi nýrra atriða | ekkert (fixtures-prófanlegt) |
| `frettavaktEmail(name, matches)` | Byggir HTML | `SECTIONS`/`CAT` (eða afrit) |
| `frettavaktCron(env)` | Sækir gögn, ítrar notendur, sendir, uppfærir stöðu | D1, `_dget`, `sendGmail`, mátari, email |
| `/api/u/frettavakt` | Les/skrifar blob (server-varið `seenIds/lastSent`) | `_prefGet/_prefSet` |
| Mitt svæði-kafli | Viðmót → `/api/u/frettavakt` | `CAT`/`SECTIONS` |

## Gagnaflæði

```
CI (build_frettavel, ~daglega) → gogn/frettavel.json  ──┐
Worker cron (newsIngest, 3 klst) → news-tafla  ─────────┤
                                                        ▼
             Worker cron (frettavaktCron, 3 klst): _dget(feed) + newsSince
                                                        ▼
   fyrir hvern notanda m/ frettavakt.on: tíðni-hlið → frettavaktMatch(feed,news,ctx)
                                                        ▼
              ný mál? → frettavaktEmail → sendGmail → uppfæra seenIds+lastSent
```

## Prófun

- **Eining-próf** á `frettavaktMatch` (node:test): flokka-samsvörun, leitarorð, dedup gegn `seenIds`, `MAX_PER_EMAIL`-þak, tómt-tilfelli.
- **Handvirk samþætting:** setja upp vakt sem prófnotandi, keyra cron handvirkt (eða bíða), staðfesta einn réttan póst + `lastSent`/`seenIds` uppfærslu + engin endurtekning í næstu keyrslu.

## Áhætta / opnar spurningar

- **Tíðni „strax" = ≤3 klst** (cron-takt), ekki augnablik. Ásættanlegt; skjalfest í viðmóti („allt að 3 klst").
- **Einingar-mátun er nafna-hlutstrengur** (ekki kt-nákvæm) fyrir fréttavélar-/RSS-texta — sama og digest í dag. Nákvæm kt-mátun væri síðari úrbót.
- **„vikulegt" aðskilið frá digest** í v1 — notandi með bæði gæti fengið tvo vikulega pósta. Ásættanlegt; sameining síðar.
