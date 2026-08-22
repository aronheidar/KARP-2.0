// KENNSLUHANDBÓK LEIKSTJÓRA — ýtarleg leiðsögn fyrir hvert kjörtímabil (2000–2032).
// Aðeins fyrir leikstjóra (inniheldur „svörin"). Ráð eru GRUNDUÐ í herminum (besta-spils-greining á miðlungs)
// + sögulegu samhengi sviðsmyndarinnar. `settings` = ráðlagðar sleða-hreyfingar með stefnu + rökum.
// Á ERFITT: sömu áherslur en böndin þrengri, áföllin harðari og refsing við falli þyngri → minna svigrúm fyrir mistök.
import { SATT_FYLKI } from './satt.mjs';   // ÞJÓÐARSÁTTIN: fylki_til_toflu reiknast úr tölunum sjálfum (sjá neðst)
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

// „HAGSTJÓRN Í ÞOKU" (config.thoka) — kennslu-rök + leikstjóra-texti fyrir leikstillinguna þar sem liðin sjá
// hörðu hagtölurnar með eins kjörtímabils töf og enga KPI-spá í decide-fasa (þjóns-síun í /state; uppgjörið afhjúpar).
// Stigagjöf og vél eru ÓBREYTT — þetta er birtingar-síun, ekki erfiðleikastig. Leikstjóri (fac-tákn) sér allt; áhorfenda-
// sýnin (skjávarpi, tákn-laust) er í decide SÍUÐ eins og liðin (kort N-2, engar N-1 tölur) svo lið geti ekki lesið tölurnar þar.
// ⚠ Afmörkun: „ráðgjafa-matið" (átt+styrkur) er reiknað í vafranum úr sleðunum (BASELINE/LINKS eru client-side) —
// snjall notandi getur reiknað spágildin í console. Það er ÁSÆTTANLEGT: það er æfing fyrir hann, ekki leki á
// leyndum gögnum; hörðu N-1-tölurnar fara hins vegar ALDREI úr þjóninum í þoku.
export const THOKA_HANDBOOK = {
  heiti: 'Hagstjórn í þoku',
  // Stutti blurb-inn við rofann í fac-lobby (sama texti og í client — ein uppspretta).
  blurb: 'Liðin sjá hagtölur með eins kjörtímabils töf og enga framtíðarspá — eins og raunverulegir stjórnmálamenn. Mælt með í annarri umferð.',
  hvers_vegna: 'Raunverulegir ráðherrar sjá hagkerfið aldrei í rauntíma: Hagstofan birtir fyrstu (bráðabirgða-)tölur þjóðhagsreikninga fyrir ársfjórðung jafnan um tveimur mánuðum eftir lok hans og endurskoðar þær síðan, oft í nokkur ár — fyrstu tölur um hrunárið 2008 breyttust margoft eftir á. Töfin er þó misjöfn eftir stærðum: vísitala neysluverðs og skráð atvinnuleysi mælast mánaðarlega nær tafarlaust, en hagvöxtur, afkoma og viðskiptajöfnuður berast seint og breytast eftir á — leikurinn einfaldar og lætur töfina ná yfir allar stærðir, og „eitt kjörtímabil" er stílfærð ýkja, ekki raun-töf. Spár Seðlabankans og annarra eru birtar með breiðum óvissubilum, og „nowcasting"-líkön eru tilraun til að giska á stöðu dagsins úr hraðari merkjum (kortaveltu, atvinnuleysisskráningu, væntingavísitölum). Í grunnstillingu gefur leikurinn liðunum fullkomna framsýn — lifandi spágildi áður en þau læsa — sem er kennslufræðilega gagnlegt í fyrstu umferð (liðin læra hvaða sleðar hreyfa hvað) en óraunsætt; þokan tekur hækjuna burt og kennir að stjórna eftir merkjum, ekki tölum.',
  hvenaer: 'Í annarri umferð sama hóps, eða með lengra komnum (hagfræðinemum, stjórnendum sem hafa spilað áður). EKKI í fyrstu spilun og EKKI saman með Erfitt í fyrsta skipti — þá er óvissan tvöföld og liðin læra lítið af hvorugu. Best reynist: fyrsta umferð með fullri sýn, önnur umferð í þoku, og debrief sem ber saman ákvarðanatökuna í umferðunum tveimur.',
  hvad_ad_segja_hopnum: 'Í þessari umferð sjáið þið hagtölurnar eins og ríkisstjórn sér þær í alvöru — með töf: hörðu tölurnar sem þið fáið eru frá kjörtímabilinu á undan því síðasta, og um síðasta kjörtímabil hafið þið aðeins fyrirsagnir, fylgi, stig og átt hverrar stærðar. Spáin ykkar er horfin; í staðinn fáið þið ráðgjafa-mat sem segir í hvaða átt hlutirnir stefna, ekki hvar þeir lenda. Tölurnar koma í ljós við uppgjörið — þá sjáið þið hvernig staðan var í raun og hvort þið lásuð merkin rétt.',
  debrief_spurningar: [
    'Hvernig breyttist ákvarðanatakan þegar þið sáuð ekki tölurnar — urðuð þið varkárari, djarfari eða bara hægari?',
    'Treystuð þið fyrirsögnunum? Leiddu þær ykkur einhvern tíma afvega — og hvenær var fylgið betra merki en fréttirnar?',
    'Hvaða merki hefðuð þið viljað hafa til viðbótar — og hvað af því er raunverulega til í rauntíma (kortavelta, atvinnuleysisskráning, væntingavísitölur) og hvað ekki?',
    'Er fylgið betri eða verri mælikvarði en verðbólgan þegar þú ert í þoku — og hvað gerist með hagstjórn sem eltir fylgið?',
    'Hvað segir þetta um raunverulega hagstjórn 2008 — hversu mikið af því sem virðist augljóst eftir á var í raun sjáanlegt í rauntíma, með þeim tölum sem þá lágu fyrir?',
  ],
};

