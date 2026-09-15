# Bjarki markaðsfulltrúi (Hluti B) — hönnun

**Dagsetning:** 2026-09-15 · **Staða:** samþykkt í hönnunarsamtali 14.9, bíður verkáætlunar
**Undanfari:** `2026-09-14-stjorn-starfsmannavidmot-design.md` (Hluti A — forstofa og spjöld, LIVE 15.9)

## Markmið

Bjarki er eini starfsmaðurinn sem er **þegar að vinna** — myndbandapípan, textarnir og Postiz-dagatalið keyra núna — en ekkert af því sést á `/stjorn/`. Þetta verk gefur honum vélina á bak við andlitið: hann veit hvað við höfum búið til, sér hvað fór út og hvenær, leggur til nýtt efni sem passar við umfjöllun vikunnar, og getur framleitt það.

Aron valdi öll þrjú stigin: **sjá · leggja til · framleiða.**

## Ákvarðanir og rökin að baki

| Ákvörðun | Rök |
|---|---|
| **Efnissafn í D1** (`markadsefni`-tafla), ekki bara Postiz-dagatal | Postiz veit hvað fór út og hvenær; mappan geymir skrárnar; **ekkert veit um hvað hvert verk fjallaði**. Án þess getur Bjarki ekki svarað „höfum við sagt þetta áður?" — og þá er hann bara dagatal |
| Postiz-lykill í worker (`POSTIZ_API_KEY`), secret-gated | Annars sýnir spjaldið ágiskun. Vanti lykilinn skilar endapunkturinn `unconfigured` og ekkert brotnar — sama mynstur og Áskell og Gmail |
| **Fjölmiðlatillögur úr eigin fréttasafni** | Við eigum `news` í D1 með málefnaflokkun og tón. Tillagan verður áþreifanleg: *„umfjöllun um sjávarútveg er þreföld venjuleg vikuna — við eigum samþjöppunartöluna"* — ekki „búðu til efni" |
| **Framleiðslan flyst í GitHub Action** | Hún er í dag háð tímasettri keyrslu í gegnum Claude-lotu. Í Action verður hún óháð því hvort ég sé við. (Aron benti á þetta; ég hafði vanmetið það) |
| **Bjarki birtir ALDREI sjálfur** | Sama regla og hjá Sigrúnu: hann semur, Aron ýtir. Birting er óafturkræf og út á við |
| Andlit hans birtist fyrst þegar vélin er komin | Regla úr hluta A: andlit með tómri skúffu þjálfar mann í að hætta að opna skúffur |

## Gagnalíkan — `markadsefni` (migration 0016)

Ein lína á hvert verk. Fyllist úr tveimur áttum: Postiz-samstillingu (hvað fór út) og framleiðslunni (hvað var búið til, úr hvaða tölu).

