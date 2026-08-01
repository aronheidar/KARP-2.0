# Leikur — upplifunar-lota 2 (endurgjöf úr hópspilun 31.7) — hönnunarskjal

**Dagsetning:** 2026-08-01
**Staða:** drög — bíður yfirferðar Arons.
**Tilefni:** hópspilun 31.7; sjö endurgjafar-atriði. Þetta skjal skipuleggur þau í þrjá fasa
með útfærslu-leiðum grundvölluðum í núverandi kóða.

## 0. Staðan í kóða (staðreyndir sem planið byggir á)

- `src/lib/leikur/policies.mjs` — 8 stórar ákvarðanir; áhrif eru KÓÐI í `applyPolicies(kpis, states, baselineLevels)`
  (sum skilyrt, t.d. verðtrygging × verðbólga). ESB er `toggle, from:4, to:7` — ekkert umsóknar/aðildar-stig.
- `src/lib/leikur/aftermath.mjs` — `carryover()` skilar AÐEINS eigindlegum texta (POLICY_LEGACY/EVENT_LEGACY).
- `src/lib/leikur/surprise.mjs` — áhrif atvika eru DEKLARATÍF (`effect: {hagvoxtur:-0.3}`, klemmu-kostir með effect).
  Server sendir `out.surprise` ÁN áhrifatalna (server.mjs:127) — viljandi þá, endurgjöfin biður um tölurnar.
- `server.mjs:301` — per-lotu geymsla í `leikur_results.kpis`: `{kpis, perKpi, crisis, chain, stability, policies, stjornarkreppa}`
  → uppsafnaðar seríur eru reiknanlegar úr `resultsRaw` án nýrrar geymslu.
- `client.mjs` — `renderChain` (40-73) birt í results (561/583); `carryoverCard` (343), `surpriseCard` (354) inline-spjöld;
  `st.trajectory` = UPPSAFNAÐUR STIGAFJÖLDI (ekki KPI-slóðir); `advisors(kpiVals, round)` þegar kallað (634).
- Arkitektúr-regla: leik-lag breytir uppgjörs-KPI, ALDREI engine. Allt hér að neðan er leik-lag + client.

## 1. Endurgjöfin → verkefni

| # | Endurgjöf | Verkefni | Fasi |
|---|-----------|----------|------|
| 1 | Sjá betur áhrif stórra ákvarðana á núverandi lotu (á gröfum og/eða nákvæmar í texta) | B (tölur+merki) + F (pinnar á gröf) | F1 |
| 2 | ESB: badge þegar meðlimur, hover sýnir áhrif, „ganga úr" opnast | B (lífsferill + badges) | F1 |
| 3 | Fjarlægja orsaka-blokk grafið — enginn skoðaði það | A | F1 |
| 4 | Meira sjónrænt: myndir (karakterar, Alþingi, óhöpp), atvik sem popup með mynd + skýrari áhrifum | C + G (myndefni) | F2 |
| 5 | Forsætisráðherra í horni, jafnvel animated, segir frá ráðum/varúð | D | F2 |
| 6 | Íslandskort sem lifnar við eftir áherslum (byggð/menntun/CO2/fiskur) — Civ-stíll | E | F3 |
| 7 | Uppsafnaðir KPI (skuldir o.fl.) og samanburður milli liða | F | F1 |

## 2. Verkefnin

### A. Fjarlægja orsaka-keðjuna (F1)
Fjarlægja `renderChain` + notkun í results (client), `chain`-reikning og `chain` úr geymslu-JSON (server),
og `chain.mjs` + próf (aðeins notað af leiknum; hermir hefur sitt eigið keðjukort).
**Ávinningur umfram tiltekt:** losar besta plássið á results-skjánum — þangað fer Íslandskortið í F3.

### B. Stefnu-merki (badges), magnbundin arfleifð og ESB-lífsferill (F1)
**Eitt nýtt gagnastykki knýr þrjú yfirborð.** Server reiknar per-ákvörðun framlag með diffi:
`applyPolicies` keyrt með og án hverrar virkrar ákvörðunar → `deltas = {kpi: tala}` per ákvörðun.
(Nákvæmt, ekkert handviðhald talna, virkar líka fyrir skilyrt áhrif eins og verðtrygging×verðbólga.)
Sent sem `out.policyBadges = [{id, icon, label, sinceRound, stage, deltas}]`.

