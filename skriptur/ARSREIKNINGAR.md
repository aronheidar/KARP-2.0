# Ársreikningar RSK → KPI

> **LOTA 115 (2026-07-10): Parserinn hertur með 100-félaga þversniði atvinnuvega.**
> 100 félög (sjávarútvegur/veitingar/ferðaþj./flug/verslun/iðnaður/tækni/fjármál/orka/
> fasteignir/verktakar/IFRS-samstæður) sótt og þáttuð; 104 rótarorsakir greindar og lagaðar.
> Þekja: FULL 45→74 af 85 (87%) · KPI-meðaltal 5,72→7,52/9 · +279 reitir, 3 réttmæt töp.
> Helstu lagfæringar: gap-klösun+tákna-pípa í rows_of_page (svigasamruni '( 8 91.133)'→−891133,
> leiðara-afbræðsla), fjölhópa kommu-þúsund ('1,863,734'), síðuval endurritað (höfnun skýringa-/
> áritunar-/yfirlitssíðna + enska + EFS-hlið + sjóðstreymis-fallback), MAP-regex stórvíkkuð
> (hagnaður/sala/EBITDA-forgangur/bankaform/enska), pending-kaflahausar ('Rekstrartekjur'-haus →
> ómerkt summa; sala-yfirskrift millisumma≥íhlutur f. RARIK/Veitur), NOK+framtíðarmynt-vörn.
> 18 einingapróf. Eftir (lág forgangur): OCR-braut f. skönnuð PDF, kvarða-kosning vigtuð á
> reikningssíður (Elkem NOK milljón/þúsund), laun/veltufjármunir af skýringasíðum.

Sækir **opinbera ársreikninga íslenskra lögaðila** úr ársreikningaskrá RSK og
þáttar í fjárhags-KPI fyrir fyrirtækjaskýrslur karp.is — **áður en** opinbera
Skatts-API-ið kemur. Niðurstaða rannsóknar (LOTA 99): **JÁ, þetta er hægt núna,
frítt og án innskráningar.** Snið = **PDF** (ekki XBRL).

## Skrár
| Skrá | Hlutverk |
|------|----------|
| `build_arsreikningar.mjs` | Sækjari + samræmari (Node + puppeteer-core). kt → `gogn/arsreikningar/<kt>.json` |
| `parse_arsreikningur.py`  | Þáttari (pdfplumber, hnita-byggður). PDF → tölur + KPI |
| `../gogn/arsreikningar/6912002990.json` | Sýni (Sandholt ehf.), búið til af skriptunni |

## Flæði (staðfest með raunverulegum niðurhölum)
1. **Fyrirtækjasíða RSK** — `GET skatturinn.is/fyrirtaekjaskra/leit/kennitala/<kt>`
   → tafla „Gögn úr ársreikningaskrá“ með `data-itemid` (= *Nr. ársreiknings*) og
   `data-typeid`: **1 = Ársreikningur, 2 = Samstæðureikningur**, 8 = Staðfest
   vottorð (GJALD), 9 = Gjaldfrjálst yfirlit.
2. **Karfa** — `GET skatturinn.is/da/CartService/addToCart?itemid=<nr>&typeid=<t>`
   (með lotuköku `JSESSIONID`) → JSON `{ shoppingCartUrl: "vefur.rsk.is/Vefverslun/Default.aspx?kid=XXXX" }`.
3. **Vefverslun** (ASP.NET WebForms, `vefur.rsk.is/Vefverslun`) — fylla
   buyername/buyeremail → **„Áfram“** (`btnKaupa`) → `ReturnPage.aspx` (Verð **0**)
   → **„Sækja“** (`Btn_Saekja`) skilar `application/pdf`
   (`filename=<kt>_<nafn>_<ars|sr>_<ár>.pdf`).
4. **Þáttun** — `parse_arsreikningur.py` með pdfplumber.

> ⚠ Þrep 3 er ASP.NET-**ástandsvél**: `__VIEWSTATE` + `ASP.NET_SessionId` sem
> verður AÐEINS til í miðju flæði. Hrátt `fetch` nær því illa (skilar sömu körfu
> aftur); **hauslaus Chrome** (puppeteer-core) keyrir það áreiðanlega. Bætin eru
> sótt með `fetch` *innan* síðunnar svo þau fari framhjá niðurhalsstjóra vafrans.

## Þáttunar-gildrur (mikilvægt)
- **Broddstafir í MERKINGUM brenglast** (`á é í ð þ æ ö` → `�`) — kerfisbundinn
  ToUnicode-galli í RSK-PDF (bæði pypdf og pdfplumber). **Tölurnar eru réttar.**
  → merkja-pörun verður að vera **ASCII-beinagrind + röð**, ekki nákvæmir strengir.
- **Íslenskt talnasnið**: `.` = þúsundaskil, `,` = aukastafur, `(...)` = neikvætt.
- **Skýringardálkur** (1–99, líka „2.“) er EKKI fjárhæð → síaður frá; fjárhæðir
  eru tvær hægstu súlurnar (líðandi ár, fyrra ár).
- **Kvarði/mynt breytilegt**: flest ISK í heilum krónum; IFRS-félög oft í
  **þúsundum EUR/USD** („Fjárhæðir eru í þúsundum evra“). Skriptan les það.
- **Snið er tvenns konar**: staðlaður ehf-reikningur (Sala/Kostnaðarverð…) vs
  IFRS-samstæða (Seldar vörur…). Örfélög nota einfaldað rekstrar-/efnahagsyfirlit.
- **Reikningsjafnan er traust**: Eigið fé = Eignir − Skuldir (og öfugt) — notað
  þegar millisummu-línan þáttast ekki (t.d. IFRS). Sést í `afleitt`-lista.
- **Krossgátun**: skýrsla stjórnar nefnir höfuðtölur í TEXTA
  („Eiginfjárhlutfallið var 49%“, „eignir námu 996 millj.“) → öruggur varasjóður.

## KPI sem reiknast
framlegð · EBIT-hlutfall · hagnaðarhlutfall · ROE · ROA · eiginfjárhlutfall ·
veltufjárhlutfall · skuldahlutfall (D/E) · eignavelta · (tekjuvöxtur milli ára).

## Notkun
```bash
npm i puppeteer-core          # notar Chrome sem er uppsettur (CHROME_PATH ef annað)
node skriptur/build_arsreikningar.mjs 6912002990            # eitt félag, nýjasta skjal (2 ár)
node skriptur/build_arsreikningar.mjs 5411850389 --ar 3     # 3 nýjustu skjöl
```

## Vörður-samþætting (ákvörðun Arons)
Cloudflare-vörður getur **ekki** keyrt vafra. Kostir:
- **(a)** forkeyra `gogn/arsreikningar/<kt>.json` fyrir *fylgt/vinsæl* félög í næturkeyrslu;
- **(b)** sér Node-þjónusta / GitHub-Action með Chrome sem vörður kallar á við kaup;
- **(c)** Cloudflare Browser Rendering binding (gjaldskylt);
- **(d)** brjóta hráa fetch-flæðið til fulls (næstum tókst — vantar `ASP.NET_SessionId` samfellu).

⚠ **Hraðatakmörk**: ON-DEMAND (eitt félag við kaup). ALDREI fjöldakall. 24 klst cache.
⚠ **Persónuvernd**: aðeins lögaðilar. Ársreikningar lögaðila eru opinberir (lög nr. 3/2006);
RSK býður sjálft gjaldfrjálst rafrænt niðurhal.
