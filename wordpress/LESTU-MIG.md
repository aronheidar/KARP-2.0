# WordPress — skrár til að uppfæra

Þetta eru EINU skrárnar sem þú setur inn á karp.is. Allt annað (gögn, skriptur) er bara til að búa þær til.

| Skrá | Hvert fer hún | Hvenær uppfæra |
|------|---------------|----------------|
| **karp-embed.html** | Límist í WPCode-snippet **2867** (allt innihaldið). Birtist sem `[wpcode id="2867"]` á forsíðunni. | Í hvert sinn sem útlit/virkni mælaborðsins breytist. |
| **karp-data.txt** | Hlaðið upp í **WP Media** (Fjölmiðlasafn). Slóð: `/wp-content/uploads/2026/06/karp-data.txt`. | Aðeins þegar **bökuð gögn** breytast (t.d. ný jöfnunarsjóðs-gögn). Notaðu „Enable Media Replace" EÐA eyddu+endurhlaða svo slóðin haldist sú sama. |
| **karp-frettir.php** | Eigið **WPCode PHP-snippet** | Þegar frétta-veitum/síum er breytt. |
| **karp-markadir.php** | Eigið **WPCode PHP-snippet** | Sjaldan (Yahoo-proxy). |
| **karp-orka.php** | Eigið **WPCode PHP-snippet** | Einu sinni. Proxy fyrir núlíðandi raforkublöndu frá Landsnet (`/wp-json/karp/v1/orka`). Án þess felst „Framleiðsla núna"-reiturinn á Raforku-síðunni; ferillinn (bakaður) virkar samt. |
| **karp-umferd.php** | Eigið **WPCode PHP-snippet** | Einu sinni. Proxy fyrir rauntíma-bílaumferð frá Vegagerðinni (`/wp-json/karp/v1/umferd`). Án þess felst „vegaumferð núna"-hlutinn á Umferð-síðunni; Keflavík-farþegar (Hagstofa, lifandi) virka samt. |
| **karp-ees.php** | Eigið **WPCode PHP-snippet** | Sjaldan (EUR-Lex EES-proxy). |
| **karp-user.php** | Eigið **WPCode PHP-snippet** | Aðal-API snippet notendakerfisins: innskráningarstaða (+ `isAdmin`) + endapunktar (`/me`, `/favs`, `/myvotes`, `/follows`, `/vote`, `/spa`, `/comments`, `/polls`, `/pollvote`, `/pollcreate`, `/polldelete`, `/changepass`, `/avatar`, `/burst`, **`/quizresult`**). Lykilorð + prófílmynd eru nú í Stillingum mælaborðsins (þarf ekki UM-síðu lengur). **Uppfæra í hvert sinn sem nýr endapunktur bætist við.** Þarf Ultimate Member (fyrir skráningu/innskráningu) + GD fyrir myndir. |
| **skilmalar.html** | **LIVE WP-síða** (id 5651, slug `skilmalar-personuvernd`) | „Skilmálar & persónuvernd" — BÚIN TIL á karp.is gegnum royal-mcp 2026-06-27, slóð **karp.is/skilmalar-personuvernd** (/skilmalar/ vísar þangað). Þetta er upprunaskráin; til að UPPFÆRA: breyta henni + `PUT royal-mcp/v1/pages/5651` (eða líma handvirkt). Sama efni og í mælaborðinu (Stillingar → Skilmálar). |
| **karp-terms-consent.php** | Eigið **WPCode PHP-snippet** | Bætir SKYLDU-samþykkis-gátreit neðst í Ultimate Member nýskráningarformið (tengir á `/skilmalar-personuvernd/`), stöðvar skráningu ef óhakað og vistar tímastimpil samþykkis (`karp_terms_accepted`). Þarf Ultimate Member. **Prófa á LIVE** (UM ekki keyranlegt locally) — skráðu prufu-aðgang, staðfestu að reiturinn birtist + stöðvar óhakaða skráningu. |
| **karp-digest.php** | Eigið **WPCode PHP-snippet** | Einu sinni (vikulegt yfirlit í pósti). ⚠ Þarf **SMTP-viðbót** (t.d. WP Mail SMTP) fyrir áreiðanlega afhendingu — annars lendir pósturinn í rusli. |
| **karp-um.css** | Eigið **WPCode CSS-snippet** | Einu sinni (Karp-útlit á Ultimate Member-síðurnar: innskráning/nýskráning/aðgangur/prófíll). Sjá neðar. |
| **wp-allow-txt.php** | Eigið **WPCode PHP-snippet** | Einu sinni (leyfir .txt-upphleðslu). |

