# Endanlegir eigendur (UBO) — hönnunar-spec

**Dags:** 2026-07-08 · **Grein:** claude/charming-kepler-e09323 · **Höfundur:** Claude (fyrir Aron)

## 1. Markmið

Byggja **vandaða, ítarlega, sjónræna og prentanlega „Endanlegir eigendur"-skýrslu** (UBO — ultimate
beneficial owners) fyrir íslensk félög — Creditinfo-jafngildi. Þetta er **söluvara** undir
Fyrirtækjaskrá (Karp+), seld **per-skýrslu (990 kr)** eins og fyrirtækjaskýrslan.

**Samþykkt stefna (val Arons, 2026-07-08):**
1. **Pökkun = Bæði** — *teaser*-net inni í fyrirtækjaskýrslunni + *full* UBO-skýrsla seld sér með eigin lykli.
2. **Eignakeðja = Full endurkvæm UBO-tré** — rekja félagakeðjur endurkvæmt, margfalda eignarhlutföll,
   reikna raunverulegt endanlegt %, „óþekktir endanlegir eigendur" sem afgang.
3. **Skráðir hluthafar = í V1** — ný hluthafa-þáttun úr ársreikningi (+ spike á raunreikningi), hrörnar
   fallega þar sem gögn vantar.

Aðeins **opinber gögn**. Íslenska alls staðar. Dökkt þema (accent `#f6b13b`). CSP bannar ytri skriftur/leturgerðir → **allt inline/self-contained** (netið teiknað með inline SVG, engin ytri graf-bókasöfn).

## 2. Viðmiðun — Creditinfo „Endanlegir eigendur" (dregið úr sýnishorni)

Uppbygging skýrslunnar þeirra (röð kafla), sem við speglum:

1. **Inngangur/heimildir:** *„Endanlegir eigendur innihalda upplýsingar um eigendur íslenskra fyrirtækja
   og vensl þeirra. Upplýsingarnar byggja á gögnum úr hlutafélagaskrá, ársreikningum og frá Kauphöll
   Íslands. Jafnframt fylgir listi yfir skráða hluthafa og upplýsingar um raunverulega eigendur frá
   Skattinum."*
2. **„Yfirlit yfir endanlega eigendur"** — litakóðað eignarhaldsnet. Texti: *„Myndin sýnir alla endanlega
   eigendur sem eiga 10% eða meira í félaginu en þó alltaf þrjá stærstu."*
3. **Litaskýring** (8 færslur): `Fyrirtækið` · `Eign einstaklings umfram 25%` · `Eign einstaklings minni
   en 25%` · `Eign fyrirtækis umfram 25%` · `Eign fyrirtækis minni en 25%` · `Eign 51% eða meiri` ·
   `Eign á bilinu 25% til 51%` · `Eign minni en 25%`. (Fyrstu 5 = hnútalitir, síðustu 3 = leggjabönd.)
4. **UBO-tafla:** dálkar `Endanlegur eigandi | Eignarhluti | Eignatengsl í gegnum`. Dæmi: „Njáll
   Þorgeirsson — 67,40% — Leggir ehf., Vala hf. (310272-3349)". Endar á `Óþekktir endanlegir eigendur
   3,60%` og `Samtals 100,00%`.
5. **„Raunverulegir eigendur samkvæmt fyrirtækjaskrá"** — tafla `Aðili | Fæðingarár/mán | Búsetuland |
   Ríkisfang | Tegund eignahalds | Eignarhlutur`. (Nákvæmlega gögnin sem worker-inn skrapar nú þegar.)
6. **„Yfirlit yfir hluthafa"** — baka (pie) yfir stærstu hluthafa + tafla `Hluthafi | Eignarhluti |
   Dags. heimildar | Heimild` (t.d. „A20 ehf. — 50% — 30.07.2020 — Ársreikningur 2019, A20 ehf.").

Athygli: Creditinfo sýnir **kennitölu** endanlegra eigenda og hluthafa. Hjá okkur fæst kt **hluthafa** úr
ársreikningi (oft) en **ekki** kt einstaklinga úr RSK-raunverulegum-eigendum (aðeins nafn + fæðingarár).
Þetta er skjalfest takmörkun (sjá §9, §10).

## 3. Arkitektúr / gagnaflæði

Speglar ársreikninga-pípuna 1:1 (staðfest í kóða: `arsreikningurRequestHandler` → `arsreikningur.yml`
→ `build_arsreikningar.mjs`; framendi poll-ar JSON).

```
Kaup/skoðun (innskráður kaupandi á /fyrirtaeki/)
 → framendi poll-ar /gogn/eigendur/<kt>.json?t=<nú>
   → 404 & owned → POST /api/eigendur/request?kt=<kt>   (worker karp21)
     → repository_dispatch { event_type:'eigendur', client_payload:{ kt } }
       → .github/workflows/eigendur.yml   (ubuntu, node 22, python 3.12)
         → npm i puppeteer-core · pip install pdfplumber
         → node skriptur/build_eigendur.mjs <kt>
             → endurkvæmt: RSK raunv. eigendur (rót) + ársreikninga-hluthafar (kt) niður tréð
             → reikna endanlegt eignarhald + heimildir
             → skrifa web/public/gogn/eigendur/<kt>.json  → git commit + push (rebase-retry)
 → næsta poll finnur JSON → framendi birtir fulla skýrslu (net v3 + töflur + prent),
   gátað með hasReport('eigendur:'+kt) (eða isAdmin)
