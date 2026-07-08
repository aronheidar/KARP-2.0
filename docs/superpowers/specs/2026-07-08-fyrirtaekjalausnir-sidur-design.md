# Hönnunarskjal: Fyrirtækjalausnir — vöru- & verðsíður (Creditinfo-samkeppni)

- **Dagsetning:** 2026-07-08
- **Staða:** Samþykkt hönnun (bíður spec-yfirferðar Arons) → næst: writing-plans
- **Umfang þessa spec-s:** VERK A (síðurnar). Verk B (þrepa-áskriftarvélin) er sér-spec síðar.

## 1. Markmið & staðsetning

Karp keppir við Creditinfo/Keldan um fyrirtækjagögn. Byggja **opnar vöru- og verðsíður** sem kynna fyrirtækjagagna-vörur Karps með Creditinfo-stíl framsetningu (verðtafla + vöru-landing per vöru).

**Kjarna-staðsetning (rauður þráður á öllum síðum):** Karp býður *allt sem Creditinfo hefur til fyrirtækjagreiningar* + **heilan flokk opinberra gagna sem þeir hafa ekki** (útboð, styrkir, Lögbirtingablaðið, vörumerki, skip, ökutæki, eftirlit…), **án leyfisskylda lánshæfismats/vanskilaskrár**, á lægra verði. Gatið (lánshæfismat/vanskilaskrá) er sett fram sem heiðarlegt val, ekki veikleiki.

## 2. Ákvarðanir úr brainstorm (læst)

| Ákvörðun | Val |
|---|---|
| Verðlíkan | **Hybrid** — þrepaskipt mánaðaráskrift + 990 kr stakar skýrslur |
| Fjöldi þrepa | **3** (Grunnur / Fyrirtæki / Fyrirtæki+) |
| Umfang | **Full svíta** — hub + 7 vöru-landing + nav-endurskipulag |
| Arkitektúr | **Fullur aðskilnaður** — opnar `/lausnir/` markaðssíður; tól óbreytt á núverandi slóðum |
| Verkskipting | **Verk A (síður) NÚNA**, Verk B (þrepa-vél) síðar |

## 3. Verðþrep (strawman — nákvæm verð/tölur fínstillt í útfærslu)

| | **Grunnur** 2.900/mán | **Fyrirtæki** 6.900/mán | **Fyrirtæki+** 12.900/mán |
|---|:--:|:--:|:--:|
| Aðgangar | 2 | 5 | 15 |
| Fyrirtækjaskrá + ársreikningar | ✓ | ✓ | ✓ |
| Endanlegir eigendur (UBO) + eignarhald | ✓ | ✓ | ✓ |
| Áreiðanleikamat (KYC) | ✓ | ✓ | ✓ |
| Verðmat fasteigna | ✓ | ✓ | ✓ |
| Fyrirtækjavaktin (fylgja félögum) | 10 félög | 50 félög | ótakmarkað |
| Viðskiptamannavakt (kt-vöktun) | ✗ | 25 kt | 100 kt |
| Fjölmiðlavakt | ✗ | ✓ | ✓ |
| Opnar vaktir (útboð·styrkir·Lögbirting·vörumerki·skip…) | ✓ | ✓ | ✓ |
| Stakar skýrslur innifaldar | — | 5/mán | 20/mán |
| ~~Lánshæfismat~~ · ~~Vanskilaskrá~~ | Bjóðum ekki* | Bjóðum ekki* | Bjóðum ekki* |

\*Leyfisskylt (Persónuvernd) — utan umfangs Karps að stefnu.

**+ Stök skýrsla 990 kr** (engin áskrift) — Teya-flæðið sem er virkt í dag.

Verð undirbýður öll þrjú Creditinfo-þrepin (3.900 / 12.670 / 22.980).

## 4. Síðu-arkitektúr

Nýtt **opið slóðasvæði `/lausnir/`** (engin gátt → kaldur gestur + Google lendir hér). Tól halda 100% núverandi virkni og slóðum; aðeins *markaðsefni* fært út í landing.

| Markaðssíða (opin, ný) | Trektar í tól (óbreytt) |
|---|---|
| `/lausnir/fyrirtaekjaskyrsla/` | `/fyrirtaeki/` |
| `/lausnir/eigendur/` | `/eigendur/` |
| `/lausnir/fasteignamat/` | `/fasteignavakt/` |
| `/lausnir/fyrirtaekjavaktin/` | fylgja á prófílum + `/mitt-svaedi/` |
| `/lausnir/fjolmidlavakt/` | `/frettir/` |
| `/lausnir/utbodsvaktin/` | `/utbod/` |
| `/lausnir/areidanleikamat/` | `/fyrirtaeki/` (KYC-kort) |

**Hub `/karp-pro/`** endurbyggð úr redirect-stubbanum → Fyrirtækjalausnir-yfirlit + verðtafla. Öll ~10 núverandi „hluti af Karp+"-CTA (spyrdu, eigendur, fyrirtaeki, gates…) vísa nú þegar á `/karp-pro/` → lifna við samstundis.

## 5. Landing-snið (ein endurnýtt Astro-eining)

Samræmt snið per vöru, í núverandi Karp-hönnun (dökkt `#0b0f17`/`#101623`, gyllt `#f6b13b`, `#eaf1fb` texti). Kaflar:

