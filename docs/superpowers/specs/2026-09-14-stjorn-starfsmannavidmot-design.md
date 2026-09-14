# /stjorn/ — starfsmannamiðað viðmót (Hluti A: viðmótið)

**Dagsetning:** 2026-09-14 · **Staða:** samþykkt í hönnunarsamtali, bíður verkáætlunar

## Markmið

`/stjorn/` er í dag ein súla með tíu blokkum og ~1.050 línum. Ekkert er flokkað eftir því **hver** sinnir því, svo Aron þarf að lesa alla síðuna til að finna hvað bíður hans. Markmiðið er að hann geti smellt á starfsmann og séð hvað sá er að gera — og að forsíðan svari einni spurningu strax: *hvað bíður mín?*

## Ákvarðanir og rökin að baki

| Ákvörðun | Rök |
|---|---|
| Ein síða: forstofa + andlitarönd, slóð man valið (`#sigrun`) | Allt sækist í sama kalli og í dag; bókamerki og djúptenglar virka; ekkert skrun milli óskyldra blokka |
| **Aðeins þeir sem gera eitthvað fá spjald** | Andlit með tómri skúffu þjálfar mann í að hætta að opna skúffur. Sigrún og Hrafn hafa raunverulegt starf í dag |
| Kári og Hildur verða **Moot-persónur eingöngu** | Spjald Kára hefði eingöngu innihaldið vinnu annarra — forstofan er skjár, ekki starfsmaður. Lögfræði breytist tvisvar á ári: það er skjal, ekki starfsmaður. Báðir halda sæti sínu í Moot þar sem fjölbreytt sjónarhorn er tilgangurinn |
| Hrafn: **CTO → forritari** | CTO tekur stefnumótandi ákvarðanir; það gerir Aron. Hrafn finnur rót, skrifar minnstu öruggu lagfæringuna, opnar PR |
| Hrafn fær **bilanalista**, ekki bara hjálparbeiðnir | Flest sem bilar á karp.is kvartar enginn notandi yfir (tvær CI-keyrslur féllu 14.9 og enginn tók eftir; karp2-byggingin fellur við hvert push) |
| Tölur án eiganda fara á forstofuna | MRR, notendur og trekt eiga engan starfsmann — þær eiga ekki að felast bak við persónu |
| Moot hættir að vera blokk | Moot er fundur **um mál**: hann opnast úr beiðninni og atkvæðið birtist í „Bíður þín" |

## Uppbygging viðmótsins

```
/stjorn/                     forstofa (sjálfgefið)
  ├── Bíður þín              þvert á starfsfólk, raðað eftir biðtíma
  ├── Lykiltölur             MRR · áskriftir · notendur · trekt · endurnýjun
  ├── Andlitarönd            [🛟 Sigrún 2]  [🛠️ Hrafn 1]
  └── Viðskiptavinir         samanbrotinn listi með leit (verkfæri, ekki starfsmaður)

/stjorn/#sigrun              spjald Sigrúnar   (← Forstofa)
/stjorn/#hrafn               spjald Hrafns     (← Forstofa)
```

Andlitaröndin sýnir **aðeins virka starfsmenn**. Nýr starfsmaður birtist fyrst þegar vélin á bak við hann er komin (Bjarki: hluti B).

## Spjald-beinagrindin — eins hjá öllum

Fimm hólf, alltaf í sömu röð. Það er þetta sem gerir spjöldin að liði frekar en átta ólíkum mælaborðum:

1. **Haus** — andlit, nafn, hlutverk, staða í einni línu, síðast virk(ur)
2. **Bíður þín** — það eina sem má trufla; tala og hnappur á hverri línu
3. **Í vinnslu / síðast gert** — fimm nýjustu atburðir þessa starfsmanns
4. **Tölur sem ég vakta** — 3–4 lykiltölur
5. **Það sem ég má gera** — heimildir, girðingar og rofi

