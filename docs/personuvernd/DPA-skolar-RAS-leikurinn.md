# Gagnavinnslusamningur (DPA) — Karp sem vinnsluaðili
## Fyrir RÁS-Leikinn í skólum (skóli sem ábyrgðaraðili, nemendur sem þátttakendur)

> **DRÖG — bíður yfirferðar persónuverndarlögfræðings.** Dagsett 2. ágúst 2026, rýnd og samræmd kóða 19. ágúst 2026. **Þetta skjal hefur ekki verið yfirfarið af lögfræðingi** — það var gagnavinnslusamningur compliance-varanna (sniðmátið) sem fékk yfirferð 26. júlí 2026, ekki þessi skóla-útgáfa. Mat á áhrifum (DPIA-grunnur) fylgir í `DPIA-RAS-leikurinn-skolar.md` (drög) og opin lögfræðileg álitaefni eru talin í Viðauka D þess skjals. Þetta er sjálfstætt eintak (til undirritunar / yfirferðar) af vinnslusamningi fyrir notkun RÁS-Leiksins (**karp.is/leikur/**) í kennslu. Skjalið fylgir **sömu uppbyggingu og greina-númerum** og gagnavinnslusamningur compliance-varanna (`logfraedi-yfirferd-2026-07/01-DPA-vinnslusamningur-Fyrirtaeki-plus.md`, samþykktur af persónuverndarlögfræðingi 26. júlí 2026); aðeins efnisatriðin sem snúa að leiknum eru önnur. Á **karp.is/skilmalar/** er vísað á þetta skjal í 15. lið gagnavinnslusamnings-hlutans (`#ras-leikurinn`) og á upplýsingasíðunni **karp.is/leikur/personuvernd/** fyrir skólastjórnendur og persónuverndarfulltrúa; **þar til skóli hefur undirritað þennan samning gildir almenni gagnavinnslusamningurinn** á skilmálasíðunni um vinnslu Karp sem vinnsluaðila. Skjalið kemur ekki í stað lögfræðiráðgjafar.
>
> **Forsenda gildistöku (tæknileg útfærsla):** ákvæðin um sjálfvirka eyðingu eftir 90 daga (11. gr.) og „Eyða núna" (12.–13. gr.) lýsa varðveislureglum sem eru **í kóða RÁS-Leiksins en bíða útgáfu (deploy)** á dagsetningu rýni: vikuleg grisjun `leikurPruneOld` (cron mánud. 08:10 UTC, `web/src/worker/cron.mjs` → `web/worker.js scheduled()`), endapunktur `POST /api/leikur/<kóði>/erase` (leikstjóratákn) og „🗑️ Eyða leik núna"-hnappur í leikstjóra-sýn (lobby og leikslok) — prófað í `src/lib/leikur/server.test.mjs`. Fram að útgáfu hefur **engin** sjálfvirk eyðingarregla gilt um leikjagögnin (þau hafa lifað ótímabundið í D1) og fyrsta grisjun eyðir þá uppsöfnuðum eldri leikjum. Samningurinn tekur ekki gildi gagnvart skóla fyrr en reglurnar eru komnar í rekstur og staðfestar (fyrsta keyrsla logguð).
>
> **Opið álitaefni fyrir lögfræðing (sbr. `03-Logfraedispurningar-opin-alitaefni.md`):** hvort **nemanda-merking** Karp-reiknings (flaggið `nemandi=1`, sem kerfisstjóri Karp setur samkvæmt þátttakendalista frá skóla) teljist vinnsla í umboði skóla (vinnsluaðila-hlutverk) eða hluti af Karp-reikningi notandans (Karp ábyrgðaraðili). Drögin fara milliveg: listinn sjálfur er unninn í umboði skóla (Viðauki 1, flæði 2), en reikningurinn og flaggið falla undir persónuverndarstefnu Karp.

## Aðilar

| | Ábyrgðaraðili | Vinnsluaðili |
|---|---|---|
| **Aðili** | Skóli (framhaldsskóli, háskóli eða símenntunarstofnun) sem notar RÁS-Leikinn í kennslu — hér „skólinn" | Steinsson Greykdal ehf. (rekur Karp) |
| **Kennitala** | _(nafngreint við gerð samnings)_ | 490522-0500 |
| **Heimilisfang** | _(fyllt út)_ | Brunnstígur 2, 260 Reykjanesbæ |
| **Tengiliður** | _(fyllt út — t.d. persónuverndarfulltrúi skólans)_ | Aron Heiðar Steinsson, [personuvernd@karp.is](mailto:personuvernd@karp.is) |

---

## 1. Inngangur, aðilar og gildissvið

Þessi gagnavinnslusamningur gildir **þegar skóli — eða kennari í umboði skóla — notar RÁS-Leikinn á karp.is/leikur/ í kennslu og nemendur skólans taka þátt sem lið.** Í þeirri vinnslu er skólinn **ábyrgðaraðili** (hann ákveður tilgang vinnslunnar: kennslu í hagstjórn og þjóðhagfræði) og Steinsson Greykdal ehf. (kt. 490522-0500, Brunnstígur 2, 260 Reykjanesbæ), sem rekur Karp, er **vinnsluaðili** í skilningi 28. gr. reglugerðar (ESB) 2016/679 (GDPR) og laga nr. 90/2018.

Þetta er aðgreint frá hlutverki Karp sem **ábyrgðaraðila** að: (a) **Karp-notendareikningum** þátttakenda og kennara (netfang, lykilorðsvörn og réttindaflögg — notandinn stofnar reikninginn sjálfur og um hann gildir persónuverndarstefna Karp); (b) **leikstjóra-leyfinu** sem kennari eða skóli kaupir (viðskiptamannagögn kaupandans — sjá 7. gr. um greiðslumiðlun); og (c) **hermi-líkaninu sjálfu** (RÁS, þjóðhagstölur úr opinberum gögnum — engar persónuupplýsingar). Samningurinn tekur einungis til **leikjagagna skólans** (leikir, lið, ákvarðanir og uppgjör) og **þátttakendalista** sem skólinn afhendir vinnsluaðila til að virkja nemanda-aðgang, sbr. 3. gr. og Viðauka 1. Skólinn er nafngreindur við gerð samnings.

## 2. Efni, eðli, tilgangur og tímalengd vinnslunnar

**Efni:** rekstur umferðaskipts kennsluleiks í þjóðhagfræði (RÁS-Leikurinn) þar sem lið nemenda taka hagstjórnarákvarðanir og fá uppgjör úr hermi, undir stjórn leikstjóra (kennara).

**Eðli og tilgangur:** (a) að stofna leik með leikkóða og stillingum leikstjóra; (b) að skrá lið undir liðsheiti og gefa út liðstákn svo liðið komist inn í leikinn; (c) að taka við ákvörðunum liða í hverri umferð; (d) að reikna uppgjör (hagstærðir og stig) með hermi-vélinni á þjóni Karp og birta það leikstjóra og liðum á meðan leik stendur og í lokayfirliti; (e) að merkja Karp-reikninga þátttakenda sem nemendur samkvæmt þátttakendalista skólans svo þeir geti gengið í lið. Tilgangurinn er einskorðaður við kennsluna; vinnsluaðili metur hvorki né skráir árangur einstakra nemenda og leikjagögnin eru ekki notuð til einkunnagjafar af hálfu vinnsluaðila.

**Tímalengd:** á meðan leikstjóra-leyfi skólans eða samningur er í gildi, sbr. ákvæði um varðveislu (11. gr.) og eyðingu (12. gr.).

## 3. Tegundir persónuupplýsinga og flokkar skráðra einstaklinga

**Tegundir persónuupplýsinga:**
- **Liðsheiti** sem þátttakendur velja sjálfir við inngöngu í leik — frjáls texti, að hámarki 40 stafir. Liðsheiti er **eina sviðið í leikjagögnunum sem getur borið persónuupplýsingar**, t.d. ef þátttakendur skrá eigin nöfn („Jón og Gunna") í stað hlutlauss heitis.
- **Ákvarðanir og uppgjör liða:** tölulegar hagstjórnarákvarðanir (sleða- og stefnuval) hverrar umferðar og reiknaðar hagstærðir og stig. Þau eru bundin liði (liðsnúmeri), ekki einstaklingi, og teljast aðeins persónuupplýsingar að því marki sem liðsheitið auðkennir þátttakendur.
- **Þátttakendalisti:** netföng þátttakenda (og eftir atvikum nöfn) sem skólinn sendir vinnsluaðila til að virkja nemanda-aðgang á Karp-reikningum þeirra.

**Ekki er unnið eða geymt:** í leikjagögnunum (leikir, lið, ákvarðanir, uppgjör) eru **engin skráð nöfn, kennitölur, einkunnir, bekkjarlistar eða notandaauðkenni** (eina undantekningin er liðsheiti sem þátttakendur kjósa sjálfir að skrifa nafn í, sbr. að ofan) — leikur er ekki tengdur við Karp-reikning neins þátttakanda (ekkert notandaauðkenni er skrifað með liði eða ákvörðun); aðgangur liðs og leikstjóra að leik byggir á undirrituðum tákni sem geymt er í vafra þeirra, ekki í gagnagrunni. Ekki er stefnt að vinnslu viðkvæmra persónuupplýsinga skv. 9. gr. Engin prófílgerð er gerð á einstaklingum og engum persónuupplýsingum er miðlað til utanaðkomandi gervigreindarveitna — uppgjörið er reiknað með hermi-vél á eigin þjóni Karp.

**Flokkar skráðra:** nemendur og aðrir þátttakendur skólans í leiknum; kennarar skólans sem koma fram í leikjagögnum eða þátttakendalista (t.d. sé liðsheiti kennt við þá).

## 4. Skyldur vinnsluaðila

Vinnsluaðili skuldbindur sig til að (sbr. 3. mgr. 28. gr. GDPR):
- vinna persónuupplýsingar aðeins samkvæmt skjalfestum fyrirmælum ábyrgðaraðila, þ.m.t. um flutning til þriðju landa, nema lög krefjist annars — og tilkynna þá ábyrgðaraðila nema lög banni;
- **nota gögnin ekki í eigin þágu** — sérstaklega ekki í eigin vörur eða þjónustu Karp (svo sem fréttavél, tengslanet, markaðssetningu eða þjálfun líkana) — og hvorki selja þau né miðla þeim; samandregnar nafnlausar notkunartölur (t.d. fjöldi leikja, liða og umferða) sem innihalda engin liðsheiti teljast ekki persónuupplýsingar ábyrgðaraðila;
- tryggja að þeir sem vinna gögnin séu bundnir trúnaði;
- beita öryggisráðstöfunum skv. 32. gr. (sjá 6. gr. og Viðauka 2);
- ráða undirvinnsluaðila aðeins í samræmi við þennan samning;
- aðstoða ábyrgðaraðila við að svara beiðnum skráðra einstaklinga;
- aðstoða ábyrgðaraðila við að uppfylla skyldur skv. 32.–36. gr. (öryggi, tilkynningu öryggisbrests og mat á áhrifum á persónuvernd);
- eyða eða skila gögnum við lok þjónustunnar;
- gera ábyrgðaraðila aðgengilegar allar upplýsingar sem sýna að skyldum sé fullnægt og heimila úttektir og leggja sitt af mörkum við þær;
- tilkynna ábyrgðaraðila tafarlaust telji vinnsluaðili að fyrirmæli brjóti í bága við persónuverndarlög.

## 5. Fyrirmæli og ábyrgð ábyrgðaraðila

Notkun skólans á leiknum — stofnun leiks og val stillinga, afhending þátttakendalista, stjórn leiks (ræsing, umferðir, uppgjör, stöðvun) og eyðing leiks („Eyða núna") — telst til skjalfestra fyrirmæla hans til vinnsluaðila.

Ábyrgðaraðili ábyrgist að hann hafi lögmæta heimild til vinnslunnar í tengslum við kennsluna (t.d. lögbundið hlutverk skólans eða lögmæta hagsmuni), að hann sinni upplýsingaskyldu gagnvart nemendum skv. 13.–14. gr., að þátttakendur séu 13 ára eða eldri (sbr. 11. lið persónuverndarstefnu Karp — vefurinn er ekki ætlaður yngri börnum — og ákvæði laga nr. 90/2018 um aldursmörk barna í tengslum við þjónustu í upplýsingasamfélaginu) og að fyrirmæli hans séu lögmæt. Ábyrgðaraðili **leiðbeinir þátttakendum um að velja hlutlaus liðsheiti** (ekki fullt nafn, kennitölu eða aðrar persónuupplýsingar) og ber ábyrgð á þeim kennurum sem hann felur leikstjórn — á aðgangi þeirra, notkun og trúnaði.

## 6. Öryggisráðstafanir

Vinnsluaðili beitir viðeigandi tæknilegum og skipulagslegum ráðstöfunum skv. 32. gr. GDPR, meðal annars (nánar í Viðauka 2):
- **Dulkóðun** í flutningi (TLS) og dulkóðaðri geymslu hjá undirvinnsluaðila.
- **Ströng aðgangsstýring** og auðkenning notenda (PBKDF2-varin lykilorð og undirrituð lotukaka); aðeins innskráðir notendur með nemanda-merkingu (eða leikstjórar og kerfisstjóri Karp) geta gengið í lið og aðeins handhafi leikstjóra-leyfis getur stofnað leik.
- **Undirrituð leik-tákn (HMAC):** liðstákn veitir aðeins aðgang að eigin liði í einum tilteknum leik og leikstjóratákn aðeins að eigin leik; tákn eru ekki geymd í gagnagrunni.
- **Innbyggð gagnalágmörkun:** leikjagögn eru ekki tengd við notandareikning neins þátttakanda (ekkert notandaauðkenni, netfang eða nafn í leikjatöflum).
- **Varðveislutakmörkun:** sjálfvirk grisjun eldri leikja og eyðing á beiðni (sjá 11.–13. gr.).
- Viðbrögð við öryggisbresti í samræmi við 33.–34. gr. GDPR (sjá 10. gr.).

## 7. Undirvinnsluaðilar

Ábyrgðaraðili veitir almenna heimild fyrir eftirfarandi undirvinnsluaðilum:
- **Cloudflare, Inc.** — hýsing, keyrsla (Workers) og gagnagrunnur (D1) þar sem leikjagögnin eru vistuð og unnin. Staðsetning gagnagrunns er hjá Cloudflare; sjá 8. gr. um flutning.
- **Google LLC / Google Ireland Ltd.** — Gmail: móttaka þátttakendalista sem skólinn sendir á [hjalp@karp.is](mailto:hjalp@karp.is) (vinnsla í umboði skóla) og afhending tölvupósts vegna Karp-reikninga þátttakenda (staðfesting, endurstilling lykilorðs — sú vinnsla fellur undir persónuverndarstefnu Karp). Leikurinn sjálfur sendir engan tölvupóst.

**Aðgreint — utan gildissviðs þessa samnings:** greiðsla fyrir leikstjóra-leyfi fer um greiðslumiðlun **Áskell (askell.is)**. Þar eru unnin gögn **kaupandans** (kennara eða skóla sem greiðir), ekki nemenda; um þá vinnslu er Karp ábyrgðaraðili eigin viðskiptamannagagna og hún er ekki hluti af vinnslu í umboði skólans.

**Uppgjör leiksins er reiknað með hermi-vél innan innviða Karp — engum persónuupplýsingum er miðlað til utanaðkomandi gervigreindarveitna.**

Vinnsluaðili gerir samning við hvern undirvinnsluaðila sem leggur á sambærilegar skyldur og hér greinir og ber ábyrgð gagnvart ábyrgðaraðila á vinnslu þeirra. Tilkynnt verður fyrirfram um fyrirhugaðar breytingar á undirvinnsluaðilum og ábyrgðaraðila gefinn kostur á að andmæla.

## 8. Flutningur út fyrir EES

Undirvinnsluaðilar kunna að vinna gögn utan Evrópska efnahagssvæðisins. Slíkur flutningur styðst við viðeigandi verndarráðstafanir skv. V. kafla GDPR — svo sem stöðluð samningsákvæði framkvæmdastjórnar ESB (SCC) og/eða gildandi fullnægjandiákvörðun (t.d. EU-US Data Privacy Framework). *[Drög — staðfestist við lögfræðiyfirferð og í samræmi við uppfærðar ráðstafanir undirvinnsluaðila.]*

## 9. Aðstoð við réttindi skráðra einstaklinga

Vinnsluaðili aðstoðar ábyrgðaraðila, að því marki sem unnt er, við að svara beiðnum skráðra einstaklinga um aðgang, leiðréttingu, eyðingu, takmörkun, flutning og andmæli. Berist vinnsluaðila slík beiðni beint framsendir hann hana ábyrgðaraðila án tafar og svarar henni ekki sjálfstætt nema samkvæmt fyrirmælum ábyrgðaraðila.

Athygli er vakin á að leikjagögnin eru ekki lykluð á einstaklinga: beiðni nemanda um aðgang eða eyðingu er afgreidd með því að finna leikinn (leikkóða) og liðið sem um ræðir — að jafnaði með atbeina kennara/leikstjóra — og eyða leiknum í heild (leikstjóri: „Eyða núna") eða láta vinnsluaðila nafnleysa/breyta liðsheitinu handvirkt í gagnagrunni (engin sjálfsafgreiðsla er fyrir breytingu liðsheitis eftir inngöngu). Réttindi þátttakanda gagnvart eigin Karp-reikningi (netfang, lykilorð, eyðing aðgangs) fara eftir persónuverndarstefnu Karp og eru afgreidd af Karp sem ábyrgðaraðila.

## 10. Tilkynning um öryggisbrest

Verði vinnsluaðili var við öryggisbrest sem varðar persónuupplýsingar ábyrgðaraðila tilkynnir hann það ábyrgðaraðila **án ótilhlýðilegrar tafar og eigi síðar en 48 klukkustundum** eftir að hann verður brestsins var, og lætur í té þær upplýsingar sem ábyrgðaraðili þarf til að uppfylla tilkynningaskyldu sína gagnvart Persónuvernd innan 72 klukkustunda skv. 33. gr. GDPR og, eftir atvikum, gagnvart hinum skráðu skv. 34. gr. Tilkynning er send á tengilið ábyrgðaraðila skv. aðilatöflu og inniheldur a.m.k. eðli brestsins, hvaða leikir/flokkar skráðra eru líklega fyrir áhrifum, líklegar afleiðingar og þær ráðstafanir sem gripið hefur verið til. Vinnsluaðili bætir við upplýsingum eftir því sem þær liggja fyrir. *[Drög — 48 klst. fresturinn er strangari en í almenna gagnavinnslusamningnum á karp.is/skilmalar/ („án ótilhlýðilegrar tafar"); hann er samræmdur við upplýsingasíðuna karp.is/leikur/personuvernd/ og staðfestist við lögfræðiyfirferð (sjá DPIA, Viðauki D §4).]*

## 11. Varðveisla

Vinnsluaðili varðveitir leikjagögnin aðeins á meðan þeirra er þörf fyrir kennsluna og að hámarki í **90 daga**: loknum leikjum er eytt sjálfkrafa í vikulegri grisjun þegar 90 dagar eru liðnir frá stofnun þeirra (leikur stendur að jafnaði innan einnar kennslustundar, svo stofnunardagur og lokadagur falla saman); leikjum sem aldrei er lokið er eytt eigi síðar en 180 dögum frá stofnun. Þar sem grisjunin er vikuleg getur eyðing framkvæmst allt að 7 dögum eftir að fresturinn rennur út. Þátttakendalista sem skólinn sendir á hjalp@karp.is er eytt úr pósthólfi vinnsluaðila þegar nemanda-merking er lokið og eigi síðar en 90 dögum eftir móttöku. Gögnin eru ekki varðveitt lengur en nauðsynlegt er í þessum tilgangi; ábyrgðaraðili getur óskað eyðingar fyrr (12.–13. gr.).

## 12. Eyðing eða skil við lok

Við lok þjónustunnar, eða samkvæmt fyrirmælum ábyrgðaraðila, eyðir vinnsluaðili öllum persónuupplýsingum sem unnar eru fyrir ábyrgðaraðila — eða skilar þeim að vali ábyrgðaraðila — og eyðir fyrirliggjandi afritum, nema geymsluskylda leiði af lögum. **„Eyða núna":** leikstjóri getur hvenær sem er eytt einstökum leik strax með öllu sem honum tilheyrir (lið, ákvarðanir, uppgjör) án þess að bíða vikulegu grisjunarinnar — með hnappinum „🗑️ Eyða leik núna" í leikstjóra-sýn (í biðstöðu og að leik loknum); leikur sem stendur yfir er fyrst stöðvaður („⏹️ Stöðva leik") og síðan eytt. Eyðing er endanleg og kemur í stað frekari varðveislu; lokayfirlit eða skýrslu sem leikstjóri hefur þegar sótt eða prentað er á ábyrgð ábyrgðaraðila.

## 13. Réttindi ábyrgðaraðila: úttekt, afrit og eyðing

Ábyrgðaraðili á rétt á að:
- **fá afrit** af leikjagögnum sínum (stöðu, ákvörðunum og uppgjöri liða) meðan leikur er varðveittur — m.a. gegnum lokayfirlit og leikstjóra-greiningu leiksins;
- **sannreyna** að skyldum sé fullnægt með úttekt eða skoðun — þ.m.t. skriflegri staðfestingu á eyðingu eða, eftir samkomulagi, óháðri úttekt;
- **krefjast eyðingar** gagna sinna hvenær sem er — sjálfur með „Eyða núna" fyrir einstaka leiki, eða með beiðni til vinnsluaðila um alla leiki skólans og þátttakendalista.

Vinnsluaðili verður við slíkum beiðnum án ótilhlýðilegrar tafar.

## 14. Gildistími, ábyrgð, forgangur og gildandi lög

Samningurinn tekur gildi við undirritun beggja aðila og gildir á meðan skólinn notar RÁS-Leikinn í kennslu — að jafnaði gildistíma leikstjóra-leyfis (skólaár) og að honum liðnum þar til vinnslu er lokið skv. 11.–12. gr. Hvor aðili getur sagt samningnum upp með skriflegri tilkynningu; við uppsögn fer um gögnin skv. 12. gr. Um þennan samning gilda íslensk lög og GDPR. Rísi ágreiningur um vinnslu persónuupplýsinga í tengslum við RÁS-Leikinn í skólum gengur þessi gagnavinnslusamningur framar almennum notkunarskilmálum Karp og almenna gagnavinnslusamningnum á karp.is/skilmalar/ um þá vinnslu. Ábyrgð aðila fer að lögum. *[Drög — ákvæði um ábyrgðartakmörkun og varnarþing staðfestast við lögfræðiyfirferð.]* Fyrirspurnir: [personuvernd@karp.is](mailto:personuvernd@karp.is).

---

## Undirritun

| Hlutverk | Nafn | Dagsetning | Undirskrift |
|---|---|---|---|
| F.h. ábyrgðaraðila (skóla) | _(fyllt út)_ | | |
| F.h. vinnsluaðila (Steinsson Greykdal ehf.) | Aron Heiðar Steinsson | | |
| Yfirferð persónuverndarlögfræðings | _(bíður)_ | | |

---

## Viðauki 1 — Lýsing vinnslunnar (gagnaflæði, töflur og reitir)

### 1.1 Gagnaflæði

| # | Skref | Hver | Hvað er unnið | Hvar vistað | Hlutverk Karp |
|---|---|---|---|---|---|
| 1 | Leikstjóri (kennari) stofnar leik og velur stillingar | Kennari, innskráður á Karp með leikstjóra-leyfi | 5 stafa leikkóði + stillingar (engin persónugögn) | `leikur_games` (D1) · leikstjóratákn í vafra kennara | Vinnsluaðili |
| 2 | Skóli sendir þátttakendalista svo nemendur komist í lið | Kennari → [hjalp@karp.is](mailto:hjalp@karp.is) (Gmail) → kerfisstjóri Karp setur nemanda-merkingu á Karp-reikninga | Netföng (og eftir atvikum nöfn) þátttakenda | Pósthólf hjalp@karp.is (eytt skv. 11. gr.) · flaggið `nemandi` í `users`-töflu Karp-reiknings | Listinn: vinnsluaðili · reikningurinn/flaggið: Karp ábyrgðaraðili (opið álitaefni, sjá inngang) |
| 3 | Þátttakandi gengur í lið með leikkóða og liðsheiti | Innskráður Karp-reikningur með nemanda-merkingu (eða leikstjóri) | Liðsheiti (frjáls texti ≤40 stafir) + tímastimpill | `leikur_teams` (D1) · liðstákn í vafra | Vinnsluaðili |
| 4 | Lið sendir ákvarðanir; leikstjóri keyrir uppgjör umferðar | Lið (liðstákn) · leikstjóri (leikstjóratákn) | Tölulegar ákvarðanir, læsing, tímastimpill · reiknaðar hagstærðir og stig | `leikur_decisions`, `leikur_results` (D1) | Vinnsluaðili |
| 5 | Eyðing | Vikuleg grisjun (sjálfvirk) · „Eyða núna" (leikstjóri) · beiðni til Karp | Leikur + lið + ákvarðanir + uppgjör eytt í einni færslu per leik | — | Vinnsluaðili |

Leikstjóra-leyfið sjálft (kaup kennara/skóla um Áskell, þjónustu-réttindi á Karp-reikningi kaupanda) er utan þessa flæðis — Karp ábyrgðaraðili, sjá 7. gr.

### 1.2 Töflur og reitir í gagnagrunni (Cloudflare D1, töfluskema `0009_leikur.sql`)

| Tafla | Reitur | Innihald | Persónuupplýsingar? |
|---|---|---|---|
| `leikur_games` | `code` | 5 stafa leikkóði (slembinn, úr stafamenginu A–Z/2–9 án ruglingsstafa) | Nei |
| | `config` | JSON-stillingar leikstjóra: fjöldi umferða, sviðsmynd/markmið, hlutverk (roles/roleMap), hamur (classic/studio), umferðar-klukka (timerSec/deadline), erfiðleikastig, óvænt atvik (surprise), æfingalið (bots = liðsnúmer) | Nei |
| | `phase` | Staða leiks: lobby / decide / resolved / ended | Nei |
| | `current_round` | Númer umferðar | Nei |
| | `created` | Stofnunartími (sekúndur frá 1970) | Nei |
| `leikur_teams` | `id` | Sjálfvirkt liðsnúmer | Nei |
| | `game_code` | Leikkóði | Nei |
| | `name` | **Liðsheiti — frjáls texti þátttakenda, ≤40 stafir (sjálfgefið „Lið")** | **Getur verið** (ef þátttakendur skrifa nöfn) |
| | `joined` | Inngöngutími (sekúndur frá 1970) | Nei |
| `leikur_decisions` | `game_code`, `round`, `team_id` | Leikkóði, umferð, liðsnúmer | Nei |
| | `decisions` | JSON: tölulegar sleða-/stefnuákvarðanir liðsins í umferðinni | Nei (bundið liði) |
| | `locked`, `submitted_at` | Læsingarflagg og skilatími | Nei |
| `leikur_results` | `game_code`, `round`, `team_id` | Leikkóði, umferð, liðsnúmer | Nei |
| | `kpis` | JSON: reiknaðar hagstærðir liðsins eftir umferðina | Nei (bundið liði) |
| | `round_score`, `cumulative` | Stig umferðar og uppsöfnuð stig | Nei (bundið liði) |

**Ekki til í neinni `leikur_*`-töflu:** notandaauðkenni (user_id), netfang, nafn, kennitala, skóli, bekkur, einkunn. Engin af töflunum vísar í `users`-töflu Karp.

### 1.3 Tákn og vafra-gögn (ekki vistað á þjóni)

| Atriði | Innihald | Hvar | Athugasemd |
|---|---|---|---|
| Leikstjóratákn | `{code, role:'fac'}`, HMAC-SHA-256-undirritað með leyniorði þjóns | `localStorage` (`leikur_fac_<kóði>`) í vafra kennara | Ekki geymt í D1; veitir stjórn á einum leik |
| Liðstákn | `{code, role:'team', teamId}`, HMAC-SHA-256-undirritað | `localStorage` (`leikur_team_<kóði>`) í vafra liðs | Ekki geymt í D1; veitir aðgang að einu liði |
| Stillingar/séð-flögg | `leikur_faccfg_<kóði>`, `leikur_faccfg_last`, `leikur_bot_<kóði>`, `lk-fac-onboarded`, `lk-sepop-<kóði>-<umferð>` | `localStorage` í vafra | Viðmóts-stillingar og „séð"-merki; aldrei send til þjóns. Við „Eyða leik núna" hreinsar vafri leikstjóra lykla þess leiks |
| Innskráningarkaka | `karp_session` (undirrituð, HttpOnly, Secure) | Vafri | Karp-reikningur — persónuverndarstefna Karp |

Eingöngu táknin (með leikkóða/liðsnúmeri) eru send til þjóns með beiðnum; engin vafra-gögn önnur.

### 1.4 Það sem vinnslan gerir EKKI
- Tengir **ekki** leik, lið, ákvörðun eða uppgjör við Karp-reikning þátttakanda.
- Skráir **ekki** nöfn, kennitölur, einkunnir eða bekkjarlista nemenda í leikjagögn.
- Metur **ekki** árangur einstakra nemenda og miðlar **engu** til einkunnagjafar.
- Sendir **engan** tölvupóst úr leiknum sjálfum.
- Miðlar **engum** persónuupplýsingum til utanaðkomandi gervigreindarveitna; uppgjör reiknað með hermi-vél á þjóni Karp.
- Notar leikjagögn **ekki** í aðrar vörur Karp.

---

## Viðauki 2 — Tæknilegar og skipulagslegar öryggisráðstafanir (32. gr.)

| Ráðstöfun | Útfærsla |
|---|---|
| Dulkóðun í flutningi | TLS á öllum samskiptum við karp.is; gögn dulkóðuð í hvíld hjá Cloudflare (D1). |
| Auðkenning notenda | Lykilorð varin með PBKDF2 (SHA-256, salt, endurteknar umferðir); lotan auðkennd með undirritaðri `karp_session`-köku (HttpOnly, Secure, SameSite=Lax, lén .karp.is). Engin lota ef leyniorð þjóns vantar (fail-closed). |
| Réttindagátt leiksins | Stofnun leiks: aðeins handhafi leikstjóra-leyfis (kerfisstjóri, frí-aðgangur eða virk „leikur"-þjónustuáskrift). Innganga í lið: aðeins innskráður notandi með nemanda-merkingu, kerfisstjóri eða leikstjóri. Nemanda-merking sett af kerfisstjóra Karp einum (`POST /api/admin/set-type`, stjórnenda-gátt). |
| HMAC-undirrituð leik-tákn | Leikstjóra- og liðstákn eru `{code, role[, teamId]}` undirrituð með HMAC-SHA-256 og leyniorði þjóns; sérhver stjórn-, ákvarðana-, greiningar- og eyðingaraðgerð staðfestir að tákn sé gilt, að hlutverk passi og að leikkóði táknsins sé sá sami og leiksins. Tákn eru ekki geymd í gagnagrunni. |
| Innbyggð gagnalágmörkun | Leikjatöflur bera ekkert notandaauðkenni, netfang eða nafn; eina frjálsa textasviðið (liðsheiti) er takmarkað við 40 stafi; leikkóðar eru slembnir 5 stafa kóðar sem ekki er hægt að leiða af skóla eða notanda. |
| Gagnagrunnur og hýsing | Cloudflare D1 (SQLite) með aðgangi eingöngu úr worker Karp og um stjórnborð/CLI Cloudflare-reiknings Karp (kerfisstjóri); engin bein utanaðkomandi tenging við gagnagrunninn. Engin svæðisbinding (jurisdiction) er stillt á grunninn — sjá 8. gr. |
| Vefstefna (CSP) og viðmót | Content-Security-Policy-hausar (á dagsetningu draga í Report-Only-ham og hertir í skrefum; m.a. `frame-ancestors 'self'`, `object-src 'none'`); leikja-viðmótið notar enga inline-atburðahandlara (`onclick=` o.þ.h.) — allir atburðir bundnir með `addEventListener`. |
| Varðveislutakmörkun (retention-cron) | Vikuleg sjálfvirk grisjun (`leikurPruneOld`, cron mánud. 08:10 UTC): loknir leikir þegar 90 dagar eru liðnir frá stofnun og ólokið/yfirgefið þegar 180 dagar eru liðnir frá stofnun, eytt í einni D1-færslu per leik (uppgjör → ákvarðanir → lið → leikur) svo leikur standi aldrei eftir hálf-eyddur; leikur yngri en 180 daga sem ekki er lokið er aldrei snertur. *[Forsenda gildistöku — í kóða, bíður útgáfu, sjá inngang.]* |
| Eyðing á beiðni („Eyða núna") | `POST /api/leikur/<kóði>/erase` með leikstjóratákni (hnappur „🗑️ Eyða leik núna" í leikstjóra-sýn, með staðfestingarglugga) eyðir einum leik og öllu sem honum tilheyrir strax (aðeins í biðstöðu eða loknum leik — leik í gangi svarar þjónn 409 og leikstjóri stöðvar hann fyrst). Idempotent: endurtekið kall á eyddan kóða skilar „fannst ekki". *[Forsenda gildistöku — í kóða, bíður útgáfu, sjá inngang.]* |
| Trúnaður og aðgangur starfsmanna | Aðgangur að stjórnenda-gátt og gagnagrunni bundinn kerfisstjóra Karp; þeir sem vinna gögnin eru bundnir trúnaði. |
| Viðbrögð við öryggisbresti | Tilkynning til skóla án ótilhlýðilegrar tafar og eigi síðar en 48 klst. (10. gr.); skráning atviks og aðstoð við 72 klst. tilkynningu skólans til Persónuverndar. |
| Undirvinnsluaðilar | Cloudflare (hýsing/D1), Google (Gmail f. þátttakendalista og reiknings-póst); samningar skv. 28. gr. og flutningsráðstafanir skv. V. kafla (7.–8. gr.). |
