# Mat á áhrifum á persónuvernd (DPIA)
## RÁS-Leikurinn í skólum — kennsluleikur í þjóðhagfræði á Karp (karp.is/leikur/)

| | |
|---|---|
| **Vinnsluaðili (höfundur matsins)** | Steinsson Greykdal ehf., kt. 490522-0500, Brunnstígur 2, 260 Reykjanesbæ — rekur Karp |
| **Ábyrgðaraðili leikjagagna** | Skólinn (framhaldsskóli, háskóli eða símenntunarstofnun) sem notar leikinn í kennslu — sjá 1.1 |
| **Vara / vinnsla** | RÁS-Leikurinn: umferðaskiptur kennsluleikur þar sem lið nemenda taka hagstjórnarákvarðanir og fá uppgjör úr RÁS-herminum, undir stjórn leikstjóra (kennara) |
| **Tengiliður persónuverndar** | Aron Heiðar Steinsson — [personuvernd@karp.is](mailto:personuvernd@karp.is) |
| **Útgáfa** | 0.9 — **DRÖG** |
| **Dagsetning** | 2. ágúst 2026 (rýnd og samræmd kóða 19. ágúst 2026) |
| **Endurskoðun eigi síðar en** | 2. ágúst 2027, eða strax við verulega breytingu á vinnslunni (t.d. ef leikjagögn verða tengd notandareikningum, ef yngri nemendum er hleypt að eða ef gervigreind kemur að uppgjöri/endurgjöf) |
| **Réttargrundvöllur matsins** | 35. gr. reglugerðar (ESB) 2016/679 (GDPR), sbr. lög nr. 90/2018 um persónuvernd og vinnslu persónuupplýsinga; 3. mgr. 28. gr. (f-liður) um aðstoð vinnsluaðila við mat ábyrgðaraðila |
| **Tengd skjöl** | `DPA-skolar-RAS-leikurinn.md` (skóla-DPA, drög) · `DPIA-fyrirtaekjaskyrslur-KYC.md` v1.0 (sniðmát og hugtök) · `logfraedi-yfirferd-2026-07/01-DPA-vinnslusamningur-Fyrirtaeki-plus.md` (samþykkt 26.7.2026) · karp.is/skilmalar/ (persónuverndarstefna + almennur DPA, 15. liður `#ras-leikurinn`) · karp.is/leikur/personuvernd/ (upplýsingasíða fyrir skóla) |

> **Fyrirvari og staða.** Þetta skjal er **drög** og hefur **ekki** verið yfirfarið af persónuverndarlögfræðingi (það var DPIA v1.0 og DPA compliance-varanna sem fengu yfirferð 26. júlí 2026 — ekki þetta skjal). Það fylgir sömu kaflaskipan og DPIA v1.0 og leiðbeiningum Persónuverndar og EDPB (WP248 rev.01). Tvö hlutverk blandast í leiknum: fyrir **leikjagögnin** (leikir, lið, ákvarðanir, uppgjör) er skólinn ábyrgðaraðili og Karp vinnsluaðili — þetta skjal er þá **DPIA-grunnur sem Karp afhendir skólum** svo þeir geti uppfyllt eigin matsskyldu (skóli getur tekið hann upp, bætt við eigin samhengi og skrifað undir); fyrir **Karp-reikninga** þátttakenda og kennara er Karp ábyrgðaraðili og skjalið er innra mat Karp. Allar tæknilegar fullyrðingar hér eru sannreyndar gegn kóða á dagsetningu rýni (töfluskema `web/migrations/0009_leikur.sql`, `src/lib/leikur/server.mjs`, `src/lib/leikur/client.mjs`, `web/worker.js`, `web/src/worker/auth.mjs`, `web/src/worker/cron.mjs`, `web/wrangler.toml`, `web/public/_headers`). Skjalið kemur ekki í stað lögfræðiráðgjafar. Opin lögfræðileg álitaefni eru talin í Viðauka D.

---

## 0. Samantekt og niðurstaða

RÁS-Leikurinn er kennsluleikur: kennari (leikstjóri) stofnar leik með 5 stafa leikkóða, nemendur ganga í **lið** undir liðsheiti sem þeir velja sjálfir, liðin taka tölulegar hagstjórnarákvarðanir í hverri umferð og þjónn Karp reiknar uppgjör (hagstærðir og stig) með RÁS-herminum. Leikjagögnin eru geymd í fjórum töflum (`leikur_games`, `leikur_teams`, `leikur_decisions`, `leikur_results`) sem **bera ekkert notandaauðkenni, netfang, nafn eða kennitölu** — engin þeirra vísar í notendaskrá Karp. **Eina sviðið sem getur borið persónuupplýsingar er liðsheitið** (frjáls texti, ≤40 stafir), ef þátttakendur skrifa þar eigin nöfn. Ákvarðanir og uppgjör eru bundin liðsnúmeri og eru persónuupplýsingar aðeins að því marki sem liðsheitið auðkennir þátttakendur.

Tvennt annað snertir persónuupplýsingar en er **utan leikjagagnanna**: (a) til að ganga í lið þarf þátttakandi **Karp-reikning** (netfang, PBKDF2-varið lykilorð) sem kerfisstjóri Karp hefur merkt sem nemanda-aðgang (`nemandi=1`) samkvæmt **þátttakendalista** (netföng) sem kennari sendir á hjalp@karp.is; (b) leikstjóra-leyfi kennara/skóla (kaup um Áskell) er viðskiptamannagögn Karp.

Vinnsla leikjagagna fer fram **í umboði skólans** sem ákveður tilganginn (kennslu) — skólinn er ábyrgðaraðili og Karp vinnsluaðili (28. gr.). Lagagrundvöllur skólans er að jafnaði **lögbundið hlutverk / almannahagsmunir** (e-liður 1. mgr. 6. gr. GDPR, sbr. 5. tölul. 9. gr. laga nr. 90/2018) eða, hjá einkareknum skólum, **lögmætir hagsmunir** (f-liður) — **ekki samþykki nemenda**, enda væri það hvorki frjálst né nauðsynlegt í kennslusamhengi. Karp byggir eigin vinnslu Karp-reikninga á samningi við notandann (b-liður) og persónuverndarstefnu sinni.