## Hvernig PHP-snippet er sett upp (öll eins)
1. WPCode → **Add Snippet** → „Add Your Custom Code" → veldu **PHP Snippet**.
2. Límdu innihald skrárinnar — **slepptu fyrstu `<?php` línunni** (WPCode bætir henni við sjálft).
3. Stilltu: **Active** · Auto Insert · **Run Everywhere** · Save.
4. Staðfestu að endapunkturinn svari JSON:
   - Fréttir: `https://www.karp.is/wp-json/karp/v1/frettir?efni=allt`
   - Markaðir: `https://www.karp.is/wp-json/karp/v1/markadir`
   - EES: `https://www.karp.is/wp-json/karp/v1/ees`

## karp-um.css (Karp-útlit á UM-síður) — uppsetning
- WPCode → Add Snippet → Add Your Custom Code → veldu **CSS Snippet** (EKKI PHP) → límdu allt úr `karp-um.css` (engin `<?php`, engin `<style>`) → **Active · Auto Insert · Run Everywhere** · Save.
- Hefur aðeins áhrif á `body.um-page` (UM-síðurnar) — aðrar síður ósnertar. Dökka Karp-þemað, teal-hreim, miðjað kort með merki.
- Twenty Twenty-Five (block-þema) felur „Additional CSS" í Customizer, þ.a. **CSS-snippet í WPCode er réttа leiðin** hér.
- Ath.: reitatextar UM koma sjálfgefið á **ensku** („Username or E-mail", „Login"…). Íslenska: UM → Forms (breyta merkimiðum) eða Loco Translate-viðbót. (Útlitið virkar óháð tungumáli.)

## karp-user.php (innskráning) — sérstök atriði
- Hefur **engan JSON-endapunkt**; í staðinn sprautar hann `window.KARP_USER` inn í `<head>`.
  Staðfesting: opnaðu forsíðuna, skoðaðu „View source" og leitaðu að `window.KARP_USER` — á að innihalda `loggedIn`, `loginUrl`, `registerUrl`.
- Þarf **Ultimate Member** uppsett (Skrá-inn / Nýskrá / Prófíl-síður koma þaðan). Án UM falla slóðir aftur á WP-sjálfgefið (`wp-login.php`).
- ⚠ **Skyndiminni:** í LiteSpeed (eða öðru síðu-skyndiminni) skal **„Cache Logged-in Users" vera OFF** (sjálfgefið) — annars gæti innskráningarstaða eins lekið í skyndiminni annarra.
- Mælaborðs-takkinn felur sig sjálfkrafa þar til snippet-ið er virkt (engin villa þó það vanti).

## Algeng tilvik
- **Breytti bara útliti/kóða** → líma `karp-embed.html` í 2867. (Engin gagna-upphleðsla.)
- **Bætti við/uppfærði bökuð gögn** → líma `karp-embed.html` í 2867 OG endurhlaða `karp-data.txt`.
- **Breytti fréttaveitum** → uppfæra `karp-frettir.php`-snippet.

> ⚠️ `karp-embed.html` og `karp-data.txt` eru **búnar til af `node build_embed.js`** (sjá ../LESTU-MIG.md). Ekki breyta þeim handvirkt — breytingar tapast við næstu byggingu.
