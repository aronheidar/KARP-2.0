# RÁS-Leikurinn — Gæða-lotur (lærdóms-lykkja + taktur + endir) — Hönnun

**Dags:** 2026-07-27
**Umfang:** 6 leik-fítusar (Fasi 1–3) + 1 hermis-búnt (Fasi 4). Markmið: dýpka *lærdóms-lykkjuna*
og takt/endi leiksins — gæði umfram fjölda fítusa. Enginn nýr sleði/KPI/flipi.

**Arkitektúr-regla:** Allt nema umferðar-klukkan er **client + hreinar modúlur** — gögnin eru þegar í
`/state`. Lykil-staðreynd: `out.draft` (læstir sleðar liðs) er sent í `decide`/`resolved`/`ended`
(server.mjs L112–124) → debrief/recap eru reload-örugg án server-breytingar. Aðeins klukkan (#3)
snertir server, og þá án nýrrar D1-töflu (geymt í `config`-JSON).

Prófa-mynstur óbreytt: `<x>.test.mjs`, `node src/lib/leikur/<x>.test.mjs`. Svítan græn fyrir hvern push.

---

## Fasi 1 — Lærdóms-lykkjan

### #1 „Af hverju?"-debrief — ný modúla `debrief.mjs`
`explainRound({ changes, perKpi, kpisNow, kpisPrev, mandate, links, baseline }) → { lines: string[] }`
(2–4 mannamáls-setningar). Reglu-drifið, engin API-köll.
- **changes**: `changedLevers(finalLevers, baseline)` þar sem `finalLevers = st.draft || S.dials || {}`
  (reload-öruggt: `st.draft` heldur læstum sleðum í `resolved`). Stærsta hreyfing = „aðal-aðgerð".
- **Setning 1** — aðgerð: „Stærsta aðgerð ykkar: <label> í <raun-gildi>." (`disp()`), 1–2 til viðbótar ef stórar.
- **Setning 2** — útkoma: sterkasti/veikasti KPI úr `perKpi` (score): „Sterkast: Verðbólga (92/100). Veikast: Atvinnuleysi (41/100)."
- **Setning 3** — fórn: ef aðal-sleðinn hefur `leverEffects` sem toga tvö mandate-KPI í öfuga átt → nefna fórnina.
- **Setning 4 (valfrjáls)** — Δ ef `kpisPrev` til: „Verðbólga fór úr X í Y." `kpisPrev` = best-effort úr
  `S.debriefPrevKpis` (cache milli umferða; null ef notandi missti af fyrri umferð → sleppt).
- **Birting**: efst í `renderTeamResults` (nýr kassi „🧭 Hvað gerðist — og af hverju"), á undan skorkorti.

### #2 Sýnileg fórnarskipti (live) — ný modúla `tradeoffs.mjs`
`detectConflicts(kpiVals, mandate) → { key1, key2, msg }[]` — reglu-drifið á 4 canonical spennum:
- Phillips: verðbólga > target+band **og** atvinnuleysi ≥ max−band → „Að kæla verðbólgu ýtir atvinnuleysi upp."
- Örvun/verðbólga: hagvöxtur > min+band **og** verðbólga > target+band → „Meiri örvun eykur verðbólgu."
- Skuldir/vöxtur: skuldir > max **og** hagvöxtur < min → „Aðhald lækkar skuldir en kælir vöxt."
- **Birting**: gult `⚠`-borði efst í `drawStudioPreview` (Þjóðarhagur-kassa), uppfærist live því
  `kpiVals` eru þegar reiknuð þar. Engin auka-hermun.

## Fasi 2 — Taktur

### #3 Umferðar-klukka — *eina server-snertingin* (engin ný D1-tafla)
Leikstjóri velur valfrjálst `timerSec` (mín → sek) við `create` (lending + ritill). Sjálfgefið AF.
- **game-config**: engin breyting (runtime-val).
- **server `gameCfg`**: skila `timerSec` (>0 ? :null) + `deadline` (config.deadline||null).
- **server create**: geyma `config.timerSec` ef gilt (30–3600 s).
- **server control `start`+`next`**: ef `cfg.timerSec` → `cobj.deadline = now()+timerSec*1000`, skrifa
  `config` (spread núverandi → varðveitir roleMap) + phase + round. `start` sameinað (parse cobj alltaf).
- **server `/state`**: `if (phase==='decide' && cfg.deadline) out.secondsLeft = max(0, round((deadline-now())/1000))`.
- **client**: `timerBadge()` í studio term-head + classic (nálægt læsa-hnappi). `S.timerInt` (1s) tikkar
  staðbundið úr `S.timerDeadline = Date.now()+secondsLeft*1000` (sett við hvern `refresh`). Við 0 →
  „⏰ Tími útrunninn" (rautt), **engin auto-læsing** (val notanda: bara sjónræn ýting). Leikstjóri ræður.

### #4 Mýkri byrjun — `CORE_LEVERS` í config + client
`CORE_LEVERS = ['vextir','skattar','tilfaerslur','menntun']`. Í `renderStudio` **umferð 1**: ⭐-merki á
þessa sleða hvar sem þeir birtast + intro-borði („Þú stýrir Íslandi frá 2000. Byrjaðu á þessum fjórum:
Stýrivextir, Skattar, Tilfærslur, Menntun."). Aðeins umferð 1. Client + config.

## Fasi 3 — Kennarinn & endirinn

### #5 Leikslok-samantekt — ný modúla `recap.mjs`
`buildRecap({ perRoundScores, leversByRound, realityPerTerm, mandate, scenario }) → { bestTerm, worstTerm, vsReality, defining, lines }`.
Client-gögn við `ended`: `st.trajectory` (uppsafnað per umferð → per-umferð stig = Δ), `st.history`+`st.draft`
(studio sleðar allar 8 umferðir: `full = [...history, {levers: draft}]`), `REALITY`+`mandate`
(raun-composite per kjörtímabil), `scenario` (atburða-titlar).
- **bestTerm/worstTerm**: hæsta/lægsta per-umferð stig + atburða-titill.
- **vsReality**: hvar barstu af/undir raun-composite (fjöldi kjörtímabila + stærsta frávik).
- **defining**: (studio) sleði með stærsta uppsafnaða frávik yfir leikinn.
- **Birting**: nýr kassi „📜 Yfirlit kjörtímabilanna 2000–2032" í `ended`-sýn liðs, undir titli.

### #6 Kennslu-vísbendingar (leikstjóri) — útvíkka `analytics.mjs`
`teachingPrompts(analytics, { scenarioEvents }) → string[]` (3–5 umræðu-spurningar úr scorecard/
decisionsTable/trajectories-mynstrum): mesta dreifing milli liða, sameiginlegur veikleiki per umferð
(t.d. verðbólga í umferð 3 = hrun), útlagi-lið. Kallað client-megin í `renderFacAnalytics` (fac fær þegar
`an`); `SCENARIO` flutt inn f. umferða-titla (fallback „umferð N" f. sérsniðið). Engin server-breyting.

## Fasi 4 — Hermis-búnt (aðskilið, /hermir/) — SÍÐAST
Out-of-sample backtest-skorkort (heiðarlegt spágildi) + „af hverju?" magn-niðurbrot á hermi-útkomum.
Snertir `hermir.astro` + backtest-tól. Sér-fasi eftir að leik-fítusar landa.

---

## Skrár
- **Nýjar**: `debrief.mjs`+`.test`, `tradeoffs.mjs`+`.test`, `recap.mjs`+`.test`.
- **Útvíkkað**: `analytics.mjs` (+`teachingPrompts`), `game-config.mjs` (`CORE_LEVERS`), `flavor.mjs`
  (endurnýtt `leverEffects`), `client.mjs` (render-tenging allt), `server.mjs` (klukka), `index.astro` (CSS + timer/intro/debrief/recap-borðar).

## Byggingar-röð
Fasi 1 → deploy+verify → Fasi 2 → deploy+verify → Fasi 3 → deploy+verify → Fasi 4. Aldrei einn risa-commit.
