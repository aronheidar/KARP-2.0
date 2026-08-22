// KENNARAHEFTIÐ — prentanlegt hefti fyrir kennara/leikstjóra sem ætlar að keyra RÁS-Leikinn.
//
// ⚠⚠ MÖRKIN SEM MÁ EKKI FÆRA — LESTU ÁÐUR EN ÞÚ BÆTIR VIÐ:
// handbook.mjs ber SVÖRIN (`varast`, `strategy`, `settings` per lotu og Þjóðarsáttar-fylkið) og er
// leikstjóra-læst inni í leiknum — nemendur eiga ekki að geta lesið hvaða sleða á að hreyfa.
// ÞETTA hefti er OPIN, indexeranleg síða. Hér má því aðeins vera KENNSLU-HANDVERKIÐ:
// undirbúningur, keyrsla, hvað á að segja, umræðuspurningar, námskrá, algeng vandamál og
// takmarkanir líkansins. Úr HANDBOOK er AÐEINS `situation` endurnýtt (söguleg staðreynd sem er
// opinber hvort eð er). Bætir þú `settings`/`strategy`/`varast`/`fylki_til_toflu` hingað ertu að
// birta lausnina — próf í kennarahefti.test.mjs fellur þá, og það er viljandi.
//
// Efnið er hér (ekki í .astro) svo það sé prófanlegt og eigi sér eina uppsprettu með leiknum.
import { HANDBOOK } from './handbook.mjs';
import { THOKA_HANDBOOK, SATT_HANDBOOK, RADHERRAR_HANDBOOK } from './handbook.mjs';

export const HEFTI_META = {
  heiti: 'Kennarahefti',
  undirtitill: 'RÁS-Leikurinn — að keyra vinnustofu í hagstjórn',
  inngangur: 'Þetta hefti er fyrir þig sem ætlar að stýra leiknum. Það gerir ekki ráð fyrir að þú sért hagfræðingur — það gerir ráð fyrir að þú kunnir að halda utan um hóp. Leikurinn sér um hagfræðina; þú sérð um umræðuna, og það er þar sem lærdómurinn verður til.',
};

// ── 0. EF ÞÚ LEST BARA EINA SÍÐU ───────────────────────────────────────────
// Stendur FRAMAN VIÐ kaflana (er ekki í KAFLAR og fær ekki kaflanúmer) — þetta er blaðið
// sem kennari tekur með sér inn í stofuna. Hver lína á að standa ein og sér.
export const EIN_SIDA = [
  'Þú þarft ekki að vera hagfræðingur. Leikurinn reiknar hagfræðina; þitt hlutverk er umræðan.',
  'Taktu eina prufukeyrslu í tíu mínútur með einu æfingaliði áður en þú keyrir hann. Það er allur undirbúningurinn sem raunverulega þarf.',
  'Þrjú til fimm lið er besta stærðin. Eitt tæki per lið dugar.',
  'Fyrsta spilun: Miðlungs, engir aukahamir, umferðar-klukka á. Geymdu þokuna og hina hamina í aðra umferð.',
  'Ekki útskýra stjórntækin. Hreyfðu einn sleða á skjávarpanum og láttu liðin finna afganginn sjálf.',
  'Segðu FYRIRFRAM að hrunið (þriðja kjörtímabilið, 2008) sé óvinnanlegt og að markmiðið þar sé að lifa af.',
  'Gakktu milli liða og spyrðu — ekki svaraðu. „Hvað eruð þið að reyna að laga?" dugar allan tímann.',
  'Geymdu útskýringarnar í debriefið. Svarirðu jafnóðum verður debriefið tómt.',
  'Debriefið er lærdómurinn. Springi tíminn, styttu leikinn — ekki debriefið.',
  'Liðið sem fékk flest stig stjórnaði ekki endilega best. Segðu það upphátt í lokin.',
];

