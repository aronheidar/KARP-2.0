# RÁS-Leikurinn — Liðs-samvinna & sleða-fix — Hönnun

**Dagsetning:** 2026-07-27
**Staða:** Samþykkt → áætlun → inline-smíði

## Vandamál (úr notkun)

1. Þátttakandi sér ekki alltaf í hvaða liði hann er.
2. Félagar í sama liði sjá ekki live þegar annar hreyfir sleða.
3. **Sleðar færast oft ekki** þegar smellt/dregið.
4. Sleðar sýna „X% frávik" — vantar raun-tölur.
5. Sömu breytingar virðast birtast milli liða.

## Greining

- **#3:** `poll` (2,5s) → `refresh()` → `render()` → `renderStudio()` = `root.innerHTML` FULL endurbygging. Poll mið-drátt eyðileggur sleða-DOM → dráttur tapast. **Kjarna-villa.**
- **#5:** Afleiðing af #3 (öll lið föst á 2000-sjálfgildum → eins útkoma). Ákvarðanir eru per (leikur, umferð, **team_id**) → einangrað; tryggt með prófi.
- **#4:** baseline hefur `realBase/realMode/realUnit/realDec` (19/32). Hermir `disp()` = `mult`: `realBase×(1+v/100)+realUnit`; annars `realBase+v`+unit.

## Lausnir

### W1 · Lið alltaf sýnilegt (#1)
`teamBanner(st)` = „🏛️ Þitt lið: ⟨nafn⟩" (úr `st.teams.find(id===you.teamId).name`) efst í öllum lið-sýnum (lobby/decide/results/ended).

### W2 · Raun-tölur á sleðum (#4)
Flytja `decOf(cfg)` + `disp(cfg, v, d)` í client. Sleða-gildi + „grunnur"-merki + læst-samantekt (`renderLocked`) nota `disp` (t.d. „Veiðigjald 17,3 ma.kr."). Engin vélar-breyting (sleða-gildi = áfram frávik).

### W3 · Sleða-fix + live liðs-samstilling + einangrun (#3+#2+#5)
**Server (lítið):** `/state` (studio, lið) skilar `draft` = núverandi-umferðar sleða-drög liðsins (`byR[current_round].levers`). `/decisions` með `locked:false` = drög (þegar stutt — engin breyting nema staðfesta).

**Client (kjarna-endurskipulag):**
- **Byggja EINU SINNI per umferð:** `S.studioBuiltSig = 'studio|'+round`. `renderTeam` studio-grein: ef sig óbreytt + `#lk-st-sliders` til → `updateStudio(st)` (á-staðnum); annars `renderStudio(st)` (full bygging) + set sig. Umferðaskipti/aflæsing núlla sig.
- **`updateStudio(st)`:** samstillir fjar-drög (`st.draft`) inn í sleða sem eru EKKI `S.dragging` og EKKI í `S.localTouched` (þinar eigin breytingar → engin snap-back) → uppfærir `input.value`+label á staðnum; `drawStudioPreview` endurteiknar. ENGIN sleða-endurbygging.
- **Sleða-input:** `S.dials[k]=v`, `S.dragging=k`, `S.localTouched.add(k)`, label (`disp`), redraw (debounce 60ms), `pushDraft` (debounce 500ms → `/decisions locked:false {levers:S.dials}`). `change`/`pointerup` → `S.dragging=null`.
- **Fyrsta bygging seedar `st.draft`** inn í `S.dials` (síð-innkominn félagi sér núverandi drög).
- **Einangrun:** drög per team_id → `/state` skilar aðeins EIGIN drögum → engin milli-liða leki.

**⚠ near-live:** ≤~3s töf (poll 2,5s + push 0,5s). Same-lever samtíma-breyting = last-write-wins (þín eigin helst staðbundið).

## Skrár
- **Modify:** `client.mjs` (banner, disp, updateStudio/renderStudio-skil, pushDraft, dragging), `server.mjs` (`/state` draft), `server.test.mjs` (draft+einangrun), `web/src/pages/leikur/index.astro` (CSS banner).
- **ÓSNERT:** `engine/resolve/scoring/chain/roles/studio/flavor/game-config/analytics/game-validate`.

## Prófun
- `server.test.mjs`: lið A ýtir draft → A `/state.draft` sýnir það; lið B `/state.draft` sýnir það EKKI (einangrun); draft locked:false → `you.locked` false.
- Prod-E2E: (a) liðs-borði; (b) sleða-gildi „17,3 ma.kr."; (c) draga sleða meðan poll gengur → helst (ekki clobber); (d) tveir gluggar sama liðs → B sér A's sleða-breytingu near-live; (e) annað lið sér EKKI; 0 console-villur.
