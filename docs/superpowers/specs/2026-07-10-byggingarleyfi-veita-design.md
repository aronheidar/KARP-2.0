# Byggingarleyfa-veita fyrir KARP.is — hönnun

*Dags. 2026-07-10 · samþykkt af Aroni (bæði neytendur + full bakfylling)*

## Markmið

Ný opin gagnaveita: **afgreiðslur byggingarfulltrúa Reykjavíkur** (byggingarleyfi —
samþykkt / synjað / frestað), heimilisfangs-lykluð, sem nærir fasteignagreind KARP.
Byggingarleyfi hafa **ENGA kennitölu** (GDPR ritskoðar umsækjendur) → passa fasteignagreind
(`/fasteignavakt/`, ný `/byggingarvakt/`), **ekki** fyrirtækjaskýrslur (`/fyrirtaeki/`).

## Heimild (staðfest opin, 2026-07-10)

- **Vísir:** `https://reykjavik.is/byggingarmal/fundargerdir-byggingarfulltrua` — kyrrstætt HTML,
  **273 PDF-tenglar** (afgreiðslufundir byggingarfulltrúa, aftur til ~2020).
- ⚠ Slóðir PDF-anna eru **EKKI deterministic** (blandað `_`/`-`/URL-kóðuðum íslenskum stöfum,
  mismunandi eftir árum) → vísi-síðan er sannleiksuppspretta URL-a, ekki smíðaðar slóðir.
