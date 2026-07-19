# Fréttavélin → gagnafréttamiðill — hönnun (Fasi 1)

**Dags:** 2026-07-19 · **Staða:** Fasi 1 smíðað+deployað. Fasi 2/3 eftir.

## Markmið (ósk Arons)
Gera Fréttavélina (`/frettavel/`) að alvöru fréttamiðli í anda MBL/Vísis: (1) sér-síða per frétt (SEO + tilvísun fréttamanna), (2) myndir endurnýttar eftir frétta-tegund, (3) fréttamiðils-forsíða, (4) enn fjölbreyttari fréttir.

## Áfangar
- **Fasi 1 (þessi):** sér-fréttasíður + flokka-myndir + SEO + smellanleg kort.
- **Fasi 2:** full MBL/Vísir-forsíða (hero, flokka-deildir, rist).
- **Fasi 3:** fleiri skynjarar + ritstjórnar-form (vikuyfirlit, topplistar, þema-greinar).

## Arkitektúr — Fasi 1 (SSG, engin ný innviða-flækja)
- **Varanlegt safn:** `build_frettavel.js` skrifar `gogn/frettavel_archive.json` (+web/public) — union af birtum fréttum + straumi + fyrra safni, dedup á id, **500 nýjustu**. Ber `facts`. Tryggir að permalink hverfi EKKI þótt frétt detti úr forsíðu-feed (8/tegund þak).
- **Sér-síða:** `web/src/pages/frettavel/[id].astro`, `getStaticPaths` yfir safnið → ein varanleg síða per frétt. Slóð ASCII-hreinsuð (`asciiId`).
- **Deild flokka-skilgreining:** `web/src/lib/frettavel.mjs` — `CAT` (per tegund: merki, litur, mynd-slug, heimild, „aðferð"-regla) + `asciiId`/`artHref`/`imgPath`/`spark`/`dIS`. Notað af BÁÐUM síðum (ein sannleiksuppspretta).
- **Myndir:** `web/public/frettavel/img/<slug>.jpg` (~20, handgerðar af Aroni skv. `img/README.md`-forskrift). 1200×630. Mjúkt fallback (halli+emoji) ef vantar. Notað: kort-smámynd, article-hero, OG-mynd.
- **Forsíða:** kort smellanleg → `/frettavel/<id>/` + smámynd; footer-frumgögn-hlekkur utan kort-hlekks (engin hreiðruð `<a>`).

## Sér-síðan inniheldur
Flokka-mynd (hero, fallback) · merki · tímastimpill · „Fréttavél Karp" höfundur · h1 + fullur texti · stækkað smágraf (ef spark) · **„🔍 Aðferð Karp"** (reglan úr `CAT`) · **frumgögn-hlekkur** · **„📌 Vitna í þessa frétt"** (tilvísunar-snið) · tengdar fréttir (sami flokkur) · **`NewsArticle` + `Dataset` JSON-LD** + canonical + OG/Twitter (flokka-mynd) → í sitemap sjálfkrafa. Þema-meðvitað (ljóst/dökkt).

## Deploy-athugasemd
Kóði + `frettavel.json` + `frettavel_archive.json` committað (svo article-síður séu til strax; sniðmátstexti staðbundið). `seen`/`state` EKKI committað → CI (06 UTC) endur-greinir m/AI-lykli (upplyftir í AI-texta) + þögul frumstilling nýrra state-reita. Myndir bætast við þegar Aron leggur þær inn.

## Eftir (Fasi 2/3)
Full forsíðu-hönnun (hero/deildir/rist) · nýir öruggir skynjarar (uppboð lögaðila, atvinnuhúsnæðis-viðskipti, EES m/þýðingu, sjávarútvegur, gengi) · ritstjórnar-form.
