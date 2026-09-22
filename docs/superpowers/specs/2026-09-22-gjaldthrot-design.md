# Gjaldþrot og nýskráningar fyrirtækja (/gjaldthrot/): hönnun

Dags. 22.9.2026. Aron valdi leið A (ný síða og forsíðureitur) og samþykkti hönnunina í spjalli sama dag.

## Markmið

Ný ókeypis og leitarvæn síða `/gjaldthrot/` („gjaldþrot fyrirtækja 2026“) úr tveimur Hagstofutöflum sem
karp.is notar hvergi í dag, og reitur á forsíðu. Síðan á að skilja á milli skráðra gjaldþrota, sem eru að
mestu félög sem voru hætt starfsemi, og gjaldþrota félaga með starfsemi, sem segja eitthvað um atvinnulífið.

## Heimildir

Mappa `Atvinnuvegir/fyrirtaeki/skradfyrirtaeki/2_skraningar/` á `px.hagstofa.is/pxis/api/v1/is/`.

- **FYR03001**: nýskráningar og gjaldþrot eftir mánuðum frá 2008M01. Sótt með Atvinnugreinar=`Alls`,
  Rekstrarform=`Alls`. Breytur `Fjöldi nýskráninga` og `Fjöldi gjaldþrota`. 444 raðir.
- **FYR03010**: frá 2009M01, 25 atvinnugreinaflokkar (`Alls`, bálkar A–S og X, fimm þverflokkar svo sem
  `T_TOT_IS` ferðaþjónusta og `SI_alls_IS` iðnaður). Breytur `Skráð gjaldþrot`,
  `Gjaldþrot fyrirtækja með virkni á fyrra ári`, `Fjöldi launafólks að jafnaði á fyrra ári`,
  `VSK velta á fyrra ári`. UNITS í px-skránni: „Fjöldi/ Milljónir króna“, svo veltan er í m.kr.
  Öll taflan (allir mánuðir, allar greinar) er 21.000 raðir, 1,5 MB, innan við sekúnda.
- Svörin koma í **lækkandi** mánaðaröð. Staða hverrar víddar er lesin úr `columns` (tími er `type: 't'`).
- Útgáfutaktur er **ársfjórðungslegur**. Tölur til júní 2026 birtust 15.7.2026 (LAST-UPDATED 24.7).
  Næstu tölur koma um miðjan október.

## Staðreyndir sem hönnunin byggir á (sóttar 22.9.2026)

| jan–jún | 2026 | 2025 |
|---|---|---|
| Skráð gjaldþrot | 693 | 595 |
| Gjaldþrot félaga með starfsemi árið áður | 229 | 210 |
| Launafólk hjá þeim | 1.168 | 1.217 |
| VSK-velta þeirra, m.kr. | 12.170 | 14.882 |
| Nýskráningar | 1.847 | 1.765 |

Síðustu 12 mánuði (2025M07–2026M06): 1.062 skráð gjaldþrot, þar af 388 með starfsemi. Summa bálka er
jöfn `Alls` bæði fyrir skráð gjaldþrot og gjaldþrot með starfsemi. Nýskráningar á hvert gjaldþrot eru 3,23
síðustu 12 mánuði, lægst 1,28 árið 2011 og hæst 8,86 árið 2022. Mánaðartölur sveiflast frá 7 (ágúst) upp
í 124 (janúar), svo síðan sýnir aldrei stakan mánuð.

## Hlutar

### 1. `skriptur/lib/gjaldthrot.mjs` (hrein föll, prófuð)

Allir útreikningar síðunnar og forsíðureitsins. Síðan og reiturinn birta aðeins tölur úr JSON.

- `lesaPx(svar)` → `{ [grein]: { [breyta]: { [mánuður]: tala|null } } }`. Les stöður úr `columns`;
  aðrar víddir (Rekstrarform) eru hunsaðar. Kastar villu ef tíma-, greina- eða breytuvídd vantar.
- `rod(radir, grein, breyta)` kastar villu sem **nefnir breytukóðann** ef Hagstofan breytir honum.
- `manudirFra`, `hlidra`, `nyjastiManudur`, `summa` (null ef einhvern mánuð vantar), `rullandi12`,
  `fraAramotum`, `breytingPct` (heil prósenta, aldrei `-0`), `hlutfallSamhengi` (aðeins heil almanaksár),
  `hreinsaHeiti` („… (ÍSAT2008: 41-43)“ → nafn + isat), `balkaTafla`, `timabilsHeiti`.
- `smidaGjaldthrot({ fyr03001, fyr03010, heiti })` skilar öllu JSON-inu nema `updated`.
  `nyjasti` er **sá mánuður sem báðar töflur ná til**, svo samanburður blandar aldrei saman útgáfum.

### 2. `skriptur/build_gjaldthrot.mjs`

Tvær `px()`-fyrirspurnir og lýsigögn FYR03010 (heiti greina) samhliða, síðan `smidaGjaldthrot` og
`writeSnapshot('gjaldthrot', …)`. **Allt eða ekkert:** hlutarnir nota báðar töflurnar, svo ef sókn eða
útreikningur bregst skrifast ekkert, skriptan hættir með kóða 1 og síðasta snapshot stendur. Keyrð daglega
í refresh-data, skrefinu „Hagstofa þjóðhags-snapshot“, á eftir `build_vinnumarkadur.mjs`.

