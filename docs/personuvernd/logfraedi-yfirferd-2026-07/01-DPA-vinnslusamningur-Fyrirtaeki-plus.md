# Gagnavinnslusamningur (DPA) — Karp sem vinnsluaðili
## Fyrir compliance-vörur Karp (Áreiðanleikavaktin / KYC-vöktun og Firma-account)

> **DRÖG — bíður yfirferðar persónuverndarlögfræðings.** Dagsett 26. júlí 2026. Þetta er sjálfstætt eintak (til undirritunar / yfirferðar) af sama gagnavinnslusamningi og birtur er í drögum á **karp.is/skilmalar/** (þriðji hluti síðunnar) og geymdur í `web/src/data/skilmalar.json` (`dpa`-fylki). Skjalið kemur ekki í stað lögfræðiráðgjafar. Sjá `03-Logfraedispurningar-opin-alitaefni.md` fyrir opin álitaefni sem hafa áhrif á endanlegt orðalag (m.a. vinnsluaðili vs. sam-ábyrgðaraðili, nákvæm AML-varðveisla, ákvæði um ábyrgðartakmörkun).

## Aðilar

| | Ábyrgðaraðili | Vinnsluaðili |
|---|---|---|
| **Aðili** | Áskrifandi að compliance-vörum Karp (tilkynningarskyld stofa/fyrirtæki) | Steinsson Greykdal ehf. |
| **Kennitala** | _(nafngreint við gerð áskriftar/samnings)_ | 490522-0500 |
| **Heimilisfang** | _(fyllt út)_ | Brunnstígur 2, 260 Reykjanesbæ |
| **Tengiliður** | _(fyllt út)_ | Aron Heiðar Steinsson, [personuvernd@karp.is](mailto:personuvernd@karp.is) |

---

## 1. Inngangur, aðilar og gildissvið

Þessi gagnavinnslusamningur gildir **þegar áskrifandi (tilkynningarskyld stofa eða fyrirtæki) notar compliance-vörur Karp — Áreiðanleikavaktina (KYC-vöktun) og Firma-account — til að vinna persónuupplýsingar um sína eigin viðskiptavini og raunverulega eigendur þeirra.** Í þeirri vinnslu er áskrifandinn **ábyrgðaraðili** og Steinsson Greykdal ehf. (kt. 490522-0500, Brunnstígur 2, 260 Reykjanesbæ), sem rekur Karp, er **vinnsluaðili** í skilningi 28. gr. reglugerðar (ESB) 2016/679 (GDPR) og laga nr. 90/2018.

Þetta er aðgreint frá hlutverki Karp sem **ábyrgðaraðila** — annars vegar að eigin notendagögnum og hins vegar að auðgunarlaginu úr opinberum skrám (nöfn, hlutverk, eignarhald, PEP- og refsilistar) sem Karp viðheldur sjálfstætt (sbr. persónuverndarstefnu Karp). Samningurinn tekur einungis til vinnslu Karp sem **vinnsluaðila** á þeim viðskiptavina-lista sem ábyrgðaraðilinn leggur sjálfur inn. Ábyrgðaraðilinn er nafngreindur við gerð áskriftar eða samnings.

## 2. Efni, eðli, tilgangur og tímalengd vinnslunnar

**Efni:** vinnsla persónuupplýsinga vegna áreiðanleikakönnunar (CDD) og áframhaldandi vöktunar sem ábyrgðaraðili framkvæmir á viðskiptavinum sínum til að uppfylla eftirlitsskyldu tilkynningarskylds aðila.

**Eðli og tilgangur:** (a) að bera kennitölur sem ábyrgðaraðili leggur inn saman við opinberar skrár og lista (fyrirtækjaskrá, raunverulega eigendur, PEP-lista, þvingunar- og refsilista, Lögbirtingablaðið, opinbera fjölmiðlaumfjöllun); (b) að reikna og skrá áhættumat og áreiðanleikamerki; (c) að vakta breytingar og senda viðvaranir; (d) að halda append-only atvikaskrá og útbúa skjöl (t.d. PDF) fyrir compliance-möppu ábyrgðaraðila. Tilgangurinn er einskorðaður við að aðstoða ábyrgðaraðila við að uppfylla skyldur sínar, m.a. skv. lögum nr. 140/2018 um aðgerðir gegn peningaþvætti og fjármögnun hryðjuverka.

**Tímalengd:** á meðan áskrift eða samningur er í gildi, sbr. ákvæði um varðveislu og eyðingu.

## 3. Tegundir persónuupplýsinga og flokkar skráðra einstaklinga

**Tegundir persónuupplýsinga:**
- Kennitölur og auðkenni sem ábyrgðaraðili leggur inn.
- Opinberar niðurstöður sem vinnsluaðili sækir eða reiknar: nöfn, opinber hlutverk (stjórn, framkvæmdastjórn, prókúra), eignarhlutir og tengsl milli félaga, staða lögaðila (t.d. gjaldþrot), PEP-staða (nafnasamsvörun við opinber embætti), samsvörun við þvingunar- og refsilista og opinber fjölmiðlaumfjöllun.
- Reiknuð möt: áhættuflokkun og áreiðanleikamerki, ásamt athugasemdum og ákvörðunum notenda ábyrgðaraðila í kerfinu.

**Ekki er unnið eða geymt:** engin persónuskilríki, vegabréf, ökuskírteini eða önnur auðkennisskjöl vegna áreiðanleikakönnunar eru hlaðin upp eða varðveitt hjá vinnsluaðila — auðkennissönnun viðskiptavina helst hjá ábyrgðaraðila. Ekki er stefnt að vinnslu viðkvæmra persónuupplýsinga skv. 9. gr.; PEP- og refsilista-samsvörun er nafnasamsvörun við opinber embætti eða lista, merkt til staðfestingar — ekki ályktun um stjórnmálaskoðanir.

**Flokkar skráðra:** viðskiptavinir ábyrgðaraðila (einstaklingar og fyrirsvarsmenn/eigendur lögaðila-viðskiptavina), raunverulegir eigendur þeirra og tengdir aðilar sem fram koma við könnunina.

## 4. Skyldur vinnsluaðila

Vinnsluaðili skuldbindur sig til að (sbr. 3. mgr. 28. gr. GDPR):
- vinna persónuupplýsingar aðeins samkvæmt skjalfestum fyrirmælum ábyrgðaraðila, þ.m.t. um flutning til þriðju landa, nema lög krefjist annars — og tilkynna þá ábyrgðaraðila nema lög banni;
- **nota gögnin ekki í eigin þágu** — sérstaklega ekki í eigin vörur eða þjónustu Karp (svo sem fréttavél, tengslanet eða markaðssetningu) — og hvorki selja þau né miðla þeim;
- tryggja að þeir sem vinna gögnin séu bundnir trúnaði;
- beita öryggisráðstöfunum skv. 32. gr. (sjá 6. lið);
- ráða undirvinnsluaðila aðeins í samræmi við þennan samning;
- aðstoða ábyrgðaraðila við að svara beiðnum skráðra einstaklinga;
- aðstoða ábyrgðaraðila við að uppfylla skyldur skv. 32.–36. gr. (öryggi, tilkynningu öryggisbrests og mat á áhrifum á persónuvernd);
- eyða eða skila gögnum við lok þjónustunnar;
- gera ábyrgðaraðila aðgengilegar allar upplýsingar sem sýna að skyldum sé fullnægt og heimila úttektir og leggja sitt af mörkum við þær;
- tilkynna ábyrgðaraðila tafarlaust telji vinnsluaðili að fyrirmæli brjóti í bága við persónuverndarlög.

## 5. Fyrirmæli og ábyrgð ábyrgðaraðila

Notkun ábyrgðaraðila á vörunum — innsláttur kennitalna, virkjun vöktunar og útflutningur gagna — telst til skjalfestra fyrirmæla hans til vinnsluaðila.

Ábyrgðaraðili ábyrgist að hann hafi lögmæta heimild til vinnslunnar (t.d. lagaskyldu skv. lögum nr. 140/2018 eða lögmæta hagsmuni), hafi framkvæmt eigið mat eftir því sem við á (t.d. hagsmunamat eða mat á áhrifum á persónuvernd), að hann sinni upplýsingaskyldu gagnvart hinum skráðu skv. 13.–14. gr. og að fyrirmæli hans séu lögmæt.

## 6. Öryggisráðstafanir

Vinnsluaðili beitir viðeigandi tæknilegum og skipulagslegum ráðstöfunum skv. 32. gr. GDPR, meðal annars:
- **Dulkóðun** í flutningi (TLS) og dulkóðaðri geymslu hjá undirvinnsluaðila.
- **Ströng aðgangsstýring** og auðkenning notenda (PBKDF2-varin lykilorð og undirrituð lotukaka).
- **Hörð einangrun milli reikninga (per-account):** gögn hvers ábyrgðaraðila eru einangruð með reikningsauðkenni (owner_id/accountId) í Cloudflare D1 og hver les- og skrifaðgerð staðfestir eignarhald; enginn þveraðgangur er milli áskrifenda. Teymismeðlimir innan sama reiknings (Firma-account) deila aðeins gögnum sama ábyrgðaraðila.
- **Gagnalágmörkun** og **append-only atvikaskrá** (audit trail) þar sem gerandi er skráður raunverulegur notandi.
- Viðbrögð við öryggisbresti í samræmi við 33.–34. gr. GDPR.

## 7. Undirvinnsluaðilar

Ábyrgðaraðili veitir almenna heimild fyrir eftirfarandi undirvinnsluaðilum:
- **Cloudflare, Inc.** — hýsing, keyrsla (Workers) og gagnagrunnur (D1) þar sem gögnin eru vistuð og unnin.
- **Google LLC / Google Ireland Ltd.** — Gmail, til afhendingar viðvörunar- og tilkynningapósts (getur innihaldið nöfn og kennitölur í samhengi vöktunar).

**Áreiðanleikamöt og áhættureikningar fara fram innan innviða Karp úr opinberum gögnum — engum persónuupplýsingum er miðlað til utanaðkomandi gervigreindarveitna.**

Vinnsluaðili gerir samning við hvern undirvinnsluaðila sem leggur á sambærilegar skyldur og hér greinir og ber ábyrgð gagnvart ábyrgðaraðila á vinnslu þeirra. Tilkynnt verður fyrirfram um fyrirhugaðar breytingar á undirvinnsluaðilum og ábyrgðaraðila gefinn kostur á að andmæla.

## 8. Flutningur út fyrir EES

Undirvinnsluaðilar kunna að vinna gögn utan Evrópska efnahagssvæðisins. Slíkur flutningur styðst við viðeigandi verndarráðstafanir skv. V. kafla GDPR — svo sem stöðluð samningsákvæði framkvæmdastjórnar ESB (SCC) og/eða gildandi fullnægjandiákvörðun (t.d. EU-US Data Privacy Framework). *[Drög — staðfestist við lögfræðiyfirferð og í samræmi við uppfærðar ráðstafanir undirvinnsluaðila.]*

## 9. Aðstoð við réttindi skráðra einstaklinga

Vinnsluaðili aðstoðar ábyrgðaraðila, að því marki sem unnt er, við að svara beiðnum skráðra einstaklinga um aðgang, leiðréttingu, eyðingu, takmörkun, flutning og andmæli. Berist vinnsluaðila slík beiðni beint framsendir hann hana ábyrgðaraðila án tafar og svarar henni ekki sjálfstætt nema samkvæmt fyrirmælum ábyrgðaraðila.

Athygli er vakin á að réttur til eyðingar eða andmæla kann að vera takmarkaður meðan vinnslan er nauðsynleg til að ábyrgðaraðili uppfylli lögbundna varðveisluskyldu; mat á þeirri takmörkun er ábyrgðaraðilans.

## 10. Tilkynning um öryggisbrest

Verði vinnsluaðili var við öryggisbrest sem varðar persónuupplýsingar ábyrgðaraðila tilkynnir hann það ábyrgðaraðila án ótilhlýðilegrar tafar og lætur í té þær upplýsingar sem ábyrgðaraðili þarf til að uppfylla tilkynningaskyldu sína skv. 33.–34. gr. GDPR.

## 11. Varðveisla

Vinnsluaðili varðveitir gögnin á meðan áskrift eða samningur varir og í samræmi við fyrirmæli ábyrgðaraðila. Ábyrgðaraðili sem er tilkynningarskyldur skv. lögum nr. 140/2018 ber sjálfstæða skyldu til að varðveita gögn áreiðanleikakönnunar — að jafnaði í **5 ár** frá lokum viðskiptasambands (nákvæm lagagrein og tímalengd staðfestast við lögfræðiyfirferð); vinnsluaðili styður þá varðveislu meðan samningur er í gildi. Gögnin eru ekki varðveitt lengur en nauðsynlegt er í þessum tilgangi.

## 12. Eyðing eða skil við lok

Við lok þjónustunnar, eða samkvæmt fyrirmælum ábyrgðaraðila, eyðir vinnsluaðili öllum persónuupplýsingum sem unnar eru fyrir ábyrgðaraðila — eða skilar þeim að vali ábyrgðaraðila — og eyðir fyrirliggjandi afritum, nema geymsluskylda leiði af lögum eða af varðveisluskyldu ábyrgðaraðila sjálfs. Óbreytanleg (append-only) atvikaskrá kann að haldast að því marki sem lög og eðlileg sönnunarþörf krefjast.

## 13. Réttindi ábyrgðaraðila: úttekt, afrit og eyðing

Ábyrgðaraðili á rétt á að:
- **fá afrit** af gögnum sínum og flytja þau út (m.a. gegnum útflutnings- og skýrsluvirkni vörunnar);
- **sannreyna** að skyldum sé fullnægt með úttekt eða skoðun — þ.m.t. um atvikaskrá kerfisins eða, eftir samkomulagi, óháða úttekt;
- **krefjast eyðingar** gagna sinna hvenær sem er, með fyrirvara um eigin varðveisluskyldu.

Vinnsluaðili verður við slíkum beiðnum án ótilhlýðilegrar tafar.

## 14. Ábyrgð, forgangur og gildandi lög

Um þennan samning gilda íslensk lög og GDPR. Rísi ágreiningur um vinnslu persónuupplýsinga í tengslum við compliance-vörurnar gengur þessi gagnavinnslusamningur framar almennum notkunarskilmálum um þá vinnslu. Ábyrgð aðila fer að lögum. *[Drög — ákvæði um ábyrgðartakmörkun og varnarþing staðfestast við lögfræðiyfirferð.]* Fyrirspurnir: [personuvernd@karp.is](mailto:personuvernd@karp.is).

---

## Undirritun

| Hlutverk | Nafn | Dagsetning | Undirskrift |
|---|---|---|---|
| F.h. ábyrgðaraðila | _(fyllt út)_ | | |
| F.h. vinnsluaðila (Steinsson Greykdal ehf.) | Aron Heiðar Steinsson | | |
| Yfirferð persónuverndarlögfræðings | _(bíður)_ | | |