1. **Hero** — vöruheiti + eins-línu gildisloforð + megin-CTA (Prófa/Fletta upp → tól)
2. **Hvað fæst** — 3–6 eiginleika-kort
3. **Sýnishorn** — raunverulegt (t.d. hlekkur á `?syni=1` eða innfelld sýnishorns-mynd)
4. **Hvernig það virkar** — 2–3 skref
5. **Verð** — 990 kr stök *eða* „innifalið í Karp+ þrepi" (per vöru)
6. **CTA-borði** — → tól + → verð-hub
7. **Fyrirvari** — opinber gögn; hvorki lánshæfismat né vanskilaskrá

Eining tekur props (heiti, gildisloforð, eiginleikar[], sýnishorns-hlekkur, verð-tegund, tól-hlekkur) svo síðurnar 7 séu þunnar gagnaskrár.

## 6. Hub `/karp-pro/`

1. Hero — „Öll opinber fyrirtækjagögn á einum stað"
2. **Vöru-grid** — kort per vöru → `/lausnir/<vara>/`
3. **3-þrepa verðtafla** (kafli 3)
4. **990 kr stakar skýrslur** — fyrir án áskriftar
5. **„Karp vs Creditinfo"** samanburðar-blokk (staðsetning úr kafla 1)
6. CTA: Velja áskrift (→ Áskell, þrep-tilbúið) · Kaupa staka skýrslu (→ Teya, virkt)

## 7. Nav-endurskipulag (tillaga — fínstillt í útfærslu)

Nýr hópur **„Fyrirtækjalausnir" ⭐** efst, vísar á landing-síðurnar:
```
Fyrirtækjalausnir ⭐
  Yfirlit & verð          /karp-pro/
  Fyrirtækjaskýrsla        /lausnir/fyrirtaekjaskyrsla/
  Endanlegir eigendur      /lausnir/eigendur/
  Fyrirtækjavaktin         /lausnir/fyrirtaekjavaktin/
  Áreiðanleikamat          /lausnir/areidanleikamat/
  Fasteignamat             /lausnir/fasteignamat/
  Fjölmiðlavakt            /lausnir/fjolmidlavakt/
  Útboðsvaktin             /lausnir/utbodsvaktin/
```
Núverandi „Karp+" hópur einfaldast í *aðgang + frjálsar vaktir*:
```
Karp+ ⭐
  Mitt svæði               /mitt-svaedi/
  Leitarorðavaktin         /vaktir/      (frjáls)
  Eftirlitsvaktin          /eftirlit/    (frjáls)
  Ökutæki & skip           /okutaeki-skip/ (frjáls)
```
Tól-slóðirnar (`/fyrirtaeki/` o.fl.) eru ekki lengur beint í nav — þær eru appið á bak við hverja landing (og áfram beint aðgengilegar um URL + `?q=` djúptengla).

## 8. Greiðslu-tenging

- **990 kr stakar** → `karpCheckout({kind})` Teya-flæðið, **virkt í dag** ✅ (fyrirtaeki/fasteign/eigendur).
- **Áskriftar-þrep** → „Velja áskrift"-hnappur kallar á **þrep-tilbúið fall** (`karpSubscribeTier(tier)`) sem Verk B vírar í Áskel embedded checkout. Þangað til Verk B er tilbúið: hnappurinn sýnir hóflegt „Áskrift opnar á næstunni — skráðu áhuga" (t.d. `mailto:` eða einfalt áhuga-form) — **byggir ekkert sem brotnar eða lekur.**

## 9. Utan umfangs (Verk B — sér-spec síðar)

- 3 ný Áskell-plön (Aron stillir upp í Áskeli).
- Entitlement-líkan úr *per-þjónustu* (`subs.frettir/utbod`) í *per-þrep* (`subs.tier` með stigveldi).
- Endurskrifa gátunar-rök (`lockedSvc`/`isSub`) til að athuga þrep-stig.
- Samræma núverandi 3.490/mán frettir/utbod-áskriftir við ný þrep-búnt.

## 10. Áhættu-vörn

- **Tól óbreytt að virkni** — aðeins markaðsefni fært út; leit/skýrsla/gátt/`?q=`/Mitt svæði ósnert.
- Áskrift-CTA er þrep-tilbúið en byggir enga hálfkláraða greiðslu.
- Endurbygging `/karp-pro/` skiptir út redirect-stubb → engin núverandi virkni tapast (CTA batna).

## 11. Prófun

- `astro build` gengur (engin ný villa; síðu-fjöldi eykst um ~8).
- Allar `/lausnir/` síður + hub rendera; CTA-tenglar réttir (landing→tól, hub→landing/verð).
- Responsive (mobile/tablet/desktop) + passar hönnunarkerfið.
- Preview-skjámyndir af hub + einni landing til staðfestingar.

## 12. Öryggi & lögfræði

- **Aðeins opinber gögn.** Engin lánshæfismat/vanskilaskrá (Persónuverndar-leyfisskylt) — sagt berum orðum á hub + landing.
- Fyrirvari á hverri síðu: „byggt á opinberum gögnum; hvorki lánshæfismat né vanskilaskrá".
- Opnar síður (engin persónugögn birt á markaðssíðum sjálfum).