// ── 1. FYRIR TÍMANN ────────────────────────────────────────────────────────
export const UNDIRBUNINGUR = [
  { hvad: 'Taktu eina prufukeyrslu', hvernig: 'Stofnaðu leik, bættu við einu æfingaliði (bot) og keyrðu tvö kjörtímabil í gegn. Það tekur tíu mínútur og er langsamlega besta undirbúningurinn — þú sérð hvað liðin sjá og hvar þau munu stoppa.' },
  { hvad: 'Ákveddu liðaskiptinguna fyrirfram', hvernig: '2–8 lið, 1–6 í liði. Þrjú til fimm lið gefa besta umræðu: nógu mörg til að bera saman, nógu fá til að allir komist að. Eitt tæki per lið dugar.' },
  { hvad: 'Athugaðu netið og skjávarpann', hvernig: 'Leikurinn þarf venjulega nettengingu (uppgjörið er reiknað á þjóni svo stigin séu ófölsuð). Áhorfenda-sýnin á skjávarpanum krefst engrar innskráningar — opnaðu hana áður en hópurinn kemur inn.' },
  { hvad: 'Sendu netföng nemenda tímanlega', hvernig: 'Þátttakandi þarf innskráðan Karp-reikning sem merktur er sem nemanda-aðgangur. Sendu listann á hjalp@karp.is með góðum fyrirvara — ekki morguninn sem á að spila. Mælt er með skóla-netföngum.' },
  { hvad: 'Veldu erfiðleikastig og hami', hvernig: 'Fyrsta spilun: Miðlungs, engir aukahamir, umferðar-klukka á. Geymdu þokuna, Þjóðarsáttina og ráðherraskiptinguna í aðra umferð — þeir eru lag ofan á leik sem hópurinn kann þegar.' },
  { hvad: 'Lestu kennsluhandbókina í leiknum', hvernig: 'Þegar kjörtímabil opnast birtist þér — og aðeins þér — handbók lotunnar: staðan, gildran og ráðlagðar stillingar. Það er svarablaðið þitt; þú þarft ekki að læra það utan að, bara vita að það er þarna.' },
];

// ── 2. KEYRSLAN (90 mín) ───────────────────────────────────────────────────
export const KEYRSLA = [
  {
    fasi: 'Uppsetning', min: 10,
    gera: [
      'Stofnaðu leikinn og varpaðu leikkóðanum á vegginn.',
      'Láttu liðin skrá sig inn og velja liðsheiti — biddu um hlutlaus heiti („Rauða liðið", „Ríkisstjórn 3"), ekki eigin nöfn.',
      'Sýndu einn sleða á skjávarpanum og hreyfðu hann: spágildin uppfærast lifandi. Það er allt sem þarf til að útskýra viðmótið.',
    ],
    varast: 'Ekki útskýra öll þrjátíu stjórntækin. Liðin læra þau með því að hreyfa þau — löng kynning étur tímann sem umræðan þarf.',
  },
  {
    fasi: 'Kjörtímabilin', min: 64,
    gera: [
      'Opnaðu kjörtímabilið og lestu upp stöðuna í tveimur setningum (handbókin gefur þér þær).',
      'Láttu klukkuna ganga. Gakktu milli liða og spyrðu — ekki svara: „hvað eruð þið að reyna að laga?" er betri spurning en nokkur ábending.',
      'Þegar öll lið hafa læst, gerðu upp og sýndu uppgjörið á skjávarpanum. Staldraðu við eitt lið sem gerði eitthvað óvænt.',
      'Endurtaktu. Haltu takti — átta kjörtímabil á 64 mínútum þýðir um átta mínútur hvert, og fyrstu tvö taka lengri tíma en þau síðustu.',
    ],
    varast: 'Freistingin er að útskýra hverja niðurstöðu til enda. Geymdu það — uppgjörið vekur spurningar sem debriefið á að svara, og ef þú svarar þeim jafnóðum verður debriefið tómt.',
  },
  {
    fasi: 'Debrief', min: 20,
    gera: [
      'Byrjaðu á stigatöflunni en dveldu ekki við hana — hún er kveikja, ekki niðurstaða.',
      'Berðu saman tvö lið sem fóru ólíkar leiðir og spyrðu þau bæði: „hvað voruð þið að forgangsraða?"',
      'Sýndu „svona fór það í alvöru" og berðu raunveruleikann saman við bestu og verstu leiðina í salnum.',
      'Endaðu á spurningunni sem opnar út fyrir leikinn (sjá debrief-uppbygginguna hér á eftir).',
    ],
    varast: 'Ekki láta debriefið verða verðlaunaafhendingu. Liðið sem tapaði tók oft áhugaverðari ákvarðanir en liðið sem vann, og það er umræðuefni í sjálfu sér.',
  },
];

export const MIN_SAMTALS = KEYRSLA.reduce((s, k) => s + k.min, 0);

