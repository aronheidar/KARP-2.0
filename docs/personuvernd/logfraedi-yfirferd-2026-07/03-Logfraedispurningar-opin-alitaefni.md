# Minnisblað til persónuverndarlögfræðings — opin álitaefni
## Fylgiskjal með DPIA Viðbót 1 (Áreiðanleikavaktin + Firma-account)

| | |
|---|---|
| **Tengist** | `DPIA-vidbot-1-areidanleikavaktin-og-account.md` (Viðbót 1) og DPIA v1.0 |
| **Tilefni** | Atriði sem eru **lögfræðilegt mat** frekar en tæknileg staðreynd og voru vísvitandi skilin eftir opin í drögunum |
| **Frá** | Aron Heiðar Steinsson, f.h. Steinsson Greykdal ehf. — [personuvernd@karp.is](mailto:personuvernd@karp.is) |
| **Dagsetning** | 26. júlí 2026 |
| **Staða** | Drög. Ekki skal fara í raun-notkun stofa (GA) fyrr en A-atriði (blokkerandi) eru útkljáð. |

> **Hvernig lesa skal.** Hvert atriði hefur: **Samhengi** · **Spurning(ar)** · **Núverandi afstaða draganna** (og hvar í Viðbót 1) · **Hvað ræðst af svarinu** · **Forgangur**. A-atriði (§1–§3) eru forsenda GA; B-atriði (§4–§7) eru staðfestingar á afstöðu sem drögin taka nú þegar. §8 er tæknileg staðreynd sem ég **staðfesti í kóða** — ekki opin spurning, en hefur samningslega hlið.

---

## A. Blokkerandi álitaefni (forsenda GA)

### §1 — Vinnsluaðili vs. sameiginlegur ábyrgðaraðili (28. gr. vs. 26. gr.)

**Samhengi.** Fyrir viðskiptavina-listann sem stofan leggur inn (hvaða kt eru vöktuð, val á viðskiptavinum) starfar Karp augljóslega eftir fyrirmælum stofunnar → **vinnsluaðili**. En Karp **viðheldur sjálfstætt** auðgunar-/skimunarlaginu (UBO/PEP/refsilistar/Lögbirting) og ákveður **hvernig** skimað er: eigin reiknilíkan fyrir áhættustig (`kycDeriveRisk` → Lág/Venjuleg/Há), eigin val á heimildum, eigin merkja-rökfræði. Samkvæmt dómaframkvæmd ESB-dómstólsins (t.d. Fashion ID, C-40/17; Wirtschaftsakademie, C-210/16) getur aðili sem **ákveður tilgang og aðferðir tiltekinnar vinnsluaðgerðar** talist sameiginlegur ábyrgðaraðili, jafnvel án aðgangs að gögnunum sjálfum.

**Spurningar.**
1. Er Karp **hreinn vinnsluaðili** fyrir Vinnslu A, eða **sameiginlegur ábyrgðaraðili** (26. gr.) fyrir skimunar-/áhættumats-úttakið um einstaklinga?
2. Ef sameiginlegur: þarf **26. gr. fyrirkomulag** (gagnsæ skipting ábyrgðar + kjarni þess aðgengilegur skráðum, 26. gr. 2. mgr.) til viðbótar við — eða í stað — 28. gr. vinnslusamnings?
3. Aðskilin en tengd: telst sjálfvirkt áhættustig Karp (Lág/Venjuleg/Há) á nafngreindan einstakling **gerð persónusniðs** (4. gr. 4. tölul.), og — þar sem **stofan**, ekki Karp, tekur CDD-ákvörðunina — er 22. gr. (sjálfvirk ákvarðanataka) þar með **ekki** virk? Ég geri ráð fyrir að svo sé, en bið um staðfestingu.

**Núverandi afstaða draganna.** Aðallega vinnsluaðili fyrir A/B, með sjálfstæðu ábyrgðaraðila-hlutverki fyrir undirliggjandi opinbera grunninn (blendingur). Sjá 1.2 (spurningarammi) og 2.1.

**Hvað ræðst af svarinu.** Allur samningsstrúktúrinn: hreinn 28. gr. DPA vs. 26. gr. fyrirkomulag + breytt gagnsæis-/réttindaskipting. Snertir líka §5 og §6 hér að neðan.

**Forgangur: HÁR.**

---

### §2 — Nákvæm AML-varðveisla: grein, tímalengd og hver „á" hana (l. nr. 140/2018)

**Samhengi.** Ég skrifaði „5 ár" í samræmi við verklýsingu og vísaði almennt í lög nr. 140/2018, en **staðfesti ekki nákvæma grein né upphafspunkt**. AMLD-grunnlínan er 5 ár frá lokum viðskiptasambands (aðildarríki mega lengja í 10). Varðveisluskyldan er **stofunnar** (tilkynningarskylds aðila), ekki Karp — Karp geymir sem vinnsluaðili. Compliance-mappan er þar að auki **append-only** (heilleiki), sem gerir eyðingu einstakra færslna torvelda.

