# Skilmálar & persónuvernd — uppfærður texti (drög)
## Það sem breyttist á karp.is/skilmalar/ vegna compliance-varanna

> **DRÖG — bíður yfirferðar persónuverndarlögfræðings.** Dagsett 26. júlí 2026. Þetta skjal sýnir breytingarnar á opinberu skilmála-/persónuverndarsíðunni (`web/src/data/skilmalar.json`, birt á **karp.is/skilmalar/**) svo lögfræðingur geti yfirfarið án þess að lesa JSON. Sjálfur gagnavinnslusamningurinn er í skjali `01-DPA-vinnslusamningur-Fyrirtaeki-plus.md`.

## Yfirlit breytinga

Síðan skiptist nú í þrjá hluta: **Notkunarskilmálar**, **Persónuverndarstefna** og nýjan þriðja hluta **Gagnavinnslusamningur (Karp sem vinnsluaðili)**.

| Hluti | Breyting | Staða |
|---|---|---|
| Notkunarskilmálar | **Nýr liður 10 — „Aðgangur fyrirtækja og teymissæti"** (texti að neðan). Liðir 10–12 færðust í 11–13. | Live 26.07.2026 |
| Gagnavinnslusamningur (DPA) | **Nýr þriðji hluti** með 14 liðum — Karp sem vinnsluaðili skv. 28. gr. Birtur með áberandi **„⚠ DRÖG — bíður yfirferðar lögfræðings"**-borða; tekur ekki gildi fyrr en staðfestur. Sami texti og í skjali 01. | Live sem DRÖG 26.07.2026 |
| Persónuverndarstefna | Óbreytt í þessari lotu (nær yfir opinbera auðgunarlagið / Karp sem ábyrgðaraðila). Vinnsluaðila-hlutverkið er nú útskýrt í DPA-hlutanum + skilmálalið 10. | — |

> **Athugasemd til yfirferðar:** vinnsluaðila-hlutverkið (Karp vinnur viðskiptavina-lista stofu) er nú endurspeglað á síðunni í gegnum (a) DPA-hlutann og (b) skilmálalið 10. Til álita er hvort bæta eigi stuttri málsgrein í **persónuverndarstefnuna sjálfa** (t.d. nýjum lið undir „Vinnsluaðilar og miðlun") sem vísar á DPA — það var haldið í lágmarki að þessu sinni. Ábending óskast.

---

## Nýr liður 10 í Notkunarskilmálum — „Aðgangur fyrirtækja og teymissæti" (birtur texti)

> Fyrirtækjaáskrift getur náð til fleiri en eins notanda (teymissæti). **Reikningseigandinn** stjórnar teyminu: hann býður notendum aðgang og getur fjarlægt þá, upp að sætafjölda áskriftarinnar. Boðinn notandi þarf að **samþykkja boðið** áður en hann tengist reikningnum. Teymismeðlimir **erfa þrep og réttindi** eigandans (áskriftarþrep, skýrsluheimildir og mánaðarkvóta) og **deila reikningsgögnum** hans — meðal annars áreiðanleikavöktunar-lista og atvikaskrá, fylgdum félögum og kennitöluvöktunum. Persónulegar stillingar (tilkynningar og atkvæði í könnunum) haldast bundnar hverjum notanda. Eigandinn ber ábyrgð á þeim sem hann bætir í teymið, á aðgangi þeirra og notkun, og á að þeir séu til þess bærir og bundnir trúnaði — sérstaklega þegar teymið vinnur með viðskiptavina-gögn samkvæmt gagnavinnslusamningnum hér að neðan. Karp lítur á aðgerðir teymismeðlims sem aðgerðir á ábyrgð reikningseigandans; eigandinn getur hvenær sem er fjarlægt meðlim, sem lýkur aðgangi hans.

**Rök/áhersla:** endurspeglar (i) að **eigandi ber ábyrgð á hverjum hann bætir í team**, (ii) að **meðlimir deila gögnum + réttindum** eigandans, og (iii) hið nýja **samþykkisþrep (invite/accept)** — meðlimur er ekki lengur sjálfkrafa tengdur án samþykkis (sbr. útfærslu í kóða, commit `6f1f766` o.fl.).

---

## Gagnavinnslusamningur á síðunni — draga-borði (birtur texti)

> **⚠ DRÖG — bíður yfirferðar lögfræðings.** Þessi gagnavinnslusamningur (DPA) er í drögum og hefur **ekki tekið gildi**. Hann á við þegar áskrifandi að compliance-vörum Karp (Áreiðanleikavaktin, Firma-account) vinnur persónuupplýsingar um eigin viðskiptavini — þá er áskrifandinn ábyrgðaraðili og Karp vinnsluaðili skv. 28. gr. GDPR. Endanleg útgáfa verður staðfest af Steinsson Greykdal ehf. og gerð hluti af Fyrirtæki+ skilmálum. Fyrirspurnir: personuvernd@karp.is.

Efnisákvæði samningsins (14 liðir) eru í skjali `01-DPA-vinnslusamningur-Fyrirtaeki-plus.md`.