// ── 2b. ÞEGAR TÍMINN ER STYTTRI EN VINNUSTOFAN ─────────────────────────────
// Algengasta hindrunin í framhaldsskóla: kennslustundin er 40–80 mínútur, ekki 94.
// ⚠ Öll ráðin hér virka ÁN sérstillinga. Fjöldi kjörtímabila er aðeins stillanlegur í
// sérsniðinni sviðsmynd (þyngra en það er virði fyrir venjulegan kennara), svo hér er
// hvergi mælt með því — í staðinn er leikurinn brotinn upp eða stöðvaður.
export const STYTTRI_TIMI = {
  inngangur: 'Full vinnustofa er 94 mínútur. Sé kennslustundin styttri skaltu ekki flýta debriefinu — það er þar sem lærdómurinn festist. Brjóttu frekar leikinn upp.',
  leidir: [
    { heiti: 'Tvær kennslustundir (mælt með)', txt: 'Leikurinn lifir milli tíma — þú þarft ekki að klára hann í einni lotu. Fyrri tíminn: uppsetning og fyrstu fjögur kjörtímabilin, sem enda á hruninu og fyrstu skrefum endurreisnar. Seinni tíminn: síðustu fjögur og fullt debrief. Byrjaðu seinni tímann á stuttri upprifjun úr uppgjöri fjórða kjörtímabils.' },
    { heiti: 'Ein kennslustund, debrief í næsta tíma', txt: 'Styttu umferðar-klukkuna — fimm mínútur duga þegar hópurinn er kominn á skrið — og keyrðu öll átta kjörtímabilin. Geymdu debriefið í næsta tíma; lokayfirlitið og „svona fór það í alvöru" bíða þín óbreytt.' },
    { heiti: 'Stöðva fyrr', txt: 'Þú getur stöðvað leikinn hvenær sem er og farið beint í uppgjörið. Stöðvun eftir sjötta kjörtímabilið gefur enn heila sögu: góðæri, hrun, endurreisn og faraldur. Það sem tapast er lokakaflinn þar sem öll markmið eru undir í einu.' },
    { heiti: 'Hægur hamur yfir viku', txt: 'Eitt kjörtímabil á dag, ákvarðanir teknar utan kennslustundar og tímarnir notaðir í uppgjörin. Hentar sérstaklega vel þegar stundaskráin leyfir enga samfellu — sjá kaflann um hægan ham.' },
  ],
};

// ── 3. OPNUNARORÐIN ────────────────────────────────────────────────────────
export const OPNUNARORD = [
  'Þið eruð ríkisstjórn Íslands. Hvert lið fær sama landið, sama árið og sömu stjórntækin — vexti, skatta, útgjöld, húsnæðismál, auðlindir — og fjögur ár í senn til að ráðstafa þeim.',
  'Þið vitið ekki hvað gerist næst. Það vissi enginn heldur árið 2000.',
  'Það er ekkert rétt svar. Það eru bara ákvarðanir og afleiðingar — og í lokin sjáum við hvað varð um Ísland hjá hverju ykkar, og hvað varð um það í alvörunni.',
];

