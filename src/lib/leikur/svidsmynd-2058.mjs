// SVIÐSMYNDIN „ÍSLAND 2026–2058" — átta kjörtímabil fram í tímann (RÁS-Leikurinn).
//
// ⚠⚠ ÞETTA ERU TILBÚNAR KENNSLU-SVIÐSMYNDIR — EKKI SPÁ KARP UM FRAMTÍÐINA. ⚠⚠
// Atburðirnir hér eru SKÁLDAÐIR en byggðir á skjalfestum þróunarlínum sem þegar eru hafnar (öldrun og
// framfærsluhlutfall, húsnæðisframboð vs aðflutningur, eldvirkni á Reykjanesi, hlýnun sjávar og færsla
// fiskistofna, orkueftirspurn, sjálfvirkni á vinnumarkaði, þolmörk ferðaþjónustu, alþjóðleg viðskipta-
// og öryggisspenna). Tilgangurinn er að ÆFA hagstjórn undir álagi — ekki að segja fyrir um hvað gerist.
// Enginn atburður er óhjákvæmileg katastrófa: í hverri lotu er raunverulegt val sem breytir niðurstöðunni.
//
// ⚠ ENGIR NAFNGREINDIR EINSTAKLINGAR. Framtíðar-atburðir nefna AÐEINS stofnanir og fyrirbæri
//   (Hagstofan, Hafrannsóknastofnun, Alþingi, verkalýðshreyfingin). Við skáldum ekki nöfn á raunverulegt
//   fólk í framtíðar-embættum (sbr. `erFramtid` í svidsmyndir.mjs).
//
// AF HVERJU dials = {} (ENGIN SPÓLUN):
//   gogn/roads/baseline.json er líkan af Íslandi Í DAG (`updated` = 2026) — verðbólga á leið úr 5,3% í
//   2,6%, stýrivextir 8%, atvinnuleysi ~4,2%, skuldir ~38,8% af VLF, húsnæðisverð +7,3%. Sviðsmyndin
//   HEFST því á nákvæmlega því ástandi sem baseline lýsir og þarf enga leiðréttingu aftur í tímann.
//   Til samanburðar þarf 'island2000' YEAR2000_DIALS til að spóla baseline aftur til aldamóta.
//   (svidsmyndir.mjs NEGLIR dials/reality/hefurSogu/erFramtid hvort eð er; gildin eru höfð með hér til
//    að skráin lýsi sér sjálf og svo próf geti staðfest að þau reki ekki í sundur.)
//
// SJOKK-AGI: `shocks` má AÐEINS nota þá 7 lykla sem eru til í baseline.shocks
//   (olia, gengi, ferdamenn, adflutningur, frjosemi, heimshagvoxtur, hravaruverd) og gildin eru
//   höfð innan [min,max] hvers lykils. Styrkurinn er STILLTUR AÐ sögulegu sviðsmyndinni: mesta
//   einstaka sjokk hér er |25| (ferðamenn, eldarnir 2038) á móti |40| í island2000 (COVID 2020).
//   Framtíðin á að vera KREFJANDI, ekki ósanngjarnari en fortíðin. Rök fyrir hverjum lykli og hverju
//   gildi fylgja hverjum atburði hér að neðan.
//
// ÞEMU OG STIGAGJÖF: röð atburðanna er valin svo hún falli að ROUND_GOALS í game-config.mjs
//   (KT2/KT5 = fiskistofn, KT3 = hreinn þjóðhags-kjarni „lifa af", KT4 = byggðajöfnuður,
//    KT6 = losun, KT7 = losun+jöfnuður, KT8 = allt) — þá skipta þema-sleðarnir raunverulega máli í stiginu.
//
// FORM: sama og SCENARIO.events í game-config.mjs. Höfundar-fylkið heitir `choices`; `responses` er
// SAMA FYLKIÐ (sama tilvísun) svo eldri neytendur (resolve.mjs, game-validate.mjs, client.mjs) virki óbreyttir.

