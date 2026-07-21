# ÚTTEKT Á RÁS ÍSLANDS — LOKA-SKÝRSLA RITSTJÓRNAR

*Samantekt 10-sviða úttektar (peningar · ríkisfjármál · húsnæði · vinnumarkaður · auðlindir · fjármál · staðreyndir · strúktúr · vél · UI). Allir fundir hér að neðan stóðust andstæðinga-sannprófun gegn kóðanum. Tvítökur sameinaðar (t.d. heimilaskulda-stofninn kom upp á 3 sviðum, verðtryggingarrásin á 3, gengis-speglunin á 3).*

---

## 1. Heildardómur

RÁS Íslands er óvenju heilsteypt smíð: módel=gögn hönnunin (219 tengsl með stuðli, töf, öryggisbili og heimild), SFC-geirajöfnuðir með véla-nákvæmu tie-out, eigin OLS-kvörðun, söguleg bakprófun og gagnsæis-UI setja hann í fremstu röð opinna íslenskra herma — og frávika-heimspekin (einfalt, ekki DSGE) heldur alls staðar. Veikleikarnir eru hins vegar kerfisbundnir fremur en tilviljanakenndir og falla í fimm flokka: **(1) skölunarveilur** þar sem stuðlar tala ekki við realBase-stofnana (afkomu-áhrif smásleða allt að ~14× of stór, útgjalda-margfaldarar í öfugri röð) — sem bjagar beint KARP-bestunina; **(2) stofn/flæðis-ruglingur** (heimilaskuldir án sjálf-lykkju, ca_niip safnar ~3,6× of hratt); **(3) göt í séríslenskustu rásunum** — verðbólga snertir hvorki verðtryggðan höfuðstól né greiðslur, launa-verð-spírallinn endar á dauðu tengsli, hagsveifluháður aðflutningur vantar; **(4) vélarveilur** (clamp aðeins við birtingu, óvissu-bönd keðjast ekki, engin ósamhverfa); **(5) prófin eru formerkja-eingöngu** svo stærðargráðuvillur sleppa gegnum 90+ græn próf. Ekkert af þessu krefst arkitektúrbreytinga — allt er lagfæranlegt með gagna- og fárra-lína breytingum innan núverandi heimspeki.

---

## 2. 🔴 LAGA — raunverulegar villur, forgangsraðað

