# Persónuvernd — pakki til yfirferðar lögfræðings
## Compliance-vörur Karp: Áreiðanleikavaktin (KYC-vöktun) og Firma-account

> **DRÖG — bíður yfirferðar persónuverndarlögfræðings.** Dagsett 26. júlí 2026. Öll skjöl í þessari möppu eru drög, samin innanhúss af Steinsson Greykdal ehf. Höfundur er ekki lögfræðingur; skjölin koma ekki í stað lögfræðiráðgjafar. Þessi mappa safnar öllu sem lögfræðingur þarf á einn stað.

| | |
|---|---|
| **Fyrirtæki** | Steinsson Greykdal ehf., kt. 490522-0500, Brunnstígur 2, 260 Reykjanesbæ (rekur Karp, karp.is) |
| **Tengiliður** | Aron Heiðar Steinsson — [personuvernd@karp.is](mailto:personuvernd@karp.is) |
| **Tilefni** | Tvær nýjar compliance-vörur breyta hlutverki Karp: Karp verður **vinnsluaðili** fyrir viðskiptavina-lista sem stofur leggja sjálfar inn, og fyrirtækjareikningar deila gögnum milli teymissæta |
| **Grunnskjal** | DPIA v1.0 (leið A), útg. 11.07.2026 — fylgir sem skjal 05 |

---

## 1. Samhengi í stuttu máli

Karp er upplýsingaveita um íslenskt atvinnulíf. Í **DPIA v1.0** (leið A, þegar deployað) er Karp **ábyrgðaraðili** að vinnslu **opinberra** fyrirtækjaskrárgagna á grundvelli lögmætra hagsmuna (6(1)(f)). Tvær nýjar vörur bæta við vinnslu sem það skjal náði ekki til:

1. **Áreiðanleikavaktin (KYC-vöktun).** Tilkynningarskyldar stofur (lögmenn, endurskoðendur/bókarar) leggja inn lista yfir **eigin viðskiptavini** (kt) til samfelldrar áreiðanleikavöktunar. → **Stofan er ábyrgðaraðili, Karp vinnsluaðili** (28. gr. GDPR) fyrir þann lista. Krefst gagnavinnslusamnings (DPA).
2. **Firma-account (teymissæti).** Greiðandi eigandi hefur teymismeðlimi sem **erfa þrep/réttindi** og **deila reikningsgögnum** (m.a. KYC-lista og atvikaskrá). Eigandinn ber ábyrgð á þeim sem hann bætir í teymið.

## 2. Meginspurningin fyrir lögfræðing

Hvort **vinnsluaðila-flokkunin (28. gr.)** stenst fyrir Vinnslu A/B, eða hvort auðgunar-/áhættumatslag Karp gerir Karp að **sam-ábyrgðaraðila (26. gr.)** fyrir tiltekin úttök. Þetta og önnur opin álitaefni (AML-varðveisla, 36. gr. fyrirfram samráð, DPO-skylda, þagnarskylda lögmanna, admin-aðgangur) eru rakin í **skjali 03**.

## 3. Skjöl í möppunni

| # | Skjal | Hvað |
|---|---|---|
| 00 | `00-YFIRLIT-fyrir-logfraeding.md` | Þetta yfirlit |
| 01 | `01-DPA-vinnslusamningur-Fyrirtaeki-plus.md` | **Gagnavinnslusamningur (DPA)** — sjálfstætt eintak (14 liðir, 28. gr.). Sama efni og birt er í drögum á karp.is/skilmalar/ |
| 02 | `02-DPIA-vidbot-areidanleikavaktin-og-account.md` | **DPIA-viðbót 1** — mat á nýju vinnslunni (hlutverkabreyting, R8–R14, mótvægi, GA-skilyrði) |
| 03 | `03-Logfraedispurningar-opin-alitaefni.md` | **Minnisblað — opin lögfræðileg álitaefni** (§1–§8, forgangsraðað; A-atriði forsenda GA) |
| 04 | `04-Skilmalar-uppfaersla-textadrog.md` | **Uppfærður skilmála-/persónuverndartexti** sem birtist á vefnum (teymissæta-liður + DPA-hluti) |
| 05 | `05-DPIA-grunnur-v1.0-utgefid.md` | **DPIA v1.0** (grunnskjalið) — til samhengis; viðbót 1 les með því |

## 4. Staða á vefnum (karp.is/skilmalar/)

Uppfært og deployað 26.07.2026:
- **Nýr liður í Notkunarskilmálum** um fyrirtækja-/teymissæti (eigandi ábyrgur; meðlimir deila gögnum + réttindum; samþykkisþrep).
- **DPA birtur sem þriðji hluti** síðunnar með áberandi **„⚠ DRÖG — bíður yfirferðar lögfræðings"**-borða. Hann **tekur ekki gildi** fyrr en staðfestur af lögfræðingi og gerður hluti Fyrirtæki+ skilmála.

## 5. Opin atriði sem bíða Arons (ekki lögfræðings)

- [ ] **Stofna netfangið `personuvernd@karp.is`** — vísað er í það í DPIA, DPA, skilmálum og persónuverndarstefnu, en pósthólfið er ekki enn til. **Forgangur: hár.**
- [ ] **Vinnsluskrá (30. gr.)** uppfærð með nýja vinnsluaðila-hlutverkinu (bæði sem ábyrgðar- og vinnsluaðili).
- [ ] **Undirvinnsluaðila-samningar (back-to-back):** staðfesta DPA við Cloudflare, Google (Gmail) og WordPress-hýsingu + EES-stöðu þeirra.
- [ ] **Persónuverndarfulltrúi (DPO):** meta formlega skipun (sjá skjal 03 §4).
- [ ] **Áður en varan fer í raun-notkun stofa (GA):** keyra fjar-D1 færslur `0008_kyc.sql` og `0010_account.sql`.

## 6. Athugasemd um samþykkisþrep teymissæta (invite/accept)

DPIA-viðbótin (skjal 02) og minnisblaðið (skjal 03) lýsa **R10** — „samþykkis-/heimildar-gati" þar sem teymismeðlimur var **sjálfkrafa tengdur** án boðs/samþykkis — sem atriði sem **eftir er** og forsendu GA. **Þetta er nú komið í kóða:** invite/accept-samþykkisþrepið hefur verið útfært (commits `6f1f766`, `22b92ed`, `1a1e95a`: auto-tenging fjarlægð, boð samþykkt/afþökkuð, staða birt í Mitt svæði). Skilmálatextinn (liður 10) endurspeglar þegar samþykkisþrepið. **Ábending:** uppfæra ætti R10 í skjölum 02/03 úr „eftir/fast-follow" í „innleitt — staðfesta virkni" við lögfræðiyfirferð. Þetta lækkar eftirstæða áhættu úr MIÐLUNGS í LÁG skv. mati viðbótarinnar.

## 7. Fyrirvari

Öll skjöl eru **drög til yfirferðar persónuverndarlögfræðings**. Steinsson Greykdal ehf. er hvorki fjárhagsupplýsingastofa né lánshæfismatsfyrirtæki (sbr. DPIA v1.0). Vörurnar fara ekki í raun-notkun stofa fyrr en skilyrði 5. kafla DPIA-viðbótarinnar (skjal 02) eru uppfyllt, þ.m.t. þessi lögfræðiyfirferð.
