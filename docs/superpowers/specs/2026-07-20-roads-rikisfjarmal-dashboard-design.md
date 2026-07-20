# Hönnun: ROADS — Ríkisfjármál (module 4) + Stjórnborðs-yfirhaling

Dags: 2026-07-20 · Byggir á: ROADS v0 + module 2 (Húsnæði) + module 3 (Lýðfræði), öll LIVE á /hermir/

## Markmið

Tvennt í einni lotu: (A) fjórða módúlið — **ríkisfjármál** (skattar/útgjöld → afkoma/skuldir),
áfram hrein gögn; (B) **stjórnborðs-yfirhaling** á `/hermir/` — færa herminn í Karp+ nav, fela
fréttir hægra megin fyrir meira pláss, og endurraða í þéttan „tölvuleikja"-stjórnborð með ríkum
gröfum, mæli-vísum og tooltips sem útskýra allt.

## Part A — Ríkisfjármál (module 4): módel = gögn, 0 vélar-breyting

**Nýjar vogarstangir** (`build_roads.mjs` levers): `skattar` (skattbreyting, % frávik;
`{base:0,min:-15,max:15,step:1,unit:'%',label:'Skattbreyting (frávik)'}`), `utgjold`
(útgjaldabreyting, % frávik; `{base:0,min:-15,max:15,step:1,unit:'%',label:'Útgjöld ríkis (frávik)'}`).

**Nýjar útkomur** (aftast → 10., 11. kort): `afkoma` (ríkisafkoma, % VLF; BAU glide(-0.65,-0.5)
úr `langtima.afkoma`; `clamp:[-8,6]`), `skuldir` (skuldir, % VLF; BAU glide(38.8,37) úr
`langtima.skuldir`; `clamp:[10,120]`).

**Ný tengsl (8, öll `source`+`ci`, lag≥1):**

| id | frá → til | coef | lag | unit | ci | heimild |
|---|---|---|---|---|---|---|
| tax_bal | skattar → afkoma | 0.08 | 1 | %VLF/% | [0.04,0.12] | Skattbreyting → tekjur ríkissjóðs |
| exp_bal | utgjold → afkoma | -0.08 | 1 | %VLF/% | [-0.12,-0.04] | Útgjöld → gjöld ríkissjóðs |
| gdp_bal | hagvoxtur → afkoma | 0.30 | 1 | %VLF/pp | [0.15,0.45] | Sjálfvirkir jöfnarar (hærri VLF → meiri tekjur) |
| unem_bal | atvinnuleysi → afkoma | -0.20 | 1 | %VLF/pp | [-0.35,-0.08] | Atvinnuleysi → bætur + minni tekjur |
| debt_carry | skuldir → skuldir | 1.0 | 1 | — | [1.0,1.0] | **Skulda-uppsöfnun (fyrri staða flyst áfram) — STOFN gegnum sjálf-lykkju** |
| bal_debt | afkoma → skuldir | -0.25 | 1 | %VLF/%VLF | [-0.35,-0.15] | Halli eykur skuldir (~afkoma/4 per ársfj.) |
| tax_gdp | skattar → hagvoxtur | -0.05 | 2 | pp/% | [-0.10,-0.01] | Skatta-drag á eftirspurn |
| exp_gdp | utgjold → hagvoxtur | 0.05 | 1 | pp/% | [0.01,0.10] | Fjármála-margfaldari |

`skuldir→skuldir` (lag 1, sjálf-lykkja) módelar uppsöfnun: sjálfbær halli → línulega vaxandi
skuldir yfir sjóndeildarhringinn. lag 1 → ekki lag-0 hringrás → `verify_roads_model.mjs` óbreytt.

**+3 sviðsmyndir:** „Skattalækkun (−10%)" `{skattar:-10}` · „Aðhald (útgjöld −10%)" `{utgjold:-10}` ·
„Innspýting (útgjöld +10%)" `{utgjold:10}`. → **11 útkomur, ~39 tengsl, 14 sviðsmyndir.**

`backtest_roads.mjs`: +ríkisfjármál-áttir (skattalækkun→afkoma↓; aðhald→afkoma↑; sjálfbær halli→
skuldir↑ vaxandi; bönd gild).

## Part B — Stjórnborðs-yfirhaling (UI-breyting, vélin ósnert)

