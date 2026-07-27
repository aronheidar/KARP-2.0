# RÁS-Leikurinn — Liðs-samvinna & sleða-fix — Áætlun

> Inline. Sjá spec. 4 verk. ÓSNERT: engine/resolve/scoring/chain/roles/studio/flavor/game-config/analytics/game-validate.

### T1: Client — liðs-borði + raun-tölur (disp)
- `client.mjs`: `decOf(cfg)` + `disp(cfg,v,d)` (module). `teamBanner(st)`. Sleða-röð + `.lk-val` + `attachStudio`-oninput label + `renderLocked`-samantekt nota `disp`. Banner efst í renderTeam-sýnum. `index.astro` CSS.
- Run: `node --check client.mjs`; astro build.

### T2: Server — /state draft + próf
- `server.mjs`: í studio-team `/state`-grein, `out.draft = (byR[game.current_round] || {}).levers || {}`.
- `server.test.mjs`: lið A push draft (decisions locked:false {levers:{vextir:9}}) → A `/state.draft.vextir===9`; B `/state.draft` tómt (einangrun); `you.locked` false eftir draft.
- Run: `node server.test.mjs`.

### T3: Client — updateStudio + draft-push/sync + dragging
- `S` init: `dragging:null, localTouched:new Set(), studioBuiltSig:null, pushTimer:null`.
- `renderTeam` studio: sig-vörður → `updateStudio` vs `renderStudio`. Umferðaskipti/aflæsing → `studioBuiltSig=null, localTouched.clear()`.
- `renderStudio`: seed `st.draft` inn í `S.dials` eftir initDials.
- `attachStudio`: oninput setur dragging+localTouched+pushDraft; change/pointerup núlla dragging.
- `updateStudio(st)`: sync `st.draft` í non-dragging/non-localTouched sleða + `drawStudioPreview`.
- `pushDraft(st)`: debounce 500ms → `/decisions locked:false`.
- Run: `node --check client.mjs`.

### T4: Bygging + prod E2E + deploy + minni
- Öll próf + astro build + dry-run + push. Prod-E2E (banner, raun-tölur, draga-meðan-poll, 2 gluggar sync, einangrun). Minni.