| # | Hvað | Hvar | Af hverju | Lagfæring |
|---|------|------|-----------|-----------|
| L1 | **Afkomu-stuðlar mult-sleða úr samhengi við realBase** — veidi_bal 0,03 er ~14× of stór (10,2 ma ≈ 0,21 %VLF, ekki 3,0); ivil_bal 11×, transf_bal 9×, mennt_bal 2,7×, innv_bal 2×; exp_bal á móti ~¼ of veikt. Tilfærslu-króna „kostar" ~36× meira en útgjalda-króna; KARP-bestun lærir bjagaða forgangsröðun | build_roads.mjs l.195/243/245/280/284/286 | Afkoma er bókhaldsstærð; coef skalar ekki með stofni. Engin kvörðun/komment ver gildin; backtest prófar aðeins formerki | Regla: coef ≈ ±(realBase/VLF)/100 per %: veidi_bal 0,002 · ivil_bal −0,003 · transf_bal −0,004 · mennt_bal −0,011 · innv_bal −0,02 · exp_bal −0,25..−0,31. Ef smásleðar „hverfa": stækka stofninn (t.d. tilfærslur → allar tilfærslur ~200 ma), ekki ýkja stuðulinn. **Laga SAMAN við B3 (gdp-margfaldarana)** |
| L2 | **infl_wageloop er DAUTT tengsl** — endar á sleðanum `laun`, vélin ítrar aðeins outcomes; seinni helmingur launa-verð-spíralsins (vísitölutenging kjarasamninga) keyrir ALDREI, en birtist samt sem virk rás í keðju-korti/Módel-töflu | build_roads.mjs l.176 + engine.mjs l.38–41 | Eina dauða tengslið af 219; söluvaran er gagnsæi en birt net ≠ hermt net; autoPhi bregst við atvinnuleysi, ekki verðbólgu, og er sjálfgefið af | Best: ný útkoma **launaskrid** (á undan kaupmattur): verdbolga→launaskrid 0,35 lag 4; launaskrid→kaupmattur 1,0 lag 0; launaskrid→verdbolga ~0,2 lag 2. Einfaldara: verdbolga→verdbolga sjálf-lykkja ~0,10 lag 5–6. **Óháð vali: build-gát sem kastar ef link.to ∉ outcomes** |
| L3 | **payroll_bal 0,06 brýtur samræmi tekjuhliðar** — tryggingagjald hefur stærsta stofninn per pp (~20 ma) en lægsta virkni-hlutfallið (0,14 vs ~⅓ hjá tax/vsk/capg); módelið raðar skattatækjum öfugt | build_roads.mjs l.389 | ~2,3× vanmat sem snýr við stefnu-niðurstöðu í findBest; ci_hi nær ekki einu sinni samræmda gildinu | Hækka í **0,14** (ci 0,09–0,19), lag óbreytt — sami ⅓-afsláttur og hin tekjutengslin |
| L4 | **heimilaskuldir eru STOFN án sjálf-lykkju** (eina stofnbrotið; skuldir/folksfjoldi/niip/fiskistofn hafa öll carry) — viðvarandi +5% útlánavöxtur gefur fasta +1,5 stiga hliðrun í stað vaxandi uppsöfnunar; heimildatextar tengslanna lofa sjálfir „uppsöfnun" | build_roads.mjs l.141, 343, 353, 384 | Vanmetur uppsafnaða áhættu útlánaþenslu stórlega í 10-ára ham — einmitt rásin sem breytan er til fyrir (hdebt_arrears/hdebt_gdp) | **hdebt_carry** 0,97–0,98 lag 1 + endurskala innflæði á ársfjórðung (credit_hdebt 0,3→0,075; house_hdebt 0,25→0,06; vt_hdebt 0,08→0,02); athuga clamp [55,185] í 40Q; okPopStock-stíl próf |
| L5 | **Svæðis-húsnæðið ósamkvæmt landstölunni** — frambod/lodaframbod hafa ENGIN tengsl í husnaedi_hbs (þótt ~70% nýbygginga séu á HBS); bind_house/credit_house snerta hvorugt svæði; tour_hbs snertir ekki landstöluna. Hetjugraf teiknar allar þrjár línur saman → höfuðborgarlínan frýs undir eigin sleðum flipans | build_roads.mjs l.308–322; hermir.astro l.261 | Sýnileg mótsögn í aðal-flipa; vigtað samræmi brotið (0,64·0+0,36·(−0,35)=−0,126 ≠ −0,30) | Bæta við **fr_hbs −0,28 lag 4** og **loda_hbs −0,13 lag 6** (vigtuð summa ≈ þjóðar-coef); íhuga bind/credit-speglun á svæðin og tour_house +0,02. Verja með samræmisprófinu í V2 |
| L6 | **ca_niip 0,9 safnar CA ~3,6× of hratt í NIIP** — CA er árs-eining en vélin keyrir ársfjórðunga; módelið notar sjálft /4-regluna annars staðar (bal_debt −0,25, growth_pop 0,25) | build_roads.mjs l.363 | +1 %VLF CA-frávik hækkar NIIP um ~3,6 %VLF/ári í stað ~1; skekkir birtan stofn OG niip_fx-endurgjöfina í gengið | Lækka í **0,25** (ci 0,15–0,35), note „≈CA/4 per ársfj."; endurkeyra bakpróf |
| L7 | **Clamp er aðeins birtingar-lag** — útbreiðslan les óklippt dev; við öfgar víkja sýnt og hermt ástand í sundur (mælt: skuldir birt 10 / útbreitt −18; niip 90 / 206) og lo/hi klippast sjálfstætt svo bandið hrynur í núll við þak | engine.mjs l.53 + 64–72 | Álagspróf/tornado keyra einmitt á jaðrunum; bestunin sér annað ástand en hermt er | **Ástands-clamp í tímalykkjunni**: dev[to][t] = clamp(path+d) − path; klippa unc út frá klipptu miðgildi; endurkeyra öll ~90 próf |
| L8 | **Óvissu-bönd keðjast hvorki gegnum milliliði né stofna** — u += \|band·fd\| notar aldrei unc[from]: kaupmáttur (kennisetning, band=0) sýnir 0,10 vs MC 1,57 (~15× vanmat); einkajöfnuður band ≡ 0; skuldir 6× vanmat; beinar rásir á móti ofmetnar (fullkomin fylgni) | engine.mjs l.55–56; hermir.astro l.424 | „Skyggt = óvissa" er kerfisbundið villandi í báðar áttir — verst fyrir hagvísana þar sem óvissan skiptir mestu | Ein lína: **u += \|coef\|·unc[from][s]** fyrir útkomu-uppsprettur (+applyNL á band-lið); og/eða láta skyggða svæðið koma úr runMC-percentílum og merkja analytísku böndin sem fyrsta-stigs nálgun |
| L9 | **Greiningar-flipinn hunsar sjálfvirka peningastefnu** — simFull notar state.levers en aðal-sýnin keyrir solveLevers (lausn aðeins í state._sol): tornado/skiptijaðar/markmiðaleit/álagspróf reikna sviðsmynd sem notandinn horfir ekki á | hermir.astro l.852, 858–860, 929–931 | Ósamkvæmni milli flipa í sama tóli; runMC gerir þetta rétt — innri mótsögn, ekki hönnunarval | simFull byrji á `{...solveLevers(), ...ov}` (cache per runAnalysis); einnig cur (l.858) og curV (l.881). Álagspróf ætti helst að endur-leysa Taylor MEÐ sjokkunum — a.m.k. skjala valið |
| L10 | debt_bal −0,006 = ~0,6% virk vaxtakjör á jaðar-skuld þótt RIKB-krafan sé 6,8–8,5% — skulda-snjóboltinn nánast enginn | build_roads.mjs l.254 | >10× vanmat; halli hleður upp skuldum án vaxtabyrðar á móti | Hækka í **−0,05** (ci −0,07..−0,03), lag 2–4; lykkjustyrkur 0,013/ársfj. — stöðugt |
| L11 | vsk_kaup −0,05 tvítelur VNV-farveginn sem kennisetningin (vsk_infl→infl_wage) fangar þegar → −0,20 í stað −0,15 (~33% ofmat); kolefnisgjald/olía fá RÉTT engin auka-kaupmáttartengsl | build_roads.mjs l.278 vs 276+172 | Regla módelsins er skjalfest annars staðar (anti-tvítalningar-nótur) en gleymdist hér | Fjarlægja vsk_kaup (eða −0,02 sem hreinn ekki-VNV farvegur m/note). Label kaupmattur → „Kaupmáttur ráðstöfunartekna" ef tax/transf/burden_kaup standa; skjalfesta að VNV-farvegir fá aldrei auka-kaupmáttartengsl |
| L12 | Aðgengi: sleðar án aria-label/aria-valuetext (skjálesari les hrátt frávik, ekki „10,2 ma.kr."), hover-eina keðju-highlight, title-only tooltips, tabbar án role/aria-selected, ekkert :focus-visible | hermir.astro l.546–557, 470, 994–997 | WCAG 4.1.2/1.4.13/2.4.7 brot á opinberri síðu | aria-label+aria-valuetext (disp()) í mk()/syncSlider; focusin/focusout spegla hover; role=tablist/tab + aria-selected; focus-visible outline |
| L13 | scenarios.json (27 sviðsmyndir m/frásögnum) byggt og endurnýjað daglega en ENGINN neytandi eftir að hnapparnir voru fjarlægðir | build_roads.mjs l.415–449; refresh-data.yml l.173 | Dauð CI-afurð án eiganda | Annaðhvort hætta að skrifa — eða betra: fréttavélar-detector parar raunatburði (vaxtaákvörðun, kjarasamninga) við sviðsmynd → hlekkur á /hermir/# með forstillingum + sentence sem grundaðan texta |

---

## 3. 🟡 BREYTA — endurkvörðun/endurhönnun

| # | Hvað | Breyting | Rök |
|---|------|----------|-----|
| B1 🔴* | **r_land −0,7 stangast á við eigin OLS** (−1,619, ci [−2,43;−0,81], validated:false — gögnin segja landsbyggð a.m.k. jafn vaxtanæma og HBS) og bakprófið okHbsMoreSensitive NEGLIR öfugu röðunina fasta | \|r_land\| → ≥0,85 (t.d. −0,9), r_house → ≈−0,9 (vigtað samræmi), okHbsMoreSensitive → samhverft próf („munur <0,3pp") eða fellt; uppfæra tooltip l.300 | Öfug röðun getur snúið byggða-niðurstöðu vaxtasviðsmynda; mótsögnin blasir við á 📐-spjaldinu |
| B2 🔴* | **tour_exp 0,04 vs kvoti_exp 0,20/orka_exp 0,25** — ferðaþjónusta er STÆRSTI útflutningsliðurinn (~37% 2024) en svarar ~6× veikar; rótin: ál/fiskur rata í VLF um útflutning, ferðaþjónusta beint um tour_gdp | tour_exp → **0,25–0,30**, lækka/fjarlægja tour_gdp á móti (sama keðja og hinar greinarnar: →utflutningur→exp_gdp2); trimma líka tour_ca gegn tvítöldun í CA | Útflutnings-kortið, endógena gengislykkjan og CA fá rétt vægi; VLF-heildarnæmi ~óbreytt |
| B3 | **Útgjalda-margfaldarar per krónu í öfugri röð** (ívilnanir 7,1 · tilfærslur 4,7 · innviðir 2,1 · menntun 1,8 · útgjöld 0,16 — ritrýnin segir fjárfesting hæst, tilfærslur lægri) | exp_gdp ≈0,12 (~0,4) · innv_gdp ≈0,025 (~1,3) · transf_gdp ≈0,003 · ivil_gdp ≈0,002 (~0,7); mennt_gdp má halda | Sama rótarorsök og L1 — **VERÐUR að laga saman**, annars verða smásleðarnir eintómur kostnaður |
| B4 | **Laffer-mettun aðeins á tax_bal** — VSK/tryggingagjald/fjármagnstekjuskattur gefa „ókeypis" línulegar tekjur; capg er þó teygnasti stofninn | sat-nl: vsk_bal k≈0,6 · payroll_bal k≈0,5 · capg_bal k≈0,2; spegluð Laffer-próf fyrir alla fjóra | Fjarlægir módel-ósamhverfu sem bestunin nýtir |
| B5 | **infl_persist 0,25** — verðbólgusjokk deyr á 1–2 ársfj.; eigin OLS 0,918 (yfirlapps-leiðrétt ~0,55–0,70) | Hækka í **~0,5** (ci 0,35–0,65); sannreyna stöðugleika (40Q); yfirlapps-nóta í calibrate_roads (AR1 á yoy hefur ~0,75 vélrænt gólf) svo validated-dómur sé sanngjarn | Verðbólgustjórn lítur of auðveld út; ath: jafnvægis-margfaldari viðvarandi sjokka hækkar ~+55% — bakprófa |
| B6 | **fr_house −0,30 er ~7× yfir stofn-flæðis-mati** (3,2þ íbúðir/ári á ~160þ stofn; +10% flæði ≈ −0,3..−0,4pp, ekki −3,0 viðvarandi) | fr_house → ≈−0,10 · fr_land → ≈−0,12 · fr_rent → ≈−0,05 — EÐA endurskilgreina sleðann sem margra ára stofnbreytingu og skjalfesta í note; uppfæra sviðsmynda-setningar | Í 10-ára ham gefur +40% framboð −12pp/ári á verðvöxt — út úr korti |
| B7 | **house_burden 0,40 meðhöndlar VAXTAR-frávik sem stig** — greiðslubyrði á að fylgja verðSTIGI gegnum skuldastofn | Nýtt **hdebt_burden** (heimilaskuldir→greidslubyrdi +0,12 lag 1) + lækka house_burden í ~0,15 — krefst L4 (stofn-lykkju) fyrst | Verðvöxtur→stofn→byrði safnast þá rétt; vanmatið smitast annars í vanskila-blokkina |
| B8 | **Hæg-virk tengsl með 1–1,5 árs töf fyrir áratugafyrirbæri** — menntun skilar fullri framleiðni eftir 15 mán., skógrækt fullri bindingu eftir 1 ár | mennt_gdp 5→16 · mennt_innov 4→10 · edu_unem 6→12 · skog_emis 4→16 · clim_gdp/clim_fisk 4→16 (hrein tímafærsla, coef óbreytt); laga okEduUnem-prófið samhliða; próf: mennt-áhrif ≈0 við Q12, >0 við Q39 | Tímalínur langtíma-hamsins (sölupunkturinn) beinlínis villandi |
| B9 | **Vélin styður enga ósamhverfu** — accel notar \|x\| (samhverft) þótt öll þrjú accel-tengslin lýsi einhliða fyrirbæri, og gengisyfirfærsla/launatregða/Okun eru samhverf | Tvær litlar viðbætur í applyNL: (a) **nl.side:'pos'/'neg'** á accel → setja side:'pos' á debt_spread/arrears_gdp/w_infl; (b) **nl.asym {up,dn}** → fx_infl/fxendo_infl {0,6/1,4}, infl_wageloop {1/0,2}, gdp_unem {0,7/1,3}. ⚠ **asym VERÐUR að lykla á formerki UPPSPRETTU-fráviks** (ekki coef·frávik) — annars snúast greinarnar öfugt á neikvæðum stuðlum | Jákvæðu öfga-sviðsmyndirnar (skuldaniðurgreiðsla, launalækkun) eru í dag of glansandi — og bestunin nýtur þess |
| B10 | **part_labor/retire_labor**: varanlegt vaxtar-frávik fyrir stigs-áhrif — þátttökusleði gefur +11–12% stærra vinnuafl á 10 árum þótt þátttaka sé þegar ~82% | part_labor fær **nl:{sat,k:0,9}**; retire_labor stendur + note „stigsáhrif fösuð yfir MAXQ=40"; stöðugleikapróf: uppsafnað <+8% | Bjagar langtíma-bestun ~1,5× í átt að þátttöku-sleðanum |
| B11 | **Vaxtabyrði heimila í kaupmætti ~10× of veik** (r_burden×burden_kaup = −0,025pp/pp; skuldir ~150% ráðstöfunartekna) — nettó BÆTIR vaxtahækkun kaupmátt í dag | Nýtt beint tengsl **vextir→kaupmattur −0,08 lag 2** (samtals ~−0,11pp/pp, enn hóflegt) — ekki blása upp burden_kaup (ber líka húsnæðisrásina) | Togstreitan verðbólguvörn vs kjör — kjarninn sem stjórnklefinn á að sýna — er ósýnileg |
| B12 | **runMC**: uniform-drag á [ci_lo,ci_hi] + fullt fylgnileysi 219 tengsla → viftan kerfisbundið of mjó fyrir samstæðar rásir (mælt: verðbólga MC 1,4–1,7 vs analytískt 2,0) en kynnt sem 5–95% líkindabil | Normal-drag (ci=95% CI, klippt ±2σ) + sameiginlegur þáttur per uppsprettu (ρ≈0,3–0,5); skjalfesta að stefnureglan er fryst yfir dregin heimshorf | Birtar P(áhættu)-tölur skakkar |
| B13 | **healthScore**: nýsköpunar-BÓNUS án refsingar undir 100 — einstefnuloki (rústun nýsköpunar ókeypis) og bónus „kaupir syndaaflausn" af raunrefsingum; vogir hvergi skjalfestar | Samhverfa: +max(0,100−nyskopun)·0,06; skjalfesta vogirnar (×7 verðbólga o.s.frv.) í tooltip/Módel-flipa; próf: −20 stig nýsköpun → lægra heilsufar | Markfall KARP-hnappsins og birtur aðal-mælir |
| B14 | **Tornado ±25%** vanmetur jaðar-base sleða ~2× (leiguhusnaedi/fridun/skograekt/ferdamannagjald geta aðeins hreyfst upp); .tor-mid CSS skilgreint en aldrei notað | Normalisera impact með raunverulegu spani; klára tvíhliða tornado um miðjustrik | Röðunin „hvað hreyfir mest" ósanngjörn milli sleða-flokka |
| B15 | **Valens verðbólgu einstefnu (−1)** en heilsufar refsar fráviki frá 2,5% í báðar áttir — verðhjöðnunar-sviðsmynd fær grænt kort en fallandi heilsufar (sannreynt: vextir 12 + bindiskylda 15 → −0,6% verðbólga, GRÆNT) | Sér-tilvik í valence(): bera saman \|end−2,5\| vs \|bauEnd−2,5\| (±0,05 dauðasvæði); POLARITY óbreytt f. tornado | Litir og mælir segja ósamrýmanlegar sögur |
| B16 | **Fjármál-hero**: CA (~2 %VLF) og NIIP (~30–35) á deildum ás → CA-línan flöt út | Hero → geira-jöfnuðirnir þrír ['vidskiptajofnudur','afkoma','einkajofnudur'] (sami skali + sýnir SFC-kennisetninguna sjónrænt); NIIP heldur sínu korti | Aðal-rit flipans gerir megin-seríu sína ólæsilega |
| B17 (lágt) | Keðju-kort: „smelltu" lofað án click-handlers (snertiskjár óvirkur); sjálf-lykkjurnar 5 síaðar út án merkis | Click-pin á hnút; ⟳-tákn + legend-lína fyrir stofn-hnúta | Mikilvægasta strúktúr-einkennið sést ekki |
| B18 (lágt) | Markmiðaleit/skiptijaðar sniðganga realDec — „15 ma.kr." í stað „15,3" | Eitt deilt decFor()-fall (mynstur l.549) í báðar leiðir | Tvö dec-mynstur í sömu skrá |
| B19 (lágt) | Eignaverðs-rásir ekki framsýnar — gengi/hlutabréf bregðast einu skrefi of seint við boðaðri vaxtaleið í dýnamísku KARP | Tvö lead-tengsl (mynstur exp_rate): vextir→gengi_endo +0,5 lead 4 · vextir→hlutabref −0,5 lead 4; núll á fastri leið → öll próf standast | UIP er framsýn kenning, útfærð eingöngu með töf |

*\*B1/B2 eru hátt-alvarleika breytingar — meðhöndlast sem forgangsmál (sjá kafla 6).*

---

## 4. 🟢 BÆTA VIÐ

### (a) Ný orsakasambönd

| From → To | Formerki/coef | Lag | Rök |
|-----------|---------------|-----|-----|
| **verdbolga → heimilaskuldir** | +0,12/ársfj. (m. L4-carry; annars +0,4 fast) | 1 | Verðbætur á höfuðstól — ~60% stofns verðtryggður (SÍ); í dag LÆKKAR verðbólgusjokk skuldir undir Taylor (öfugt við 2009/2022–24). Kjarna-séríslensk rás; víxlverkun við verdtrygging-sleðann skjalfest í note (línuleg vél) |
| **verdbolga → greidslubyrdi** | +0,4 vísit/pp | 1 | Greiðslur verðtryggðra jafngreiðslulána fylgja VNV (HMS/SÍ 2023) |
| **hagvoxtur → skuldir** | −0,10 %VLF/pp | 1 | Nefnara-liðurinn í Δd≈−pb−d(g+π)/400 — spegill infl_debt sem gleymdist; ~−3,9 %VLF vantar per pp yfir 40Q. (Sleppa/milda infl_debt-hækkun v. verðtryggðra ríkisbréfa) |
| **hagvoxtur → vidskiptajofnudur** | −0,25 %VLF/pp | 1 | Innflutnings-leki (jaðarhneigð >40%; CA fór í ~−20% 2005–08 af innlendri eftirspurn); tvíburahalla-rásin vantar alveg — örvun sýnir engin ytri fórnarskipti |
| **niip → vidskiptajofnudur** | +0,04 per %VLF | 1 | Frumþáttatekjur (~4% ávöxtun); lokar opnu ytri-stöðu-lykkjunni. **Gera EFTIR L6** svo lykkjan skalist rétt |
| **gengi (sjokk) → vidskiptajofnudur** · **→ vlf_ferda** | −0,06 · −0,12 | 2 · 1 | Speglun: gengi_endo hefur fx_ca/fx_vlff en sjokkið ekki — lodnubrestur vanmetur CA ~4×. Regla í athugasemd: hvert nýtt gengi_endo-úttengsl speglast á sjokkið |
| **vedhlutfall → utlanavoxtur** · **dsti → utlanavoxtur** | +0,12 hvort | 2 | LTV/DSTI eru BEINT tæki á útlánavöxt (SÍ 2021–23) en hoppa í dag framhjá honum; lækka ltv_house/dsti_house 0,15→0,12 á móti; uppfæra tooltip l.303 |
| **utlanavoxtur → peningamagn** | +0,5 (r_m3 −0,9→−0,4) | 1 | Lán skapa innlán (BoE 2014); bindiskylda hreyfir þá loks M3 — bókhaldsleg samkvæmni |
| **vextir → leiga** | +0,25 %/pp | 1–2 | Útilokun fyrstu kaupenda + fjármagnskostnaður leigusala; í dag spáir módelið að vaxtahækkun LÆKKI leigu (öfugt við HMS +15,1% 2024 við 9,25% vexti); nettó ≈0 til langs tíma þegar óbeina rásin (töf 4) vegur á móti |
| **atvinnuleysi → kaupmattur** (eða → launaskrid ef L2b) | −0,12 pp/pp | 2 | Endógent launaskrið — í grunnstillingu (autoPhi af) hefur þensla ENGIN launaáhrif og kaupmáttur lækkar bara; note um skörun við autoPhi (samningur vs skrið) |
| **hagvoxtur → vinnuafl** · **→ mannfjoldi** | +0,12 · +0,04 | 2 | Hagsveifluháður aðflutningur — helsta aðlögunarrás íslensks vinnumarkaðar (2017: +8.240 nettó); dempar ofhitnun. ⚠ Sameinuð úr tveimur sviðum: veljið AÐRA leiðina (hagvöxts- eða atvinnuleysis-drifna −0,12/−0,20) á fullum styrk, ekki báðar — þær tvítelja gegnum gdp_unem |
| **innflytjendastefna → mannfjoldi** | +0,012 | 2 | Fólkið sem fær atvinnuleyfin telur í dag ekki í höfðatölunni (0:0,02 vs 0,67-hlutfall adflutnings); hero-röð lýðfræði-módúlsins röng |
| **byggdastefna → afkoma** | −0,02 %VLF/% | 1 | Eini hvata-sleðinn án kostnaðar — net-JÁKVÆÐUR á afkomu gegnum byggd_gdp → frír hádegisverður í KARP/markmiðaleit |
| **frjosemi → framfaersla** | +0,02 vísit/% | 3 | Börn eru framfærsluþegar (0–19 er stærri hluti hlutfallsins en 65+); gefur fræðandi mótsagnasvar: minni frjósemi LÆKKAR hlutfallið innan 10 ára; víkka tooltip l.295 |
| **heimshagvoxtur → vaxtaalag** | −0,12 pp/% (íhuga accel side) | 1 | Risk-off smit smáríkja (CDS 2008/2020); fullkomnar keðjuna heimskreppa→álag→spread_fx→króna→verðbólga |
| **heimshagvoxtur → hlutabref** | +1,2 vísit/% | 1 | ICEX fylgir alþjóðlegri áhættusækni (OMXI10 −27% 2022 á erlendum fréttum); keðjast rétt í lífeyriseignir |
| **lifeyriseignir → vaxtaalag** (+valkv. → gengi_endo) | −0,01 per %VLF (· −0,05) | 2 | Stærsta kerfi heims hlutfallslega (175% VLF) er nær-einangrað; sjóðirnir ráðandi RIKB-kaupendur + stærsti flæðisþáttur gjaldeyrismarkaðar |
| **vanskil → utlanavoxtur** | −0,06 %/vísit (accel side:'pos') | 2 | Framboðshlið útlána (2009–11); í dag ýtir Taylor útlánum UPP í kreppu meðan vanskil rjúka upp; arrears_gdp-heimildin fullyrðir sjálf rásina |
| **husnaedi → husnaedi** (sjálf-lykkja) | −0,08 | 6 | Framboðssvörun byggingargeirans (fullgerðar íbúðir ~þrefölduðust 2018–21 eftir hækkanir 2015–17) — eina jafnvægisaflið á verðhlið er annars clamp |
| **ferdamenn → byggdajofnudur** · **fridun → byggdajofnudur** | +0,02 · −0,03 | 2 | Ferðaþjónusta dreifir virðisauka á landsbyggð (mótsögn: ferdamannafall-sviðsmynd „bitnar á Suðurnesjum" en byggðajöfnuður hreyfist ekki); friðun speglar veidi_byggd |
| **tryggingagjald → kaupmattur** | −0,03 (neðri ci m.v. autoPhi-skörun) | 3 | Incidence launaskatta færist á laun; klassískt skiptimynt kjarasamninga |

### (b) Nýir sleðar/sjokk

- **fiskeldi** (sleði, realBase ~framleiðsla í þús. tonnum, mynstur kvoti-sleðans): →utflutningur (+0,03–0,05, ekki 0,08 — hlutdeildarrökfræði módelsins), →vlf_sjavar +0,10, →byggdajofnudur +0,05, →fiskistofn −0,02 (erfðablöndun; skjalfesta „villtur stofn"-túlkun í source). Útflutningur 53,8 ma 2024, ör-vaxandi, sterk byggða- og sjálfbærni-vídd — vantar alveg.
- **votlendi/landgræðsla** (sér-sleði með votlendi→losun −0,12 lag 4–8, eða útvíkka skograekt): framræst votlendi er stærsta einstaka losunaruppspretta landsins (nettó LULUCF ≈57% heildarlosunar) — stærsta loftslags-vogarafl Íslands er ekki í loftslags-módúlnum. Landbúnaðar-framlag í losun: íhuga (veikara, að hluta í gdp_emis).

### (c) Nýjar útkomur, viðmið & varnir

**Útkomur/diagnostík:**
- **launaskrid** (eða nafnlaun) útkoma — lausnin á L2 og heimili fyrir launaskriðs- og vísitölutengingar-rásirnar.
- **Aflaregla-viðmið** í Auðlindir-flipa: ráðlagt-TAC ≈ grunn-TAC×(fiskistofn/100) við hlið valins kvóta + viðvörun við verulega umframsókn (Hafró 20%-reglan; grunnurinn geymir hana þegar).
- **Fjármálareglur LOF 123/2015**: viðmiðslínur y=−2,5 (afkoma) og y=30 (skuldir) á kortin, „⚖️ fjármálaregla brotin"-merki, brot-ársfjórðungar í álagsprófi; samræma fjóra ósamkvæma ad-hoc þröskulda (healthAt 45-skuldaþak liggur OFAN alls grunnferils = dauð refsing).
- **MC-vifta á smákort/yfirlit**: lyfta eff() úr drawHero í drawCharts/drawTrace (fjólublátt band aðgreinir frá CI-gulu) — í dag tveir ósamrýmanlegir óvissu-skalar á sama skjá.
- **inv-target**: eining við reitinn + default = núverandi lokagildi valinnar útkomu (2,5 á vísitölu-útkomu skilar alltaf „⚠ næst ekki").
- **POLARITY-tooltip húsnæðis**: setning um að litamat miðist við viðráðanleika (kaupendur/leigjendur) þótt eigendur hagnist — auðsáhrifin séu samt í módelinu (wealth_gdp).

**Innbyggðar varnir & próf (hefðu gripið marga LAGA-fundina):**
1. **Build-gát: link.to ∈ outcomes** (grípur L2-flokkinn, ~ókeypis).
2. **Bókhaldslegt efri-mark per mult-sleða**: |Δafkoma| ≤ 1,5·slider%·realBase/VLF (grípur L1); röðunar-krosspróf tekjuhliðar leitt af raunstofnum (aðeins „capg síðast" er róbúst).
3. **Vigtað svæða-samræmispróf**: |0,64·c_hbs+0,36·c_land−c_nat| ≤ max(0,05; 25%·|c_nat|) fyrir öll húsnæðis-tengsl (grípur L5 og framtíðar-rek).
4. **8 stefnupróf fyrir prófalausu inntökin**: olia, gengi, vedhlutfall, leiguhusnaedi, lodaframbod, atvinnuthatttaka, innflytjendastefna, skograekt — 24 tengsl aldrei virkjuð í backtest í dag (öll 8 sannreynd græn gegn vélinni).
5. **lead-vörður í verify_roads_model.mjs**: villa ef lead-tengsl á ekki-exogena uppsprettu (fellur í dag ÞEGJANDI í lag-slóð með rangri merkingu).
6. **solveLevers**: early-exit við max(|ΔL|)<step/2, þak 20 ítranir + console.warn; samleitnipróf með báðar reglur virkar (verður brýnt ef B5 hækkar infl_persist).

---

## 5. 💯 Rauntölu-leiðréttingar

*Allar nema verðtrygging eru birtingar-eingöngu (realBase snertir ekki hermunina) — en birting rauntalna er auglýst kjarnaeign hermisins.*

| Sleði | Röng tala | Rétt tala | Heimild |
|-------|-----------|-----------|---------|
| kolefnisgjald | realBase 5,9 þús.kr/t CO₂ | **10,5** (bensín 24,25 kr/l ÷ 2,31; dísil 28,30 ÷ 2,67) | Skatturinn, gjaldskrá 1.1.2026 |
| veidigjald | realBase 10,2 ma.kr | **17,3** (innheimt 2026; álagt ~19,5) | Lög nr. 55/2025 (gildist. 1.11.2025), fjárlagagögn |
| ferdamannagjald | realBase 600 kr/nótt | **800** (flokkar II–IV; 400 tjaldsvæði — í note) | Fjárlagabandormur 2026 / Skatturinn |
| skograekt | realBase 4 þús. ha/ári | **2,5** (4–5þ er sviðsmynd 2028+, ekki raunumfang) | Landsáætlun í skógrækt 2022–2032 |
| verdtrygging | base 40% nýrra lána | **~20%** (hrundi eftir vaxtadóm Hæstaréttar okt 2025; mars 2026 ~15% hreinna nýrra) — íhuga gagnadrifið úr HMS/SÍ eins og vextir | HMS mánaðarskýrslur, SÍ Hagvísar |
| tilfaerslur | label „barna-/vaxtabætur" | label → „barnabætur o.fl." eða uppfæra realBase samhliða (vaxtabætur felldar niður frá 2027) | Fjárlög 2026 / þskj. 157 |

---

## 6. Forgangsröðun — topp 10 aðgerðir

1. **Mult-sleða endursköpun: afkoma + margfaldarar saman (L1+B3+L3+L10)** — stærsta kerfisbundna skekkjan; lagar bæði birt gildi og bjagaða KARP-bestun með einni samræmdri reglu (coef ∝ realBase/VLF).
2. **infl_wageloop → launaskrid-útkoma + build-gát á link.to (L2)** — dauð kjarnrás í vöru sem selur gagnsæi, og gátin ver allar framtíðar-tengslaviðbætur ókeypis.
3. **Verðtryggingar-/skuldapakki heimila (L4 + verdbolga→hdebt/burden + B7)** — þekktasta séríslenska smitleiðin fær loks rétt formerki OG rétta uppsöfnun; ein samhangandi lota.
4. **Vélarlagfæringar: ástands-clamp + óvissu-keðjun (L7+L8)** — tvær hátt-villur í sömu skrá; laga saman og endurkeyra öll próf einu sinni.
5. **Ytri-stöðu-pakki: ca_niip 0,25 + hagvoxtur→CA + niip→CA + gengis-speglun (L6 + a-liðir)** — module 13 verður innbyrðis samkvæmur og tvíburahalla-fórnarskiptin birtast; röðin skiptir máli (L6 fyrst).
6. **tour_exp endursköpun útflutnings (B2)** — stærsti útflutningsliður landsins fær rétt vægi í flagship-útkomu, gengislykkju og CA; einföld stuðlabreyting.
7. **Greiningar-flipi noti solveLevers (L9)** — tornado/markmiðaleit/álagspróf reikna loks sviðsmyndina sem notandinn horfir á; lítil breyting, mikill trúverðugleiki.
8. **Húsnæðis-svæðapakki: fr_hbs/loda_hbs + r_land-endurkvörðun + samræmispróf (L5+B1+V3)** — eyðir sýnilegustu mótsögn hermisins (frosin höfuðborgarlína) og OLS-mótsögninni á 📐-spjaldinu í einu.
9. **Rauntölu-uppfærslur (kafli 5)** — ódýrasta aðgerðin á listanum; sex tölur sem blaðamenn og pólitíkusar munu reka augun í (veiðigjald sérstaklega).
10. **Prófa- og varnarpakkinn (c-liðir 1–5)** — breytir úttektinni úr eins-skiptis hreinsun í varanlega vörn; hefði sjálfur gripið meirihluta LAGA-listans.

*Næsta lota þar á eftir: heimskreppu-smit (vaxtaalag/hlutabréf), lífeyris-tengslin, vanskil→útlán, ósamhverfu-vélin (B9 — með formerkis-fyrirvaranum), infl_persist-hækkun (B5, krefst solveLevers-varnarins), fiskeldi og votlendi.*