# Hagvísir Íslands — verkefnamappa

Mælaborð fyrir karp.is. Möppuskipan (tiltekið 2026-06-25):

```
hagvisir/
├── dashboard.html        ← AÐAL-uppspretta mælaborðsins (þetta er skráin sem er breytt)
├── build_embed.js        ← byggir embed-ið; les gogn/, skrifar wordpress/
├── logo_*.png            ← lógó (bökuð inn í embed-ið)
├── package*.json, node_modules/   ← npm (terser, xlsx)
│
├── wordpress/   → skrárnar sem þú uppfærir í WordPress  (sjá wordpress/LESTU-MIG.md)
├── gogn/        → unnin JSON-gögn (29) sem bakast í karp-data.txt
├── heimildir/   → hrá gögn frá ráðuneytum o.fl. (PDF / Excel / CSV)
└── skriptur/    → byggingar-skriptur sem búa til JSON úr heimildunum
```

## Að byggja (algengast)
Úr `hagvisir/` möppunni, í **PowerShell**:
```powershell
node build_embed.js
```
→ skrifar `wordpress/karp-embed.html` + `wordpress/karp-data.txt` (með production-slóð á gögnin).
Síðan: líma `karp-embed.html` í WPCode-snippet 2867 (sjá wordpress/LESTU-MIG.md).

## Forskoðun á eigin vél (dev)
```powershell
$env:KARP_DATA_URL='/wordpress/karp-data.txt'; node build_embed.js
```
→ opnaðu `/wordpress/karp-embed.html` í forskoðunar-þjóni sem þjónar þessari möppu.
**MIKILVÆGT:** byggðu ALLTAF aftur með venjulegu `node build_embed.js` (án env-breytunnar) áður en þú límir í WordPress — annars bendir embed-ið á dev-slóð og gögnin hlaðast ekki á karp.is.

## Að endurnýja gögn
- Skriptur í `skriptur/` lesa úr `heimildir/` og skrifa JSON í `gogn/` (slóðir þegar uppsettar).
- `.py`-skriptur (build_jofnun, build_sereign) taka inntak/úttak sem viðföng — bentu á `heimildir/...` og `gogn/...`.
- Eftir endurnýjun gagna: keyrðu `node build_embed.js` aftur.
- **Alþingi (frumvörp + atkvæði):** tvísmelltu `refresh-althingi.bat` — keyrir build_frumvorp.js → build_summaries.js → build_embed.js. Síðan: endurhlaða `wordpress/karp-data.txt` í WP Media.

## AI-samantektir á frumvörpum (`skriptur/build_summaries.js`)
Bætir einnar-setningar samantekt (`sam`) við hvert mál í `gogn/frumvorp.json`, byggt á **greinargerð málsins** (sótt af althingi.is) + titli + efnisgreiningu. Birtist í frumvarps-glugganum á mælaborðinu.
- **Uppsetning (einu sinni):** `npm install @anthropic-ai/sdk`  (er í package.json).
- **Keyrsla:** `$env:ANTHROPIC_API_KEY='sk-ant-...'; node skriptur/build_summaries.js` → svo `node build_embed.js` (bakar `sam` inn í karp-data.txt).
- **Model:** `claude-opus-4-8` sjálfgefið (nákvæmast — borgaratól). Ódýrara: `$env:KARP_SUMMARY_MODEL='claude-haiku-4-5'` (~5x ódýrara). Endurgera allt: `$env:KARP_RESUMMARIZE='1'`.
- **Skyndiminni:** samantektir geymast í `gogn/samantektir.json` (lykill `157_<málsnr>`). build_frumvorp.js endurskrifar frumvorp.json frá grunni, EN build_summaries.js endurnýtir minnið ókeypis (þarf hvorki lykil né SDK fyrir það) — aðeins NÝ mál kalla á API. Vantar lykil í refresh? Þá haldast eldri samantektir samt (ekki villa).
- **Strangt:** kerfisleiðbeiningin bannar skáldskap — samantekt byggir EINGÖNGU á því sem kemur fram. ~80% mála hafa fulla greinargerð; restin (fjárlög, frestun funda o.fl.) hafa lýsandi titil.

## Spár & kannanir — flokkurinn „Kannanir"
Tveir undirflokkar í valmyndinni undir **Kannanir**:
- **Fylgi flokka** (`skriptur/build_polls.js` → `gogn/polls.json`, bakað). Sækir samantekt skoðanakannana af **Wikipedia** („Next Icelandic parliamentary election", CC BY-SA) — ALLIR mælar (Gallup, Maskína, Prósent o.fl.), sömu flokkakóðar (S,C,F,D,M,B,J,P,V). Þróunarlínurit + nýjasta mæling + ríkisstjórn vs stjórnarandstaða. Keyrsla: `node skriptur/build_polls.js` → `node build_embed.js`. (Þáttur í `refresh-althingi.bat`, non-fatal.) Heimild + tengill sýnt í mælaborðinu. **Sannreynt gegn kosningaúrslitum 2024.**
- **Karp-kannanir** (eigin kannanir): innskráðir kjósa, „kjóstu til að sjá" niðurstöður (eins og frumvörp). **Stjórnandi** (manage_options) sér „Ný könnun"-form beint í mælaborðinu. Bakendi = endapunktar í `karp-user.php` (`/polls`, `/pollvote`, `/pollcreate`, `/polldelete`) — **þarf að líma karp-user.php aftur.** Engin bökuð gögn (lifandi úr WP).

## Endapunktar á WP (PHP-snippet, ekki hluti af embed-inu)
`/wp-json/karp/v1/frettir` · `/wp-json/karp/v1/markadir` · `/wp-json/karp/v1/ees` — sjá `wordpress/`.
