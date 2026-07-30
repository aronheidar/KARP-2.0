# worker.js klofningur (C10) — áætlun, framkvæmd FRESTAÐ meðvitað

**Staða 30.7.2026:** ~4.750 línur (eftir dagur-1 hreinsun), ~70 handlers, 6 cron-föll, 163 top-level föll.

## Hvers vegna EKKI framkvæmt strax

**Samhliða-session hættan er raunveruleg og skjalfest:** margar Claude-lotur vinna samtímis í deildum
worktree-um með ÓSKULDBUNDNAR worker.js-breytingar (leikur/nemandi, stjórnborð o.fl. — sjá
karp-dev-verify vinnureglur um hunk-staging). Klofningur færir þúsundir lína milli skráa; rebase
samhliða lotu ofan á hann endar í stór-conflictum og gæti týnt vinnu þeirra. Klofninginn á að gera
í **SAMRÆMDRI, EINNI lotu þegar engin önnur session er með worker.js opinn** — helst strax eftir
að allar lotur hafa committað/pushað (t.d. að morgni fyrir aðra vinnu).

## Módúl-skurðurinn (mekanískur, engin logik-breyting)

Wrangler bundlar ES-import (worker flytur þegar inn úr `./src/lib/*`). Skera í þessari röð — hver
áfangi sjálfstætt deploy-hæfur, `node --check` + 246 próf + `wrangler deploy --dry-run` milli áfanga:

1. **`web/src/worker/greidslur.mjs`** (~800 l.): `pay*`, `askell*`, `stak*`, `sub2*`, `subCancelHandler`,
   Teya-hlutar. Skýrasta einingin, mest viðkvæm — fyrst svo hún fái mesta athygli.
2. **`web/src/worker/auth.mjs`** (~300 l.): `auth*Handler`, `readSession`, `karpUserId`, `accountOwner`,
   `_acctOfUid`, session-kökur.
3. **`web/src/worker/cron.mjs`** (~700 l.): `digestShared/digestBuild/digestRun`, `kycDiffCron`,
   `kycCriticalCron`, `eftirlitCriticalCron`, `logbirtingCriticalCron`, `frettavaktCron`, `newsIngest`.
4. **`web/src/worker/kt-veitur.mjs`** (~900 l.): kt-lykluðu uppflettingarnar (rsk/lei/leyfi/eftirlit/
   logbirting/vanskil/loftfor/kvoti/grein-rank/atvinnugrein/firma-timalina…).
5. **Afgangur í worker.js**: fetch-dispatch (route-taflan), scheduled-dispatch, sameiginleg hjálparföll
   (`sjson`/`_ajson`/`augGet`/`_dget`/`sendGmail`) — EÐA þau í `web/src/worker/felag.mjs` ef hringvísanir
   leyfa. Route-taflan VERÐUR áfram á einum stað (læsileiki > dreifing).

**Reglur:** flytja föll ÓBREYTT (mekanískt cut/paste + import/export), engar endurnefningar í sömu lotu;
deila EKKI ástandi um module-scope nema það var þegar deilt; einn commit per áfanga; deploy + live-tékk
(3-4 endapunktar per einingu) áður en næsti áfangi hefst.

**Sama gildir um `fyrirtaeki.astro`** (1.946 l., ein script-eyja) — næst á eftir worker: skera eyjuna í
`src/lib/fyrirtaeki/*.mjs` modúlur (fsKort/fsLanshaefi/fsWireSector o.s.frv.) sem eyjan flytur inn.
