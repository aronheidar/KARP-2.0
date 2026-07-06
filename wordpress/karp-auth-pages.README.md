# Native Karp auðkenningarsíður (LEIÐ A)

Karp-stílaðar innskráningar-/nýskráningar-/endurstillingarsíður á **karp.is** í stað
óstíluðu Ultimate Member-síðnanna á wp.karp.is.

| Slóð (karp.is) | Hlutverk | POST-ar á (wp.karp.is) |
|---|---|---|
| `/innskra/` | Innskráning | `wp-login.php` |
| `/nyskraning/` | Nýskráning | `wp-login.php?action=register` |
| `/endurstilla/` | Gleymt lykilorð | `wp-login.php?action=lostpassword` |

**Af hverju virkar þetta án CORS:** formin eru venjuleg `<form method="POST">` (top-level
vafra-navigering, ekki fetch). WordPress setur innskráningarkökuna á `.karp.is`
(`COOKIE_DOMAIN`) svo hún gildir strax á karp.is. Enginn `testcookie`-reitur er sendur
→ WP sleppir „Cookies are blocked"-villunni (hún er gátuð á `isset($_POST['testcookie'])`).

## Skrár
- `web/src/components/AuthShell.astro` — sameiginleg spjaldskel + CSS.
- `web/src/pages/{innskra,nyskraning,endurstilla}.astro` — síðurnar.
- `wordpress/karp-auth-pages.php` — **NÝTT** WPCode-snippet (villu-/árangurs-vísun + skilmálar).
- `wordpress/karp-user.php` — **breytt** (2 línur): `loginUrl`/`registerUrl` → nýju slóðirnar.

## Deploy-skref
1. **Kóði:** merge-a `auth-pages` inn í `main` → `git push origin HEAD:main`. Cloudflare
   Pages byggir /innskra/, /nyskraning/, /endurstilla/.
2. **Nýtt snippet:** WPCode → Add Snippet → PHP Snippet → líma innihald
   `karp-auth-pages.php` (**sleppa fyrstu `<?php` línunni**) → *Active · Auto Insert ·
   Run Everywhere · Save*.
3. **Endurlíma `karp-user.php`** í WPCode-snippet-ið sitt (nú með nýju loginUrl/registerUrl).
   ⚠ Aðal-session er líka að breyta þessari skrá (greiðslur) — merge-a fyrst.
4. **WP-stillingar:** Settings → General → **„Anyone can register" = á**, *New User Default
   Role* = **Subscriber**.
5. **⚠ Ultimate Member:** gakktu úr skugga um að UM **vísi EKKI** `wp-login.php?action=register`
   á UM-nýskráningarsíðuna (UM → Settings → ... login/register redirect). Ef það gerir það
   grípur UM formið og R1 virkar ekki. Sama ef UM læsir `wp-login.php` innskráningu.

## Prófun (þú — þarf raunveruleg skilríki)
**Innskráning**
- [ ] karp.is/innskra/ → rétt skilríki → lendir innskráð(ur) á /mitt-svaedi/.
- [ ] Af t.d. /fasteignavakt/ → smella „Skrá inn" (chip) → eftir innskráningu aftur á /fasteignavakt/ (`?redirect_to` virkar).
- [ ] Rangt lykilorð → aftur á **/innskra/?villa=** með Karp-villuskilaboðum (EKKI óstíluð wp-login.php).
- [ ] Þegar innskráð(ur) og fer á /innskra/ → sér „Þú ert þegar innskráð(ur) → Mitt svæði".

**Nýskráning**
- [ ] karp.is/nyskraning/ → notandanafn + netfang + haka skilmála → „athugaðu póstinn" (/nyskraning/?skrad=1) + tölvupóstur með „stilltu lykilorð"-hlekk.
- [ ] Án skilmála-höku → villa (bæði browser `required` OG server-hlið).
- [ ] Tvítekið netfang/notandanafn → villa aftur á /nyskraning/?villa=.
- [ ] Nýi notandinn fær hlutverkið **Subscriber** og `karp_terms_accepted` meta er skráð.

**Endurstilla**
- [ ] karp.is/endurstilla/ → netfang → „ef aðgangur er skráður..." (/endurstilla/?sent=1) + endurstillingarpóstur.

**Chip / routing**
- [ ] Útskráð(ur): „Skrá inn"-chip → **karp.is/innskra/** (ekki wp.karp.is/login/). „Nýskrá" → karp.is/nyskraning/.

## Rollback (öryggisrofi)
Nýju Astro-síðurnar skaða ekkert þó þær séu til. Til að beina fólki **aftur** á UM-síðurnar:
endurlíma GÖMLU `karp-user.php` (loginUrl/registerUrl aftur á `um_get_core_page`). Chip fer þá
strax aftur á wp.karp.is/login/. Snippetið `karp-auth-pages.php` má líka bara gera óvirkt í WPCode.

## Þekktir jaðrar
- **„Stilltu lykilorð"-skrefið** (úr nýskráningar-/endurstillingarpóstinum) opnast á
  `wp-login.php?action=rp` — það er WP-síða, óstíluð. Mætti stíla síðar (login_enqueue_scripts).
- **Endurstilling með óþekktu NOTANDANAFNI** (ekki netfangi) getur lent á wp-login.php
  (WP bætir `invalidcombo`-villunni við EFTIR `lostpassword_errors`-hookið). Netfangs-tilvik
  grípast rétt. Langflestir nota netfang.