```

**Hraði/öryggi:** on-demand (aðeins keypt/skoðuð skýrsla), 24 klst skyndiminni (endurnýjað ef `sott`
eldra), 1–2 s milli RSK-kalla, dýptar-/hnútaþak, **aldrei fjöldakall**. Kaupenda-gátun (uid krafist) og
`GITHUB_DISPATCH_TOKEN`-leynd draga úr misnotkun — nákvæmlega eins og ársreikningarnir.

## 4. Gagnaskema — `web/public/gogn/eigendur/<kt>.json`

```jsonc
{
  "kt": "5810080150",
  "nafn": "Gervifyrirtæki ehf.",
  "sott": "2026-07-08",                       // dagsetning byggingar (fyrir cache-endurnýjun)
  "heimildir": ["Hlutafélagaskrá (RSK)", "Ársreikningaskrá (RSK)",
                "Raunverulegir eigendur (Skatturinn)"],
  "dypt": 4,                                  // mesta dýpt sem náðist
  "hnutar_alls": 12,                          // fjöldi hnúta í neti (öryggis-tölfræði)
  "afmarkad": false,                          // true ef stöðvað á MAX_DEPTH/MAX_NODES (birt sem fyrirvari)

  "net": {
    "nodes": [
      { "id":"root", "kt":"5810080150", "nafn":"Gervifyrirtæki ehf.", "tegund":"felag", "er_rot":true },
      { "id":"n1", "kt":null, "nafn":"Njáll Þorgeirsson", "tegund":"einst",
        "faeding":"1972", "land":"Ísland", "endanlegur":true },
      { "id":"n2", "kt":"4302694459", "nafn":"Leggir ehf.", "tegund":"felag" }
      // ...
    ],
    "edges": [
      // fra = eigandi, til = félag sem er í eigu; hlutur = %; band ∈ {"51","25","lt25"}
      { "fra":"n2", "til":"root", "hlutur":50.0, "band":"25", "heimild":"Ársreikningur 2019, Gervifyrirtæki ehf." },
      { "fra":"n1", "til":"n2",  "hlutur":100.0, "band":"51", "heimild":"Raunverulegir eigendur (Skatturinn)" }
      // ...
    ]
  },

  "endanlegir": [                             // UBO-tafla (röðuð fallandi eftir hlut)
    { "nafn":"Njáll Þorgeirsson", "kt":null, "faeding":"1972", "tegund":"einst",
      "hlutur":67.40, "gegnum":["Leggir ehf.","Vala hf."] },
    { "nafn":"Cranberry Investments", "kt":"6603199530", "tegund":"felag",
      "hlutur":9.96, "gegnum":["Appelsínur ehf.","Epli ehf."] }
    // ...
  ],
  "othekkt": 3.60,                            // óþekktir endanlegir eigendur (afgangur upp í 100%)

  "raunverulegir": [                          // beint úr RSK (worker-þáttun, endurnýtt)
    { "nafn":"Njáll Þorgeirsson", "faeding":"1972-FEBRÚAR", "buseta":"Ísland",
      "rikisfang":"Ísland", "tegund":"Óbeint eignarhald á hlutafé", "hlutur":"69%" }
  ],
  "raunverulegirTomt": false,                 // true = svæðið til hjá RSK en enginn >25% skráður

  "hluthafar": [                              // úr ársreikningi rótarinnar (ný þáttun)
    { "nafn":"A20 ehf.", "kt":"4302694459", "hlutur":50.0, "dags":"30.07.2020",
      "heimild":"Ársreikningur 2019, A20 ehf." }
    // ...
  ],
  "hluthafarUppspretta": "Ársreikningur 2019"  // eða null ef ekkert þáttaðist
}
```

**Merki-JSON (ekkert nothæft):** eins og ársreikningarnir skrifum við `{ kt, nafn, sott, engin:true,
astaeda:"…" }` svo framendi stöðvi poll og sýni loka-ástand (ekki eilífan spinner). Ástæður: félag án
hluthafalista OG án raunverulegra eigenda → ekkert til að byggja net á.

## 5. Íhlutir

### 5a. `skriptur/parse_arsreikningur.py` — bæta hluthafa-þáttun

**Hvað:** finna hlutafjár-/„Hluthafar"-skýringu í ársreiknings-PDF og þátta lista → `hluthafar`.
**Viðmót:** nýr top-level lykill í JSON-inu sem parserinn prentar: `"hluthafar": [{nafn, kt|null,
hlutur(%)}]`. KPI-/reikningsþáttun **óbreytt**.
**Útfærsla:** ný fall `parse_hluthafar(pdf)` sem leitar að síðu/reit með haus sem passar
`hlut(hafa|hafar|afjár?eign)` (ASCII-beinagrind vegna brenglaðra broddstafa, `.` passar við brengl), les
raðir með sömu hnita-þáttun (`rows_of_page`) og dregur út `nafn` (bókstafir), `kt` (regex `\d{6}-?\d{4}`
ef til staðar) og `hlutur` (prósenta/hlutfall). Þolir að listinn sé í töflu eða í texta.
**Fyrirvari/spike:** snið hluthafalista er **misjafnt** milli endurskoðenda → **spike fyrst** á 2–3
raunreikningum (§10). Finnist ekkert nothæft → `"hluthafar": []` (kaflinn hrörnar fallega).
**Háð:** pdfplumber (þegar til staðar).

### 5b. `skriptur/build_eigendur.mjs` — nýr endurkvæmur safnari (kjarninn)

**Hvað:** frá rót-kt → byggja fullt UBO-tré → reikna endanlegt eignarhald → skrifa
`gogn/eigendur/<kt>.json`.

**Endurnýting + refaktor:** `build_arsreikningar.mjs` inniheldur `fetchItemids`, `addToCart`,
`downloadPdf`, `parsePdf`, kökuhjálp. Dreg sameiginlegu RSK+PDF-hjálpina út í `skriptur/lib/rsk.mjs`
(markviss endurbót á kóða sem við vinnum í) og læt **bæði** `build_arsreikningar.mjs` og
`build_eigendur.mjs` importa hana. `build_arsreikningar.mjs` heldur hegðun óbreyttri.

**Nýir hlutar í `lib/rsk.mjs`:**
- `fetchRaunverulegir(kt)` — sækir RSK-detail-síðuna og þáttar „Raunverulegir eigendur" (port á
  worker-lógík í `worker.js` ~línur 687–705) → `[{nafn, faeding, buseta, rikisfang, hlutur, tegund}]`
  eða `{tomt:true}`. Notað fyrir rótina (og til krossgátunar).
- `fetchHluthafar(kt)` — keyrir `addToCart`/`downloadPdf`/`parsePdf` á nýjasta ársreikningi og skilar
  `parsed.hluthafar` (kt-berandi hluthafar drífa endurkvæmnina). Skyndiminni per-kt innan keyrslu.

**Endurkvæmnin (`byggja(kt)`):**
1. `visited` sett (hringgreining), `depth` teljari, `MAX_DEPTH=5`, `MAX_NODES=60`.
2. Fyrir hvert félag: `fetchHluthafar(kt)` → fyrir hvern hluthafa búa til hnút + legg (`hlutur`).
   Sé hluthafi **lögaðili með kt** og `depth<MAX_DEPTH` og ekki í `visited` → endurkvæmt.
   Einstaklingur eða lögaðili án frekari gagna = **lauf** (mögulegur endanlegur eigandi).
3. Bæta RSK-raunverulegum-eigendum rótarinnar við sem hliðstæðri heimild (birt í eigin töflu; má líka
   nota til að staðfesta/auðga UBO-röðun rótarinnar).
4. 1–2 s töf milli RSK-kalla. Stöðvist á þaki → `afmarkad:true`.

**UBO-reikningur (§6).** Skilar `net`, `endanlegir`, `othekkt`.

**Öryggi:** untrusted kt normaliserað; per-kt cache; villa/þrottla á RSK **kastar** (per-kt catch) svo
falskt „engin gögn" skrifist ekki ofan á góð (sama vörn og `fetchItemids`).
**Háð:** puppeteer-core (lazy, eins og nú), python/pdfplumber.

### 5c. Framendi — `web/src/pages/fyrirtaeki.astro`

**Net v3 (miðpunktur):** stækka `fsTengsl`/`fsWireTengsl` (task #25 tengslakort v2) úr einu radíal-hring
í **fjöl-þrepa Creditinfo-stíl**: félag efst/miðju; endanlegir eigendur ytst; **millifélög á leggjunum**
(„í gegnum"). Þegar keðjur eru djúpar → lagskipt útlit (raðir eftir dýpt). Endurnýti responsive-`paint()`,
smell→`nav(kt)`, hover-highlight og prent-CSS úr v2. Inline SVG-leggir + HTML-hnútar.

**Litakóðun (§7).** **Litaskýring** með nákvæmu Creditinfo-orðalagi (§2.3).

**Skýrslu-kaflar (prentvænir, í `hasReport('eigendur:'+kt)`-hlutanum):**
1. Inngangur/heimildir (Creditinfo-orðalag, aðlagað).
2. „Yfirlit yfir endanlega eigendur" — net v3 + litaskýring + „≥10%, alltaf ≥3 stærstu"-texti.
3. UBO-tafla `Endanlegur eigandi | Eignarhluti | Eignatengsl í gegnum` + „Óþekktir endanlegir eigendur"
   + „Samtals 100%".
4. „Raunverulegir eigendur skv. fyrirtækjaskrá" (úr `raunverulegir`; `raunverulegirTomt` → skýringartexti).
5. „Yfirlit yfir hluthafa" — inline-SVG baka + tafla `Hluthafi | Eignarhluti | Dags. heimildar | Heimild`
   (úr `hluthafar`; tómt → „hluthafalisti ekki tilgreindur í nýjasta ársreikningi").
6. Heimildaklausa + persónuvernd-fótur + „Sótt: <sott>".

**Poll/trigger:** ný `eigendurData(kt, owned)` fall speglar `arsreikningur`-poll (línur ~724–740):
`fetch('/gogn/eigendur/'+kt+'.json?t='+Date.now())`; 404 & owned → `POST /api/eigendur/request`;
spinner (áætluð framvinda) þar til JSON birtist; `engin:true` = loka-ástand.

### 5d. Worker — `web/worker.js`

Ný `eigendurRequestHandler(request, env, ctx)` — nákvæm spegilmynd af `arsreikningurRequestHandler`
(línur ~1216–1235): krefst uid, `repository_dispatch { event_type:'eigendur', client_payload:{kt} }`,
sama `GITHUB_DISPATCH_TOKEN`. Ný leið `/api/eigendur/request` í router.

### 5e. GitHub Action — `.github/workflows/eigendur.yml`

Spegill af `arsreikningur.yml`: `on: repository_dispatch types:[eigendur]` + `workflow_dispatch`
(handvirk kt). Skref: checkout → node 22 + python 3.12 → `npm i puppeteer-core --no-save` +
`pip install pdfplumber` → draga út kt úr untrusted payload um env (sama shell-injection-vörn) →
`node skriptur/build_eigendur.mjs $KTS` → commit `web/public/gogn/eigendur/` með push-rebase-retry.

## 6. UBO-reikningur (algrím)

- **Tré** rótfest á félagi C. Leggur = eignarhlutfall (eigandi → á → félag), brot ∈ [0,1].
- **Endanlegt hlutfall** eiganda O = Σ yfir allar leiðir rót→O af **margfeldi** leggjabrota á leiðinni.
- **Auðkenni til samlagningar:** `kt` ef til; annars normaliserað `nafn|faeding`. (Sami eigandi um margar
  keðjur → lögð saman.)
- **Endanlegur eigandi** = lauf: einstaklingur, **eða** lögaðili sem við náðum ekki að rekja lengra
  (enginn ársreikningur/hluthafalisti/kt) → birtur sem endanlegur með fyrirvara.
- **Óþekktir endanlegir eigendur** = `100% − Σ(þekkt endanleg %)`. Fangar: hluthafa undir þáttunar-
  þröskuldi, órekjanlegar greinar, vantandi lista. Alltaf birt (heiðarleiki, eins og Creditinfo).
- **Net-þröskuldur:** sýna alla endanlega ≥10%; ef færri en 3 ná 10% → fylla upp í 3 stærstu.
- **Námundun:** hlutföll í neti/töflu á 2 aukastöfum; „Samtals" alltaf 100,00% (afgangur í „óþekkt").

## 7. Litakóðun & útlit (dökkt þema, inline)

**Hnútar** (fylling ræðst af `tegund` × hvort hlutur ≥25%). Viðmiðunar-hlutur = eignarhlutur hnútsins í
barni sínu (leggurinn út frá honum); fyrir **endanlega eigendur** í hub-sýn = reiknað endanlegt %.

| Flokkur | Merking | Litur (drög — fínstilltir gegn Creditinfo + dökku þema) |
|---|---|---|
| Fyrirtækið (rót) | `er_rot` | accent-gull rammi `#f6b13b`, dökk fylling |
| Einstaklingur ≥25% | `einst` sterkur | sterkur blár/grænn |
| Einstaklingur <25% | `einst` deyfður | sami litur, deyfður |
| Lögaðili ≥25% | `felag` sterkur | sterkur fjólublár/rauðgulur |
| Lögaðili <25% | `felag` deyfður | sami litur, deyfður |