- **Snið hvers PDF** (staðfest á fundi 23. júní 2026, 1262. fundur, 48 færslur):
  - Haus: `Árið <ár>, <vikudagur> <d>.<mán> kl. … hélt byggingarfulltrúinn … <N>. fund`
  - Færslur: `<N>. <HEIMILISFANG> - USK########`
  - `Sótt er um leyfi til að <lýsing>` (eða „Sótt um byggingarleyfi til að …")
  - `Stækkun:`/`Stærð: <x> ferm., <x> rúmm.` (valfrjálst)
  - Ákvörðun: **Samþykkt** / **Synjað** / **Frestað** / **Vísað frá** / **Afturkallað**
- **Hnit/póstnúmer/hverfi:** `stadfangaskra_extra.csv`
  (`raw.githubusercontent.com/rvkdata/stadfangaskra_extra`) — sama uppspretta og `build_hnit.js`;
  `götuheiti + húsnr → (POSTNR, N_HNIT_WGS84, E_HNIT_WGS84, LUKR_HVERFAHEITI)`.

## Arkitektúr

Ein Python-gagnapípa (spegill `build_logbirting.py`) → 3 afleiddar skrár → 2 neytendur.
**Enginn worker-endapunktur** (engin kt-uppfletting; skýrslan les kyrrstæðar per-póstnúmer skrár
eins og `solusaga/<pn>`).

```
build_byggingarleyfi.py
  ├─ skrapa vísi → listi PDF-URL-a
  ├─ pypdf → texti → splitta á "<N>. <ADDR> - USK…" → færslur
  ├─ Staðfangaskrá CSV → postnr + lat/lng + hverfi per heimilisfang
  ├─ incremental (seen-set af fundum) + --audit N (þáttar, skrifar ekkert)
  └─ skrifa:
       gogn/byggingarleyfi.json              (kanónískt, byAddr)
       (web/public/)gogn/byggingarleyfi/<pn>.json   (per-póstnúmer → skýrsla)
       (web/public/)gogn/byggingarleyfi_vakt.json   (nýjustu ~400 + hverfa-samantekt → vaktin)
       gogn/byggingarleyfi_seen.json, _meta.json    (staða)
```

### Gagnaskema

Færsla (`permit`):
```json
{ "addr": "Austurgerði 1", "caseNo": "USK26020380",
  "desc": "bæta við bílastæði á lóð, stækka með viðbyggingu…",
  "type": "byggingarleyfi", "decision": "Synjað", "decisionCode": "synjad",
  "date": "2026-06-23", "fund": 1262,
  "sizeM2": null, "sizeM3": null,
  "url": "https://reykjavik.is/sites/default/files/…pdf" }
```
`byggingarleyfi.json.byAddr[normAddr] = { addr, postnr, hverfi, lat, lng, permits:[…] }`
þar sem `normAddr` = lágstafað götuheiti + húsnr (+ bókstafur), án hreims-næmni.

### decisionCode + litun
`samthykkt` (grænt) · `synjad` (rautt) · `frestad` (gult) · `visad_fra` (grátt) ·
`afturkallad` (grátt) · `annad` (hlutlaust). Speglar alvarleika-litun logbirting/eftirlit.

## Neytandi A — „Byggingarsaga heimilisfangs" í `fasteignavakt.astro`

Nýr kafli í verðmatsskýrslunni. Þegar eign er skoðuð:
1. Hleður `gogn/byggingarleyfi/<pn>.json` fyrir póstnúmer eignarinnar (sama vél og `solPn`).
2. Síar á nákvæmt heimilisfang eignarinnar (norm-samsvörun).
3. Rendrar tímalínu leyfa (nýjast efst): ákvörðunar-merki (litað) + lýsing + stærð + dags +
   tengill á opinbera fundargerð.
4. Tómt (ekkert leyfi) → kaflinn falinn.

## Neytandi B — ný `/byggingarvakt/` síða

Spegill `eftirlit.astro`:
- **SSR** (build-time): samantekt úr `byggingarleyfi_vakt.json` — fjöldi eftir ákvörðun,
  eftir hverfi, nýjasti fundur.
- **Leaflet-kort** (`withLeaflet`, circleMarker): nýjustu leyfin, punktar litaðir eftir ákvörðun.
- **Client-leit:** heimilisfang / hverfi + ákvörðunar-sía.
- Tenglar á fundargerðir + kross á `/fasteignavakt/`.
- Nav undir **Karp Pro**. Nafn `byggingarvakt` — aðgreint frá `leyfi.astro` (rekstrar-/ferðaleyfi,
  ótengt).

## PII / fyrirvari

- PDF-arnir eru þegar **„án kt. einstakl."** (RVK ritskoðar GDPR fyrir birtingu).
- Birti aðeins: heimilisfang, málsnr (USK), verk-lýsingu, ákvörðun, dags, tengil á fundargerð.
- Stroka öll `kt.`/`kennitala`-strengi úr lýsingu til öryggis (ættu ekki að vera til staðar).
- Fyrirvari í gögnum (eins og logbirting): opinberar afgreiðslur byggingarfulltrúa skv. mannvirkjalögum
  nr. 160/2010; endurbirting getur verið háð skilyrðum.

## Landsþekja

⚠ **AÐEINS Reykjavík** (byggingarfulltrúi RVK). Landsdekkandi þarf fleiri sveitarfélög
(Kópavogur, Hafnarfjörður, Akureyri …) — hvert með eigið snið (líklega PDF eða önnur veita).
Skjalfest sem **seinni áfangi**; hönnunin (byAddr + per-postnr + vakt-feed) er sveitarfélaga-óháð
svo viðbætur bætast við sömu skrár.

## Verifun

1. `python skriptur/build_byggingarleyfi.py --audit 4` → réttar færslur
   (t.d. Austurgerði 1 → Synjað 2026-06-23; ~48 færslur/fundur; ákvarðanir taldar).
2. Full bakfylling → þekju-skýrsla yfir alla ~271 fundi (hlutfall færsla sem þáttuðust).
3. `npm run build` (Astro, ~208+1 síður) klárar án villu.
4. Dev-server 200 á `/byggingarvakt/` + `node --check` á síðu-skriptu.
5. Staðfesta `byggingarleyfi/<pn>.json` fyrir þekkt póstnúmer + byAddr-uppflettingu.

## Uppsetning / deploy

- Vinna í worktree `C:\Users\aronh\dev\KARP\byggingarvakt-wt` (off `origin/main`) — aðal-tréð er
  á öðrum branch. Edit BEINT í worktree, eitt commit, `git push origin HEAD:main`.
- Build-verifun: junction `byggingarvakt-wt/web/node_modules` → aðal-tré (worktree fær ekki afrit).
- Vikuleg keyrsla: bæta `build_byggingarleyfi.py` í `refresh-data.yml` (við hlið `build_logbirting.py`;
  incremental + seen-set → ódýrt daglegt, nýir fundir birtast vikulega).

## Áhættur / opnar spurningar

- **Snið-frávik eldri PDF-a (2020–2023):** naming „án kt. einstakl." bendir til afbrigða.
  Mildun: þátta hvað passar, sleppa hinu hreint, skýrslugera þekju (eins og logbirting MISS).
- **Heimilisföng sem Staðfangaskrá nær ekki** (ný lóð, lóð án húsnr): halda í byAddr án
  hnita/postnr → engin kortapunktur, en sagan geymist. Bucket „óþekkt postnr" sér.
- **Fjölmál (mhl.01) / margar eignir á lóð:** eitt USK-mál = ein færsla, geymt á aðal-heimilisfangi.
