# Deploy — aftengdur framendi (Valkostur A)

Markmið: hætta að líma 950 KB embed inn í WordPress. Þess í stað byggir `karp-app.js`
sjálfkrafa á Cloudflare Pages við `git push`, og WordPress-síðan hleður EINNI fastri línu.

## Hvernig þetta virkar

- `build_app.js` les `dashboard.html` + `gogn/*.json` → `dist/karp-app.js` (sjálf-innspýtandi skrift).
- Skriftin keyrir á karp.is-síðunni → API-köll (`/wp-json/...`) eru samhliða uppruna → **engin CORS**.
- Gögnin (`karp-data.txt`) eru áfram á WordPress (samhliða uppruna). Þú hleður þeim upp aðeins
  þegar gagna-build skriftur breyta þeim (sjaldan) — ekki við hverja kóðabreytingu.

## Einu sinni — uppsetning

1. **Git repo**
   ```
   cd hagvisir
   git init
   git add .
   git commit -m "Karp dashboard frontend"
   ```
   Búðu til **einka**-repo á GitHub (t.d. `karp-dashboard`) og ýttu:
   ```
   git remote add origin git@github.com:<notandi>/karp-dashboard.git
   git push -u origin main
   ```

2. **Cloudflare Pages** (ókeypis)
   - dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → veldu repo-ið.
   - Build settings:
     - Framework preset: **None**
     - Build command: `npm install && npm run build`
     - Build output directory: `dist`
   - (Ef Node-villa: bættu við umhverfisbreytu `NODE_VERSION = 20`.)
   - Save and Deploy. Þú færð lén, t.d. `https://karp-dashboard.pages.dev`.

3. **WordPress** — límdu EINU SINNI inn í WPCode (eða þá síðu sem hýsir mælaborðið):
   ```html
   <div id="karp-app"></div>
   <script src="https://karp-dashboard.pages.dev/karp-app.js" defer></script>
   ```
   Þú mátt eyða gamla 950 KB snippet 2867.

## Daglegt flæði eftir þetta

- **Kóðabreyting** (`dashboard.html`): `git commit` + `git push` → Cloudflare byggir + birtir
  sjálfkrafa. Ekkert WordPress-lím. (Vafrinn nær nýju útgáfunni innan ~10 mín cache, eða strax
  í einkaglugga.)
- **Gagnabreyting** (nýjar build_*.js keyrslur): keyrðu `npm run build`, sæktu
  `wordpress/karp-data.txt` og hladdu upp í WordPress Media (eins og áður) — aðeins þegar gögn breytast.

## Staðbundin prófun

```
$env:KARP_DATA_URL='/wordpress/karp-data.txt'   # PowerShell
npm run build
```
Opnaðu `_apptest.html` í forskoðun — það hleður `dist/karp-app.js` nákvæmlega eins og WordPress gerir.

## Valfrjálst: hýsa gögnin líka á CDN

Ef þú vilt að `git push` uppfæri LÍKA gögnin (ekki bara kóða): í `build_app.js` breyttu
`DATA_FILE_URL` í `https://karp-dashboard.pages.dev/karp-data.txt`. `dist/_headers` setur þegar
`Access-Control-Allow-Origin: *` á skrána svo CORS virki. Þá þarftu aldrei að hlaða gögnum í WordPress.
(Sjálfgefið er haldið á WordPress til að hafa engin CORS-mál.)

## Til baka (rollback)

Cloudflare Pages geymir allar útgáfur — eitt klikk til að fara til baka. Eða `git revert` + push.
Gamli embed-ferillinn (`build_embed.js` → snippet 2867) virkar áfram ef þú vilt skipta til baka.