Meginmótvægisaðgerðir: **innbyggð gagnalágmörkun** (engin notandatenging í leikjatöflum), **varðveislutakmörkun** (vikuleg sjálfvirk grisjun — loknir leikir 90 dögum frá stofnun, ólokið/yfirgefið 180 dögum — og „Eyða leik núna" fyrir leikstjóra), **leiðbeining um hlutlaus liðsheiti** (leikstjóri sér heitin í lobby áður en leikur hefst), **HMAC-undirrituð tákn** bundin einum leik, **ekkert LLM/engin utanaðkomandi gervigreindarveita** í uppgjöri og **bann við endurnýtingu** í eigin þágu Karp.

**Niðurstaða (drög):** Að teknu tilliti til mótvægisaðgerða er **eftirstæð áhætta á réttindi og frelsi skráðra einstaklinga metin LÁG.** Vinnslan er lítil að umfangi, án viðkvæmra upplýsinga, án prófílgerðar og án sjálfvirkrar ákvarðanatöku um einstaklinga; engin einkunnagjöf fer fram í kerfinu. Formleg matsskylda skv. 35. gr. er ekki talin virk (aðeins eitt WP248-viðmið — **börn sem viðkvæmir skráðir**, nemendur 13–17 ára í framhaldsskóla — á við, og tvö viðmið þarf að jafnaði til), en matið er gert engu að síður í þágu ábyrgðarskyldu og til að skólar geti stuðst við það. Fyrirfram samráð við Persónuvernd skv. 36. gr. er ekki talið skylt. Forsenda niðurstöðunnar er að varðveislureglurnar (4. kafli, M2) séu komnar í rekstur og að skóli hafi undirritað skóla-DPA (eða almenni DPA gildi á meðan).

---

## 1. Kerfisbundin lýsing á vinnslunni

### 1.1 Ábyrgðaraðili og hlutverk

Tvö aðgreind hlutverk:

| Vinnsla | Ábyrgðaraðili | Vinnsluaðili | Athugasemd |
|---|---|---|---|
| **A. Leikjagögn** — leikir, lið (liðsheiti), ákvarðanir, uppgjör; stjórn leiks; eyðing | **Skólinn** (ákveður tilgang: kennslu; hverjir taka þátt; hvernig lið eru nefnd; hvenær leik er eytt) | **Steinsson Greykdal ehf. (Karp)** skv. 28. gr. | Skóla-DPA (drög) · þar til hann er undirritaður gildir almenni DPA á karp.is/skilmalar/ |
| **B. Þátttakendalisti** — netföng (og eftir atvikum nöfn) sem kennari sendir á hjalp@karp.is til að virkja nemanda-aðgang | **Skólinn** | **Karp** | Listinn er unninn í umboði skóla; eyðing úr pósthólfi þegar merkingu er lokið (sjá 2.4) |
| **C. Karp-reikningur þátttakanda/kennara** — netfang, lykilorðs-hash, staðfesting netfangs, réttindaflögg (`nemandi`, `free_access`, `is_admin`), leikstjóra-leyfi | **Karp** (notandinn stofnar reikninginn sjálfur; persónuverndarstefna Karp) | Cloudflare, Google (Gmail) | Nemanda-flaggið sjálft: **opið álitaefni** hvort það sé hluti af C (Karp ábyrgðaraðili) eða B (umboð skóla) — sjá Viðauka D, §1 |
| **D. Hermi-líkanið (RÁS)** — þjóðhagstölur úr opinberum gögnum | — | — | Engar persónuupplýsingar |

Karp ákveður **aðferðir** vinnslu A að verulegu leyti (töfluskema, táknakerfi, varðveislureglur) en ekki **tilganginn**; það eitt gerir Karp ekki að (sameiginlegum) ábyrgðaraðila svo lengi sem aðferðirnar eru „ónauðsynlegar" tæknilegar útfærslur í þágu tilgangs skólans (sbr. EDPB Guidelines 07/2020, mgr. 40). Staðfesting þessa er lögfræðilegt álitaefni (Viðauki D, §1).

### 1.2 Eðli, umfang, samhengi og tilgangur

**Tilgangur (skólans).** Kennsla í hagstjórn og þjóðhagfræði með hermileik: nemendur upplifa afleiðingar stefnuákvarðana (stýrivextir, skattar, útgjöld, stórar ákvarðanir) á hagstærðir Íslands 2000–2032 og ræða niðurstöðurnar. Leikurinn metur **lið**, ekki einstaklinga; engin einkunnagjöf fer fram í kerfinu og leikjagögn eru ekki tengd nemendaskrá.

**Eðli vinnslunnar (hvað kerfið gerir).**
1. Leikstjóri (kennari) stofnar leik → 5 stafa slembikóði + stillingar (`leikur_games.config`: umferðafjöldi, hamur, klukka, erfiðleikastig, hlutverk, óvænt atvik, æfingalið). Leikstjóri fær **HMAC-undirritað leikstjóratákn** `{code, role:'fac'}` sem vistast í vafra hans (`localStorage`), ekki í gagnagrunni.
2. Þátttakandi (innskráður Karp-reikningur með `nemandi=1`, eða leikstjóri/kerfisstjóri) slær inn kóða og **liðsheiti** → röð í `leikur_teams` (id, game_code, name, joined) + **liðstákn** `{code, role:'team', teamId}` í vafra. Eitt tæki per lið dugar.
3. Lið sendir ákvarðanir (JSON, tölulegar) → `leikur_decisions`; leikstjóri keyrir uppgjör → `leikur_results` (kpis-JSON, stig). Uppgjörið er reiknað með **determinískum hermi á þjóni Karp** (`engine.mjs`/`resolve.mjs`) — **ekkert LLM, engin utanaðkomandi gervigreindarveita** kemur að uppgjöri, atvikum, verðlaunum eða endurgjöf leiksins.
4. Staða leiks (`GET /api/leikur/<kóði>/state`) er sýnd þremur sýnum: lið (eigið umboð/hlutverk, eigin drög), leikstjóri (roster, greining allra liða, hlutverk allra) og **áhorfenda-sýn** (`?watch=1`, skjávarpi) sem krefst engrar innskráningar — allir með leikkóðann sjá liðsheiti, stig, KPI-ferla, Íslandskort liðanna, stóru ákvarðanir liðanna (merki), klemmu-val og í leikslok (stjórnstöðvar-ham) pólitíska ásinn (afleidd staða, ekki hrá sleðagildi).
5. Eyðing: vikuleg sjálfvirk grisjun + „Eyða leik núna" (leikstjóri) + beiðni til Karp (sjá 2.4).

**Umfang.** Lítið og afmarkað: einn leikur = einn kennsluhópur (mælt með 2–8 liðum); leikur stendur að jafnaði innan einnar kennslustundar eða vinnustofu. Engin samkeyrsla milli leikja, engin söfnun yfir tíma um einstaklinga, engin prófílgerð.

**Samhengi.** Skólar á framhalds-, háskóla- og símenntunarstigi. Á framhaldsskólastigi geta þátttakendur verið **13–17 ára** (börn í skilningi persónuverndarlaga) — sjá 2.1 og 3. kafla. Leikurinn er ekki ætlaður grunnskólastigi og Karp er ekki ætlað börnum yngri en 13 ára (11. liður persónuverndarstefnu Karp).

### 1.3 Flokkar persónuupplýsinga og skráðra einstaklinga

| Flokkur skráðra | Persónuupplýsingar sem unnar eru | Hvar | Hlutverk Karp | Birt hverjum? |
|---|---|---|---|---|
| Nemendur/þátttakendur í liði | **Liðsheiti** (frjáls texti ≤40 stafir) — getur innihaldið nöfn ef þátttakendur skrifa þau; ákvarðanir og uppgjör liðsins (persónuupplýsingar aðeins að því marki sem liðsheitið auðkennir) | `leikur_teams.name`; `leikur_decisions`, `leikur_results` (lykluð á liðsnúmer) | Vinnsluaðili (A) | Liðsheiti + stig: öllum með leikkóðann (áhorfenda-sýn) · ákvarðanir í smáatriðum: leikstjóra (og liðinu sjálfu) |
| Nemendur/þátttakendur | Netfang (og eftir atvikum nafn) á þátttakendalista | Pósthólf hjalp@karp.is (Gmail) | Vinnsluaðili (B) | Kerfisstjóra Karp einum |
| Nemendur/þátttakendur og kennarar | Karp-reikningur: netfang, lykilorðs-hash (PBKDF2-SHA-256, salt), staðfesting netfangs, `nemandi`/`free_access`/`is_admin`, stofnunartími; lotukaka `karp_session` | `users`-tafla (D1) | Ábyrgðaraðili (C) | Engum nema notandanum sjálfum og kerfisstjóra Karp |
| Kennarar (leikstjórar) | Leikstjóra-leyfi (þjónustu-réttindi á reikningi, kaup um Áskell); leikkóðar leikja sem þeir stofna (í vafra) | `users`/réttindatöflur Karp; Áskell | Ábyrgðaraðili (C) | — |

**Ekki unnið:** kennitölur nemenda, einkunnir, bekkjarlistar, nemendanúmer, skóli/bekkur í leikjagögnum, IP-tölur í leikjagögnum, nein tenging leiks/liðs/ákvörðunar við Karp-reikning (`leikur_*`-töflurnar hafa **ekkert** `user_id`-svið og engin þeirra vísar í `users`). Engar viðkvæmar upplýsingar skv. 9. gr. eru unnar sem slíkar. Sjá nákvæma reita-töflu í Viðauka 1 skóla-DPA.

### 1.4 Uppruni gagna
- Liðsheiti, ákvarðanir: **frá þátttakendum sjálfum** í leiknum.
- Þátttakendalisti: **frá skólanum/kennara** (tölvupóstur).
- Karp-reikningur: **frá notandanum sjálfum** við nýskráningu (netfang staðfest með pósti).
- Uppgjör: **reiknað** af hermi úr ákvörðunum + opinberum þjóðhagsgögnum (engin persónugögn).

### 1.5 Viðtakendur, miðlun og flutningur
- **Viðtakendur leikjagagna:** leikstjóri (fac-tákn), liðin (liðstákn — eigin gögn + opinbera hlutann) og **hver sá sem hefur leikkóðann** (áhorfenda-sýn: liðsheiti, stig, KPI-ferlar, kort, stóru ákvarðanir, klemmu-val; ekki hrá sleðagildi, ekki umboð/hlutverk fyrr en leik lýkur). Liðsheiti birtast því á skjávarpa og hverjum sem fær kóðann — þess vegna er hlutlaust liðsheiti lykil-mótvægi.
- **Miðlun:** Karp selur ekki, miðlar ekki og notar ekki leikjagögn í aðrar vörur (fréttavél, tengslanet, markaðssetningu, þjálfun líkana). Samandregnar nafnlausar notkunartölur (fjöldi leikja/liða/umferða) teljast ekki persónuupplýsingar.
- **Flutningur út fyrir EES:** Enginn ásetningur um flutning. Undirvinnsluaðilar (1.6) **kunna** að vinna gögn utan EES; slíkur flutningur styðst við viðeigandi verndarráðstafanir skv. V. kafla GDPR (SCC og/eða gildandi fullnægjandiákvörðun). **Athugið:** engin svæðisbinding (jurisdiction/placement) er stillt á D1-gagnagrunninn í `wrangler.toml` — því er **ekki fullyrt** að gögnin séu eingöngu geymd innan EES; sjá Viðauka D, §6.

### 1.6 Vinnsluaðilar og undirvinnsluaðilar

| Aðili | Hlutverk | Gögn | Ábyrgð |
|---|---|---|---|
| Cloudflare, Inc. | Hýsing (Workers), gagnagrunnur (D1: `leikur_*` og `users`), static-eignir | Öll leikjagögn, notendaskrá | Undirvinnsluaðili (A/B) og vinnsluaðili (C) — DPA Cloudflare |
| Google LLC / Google Ireland Ltd. | Gmail: móttaka þátttakendalista á hjalp@karp.is; sending staðfestingar-/endurstillingarpósts Karp-reikninga (Gmail API) | Netföng þátttakenda, efni pósts | Undirvinnsluaðili (B) og vinnsluaðili (C) |
| Áskell (askell.is) | Greiðslumiðlun leikstjóra-leyfis | Gögn kaupanda (kennara/skóla) — ekki nemenda | Utan vinnslu A/B; Karp ábyrgðaraðili eigin viðskiptamannagagna |

**Ekki notað í leiknum:** utanaðkomandi gervigreindarveitur (Anthropic o.fl.), greiningartól þriðja aðila, rakningarkökur.

### 1.7 Tæknileg útfærsla (innbyggð persónuvernd)
- **Engin notandatenging í leikjatöflum:** `leikur_teams` geymir aðeins `id, game_code, name, joined`; `/join` skrifar aldrei `uid`/netfang (sannreynt í `server.mjs`). Notandinn er auðkenndur í einni beiðni (join) til að gáta nemanda-flaggið og ekkert af því er skrifað með liðinu.
- **HMAC-undirrituð tákn** (HMAC-SHA-256 með leyniorði þjóns): liðstákn veitir aðeins aðgang að eigin liði í einum leik; leikstjóratákn aðeins að eigin leik. Tákn eru geymd í vafra (`localStorage`), ekki í D1.
- **Aðgangsgátt:** stofnun leiks aðeins fyrir handhafa leikstjóra-leyfis (kerfisstjóri, frí-aðgangur eða virk „leikur"-þjónustuáskrift); innganga í lið aðeins innskráðum notanda með nemanda-merkingu, kerfisstjóra eða leikstjóra; nemanda-merking sett af kerfisstjóra einum (`POST /api/admin/set-type`).
- **Lykilorð PBKDF2-SHA-256 með salti**; lotukaka `karp_session` undirrituð, `HttpOnly; Secure; SameSite=Lax; Domain=.karp.is`; engin lota ef leyniorð þjóns vantar (fail-closed).
- **Varðveislutakmörkun í kóða:** `leikurPruneOld` (vikul. cron mánud. 08:10 UTC) eyðir loknum leikjum >90 d frá stofnun og ólokið/yfirgefið >180 d frá stofnun, í einni D1-færslu per leik (uppgjör → ákvarðanir → lið → leikur); `POST /api/leikur/<kóði>/erase` (leikstjóratákn) eyðir einum leik strax (aðeins í biðstöðu eða loknum; leikur í gangi → 409, leikstjóri stöðvar hann fyrst); „🗑️ Eyða leik núna"-hnappur í leikstjóra-sýn í lobby og í leikslok.
- **Uppgjör á þjóni** með determinískum hermi — stig ófölsuð, ekkert LLM.
- **Öryggishausar** á static-síðum (`_headers`): HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; CSP á dagsetningu draga í **Report-Only**-ham (`frame-ancestors 'self'; object-src 'none'` o.fl.). Leikja-viðmótið notar enga inline-atburðahandlara í HTML.
- **Engin hraðatakmörkun** er sérstaklega á `/api/leikur/*` (sjá R2 í 3. kafla).

---

## 2. Nauðsyn og meðalhóf

### 2.1 Lagagrundvöllur og hagsmunamat

**Vinnsla A og B (skólinn ábyrgðaraðili).** Lagagrundvöllur er skólans. Að mati Karp er hann að jafnaði:
- **Opinberir skólar:** e-liður 1. mgr. 6. gr. GDPR (verkefni í þágu almannahagsmuna / opinbert vald), sbr. 5. tölul. 9. gr. laga nr. 90/2018, með stoð í lögbundnu hlutverki skólans — lög nr. 92/2008 um framhaldsskóla, lög nr. 63/2006 um háskóla, lög nr. 27/2010 um framhaldsfræðslu (sjá Viðauka B).
- **Einkareknir skólar / símenntun:** f-liður (lögmætir hagsmunir), sbr. 6. tölul. 9. gr. laga nr. 90/2018, eða b-liður (samningur um nám).
- **Ekki samþykki nemenda** (a-liður): í kennslusamhengi er valdaójafnvægi milli skóla og nemanda og þátttaka er hluti af námi; samþykki væri hvorki frjálst né „nauðsynlegt" (sbr. EDPB Guidelines 05/2020). Þar af leiðir að **8. gr. GDPR / 10. gr. laga nr. 90/2018 (13 ára mörk samþykkis barns við þjónustu í upplýsingasamfélaginu) kemur ekki til beinnar beitingar** hjá skólanum — en Karp heldur 13 ára lágmarki eigin þjónustu (11. liður persónuverndarstefnu) og skóla-DPA lætur skólann ábyrgjast það. **Staðfesting lögfræðings óskast** (Viðauki D, §2–§3).

Skólinn ábyrgist heimildina í 5. gr. skóla-DPA; Karp byggir sem vinnsluaðili á skjalfestum fyrirmælum hans (notkun leiksins = fyrirmælin).

**Vinnsla C (Karp ábyrgðaraðili).** Karp-reikningur: b-liður (samningur við notanda sem stofnar reikning sjálfur) og lögmætir hagsmunir af öryggi aðgangs (f-liður). Nemanda-flaggið: á meðan álitaefni §1 er opið er það meðhöndlað sem **réttindaflagg Karp-reiknings sett að beiðni skóla** — gagnalágmarkað (eitt bit), afturkallanlegt, hefur engin áhrif önnur en að opna inngöngu í lið.

**Nauðsynjaprófið.** Leikinn má ekki reka án (i) auðkennis á lið (liðsheiti/liðsnúmer) svo uppgjör og stigatafla virki, (ii) ákvarðana og uppgjörs, (iii) einhverrar gáttar sem hindrar að hver sem er gangi í leik skóla — nemanda-flaggið er lágmarks-útfærsla þess. Hægt væri að nota **eingöngu liðsnúmer** (engin frjáls heiti); það var ekki valið af kennslufræðilegum ástæðum (liðsheiti skapar samkennd og umræðu), en mótvægi er leiðbeining um hlutlaus heiti + 40 stafa mörk + stutt varðveisla. **Opið val fyrir skóla:** skóli getur fyrirskipað að lið noti aðeins númer/hlutlaus heiti (fyrirmæli skv. 5. gr. DPA).

**Vægisprófið (f. f-lið).** Hagsmunir skólans af virkri, gagnvirkri kennslu vega þyngra en takmörkuð inngrip í einkalíf nemenda: gögnin eru leikjaákvarðanir bundnar liði, sýnileg í kennslustofu hvort eð er, geymd stutt og án tengingar við nemandann nema hann kjósi sjálfur að nefna liðið eftir sér.

### 2.2 Gagnalágmörkun og meðalhóf
- Ekkert notandaauðkenni, netfang, nafn eða kennitala í leikjatöflum; leikkóði er slembinn og ekki leiðanlegur af skóla eða notanda.
- Eina frjálsa textasviðið (liðsheiti) ≤40 stafir; engin önnur frjáls textainnsláttarsvið í leiknum (ákvarðanir eru tölur/val).
- Nemanda-flaggið er eitt bit; þátttakendalisti er eingöngu netföng.
- Einn maður per lið þarf Karp-reikning (eitt tæki per lið) — færri reikningar en nemendur.
- Engin IP-skráning, engin vefmæling þriðja aðila, engar rakningarkökur í leiknum.

### 2.3 Nákvæmni
Leikjagögnin eru ákvarðanir liðanna sjálfra og reiknað uppgjör úr þeim — þau eru „rétt" per skilgreiningu. Liðsheiti getur leikstjóri látið breyta (Karp handvirkt í gagnagrunni að beiðni) eða eytt leik og stofnað nýjan. Uppgjörið er merkt sem hermi-niðurstaða (kennslutól), ekki mat á einstaklingum.

### 2.4 Varðveislutakmörkun

| Gögn | Regla | Útfærsla |
|---|---|---|
| Loknir leikir (`phase='ended'`) | Eytt **90 dögum frá stofnun** (vikuleg grisjun → allt að 7 daga seinkun) | `leikurPruneOld`, cron `10 8 * * 1` |
| Ólokið/yfirgefið (lobby/decide/resolved) | Eytt **180 dögum frá stofnun**; leikur yngri en 180 d er **aldrei** snertur | sama |
| Einstakur leikur að beiðni leikstjóra | Strax, allt tengt (lið, ákvarðanir, uppgjör) í einni færslu | `POST /<kóði>/erase` + hnappur; aðeins lobby/ended |
| Allir leikir skóla / þátttakendalisti | Að beiðni skóla til personuvernd@karp.is | Handvirkt (kerfisstjóri) — ekkert „skóla"-svið er í leikjatöflum, svo skóli tilgreinir leikkóða/kennara |
| Þátttakendalisti í pósthólfi | Eytt þegar merkingu er lokið og eigi síðar en 90 dögum eftir móttöku | Skipulagsleg ráðstöfun (Gmail) — **ekki sjálfvirk** |
| Karp-reikningur | Á meðan reikningur er virkur; eyðing að beiðni notanda á hjalp@karp.is | Persónuverndarstefna Karp; handvirk afgreiðsla |
| Vafra-gögn (tákn, séð-flögg) | Í vafra þátttakanda/leikstjóra; hreinsast við „Eyða leik núna" í þeim vafra | `localStorage` |

**Athugasemd um stöðu:** fram að þessum drögum var **engin** eyðingarregla — leikjagögn lifðu ótímabundið í D1. Reglurnar hér að ofan eru í kóða á rýndagsetningu (prófaðar í `server.test.mjs`) og taka gildi við deploy; fyrsta keyrsla grisjunar eyðir þá uppsöfnuðum eldri leikjum.

### 2.5 Réttindi skráðra
- **Leikjagögn (A):** réttindi nemenda (aðgangur, leiðrétting, eyðing, andmæli) eru gagnvart **skólanum**; Karp aðstoðar (9. gr. DPA) og framsendir beiðnir sem berast beint. Þar sem gögnin eru **ekki lykluð á einstakling** er aðgangs-/eyðingarbeiðni afgreidd með því að finna leikinn (kóða) og liðið — að jafnaði með atbeina kennara — og eyða leiknum eða nafnleysa liðsheitið. Takmörkun: Karp getur ekki sjálfstætt fundið „öll gögn um nemanda X" (það er kosturinn við gagnalágmörkunina og um leið takmörkun á 15. gr.-svari).
- **Karp-reikningur (C):** réttindi gagnvart Karp — beiðnir á hjalp@karp.is, afgreiddar innan lögbundins frests (að jafnaði mánaðar). Kvörtunarréttur til Persónuverndar.

### 2.6 Gagnsæi
- **Skólinn** sinnir upplýsingaskyldu gagnvart nemendum skv. 13. gr. (gögn fengin frá hinum skráða) — skóla-DPA 5. gr. Karp leggur til efni: upplýsingasíðu **karp.is/leikur/personuvernd/** (hvað er geymt, hver sér hvað, eyðing, hlutverk), FAQ á karp.is/leikur/leikstjori/ og 15. lið DPA-hluta skilmálasíðu.
- **Karp** sinnir upplýsingaskyldu um Karp-reikninga með persónuverndarstefnu á karp.is/skilmalar/.
- Í leiknum sjálfum: inngönguskjár gefur til kynna að liðsheiti birtist á stigatöflu/skjávarpa (ráðlegging um hlutlaus heiti — sjá M3).

---

## 3. Áhættumat

Áhætta er metin fyrir **réttindi og frelsi skráðra einstaklinga** (fyrst og fremst nemenda). Kvarði: Líkur (Lágar/Miðlungs/Háar) × Alvarleiki (Lágur/Miðlungs/Hár).

| # | Áhætta | Líkur | Alvarleiki | Heildar (fyrir mótvægi) |
|---|---|---|---|---|
| R1 | **Nöfn í liðsheiti** — þátttakendur skrifa eigin nöfn (eða annarra) í liðsheiti; heitið birtist á stigatöflu/skjávarpa og er sýnilegt hverjum sem hefur leikkóðann; varðveitt í D1 | Miðlungs | Lágur (nafn + leikjaárangur liðs í kennslustofu-samhengi; ekki viðkvæmt) | **Lágt–Miðlungs** |
| R2 | **Leikkóði lekur / er giskaður** — áhorfenda-sýn krefst engrar innskráningar; engin hraðatakmörkun á `/state`; 5 stafa kóði úr 32 stafa mengi (~33,5 M möguleikar) | Lágar | Lágur (sér aðeins liðsheiti, stig, KPI-ferla, stóru ákvarðanir; engin önnur persónugögn) | **Lágt** |
| R3 | **Þátttakendalisti í pósthólfi** — netföng nemenda liggja í Gmail-pósthólfi hjalp@karp.is lengur en þarf; ekki sjálfvirk eyðing | Miðlungs | Lágur–Miðlungs (netföng barna) | **Miðlungs** |
| R4 | **Karp-reikningur barns (13–17 ára)** — nemandi stofnar reikning með einkanetfangi; reikningurinn lifir eftir að kennslu lýkur; Karp-póstar (staðfesting) fara á netfangið | Miðlungs | Lágur (netfang + lykilorðs-hash; engin önnur gögn; engin markaðssetning án vals) | **Lágt–Miðlungs** |
| R5 | **Ótakmörkuð varðveisla** — leikjagögn (þ.m.t. liðsheiti) lifa að eilífu | (Há án mótvægis) | Lágur | **Miðlungs** → lagað með M2 |
| R6 | **Endurnýting í öðrum tilgangi** — Karp notar leikjagögn í eigin vörur/markaðssetningu, eða selur | Lágar | Miðlungs | **Lágt** |
| R7 | **Óheimill aðgangur** — tákn (fac/lið) lekur úr vafra; fac-tákn gefur stjórn á leik þ.m.t. „Eyða núna"; kerfisstjóri/Cloudflare-aðgangur að D1 | Lágar | Lágur (eitt leikja-mengi; engin persónugögn utan liðsheita) | **Lágt** |
| R8 | **Röng hlutverkagreining** — Karp reynist (sameiginlegur) ábyrgðaraðili leikjagagna eða nemanda-flagg telst umboðsvinnsla; samningsgrunnur þá ófullnægjandi | Miðlungs (lögfræðileg óvissa) | Miðlungs (formleg) | **Miðlungs** → Viðauki D |
| R9 | **Kennari notar leikinn án vitundar skóla** — einstaklingur kaupir leikstjóra-leyfi og keyrir leik með nemendum án þess að skóli (ábyrgðaraðili) hafi gert DPA eða sinnt 13. gr. | Miðlungs | Lágur–Miðlungs | **Miðlungs** |
| R10 | **Brestur hjá undirvinnsluaðila / flutningur út fyrir EES** — D1 ekki svæðisbundið; gögn kunna að vera geymd utan EES | Lágar | Lágur (lágmörkuð gögn) | **Lágt** |

---

## 4. Mótvægisaðgerðir og eftirstæð áhætta

| # | Mótvægisaðgerð(ir) | Staða | Eftirstæð áhætta |
|---|---|---|---|
| R1 | **M3 Hlutlaus liðsheiti:** leiðbeining til leikstjóra (FAQ, personuvernd-síða, skóla-DPA 5. gr.) og inngönguskjár; leikstjóri sér heitin í lobby og getur beðið um breytingu áður en leikur hefst; 40 stafa mörk; **M2** stutt varðveisla; „Eyða núna" í leikslok; vísvitandi **engin sjálfvirk nafna-sía** (brothætt og falskt öryggi — skjalfest í kóða) | Innleitt (leiðbeining) · M2 í kóða | **Lág** |
| R2 | Slembinn 5 stafa kóði; leikur lifir stutt (klst.–dagar); áhorfenda-sýn sýnir aðeins það sem birtist hvort eð er á skjávarpa; leikstjóri getur eytt leik strax eftir kennslu. **Tillaga:** hraðatakmörkun á `/api/leikur/*/state` (ekki innleidd) | Að hluta | **Lág** |
| R3 | **M4 Skipulagsregla:** listi eyddur úr pósthólfi þegar merkingu er lokið og eigi síðar en 90 d; mælt með skóla-netföngum; aðeins netföng (engin nöfn/kt óskað). **Tillaga:** sjálfsafgreiðslu-virkjun með skóla-léni eða kóða svo listinn þurfi ekki að fara um tölvupóst | Skipulagsleg (ekki sjálfvirk) | **Lág** að því gefnu að reglunni sé fylgt |
| R4 | 13 ára lágmark (11. liður); mælt með skóla-netfangi; eitt tæki per lið (færri reikningar); engin markaðspóstur án vals; eyðing reiknings að beiðni. **Tillaga:** sjálfvirk eyðing óvirkra nemanda-reikninga (t.d. 12 mán. eftir síðustu innskráningu) og/eða afturköllun nemanda-flaggs eftir skólaár | Að hluta (handvirkt) | **Lág–Miðlungs** |
| R5 | **M2 Varðveislureglur:** `leikurPruneOld` (90 d loknir / 180 d ólokið, vikul.) + `POST /erase` + hnappur — prófað (`server.test.mjs`), í þessum kóða; tekur gildi við deploy | Í kóða, bíður deploy/staðfestingar í rekstri | **Lág** |
| R6 | Skóla-DPA 4. gr. bannar endurnýtingu/sölu/miðlun; 15. liður almenna DPA; engin tengsl leikjatafla við aðrar vörur; aðeins nafnlausar samtölur | Innleitt (samningslega + tæknilega) | **Lág** |
| R7 | HMAC-undirrituð tákn bundin einum leik og hlutverki; tákn ekki í D1; erase aðeins í lobby/ended og með staðfestingu; D1 aðeins aðgengilegt úr worker Karp + stjórnborði Cloudflare (kerfisstjóri); trúnaður kerfisstjóra | Innleitt | **Lág** |
| R8 | Skýr hlutverkaskipting í skóla-DPA (1. gr., Viðauki 1); álitaefni borin undir lögfræðing áður en samningar eru undirritaðir (Viðauki D) | Opið — lögfræði | **Miðlungs → Lág** eftir álit |
| R9 | Leikstjóra-síða og personuvernd-síða beina kennara á að skólinn geri DPA; almenni DPA gildir þar til skóla-DPA er undirritaður; kennari í umboði skóla = skólinn ábyrgðaraðili engu að síður. **Tillaga:** gátreitur við stofnun leiks „ég nota leikinn í umboði skóla sem hefur kynnt sér karp.is/leikur/personuvernd/" | Að hluta | **Lág–Miðlungs** |
| R10 | Lágmörkuð gögn; DPA Cloudflare/Google + SCC/DPF; tilkynning brests til skóla ≤48 klst. (10. gr. DPA). **Tillaga:** skoða `jurisdiction = "eu"` á D1 ef Cloudflare býður það fyrir grunninn | Að hluta | **Lág** |

**Sérstaklega um börn (13–17 ára):** Þar sem nemendur geta verið börn er lögð áhersla á (i) að vinnslan sé í kennslusamhengi undir ábyrgð skóla, (ii) lágmörkun (ekkert umfram liðsheiti), (iii) einfalt, skiljanlegt gagnsæi (personuvernd-síðan er skrifuð til að svara á þremur mínútum) og (iv) að engin prófílgerð, einkunnagjöf eða markaðssetning fylgi. Skólinn ber ábyrgð á að upplýsa nemendur (og eftir atvikum forráðamenn) skv. eigin verklagi.

---

## 5. Niðurstaða, ábyrgð og endurskoðun

**Niðurstaða (drög).** Að innleiddum mótvægisaðgerðum M2–M4 og skýrri hlutverkaskiptingu í skóla-DPA er eftirstæð áhætta á réttindi og frelsi skráðra metin **LÁG**. Vinnslan er heimil skólum á grundvelli lögbundins hlutverks/almannahagsmuna (eða lögmætra hagsmuna) og Karp sem vinnsluaðila á grundvelli samnings. Fyrirfram samráð við Persónuvernd skv. 36. gr. er ekki talið skylt. Skjalið er drög þar til persónuverndarlögfræðingur hefur yfirfarið það og Viðauka D.

**Forsendur niðurstöðunnar (blokkerandi):**
1. Varðveislureglur (M2) komnar í rekstur og staðfestar (fyrsta grisjun logguð í `wrangler tail`).
2. Skóli hefur undirritað skóla-DPA — eða almenni DPA gildir á meðan og skólinn hefur verið upplýstur um það.
3. Álitaefni Viðauka D §1–§3 útkljáð áður en leikurinn er markaðssettur sérstaklega til skóla sem „með vinnslusamningi".

**Persónuverndarfulltrúi.** Sjá DPIA v1.0, 5. kafla — tengiliður persónuverndar er tilnefndur; skólar hafa að jafnaði eigin persónuverndarfulltrúa (opinberir aðilar, 37. gr.) sem er viðtakandi þessa skjals.

**Skjöl sem halda skal samhliða:** vinnsluskrá (30. gr.) með færslu fyrir „RÁS-Leikurinn í skólum (vinnsluaðili)" og „Karp-reikningar nemenda"; skóla-DPA; skrá yfir undirritaða skóla; skrá yfir þátttakendalista (móttaka/eyðing); verklag um beiðnir skráðra og öryggisbrest (48 klst. til skóla).

| Hlutverk | Nafn | Dagsetning |
|---|---|---|
| F.h. vinnsluaðila (Steinsson Greykdal ehf.) | Aron Heiðar Steinsson | _(við útgáfu 1.0)_ |
| Tengiliður persónuverndar | Aron Heiðar Steinsson | _(við útgáfu 1.0)_ |
| Yfirferð persónuverndarlögfræðings | _(bíður)_ | |
| Ábyrgðaraðili (skóli) sem tekur matið upp | _(fyllt út af skóla)_ | |

---

## Viðauki A — Gátlisti EDPB (WP248) uppfylltur
- [x] Kerfisbundin lýsing vinnslunnar (1. kafli) — hlutverk, gögn, flæði, viðtakendur, undirvinnsluaðilar, tækni
- [x] Tilgangur og lagagrundvöllur (1.2, 2.1) — skólans og Karp
- [x] Nauðsyn og meðalhóf (2. kafli) — þ.m.t. val á liðsheiti vs. liðsnúmer
- [x] Mat á áhættu fyrir réttindi skráðra (3. kafli) — með sérstöku tilliti til barna
- [x] Fyrirhugaðar mótvægisaðgerðir (4. kafli) — staða hverrar (innleitt / í kóða / skipulagsleg / tillaga)
- [x] Aðkoma tengiliðar persónuverndar (5. kafli)
- [x] Réttindi og gagnsæi skráðra (2.5, 2.6)
- [x] Endurskoðunardagsetning (haus)
- [ ] Yfirferð persónuverndarlögfræðings (bíður)
- [ ] Sjónarmið skráðra/fulltrúa þeirra (35. gr. 9. mgr.): **ekki aflað** — tillaga: stutt könnun meðal kennara/nemenda í prufuskólum fyrir útgáfu 1.0

## Viðauki B — Lagastoð skóla og tilvísanir
| Atriði | Tilvísun |
|---|---|
| Lögbundið hlutverk framhaldsskóla | Lög nr. 92/2008 um framhaldsskóla |
| Lögbundið hlutverk háskóla | Lög nr. 63/2006 um háskóla |
| Framhaldsfræðsla / símenntun | Lög nr. 27/2010 um framhaldsfræðslu |
| Heimild vinnslu: almannahagsmunir / lögmætir hagsmunir | 6. gr. 1. mgr. e-/f-liður GDPR; 9. gr. laga nr. 90/2018 (5./6. tölul.) |
| Börn og þjónusta í upplýsingasamfélaginu | 8. gr. GDPR; 10. gr. laga nr. 90/2018 (13 ára) — *gildir um samþykki; á ekki beint við þegar heimild er e-/f-liður, sjá Viðauka D §3* |
| Vinnsluaðili | 28. gr. GDPR; 25. gr. laga nr. 90/2018 |
| Öryggi vinnslu | 32. gr. GDPR; 27. gr. laga nr. 90/2018 |
| Tilkynning öryggisbrests | 33.–34. gr. GDPR |
| Mat á áhrifum og forsamráð | 35.–36. gr. GDPR; 29.–30. gr. laga nr. 90/2018 |
| Upplýsingaskylda | 13. gr. GDPR (gögn frá hinum skráða) |
| Flutningur út fyrir EES | V. kafli GDPR (SCC; fullnægjandiákvarðanir, t.d. EU-US DPF) |

*Greinanúmer laga nr. 90/2018 (25., 27., 29.–30. gr.) eru sett fram með fyrirvara — staðfestist við lögfræðiyfirferð.*

## Viðauki C — Það sem vinnslan gerir EKKI
- Tengir **ekki** leik, lið, ákvörðun eða uppgjör við Karp-reikning þátttakanda (ekkert `user_id` í `leikur_*`).
- Skráir **ekki** nöfn, kennitölur, einkunnir, bekkjarlista eða nemendanúmer í leikjagögn.
- Metur **ekki** árangur einstakra nemenda og miðlar **engu** til einkunnagjafar; engin prófílgerð, engin sjálfvirk ákvarðanataka um einstaklinga (22. gr.).
- Notar **ekki** utanaðkomandi gervigreindarveitur í uppgjöri, atvikum, verðlaunum eða endurgjöf leiksins — determinískur hermir á þjóni Karp.
- Sendir **engan** tölvupóst úr leiknum sjálfum (aðeins Karp-reikningspóstar: staðfesting/endurstilling).
- Notar leikjagögn **ekki** í aðrar vörur Karp, markaðssetningu eða þjálfun líkana; selur þau ekki.
- Skráir **ekki** IP-tölur eða tækjaauðkenni í leikjagögn; engar rakningarkökur.
- Síar **ekki** sjálfvirkt nöfn úr liðsheiti (meðvitað — sjá R1).

## Viðauki D — Opin lögfræðileg álitaefni (til persónuverndarlögfræðings)

Snið eins og `DPIA-vidbot-1-logfraedispurningar.md`: Samhengi · Spurning · Afstaða draganna · Hvað ræðst af svarinu.

### §1 — Hlutverk: vinnsluaðili vs. (sameiginlegur) ábyrgðaraðili; nemanda-flaggið
**Samhengi.** Karp ákveður aðferðir (skema, tákn, varðveislu) en skólinn tilganginn. Nemanda-flaggið `nemandi=1` er sett á Karp-reikning (sem Karp er ábyrgðaraðili að) **að beiðni skóla** samkvæmt þátttakendalista.
**Spurning.** (a) Er Karp hreinn vinnsluaðili leikjagagna (28. gr.) eða sameiginlegur ábyrgðaraðili (26. gr.)? (b) Er nemanda-flaggið vinnsla í umboði skóla (B) eða hluti af Karp-reikningi (C)? (c) Þarf 26. gr.-fyrirkomulag fyrir snertiflötinn (join-gáttin les flaggið)?
**Afstaða draganna.** Hreinn vinnsluaðili fyrir A/B; flaggið = réttindaflagg Karp-reiknings sett að beiðni skóla (milliveg — listinn B, flaggið C).
**Hvað ræðst af svarinu.** Hvort skóla-DPA nægir eða 26. gr.-fyrirkomulag þarf; hvort Karp þarf sjálfstæða heimild fyrir flagginu.

### §2 — Lagagrundvöllur skóla: e-liður (opinbert vald) vs. f-liður; þarf skólinn sjálfstætt mat?
**Samhengi.** Drögin gera ráð fyrir e-lið hjá opinberum skólum (lög 92/2008, 63/2006, 27/2010) og f-/b-lið hjá einkareknum.
**Spurning.** Er þetta rétt, og dugar almenn tilvísun í lögbundið hlutverk skóla sem „lagastoð" fyrir e-lið (sbr. 3. mgr. 6. gr. GDPR krefst stoðar í lögum)? Þarf skólinn eigið hagsmunamat (LIA) ef f-liður?
**Afstaða draganna.** Skólinn ábyrgist heimildina (5. gr. DPA); Karp leggur til rökstuðning í 2.1.
**Hvað ræðst af svarinu.** Orðalag 5. gr. DPA og hvort Karp á að afhenda LIA-sniðmát með.

### §3 — Börn 13–17 ára: 8. gr. GDPR / 10. gr. laga 90/2018 og forráðamenn
**Samhengi.** Heimildin er ekki samþykki → 8. gr. á ekki beint við. En Karp-reikningur (C) er „þjónusta í upplýsingasamfélaginu" sem barnið stofnar sjálft á grundvelli samnings (b-liður) — og samningshæfi ólögráða er takmarkað.
**Spurning.** (a) Er rétt að 10. gr. laga 90/2018 (13 ára) eigi ekki við um vinnslu skólans? (b) Má 13–17 ára nemandi stofna Karp-reikning á grundvelli b-liðar án aðkomu forráðamanns þegar reikningurinn er eingöngu notaður í kennslu að fyrirmælum skóla — eða ætti skólinn/kennarinn að útvega aðgang (t.d. einn reikning per lið á vegum skóla)? (c) Þarf að upplýsa forráðamenn (13. gr.) — og er það þá skylda skólans?
**Afstaða draganna.** 13 ára lágmark Karp haldið; mælt með skóla-netfangi og einu tæki per lið; upplýsingaskylda hjá skóla.
**Hvað ræðst af svarinu.** Hvort bjóða þurfi „skólareikninga" (kennari stofnar liðs-aðganga) í stað einka-reikninga nemenda — tæknileg breyting.

### §4 — 48 klst. tilkynningarfrestur til skóla
**Samhengi.** Almenni DPA (samþykktur 26.7.) segir „án ótilhlýðilegrar tafar"; skóla-DPA og personuvernd-síðan lofa **eigi síðar en 48 klst.** Eins manns rekstur.
**Spurning.** Er skynsamlegt að binda sig við fastan 48 klst. frest umfram almenna DPA — eða samræma við „án ótilhlýðilegrar tafar (að jafnaði innan 48 klst.)"?
**Afstaða draganna.** 48 klst. haldið (skólar/opinberir aðilar spyrja oft um fastan frest), samræmt í DPA + síðu.
**Hvað ræðst af svarinu.** Orðalag 10. gr. DPA og PVF-liðar síðunnar.

### §5 — Þátttakendalisti um tölvupóst (Gmail) og eyðingarregla
**Samhengi.** Netföng nemenda fara um Gmail (Google) á hjalp@karp.is; eyðing er handvirk skipulagsregla (≤90 d).
**Spurning.** Er ásættanlegt að vinnsla B fari um tölvupóst með handvirkri eyðingu, eða þarf sjálfvirka/öruggari leið (t.d. innsláttarsíða með skóla-kóða) áður en skólar eru teknir inn í fjölda?
**Afstaða draganna.** Ásættanlegt í prufu-umfangi með skipulagsreglu; tillaga um sjálfsafgreiðslu skráð (4. kafli R3).

### §6 — Staðsetning gagna (EES) og fullnægjandi ábyrgðir
**Samhengi.** D1 er ekki svæðisbundið í `wrangler.toml`; drögin fullyrða **ekki** EES-staðsetningu heldur „kunna að vinna utan EES" + SCC/DPF — sama orðalag og persónuverndarstefna Karp.
**Spurning.** Nægir þetta gagnvart opinberum skólum (sem oft spyrja sérstaklega um EES-hýsingu), eða ætti Karp að stilla svæðisbindingu á D1/leikjagögn ef Cloudflare býður?
**Afstaða draganna.** Orðalag haldið samræmt; tæknileg tillaga skráð (R10).

### §7 — Er DPIA skylt (35. gr.) fyrir skólann?
**Samhengi.** Eitt WP248-viðmið (viðkvæmir skráðir — börn) á við; umfang lítið; engin prófílgerð/einkunnagjöf.
**Spurning.** Staðfesting á að formleg matsskylda sé ekki virk og að þetta skjal sé nægur „DPIA-grunnur" fyrir skóla sem kjósa að gera mat engu að síður; og hvort skrá Persónuverndar yfir vinnslu sem krefst DPIA (4. mgr. 35. gr.) nái til vinnslunnar (t.d. „vinnsla persónuupplýsinga barna í skólastarfi í nýrri tækni").
**Afstaða draganna.** Ekki skylt; gert í þágu ábyrgðarskyldu.

### §8 — Réttindi skráðra þegar gögn eru ekki einstaklings-lykluð
**Samhengi.** Aðgangsbeiðni nemanda (15. gr.) getur Karp ekki afgreitt án leikkóða/liðs — gögnin eru ekki leitanleg eftir einstaklingi.
**Spurning.** Er rétt að meðhöndla það skv. 11. gr. GDPR (vinnsla sem krefst ekki auðkenningar — ábyrgðaraðili þarf ekki að afla viðbótarupplýsinga til að uppfylla 15.–20. gr.)? Hver er lágmarksferlið sem skóli og Karp þurfa að skjalfesta?
**Afstaða draganna.** Beiðni afgreidd með atbeina kennara (kóði + lið) → eyðing leiks eða nafnleysing liðsheitis (9. gr. DPA).