const EVENTS = [
  // ── KT1 · 2026 — kunnugleg nútíð: verðbólgan hjaðnar, húsnæðið ekki ────────────────────────────
  // SJOKK-RÖK:
  //   adflutningur +10 — Hagstofan gerir ráð fyrir um 5.166 aðfluttum umfram brottflutta á ári fyrsta
  //     áratuginn, meðan sjálfbært bil m.v. byggingargetu (3.246 fullgerðar íbúðir að meðaltali 2023–24)
  //     er ~3.500–4.000. Það er ~+30% umfram þak; +10 sem 4-ára meðaltal er HÓFLEG framreikning og
  //     vægara en aðflutnings-sjokkið í útrásinni (KT2 2004: +15).
  //   heimshagvoxtur −1 — viðskiptaspenna og tollamúrar draga úr ytri eftirspurn. Vægasta þrepið sem
  //     sögulega sviðsmyndin notar (sama og KT1 2000 og KT8 2028) á kvarðanum [−6..6].
  {
    round: 1, year: 2026, icon: '🏗️', title: 'Húsnæðisþakið',
    text: 'Það er haustmorgunn 2026 og útvarpið tilkynnir að verðbólgan hafi hjaðnað enn eina mælinguna. Fólk andar léttar: vextirnir eru á niðurleið og greiðsluseðlarnir bíta minna en í fyrra. En við næsta borð á kaffihúsinu situr ungt par og reiknar upphátt — þau hafa boðið í fjórar íbúðir og tapað þeim öllum. Undanfarin ár hafa um 3.200 íbúðir verið fullgerðar árlega, en Hagstofan gerir ráð fyrir að rúmlega fimm þúsund manns flytji til landsins umfram brottflutta á hverju ári næsta áratuginn. Þið takið við hagkerfi sem lítur út fyrir að vera að ná jafnvægi — en undir yfirborðinu er reikningsdæmi sem gengur ekki upp.',
    focus: 'Þjóðhagslegur stöðugleiki er innan seilingar í fyrsta sinn í mörg ár. Verkefnið er að halda honum án þess að húsnæðisskorturinn éti upp kaupmáttinn sem er að nást.',
    watch: 'Aðflutningur umfram byggingargetu endar alltaf á sama stað: í leiguverði og á biðlistum. Þú getur hækkað þakið eða hægt á innflæðinu — en að gera hvorugt er líka ákvörðun.',
    shocks: { adflutningur: 10, heimshagvoxtur: -1 },
    choices: [
      { key: 'byggja', label: 'Stórsókn í lóðum og nýbyggingum', effect: { lever: { lodaframbod: 25, frambod: 15 } } },
      { key: 'leiga', label: 'Byggja félagslegt leiguhúsnæði og styðja leigjendur', effect: { lever: { leiguhusnaedi: 20, tilfaerslur: 6 } } },
      { key: 'haegja', label: 'Hægja á eftirspurninni (atvinnuleyfi og greiðslubyrðarþak)', effect: { lever: { innflytjendastefna: -10, dsti: -5 } } },
    ],
  },

  // ── KT2 · 2030 — hlýnun sjávar færir stofnana (ROUND_GOALS KT2 = +fiskistofn) ──────────────────
  // SJOKK-RÖK:
  //   hravaruverd −12 — baseline-lykillinn er „ál/fiskur". Færist þorskur norðar og aflamark lækkar
  //     þrjú ár í röð rýrnar útflutningsverðmæti sjávarafurða. −12 er MILLIVEGUR: harðara en hrávöru-
  //     höggið í hruninu (KT3 2008: −10) en hvergi nærri neðri mörkum lykilsins (−40). Hæg breyting
  //     sem bítur, ekki hrun.
  //   ferdamenn +5 — hlýnun lengir ferðatímabilið og fleiri koma utan háannar. Minnsta jákvæða þrepið
  //     (KT4 2012 var +12) — kennslupunkturinn er að SAMA loftslagsbreytingin gefur og tekur.
  {
    round: 2, year: 2030, icon: '🌊', title: 'Hafið hlýnar',
    text: 'Í fréttatímanum stendur skipstjóri á bryggju og segir það sem allir í greininni vita: fiskurinn er ekki þar sem hann var. Hlýnandi sjór hefur ýtt kaldsjávarstofnum norðar og vestar, Hafrannsóknastofnun leggur til lægra aflamark þriðja árið í röð og suðlægari tegundir sjást þar sem enginn átti von á þeim. Sjávarbyggðir sem hafa sótt á sömu mið í heila öld horfa á aflaverðmætið rýrna, og deilur við nágrannaríki um flökkustofna harðna með hverju árinu. Á sama tíma lengist ferðamannatímabilið og fleiri gestir koma utan háannar. Auðlindin er ekki horfin — hún er á hreyfingu, og reglurnar voru skrifaðar fyrir haf sem stóð kyrrt.',
    focus: 'Sjálfbærni fiskistofnanna er komin á dagskrá af fullum þunga. Þetta kjörtímabil ræðst af því hvort þú stýrir eftir vísindunum eða eftir eftirspurninni.',
    watch: 'Þegar stofn hopar er freistandi að veiða meira meðan hann er enn til staðar. Varúð kostar tekjur strax, ofveiði kostar stofninn — og byggðirnar þurfa eitthvað að lifa á á meðan.',
    shocks: { hravaruverd: -12, ferdamenn: 5 },
    choices: [
      { key: 'varud', label: 'Fara varlega: lækka aflamark og friða uppeldisslóðir', effect: { lever: { kvoti: -15, fridun: 15 } } },
      { key: 'nytt', label: 'Sækja í nýja stofna og innheimta auðlindarentu', effect: { lever: { kvoti: 10, veidigjald: 20 } } },
      { key: 'eldi', label: 'Byggja upp fiskeldi í staðinn', effect: { lever: { fiskeldi: 25, byggdastefna: 10 } } },
    ],
  },

  // ── KT3 · 2034 — ytra áfall (ROUND_GOALS KT3 = hreinn kjarni, „lifa af") ───────────────────────
  // SJOKK-RÖK (þrjú saman = alþjóðleg keðjuverkun, en hvert um sig VÆGARA en 2008):
  //   heimshagvoxtur −3 — sami styrkur og COVID-lotan (KT6 2020: −3) og vægara en hrunið (−4).
  //     Alþjóðlegur samdráttur, ekki heimskreppa.
  //   gengi −10 — lítill opinn gjaldmiðill gefur eftir þegar flúið er í stærri myntir. Innan við
  //     þriðjungur af hrun-högginu (KT3 2008: −35) og innan marka lykilsins ([−25..25], sem hrun-gildið
  //     sjálft virðir ekki). Nóg til að innflutt verðbólga bíti, of lítið til að vera stökkbreyting.
  //   olia +20 — orku- og flutningskostnaður hækkar í öryggisspennu á Norður-Atlantshafi. Vægara en
  //     verðbólgubylgjan 2024 (+30), enda hafa orkuskipti þá dregið úr olíunæmni hagkerfisins.
  {
    round: 3, year: 2034, icon: '🌐', title: 'Alþjóðlegt bakslag',
    text: 'Í þetta sinn koma fréttirnar að utan. Viðskiptaþvinganir, rofnar aðfangakeðjur og fjármálaáfall í stóru hagkerfi hafa hægt á heimsbúskapnum, orkuverð rýkur upp og fjárfestar leita í stærstu myntirnar. Krónan gefur eftir á fáeinum vikum og vaxtaálag ríkissjóðs hækkar í fyrsta sinn í mörg ár. Á Norður-Atlantshafi eru umsvif hersveita og eftirlitsflugs meiri en verið hefur í hálfa öld, og útgjöld til varna og öryggis eru skyndilega á dagskrá sem enginn getur vísað frá sér. Í kjölfarið vaknar gamla umræðan á Alþingi: hvort örmynt sé of dýr fyrir svona lítið hagkerfi og hvort leita eigi skjóls í stærra myntsvæði. Fyrir smáríki er alþjóðleg ólga ekki fjarlægur atburður heldur verðmiði á hvern innfluttan hlut.',
    focus: 'Þetta kjörtímabil snýst um að standa af sér ytra högg. Þjóðhagslegur kjarni og kaupmáttur heimilanna er það sem er metið — annað bíður betri tíma.',
    watch: 'Lítill gjaldmiðill er bæði höggdeyfir og áhætta. Forði, varúðarreglur og trúverðug ríkisfjármál eru varnir sem virka — en þær þarf að byggja áður en áfallið kemur, ekki eftir á.',
    shocks: { heimshagvoxtur: -3, gengi: -10, olia: 20 },
    choices: [
      { key: 'varud', label: 'Verja stöðugleikann: aðhald og varúðarreglur', effect: { lever: { vextir: 1, bindiskylda: 5 } } },
      { key: 'heimili', label: 'Verja heimilin gegn högginu', effect: { lever: { tilfaerslur: 12, vsk: -2 } } },
      { key: 'sjalfsbjorg', label: 'Draga úr innfluttri áhættu: orku- og innviðaöryggi', effect: { lever: { orkuskipti: 20, innvidir: 12 } } },
    ],
  },

  // ── KT4 · 2038 — eldarnir ná til innviðanna (ROUND_GOALS KT4 = +byggðajöfnuður) ────────────────
  // STÆRSTA INNLENDA ÁFALL SVIÐSMYNDARINNAR — en ekki katastrófa: allar þrjár leiðir eru færar.
  // SJOKK-RÖK:
  //   ferdamenn −25 — endurtekin gos og flugraskanir fæla gesti frá. VÆGARA en COVID (KT6: −40, algert
  //     lokunar-högg) og minna að umfangi en uppsveiflan 2016 (+30): landið lokast ekki, það verður
  //     óáreiðanlegt. Þetta er stærsta einstaka sjokk sviðsmyndarinnar — |25| á móti |40| í island2000.
  //   gengi −8 — gjaldeyristekjur ferðaþjónustu bregðast → krónan gefur eftir. Sama stærðargráða og
  //     útrásar-styrkingin 2004 (+8), fjarri hrun-högginu.
  //   heimshagvoxtur −1 — vægur ytri mótbyr; áfallið á að vera INNLENT svo lausnin sé innlend líka.
  {
    round: 4, year: 2038, icon: '🌋', title: 'Eldarnir og innviðirnir',
    text: 'Síminn titrar klukkan hálf fjögur um nótt: ný sprunga er opin og í þetta sinn liggur hraunið að lykilinnviðum á Reykjanesi. Jarðvísindamenn hafa frá upphafi eldanna 2021 varað við því að tímabilið geti staðið í áratugi, og nú er sú spá orðin að daglegu lífi — heitt vatn, raforka og vegasamband um Suðurnes eru í uppnámi og flug um Keflavík raskast með reglulegu millibili. Ferðaskrifstofur erlendis afbóka í hrönnum og myndir af hrauni við varnargarða fara um allan heim. Byggðin á Suðurnesjum, sem hefur búið við óvissu í hálfan annan áratug, spyr í fullri alvöru hvort hún eigi framtíð fyrir sér. Innviðir sem þola eitt gos þola ekki tuttugu — og þetta er ekki eitt gos heldur tímabil.',
    focus: 'Byggðajöfnuður er kominn í forgrunn: það sem gerist á Suðurnesjum þetta kjörtímabil ræður því hvort landið heldur áfram að vera byggilegt allt saman.',
    watch: 'Áföll sem endurtaka sig eru ekki neyðarástand heldur rekstrarumhverfi. Neyðarfé bjargar árinu, varaleiðir og tvöfaldir innviðir bjarga áratugnum — og hvort tveggja kostar.',
    shocks: { ferdamenn: -25, gengi: -8, heimshagvoxtur: -1 },
    choices: [
      { key: 'varaleidir', label: 'Tvöfalda innviði og byggja varaleiðir', effect: { lever: { innvidir: 25 } } },
      { key: 'byggd', label: 'Verja Suðurnes og halda byggðinni', effect: { lever: { byggdastefna: 25, utgjold: 6 } } },
      { key: 'skref', label: 'Bregðast við í skrefum og verja svigrúm ríkissjóðs', effect: { lever: { utgjold: -5 } } },
    ],
  },

  // ── KT5 · 2042 — hver á rentuna af hafinu? (ROUND_GOALS KT5 = +fiskistofn) ─────────────────────
  // SJOKK-RÖK:
  //   hravaruverd +10 — villtur afli á heimsvísu hefur staðið í stað í áratugi meðan eftirspurn eftir
  //     próteini vex; verð á sjávarafurðum hækkar. +10 er innan við fimmtungur af efri mörkum lykilsins
  //     (+60) og vægara en verðbólgubylgjan 2024 (+15). Meðbyr, ekki uppgrip.
  //   adflutningur +5 — eldi og vinnsla draga erlent vinnuafl í strandbyggðir. Helmingi vægara en KT1
  //     hér að ofan og þriðjungur af útrásinni (+15): staðbundin þörf, ekki þjóðflutningar.
  {
    round: 5, year: 2042, icon: '🐟', title: 'Auðlindin á hafinu',
    text: 'Þú keyrir inn í fjörð þar sem eldiskvíar liggja í röðum og vinnslan er stærsti vinnustaðurinn í tvö hundruð kílómetra radíus. Fiskeldið er orðið ein af stærstu útflutningsgreinum landsins meðan villtur afli á heimsvísu hefur staðið í stað, og verð á sjávarafurðum hefur aldrei verið hærra. En laxveiðiár í nágrenninu hafa gefið eftir, veiðifélög og náttúruverndarsamtök krefjast friðunar heilla fjarða, og deilan um hver eigi rentuna af hafinu — fyrirtækin, byggðirnar eða ríkið — er jafn heit og fyrir tuttugu árum. Hafið hefur aldrei skilað meiri verðmætum. Spurningin er hvað þið takið fyrir aðganginn og hvað verður eftir handa næstu kynslóð.',
    focus: 'Sjálfbærni hafsins er metin á ný, nú með fiskeldið sem stærstu breytuna. Verðmætasköpun og verndun toga hvor í sína átt og þú velur hlutfallið.',
    watch: 'Auðlindarenta sem er ekki innheimt hverfur ekki — hún lendir bara annars staðar. En of hörð gjaldtaka færir fjárfestinguna úr landi, og friðun án atvinnu skilur byggðirnar eftir.',
    shocks: { hravaruverd: 10, adflutningur: 5 },
    choices: [
      { key: 'skala', label: 'Skala fiskeldið upp og sækja útflutningsverðmæti', effect: { lever: { fiskeldi: 30, ivilnanir: 10 } } },
      { key: 'vernda', label: 'Friða firði og verja villta stofna', effect: { lever: { fridun: 25, fiskeldi: -10 } } },
      { key: 'renta', label: 'Innheimta auðlindarentuna og skila í byggðirnar', effect: { lever: { veidigjald: 35, byggdastefna: 15 } } },
    ],
  },

  // ── KT6 · 2046 — orkan er trompið, landið er söluvaran (ROUND_GOALS KT6 = +losun) ──────────────
  // TÆKIFÆRIS-LOTAN: einu sjokkin eru jákvæð. Áskorunin er ekki áfall heldur FREISTING.
  // SJOKK-RÖK:
  //   hravaruverd +15 — orkuskipti heimsins keyra upp verð á orkufrekri framleiðslu (ál, grænir málmar,
  //     rafeldsneyti). Sama gildi og verðbólgubylgjan 2024 (+15), fjarri efri mörkum (+60).
  //   ferdamenn +15 — norðurslóðir verða eftirsóknarverðari eftir því sem sunnar hitnar, og greinin
  //     hefur náð sér eftir eldana. HELMINGI vægara en sprengjan 2016 (+30): vöxtur af hærri grunni.
  //   heimshagvoxtur +1 — sama milda meðbyrs-þrep og endurreisnin 2012 (+1).
  {
    round: 6, year: 2046, icon: '⚡', title: 'Orkan og jöklarnir',
    text: 'Þú stendur við skilti sem segir að hér hafi jökullinn náð fram um aldamótin; núna sérðu grjót og nýtt lón. Jöklarnir hafa hopað svo hratt að rennsli til virkjana er annað en það var, úrkoman er ákafari og skriðuföll og flóð tíðari en gömlu hönnunarforsendurnar gerðu ráð fyrir. Á sama tíma hefur eftirspurnin eftir íslenskri orku aldrei verið meiri: gagnaver, rafeldsneytisverksmiðjur og evrópsk iðnfyrirtæki bjóða margfalt verð fyrir hverja megavattstund, og gestafjöldinn er kominn langt yfir það sem gömlu áætlanirnar gerðu ráð fyrir. Á Alþingi liggja bæði virkjanafrumvörp og friðlýsingartillögur, og sæstrengs-umræðan er vöknuð enn einu sinni. Orkan er stærsta tromp Íslands á öldinni — en landið sem framleiðir hana er líka söluvaran sjálf.',
    focus: 'Loftslagsmarkmiðin eru metin af fullri hörku þetta kjörtímabil. Sama orkan getur bæði lækkað losunina og hækkað hana — það veltur á því hvert hún fer.',
    watch: 'Orkusala gefur skjótan vöxt en bindur landið í áratugi. Spurðu hvar virðisaukinn verður eftir — og hvað náttúra sem enginn getur endurbyggt er metin á.',
    shocks: { hravaruverd: 15, ferdamenn: 15, heimshagvoxtur: 1 },
    choices: [
      { key: 'virkja', label: 'Selja orkuna: stóriðja, gagnaver og rafeldsneyti', effect: { lever: { orka: 25, ivilnanir: 15 } } },
      { key: 'heima', label: 'Setja orkuna í orkuskipti og hugvit heima fyrir', effect: { lever: { orkuskipti: 30, menntun: 15 } } },
      { key: 'haegja', label: 'Hægja á: verðleggja losun og stýra álagi á náttúruna', effect: { lever: { kolefnisgjald: 30, ferdamannagjald: 20, orka: -5 } } },
    ],
  },

  // ── KT7 · 2050 — sjálfvirknin og hver á batann (ROUND_GOALS KT7 = +losun +jöfnuður) ────────────
  // SJOKK-RÖK:
  //   heimshagvoxtur +2 — sjálfvirkni og gervigreind lyfta framleiðni heimsbúskapar. Efri kantur þess
  //     sem sögulega sviðsmyndin notar (mesti meðbyr þar er +1) en aðeins þriðjungur af efri mörkum
  //     lykilsins (+6). Meðbyrinn er ÝTNI: hann gerir aðgerðaleysi þægilegt en dýrt.
  //   frjosemi −10 — frjósemi hefur verið undir endurnýjunarmörkum og lækkað samfellt á öllum Norður-
  //     löndum. −10% frávik yfir 4 ár er bein framreikning á staðfestri þróun, fjórðungur af neðri
  //     mörkum lykilsins (−40). Þetta sjokk er UNDANFARI KT8: reikningurinn er þegar byrjaður að hlaðast.
  {
    round: 7, year: 2050, icon: '🤖', title: 'Vélarnar og vinnan',
    text: 'Á fundi í ráðuneytinu er lögð fram tala sem enginn vill trúa: stór hluti starfa í bókhaldi, þýðingum, þjónustuverum og hluta heilbrigðiskerfisins hefur breyst svo mikið á einum áratug að þau eru varla sömu störfin lengur. Gervigreind og sjálfvirkni hafa lyft framleiðni, fyrirtækin skila methagnaði og hagvöxtur mælist ágætur — en ávinningurinn dreifist ójafnt og fólk sem er komið yfir fimmtugt finnur ekki fótfestu á ný. Verkalýðshreyfingin boðar kjaraviðræður þar sem krafan snýst ekki bara um prósentur heldur um endurmenntun og um hver eigi framleiðnibatann. Í sömu viku birtir Hagstofan tölur sem sýna að frjósemi hefur lækkað enn eitt árið. Tæknin er komin — spurningin er hvort samfélagið nái henni.',
    focus: 'Bæði loftslag og jöfnuður eru undir. Framleiðnibati sem lendir allur á sama stað er ekki lífskjarabati — og orkufrek tækni hefur líka losun.',
    watch: 'Menntun og virk vinnumarkaðsúrræði ráða því hvort fólk fylgir tækninni eða verður eftir. Það sem sparast í fræðslu í dag kemur aftur sem atvinnuleysi á morgun.',
    shocks: { heimshagvoxtur: 2, frjosemi: -10 },
    choices: [
      { key: 'menntun', label: 'Endurmenntun og virk vinnumarkaðsúrræði', effect: { lever: { menntun: 25, atvinnuthatttaka: 12 } } },
      { key: 'deila', label: 'Deila framleiðnibatanum', effect: { lever: { fjarmagnstekjuskattur: 6, tilfaerslur: 12 } } },
      { key: 'atvinnulif', label: 'Lækka launatengd gjöld og hvetja til fjárfestingar', effect: { lever: { tryggingagjald: -3, ivilnanir: 20 } } },
    ],
  },

  // ── KT8 · 2054 — lýðfræðilega uppgjörið (ROUND_GOALS KT8 = ALLT metið) ─────────────────────────
  // SJOKK-RÖK (bæði VÆG — áskorunin er STRÚKTÚR, ekki högg):
  //   frjosemi −10 — sama þrep og KT7, viðvarandi. Uppsöfnuð áhrif, ekki stærð eins sjokks, eru málið.
  //   adflutningur −15 — öll nágrannalöndin eldast samtímis og keppa um sama vinnuaflið; Ísland getur
  //     ekki lengur gengið að innflæði vísu. Neikvætt frávik á móti +10 í KT1 — nákvæmlega ÖFUG stefna
  //     þess sem leikurinn opnaði á. |15| er á pari við útrásar-sjokkið (+15) og fjórðungur af mörkunum (−60).
  //   Mesta |shock| þessarar lotu er 15 — lokalotan á að vinnast eða tapast á sleðunum, ekki á heppni.
  {
    round: 8, year: 2054, icon: '⏳', title: 'Reikningurinn frá lýðfræðinni',
    text: 'Hagstofan birtir tölu sem búið var að spá í hálfa öld: fjölmennustu árgangar Íslandssögunnar eru komnir á eftirlaun og aldrei hafa jafn margir staðið að baki hverjum þeim sem er á vinnumarkaði. Heilbrigðis- og öldrunarþjónusta tekur sístækkandi hlut af ríkisútgjöldunum, lífeyrissjóðirnir eru risavaxnir en greiða nú út meira en inn kemur, og frjósemi hefur verið undir endurnýjunarmörkum í heila kynslóð. Aðflutningur bjargaði dæminu í þrjá áratugi — en núna keppa öll nágrannalöndin um sama fólkið og ekkert þeirra hefur nóg. Þetta er lokakjörtímabilið ykkar og engin leið er sársaukalaus: lengri starfsævi, hærri skattar, minni þjónusta eða fleira fólk. Það sem þið veljið núna er það sem þjóðin lifir við eftir 2058.',
    focus: 'Nú er allt metið í einu — loftslag, sjálfbærni, byggð og jöfnuður ofan á þjóðhagslega kjarnann. Þetta er lokaprófið á hvort þið byggðuð samfélag sem stendur undir sjálfu sér.',
    watch: 'Enginn einn sleði leysir lýðfræði. Lengri starfsævi, aukin atvinnuþátttaka, aðflutningur og framleiðni draga hvert sinn hluta af vagninum — aðgerðaleysi er dýrasta leiðin af þeim öllum.',
    shocks: { frjosemi: -10, adflutningur: -15 },
    choices: [
      { key: 'starfsaevi', label: 'Lengja starfsævina og auka atvinnuþátttöku', effect: { lever: { lifeyrisaldur: 3, atvinnuthatttaka: 12 } } },
      { key: 'folk', label: 'Sækja fólk — og byggja fyrir það', effect: { lever: { innflytjendastefna: 25, frambod: 20, leiguhusnaedi: 15 } } },
      { key: 'fjarmagna', label: 'Fjármagna velferðina og verja hana', effect: { lever: { skattar: 6, tilfaerslur: 12 } } },
    ],
  },
];