// ── 4. KJÖRTÍMABILIN — rammi og umræðuspurningar ───────────────────────────
// `stada` kemur ÚR HANDBOOK (söguleg staðreynd, sama uppspretta og leikurinn).
// `kennslu_horn` og `spurningar` eru heftisins — kennslu-handverk, ekki svör.
const RAMMI = {
  1: {
    kennslu_horn: 'Góðæri er ekki tíminn til að njóta heldur tíminn til að byggja varnir. Þetta er erfiðasta pólitíska lexían í leiknum og hún kemur strax í fyrstu lotu.',
    spurningar: [
      'Hvað kostar það stjórnmálamann að herða á meðan allt gengur vel — og hver borgar þann kostnað?',
      'Hvaða merki voru sjáanleg árið 2000 sem bentu á það sem kom átta árum síðar? Hver þeirra hefðuð þið tekið mark á?',
    ],
  },
  2: {
    kennslu_horn: 'Hér lærist munurinn á peningastefnu og þjóðhagsvarúð: stýrivextir hreyfa allt hagkerfið í einu, en veðhlutfall og greiðslubyrðarþak beinast að einum markaði. Liðin uppgötva oft að þau voru með rangt verkfæri í hendi.',
    spurningar: [
      'Hvað gera lánþegaskilyrði — veðhlutfall og greiðslubyrðarþak — sem stýrivextir gera ekki?',
      'Stigin refsuðu ykkur varla fyrir aðgerðaleysi þessa lotu. Var það merki um að allt væri í lagi?',
    ],
  },
  3: {
    kennslu_horn: 'Þetta er lotan þar sem enginn vinnur. Segðu hópnum það FYRIRFRAM — annars les hann lág stig sem eigin mistök í stað þess að læra það sem lotan kennir: að sum áföll eru ekki leyst heldur af lifað, og að svigrúmið sem þú hefur í kreppu var ákveðið árin á undan.',
    spurningar: [
      'Var eitthvað sem þið gátuð gert 2008 sem hefði breytt niðurstöðunni verulega — eða var teningnum kastað 2004?',
      'Hvernig skiptist höggið milli hópa? Hverjir báru það og hverjir sluppu?',
      'Stóru ákvarðanirnar — Icesave, bankarnir: hvað réði afstöðu ykkar, hagfræðin eða réttlætiskenndin? Er hægt að skilja þar á milli?',
    ],
  },
  4: {
    kennslu_horn: 'Höft eru skólabókardæmi um skammtímalausn með langtímakostnaði. Hér má tengja við umræðuna um hvað gerist þegar neyðarráðstöfun verður varanleg.',
    spurningar: [
      'Höftin vörðu krónuna en lokuðu hagkerfinu. Hvenær á að aflétta — og hvað gerist ef það er gert of snemma eða of seint?',
      'Verðtryggingin: hverjum kemur hún til góða og hverjum ekki, og hvers vegna er hún enn til?',
    ],
  },
  5: {
    kennslu_horn: 'Einhæfni er áhætta sem sést ekki fyrr en of seint. Ferðamannasprengjan var raunveruleg velsæld — og um leið uppsöfnun á áhættu sem kom í ljós 2020.',
    spurningar: [
      'Hversu háð má hagkerfi vera einni atvinnugrein? Hvar liggja mörkin og hver á að draga þau?',
      'Húsnæðisverð hækkaði hraðar en laun. Hvað af því sem þið prófuðuð virkaði — og hvað hreyfði ekkert?',
    ],
  },
  6: {
    kennslu_horn: 'Í fyrsta sinn telur losun í stigunum. Það er hönnunarval sem má ræða opinskátt: markmið sem er ekki mælt fær ekki athygli, hvorki í leik né í stjórnmálum.',
    spurningar: [
      'Vextir voru sögulega lágir svo örvunin var ódýr. Hvað hefðuð þið gert ef þeir hefðu verið háir eins og 2024?',
      'Fórnuðuð þið einhverju fyrir losunarmarkmiðið — eða reyndist það ódýrara en þið bjuggust við?',
    ],
  },
  7: {
    kennslu_horn: 'Klassíska klemman: að kæla verðbólgu án þess að kalla fram atvinnuleysi. Hér sést líka að hagstjórn er dreifingarspurning — það skiptir máli hvar byrðin lendir, ekki bara hversu stór hún er.',
    spurningar: [
      'Hvar lögðuð þið byrðina af kælingunni — og var það meðvituð ákvörðun eða afleiðing?',
      'Berðu saman kjarasamningana 2024 við Þjóðarsáttina 1990: hvað átti að halda verðbólgunni niðri og hver þurfti að treysta hverjum?',
    ],
  },
  8: {
    kennslu_horn: 'Lokaprófið. Öll markmið eru undir samtímis og ekkert þeirra má sleppa. Þetta er líka staðurinn til að spyrja hvað stigin mæla í raun — og hvað þau mæla ekki.',
    spurningar: [
      'Öll markmið voru undir í einu. Hvað gáfuð þið eftir, og hvers vegna einmitt það?',
      'Ef þið byrjuðuð aftur á fyrsta kjörtímabilinu með það sem þið vitið núna — hvað mynduð þið gera öðruvísi?',
      'Stigin gáfu ykkur einkunn. Var liðið sem fékk flest stig það sem stjórnaði landinu best?',
    ],
  },
};

export const KJORTIMABIL = HANDBOOK.map((h) => ({
  lota: h.round,
  stada: h.situation,                                   // ÚR HANDBOOK — söguleg staðreynd
  kennslu_horn: (RAMMI[h.round] || {}).kennslu_horn || '',
  spurningar: (RAMMI[h.round] || {}).spurningar || [],
}));