// ÞJÓÐARSÁTTIN (config.satt) — kennslu-rök + leikstjóra-texti fyrir fangaklemmuna þvert á lið (satt.mjs ber
// tölurnar og útkomu-reglurnar; hér er AÐEINS leikstjóra-lagið). Fylkið birtist liðunum ALDREI fyrirfram í fyrsta
// sinn — það er debrief-efni (fylki_til_toflu er textaútgáfa af SATT_FYLKI, reiknuð héðan svo hún eldist ekki).
const sattTala = (v) => (v > 0 ? '+' : '−') + String(Math.abs(v)).replace('.', ',');
const sattAhrif = (e) => ['verdbolga', 'kaupmattur', 'pop'].filter((k) => e && e[k] != null).map((k) => ({ verdbolga: 'verðbólga', kaupmattur: 'kaupmáttur', pop: 'fylgi' })[k] + ' ' + sattTala(e[k])).join(' · ');
const sattSamanlagt = (...effs) => { const o = {}; for (const e of effs) for (const k in (e || {})) o[k] = Math.round(((o[k] || 0) + e[k]) * 1000) / 1000; return o; };
export const SATT_HANDBOOK = {
  heiti: 'Þjóðarsáttin',
  // Stutti blurb-inn við rofann í fac-lobby (sama texti og í client — ein uppspretta).
  blurb: 'Í tveimur kjörtímabilum (hrunið 2008 og verðbólguskotið 2020) stendur öllum liðum sama blinda valið: halda aftur af launum og verðlagi — eða sækja fram. Útkoman ræðst af því hvað ÖLL liðin velja — fangaklemma þvert á lið.',
  hvers_vegna: 'Þjóðarsáttin 1990 var trúverðugleikaleikur. Eftir áratug þar sem verðbólgan hafði legið í tveggja stafa tölum — og farið langt yfir tuttugu prósent þegar verst lét — settust Alþýðusamband Íslands (ASÍ), Vinnuveitendasamband Íslands (VSÍ, með Einar Odd Kristjánsson í fararbroddi) og ríkisstjórnin að sama borði og sömdu um hóflegar launahækkanir gegn því að verðlag, gengi og búvöruverð yrðu haldin í skefjum. Verðbólgan hjaðnaði á fáum árum úr um tuttugu til tuttugu og fimm prósentum niður í lágar eins stafs tölur — nákvæmar tölur fara eftir því hvaða ár og mælikvarða er miðað við, en stefnubreytingin er óumdeild. Kjarninn er að sáttin hélt af því að HVER AÐILI treysti því að HINIR héldu: launþegar sættu sig við litlar hækkanir af því þeir trúðu því að verðlagið myndi ekki hlaupa frá þeim, og fyrirtækin héldu verði af því þau trúðu því að launakröfurnar kæmu ekki aftur. Svik hefðu verið sýnileg og kostnaðarsöm — það er gagnkvæmt traust, ekki góðvild, sem skýrir hvers vegna hún stóð. Leikurinn setur liðin nákvæmlega í þessa klemmu: hvert lið græðir í bili á að sækja fram ef hin halda, en allir tapa ef flestir gera það.',
  hvenaer: 'Í hópum með þremur liðum eða fleiri — þá er klemman raunveruleg (með einu liði er valið „sáttin við sjálfan sig"). Hentar bæði fyrstu og annarri umferð; í fyrstu umferð er fyrri sáttar-lotan (KT3, hrunið) oftast svik og sú síðari (KT6, verðbólguskotið) prófið á hvort hópurinn lærði.',
  hvernig_keyra: 'Kynntu valið stuttlega þegar fyrsta sáttar-lotan opnast (KT3): „Kjarasamningar eru lausir — skrifið þið undir þjóðarsátt eða sækið þið fram?" Opnaðu svo Karphúsið (hnappurinn í Þjóðarsáttar-spjaldinu, 3 mín sjálfgefið) og leyfðu liðunum að tala saman í herberginu — hléið er tími og leyfi, ekki innbyggt spjall. SEGÐU LIÐUNUM EKKI FYLKIÐ FYRIRFRAM í fyrsta sinn; þau eiga að finna klemmuna, ekki reikna hana. Lokaðu Karphúsinu, láttu liðin læsa valinu sínu (ólæst val telst „Sækja fram") og leystu lotuna. Í uppgjörinu birtist afhjúpunin — hver valdi hvað og hvaða flokkur varð — og þá sýnirðu fylkið í debrief (fylki_til_toflu). Í KT6 endurtekurðu leikinn og berð saman: breyttist hegðunin eftir fyrstu reynsluna?',
  debrief_spurningar: [
    'Hvers vegna sviku sum lið — og hvað héldu þau að hin liðin myndu gera?',
    'Hvað hefði þurft til að þið gætuð treyst hinum liðunum: loforð í Karphúsinu, sýnileg svik, endurtekning?',
    'Breyttist valið í KT6 eftir reynsluna úr KT3 — lærði hópurinn, og hvað lærði hann?',
    'Hvað er trúverðugleiki í hagstjórn — og hvers vegna hélt Þjóðarsáttin 1990 þegar fyrri tilraunir höfðu brugðist?',
    'Hvaða hliðstæðu sjáið þið í kjarasamningunum 2024 (stöðugleikasamningarnir) — hvað átti að halda verðbólgunni niðri og hver átti að treysta hverjum?',
  ],
  // Textaútgáfa af SATT_FYLKI (satt.mjs) — til að sýna hópnum í debrief, EKKI fyrirfram. Reiknuð úr fylkinu sjálfu.
  fylki_til_toflu: [
    { utkoma: '🤝 Allir halda (samvinna)', lid: 'hvert lið', ahrif: sattAhrif(SATT_FYLKI.samvinna) },
    { utkoma: '🗡️ Sumir svíkja (a.m.k. helmingur heldur)', lid: 'svikari', ahrif: sattAhrif(SATT_FYLKI.svik.svikari) },
    { utkoma: '🗡️ Sumir svíkja (a.m.k. helmingur heldur)', lid: 'sáttar-lið (sogari)', ahrif: sattAhrif(SATT_FYLKI.svik.sattLid) },
    { utkoma: '🌀 Flestir svíkja (spírall)', lid: 'svikari', ahrif: sattAhrif(sattSamanlagt(SATT_FYLKI.spirall.allir, SATT_FYLKI.spirall.svikari)) },
    { utkoma: '🌀 Flestir svíkja (spírall)', lid: 'sáttar-lið', ahrif: sattAhrif(sattSamanlagt(SATT_FYLKI.spirall.allir, SATT_FYLKI.spirall.sattLid)) },
    { utkoma: '🏛️ Eitt lið í leik', lid: 'satt = samvinnu-tölur · sækja fram = svikara-tölur (eigin verðbólga, enginn sogari)', ahrif: '' },
  ],
};