**Leggir** (litur/breidd eftir `band`): `51` = sterkastur/breiðastur · `25` = miðlungs · `lt25` =
daufastur/mjóstur. Breidd ≈ hlutur (eins og v2). Punktalína ef hlutur óþekktur.
**Litaskýring** birtir öll 8 Creditinfo-heitin (§2.3). Litir uppfylla andstæðukröfur á dökku þema og eru
aðgreinanlegir í svarthvítri prentun (breidd/mynstur til vara fyrir litblindu).

## 8. Pökkun / sala / gátun (Bæði)

- **Teaser** (í fyrirtækjaskýrslunni, opið eins og nú): núverandi tengslakort uppfært í v3-liti (flöt sýn
  á raunverulegum eigendum) + CTA-spjald: „🔓 Full skýrsla um endanlega eigendur — sjá alla keðjuna,
  hluthafalista og prentvæna PDF — 990 kr".
- **Full skýrsla** (sér vara): gátt `hasReport('eigendur:'+kt)` (eða `isAdmin`). Ókeypt → `fsGate`-stíl
  lás með sýnishorns-hlekk. Kaup → `karpCheckout({ kind:'eigendur', ref:(nafn+' '+kt), key:'eigendur:'+kt })`
  → poll/generate → full birting. Prent-hnappur → `window.print()` (owned → „Sækja PDF").
- **Sýnishorn:** `?eigendur-syni=1` → opið gervifélag úr `web/public/gogn/eigendur/_synishorn.json`
  (speglar Creditinfo-dæmið: Njáll Þorgeirsson 67,40% í gegnum Leggir ehf. + Vala hf.; Cranberry 9,96%;
  Monsters 9,96%; Shells 1,93%; óþekkt 3,60%; raunv. eigandi Njáll 69%; hluthafar A20 ehf. 50% o.s.frv.).
  Þetta sýnishorn er **líka fixtan** fyrir framenda-þróun (ekkert RSK-kall þarf).

## 9. Lagalegt / persónuvernd (gegnumgangandi)

- **Aðeins opinber gögn** (hlutafélagaskrá, ársreikningaskrá, raunverulegir eigendur Skattsins; Kauphöll
  þegar við á).
- Einstaklingar birtir **eins og heimildin birtir þá** — nafn + fæðingarár; **kt aðeins ef opinbert í
  heimildinni** (t.d. kt hluthafa úr ársreikningi). Aldrei kt einstaklinga úr RSK-raunv.-eigendum (ekki til).
- Tengsl = **„skráð/möguleg"**. Sömu-manneskju-tenging án kt (nafn+fæðingarár) er **best-effort** —
  merkt skýrt, **aldrei fullyrt tæmandi/öruggt**. (Endurnýtir varfærna orðalagið úr v2.)
- **Ekkert lánshæfismat / vanskilaskrá** (leyfisskylt). Heimildaklausa neðst eins og fyrirtækjaskýrslan.
- RSK-hraðatakmörk virt: on-demand + 24 klst cache + dýptar-/hnútaþak, **aldrei batch-skröpun**.

## 10. Áhætta & mótvægi

| # | Áhætta | Mótvægi |
|---|---|---|
| 1 | **Hluthafa-þáttun** — misjafnt PDF-snið, óstaðfest | **Spike** á 2–3 raunreikningum áður en framendi treystir á hana; graceful `hluthafar:[]`; kaflinn segir „ekki tilgreint í ársreikningi" |
| 2 | **Endurkvæm keðja endar snemma** (vantar ársreikning/kt millifélags) | Stór „óþekktir"-afgangur birtur heiðarlega; `afmarkad`-fyrirvari; net sýnir samt það sem næst |
| 3 | **Live RSK-niðurhal í ÞESSU worktree** (puppeteer óuppsett, Chrome, sandkassi) | Byggja á `_synishorn.json`-fixtu fyrir framenda; pípan keyrir „á alvöru" í GH Action/hjá Aroni; `npm i puppeteer-core` prófað staðbundið ef mögulegt |
| 4 | **Kauphöll/Nasdaq stórhluthafar** | **Utan V1** (secondary); `heimildir` gerir ráð fyrir viðbót síðar |
| 5 | Djúp/breið tré → hæg keyrsla, RSK-álag | `MAX_DEPTH=5`, `MAX_NODES=60`, hringgreining, 1–2 s töf |

## 11. Áfangar (verða að plani)

- **A — Parser + spike:** hluthafa-þáttun í `parse_arsreikningur.py` + staðfesting á raunreikningum.
- **B — Safnari + skema:** `skriptur/lib/rsk.mjs` (refaktor) + `build_eigendur.mjs` + `_synishorn.json`.
- **C — Framendi:** net v3 (litakóðun + fjöl-þrep) + skýrslu-kaflar + inline-baka + prent-CSS.
- **D — Pökkun:** teaser-CTA + `eigendur:<kt>`-gátt + `?eigendur-syni=1` + poll/trigger.
- **E — Bakendi:** `eigendurRequestHandler` (worker) + `eigendur.yml` (GH Action).

## 12. Verklok (DoD)

- `cd web && npx astro build` grænt (~197 síður); `node --check web/worker.js` grænt.
- Full „Endanlegir eigendur"-skýrsla prófuð **á sýnishorni** (`?eigendur-syni=1`) og **á raunfélagi með
  eigendur** (þar sem umhverfi leyfir RSK-niðurhal — annars staðfest í GH Action).
- Litakóðað inline-SVG-net, UBO-tafla, raunv.-eigenda-tafla, hluthafalisti, prentvæn PDF, íslenska alls
  staðar, per-skýrslu-gátun (990 kr), sýnishorn opið.
- **Samantekt fyrir Aron:** hvað var byggt, hvaða gögn nást/vantar (kt-takmörkun; hluthafalisti aðeins þar
  sem hann er í ársreikningi; keðja takmörkuð af dýpt/fáanlegum reikningum), og hvað mætti bæta síðar
  (Skatts-API fyrir kt einstaklinga; Kauphöll/Nasdaq stórhluthafar).

## 13. Opnar spurningar / framtíð

- **Skatts-API** fyrir kt einstaklinga myndi opna örugga sömu-manneskju-tengingu (nú best-effort).
- **Kauphöll/Nasdaq** flöggunartilkynningar fyrir skráð félög (secondary).
- **Þrautseigt hluthafa-index** (nafn+fæðingarár þvert á félög) — meiri kraftur en meiri persónuvernd-
  áhætta; haldið utan V1, endurmetið síðar.