// ── 5. DEBRIEF — uppbygging í fjórum þrepum ────────────────────────────────
export const DEBRIEF_THREP = [
  { threp: 1, heiti: 'Hvað gerðist?', min: 4, txt: 'Láttu hvert lið lýsa sinni leið í tveimur setningum. Ekki réttlæting, bara frásögn. Þetta jafnar stöðuna: liðið í neðsta sæti fær orðið á sömu forsendum og það efsta.' },
  { threp: 2, heiti: 'Af hverju fór svona?', min: 6, txt: 'Taktu eitt eða tvö augnablik þar sem leiðir skildust og skoðaðu þau á skjávarpanum. Spurðu liðin sjálf hvað þau héldu að myndi gerast — misræmið milli væntingar og útkomu er lærdómurinn.' },
  { threp: 3, heiti: 'Hvað gerðist í alvöru?', min: 6, txt: 'Sýndu „svona fór það í alvöru". Berðu raunveruleikann saman við bestu og verstu leiðina í salnum. Oft er raunveruleikinn hvorugt — og það er athyglisverðasta niðurstaðan.' },
  { threp: 4, heiti: 'Hvað tökum við með okkur?', min: 4, txt: 'Ein spurning sem opnar út fyrir leikinn. Láttu hópinn svara, ekki þig. Sjá lokaspurningarnar hér á eftir.' },
];

export const LOKASPURNINGAR = [
  'Hvað var erfiðast: að vita hvað ætti að gera, eða að þora því?',
  'Þið sáuð afleiðingar ákvarðana ykkar eftir fjögur ár. Stjórnmálamenn sjá þær sjaldnast fyrir kosningar. Hvernig breytir það hagstjórn?',
  'Hvaða ákvörðun tókuð þið sem þið mynduð verja opinberlega — og hvaða ákvörðun mynduð þið ekki vilja útskýra í viðtali?',
  'Hvað í leiknum var einfaldað svo mikið að það varð rangt?',
];

/** Fylgir síðustu lokaspurningunni — það er gott merki ef hópurinn finnur veikleikana sjálfur. */
export const LOKASPURNING_ATH = 'Síðasta spurningin er ekki gildra. Sjá kaflann um takmarkanir líkansins — hópur sem finnur þær sjálfur hefur skilið leikinn betur en hópur sem vann hann.';

// ── 6. AUKAHAMIRNIR — sama uppspretta og leikurinn (handbook.mjs) ──────────
// AÐEINS kennslu-lagið: hvers vegna, hvenær og hvernig keyra + umræðuspurningar.
// Þjóðarsáttar-FYLKIÐ (`fylki_til_toflu`) er VILJANDI ekki hér — það er debrief-efni sem
// leikstjórinn sýnir úr leiknum, ekki eitthvað sem á að standa á opinni síðu.
const ham = (h, extra) => Object.assign({
  heiti: h.heiti,
  blurb: h.blurb,
  hvers_vegna: h.hvers_vegna,
  hvenaer: h.hvenaer || '',
  hvernig_keyra: h.hvernig_keyra || '',
  spurningar: h.debrief_spurningar || [],
}, extra || {});

export const HAMIR = [
  ham(THOKA_HANDBOOK, { hvernig_keyra: THOKA_HANDBOOK.hvad_ad_segja_hopnum }),
  ham(SATT_HANDBOOK),
  ham(RADHERRAR_HANDBOOK),
];

// ── 7. HÆGUR HAMUR — vinnustofa yfir viku ──────────────────────────────────
export const HAEGUR_HAMUR = {
  heiti: 'Hægur hamur — leikurinn yfir heila viku',
  hvers_vegna: 'Níutíu mínútur í einni lotu henta vinnustofu en illa venjulegri stundatöflu. Í hægum ham er eitt kjörtímabil opið í heilan dag (eða annan hvern dag, eða viku) og næsta lota opnast sjálfkrafa. Þú þarft ekki að vera viðstaddur þegar hún opnast, og nemendur geta rætt ákvarðanir sínar utan kennslustundar — sem er oft þar sem besta samtalið verður til.',
  hvernig_keyra: [
    'Kveiktu á hæga hamnum við stofnun og veldu takt og tíma dags. Umferðar-klukkan slokknar sjálfkrafa — þú ert ekki með tvær klukkur í gangi.',
    'Lið sem hefur ekki læst þegar fresturinn rennur út fær sínar núverandi stillingar læstar sjálfkrafa. Hafi það engar sett telst það óbreytt stefna. Þetta er kjarninn: einn gleyminn hópur stöðvar ekki leikinn fyrir hinum.',
    'Bæði þú og nemendur getið beðið um póst þegar ný lota opnast. Það er valfrjálst og slökkt sjálfgefið.',
    'Notaðu kennslustundirnar í uppgjörin: opnaðu tímann á uppgjöri síðustu lotu á skjávarpanum og láttu liðin verja ákvarðanir sínar. Leikurinn gengur milli tíma, umræðan verður í tímanum.',
  ],
  varast: 'Hægur hamur á illa við í fyrstu spilun hóps sem hefur aldrei séð leikinn — þá er betra að keyra eina hraða umferð fyrst svo allir kunni viðmótið. Notaðu hann í aðra umferð, eða í fjarnámi þar sem valið stendur ekki til boða.',
};

