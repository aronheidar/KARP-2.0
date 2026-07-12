# Pólitísk skýrsla — fýsileiki, hönnun og markaðssetning

> **Tegund:** Rannsóknar-/hugmyndaskjal (spec). **Ekki byggingarverk** — þetta er greining og tillaga.
> **Dags:** 2026-07-12 · **Höfundur:** Claude (fyrir Aron) · **Staða:** drög til ákvörðunar
> **Repo:** `GIT repository - hagvisir` · gögn í `gogn/`, síður í `web/src/pages/`, skript í `skriptur/`

---

## 0. Samantekt (TL;DR)

KARP er nú þegar með **einn ríkasta Alþingis-gagnabanka landsins** — en hann er **allur ókeypis** í mælaborðinu. Tækifærið er ekki að safna meiri gögnum heldur að **pakka því sem við eigum (+ 2–3 ónýttum gagnaveitum) inn í seljanlega skýrslu**, eins og KARP gerir nú þegar með fyrirtækjaskýrslur (KYC/áreiðanleiki, lánshæfismat, eigendaskýrsla).

Þrjár vöru-hugmyndir, raðaðar eftir tillögu:

| # | Vara | Kjarna-spurning | Aðal-markhópur | Nýtt gagn sem þarf | Vinnumat |
|---|------|------------------|-----------------|---------------------|----------|
| **A** | **Þingmannaskýrsla** („KYC fyrir stjórnmálamenn") | „Hver er þessi þingmaður — í raun?" | Blaðamenn, hagsmunaverðir, flokkar, almenningur | Hagsmunaskráning + fyrirtækjatengsl | **M** (~1–2 vikur) |
| **B** | **Hagsmuna-/Lobbývaktin** | „Hver reynir að hafa áhrif á mál X — og hverjir hlusta?" | Almannatengsl, hagsmunasamtök, lögmenn, sendiráð | `erindi/` (umsagnir) — **staðfest lifandi** | **M–L** (~3–4 vikur) |
| **C** | **Þing- & flokkagreining** | „Hvernig liggur valdið á þinginu?" | Fjölmiðlar, fræðafólk, greinendur/markaðir | Ekkert nýtt (til) | **S–M** (~1 vika) |

**Tillaga:** Byrja á **A** (mest gögn til, lægst áhætta, skýrasta hliðstæðan við núverandi seljanlegar skýrslur) sem fyrsta seljanlega afurð, með **B** sem næsta stóra B2B-áskriftar-tækifæri (hæsta greiðsluvilja). **C** er best sem lággjalda-viðbót/leið-segull frekar en sjálfstæð vara, því megnið birtist nú þegar frítt.

**Lögmæti:** Öll kjarnagögn eru **opinber gögn um opinbera embættismenn** (atkvæði, ræður, mæting, laun, hagsmunaskráning — allt birt af Alþingi). Vinnslan er lögmæt á grundvelli lögmætra hagsmuna + fjölmiðla-/fræðaundanþágu (GDPR gr. 85, pvl. 90/2018). **Þrjár aðgátir**: (1) AI-túlkanir verða að vera merktar mat, ekki staðreynd; (2) tenging hagsmuna við fyrirtæki má aðeins fullyrða staðreyndir, ekki spillingu; (3) atkvæði **lesenda** (skoðanir borgara) eru viðkvæm gögn — halda á tæki/samþykki. Sjá kafla 5.

---

## 1. Gagnayfirlit

### 1.1 Hvað við EIGUM nú þegar (lifandi, daglegt build)

**Per-þingmann (`gogn/althingi.json`, 63 sitjandi þingmenn):**
`id, nafn, flokkur, kjördæmi, aðalmaður, aldur, fyrstInn, fjöldiÞinga, sæti, mynd, hollusta (flokkshollusta %), uppreisn (þvert-á-flokk atkvæði), greidd (atkvæði greidd), skrop (%), fjarvist, recVotes, raedumin (ræðumínútur), raedur (#ræður), nefndir (fjöldi), nefndalisti [[heiti,staða]], mx/my (pólitísk hnit úr MDS), laun, kostn.`

**Ræðugreining (`gogn/raedugreining.json`, 115 manns m/talað — inkl. varamenn):**
`n, min, raedur, andsvor, fundarstj, flutn (flutningsræður), topMal [{heiti, n, min}] (mest rætt eftir tíma), longest, longestHeiti.`

**AI-mat á tón (`gogn/malrof_ai.json`, 63 þingmenn):**
`ton (ræðustíll, 1–2 setn.), aherslur [3–4 lykiláherslur], merki [2–3 stílmerki], n.` Knúið af `claude-opus-4-8`, byggt **eingöngu** á ræðubrotum, merkt „vélrænt mat, ekki dómur Karp".

**Önnur gögn:** `frumvorp.json` (161 mál m/skráð atkvæði + atkvæði flokka), `atkvaedi.json` (266 KB, nafnakalls-fylki), `cabinet.json` (11 ráðherrar), `nefndir.json` (nefndir + fundir + fulltrúar), `dagatal.json` (þingfundir + nefndarfundir), `seats.json` (raunveruleg sætaskipan úr PDF), `polls.json` (fjöl-mælinga tímaröð: Gallup/Maskína/Prósent + kosningar 2024), `pep.json` (þingmenn+ráðherrar+sveitarstjórar → PEP-skimun í fyrirtækjaskýrslum).

**Byggingar-skriptur:** `build_althingi, build_votes, build_atkvaedi, build_speeches, build_raedur, build_committees, build_frumvorp, build_cabinet, build_votemap, build_seats, build_laun, build_dagatal, build_polls, build_malrof_ai, build_pep, build_urslit`.

**Núverandi síður (ALLAR ÓKEYPIS/OPNAR):**
- `/althingi` — mælaborð (8 flipar: sætaskipan, frumvörp+atkvæði, flokkar, ríkisstjórn, pólitískt kort, nefndir, dagatal, þingmenn)
- `/althingi/[slug]` — **þingmanns-prófíll**: sætaspá, nefndir, „Málróf — hvernig talar þingmaðurinn" (ræður/tími/andsvör/lengsta), „Tónn og áherslur" (AI), „Fjölmiðlaumfjöllun" (með tón/sentiment)
- `/althingi/flokkar` — flokkastaða: sæti nú + sætaspá + fylgi, vinstri/hægri, samheldni, meðalfjarvera, ræðutími, nefndaformennska, meðallaun, meðalaldur, ráðherrar, 14-mælinga fylgisþróun
- `/althingi/nefndir` — nefndir · `/thingmal` — þingmál + atkvæði + **lesenda-atkvæði** („kjóstu þína eigin skoðun") · `/stefnuprof` — stefnupróf (Wahl-o-mat: 12 raunveruleg mál → hvaða flokki ertu sammála) · `/kannanir`, `/topplistar`

> **Lykil-innsæi fyrir mótun vöru:** frí-síðurnar sýna nú þegar *hápunkta* og *yfirlit*. Seljanlega skýrslan verður að bæta við **dýpt (heildarferill, ekki hápunktar), NÝ gögn (hagsmunir, lobbý, fyrirtækjatengsl), þægindi (PDF, vöktun, viðvaranir) og samþættingu við fyrirtækja-/fjármálagögn KARP** (einstakt forskot). Frí-síðurnar verða **markaðstrekt/leið-segull** að greiddu skýrslunni.

### 1.2 Alþingis-XML-API — nýttir vs ÓNÝTTIR endapunktar

CORS-opið (`access-control-allow-origin: *`), uppfært ~daglega, þing 157 (2026). Rót: `althingi.is/altext/xml/`.

**Nýtt í dag:** `thingmenn`, `thingseta`, `atkvaedagreidslur` (+detail), `raedulisti`, `nefndir/nefndarmenn`, `nefndarfundir`, `thingmalalisti` (+`thingmal` detail), `radherrar`, `thingfundir`, `saetaskipan`.

**ÓNÝTT — staðfest lifandi 2026-07-12, með vöru-möguleikum:**

| Endapunktur | Hvað það er | Hvað það gæti knúið |
|-------------|-------------|----------------------|
| **`erindi/?lthing=157`** (1,5 MB) | **Erindaskrá** — öll erindi/umsagnir til nefnda: `sendandi`, `viðtakandi/nefnd`, `tegunderindis` (umsögn/kynning…), `komudagur`, PDF-slóð | **Hjarta Idea B**: hver (fyrirtæki/samtök/einstaklingar) reynir að hafa áhrif á hvaða mál, hjá hvaða nefnd, hvenær |
| **`erindi/sendandi/?lthing=157`** (206 KB) | Listi ALLRA sendenda erinda (nafn + id + hlekkur á þeirra erindi) | Sendenda-skrá → samsvörun við fyrirtækjaskrá KARP (`firmaLookup`); „hverjir eru virkustu hagsmunaverðirnir?" |
| **`efnisflokkar/…`** | Opinber **málaflokka-taxonomía** (yfirflokkur→efnisflokkur m/lýsingu, t.d. Atvinnuvegir→Iðnaður) | Efnis-flokkun mála → **afstaða þingmanns/flokks eftir málefnasviði** („í nöp við málaflokk" sem áður var óbyggt) |
| **`thingskjol/?lthing=157`** (582 KB) | Öll **þingskjöl** (skjalategund + HTML/PDF fulltexti) | Djúp AI-greining á innihaldi frumvarpa, ekki bara titlum |
| **`samantektir/samantekt/?…`** | Opinberar **samantektir mála** | Læsileg máls-yfirlit í skýrslu án eigin AI-kostnaðar |
| **`framsogumenn/`** | Framsögumenn mála | „Hver er talsmaður/ábyrgðarmaður máls" |
| **`thingflokkar` / `thingflokksformenn`** | Þingflokkar + formenn | Flokks-forystu-net |
| **Fyrirspurnir** (í gegnum `thingmalalisti`, `málstegund`=fyrirspurn) | Fyrirspurnir þingmanna til ráðherra | Virknimælikvarði: hver spyr mest, um hvað, svartími ráðherra |

**Aðgátir (úr fyrri lotum + prófun í dag):** ferill-/þingmáls-HTML-síður eru **Cloudflare-varðar (403 fyrir bots)** — treysta XML. `erindi/sendandi` er **ekki fullkomlega afablað** (sama nafn getur haft fleiri en eitt id) → þarf nafna-samsvörun. Flutningsmenn frumvarpa eru **ekki í XML-API** (aðeins í ferill-HTML eða texta þingskjala).

### 1.3 Utan-API gögn

| Uppspretta | Staða | Vöru-gildi |
|------------|-------|------------|
| **Hagsmunaskráning þingmanna** (stjórnir, hlutabréf, gjafir, utanferðir, skuldir) | **Fæst per-þingmann** um CV-kerfið `altext/cv/is/hagsmunir/?nfaerslunr=<id>` → **200 frá node** (sama fjölskylda og launasíðan sem `build_laun.js` skrapar nú þegar). Aðal-`/hagsmunaskraning/`-slóðin er 403. | **Verðmætasta blaðamannagagnið** — hagsmunaárekstrar; **tengist beint fyrirtækja-/UBO-gögnum KARP** (einstakt) |
| **Fjölmiðlaumfjöllun** (`frettavel`/`build_frettavel`) | Til, notað á þingmanns-prófíl (tónn/sentiment) | Umfjöllunar-tímalína + tónn í skýrslu |
| **Fyrirtækjaskrá / eigendur / UBO** (KARP kjarni) | Til (RSK, ársreikningar, `computeUbo`) | **Brúin**: þingmaður → stjórnarseta/eignarhlutur → fyrirtæki → viðskiptahagsmunir |
| **Kosningaúrslit** (`build_urslit`) + kannanir | Til | Sætaspá, fylgi vs. fylgi-kjörfylgi |

---

## 2. Vöru-hugmyndir

### Vara A — Þingmannaskýrsla („KYC fyrir stjórnmálamenn")

**Hvað:** Djúp, PDF-útflytjanleg **skýrsla per þingmann** (og/eða flokk), í sama sniði og fyrirtækjaskýrslur KARP. Beina hliðstæðan við áreiðanleika-/KYC-skýrsluna, nema viðfangið er kjörinn fulltrúi.

**Inniheldur:**
1. **Yfirlit** — flokkur, kjördæmi, aldur, þingseta/starfsaldur, ráðherra?, sæti, mynd, laun+kostnaðargreiðslur.
2. **Atkvæðahegðun (heild, ekki hápunktar)** — flokkshollusta, uppreisnar-atkvæði (LISTI yfir hvaða mál hann klauf sig frá flokknum, með dagsetningu), mæting/skróp yfir tíma, þátttökuhlutfall.
3. **Málefnaspor** — afstaða eftir **efnisflokki** (úr `efnisflokkar` × atkvæði), mest rædd málefni (úr `topMal`), fyrirspurnir hann leggur fram.
4. **Ræðuvirkni + AI-tónn** — ræðutími, andsvör, lengsta ræða, + „tónn og áherslur" (merkt vélrænt mat).
5. **Nefndavald** — formennska/seta, þyngd í stjórn/andstöðu, nefndarmæting.
6. **Hagsmunir & tengsl (NÝTT + einstakt)** — hagsmunaskráning (stjórnarsetur, eignarhlutir, gjafir, ferðir) **krosstengt við fyrirtækjaskrá KARP** → „situr í stjórn X ehf.", „á hlut í Y hf.". Flagga mögulega árekstra **staðreyndalega** (t.d. „greiddi atkvæði um mál er varðar geira þar sem hagsmunir eru skráðir").
7. **Fjölmiðlaumfjöllun** — tímalína + tónn.
8. **Staðsetning** — pólitíska kortið (stjórn/andstaða-ás), vinstri/hægri, samanburður við flokkinn.

**Gögn:** ~90% **til**. Nýtt: hagsmunaskráning-skrapari + fyrirtækja-samsvörun (PEP-innviðir til) + efnisflokka-víðkun.

**Söluform:** stök skýrsla (Áskell V1 iframe, ~990–1.900 kr, eins og eigendaskýrsla) EÐA „allur aðgangur" áskrift (Karp+/Áskell V2). Frí-prófíllinn = teaser; skýrslan opnar dýptina.

---

### Vara B — Hagsmuna-/Lobbývaktin (áhrifa- & umsagna-vöktun)

**Hvað:** Mál- og hagsmunaaðila-miðuð **B2B-áskriftarvara**. Byggð á `erindi/` (umsagnir/erindi til nefnda) samþætt við málaferil, nefndir og atkvæði. Þetta er eina varan sem *engin* önnur íslensk þjónusta pakkar snyrtilega, og hún fellur beint að núverandi reglu-/útboðsvöktun KARP (útboðsvaktin, EES-vaktin, `/verkprofil`).

**Inniheldur:**
1. **Per mál/málefnasvið:** hverjir sendu umsögn (fyrirtæki, samtök — SA/SI/ASÍ/SVÞ —, ráðuneyti, einstaklingar), hvað sögðu þeir (PDF-hlekkur + AI-samantekt), til hvaða nefndar, hvenær.
2. **Hagsmunaaðila-prófíll:** „SA sendi 34 umsagnir á þingi 157, um þessi mál, með þessari afstöðu" — úr `erindi/sendandi` × fyrirtækjaskrá.
3. **Áhrifa-útkoma:** tengja umsögn → nefndarafgreiðslu → atkvæði → niðurstöðu. „Voru sjónarmið þín tekin til greina?"
4. **Bandamanna-kort:** hvaða þingmenn/nefndir eru móttækilegir fyrir tilteknu máli (atkvæði + ræðuefni + nefndarseta).
5. **Vöktun/viðvaranir (kjarna-verðmæti):** „láttu mig vita þegar nýtt mál/umsögn snertir geirann minn" — endurnýtir viðvörunar-innviði útboðs-/EES-vaktar + geira-fit úr `/verkprofil`.

**Gögn:** `erindi/` **staðfest lifandi (1,5 MB)**. Nýtt: `build_erindi.js` pipeline + sendenda-samsvörun (nafna-fuzzy, `firmaLookup` til) + AI-samantekt umsagna (þingskjöl/PDF).

**Söluform:** áskrift (Áskell V2), verðlagt eins og útboðsvaktin (~1.900 kr/mán einstaklingar; hærra fyrir fyrirtæki/deildir). **Hæsti greiðsluvilji** af öllum þremur.

---

### Vara C — Þing- & flokkagreining („Staða þingsins")

**Hvað:** Þing- og flokka-stigs **greiningarskýrsla/gagnastraumur**, gefin út reglulega (t.d. við þinglok/ársfjórðungslega). Megnið af undirliggjandi greiningu er **til** (votemap/MDS, samheldni, kannanir, sætaspá) — vandinn er að hún er nú þegar sýnileg frítt.

**Inniheldur:** pólitíska kortið (stjórn/andstaða-ás skýrir ~90%), flokkasamheldni (öfgafullur flokksagi — hollusta ~98%+), stjórnar-/stjórnarandstöðu-dýnamík, atkvæða-blokka-greining, kannanir vs. sætaspá, **valda-/lykilmanna-vísir** (hver er úrslitaatkvæði — NÝ greining), málefna-eignarhald flokka (NÝTT úr efnisflokkum), ráðherra-áhrifakort.

**Gögn:** ekkert nýtt utanaðkomandi; 2 nýjar afleiddar greiningar (pivotality-index, topic-ownership).

**Söluform:** lággjalda-skýrsla eða **leið-segull/PR** (data-journalism samstarf við fjölmiðla → vörumerkjakynning). Mælt með sem viðbót, ekki flaggskip.

---

## 3. Markhópar & sölu-hæfni

| Markhópur | Vara A (þingmaður) | Vara B (lobbý) | Vara C (þing/flokkar) | Greiðsluvilji |
|-----------|:---:|:---:|:---:|---|
| **Blaðamenn / ritstjórnir** | ★★★ bakgrunnur f. viðtal/frétt | ★★ hverjir lobbýuðu | ★★ data-journalism | Miðl. (stofnana-áskrift) |
| **Almannatengsl / lobbý / lögmenn** | ★★ hvern á að nálgast | ★★★ **kjarnavara** | ★ | **Hár** (B2B) |
| **Hagsmunasamtök** (SA, SI, ASÍ, SVÞ) | ★ | ★★★ eigin+keppinauta-vöktun | ★★ | **Hár** |
| **Fyrirtæki / public affairs** | ★ | ★★★ reglu-áhætta | ★★ | **Hár** |
| **Fræðafólk / stjórnmálafræði** | ★★ | ★★ | ★★★ gagnasett | Lágur–miðl. |
| **Stjórnmálaflokkar / frambjóðendur** | ★★★ mótherja-rannsókn + eigin-vöktun | ★★ | ★★ | Miðl.–hár (kosningar) |
| **Sendiráð / erlendir greinendur** | ★★ | ★★ | ★★★ „hvernig virkar þingið" | Miðl. |
| **Almenningur / áhugafólk** | ★★ (stök skýrsla) | ✗ | ★ | Lágur (stök 990) |
| **Fjármálamarkaður / greinendur** | ★ | ★★ (pólitísk áhætta) | ★★ | Miðl. — fellur að fjármála-áhorfendum KARP |

**Niðurstaða:** **B** hefur hæstu B2B-greiðslugetuna en flóknasta byggingu; **A** breiðasta markaðinn og lægstu byggingaráhættuna og er nánasta hliðstæðan við það sem KARP selur nú; **C** er lægst-verðmæt sjálfstætt en ódýr og góð fyrir vörumerki/trekt.

---

## 4. Einstakt forskot KARP (af hverju KARP en ekki t.d. althingi.is eða fjölmiðill)

1. **Brúin þing ↔ viðskiptalíf.** Enginn annar tengir þingmann/hagsmunaaðila við **fyrirtækjaskrá, eignarhald, UBO, ársreikninga og lánshæfismat**. „Þessi þingmaður situr í stjórn þessa félags sem á í hlut í þessum geira sem málið snertir" — það er KARP-sérgrein.
2. **Vöktunar-/áskriftar-innviðir til** (útboðsvakt, EES-vakt, fréttavél, `/verkprofil` geira-fit, Áskell-greiðslur, `report-nav.js` PDF, `hasTier` paywall). Ný vara erfir þetta.
3. **AI-samantektarlag** (malrof_ai, domar_ai) þegar í framleiðslu — hlutlaust merkt mat.
4. **Fjármála-/viðskipta-áhorfendur** sem meta pólitíska áhættu — önnur sölurás en hefðbundnir stjórnmála-gagnaseljendur.

---

## 5. Persónuvernd & lögmæti

**Grunnur:** viðfangið eru **kjörnir fulltrúar í opinberu hlutverki**, og öll kjarnagögn eru **þegar opinberlega birt af Alþingi**: atkvæði, ræður, mæting, nefndir, laun (`althingi.is`), hagsmunaskráning (birt skv. reglum um hagsmunaskráningu alþingismanna), erindi/umsagnir.

**Lagagrundvöllur:** lögmætir hagsmunir (GDPR 6(1)(f)) + fjölmiðla-/fræða-/tjáningarundanþága (GDPR gr. 85 / persónuverndarlög 90/2018, 6. gr.). Stjórnmálaskoðanir eru sérstakur flokkur (gr. 9) EN fyrir þingmann eru þær **augljóslega gerðar opinberar af honum sjálfum** í embætti → gr. 9(2)(e) á við. Þetta er sami rökstuðningur og KARP notaði í DPIA fyrir KYC/tengslanet (sjá minni `karp-personuvernd-dpia`).

**Fjórar áþreifanlegar aðgátir (skilyrði fyrir útgáfu):**
1. **AI-mat = mat, ekki staðreynd.** Halda merkingunni sem malrof_ai notar nú þegar („vélrænt mat gervigreindar … ekki dómur Karp"). Aldrei orða tón/vinstri-hægri/áreksturs-ályktun sem staðreynd. Vinstri-hægri og „stefna" flokka eru **ritstjórnarlegt mat** — merkja það.
2. **Hagsmuna-/fyrirtækjatengsl: aðeins staðreyndir.** Birta skráða hagsmuni og skráð fyrirtækjatengsl. Fullyrða **aldrei spillingu/lögbrot**; leyfa lesanda að draga ályktun. „Skráður hagsmunur í geira sem mál snertir" er staðreynd; „hagsmunaárekstur" er ályktun → orða varlega.
3. **Atkvæði LESENDA eru viðkvæm gögn.** „Kjóstu þína eigin skoðun"/stefnupróf safna pólitískum skoðunum **borgara** (gr. 9). Nú geymt í `localStorage`/á tæki = í lagi. **Ef** við byrjum að safna miðlægt eða tengja við innskráða notendur → þarf skýrt samþykki + sér-DPIA. Ekki gera það þegjandi.
4. **Nákvæmni & andmælaréttur.** Rangar staðreyndir um nafngreindan einstakling = meiðyrða-/nákvæmnisáhætta. Hafa (a) skýrar heimildir per fullyrðingu (hlekk á Alþingi), (b) leið til leiðréttingar, (c) dagsetta útgáfu. Hagsmunaskráning úreldist — sýna „skráð þann X".

**Aðgerð:** stutt viðbót við núverandi DPIA (`karp-personuvernd-dpia`) sem nær yfir þingmanns-/hagsmuna-vinnsluna. Engin ný persónuvernd-heimild þarf (ólíkt fjárhagsupplýsingastofu-leiðinni); þetta er opinbert.

---

## 6. Vinnumat (per hugmynd)

Stærðir: **S** ≈ nokkrir dagar, **M** ≈ 1–2 vikur, **L** ≈ 3–4 vikur. Allt nýtir núverandi innviði (build-pipeline → `gogn/*.json` → bakað í síðu; `report-nav.js` PDF; `hasTier` paywall; Áskell checkout).

| Verkþáttur | A | B | C |
|-----------|:--:|:--:|:--:|
| Ný gagna-pipeline | `build_hagsmunir.js` (CV-skrapari, sbr. `build_laun`) + efnisflokka-víðkun `build_votes` | `build_erindi.js` (nýtt, 1,5 MB parse) + sendenda-samsvörun | engin (0) |
| Entity-samsvörun v/fyrirtækjaskrá | Miðl. (PEP-innviðir til) | **Há** (fuzzy nöfn, óafabluð id) | — |
| AI-lag | endurnýta malrof_ai | ný: umsagna-samantekt (kostnaður per mál) | 2 afleiddar greiningar (pivotality, topic-ownership) |
| Skýrslu-view + PDF | endurnýta report-nav.js snið | nýtt vakt-/mál-view | endurnýta mælaborð |
| Paywall/greiðsla | endurnýta hasTier + Áskell V1 (stök) | Áskell V2 (áskrift) + viðvaranir | Áskell/frítt |
| **Heildarmat** | **M (~1–2 vikur)** | **M–L (~3–4 vikur)** | **S–M (~1 vika)** |
| Aðal-áhætta | hagsmunaskráning-snið breytilegt; nákvæmni | sendenda-samsvörun; AI-kostnaður í skala | lítil viðbótargildi umfram frí-síður |

---

## 7. Tillaga & næstu skref

1. **Fasi 1 (MVP, ~1–2 vikur): Vara A.** Byggja þingmannsskýrslu ofan á núverandi `/althingi/[slug]` — bæta við (a) heildar-atkvæðaferli, (b) hagsmunaskráningu + fyrirtækjatengslum, (c) efnisflokka-afstöðu, (d) PDF + paywall. Selja sem staka skýrslu (Áskell V1) fyrst; mæla eftirspurn.
2. **Fasi 2 (~3–4 vikur): Vara B** ef A staðfestir áhuga hagsmuna-/PR-geirans. `build_erindi.js` → hagsmunaaðila-prófílar + mál-vöktun → B2B-áskrift.
3. **Vara C:** halda sem frí-/vörumerkja-lag (data-journalism samstarf) frekar en að byggja sér-vöru — nema fjölmiðill/fræðastofnun kaupi gagnastrauminn.
4. **Áður en byggt er:** (a) staðfesta hagsmunaskráning-snið per-MP (ná 63 skrám), (b) stutt DPIA-viðbót, (c) ákveða verð + söluform (stök vs áskrift), (d) staðfesta að frí-síður verði áfram trekt (ekki kannibalísera).

**Opnar ákvarðanir fyrir Aron:**
- Byrja á **A** (breiðast, öruggast) eða **B** (hæstur greiðsluvilji, flóknast)?
- Verð/form: stök skýrsla (990–1.900) vs. Karp+ áskrift vs. B2B-deildaráskrift?
- Hversu langt má ganga í að **fullyrða** hagsmunaárekstra? (Tillaga: aðeins staðreyndir, lesandi ályktar.)

---

### Viðauki: staðfestingar-prófanir (2026-07-12)
- `erindi/?lthing=157` → **200, 1,5 MB**, reitir: sendandi/viðtakandi(nefnd)/tegunderindis/komudagur/PDF. ✅
- `erindi/sendandi/?lthing=157` → **200, 206 KB**, sendenda-skrá (nafn+id; ekki fullkomlega afabluð). ✅
- `efnisflokkar/…` → **200**, málaflokka-taxonomía (yfirflokkur→efnisflokkur). ✅
- `thingskjol/?lthing=157` → **200, 582 KB**, fulltexta-hlekki (HTML+PDF). ✅
- Hagsmunaskráning: `/thingmenn/…/hagsmunaskraning/` = **403** (Cloudflare), EN `altext/cv/is/hagsmunir/?nfaerslunr=<id>` = **200** frá node. ✅
- `hagsmunaskraning/`, `fyrirspurnir/`, `umsagnir/`, `raeda/` sem sér-XML-endapunktar = **404** (fást annars staðar: fyrirspurnir í `thingmalalisti`, umsagnir í `erindi`). 
