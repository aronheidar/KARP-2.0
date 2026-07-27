# RÁS-Leikurinn — S6 + 2000-gildi + flipar + unlock — Hönnun

**Dagsetning:** 2026-07-27
**Staða:** Samþykkt → áætlun → inline-smíði

## Verk

**Q — REALITY-lagfæring:** framtíðar-gildi (2025–2032) sett örlítið af markmiði (voru trivial 100 → nú ~90–97). Verðbólga 2027–32 ~3,0–3,8; skuldir ~44–46.

**A — allir sleðar á 2000-gildum:** útvíkka `YEAR2000_DIALS` í alla sleða sem voru öðruvísi 2000 (hitt helst á grunni = ~2000). Lyklar: vextir 11, veðhlutf. 65, DSTI 45, verðtrygging 40, skattar +1, fjármagnstekjuskattur −10 (10%), tryggingagjald −1, tilfærslur −2, veiðigjald −50 (ekki til), ívilnanir −5, menntun −5, innflytjendastefna −10 (fyrir EES 2006), fiskeldi −20, orka −15 (fyrir Kárahnjúka), orkuskipti −10, kolefnisgjald −50. ⚠ mult-sleðar (veiðigjald/kolefnisgjald) ná bara −50% (helmingur), ekki 0.

**B — flipar eftir hlutverki + áberandi:** `TAB_META` (game-config): group → {icon, label} (🏦 Peningastefna · 💰 Ríkisfjármál · 🏘️ Húsnæði · 👥 Vinnumarkaður · 🌱 Auðlindir & orka · 🧭 Byggð & ferðaþj.). Client-flipar stærri/áberandi með táknum. baseline.group ÓBREYTT → hermir óáhrifaður.

**C — sleðar opnast síðar:** `LEVER_UNLOCK` (game-config): lever → umferð (sjálfg. 1). Söguleg: innflytjendastefna/fjármagnstekjuskattur/veiðigjald 2, kolefnisgjald/atvinnuþátttaka 3, ferðamannagjald/orkuskipti/fiskeldi/skógrækt 4, DSTI/votlendi 5. Client felur sleða þar sem `unlock > round`; læstir sleðar halda dial-gildi (submittast áfram = 2000-stig); „🆕 Ný stjórntæki opnuðust: …"-borði þegar umferð opnar nýtt.

**D — laga klesstu keðju:** `renderChain` meira bil (NH 24→28, VG 12→18, COLW 178→205, NW 128→140); CSS `.lk-chain svg { max-width:none }` (lárétt skrun í stað þjöppunar).

**S6 — áhorfenda-sýn:** rík útsending á `/leikur/?g=CODE` (watch, engin tákn): stór kjörtímabils-haus + atburður, áberandi rað-stigatafla með stigaborðum, þróunar-línurit (uppsafnað per lið), umferðar-framvinda, afhjúpun í leikslok. Server: `out.trajectory` (úr `resultsRaw`, uppsafnað per lið per umferð). Leikstjóri: „📺 Áhorfenda-hlekk"-hnappur (afritar `/leikur/?g=CODE`).

## Skrár
- **Modify:** `game-config.mjs` (YEAR2000_DIALS/REALITY/TAB_META/LEVER_UNLOCK), `client.mjs` (flipar+unlock+chain+renderWatch+fac-watchlink), `server.mjs` (out.trajectory), `server.test.mjs`, `web/src/pages/leikur/index.astro` (CSS), `game-config.test.mjs` (ef þarf).
- **ÓSNERT:** engine/resolve/scoring/chain(.mjs kjarni)/roles/studio/flavor/game-validate.

## Prófun
- game-config próf standast; server-próf +trajectory.
- Prod-E2E: 2000-gildi á öllum sleðum; flipar með táknum+áberandi; læstir sleðar faldir í umferð 1 + „ný stjórntæki" síðar; keðja ekki klesst; áhorfenda-sýn (watch-hlekkur) sýnir stigatöflu+graf; reality ekki alltaf 100.