**Spurningar.**
1. Staðfestu **nákvæmt ákvæði og tímalengd** varðveislu í l. nr. 140/2018.
2. Rennur klukkan frá **lokum viðskiptasambands** eða frá hverri færslu/​skimun?
3. Þar sem Karp er vinnsluaðili: á DPA-inn að gera varðveislu/​eyðingu **alfarið að fyrirmælum stofunnar** (Karp geymir aðeins meðan fyrirmæli standa, eyðir að fyrirsögn stofu) frekar en að Karp hardkóði „5 ár"?
4. Eyðingarskylda **eftir** að varðveislutíma lýkur — hvernig samræmist hún append-only hönnuninni tæknilega (þarf sértækt eyðingar-/​grisjunarferli)?

**Núverandi afstaða draganna.** 2.5: „samræmd 5-ára skyldu … nákvæm grein/​tímalengd staðfestist af lögfræðingi"; eyðing/​skil við lok DPA með fyrirvara um varðveisluskyldu stofunnar. R14 í 3.–4. kafla.

**Hvað ræðst af svarinu.** Varðveislustilling í kóða + orðalag DPA + hvort append-only þarf grisjunar-undantekningu.

**Forgangur: MIÐLUNGS–HÁR.**

---

### §3 — Fyrirfram samráð skv. 36. gr. — kallar R9/R10 á það?

**Samhengi.** 36. gr. skyldar fyrirfram samráð við Persónuvernd þegar DPIA sýnir að vinnsla **hefði í för með sér háa áhættu án mótvægis**. Samfelld, kerfisbundin vöktun + áhættustigun nafngreindra einstaklinga (R9) fellur nálægt 35. gr. 3. mgr. c-lið (kerfisbundin vöktun í stórum stíl) og a-lið (kerfisbundið, víðtækt mat). R10 (samþykkis-gat) er metið **MIÐLUNGS** þar til invite/accept kemur.

**Spurning.** Í ljósi eftirstæðrar áhættu (LÁG–MIÐLUNGS, R10 = MIÐLUNGS þar til samþykkisþrep kemur): er fyrirfram samráð skv. 36. gr. **skylt**, eða nægir að (a) koma invite/accept-þrepinu í framkvæmd og (b) skjalfesta mótvægið, þannig að eftirstæð áhætta haldist undir 36. gr.-þröskuldi?

**Núverandi afstaða draganna.** 5. kafli: ekki talið skylt að óbreyttu, en áskilið ef yfirferð telur R9/R10 háa.

**Hvað ræðst af svarinu.** Hvort þarf að leggja málið fyrir Persónuvernd fyrir GA (getur tekið vikur og seinkar markaðssetningu). Svarið hangir að hluta á §1 (telst þetta prófílun/​kerfisbundin vöktun í skilningi 35. gr. 3. mgr.) og §4.

**Forgangur: HÁR (ef virkt, þá tímafrekt).**

---

## B. Staðfesta afstöðu draganna

### §4 — Er persónuverndarfulltrúi (DPO) nú **skyldur**? (37. gr. GDPR / 35. gr. l. 90/2018)

**Samhengi.** DPO er skyldur þegar kjarnastarfsemi felst í **reglulegri og kerfisbundinni vöktun skráðra í stórum stíl**. KYC-vöktunin (cron-endurskimun áhættumerkja einstaklinga þvert á söfn margra stofa) færir Karp nær því að slík vöktun sé kjarnastarfsemi. DPIA v1.0 sagði aðeins „metur formlega skipun".

**Spurning.** Færir viðbót samfelldrar KYC-vöktunar Karp yfir þröskuldinn þar sem DPO verður **skylt** (ekki aðeins ráðlagt)?

**Núverandi afstaða.** 5. kafli: „styrkir rök … endurmeta"; tengiliður persónuverndar tilnefndur. **Forgangur: MIÐLUNGS.**

---

### §5 — Réttur til andmæla/​eyðingar vs. AML-varðveisla — hvaða réttur á við hvern? (17. gr. 3. mgr. b, 21. gr.)

**Samhengi.** Ég fullyrti að eyðing/​andmæli séu takmörkuð þar sem vinnsla er nauðsynleg vegna lagaskyldu. En réttindin skiptast eftir lagagrundvelli, sem tengist §1: **21. gr. andmælaréttur á aðeins við 6(1)(e)/(f), EKKI 6(1)(c)**. Því:
- Vinnsla **stofunnar** (6(1)(c), AML) → 21. gr. andmæli **eiga ekki við**; 17. gr. eyðing takmörkuð skv. 17. gr. 3. mgr. b (lagaskylda).
- **Auðgunarlag Karp** (6(1)(f), sbr. v1.0) → 21. gr. andmæli **eiga við**.

Enn fremur er hinn skráði oft **eigandi/​stjórnarmaður viðskiptavinar**, ekki viðskiptavinurinn sjálfur.

**Spurning.** Er þessi skipting rétt, og hvernig á að afgreiða skráðan sem andmælir **auðgunarlaginu** en er inni í AML-möppu stofu (þar sem lagaskylda stofunnar heldur gögnunum)?