1. **Badge-röð** undir kjörtímabils-hausnum: flís per virka ákvörðun (`🇪🇺 ESB-aðild · frá KT5`).
   Hover/tap → tooltip: áhrifin Í ÞESSARI lotu með tölum („verðbólga −0,4 · skuldir −2 · hagvöxtur −0,2").
2. **Arfleifðar-spjaldið** (carryoverCard) fær tölurnar: eigindlegi textinn stendur, en við hann bætast
   delta-flísar. `carryover()` í aftermath.mjs tekur við deltas og skilar þeim áfram.
3. **Atvik fá sömu meðferð:** `out.surprise` sendir nú `effect` + klemmu-kostir `effect` (tölur birtast í C-popupinu
   og inline-spjaldinu). Meðvituð stefnubreyting frá „engar tölur" — endurgjöfin var skýr.

**ESB-lífsferill** (policies.mjs + þunn server-viðbót):
- KT4+: ákvörðun „🇪🇺 Sækja um aðild að ESB" → staða `umsokn` út þá lotu (væg áhrif: smá óvissu-drag, aðildarferlis-kostnaður).
- Næsta lota: staða `adild` (núverandi ESB-áhrif úr applyPolicies) + badge „ESB-aðild".
- Meðan `adild`: ný ákvörðun „Ganga úr ESB" í boði → úrsagnar-högg í eina lotu (hagvöxtur −, gengisflökt +),
  svo hverfa áhrifin. Badge „úrsögn í ferli" þá lotu.
- Útfærsla: `policyStates()` skilar líka `sinceRound` per id (history hefur lotu-númerin);
  stage leitt af `round - sinceRound`. Rofa-vélbúnaðurinn (toggle on/off) heldur sér.

### C. Atviks-popup með mynd og áhrifum (F2)
Þegar nýtt atvik birtist í lotu-byrjun: **modal-popup** — mynd (G), titill, texti, áhrifa-flísar með tölum,
og klemmu-valið beint í glugganum (sama `data-dil` flæði og nú, dilemmaDraft-sync heldur sér).
- Lokanlegt; fellur þá saman í núverandi inline-spjald (surpriseCard stendur áfram sem „minnismiði").
- Birtist EINU SINNI per (kóði, lota) per vafra — localStorage-lykill; poll-endurteikningin má ekki endurvekja hann.
- Watch-sýnin (skjávarpi) sýnir sama popup í ~8 sek með sjálflokun — hópupplifunin sem beðið var um.
- Klukkan heldur áfram á bak við; popup má aldrei hindra læsingu.

### D. Forsætisráðherra-hornið (F2)
Fast horn-spjald (neðra hægra, fellanleg í avatar-hnapp; valið munað í localStorage).
- **Portrett í 3 pósum** eftir fylgi: bjartsýnn (>55), hlutlaus (35-55), áhyggjufullur (<35);
  við stjórnarfall: sérstakt „kreppu"-ástand.
- **Talblaðra með typewriter-effekti** sem raðar saman ÞVÍ SEM ÞEGAR ER TIL: `advisors()` úr flavor
  (ráð eftir stöðu), `handbook` varast-punktur lotunnar, sterkasta arfleifðar-áhrifið (úr B), viðbragð við atviki.
  2-3 skilaboð per lotu, smellt til að fletta.
- **Heiðarleiki um „animated":** 3 stöðumyndir + CSS-öndun/blikk + typewriter LÍTUR lifandi út og kostar ekkert;
  rigguð hreyfimynd (Lottie/sprite-sheet) er margföld vinna fyrir lítinn viðbótar-ávinning. Byrjum án hennar.
- ⚠ **Persónan er SKÁLDUÐ** — ekki líking af raunverulegum stjórnmálamanni (hvorki nafn né andlit).
  Leikurinn hermir söguleg tímabil; talandi ráðgjafar-persóna með andlit raunverulegs ráðherra væri bæði
  persónuverndar- og hlutleysis-mál.

### E. Lifandi Íslandskort (F3) — með heiðarlegu mati
**Heiðarlega matið sem beðið var um:** Full Civilization-upplifun — borgir sem byggjast hús fyrir hús,
einingar á vappi — kemur EKKI vel út án alvöru listamanns-vinnu; með klipptum stock-myndum yrði það
barnalegt og ódýrt í samanburði við annars fágað viðmót. **En afmörkuð útgáfa kemur vel út:**
eitt stílhreint Íslands-SVG með 5-6 föstum LÖGUM sem hvert hefur 3-4 ÞREP, og þrepin uppfærast
með lítilli hreyfingu við uppgjör. Það les sem „landið mitt lifnar" án asset-verksmiðju.

Lögin (KPI → þrep, hrein vörpunar-eining `kort-throp.mjs` með prófum):
- 🏘️ **Byggð**: ljós-punktar á ~8 landshluta-stöðum, stærð/birta eftir `byggdajofnudur`-bilum.
- 🎓 **Menntun**: skóla-tákn (1-3) eftir menntunar-sleða-stigi.
- 🐟 **Fiskistofn**: fiska-þéttleiki í sjónum umhverfis eftir `fiskistofn`-bilum.
- 🏭 **Losun**: mistur/reykjar-yfirlag með opacity eftir `losun`; skógar-græni ef skógrækt er uppi.
- ⚡ **Stórar ákvarðanir sem TÁKN á kortinu**: álver (stjoridja=reisa), gagnaver (atviks-val),
  ESB-fáni við höfnina (aðild) — tengir beint við B-badges.
Birting: results-skjárinn (í plássið sem keðjan skilur eftir) + STÓRT á watch-sýninni.
Þetta er þar sem sjónræna fjárfestingin borgar sig — hópurinn horfir á skjávarpann.

### F. Uppsafnaðir KPI + ákvarðana-pinnar (F1)
Reiknað úr `resultsRaw` (per-lotu KPI eru þegar geymd) — engin ný geymsla:
- **Verðlagsvísitala** (2000=100): ∏(1+verðbólga/100)⁴ per kjörtímabil (4 ár per lota).
- **VLF-vísitala** og **kaupmáttarvísitala**: sama aðferð á hagvöxt/kaupmátt.
- **Skuldir % af VLF**: þegar stöðustærð — sýnd sem lína yfir lotur.
- **Uppsöfnuð losun**: summa losunar-stigs × 4 ár (merkt sem vísitölu-ár í skýringu).
Yfirborð:
1. Nýr flipi í results: „🏦 Uppsafnað" — línurit per stærð, ÖLL LIÐ saman (samanburðurinn sem beðið var um).
2. **Ákvarðana-pinnar á þessi gröf + stiga-trajectory**: lóðrétt merki með íkoni í lotunni sem ákvörðun var tekin;
   tooltip = heiti + deltas þeirrar lotu (úr B — deltas vistast framvegis í results-detail; eldri leikir sýna pinna án talna).
   Þetta svarar „sýna á gröfunum hvaða áhrif stóru ákvarðanirnar höfðu".
3. Leikstjóra-greining: samanburðar-tafla liða × lokastöður (VLF, verðlag, kaupmáttur, skuldir, losun).
4. Leikslok-recap: „Ísland ykkar 2032"-blokk með lokatölunum.

### G. Myndefnis-leiðsla (þjónar C/D/E)
- ~15 myndir í fyrstu lotu: 8 atvik + forsætisráðherra ×3 pósur + Alþingi + 2-3 alm. (Ísland, fáni, kreppa).
- Stíll: flatur/duotone sem passar dökka KARP-viðmótið; EIN stíl-forskrift (prompt-sniðmát) fyrir allar;
  AI-gerð í yfirstærð → handvalið úr; endurgera verstu í sama stíl. Vistun `web/public/leikur/myndir/*.webp`
  (~40-80KB), lazy-load, emoji-fallback ef mynd vantar (leikurinn má aldrei brotna á vöntun myndar).
- Stíl-rek er raunverulega áhættan við AI-gerð — mildað með einu sniðmáti + einni lotu af handvali.

## 3. Fasar og verk

**F1 — Skýrleiki (engin myndefnis-háð, hæsta gildi/áhætta-hlutfall):**
V1 A (keðja burt) · V2 B-server (deltas + lífsferill + badges-payload) + próf ·
V3 B-client (badge-röð + tooltip + arfleifð með tölum + atvikatölur inline) ·
V4 F (uppsafnað-seríur eining + próf, results-flipi, pinnar, fac-tafla, recap-blokk) ·
V5 bygging + prod-E2E + deploy + minni.

**F2 — Myndefni og persóna:** V1 G (myndir + stíl-spec) · V2 C (popup) · V3 D (PM-horn) · V4 E2E + deploy.

**F3 — Íslandskortið:** V1 `kort-throp.mjs` vörpun + próf · V2 SVG-grunnkort + lög ·
V3 innfelling results + watch + þrep-animation · V4 ákvarðana-tákn + E2E + deploy.

Röksemd röðunar: F1 er hrein rökfræði og svarar 4 af 7 atriðum strax; F2 sannar myndstílinn á
afmörkuðum flötum (popup/horn) ÁÐUR en F3 veðjar á hann fyrir kortið.

## 4. Afmarkanir og áhættur

- **Skálduð PM-persóna** (sjá D) — hörð regla.
- Popup má aldrei blokka klukku/læsingu; allt sjónrænt er viðbót OFAN Á texta, ekki í staðinn
  (aðgengi + skjálesarar halda textaleiðinni).
- Farsími: PM-hornið fellt saman sjálfgefið undir 700px; kortið fær einfaldaða útgáfu (engin lög-animation).
- Deltas í results-detail stækka JSON-ið lítillega (~200B/lið/lotu) — innan marka.
- Watch-sýnin er forgangs-flötur fyrir F2/F3 (hópspilun = skjávarpi).