// RÁÐHERRASKIPTING INNAN LIÐS (config.radherrar, AÐEINS í Stjórnstöð) — kennslu-rök + leikstjóra-texti. Vörpun sleða↔ráðuneyta,
// sæta-map og merge-reglurnar búa í radherrar.mjs (sama uppspretta og þjónninn); hér er AÐEINS leikstjóra-lagið: blurb í rofa/
// stillingaspjaldi, hvers vegna, hvernig keyra og debrief-spurningar. Sætin sjö (RADUNEYTI): forsætis, Seðlabanki, fjármál,
// húsnæði, vinnumarkaður, auðlindir/orka, byggð/ferðaþjónusta.
export const RADHERRAR_HANDBOOK = {
  heiti: 'Ráðherraskipting',
  // Stutti blurb-inn við rofann í fac-lobby (sama texti og í client — ein uppspretta).
  blurb: 'Hver liðsmaður tekur sæti í ríkisstjórninni — Seðlabankastjóri, fjármálaráðherra, húsnæðisráðherra… — og stýrir aðeins sleðum síns ráðuneytis. Forsætisráðherrann sér allt, tekur stóru ákvarðanirnar og læsir kjörtímabilið. Liðið verður að semja innbyrðis.',
  hvers_vegna: 'Án skiptingar endar lið oftast með EINN með lyklaborðið: sá sem heldur á tækinu færir sleðana og hinir horfa á. Ráðherraskiptingin neyðir liðið til að skipta verkum og tala saman — og hún er ekki bara leikbragð, því togstreita ráðuneyta er raunveruleg hagstjórn. Fjármálaráðherra sem eykur útgjöld í góðæri vinnur beint gegn Seðlabanka sem reynir að kæla verðbólgu með vöxtum; húsnæðisráðherra sem vill framboð á höfuðborgarsvæðinu rekst á byggðaráðherra sem vill dreifa því um landið; auðlindaráðherra stendur með verðmætasköpun á öðrum endanum og sjálfbærni á hinum. Seðlabankinn er sjálfstæð stofnun (lög um Seðlabanka Íslands nr. 92/2019), ekki ráðherra — og í leiknum er sætið því viljandi flott: sá sem situr þar má toga í vextina gegn vilja ríkisstjórnarinnar, nákvæmlega eins og í alvöru. Samspil peningastefnu og ríkisfjármála — hvort þau toga í sömu átt eða hvort á móti öðru — er kjarnaatriði þjóðhagfræðinnar, og hér upplifa liðin það í eigin skinni í stað þess að lesa um það.',
  hvernig_keyra: 'Kveiktu á rofanum við stofnun — hann virkar aðeins í Stjórnstöð (sleðar = ráðuneyti). Liðsstærð 3–7 er best: þrír skipta með sér forsætisráðuneyti, Seðlabanka og fjármálum, sjö fylla öll sætin; hver þarf eigið tæki (sætið er bundið vafranum). Þegar kjörtímabilið opnast birtist ríkisstjórnarfundurinn hjá liðinu og hver og einn tekur sæti. PM-VALIÐ ER PÓLITÍK: segðu liðunum að velja forsætisráðherra saman — og gríptu ekki inn í. Hver tekur sætið fyrstur, hver gefur eftir og hver rökstyður er hluti af lærdómnum. Í lotu-yfirlitinu sérðu sætin per lið (✓ tekið · laust); lið sem velur engan forsætisráðherra festist ekki — þá má hver sem er læsa. Minntu á að sleðarnir eru læstir milli ráðuneyta: það sem Seðlabankastjórinn gerir sést lifandi hjá hinum en enginn yfirskrifar hann. Í debrief spyrðu um togstreituna og hver réði í raun.',
  debrief_spurningar: [
    'Hvernig var að vera Seðlabankastjóri þegar fjármálaráðherrann jók útgjöld?',
    'Klobbuðu ráðuneytin hvert annað — og tókuð þið eftir því áður en uppgjörið sýndi það?',
    'Hver réði í raun — forsætisráðherrann, sá sem talaði hæst eða sá sem sat á sleðanum sem skipti mestu?',
  ],
};