JSON-samningur `gogn/gjaldthrot.json` (og `web/public/gogn/`):

```
updated        keyrsludagur
nyjasti        '2026M06' (ferskleikavörnin les þetta)
nyjastiHeiti   'júní 2026'
ytd            { ar, man, heiti: 'jan–jún 2026', heitiFyrra: 'jan–jún 2025',
                 nu, fyrra: { skrad, virk, launafolk, velta, nyskr },
                 breyting: sömu lyklar í heilum %, anStarfsemiPct }
hlutfall       { nu, lagmark: { ar, v }, hamark: { ar, v } }
r12            { man: ['2008M12', …], nyskr, skrad, virk }   12 mánaða summur, null fyrir fyrsta heila glugga
balkar         { fra, til, heiti: 'júl 2025 – jún 2026',
                 rodir: [{ kodi, nafn, isat, skrad, virk, virkFyrra, launafolk, velta }],
                 thversnid: [ferðaþjónusta, iðnaður], alls }
```

`rodir` eru bálkarnir (einn hástafur) með eitthvert gildi yfir núlli, raðað eftir gjaldþrotum með
starfsemi, síðan skráðum gjaldþrotum. `virkFyrra` er sama tala fyrir 12 mánuðina þar á undan.

### 3. Síðan `web/src/pages/gjaldthrot.astro`

Mynstur rafbilar.astro (SiduHaus, spjöld, ECharts-eyja af CDN), en litir úr þemabreytum (`--panel`,
`--line`, `--ok`, `--slaemt`, `--gold`) svo ljósa þemað virki.

- Inngangur: „Frá áramótum til loka júní 2026 voru 693 fyrirtæki tekin til gjaldþrotaskipta og 1.847 ný
  skráð. 67% gjaldþrota félaganna höfðu enga starfsemi árið áður.“
- Fimm spjöld: skráð gjaldþrot, með starfsemi árið áður, launafólk hjá þeim, nýskráningar (öll frá áramótum
  með „▲16% frá jan–jún 2025“), og nýskráningar á hvert gjaldþrot síðustu 12 mánuði með lægsta og hæsta ári.
- Graf: 12 mánaða summur frá 2008 fyrir nýskráningar, skráð gjaldþrot og gjaldþrot með starfsemi.
- Tafla í HTML eftir bálkum, síðustu 12 mánuði: gjaldþrot með starfsemi, sama tala ári fyrr, launafólk,
  velta í ma.kr. „Ári fyrr“ kemur í stað prósentubreytingar, því 4 á móti 1 væri +300%. Summulína og
  ferðaþjónusta og iðnaður sem þverlínur utan summunnar.
- Tengill á `/logbirting/` fyrir einstök mál.
- Fótur: „Tölur til og með júní 2026. Hagstofan birtir þær ársfjórðungslega.“ Tímabil gagnanna, ekki
  byggingardagur. Engin ferskleika- eða „live“-merki.
- Titill `Gjaldþrot fyrirtækja {ár} | Karp`, gagnadrifin lýsing og Dataset JSON-LD. Engin emojí.

### 4. Forsíða og valmynd

- `index.astro`: reitur „Gjaldþrot fyrirtækja“ á eftir Vinnumarkaði. Lykiltala úr
  `ytd.breyting.virk`: „▲9%“ með „gjaldþrot starfandi félaga, jan–jún 2026“. Félög með starfsemi frekar en
  skráð gjaldþrot, því skráða talan hoppar þegar hætt félög eru gerð upp í stórum skömmtum.
- `Layout.astro`: „Gjaldþrot fyrirtækja“ undir Efnahagur á eftir Atvinnugreinum, og `gjaldthrot` í
  `PATH_EFNI` fyrir efnahag. Sitemap tekur síðuna sjálfkrafa.

### 5. Vöktun

Færsla í `GAGNASOFN` í `skriptur/lib/ferskleiki.mjs`: les `nyjasti`, hámark **130 dagar** (ársfjórðungur,
um tveggja vikna útgáfutöf og svigrúm). Júní-tölur eru því í lagi til 7.11 og rauðar eftir það á spjaldi Hrafns.

### 6. Prófanir og sannprófun

- `skriptur/lib/gjaldthrot.test.mjs`: þáttun og lækkandi röð, `..` → null, mánaðaraðgerðir yfir áramót,
  null þegar mánuð vantar, 12 mánaða gluggar, frá áramótum, `-0`, heil ár í hlutfalli, heitahreinsun,
  röðun og síun bálka, þverflokkar, `nyjasti` þegar töflurnar ná misjafnlega langt, villa sem nefnir kóða.
- `ferskleiki.test.mjs`: júní-tölur í lagi 20.10, gamlar 15.11.
- Keyra skriptuna á raungögnum og bera saman við töfluna hér að ofan. Byggja vefinn og skoða síðuna og
  forsíðuna í vafra, dökka og ljósa þemað og símabreidd.

## Utan umfangs

Nýskráningar eftir greinum eða rekstrarformi, frétt í fréttavélinni við hverja útgáfu, tenging við
atvinnugreinaskýrslurnar (seld vara) og landshlutar (gögnin ná ekki til þeirra).