### Layout.astro
1. **Nav:** færa `{ href:'/hermir/', label:'Hagkerfis-hermir' }` úr `Efnahagur`-hópi → `Karp+`-hópi
   (t.d. á eftir „Mitt svæði"). Endurmerkja „ROADS hermir".
2. **Nýtt prop `wide=false`** í `Astro.props`. `<div class="shell">` → `class={\`shell${wide?' shell-wide':''}\`}`.
3. **CSS:** `.shell-wide { grid-template-columns: 212px minmax(0,1fr); } .shell-wide .news { display:none; }`.
   (`.shell` er ekki `transition:persist` → wide-klasinn víxlast rétt per-síðu; news-elementið persist-ar
   en er falið á wide-síðum. Staðfesta: opna /hermir/ (engar fréttir) → fara á aðra síðu (fréttir aftur).)

### hermir.astro (endurhönnun — vélin `engine.mjs` ósnert)
`wide={true}`. Ný uppröðun (`data-pg="roads"` heldur; stílar `is:global`):
- **Efst (`.dash-top`):** titill + fyrirvari inline · **scorecard-röð** (`#score`) = þéttir reitir fyrir
  ~5 lykil-útkomur (verðbólga, hagvöxtur, atvinnuleysi, húsnæði, afkoma): stór lokagildi + delta-ör/litur ·
  sviðsmynda-chips (`#scn`) · frétta-setning (`#news`).
- **2-dálka `.dash-body`** (`grid-template-columns: 240px minmax(0,1fr)`):
  - *Vinstra `.controls`:* sleðar hópaðir „Ákvarðanir" (levers) / „Sjokk" (shocks), þéttir + ↺-hnappur.
  - *Hægra `.charts`:* útkomu-net `repeat(auto-fill,minmax(240px,1fr))` (3–4 dálkar á breiðri síðu) af
    **ríkum kortum:** stærra Canvas ferla-graf + óvissu-band + BAU-lína + **upphaf/enda-gildi merkt á
    grafið** + áberandi delta-merki (litur eftir átt) + **lítill láréttur mælir** (staða lokagildis innan
    `clamp`-bils, litaður eftir delta).
- **Tooltips á allt sem útskýra allt** (`title`-attribút; nota `.tip`/`data-tip` þar sem við á):
  - Hver **sleði**: hvað vogarstöngin/sjokkið gerir.
  - Hvert **kort**: hvað útkoman mælir + hvernig lesa (mið-lína/band/BAU) + **drif-keðjur** (leitt út úr
    `LINKS` — `from`-heiti þeirra tengsla sem `to==útkoma`).
  - Scorecard-reitir + óvissu-bandið + BAU-lína.
- Neðst: gagnsæis-tafla (`details.transp`) óbreytt (öll breidd).
- Áfram gagna-drifið: `Object.keys(BASELINE.outcomes)` → kort/scorecard; `BASELINE.levers/shocks` → sleðar;
  `SCENARIOS` → chips. 11 útkomur birtast sjálfkrafa.

## Það sem breytist

- **Modify `skriptur/build_roads.mjs`** — 2 levers, 2 outcomes, 8 tengsl, 3 sviðsmyndir + regen.
- **Modify `skriptur/backtest_roads.mjs`** — ríkisfjármál-áttir.
- **Modify `web/src/layouts/Layout.astro`** — nav-færsla + `wide`-prop + `.shell-wide` CSS.
- **Modify `web/src/pages/hermir.astro`** — dashboard-uppröðun + rík kort + mælir + scorecard + tooltips.
- **Óbreytt:** `src/lib/roads/engine.mjs`, `skriptur/verify_roads_model.mjs`.

## Prófun

- `build_roads` → 11 útkomur, ~39 tengsl, 14 sviðsmyndir. `verify` heilbrigt. `backtest` allar áttir
  (peninga/húsnæði/lýðfræði/ríkisfjármál) + bönd. `engine.test` 11/11.
- `astro build` + headless: `/hermir/` = **11 kort í stjórnborðs-uppröðun** (stýringar vinstra, net hægra),
  scorecard efst, **fréttir hægra megin faldar**, mælir per kort, tooltips til staðar; réttar áttir
  (skattalækkun→afkoma↓, aðhald→afkoma↑, sjálfbær halli→skuldir↑ vaxandi). Nav: hermir undir Karp+.
  Fara af /hermir/ á aðra síðu → fréttir birtast aftur.

## Áhætta / heiðarleiki

- **Skuldir-stofn** stílfærður (sjálf-lykkja coef 1,0) — sýnir uppsöfnun, ekki nákvæm skuldaáætlun.
- **wide/news-persist víxlverkun** — staðfesta báðar áttir í headless.
- Dashboard-þéttleiki á farsíma: `.dash-body` fellur í 1 dálk undir ~720px (sleðar ofan, net neðan).
- Sömu almennu fyrirvarar (Lucas, kvörðunar-óvissa, „ekki opinber spá").

## Framtíð (utan lotu)

Auðlinda-módúl; langtíma-hamur; deila/vista sviðsmynd (URL-state); útflutningur sviðsmyndar í frétt/mynd.