// ── 8. NÁMSKRÁ — grunnþættir menntunar ─────────────────────────────────────
// Grunnþættirnir sex úr aðalnámskrá (2011) — hvernig leikurinn snertir hvern þeirra.
// Vísvitandi ENGIN áfangaheiti eða -númer: þau eru mismunandi milli skóla.
export const GRUNNTHAETTIR = [
  { thattur: 'Sjálfbærni', hvernig: 'Auðlindanýting, losun og fiskistofnar eru mæld markmið í leiknum og togast beinlínis á við skammtímavöxt. Nemendur upplifa fórnarskiptin í stað þess að lesa um þau.' },
  { thattur: 'Lýðræði og mannréttindi', hvernig: 'Fylgi er mælt samhliða hagstærðum: liðin finna að óvinsæl ákvörðun getur verið rétt og vinsæl ákvörðun röng. Stóru ákvarðanirnar (Icesave, ESB, höft) eru raunveruleg álitamál án rétts svars.' },
  { thattur: 'Jafnrétti', hvernig: 'Jöfnuður er sérstakt markmið frá sjöunda kjörtímabili og dreifing byrða er endurtekið umræðuefni: hverjir bera kostnaðinn af verðbólgu, af aðhaldi, af hruni.' },
  { thattur: 'Læsi', hvernig: 'Talnalæsi í reynd — nemendur lesa vísitölur, ferla og hlutföll til að taka ákvörðun, og í þokuhamnum þurfa þeir að meta merki þegar tölurnar vantar.' },
  { thattur: 'Sköpun', hvernig: 'Það er engin ein lausn. Liðin þurfa að smíða eigin stefnu úr þrjátíu stjórntækjum og rökstyðja hana — og bera hana svo saman við þær sem hinir smíðuðu.' },
  { thattur: 'Heilbrigði og velferð', hvernig: 'Kaupmáttur, atvinnuleysi og húsnæði eru markmið í leiknum, svo velferð er ekki afgangsstærð heldur mælikvarði sem liðin bera ábyrgð á.' },
];

// ── 9. NÁMSMAT ─────────────────────────────────────────────────────────────
// ⚠ Í samræmi við DPIA/skóla-DPA: leikurinn metur EKKI einstaka nemendur og engin gögn úr honum
// eiga að fara í einkunn. Tillögurnar meta VINNU nemandans í kringum leikinn, ekki stig liðsins.
export const NAMSMAT = {
  regla: 'Leikurinn gefur engar einkunnir og stig liðanna eiga ekki heima í námsmati. Liðið sem fékk flest stig gæti hafa verið heppið; liðið í neðsta sæti gæti hafa tekið bestu ákvörðunina. Metið vinnuna í kringum leikinn — röksemdirnar, ekki útkomuna.',
  tillogur: [
    { heiti: 'Stefnuskjal (ein síða)', txt: 'Nemandi skrifar rökstuðning fyrir ákvörðunum liðsins í einu kjörtímabili: hvað var reynt, hvers vegna, og hvað kom á óvart. Metið er hvort röksemdin haldi, ekki hvort stigin hafi verið há.' },
    { heiti: 'Samanburður við raunveruleikann', txt: 'Nemandi ber leið liðsins saman við það sem raunverulega gerðist á sama tímabili og skýrir muninn með heimildum. Tengir leikinn við heimildavinnu.' },
    { heiti: 'Ráðherraskýrsla', txt: 'Í ráðherraskiptingu: hver liðsmaður gerir grein fyrir sínu ráðuneyti og hvar hann rakst á hina. Sýnir skilning á samspili peningastefnu og ríkisfjármála.' },
    { heiti: 'Gagnrýni á líkanið', txt: 'Nemandi bendir á eitthvað sem leikurinn einfaldar of mikið og rökstyður hvers vegna. Krefjandi og gefur oft bestu svörin — sjá takmarkanirnar hér á eftir.' },
  ],
};

