# RÁS-Leikurinn — Tooltips, raunveruleiki & flavor — Áætlun

> Inline-keyrsla. Sjá spec f. smáatriði. 4 verk. ÓSNERT: server/engine/resolve/scoring/chain/roles/studio/game-validate.

### T1: `flavor.mjs` + game-config gögn + próf
- Create `src/lib/leikur/flavor.mjs`: `leverEffects(leverKey,baseline,links)`, `newsHeadlines(kpis)`, `popularity(kpis)`, `endTitle(avg)`.
- `game-config.mjs`: `YEAR2000_DIALS`, `REALITY` (4 KPI × 33 ár), ríkari `text` + `watch` á 8 atburði.
- `flavor.test.mjs` (leverEffects/newsHeadlines/popularity/endTitle). Verja game-config+analytics próf.

### T2: client tooltips + raun-lína + 2000-dials
- `client.mjs`: import flavor + REALITY/YEAR2000_DIALS. `initDials`→YEAR2000. `stChart` +`reality`-lína. `renderStudio` sleða/flipa/term `title`-tooltips + `leverEffects` + `watch`-borði. `drawStudioPreview` raun-lína á KPI-gröf + tooltips.
- `index.astro` CSS.

### T3: client flavor-UI
- Fylgis-mælir (`popularity`) í drawStudioPreview + results. Fréttafyrirsagnir + „Svona fór það" (round-KPI vs REALITY á loka-ári, `scoreRound`) + endurkjör í `renderTeamResults`. Leikslok titill+kort (`endTitle`, clipboard) í `renderTeam` ended.

### T4: bygging + prod E2E + deploy + minni
- Öll próf + astro build + dry-run + push. Prod-E2E (tooltips/raun-lína/2000-vextir/fylgi/fréttir/svona-fór/titill). Minni.