**Núverandi afstaða.** 2.6: beiðnir beint til stofu (ábyrgðaraðila); Karp aðstoðar; eyðing takmörkuð af lagaskyldu. **Forgangur: MIÐLUNGS.**

---

### §6 — Upplýsingaskylda (13./14. gr.) — hver upplýsir og heldur 14. gr. 5. mgr. b enn? 

**Samhengi.** Ég lagði 13./14. gr. skylduna á stofuna gagnvart hennar skráðu. En **14. gr. skylda Karp fyrir eigin auðgunarlag** (gögn ekki frá hinum skráða) stendur áfram; v1.0 studdist við opinbera persónuverndaryfirlýsingu + **14. gr. 5. mgr. b** (óhófleg fyrirhöfn). Nú eru gögnin sett saman í **varanlega, vaktaða áhættumöppu** um einstakling — meira íþyngjandi en stök uppfletting.

**Spurning.** Heldur 14. gr. 5. mgr. b-undanþágan þrátt fyrir aukna íþyngjandi vinnslu, og er skiptingin rétt (stofan upplýsir sína skráðu; Karp nær yfir auðgunarlagið í sinni yfirlýsingu)?

**Núverandi afstaða.** 2.7: ábyrgð stofunnar; Karp upplýsir um vinnsluaðila-hlutverk í skilmálum/​yfirlýsingu. **Forgangur: MIÐLUNGS.**

---

### §7 — Þagnarskylda lögmanna (lög nr. 77/1998) þegar ábyrgðaraðili er lögmaður

**Samhengi.** Fyrir lögmanns-viðskiptavini getur **auðkenni viðskiptavinar og tilvist sambandsins** fallið undir þagnarskyldu lögmanna — trúnaðarkerfi umfram GDPR. Karp sem vinnsluaðili heldur þá lista sem nýtur þagnarskyldu.

**Spurningar.**
1. Eru sérkröfur umfram venjulegan DPA þegar ábyrgðaraðilinn er lögmaður og gögnin njóta þagnarskyldu (t.d. sértækar trúnaðaryfirlýsingar, takmörkun/​skráning á aðgangi starfsmanna/​admins Karp)?
2. Þarf DPA-inn að taka sérstaklega á **aðgangi Karp-starfsmanna** að gögnum stofu (sjá §8)?

**Núverandi afstaða.** Nefnt í R8 („getur snert þagnarskyldu"); ekki fullútkljáð. **Forgangur: MIÐLUNGS–HÁR fyrir lögmanna-hluta markhópsins.**

---

## C. Staðfest í kóða (ekki opin spurning — með samningslegri hlið)

### §8 — Aðgangur Karp-„admin" að KYC-gögnum: engin þver-account glufa á forritslagi

**Staðfest (`web/worker.js`, `kycHandler`).** `_kycGate` hleypir `is_admin===1` **eða** `fyrirtaeki_plus` í gegnum **þrep-gátun**, og admin fær ótakmarkað vöktunar-þak. **En allar fyrirspurnir eru bundnar `const acct = accountId(u)`** — reikningi innskráðs notanda. `is_admin` **opnar EKKI** á lista annarra; admin sér aðeins eigin `owner_id`-raðir. `actor` í audit = `u.email` (raun-notandi) — staðfest. Meðlimur með `parent_account_id` deilir sama `acct` → les+skrif á sömu audit-röðum (= R10).

**Afleiðing / samningsleg hlið.** Þar sem ekkert **forritslags**-bakdyr er á milli account-a er eftirstæði aðgangs-áhættan sú **venjulega**: rekstraraðilar með beinan aðgang að D1-gagnagrunni (innviðalag) geta tæknilega lesið raðir. Það á að taka á í DPA + innri aðgangsstefnu (lágmarksaðgangur, skráning admin-aðgangs) — sérstaklega vegna §7 (þagnarskylda). **Ábending:** íhuga hvort takmarka eigi/​skrá beri admin-aðgang að KYC-töflum umfram það sem nú er.

---

## Samantekt forgangs
| # | Álitaefni | Forgangur | Blokkerar GA? |
|---|---|---|---|
| §1 | Vinnsluaðili vs. sam-ábyrgðaraðili | Hár | Já |
| §2 | Nákvæm AML-varðveisla | Miðlungs–Hár | Já (varðveislu-uppsetning) |
| §3 | Fyrirfram samráð 36. gr. | Hár | Mögulega |
| §4 | DPO skylt? | Miðlungs | Nei (en meta fyrir vöxt) |
| §5 | Réttindi vs. AML-varðveisla | Miðlungs | Nei (ferli) |
| §6 | Upplýsingaskylda 14.(5)(b) | Miðlungs | Nei (yfirlýsing) |
| §7 | Þagnarskylda lögmanna | Miðlungs–Hár | Fyrir lögmanna-hluta |
| §8 | Admin-aðgangur (staðfest) | — | Nei (DPA-ákvæði) |