// ── 10. ALGENG VANDAMÁL ────────────────────────────────────────────────────
export const VANDAMAL = [
  { vandi: 'Einn í liðinu ræður öllu og hinir horfa á', lausn: 'Kveiktu á ráðherraskiptingu í næstu umferð — þá stýrir hver liðsmaður aðeins sínum sleðum og liðið verður að semja. Í venjulegum ham: biddu liðin að skipta um þann sem heldur á tækinu milli kjörtímabila.' },
  { vandi: 'Liðin skilja ekki hvað sleðarnir gera', lausn: 'Það er eðlilegt í fyrstu tveimur lotunum og lagast af sjálfu sér. Hreyfðu einn sleða á skjávarpanum og sýndu spágildin breytast — það kennir meira en útskýring.' },
  { vandi: 'Stigin hrynja hjá öllum í hruninu og hópurinn missir móðinn', lausn: 'Segðu FYRIRFRAM að þessi lota sé óvinnanleg og að markmiðið sé að lifa af. Þá les hópurinn lág stig sem eiginleika sviðsmyndarinnar, ekki eigin mistök.' },
  { vandi: 'Tíminn er að springa', lausn: 'Styttu umferðar-klukkuna í næstu lotum, eða stöðvaðu leikinn fyrr og farðu beint í uppgjörið — betra er að ná debriefinu en að klára öll átta kjörtímabilin. Debriefið er þar sem lærdómurinn festist. Sjá leiðirnar fjórar í kaflanum um styttri tíma.' },
  { vandi: 'Lið nær ekki að læsa fyrir lok umferðar', lausn: 'Ólæst lið heldur einfaldlega fyrri stefnu. Í hægum ham læsast stillingar þeirra sjálfkrafa. Þú getur líka bætt við æfingaliði (bot) svo leikurinn haldi takti þótt hópur detti út.' },
  { vandi: 'Hópurinn eltir stigin í stað þess að hugsa', lausn: 'Það er gott umræðuefni, ekki vandamál. Spyrðu í debriefinu hvað stigin mæla og hvað þau sleppa — og hvort raunverulegir stjórnmálamenn elti ekki líka mælikvarða sem þeir völdu ekki sjálfir.' },
  { vandi: 'Lið skrifar nöfn í liðsheitið', lausn: 'Þú sérð heitin í biðstöðunni áður en leikur hefst og getur beðið um breytingu. Liðsheitið er eina frjálsa textasviðið í leiknum, svo það er eini staðurinn þar sem persónuupplýsingar geta ratað inn.' },
];

// ── 11. TAKMARKANIR LÍKANSINS ──────────────────────────────────────────────
// Heiðarleiki er hluti af kennsluefninu: nemandi sem heldur að leikurinn spái fyrir um Ísland
// hefur lært rangt. Þessi kafli er líka besta uppspretta krefjandi verkefna (sjá NÁMSMAT).
export const TAKMARKANIR = {
  inngangur: 'Leikurinn er stílfært kennslulíkan, ekki spálíkan. Hann er nógu réttur til að fórnarskiptin séu raunveruleg og nógu einfaldur til að hópur skilji hann á átta mínútum. Segðu hópnum þetta — og láttu hann leita að veikleikunum.',
  atridi: [
    { heiti: 'Stuðlarnir eru kvarðaðir, ekki metnir', txt: 'Tengslin milli stjórntækja og útkomu eru stillt svo stærðargráður og áttir séu trúverðugar, ekki metin tölfræðilega úr íslenskum gögnum. Notaðu tölurnar til að bera saman leiðir, ekki til að spá fyrir um raunverulegar tölur.' },
    { heiti: 'Ein leið, eitt land, enginn samanburðarhópur', txt: 'Í hagfræði er erfiðasta spurningin hvað hefði gerst annars. Leikurinn svarar henni með því að láta mörg lið spila sama árið — það er hans styrkur, en það er hermun en ekki sönnun.' },
    { heiti: 'Kjörtímabilið þjappar tímanum', txt: 'Fjögur ár líða í einu skrefi. Raunveruleg hagkerfi bregðast við á mismunandi hraða: verðbólga svarar vöxtum á mánuðum, húsnæðismarkaður á árum og orkuskipti á áratugum. Leikurinn jafnar þennan mun út.' },
    { heiti: 'Stigin eru mannasetning', txt: 'Einhver valdi markmiðin og einhver valdi vægi þeirra. Annað val hefði gefið annan sigurvegara. Þetta er ekki galli heldur nákvæmlega það sem gerist þegar samfélag ákveður hvað telst árangur — og það er þess virði að ræða.' },
    { heiti: 'Stjórnmálin vantar að mestu', txt: 'Fylgi er mælt en það er engin stjórnarandstaða, engin þingmeirihlutastærð og enginn samstarfsflokkur sem hótar að slíta. Raunveruleg hagstjórn strandar oftar á því en á hagfræðinni.' },
    { heiti: 'Umheimurinn er einfaldaður', txt: 'Alþjóðleg áföll koma sem gefnar stærðir. Í raun eru þau afleiðing ákvarðana annarra ríkja — og lítið opið hagkerfi hefur meiri áhrif á eigin viðnámsþrótt en á áföllin sjálf.' },
  ],
};