| Dálkur | Lýsing |
|---|---|
| `id` | lykill |
| `created` | hvenær verkið varð til |
| `titill` | stutt lýsing verksins |
| `tegund` | `myndband` · `mynd` · `texti` |
| `efnistok` | málefnaflokkur (sami orðaforði og `malefni.json` notar — ekki nýr listi) |
| `tala` | **talan sem verkið byggir á**, sem texti (t.d. „1.708,5 ma.kr.") |
| `heimild` | hvaða gagnalind/slóð talan kom úr |
| `lota` | framleiðslulota (1–5 til þessa) |
| `postiz_id` | auðkenni færslu í Postiz (NULL = ekki komið í röðina) |
| `rasir` | rásir sem það fór á (JSON) |
| `birt` | tímastimpill birtingar (NULL = í röð eða drög) |
| `skra` | skráarnafn myndbands/myndar (upplýsingar, ekki slóð á vefinn) |

⚠ Taflan er **ekki** afrit af Postiz. Postiz er sannleikurinn um *hvað fór út og hvenær*; `markadsefni` bætir við því sem Postiz veit ekki: um hvað verkið fjallaði og hvaða tölu það byggði á.

## Þrjú lög

### 1. Sjá — Postiz-samstilling og efnissafn

`web/src/worker/markadsefni.mjs`:
- `postizFaersla(env)` — les dagatalið og birtingarsöguna úr Postiz-API með `POSTIZ_API_KEY`.
- `samstillaEfni(env)` — parar Postiz-færslur við `markadsefni` á `postiz_id`; færslur sem finnast ekki í D1 skráir hún með því sem Postiz veit (titill, rásir, birt) og `efnistok = null` → þær birtast á spjaldinu sem **„óflokkað"** og Aron (eða Bjarki) getur merkt þær. Ekkert er þagað í hel.
- Fyrning 10 mín í `stjorn_sync k='postiz'`, sama mynstur og bilanalistinn.
- `/api/admin/markadsefni` — GET (dagatal + safn + tölur) · POST `{action:'samstilla'|'merkja'}`.

### 2. Leggja til — fjölmiðlatillögur

`web/src/lib/markadsefni_tillogur.mjs` (hrein, prófuð):
- `heitMalefni(news, {dagar: 7, vidmid: 90})` — hvaða málefni eru óvenju fyrirferðarmikil þessa vikuna miðað við eigin grunnlínu. Skilar hlutfalli, ekki bara fjölda: *þrefalt venjulegt* er frétt, *30 greinar* er það ekki.
- `pararVidVoru(malefni)` — fast kort málefni → KARP-gagnalind sem talar inn í það (kvóti, fjárlög, fasteignaverð, útboð, lobbý, atvinnugreinar). **Ein uppspretta**, ekki afrit af `malefni.json`.
- `tillaga(heitt, safn)` — sleppir málefni sem við höfum þegar birt um síðustu 30 daga (þess vegna er efnissafnið forsenda). Skilar `{malefni, hlutfall, vara, rok}`.

Textinn sjálfur er saminn með Claude-kalli í worker (`claude-sonnet-5`, sama mynstur og Moot), geymdur sem drög í `markadsefni` með `postiz_id = NULL`. **Bíður Arons.**

### 3. Framleiða — myndbönd í GitHub Action

`.github/workflows/markadsefni.yml` — `repository_dispatch` `markadsefni {verk}`:
- `npm ci` + `@napi-rs/canvas` + `h264-mp4-encoder` (sama pípa og í dag).
- ⚠ **Þekktar gildrur úr núverandi pípu, sem eiga að standa í keyrslunni:** hámark **2 myndbönd á hvert node-ferli** (OOM við ~5.400 ramma, og `| tail` felur útgöngukóðann) · `✓` (U+2713) er tófa → nota `✔` (U+2714) · `thN()`/`toLocaleString` námunda → fastar lykiltölur sem strengi.
- Skilar mp4 sem **artifact**, hleður upp í Postiz sem **drög**, skráir línu í `markadsefni` með tölunni og heimildinni.
- Girðingar: aldrei birt sjálfkrafa, aldrei snert `web/`/`migrations/`.

## Spjald Bjarka — hólfin fimm

| Hólf | Innihald |
|---|---|
| Haus | 📣 Bjarki, markaðsfulltrúi · „næsta færsla eftir N daga · M í röðinni" · síðast: nýjasta birting |
| Bíður þín | drög sem hann samdi og bíða samþykkis · **„dagatalið tæmist eftir N daga"** þegar N < 10 · óflokkaðar færslur úr Postiz |
| Í vinnslu | tímasetta dagatalið: hvað fer út hvenær, á hvaða rás; og hvað fór út síðast |
| Tölur | færslur í röðinni · birt í mánuðinum · **hve langt dagatalið nær fram í tímann** (talan sem segir hvort þú sért á eftir) · verk í safninu |
| Má gera | semja efni og myndbönd · setja í röðina sem DRÖG · **aldrei birta sjálfur** · rofi (`rofi_bjarki`) |

## Það sem Aron þarf að leggja til

**Postiz-lykil** (`POSTIZ_API_KEY` sem worker-secret). Án hans virkar allt annað óbreytt og spjaldið segir „Postiz-tenging óstillt" — það lýgur ekki og brotnar ekki.

## Öryggisreglur

- Bjarki **birtir aldrei sjálfur**; hann skrifar aðeins drög. Birting er smellur Arons.
- `POST /api/admin/markadsefni` og framleiðslu-ræsing **krefjast innskráðrar lotu** (X-Admin-Key má lesa) — sama regla og `samthykkja` og Moot-atkvæði.
- Texti úr Postiz (titlar færslna) og úr fréttasafninu er **ótraustur** — gegnum `esc()` við birtingu.
- Efnissafnið geymir **enga persónugreinanlega mælikvarða** um þá sem sáu færslurnar; aðeins okkar eigið efni.

## Utan umfangs

- Árangursmælingar (áhorf, smellir, fylgjendur) — Postiz skilar þeim ekki áreiðanlega og LinkedIn/FB-tölfræði er sér-verkefni.
- Sjálfvirk birting á nokkru stigi.
- Unnur, Elín og Egill — bíða síns hönnunarhrings.
