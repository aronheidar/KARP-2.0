# RÁS-Leikurinn S3 — orsaka-keðju debrief — hönnunarskjal

**Dagsetning:** 2026-07-26
**Höfundur:** Claude (brainstorming með Aroni)
**Staða:** Samþykkt hönnun, bíður útfærslu (inline — undirumboðsmenn blokkaðir)
**Umfang:** Sub-project **S3** af RÁS-Leiknum. Byggir ofan á S1 (LIVE). S2/S4/S5/S6 áfram á vegvísi.

## Markmið

Eftir hverja umferð sér hvert lið **sjónræna orsaka-keðju** — lítið lagskipt net frá SÍNUM ákvörðunum þessarar umferðar, gegnum milli-hagvísa, að fjórum markmiðs-KPI. Grænir leggir = eykur, rauðir = dregur úr, þykkt eftir styrk. Kennslu-markmið: „hvernig rötuðu ákvarðanir okkar að markmiðunum?" — beint framhald af skorkortinu.

## Ákvörðun úr brainstorm

Debrief-form = **orsaka-keðju mynd (mini chainmap)** — ekki texta-attribution né „ákvörðun→áhrif kassi". Sjónrænt net eins og keðjukort hermisins, lýst upp fyrir leið liðsins.

## Arkitektúr (sami og S1: þjóns-vald, þunn client)

1. **`src/lib/leikur/chain.mjs` (nýtt, hreint):** grafa-útdráttur á `links` — engin vél, engin env/D1.
   - `activeInputsFromInputs({levers,shocks,quarters}, baseline)` → `[{key,kind:'lever'|'shock',dev}]`: inntök með ekki-núll frávik við lokafjórðung (úr `buildInputs`-niðurstöðu S1).
   - `buildChain({baseline, links, activeInputs, kpiKeys, maxHops=3, maxEdges=14})` → `{nodes:[{key,label,kind:'input'|'mid'|'kpi',depth}], edges:[{from,to,sign:1|-1,strength}]}`. Hlutnet = hnútar á leið frá virku inntaki að KPI (framvirkt-frá-inntaki ∩ afturvirkt-frá-KPI), klippt fyrir læsileika (efstu `maxEdges` eftir styrk, ≤`maxHops` hopp). KPI-in eru alltaf sýnd (akkeri). `depth` = BFS-fjarlægð frá inntökum (fyrir dálka-uppröðun).
2. **`server.mjs` (resolve, S1):** eftir `resolveTeam` per lið, reikna `activeInputs` (kalla `buildInputs` + `activeInputsFromInputs`) og `buildChain` → geyma `chain` inn í `results.detail` (sem er þegar sent í `/state`). Ekkert nýtt endapunkts- eða skema-verk (chain fer með `kpis` JSON).
3. **`client.mjs` (S1):** nýr `renderChain(chain)` teiknar SVG á niðurstöðu-skjá liðsins (`renderTeamResults`), undir skorkortinu. Grænir/rauðir leggir, lagskipt eftir `depth`, hnúta-litur eftir `kind`. Engin gögn/vél í client umfram `chain` frá þjóni.

## Endurnýting & stíll

Sömu valens-litir og hermir/keðjukort: grænt `#54d08a` (sign +1), rautt `#e78284` (sign −1); inntaks-hnútar bláir `#6ea8fe`, KPI gulir `#f6b13b`. Lagskipt-hugmynd eins og `buildChainMap` í `hermir.astro` EN nýr þéttur SVG-teiknari í client (þjónn gefur `{nodes,edges}`, client dregur). `frett-ras.mjs`/`render-ras-box.mjs`/`engine.mjs` ósnert.

## Gagnaflæði

`resolve` → per lið: `resolveTeam`→kpis, `buildInputs`+`activeInputsFromInputs`→virk inntök, `buildChain`→`{nodes,edges}` → `leikur_results.kpis` JSON `{kpis, perKpi, crisis, chain}` → `/state` `results[].detail.chain` → `renderChain` SVG.

## Villumeðferð

- Engin virk inntök (allt óbreytt) → `buildChain` skilar aðeins KPI-hnútum, engir leggir → client sýnir „Engin virk áhrif þessa umferð" (enginn tómur SVG).
- Klipping tryggir ≤`maxEdges` leggi (læsileiki) — `log`/nóta ef klippt (ekki þögult tap í kennslu-samhengi: sýna „+N tengsl til viðbótar" merki ef `maxEdges` náð).
- `chain` er valkvæði í `detail` — eldri leystar umferðir án `chain` → client sleppir myndinni mjúklega.

## Prófstefna

- **Einingapróf `chain.mjs`** (node, `ok()`-stíll, gegn raun-`links.json`+`baseline.json`):
  - `activeInputsFromInputs`: ekki-núll frávik greind rétt (kind lever/shock, formerki devs).
  - `buildChain`: virkt inntak (t.d. `vextir`) → hnútur með `kind:'input'`; a.m.k. eitt KPI náð; leggir formerktir rétt (`vextir→verdbolga` sign); ≤`maxEdges`; hnútur EKKI á input→KPI leið útilokaður; tómt `activeInputs` → aðeins KPI-hnútar; determinismi; `depth` inntaks=0, KPI>0.
- **`server.test.mjs` viðbót:** eftir resolve, `results[].detail.chain` er til með `nodes`+`edges` (a.m.k. eitt lið með virk inntök hefur ekki-tóma leggi).
- **Vafra-staðfesting (controller, prod eftir deploy):** spila umferð → niðurstöðu-skjár liðs sýnir SVG-keðju með grænum/rauðum leggjum frá ákvörðunum að KPI; engar console-villur.
- Vélar- og S1-próf óbreytt-græn (`chain.mjs` snertir ekki vél; `resolve.mjs` fær í mesta lagi additive `active`-svið ef þörf — annars ósnert).

## Umfang S3 (og utan)

**Inni:** liðs-eigin orsaka-keðja á niðurstöðu-skjá. `chain.mjs`+próf, `server.mjs` resolve-viðbót, `client.mjs` `renderChain`.
**Utan (vegvísir):** S2 leikstjóra-þver-liða greining; S4 sviðsmynda-ritill; S5 leynileg umboð; S6 áhorfenda-sýn.

## Global Constraints

- Worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`; deploy `git push origin b2b-topbar:main`.
- Vél (`engine.mjs`) + `frett-ras`/`render-ras-box` ósnert. `hermir.astro` ósnert.
- `chain.mjs` hreint (node+worker+vafri), engin env/crypto/D1/fetch/vél.
- Chain reiknað ÞJÓNS-MEGIN (í resolve); client teiknar aðeins.
- Valens-litir samræmdir hermi (`#54d08a`/`#e78284`/`#6ea8fe`/`#f6b13b`).
- Prófkeyrsla `node <skrá>`; JSON með readFileSync.
- Sannreyna í vafra (prod eftir deploy), ekki curl|grep á HTML.
- Commit-endir: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