// ── 12. PERSÓNUVERND Í STUTTU MÁLI ─────────────────────────────────────────
// Speglar docs/personuvernd/* og /leikur/personuvernd/ — ef þessu er breytt verður að
// breyta þeim líka (og öfugt). Hér er AÐEINS stutta útgáfan fyrir kennarann.
export const PERSONUVERND = {
  inngangur: 'Skólinn er ábyrgðaraðili og Karp vinnsluaðili. Þú þarft ekki að kunna þetta utan að, en þetta er svarið ef persónuverndarfulltrúi skólans spyr.',
  atridi: [
    'Leikurinn geymir liðsheiti, ákvarðanir og uppgjör — engin nöfn, kennitölur né einkunnir. Liðsheitið er eina frjálsa textasviðið, svo biddu um hlutlaus heiti.',
    'Leikjagögnin eru ekki tengd Karp-reikningi nemanda. Eina undantekningin er póst-áminning í hægum ham sem nemandinn kveikir sjálfur á — hún er slökkt sjálfgefið og eyðist með leiknum.',
    'Leikjum er eytt sjálfkrafa eftir 90 daga og þú getur eytt leik strax í leikslok.',
    'Leikurinn metur ekki einstaka nemendur og engin gögn úr honum fara í einkunnagjöf.',
    'Ítarefni fyrir skólastjórnendur og persónuverndarfulltrúa er á karp.is/leikur/personuvernd/ ásamt drögum að skóla-vinnslusamningi.',
  ],
};

// ── MEIRA EFNI ─────────────────────────────────────────────────────────────
export const MEIRA = [
  { heiti: 'RÁS-hermirinn', slod: '/hermir/', txt: 'Sama líkan og leikurinn keyrir á, opið og án leiks. Gagnlegt til að sýna eitt samband í einu á töflu — t.d. hvað gerist þegar stýrivextir hreyfast einir og sér.' },
  { heiti: 'Persónuvernd í RÁS-leiknum', slod: '/leikur/personuvernd/', txt: 'Fyrir skólastjórnendur og persónuverndarfulltrúa: hvað er geymt, hver sér hvað, eyðing og drög að skóla-vinnslusamningi.' },
  { heiti: 'Leikstjóra-síðan', slod: '/leikur/leikstjori/', txt: 'Yfirlit, verð og algengar spurningar — síðan til að senda á þann sem heldur um budduna.' },
];

/** Allir kaflar heftisins í prentröð — ein uppspretta fyrir efnisyfirlit og síðuna. */
export const KAFLAR = [
  { id: 'undirbuningur', nr: 1, heiti: 'Fyrir tímann' },
  { id: 'keyrsla', nr: 2, heiti: 'Keyrslan' },
  { id: 'opnun', nr: 3, heiti: 'Opnunarorðin' },
  { id: 'kjortimabil', nr: 4, heiti: 'Kjörtímabilin átta' },
  { id: 'debrief', nr: 5, heiti: 'Debrief' },
  { id: 'hamir', nr: 6, heiti: 'Aukahamirnir' },
  { id: 'haegur', nr: 7, heiti: 'Hægur hamur' },
  { id: 'namskra', nr: 8, heiti: 'Námskrá' },
  { id: 'namsmat', nr: 9, heiti: 'Námsmat' },
  { id: 'vandamal', nr: 10, heiti: 'Algeng vandamál' },
  { id: 'takmarkanir', nr: 11, heiti: 'Takmarkanir líkansins' },
  { id: 'personuvernd', nr: 12, heiti: 'Persónuvernd' },
];
