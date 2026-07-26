# Mat á áhrifum á persónuvernd — VIÐBÓT 1
## Áreiðanleikavaktin (KYC-vöktun viðskiptavina) og Firma-account (sæta-sameign) á Karp (karp.is)

| | |
|---|---|
| **Grunnskjal** | *Mat á áhrifum á persónuvernd (DPIA) — Fyrirtækjaskýrslur, endanlegir eigendur, stjórnendatengsl og áreiðanleikakönnun (KYC)*, útg. 1.0, dags. 11.07.2026 (hér „DPIA v1.0") |
| **Þessi viðbót** | Viðbót 1, útg. 1.0 |
| **Vara / vinnsla** | (A) **Áreiðanleikavaktin** — samfelld vöktun á viðskiptavina-listum sem tilkynningarskyldar stofur leggja sjálfar inn. (B) **Firma-account** — deiling account-gagna (m.a. KYC-lista og audit) milli team-meðlima innan sama reiknings. |
| **Hlutverk Karp** | **Nýtt:** Karp verður **vinnsluaðili** (28. gr. GDPR) fyrir viðskiptavina-lista sem stofa leggur inn — **stofan er ábyrgðaraðili**. Karp helst ábyrgðaraðili grunngagnanna úr opinberum skrám (sbr. DPIA v1.0) og notendareikninga. |
| **Ábyrgðaraðili (fyrirtækið)** | Steinsson Greykdal ehf., kt. 490522-0500, Brunnstígur 2, 260 Reykjanesbæ |
| **Tengiliður persónuverndar** | Aron Heiðar Steinsson — [personuvernd@karp.is](mailto:personuvernd@karp.is) |
| **Dagsetning** | 26. júlí 2026 |
| **Endurskoðun eigi síðar en** | Fyrir almenna markaðssetningu (GA) til raunverulegra stofa, og eigi síðar en 26.07.2027 eða strax við verulega breytingu |
| **Réttargrundvöllur matsins** | 35. gr. reglugerðar (ESB) 2016/679 (GDPR), sbr. lög nr. 90/2018 |

> **Fyrirvari.** Þetta er **viðbót** við DPIA v1.0 og les­t með því; kaflar, mótvægisaðgerðir og áhætturöðun grunnskjalsins halda gildi nema annað sé tekið fram. Skjalið er innra mat ábyrgðaraðila og kemur ekki í stað lögfræðiráðgjafar. Höfundur er ekki lögfræðingur; **skjalið er drög til yfirferðar persónuverndarlögfræðings** ([personuvernd@karp.is](mailto:personuvernd@karp.is). Sjá 5. kafla um skilyrði sem uppfylla þarf **áður en vinnslan er tekin í fulla notkun af raunverulegum stofum**.

> **Staða við ritun.** Kóði beggja aðgerða er þegar til í framleiðsluútgáfu (`98612e7` KYC, `407f237` account) en varan er **ekki komin í raun-notkun stofa**: (a) fjar-D1 færslur `0008`/`0010` bíða keyrslu, (b) vinnslusamningur (DPA) er ekki genginn frá, og (c) samþykkisþrep team-meðlima (invite/accept) er eftir. Þessi viðbót skilgreinir þau atriði sem forsendur GA.

---

## 0. Samantekt og niðurstaða

DPIA v1.0 náði yfir vinnslu Karp á **opinberum** fyrirtækjaskrárgögnum þar sem Karp er sjálft **ábyrgðaraðili** á grundvelli lögmætra hagsmuna. Þessi viðbót nær yfir tvær nýjar vinnslur sem grunnskjalið tók ekki til og sem breyta hlutverki Karp í grundvallaratriðum:

1. **Áreiðanleikavaktin (Vinnsla A).** Tilkynningarskyldar stofur (lögmenn, endurskoðendur/bókarar) leggja sjálfar inn lista yfir **eigin viðskiptavini** (kennitölur) til samfelldrar compliance-vöktunar. Karp vinnur þennan lista **fyrir hönd stofunnar** og verður þar með **vinnsluaðili** í skilningi 28. gr. GDPR; stofan er ábyrgðaraðili. Tvennt gerir þessa vinnslu viðkvæmari en v1.0: (i) listinn **afhjúpar viðskiptasambönd stofunnar** — hverjir eru viðskiptavinir hennar — sem er trúnaðar- og samkeppnisviðkvæmt (og getur fyrir lögmenn snert þagnarskyldu), og (ii) vinnslan **festir áhættumat og PEP-flöggun á tilgreinda einstaklinga** (eigendur/stjórn viðskiptavinanna) og fylgist með þeim yfir tíma — nær en stakar uppflettingar v1.0.

2. **Firma-account (Vinnsla B).** Team-meðlimir innan sama reiknings **deila** account-gögnum, þ.m.t. KYC-vöktunarlistanum og audit-slóð hans. Í v1 er meðlimur **sjálfkrafa tengdur** reikningi eiganda út frá netfangi á team-lista **án staðfestingar/​samþykkisþreps (invite/accept)** — og fær við það **les- og skrifaðgang að KYC-audit**. Samþykkisþrepið er skilgreint fast-follow.

**Þrjár höfuðáhættur** eru metnar sérstaklega: **(R8) afhjúpun viðskiptasambanda** stofu, **(R9) PEP-/áhættuflöggun einstaklinga** í varanlegri compliance-möppu, og **(R10) samþykkis-/heimildar-gat sjálfvirkrar team-tengingar**.

**Meginmótvægi:** hörð **per-account einangrun** (allar les- og skrifaðgerðir eru bundnar við `owner_id`/`accountId`; hnattræn tafla geymir aðeins opinbert-afleidd merki, engin viðskiptasambönd), **audit-gerandi = raun-notandi** (full rekjanleiki aðgerða), **engin geymsla persónuskilríkja/ID-skjala** (CDD-skjöl haldast hjá stofunni), **varðveisla samræmd 5-ára AML-skyldu** stofunnar (lög nr. 140/2018) með append-only heilleika, og **vinnslusamningur (DPA)** við hverja stofu sem bannar eigin-notkun Karp á listanum.

**Niðurstaða.** Vinnslan telst heimil — fyrir stofuna á grundvelli **lagaskyldu** (áreiðanleikakönnunar- og eftirlitsskyldu peningaþvættislaga) og fyrir Karp sem **vinnsluaðila** samkvæmt skjalfestum fyrirmælum (28. gr.). Að innleiddum mótvægisaðgerðum 4. kafla er eftirstæð áhætta metin **LÁG–MIÐLUNGS**. **Eitt atriði stendur eftir yfir „lágu": samþykkis-gatið (R10) er MIÐLUNGS þar til invite/accept-þrepið er komið.** Því er raun-notkun stofa bundin skilyrðum 5. kafla (undirritaður DPA, samþykkisþrep, keyrðar færslur, uppfærð vinnsluskrá/yfirlýsing, lögfræðiyfirferð). Umfangs­aukning í átt að vöktun einstaklinga umfram tilgreinda viðskiptavini stofa krefðist nýs mats.

---

## 1. Kerfisbundin lýsing á nýju vinnslunni

### 1.1 Tengsl við DPIA v1.0 — hvað er nýtt
DPIA v1.0 stendur óbreytt fyrir grunngögnin (opinberar skrár, eftirspurnardrifið, Karp = ábyrgðaraðili, lögmætir hagsmunir). **Nýtt í þessari viðbót:**
- Stofa leggur inn **sín eigin** gögn (viðskiptavina-kennitölur) → Karp verður **vinnsluaðili**.
- Gögnin eru **varðveitt samfellt** (compliance-mappa + append-only audit), ekki bara flett upp og fleygt — sérstök varðveisla umfram v1.0, rökstudd með AML-skyldu.
- **Samfelld, kerfisbundin vöktun** einstaklinga-merkja (cron-endurskimun) í stað stakra uppflettinga.
- **Deiling** sömu gagna milli fleiri en eins notanda innan account.

### 1.2 Grundvallar-hlutverkabreyting: Karp sem vinnsluaðili (28. gr.)
| Þáttur vinnslunnar | Ábyrgðaraðili | Hlutverk Karp | Lagagrundvöllur |
|---|---|---|---|
| Viðskiptavina-listi sem stofa leggur inn (kt sem vaktað er, valið á viðskiptavinum) | **Stofan** (lögmaður/bókari) | **Vinnsluaðili** (28. gr.) | Lagaskylda stofunnar, 6(1)(c) + lög nr. 140/2018 |
| Áhættumat, merki, audit-slóð, PDF-mappa | **Stofan** | **Vinnsluaðili** | Sama |
| Auðgun úr opinberum skrám (UBO/stjórn/PEP/refsilistar/Lögbirting) sem Karp viðheldur sjálfstætt | **Karp** | Ábyrgðaraðili (sbr. DPIA v1.0) | Lögmætir hagsmunir, 6(1)(f) |
| Notendareikningar og team-tengsl (Firma-account) | **Karp** | Ábyrgðaraðili | Samningur/​lögmætir hagsmunir, 6(1)(b)/(f) |

> **Spurning til lögfræðings:** hvort auðgunarlagið (opinber gögn sem Karp reiknar sjálft) geri Karp að **sam-ábyrgðaraðila** (26. gr.) fyrir tiltekin úttök frekar en hreinum vinnsluaðila. Drög þessi ganga út frá **vinnsluaðila-hlutverki fyrir Vinnslu A/B**, með sjálfstæðu ábyrgðaraðila-hlutverki fyrir undirliggjandi opinbera grunninn. Þetta ber að staðfesta.

### 1.3 Vinnsla A — Áreiðanleikavaktin (viðskiptavina-listar)

**Tilgangur (stofunnar).** Að uppfylla **áframhaldandi eftirlitsskyldu** tilkynningarskylds aðila með viðskiptasamböndum skv. lögum nr. 140/2018 — þ.e. reglubundna áreiðanleikakönnun (CDD) og vöktun breytinga sem geta gefið tilefni til endurmats á áhættu.

**Hvað er unnið.** Fyrir hvert vaktað kt heldur kerfið **compliance-möppu** sem inniheldur:
- upphaflegt áhættumat (Lág / Venjuleg / Há) leitt af opinberum merkjum,
- vöktun **8 merkja**: endanlegir eigendur (UBO), stjórn, refsi-/þvingunarlistar, PEP, staða (t.d. gjaldþrot), Lögbirtingablaðið, skattkröfur (stubbur), fjölmiðlaumfjöllun,
- **tímamerkt, append-only audit-slóð** aðgerða notanda (skoðun, kvittun, athugasemd, endurskimun),
- **PDF-útflutning** möppunnar til skjölunar hjá stofunni.

**Gagnalíkan og einangrun (staðfest í `web/migrations/0008_kyc.sql`).**

| Tafla | Umfang | Inniheldur | Athugasemd persónuverndar |
|---|---|---|---|
| `kyc_watch` | **Per-eigandi** (`owner_id`, `UNIQUE(owner_id,kt)`) | kt, nafn, áhættustig, ástæða, staða, tímar | **Hér liggur viðskiptasambandið** — hver vaktar hvern. Stranglega einangrað. |
| `kyc_audit` | **Per-eigandi** | ts, **actor**, aðgerð, samantekt | Append-only; `actor` = raun-notandi → rekjanleiki. |
| `kyc_ack` | **Per-eigandi** | event_id, staða, athugasemd, **by**, at | Kvittun geymir hver kvittaði. |
| `kyc_snapshot` | **Hnattrænt per kt** | merki, ástands-hash/JSON | Aðeins **opinbert-afleidd** merki. Ekkert viðskiptasamband. |
| `kyc_event` | **Hnattrænt per kt** | merki, tegund, alvarleiki | Sama — engin tenging við tiltekna stofu. |

Þessi skipting er lykil-mótvægi: **trúnaðar­gögnin (hver vaktar hvern) og compliance-aðgerðirnar eru bundnar `owner_id`; aðeins opinbert-afleitt merkja-skyndiminni er hnattrænt** og opinberar engan viðskiptavina-lista.

**Vinnsla og tíðni.** Bakendi `kycScreenKt` les tengslagraf (`felog`/`eign`/`hlutverk`) og bökuð opinber merkja-gögn (refsilistar/PEP/Lögbirting/fjölmiðla-tónn); `kycDiffCron` keyrir daglega og `kycCriticalCron` á 3 klst. fresti (aðeins refsilistar + Lögbirting). Aðgangur er bundinn `hasTier(3)` (Fyrirtæki+) eða admin.

**Það sem EKKI er unnið:** engin persónuskilríki, vegabréf, ökuskírteini né önnur CDD-auðkennisskjöl eru hlaðin upp eða geymd hjá Karp — auðkennissönnun viðskiptavina helst hjá stofunni. Engar sérstakar (viðkvæmar) persónuupplýsingar skv. 9. gr. eru unnar sem slíkar.

### 1.4 Vinnsla B — Firma-account (deiling innan account)

**Vélræn útfærsla (server-megin).** Einn dálkur `users.parent_account_id` (færsla `0010`) og hrein `web/src/lib/account.mjs`: `accountId(u) = parent_account_id || id`. Deild gögn eru lykluð `accountId` í stað staks `uid`.

**Deilt (account-scoped):** þrep/áskriftir/skýrslu-heimildir/kvóti, og **KYC** (`kyc_watch`/`kyc_audit`/`kyc_ack`: `owner_id` → `accountId`), ktwatch, follows. **`actor`/`by` helst raun-notandinn** þótt umfangið sé account.
**Per-notandi (óbreytt, EKKI deilt):** vakt-/digest-tilkynningastillingar, persónuleg atkvæði, `auth_tokens`.

**Samþykkis-gatið (v1).** `authMeHandler` **auto-tengir** meðlim: sé netfang notanda á virkum `/team`-lista eiganda er `parent_account_id` sett sjálfkrafa (sæta-þak virt) og meðlimur erfir þrep og **fær aðgang að deilda KYC-listanum og audit — bæði les og skrif —** án invite/accept-þreps. Meðlimur getur því kvittað/​skráð athugasemdir í compliance-audit stofunnar. Invite/accept-samþykki er skilgreint fast-follow (sjá R10).

### 1.5 Flokkar persónuupplýsinga og skráðra (nýir/breyttir)
| Flokkur skráðra | Persónuupplýsingar | Birt / geymt |
|---|---|---|
| Vaktaðir viðskiptavinir stofu **(lögaðilar)** | kt lögaðila, staða, merki | Í möppu stofunnar (per-eigandi) |
| Eigendur/stjórn vaktaðra viðskiptavina **(einstaklingar)** | Nafn, hlutverk, eignarhlutur, **áhættuvísbending**, PEP-samsvörun | Í möppu stofunnar; kt aldrei birt (sbr. v1.0) |
| **Viðskiptavinurinn sjálfur sem einstaklingur** (þegar kt er einstaklingur) | Það **að hann er vaktaður viðskiptavinur stofunnar** | Aðeins per-eigandi `kyc_watch` |
| Starfsmenn stofu (team-meðlimir) = notendur Karp | Netfang, account-tengsl, actor í audit | Notendatafla; audit-slóð |

Nýtt eðli áhættu: í v1.0 var PEP-/áhættumat **stakt og ó­geymt**; hér er það **fest við nafngreindan einstakling, geymt og vaktað yfir tíma** í compliance-skjali. Það nálgast „reglubundið og kerfisbundið eftirlit" og prófílun — sem styrkir bæði DPIA-skylduna (35(3) GDPR) og athugun á skipun persónuverndarfulltrúa (sjá 5. kafla).

### 1.6 Viðtakendur, einangrun og miðlun
- **Viðtakendur:** aðeins notendur **innan þess account** sem á vöktunina. Engin þver-account miðlun.
- **Einangrunarmörk:** hver les- og skrif­endapunktur staðfestir eignarhald (`SELECT 1 FROM kyc_watch WHERE owner_id=? AND kt=? AND status='active'`), lyklað `owner_id`/`accountId`. Hnattræna merkja-skyndiminnið (1.3) inniheldur engin viðskiptasambönd.
- **Karp notar ekki** viðskiptavina-lista stofu í eigin þágu (t.d. í eigin fréttavél, tengslanet eða markaðssetningu). Þetta er bundið bæði tæknilega (aðskilin gögn) og samningsbundið (DPA).
- **Sala/miðlun:** engin.

### 1.7 Vinnsluaðilar og undirvinnsluaðilar
| Aðili | Hlutverk | Ábyrgð |
|---|---|---|
| **Karp / Steinsson Greykdal ehf.** | **Vinnsluaðili stofunnar** fyrir Vinnslu A/B | Vinnslusamningur (DPA) við hverja stofu — sbr. Viðauka B |
| Cloudflare | Hýsing + jaðar-worker + D1-gagnagrunnur (`tengsl`) | **Undirvinnsluaðili** — DPA; EES/​fullnægjandi ábyrgðir |
| **Google LLC / Google Ireland Ltd.** | Gmail — afhending viðvörunar- og tilkynningapósts (getur innihaldið nöfn/kt í vöktunar-samhengi) | Undirvinnsluaðili — DPA; EES/SCC/DPF |

> **Samræmi við DPA 7. lið.** Þessir undirvinnsluaðilar (Cloudflare + Google) eru þeir sömu og gagnavinnslusamningurinn telur upp (skilmálar → `dpa`). Áhættumöt/áhættureikningar fara fram **innan innviða Karp úr opinberum gögnum — engum persónuupplýsingum er miðlað til utanaðkomandi gervigreindarveitna.**

> **WordPress (wp.karp.is) — leiðrétting frá DPIA v1.0 §1.6.** v1.0 taldi WordPress-hýsingu sem „aðgangskerfi/notendareikninga". Eftir Cloudflare-native auðkenningu (F2) hafa **auth + notendareikningar flust í Cloudflare D1/worker** (`worker.js` :3125/:4294); WordPress er **ekki í gagnaslóð KYC/account** (þau gögn eru alfarið í D1) — aðeins eftirstæð, secret-varin entitlement-grant varaleið (kóði: „WP-varaleið meðan hún tórir … fellur út þegar WP fer") sem er í niðurlagningu. Því er WordPress **ekki undirvinnsluaðili þessarar vinnslu**.

Þar sem Karp er vinnsluaðili verður að upplýsa stofur um undirvinnsluaðila og fá heimild fyrir þeim (28. gr. 2./4. mgr.).

---

## 2. Nauðsyn og meðalhóf

### 2.1 Lagagrundvöllur
- **Stofan (ábyrgðaraðili):** **lagaskylda**, 6(1)(c) GDPR, sbr. áreiðanleikakönnunar- og eftirlitsskyldu tilkynningarskyldra aðila í lögum nr. 140/2018. Vöktun breytinga á viðskiptasamböndum er hluti af þeirri skyldu.
- **Karp (vinnsluaðili):** vinnur eingöngu samkvæmt **skjalfestum fyrirmælum** stofunnar (28. gr.); sjálfstæður lagagrundvöllur Karp er bundinn við opinbera auðgunarlagið (lögmætir hagsmunir, sbr. DPIA v1.0).
- **Notendareikningar/team (Karp = ábyrgðaraðili):** samningur/​lögmætir hagsmunir, 6(1)(b)/(f).

### 2.2 Nauðsyn
Samfelld vöktun er sjálfstæð **lagaskylda** stofunnar; að framkvæma hana handvirkt fyrir tugi/hundruð viðskiptavina er ill­framkvæmanlegt. Að útvista tæknilegri vöktun opinberra merkja til vinnsluaðila er **nauðsynleg og meðalhófs­kennd** leið að lögmætu markmiði. Aðeins þau merki sem CDD-skyldan kallar á eru unnin.

### 2.3 Gagnalágmörkun og meðalhóf
- **Engin auðkennisskjöl/ID** geymd hjá Karp — það sem viðkvæmast er (afrit skilríkja) verður eftir hjá stofunni.
- Aðeins kt, nafn, opinber hlutverk/​eignarhlutur, opinbert-afleidd merki og **áhættuvísbending** — engin samsöfnun einkalífsupplýsinga.
- **Per-account einangrun** tryggir að listi einnar stofu berst aldrei annarri.
- Kennitölur einstaklinga ekki birtar (sbr. v1.0).

### 2.4 Nákvæmni
Merki eru sótt úr opinberum frumheimildum; **áhættumat og PEP-samsvörun eru skýrt merkt sem möt/​óstaðfest samsvörun sem staðfesta þarf**, aldrei sem staðfest staðreynd. **Stofan tekur sjálf CDD-ákvörðunina**; Karp veitir vísbendingar, ekki úrskurð. Erlend PEP er takmörkuð og merkt með fyrirvara í UI/PDF.

### 2.5 Varðveislutakmörkun (frávik frá v1.0, rökstutt)
Ólíkt eftirspurnardrifnu v1.0 **er compliance-mappan varðveitt samfellt** — það er tilgangur hennar sem AML-sönnunargagn. Varðveisla er **samræmd 5-ára skyldu** tilkynningarskyldra aðila skv. lögum nr. 140/2018 (varðveisla gagna um áreiðanleikakönnun og viðskipti; **nákvæm grein/tímalengd staðfestist af lögfræðingi**). Audit er **append-only** til að tryggja heilleika. Við lok vinnslusamnings **eyðir/​skilar** Karp gögnunum samkvæmt fyrirmælum stofunnar, með fyrirvara um lögbundna varðveisluskyldu stofunnar sjálfrar.

### 2.6 Réttindi skráðra (í vinnsluaðila-hlutverki)
Þar sem stofan er ábyrgðaraðili beinast beiðnir skráðra (aðgangur/​andmæli 21. gr./​leiðrétting/​eyðing) **að stofunni**; Karp **aðstoðar ábyrgðaraðila** við að svara þeim (28. gr. 3. mgr. f-liður) og framsendir beiðnir sem berast Karp. Athygli skal vakin á að **réttur til eyðingar/​andmæla er takmarkaður** meðan vinnsla er nauðsynleg til að uppfylla lagaskyldu stofunnar (AML-varðveisla) — sú takmörkun er ábyrgðaraðilans (stofunnar) að meta.

### 2.7 Gagnsæi
Ábyrgð á upplýsingaskyldu (13./14. gr.) gagnvart hinum vaktaða/​eigendum hans er **stofunnar**; henni ber að endurspegla vöktunina í eigin persónuverndaryfirlýsingu. Karp lýsir vinnsluaðila-hlutverki sínu í uppfærðum skilmálum/​persónuverndaryfirlýsingu og í DPA.

---

## 3. Áhættumat (framhald af R1–R7 í DPIA v1.0)

Kvarði sem í v1.0: Líkur (Lágar/​Miðlungs/​Háar) × Alvarleiki (Lágur/​Miðlungs/​Hár).

| # | Áhætta | Líkur | Alvarleiki | Heildar (fyrir mótvægi) |
|---|---|---|---|---|
| **R8** | **Afhjúpun viðskiptasambanda** — listi stofu (hverjir eru viðskiptavinir) lekur, þver-account eða til Karp í eigin þágu; fyrir lögmenn snertir þagnarskyldu | Lágar | Hár | **Miðlungs** |
| **R9** | **PEP-/áhættuflöggun einstaklinga** — varanlegt áhættumerki fest á nafngreindan einstakling; röng jákvæð samsvörun getur haft íþyngjandi afleiðingar í CDD-ákvörðun; kerfisbundin vöktun/prófílun | Miðlungs | Miðlungs | **Miðlungs** |
| **R10** | **Samþykkis-/heimildar-gat auto-tengingar** — meðlimur auto-tengdur án invite/accept fær les+skrif á KYC-audit; rangt/​endurnýtt netfang tengir óviðkomandi → aðgangur að viðskiptasamböndum + áhættuprófílum | Miðlungs | Miðlungs–Hár | **Miðlungs** |
| **R11** | **Purpose-creep vinnsluaðila** — Karp notar viðskiptavina-lista stofu í eigin þágu (fréttavél/​tengslanet/​markaðssetning) umfram fyrirmæli | Lágar | Hár | **Miðlungs** |
| **R12** | **Þver-account leki** — galli í einangrun opinberar lista einnar stofu annarri | Lágar | Hár | **Miðlungs** |
| **R13** | **Röng samsvörun í samfelldri vöktun** — falskt merki festist og endurskimast reglulega um einstakling (framlenging á R1) | Miðlungs | Miðlungs | **Miðlungs** |
| **R14** | **Varðveisla umfram þörf / eyðing ekki virt** við lok samnings | Lágar | Miðlungs | **Lágt** |

---

## 4. Mótvægisaðgerðir og eftirstæð áhætta

| # | Mótvægisaðgerð(ir) | Staða | Eftirstæð áhætta |
|---|---|---|---|
| **R8** | Hörð per-account einangrun (`owner_id`/`accountId` á öllum les-/skrif-endapunktum + eignarhalds-gátun); trúnaðar­gögnin aðeins í per-eigandi töflum; hnattræn tafla geymir engin viðskiptasambönd; **DPA bannar eigin-notkun**; engin sala/​miðlun | Innleitt (tæknilega) + DPA (bíður) | **Lág** |
| **R9** | Samsvörun/​mat **merkt óstaðfest**, aldrei staðreynd; **stofan tekur CDD-ákvörðun**; erlend PEP takmörkuð + fyrirvari; engin viðkvæm gögn skv. 9. gr.; andmæli (21. gr.) beint til ábyrgðaraðila; kt einstaklinga aldrei birt | Innleitt (UI/PDF-fyrirvarar) | **Lág–Miðlungs** |
| **R10** | **audit-`actor` = raun-notandi** (full rekjanleiki); sæta-þak virt; aðeins netföng sem eigandi hefur virkt sett á team-lista tengjast; deilt umfang = réttindi+KYC (persónulegar stillingar/​atkvæði/​tokens EKKI deilt). **EFTIR (forsenda GA): invite/accept-samþykki áður en meðlimur fær skrif á KYC-audit** | **EFTIR** (fast-follow) | **Miðlungs → Lág eftir samþykkisþrep** |
| **R11** | DPA: vinnsla eingöngu skv. fyrirmælum, bann við eigin-notkun; tæknilegur aðskilnaður gagna; listar stofu ekki tengdir ábyrgðaraðila-vörum Karp | DPA (bíður) + tæknilega innleitt | **Lág** |
| **R12** | Owner-/account-scoped fyrirspurnir sannreyndar (12 einingapróf í `kyc.mjs`); **í regression-glugga fyrir færslu `0010` villa endapunktar LOKAÐIR (synja aðgangi) — ekki opnir** → bilun fellur til „engin heimild", ekki þver-aðgangs; öryggisrýni fyrir GA | Innleitt; migration bíður | **Lág** |
| **R13** | Mótvægi R1 (v1.0) gilda; merki tímamerkt og hægt að kvitta/​loka; endurskimun uppfærir stöðu úr frumheimild | Innleitt | **Lág** |
| **R14** | 5-ára AML-varðveisluregla skjalfest; append-only heilleiki; **eyðing/​skil við lok DPA** samkvæmt fyrirmælum stofu; varðveisla ekki lengri en skylda krefst | Stefna + DPA-ákvæði | **Lág** |

**Andmælaréttur og beiðnir (28. gr. 3. mgr.):** berist Karp beiðni skráðs er hún framsend ábyrgðaraðila (stofunni) og Karp aðstoðar við afgreiðslu; ferli skjalfest hjá tengilið persónuverndar.

---

## 5. Niðurstaða, skilyrði fyrir GA, ábyrgð og endurskoðun

**Niðurstaða.** Vinnslan er heimil — fyrir stofuna á grundvelli lagaskyldu (lög nr. 140/2018) og fyrir Karp sem vinnsluaðila skv. 28. gr. Að innleiddum mótvægisaðgerðum 4. kafla er eftirstæð áhætta **LÁG–MIÐLUNGS**, þar sem eina atriðið yfir „lágu" er samþykkis-gatið (R10) þar til invite/accept-þrepið er komið.

**Skilyrði áður en varan fer í raun-notkun stofa (GA):**
1. **Undirritaður vinnslusamningur (DPA)** við hverja stofu (Viðauki B) — eða staðlað DPA-viðauka í Fyrirtæki+ skilmálum sem stofa samþykkir.
2. **Samþykkisþrep team-meðlima (invite/accept)** komið áður en meðlimur fær skrifaðgang að KYC-audit (lokar R10).
3. **Fjar-D1 færslur `0008_kyc.sql` og `0010_account.sql` keyrðar** (annars villur/​regression).
4. **Uppfærð vinnsluskrá (30. gr., bæði sem ábyrgðar- og vinnsluaðili)** og **persónuverndaryfirlýsing/​skilmálar** sem nefna vinnsluaðila-hlutverkið og undirvinnsluaðila.
5. **Yfirferð persónuverndarlögfræðings** á þessari viðbót — m.a. staðfesting á (a) vinnsluaðila- vs. sam-ábyrgðaraðila-flokkun (1.2), (b) nákvæmri AML-varðveislu (2.5), (c) fullnægjandi DPA-ákvæðum.

**Persónuverndarfulltrúi.** Samfelld, kerfisbundin vöktun áhættumerkja um nafngreinda einstaklinga styrkir rök fyrir formlegri skipun persónuverndarfulltrúa (37. gr. GDPR / 35. gr. l. 90/2018); endurmeta skal samhliða vexti vörunnar (sbr. 5. kafla DPIA v1.0).

**Fyrirfram samráð (36. gr.).** Ekki talið skylt að óbreyttu, en ábyrgðaraðili áskilur sér að leita þess ef lögfræðiyfirferð telur eftirstæða áhættu háa — einkum vegna R9/R10.

| Hlutverk | Nafn | Dagsetning |
|---|---|---|
| Ábyrgðaraðili / vinnsluaðili (f.h. Steinsson Greykdal ehf.) | Aron Heiðar Steinsson | 26.07.2026 |
| Tengiliður persónuverndar | Aron Heiðar Steinsson | 26.07.2026 |
| Yfirferð persónuverndarlögfræðings | _(bíður)_ | |

---

## Viðauki A — Gátlisti EDPB (WP248) fyrir viðbótina
- [x] Lýsing nýrrar vinnslu og hlutverkabreytingar (1. kafli)
- [x] Lagagrundvöllur ábyrgðaraðila (stofu) og vinnsluaðila (2.1)
- [x] Nauðsyn og meðalhóf, m.a. ID-lágmörkun og varðveisla (2. kafli)
- [x] Áhættumat nýrra áhætta R8–R14 (3. kafli)
- [x] Mótvægisaðgerðir og eftirstæð áhætta (4. kafli)
- [x] Réttindi skráðra í vinnsluaðila-hlutverki (2.6)
- [x] Skilyrði fyrir GA + endurskoðun (5. kafli, haus)
- [ ] Undirritaður DPA per stofu _(forsenda GA — Viðauki B)_
- [ ] Samþykkisþrep meðlima _(forsenda GA — R10)_

## Viðauki B — Drög að lykilákvæðum vinnslusamnings (28. gr.) sem Karp býður stofum
Til yfirferðar lögfræðings; ekki tæmandi.
1. **Efni, tími, eðli og tilgangur** vinnslunnar (KYC-vöktun viðskiptavina) og flokkar skráðra.
2. Vinnsla **eingöngu samkvæmt skjalfestum fyrirmælum** ábyrgðaraðila; **bann við eigin-notkun** Karp.
3. **Trúnaður** starfsmanna Karp.
4. **Öryggisráðstafanir** (32. gr.): per-account einangrun, aðgangsstýring, dulkóðun í flutningi, append-only audit.
5. **Undirvinnsluaðilar** (Cloudflare, Google/Gmail): almenn heimild + jafngild skylda; tilkynning um fyrirhugaðar breytingar + andmælaréttur. (WordPress ekki í KYC/account-slóð — sbr. 1.7.)
6. **Aðstoð** við réttindi skráðra (kap. III) og við 32.–36. gr. (öryggi, tilkynning öryggisbrests, DPIA).
7. **Öryggisbrestur:** tilkynning til ábyrgðaraðila án ótilhlýðilegs dráttar.
8. **Eyðing/​skil** allra gagna við lok þjónustu, með fyrirvara um AML-varðveisluskyldu ábyrgðaraðila.
9. **Úttektarréttur** ábyrgðaraðila / heimild til að leggja fram upplýsingar um samræmi.
10. Flutningur út fyrir EES: enginn umfram undirvinnsluaðila undir fullnægjandi ábyrgðum.

## Viðauki C — Það sem nýja vinnslan gerir EKKI
- Geymir **engin** persónuskilríki, vegabréf eða önnur CDD-auðkennisskjöl — þau haldast hjá stofunni.
- Notar **ekki** viðskiptavina-lista stofu í eigin þágu (fréttavél, tengslanet, markaðssetning).
- Deilir **ekki** listum né audit milli aðskilinna account-a.
- Er **ekki** ábyrgðaraðili viðskiptavina-listans — **stofan** er ábyrgðaraðili; Karp er vinnsluaðili.
- Gefur **ekki** út CDD-úrskurð — veitir vísbendingar; ákvörðun er stofunnar.
- Vinnur **engar** viðkvæmar upplýsingar skv. 9. gr. sem slíkar; PEP = opinbert embætti, ekki stjórnmálaskoðun (sbr. v1.0).