Tómt hólf birtist ekki (t.d. „Bíður þín" hverfur þegar ekkert bíður) — spjaldið á aldrei að sýna núll bara til að fylla formið.

## Forstofan

**Bíður þín** sameinar á einn lista, raðað eftir því hversu lengi hvert atriði hefur beðið, hvert með andliti eiganda. Listinn er **sömu atriði og standa í „Bíður þín"-hólfi hvers spjalds** — ein uppspretta (`bidur_thin.mjs`), tvær birtingar: sameinuð á forstofunni, síuð á spjaldinu. Tölurnar geta því aldrei stangast á.

- svar-tillaga sem AI samdi (Sigrún má ekki senda hana sjálf)
- „samþykkt — ósent" (Já í Moot en svarið fór aldrei)
- beiðni ósvöruð lengur en 48 klst
- CTO-tillaga í stöðu `tillaga` (PR tilbúinn)
- opinn PR eldri en 7 daga sem engin beiðni á (sama viðmið og á bilanalistanum)
- Moot-niðurstaða án atkvæðis
- bilun á bilanalista með alvarleika `hatt`

**Lykiltölur**: MRR, virkar áskriftir, seldar skýrslur, notendur (nýir 7d), umbreytingar-trekt, það sem rennur út næstu 30 daga. Sömu tölur og í dag, bara safnað saman efst.

**Viðskiptavinir**: núverandi notendatafla með ⚙-spjaldi óbreytt, en samanbrotin með leitarreit. Hún er dagleg verkfæri en á ekki að vera veggur sem skrunað er framhjá.

## Sigrún — þjónustufulltrúi

| Hólf | Innihald |
|---|---|
| Haus | 🛟 Sigrún, þjónustufulltrúi · „N opnar beiðnir, M bíða þín" · síðast virk: nýjasta `ticket_msgs.ts` með `sent_by='agent'` eða innlestur |
| Bíður þín | beiðnir með AI-svar-tillögu · `moot_osent` · ósvarað > 48 klst |
| Í vinnslu | 5 nýjustu úr `ticket_msgs` (staðfestingar, KB-svör, innlestur, svör send í hennar nafni) |
| Tölur | opnar beiðnir · miðgildi svartíma · hlutfall mála sem leystust án Arons · beiðnir síðustu 7 daga |
| Má gera | staðfesting (sniðmát) · KB-svar orðrétt við vissu ≥ 0,9 · lesa hjalp@ · **aldrei** AI-saminn texti · rofi |

Beiðnalistinn, þráðurinn, svar-reiturinn, „✉️ Nýr póstur", „📥 Sækja póst" og póstsniðmátin (14) flytjast öll hingað óbreytt að virkni. Moot opnast úr beiðni.

## Hrafn — forritari

| Hólf | Innihald |
|---|---|
| Haus | 🛠️ Hrafn, forritari · „main grænt · ekkert í vinnslu" · síðast: nýjasta CTO-keyrsla eða merge |
| Bíður þín | CTO-tillögur í stöðu `tillaga` · opnir PR-ar sem enginn á · bilanir með alvarleika `hatt` |
| Í vinnslu | 5 nýjustu keyrslur: hvaða verk, hvað breyttist (skrár + línur), hve lengi, **og hvort hún skilaði lagfæringu** |
| Tölur | er main grænt (síðustu 10) · keyrslur sem skiluðu lagfæringu · tími frá ræsingu að PR · fjöldi prófa |
| Má gera | aðeins `web/` og `skriptur/` · prófin græn · aldrei migrations/wrangler/.github/leyndarmál/greiðslukóði · merge aðeins með samþykki Arons · rofi |

**Niðurstaða er metin eftir verkinu, ekki exit-kóða.** Báðar CTO-keyrslur 13.9 eru merktar „failure" í GitHub þótt önnur hafi skilað PR #10 (PR-stofnun féll, lagfæringin stóð). Spjaldið les `tickets.cto_pr`/`cto_samantekt` og segir „skilaði lagfæringu" þegar PR varð til, óháð merkingu keyrslunnar.

### Bilanalistinn

Ein samsett fyrirspurn í GitHub, geymd í `stjorn_sync k='bilanir'` með 10 mínútna fyrningu (síðan má ekki hægja á sér né hamra GitHub):

| Uppspretta | GitHub-leið | Bilun þegar |
|---|---|---|
| CI á main | `actions/runs?branch=main&per_page=20` | nýjasta keyrsla `failure` |
| CTO-keyrslur | `actions/runs?workflow=cto.yml` | keyrsla féll **og** ticketið fékk engan PR |
| Byggingar | `commits/{tip}/check-runs` | check-run `failure` (karp2 fellur við hvert push — fyrsta verk Hrafns) |
| Opnir PR-ar | `pulls?state=open` | PR eldri en 7 daga |

Hver lína: uppspretta, lýsing, hvenær sást fyrst, alvarleiki (`hatt`/`midlungs`/`lagt`), og hnappur **„Senda Hrafn á þetta"**.

Ferskleiki gagna og næturkeyrslur eru **ekki** hér — það er starf Unnar og bíður hennar hrings.

## Vélarbreytingar

1. **`personur.mjs`**: `hrafn.hlutverk` → „forritari" (+ próf, + persónulýsing í `cto.yml`).
2. **`cto.yml`** tekur `verk` (frjálsan texta) auk `ticket`. Berist `verk` er engin beiðni sótt, `cto_result` er sleppt og niðurstaðan skráist í `stjorn_sync k='cto_verk'`. Girðingar óbreyttar.
3. **Nýtt: `web/src/worker/bilanir.mjs`** + `/api/admin/bilanir` (GET, admin-lota eða `X-Admin-Key`) — sækir og fyrnir bilanalistann, `POST {verk}` ræsir `cto.yml` með frjálsu verkefni.
4. **Rofar per starfsmann**: kort `starfsmadur → stjorn_sync-lykill` í `personur.mjs`. Sigrún heldur **núverandi lykli `hjalp_agent_off`** (ekkert endurnefnt, engin færsla á gögnum, `processNewTicket` óbreytt); Hrafn fær nýjan lykil `rofi_hrafn` sem stöðvar CTO-ræsingu (`_ghDispatch` skilar `{ok:false,error:'rofi'}`). Allsherjarrofinn hverfur af síðunni en lykill Sigrúnar er áfram sá sami undir.
5. **Gamli Node-farmurinn fer**: `stjorn`-lykillinn hverfur úr `/api/admin/overview` (1.478 bæti, enginn les hann, og ticket-listinn í honum stangast á við D1).

## Skráaskipan

`stjorn.astro` er 1.056 línur og myndi vaxa í ~1.600 óbreytt. Teikniröksemdin flyst því í prófaðar einingar og síðan verður umgjörð:

```
web/src/lib/stjorn/bidur_thin.mjs     hrein: overview+bilanir → samræmdur „bíður þín"-listi
web/src/lib/stjorn/spjald.mjs         hrein: beinagrindin (5 hólf) → HTML-strengur
web/src/lib/stjorn/sigrun.mjs         hrein: overview → hólfin fimm hjá Sigrúnu
web/src/lib/stjorn/hrafn.mjs          hrein: overview+bilanir → hólfin fimm hjá Hrafni
web/src/worker/bilanir.mjs            I/O: GitHub-fyrirspurnir, fyrning, /api/admin/bilanir
web/src/pages/stjorn.astro            umgjörð: sækir gögn, teiknar forstofu og skiptir um spjald
```

Hreinu einingarnar taka gögn og skila HTML-streng — þær prófast með `node --test` eins og `hjalp_agent.mjs` og `moot_logic.mjs`.

## Öryggisreglur sem haldast óbreyttar

- Agent sendir sjálfur AÐEINS sniðmáts-staðfestingu og orðrétt KB-svar (vissa ≥ 0,9). Allt AI-samið bíður Arons.
- Moot breytir aldrei stöðu og sendir aldrei póst; `atkvaedi` hafnar `X-Admin-Key`.
- `samthykkja` (merge) krefst innskráðrar lotu — lykill má lesa en ekki ákveða um kóða í framleiðslu.
- CSRF-gát á öllum kökulotu-POST-um; texti notanda er gögn, aldrei fyrirmæli.
- Nýi endapunkturinn `/api/admin/bilanir` fylgir sama mynstri: GET má með lykli, `POST {verk}` krefst lotu (það ræsir kóðabreytingu).

## Prófun

- Hreinu einingarnar: `bidur_thin` (röðun eftir biðtíma, sameining ólíkra uppsprettna, tómt ástand), `spjald` (hólf sem eru tóm birtast ekki), `sigrun`/`hrafn` (réttar tölur úr raunverulegu overview-svari).
- `bilanir.mjs`: falsað `fetch` með GitHub-svörum → réttur listi, fyrning virkar, GitHub niðri → síðan heldur áfram með síðasta þekkta lista.
- „Skilaði lagfæringu" gagnvart „failure": próf sem staðfestir að keyrsla merkt `failure` með `cto_pr` telist sem lagfæring.
- Núverandi 730 próf verða að haldast græn.

## Utan umfangs

- **Bjarki** (markaðsfulltrúi): Postiz-samstilling, efnissafn í D1, fjölmiðlatillögur og framleiðsla í GitHub Action — eigið skjal (hluti B). Andlit hans birtist þegar sú vél er komin.
- **Unnur, Elín, Egill**: bíða síns hönnunarhrings.
- Útlitsbreytingar umfram það sem skipulagið kallar á (litir, letur, tákn) — sjá afvélvæðingar-verkefnið.