// SAMHÆFI: `choices` er höfundar-heitið (sbr. forskrift sviðsmyndarinnar), `responses` er SAMA FYLKIÐ
// svo resolve.mjs / game-validate.mjs / studio-ritillinn í client.mjs (sem öll lesa `.responses`) virki
// óbreytt. Sama tilvísun ⇒ ritill sem breytir öðru breytir hinu líka — engin afrit sem geta rekið í sundur.
for (const e of EVENTS) e.responses = e.choices;

export const SVIDSMYND_2058 = {
  id: 'island2026',
  heiti: 'Ísland 2026–2058',
  undirtitill: 'Framtíðin er óskrifuð',
  yearStart: 2026,
  rounds: 8,
  dials: {},        // baseline.json ER Ísland ~2026 → ENGIN spólun (ólíkt YEAR2000_DIALS)
  reality: null,    // engin raungögn til um framtíðina
  hefurSogu: false, // engin hagsaga → ekkert „Svona fór það í alvöru"-spjald
  erFramtid: true,  // aldrei nafngreindir (skáldaðir) framtíðar-ráðherrar
  blurb: 'Átta kjörtímabil frá deginum í dag: húsnæðisþakið, hafið sem hlýnar, ytra áfall, eldar sem '
    + 'standa í áratugi, orkan sem allir vilja, vélarnar sem taka við vinnunni og loks reikningurinn frá '
    + 'lýðfræðinni. Engin fyrirfram-gefin saga og enginn samanburður við raunveruleikann — aðeins '
    + 'ákvarðanir ykkar og afleiðingar þeirra. ATH: sviðsmyndirnar eru TILBÚNAR til kennslu og byggðar á '
    + 'þekktum þróunarlínum — þær eru ekki spá Karp um framtíðina.',
  events: EVENTS,
};
