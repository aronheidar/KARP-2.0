// KENNSLUHANDBÓK LEIKSTJÓRA — ýtarleg leiðsögn fyrir hvert kjörtímabil (2000–2032).
// Aðeins fyrir leikstjóra (inniheldur „svörin"). Ráð eru GRUNDUÐ í herminum (besta-spils-greining á miðlungs)
// + sögulegu samhengi sviðsmyndarinnar. `settings` = ráðlagðar sleða-hreyfingar með stefnu + rökum.
// Á ERFITT: sömu áherslur en böndin þrengri, áföllin harðari og refsing við falli þyngri → minna svigrúm fyrir mistök.
export const HANDBOOK = [
  { round: 1,
    situation: '2000. Góðæri og jafnvægi: lágt atvinnuleysi, myndarlegur vöxtur, bankar nýlega einkavæddir. Úti í heimi springur netbólan (vægt heimshagvaxtar-áfall).',
    varast: 'Freistingin er að ýta undir vöxtinn — en froða og skuldasöfnun heimila á fyrsta degi verða að vandamáli í KT2–3. Eina markmiðið sem er raunverulega í hættu strax er VERÐBÓLGA.',
    strategy: 'Haltu stöðugleika og lífskjörum. Örlítið aðhald í verðbólgu án þess að drepa vöxtinn. Ekki eyða um efni fram þótt vel gangi — þetta er grunnurinn að öllu sem á eftir kemur.',
    settings: [
      '💵 Tekjuskattur / VSK örlítið NIÐUR — kælir verðbólgu og styður kaupmátt (án þess að meiða vöxt).',
      '🏦 Bindiskylda banka aðeins UPP — hemur útlánavöxt og froðu.',
      '⚖️ Halda stýrivöxtum stöðugum og forðast stórar örvunar-aðgerðir (innviða-púls o.þ.h.).' ] },
  { round: 2,
    situation: '2004. Útrásin: bankar þenjast út erlendis, 90–100% íbúðalán, ódýrt lánsfé, sterk króna, húsnæðisverð rýkur (mikill aðflutningur + gengis-styrking).',
    varast: 'Í STIGUM er þetta „róleg" lota — og það er GILDRAN. Ofhitnun, viðskiptahalli og skuldsetning heimila hlaðast upp og springa í KT3. Aðhald núna er óvinsælt en ver ykkur gegn falli.',
    strategy: 'Notaðu góðærið til að BYGGJA VARNIR, ekki bara njóta. Herða lánþegaskilyrði og safna í ríkissjóð — jafnvel þótt stigin refsi ekki aðgerðaleysi. Sjálfbær sjávarútvegur og heilbrigður húsnæðismarkaður halda velli þegar froðan sjatnar.',
    settings: [
      '🏘️ Herða veðhlutfall + DSTI (greiðslubyrðarþak) NIÐUR — hemur húsnæðisbóluna sem sprakk 2008.',
      '🏦 Bindiskylda UPP — dregur úr útlánavexti bankanna.',
      '💰 Lítils háttar skattahækkun / útgjalda-aðhald — safna varasjóði fyrir áfallið.',
      '📊 Stór ákvörðun: íhugaðu aðhald á fjármálakerfið (útrásina) — hægari vöxtur nú, traustara kerfi síðar.' ] },
  { round: 3,
    situation: '2008. Bankahrunið: gengið hrynur ~35%, heimskreppa, verðbólga í tveggja stafa tölu, verðtryggð lán stökkbreytast, atvinnuleysi margfaldast.',
    varast: 'ENGIN sársaukalaus leið. Þið getið EKKI lagað allt — verðbólga og kaupmáttur hrynja hvað sem þið gerið. Markmiðið er að LIFA AF, ekki að vinna. (Á Erfitt er hámark ~55–60 stig þessa lotu — það er eðlilegt og gott umræðuefni.)',
    strategy: 'Þjóðhagslegur stöðugleiki er í reynd eina markmiðið. Herða fjármálakerfið til að stöðva flóttann og kæla verðbólgu — en verja heimilin frekar en að skera allt niður. Þetta er stærsta prófraunin.',
    settings: [
      '🏦 Bindiskylda banka UPP (langöflugasta tólið hér) — stöðvar fjármagnsflótta og stöðugar kerfið.',
      '💵 VSK + tekjuskattur NIÐUR — verndar kaupmátt heimila í verðbólgunni.',
      '🏘️ Auka nýbygginga-framboð + lækka veðhlutfall — mildar húsnæðis-höggið.',
      '💰 Hóflegt útgjalda-aðhald — halda ríkissjóði á floti EN ekki kremja hagkerfið.',
      '📊 Stórar ákvarðanir: Icesave (greiða/hafna) og bankarnir (þjóðnýta/einkavæða) — kjarna-umræðuefni.' ] },
  { round: 4,
    situation: '2012. Endurreisn í höftum: fjármagnshöft verja krónuna, fyrstu ferðamennirnir koma, hagkerfið réttir hægt úr sér. Ríkissjóður skuldsettur, heimilin þung, byggðirnar báru hitann.',
    varast: 'Verðbólga er ENN há (eftirhreytur hrunsins) og er veikasti hlekkurinn. Jafnvægið milli þess að greiða niður skuldir og fjárfesta í viðspyrnu: of hart aðhald kæfir batann, of laust eykur skuldirnar.',
    strategy: 'Hemja verðbólguna en verja heimilin sem bera enn byrðar. Blása lífi í byggðirnar án þess að sprengja skuldirnar aftur upp.',
    settings: [
      '⚖️ Stýrivextir + bindiskylda UPP — kæla þrálátu verðbólguna.',
      '🤝 Tilfærslur (barnabætur o.fl.) UPP — verja heimilin gegnum aðlögunina.',
      '🏘️ Lækka veðhlutfall og íhuga verðtryggingar-ákvörðun (afnám verndar heimilin í verðbólgu).',
      '🧭 Innviðir / byggðastefna hóflega — viðspyrna úti á landi.',
      '📊 Stórar ákvarðanir: afnema höft, ESB/evru-stefna.' ] },
  { round: 5,
    situation: '2016. Ferðamannasprengjan: metfjöldi gesta, gjaldeyrir flæðir inn, atvinnuleysi hverfur, krónan styrkist. En húsnæðisverð rýkur og ungt fólk finnur enga íbúð.',
    varast: 'Önnur „auðveld" lota í stigum — en einhæf uppsveifla og HÚSNÆÐISKREPPA eru raunverulegu áhætturnar. Of mikið traust á einni atvinnugrein er hættulegt.',
    strategy: 'Nýttu uppsveifluna til að UNDIRBÚA, ekki bara njóta. Leystu húsnæðiskreppuna með auknu framboði, gættu fiskistofna og breikkaðu grunn hagkerfisins svo velsældin nái til fleiri en ferðaþjónustunnar.',
    settings: [
      '🏘️ Stórauka nýbygginga-framboð + lóðaframboð — leysir húsnæðiskreppuna sem er að myndast.',
      '🧭 Hækka ferðamannagjald — hemur ofþenslu og fjármagnar innviði.',
      '🐟 Halda fiskistofni (hófleg kvóta, ekki ofveiða) — sjálfbærni telur þessa lotu.',
      '⚖️ Lítils háttar aðhald gegn ofþenslu (sterk króna + innflæði).' ] },
  { round: 6,
    situation: '2020. Heimsfaraldur: COVID lokar landamærum, ferðaþjónustan hrynur ~40%, heimskreppa — en vextir sögulega lágir. Loftslagið kemst á dagskrá.',
    varast: 'Hagvöxtur og atvinnuleysi eru veiku hlekkirnir. Stór stuðningur bjargar störfum en hleður á skuldir. Í fyrsta sinn telur LOSUN í stigum — ekki bara hvort hjólin snúist.',
    strategy: 'Örva til að verja störf (lágir vextir gera það ódýrt núna), en nýttu tækifærið í græna viðspyrnu. Haltu losun niðri þótt þú örvir.',
    settings: [
      '⚖️ LÆKKA stýrivexti — ódýr örvun þegar vextir eru lágir hvort eð er.',
      '💵 Lækka VSK / tekjuskatt / tryggingagjald — styður eftirspurn og störf.',
      '🌱 Draga úr orku til stóriðju + orkuskipta-átak — heldur losun niðri (nýja markmiðið).',
      '📊 Stór ákvörðun: þjóðarsjóður auðlinda (opnast KT5+) — langtíma-viðnám.' ] },
  { round: 7,
    situation: '2024. Verðbólgu-bylgjan: uppsöfnuð eftirspurn eftir faraldur, stríð í Evrópu, hátt orkuverð. Seðlabankar hækka vexti hratt, greiðslubyrði þyngist, kaupmáttur í hættu.',
    varast: 'Klassíska klemman: kæla verðbólgu án þess að kalla fram samdrátt og atvinnuleysi. Of hægt viðbragð festir verðbólguna í sessi. Grænu markmiðin hverfa ekki, og JÖFNUÐUR telur nú líka.',
    strategy: 'Kæla eftirspurnina en verja kaupmátt lág-tekjuhópa — láttu byrðarnar ekki lenda allar á sama fólkinu. Haltu áfram orkuskiptum þrátt fyrir klemmuna.',
    settings: [
      '💵 Lækka tekjuskatt — verndar kaupmátt heimila í verðbólgunni (öflugasta ráðið hér).',
      '🏦 Bindiskylda UPP — kælir útlán og eftirspurn.',
      '⚖️ Hækka fjármagnstekjuskatt — bætir jöfnuð og ríkistekjur.',
      '🌱 Draga úr stóriðju-orku + endurheimt votlendis — heldur losun á réttri leið.' ] },
  { round: 8,
    situation: '2028. Framtíðin (kosningaár): loftslagsskuldbindingar, alþjóðleg óvissa. Almenningur — þreyttur á tveggja áratuga sveiflum — vill loksins stöðugan, sjálfbæran árangur.',
    varast: 'Skammtíma-vinsældir gegn langtíma-sjálfbærni. NÚ eru ÖLL markmið undir í einu: loftslag, sjálfbærni, byggð OG jöfnuður. Byggðajöfnuður er oftast veikasti hlekkurinn. Þetta er lokaprófið á allan ferilinn.',
    strategy: 'Ekki freistast til kosninga-örvunar. Fjárfestu í byggðum, kláraðu orkuskiptin, haltu jöfnuði og sjálfbærni. Sýndu að þið byggðuð samfélag sem stendur af sér næstu sveiflu — það er metið bæði í kjörklefanum og af sögunni.',
    settings: [
      '🧭 Innviðafjárfesting UPP — byggðajöfnuður er veikasti hlekkurinn þessa lotu.',
      '🌱 Draga úr stóriðju-orku + endurheimt votlendis — klára loftslagsmarkmiðin.',
      '⚖️ Halda jöfnuði (tilfærslur / skattþrep) og sjálfbærni — ekki fórna þeim fyrir kosninga-vinsældir.',
      '📊 Stór ákvörðun: grænt lokaátak.' ] },
];

export function handbookFor(round) { return HANDBOOK.find((h) => h.round === round) || null; }
