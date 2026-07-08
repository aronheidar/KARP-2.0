# Hönnunarskjal: Þrepa-áskriftarvél (Fyrirtækjalausnir — Verk B)

- **Dagsetning:** 2026-07-08
- **Staða:** Samþykkt hönnun (bíður spec-yfirferðar Arons) → næst: writing-plans
- **Forsaga:** Verk A (vöru-/verðsíður) LIFANDI [[karp-fyrirtaekjalausnir]]. Þetta er bakendinn til að RUKKA þrepin.

## 1. Markmið

Rukka 3 þrepin (Grunnur 2.900 / Fyrirtæki 6.900 / Fyrirtæki+ 12.900 kr/mán) gegnum Áskell v2 embedded checkout, og gáta eiginleika eftir þrepi. **Extend** núverandi per-þjónustu Áskell-flæði (frettir/utbod) yfir í per-þrep — ekki endurskrifa.

## 2. Ákvarðanir úr brainstorm (læst)

| Ákvörðun | Val |
|---|---|
| Núverandi frettir/utbod áskriftir | **Skipta út** — fella inn í þrepin, sleppa stöku 3.490 áskriftum (engir raunverulegir áskrifendur enn) |
| Entitlement-líkan | **Þrep-stigveldi** — eitt þrep per notandi, eiginleikar á lágmarks-þrepi |
| Áskell | **Extend** — 3 sölurásir (ein per þrep), sama session→mountCheckout→webhook flæði |
| Trial | Halda „1 mánuður frír" per þrep |
| Skýrslu-kvóti (5/20 innifaldar) + tölulegir limitar (fylgja 10/50, kt 25/100) | **FRESTAÐ í v1.1** — v1 = tvíundar þrep-gátun |

## 3. Entitlement-líkan (þrep-stigveldi)

Notandi hefur **eitt þrep**. Gagnaskema:
- **WP (karp-user.php):** `karp_tier` (strengur: `grunnur`|`fyrirtaeki`|`fyrirtaeki_plus`) + `karp_tier_until` (unix-tími). `/me` skilar `tier` + `tier_until` (afleitt: sleppt ef útrunnið).
- **KARP_USER (framendi):** `u.tier` (strengur eða null) — kemur í stað `u.subs`.

Nýir hjálparar í `auth.js`:
```js
const TIER_LVL = { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 };
export function tierLevel(u) { u = u || _u(); return u.isAdmin ? 99 : (TIER_LVL[u.tier] || 0); }
export function hasTier(min) { return tierLevel() >= min; }      // min = 1|2|3
export function lockedTier(min) { return _u().paywall === true && !hasTier(min); }
```
`isSub`/`lockedSvc` (per-þjónustu) **fjarlægð**; kallendur færðir á `hasTier`/`lockedTier`.

## 4. Eiginleiki → lágmarks-þrep (v1, tvíundar)

Sannleiksuppspretta: bæti `minTier` (1|2|3) á viðeigandi `EIGINDIR`-raðir í `web/src/data/lausnir.js` (svo verðtaflan OG gátunin lesi sama). v1 gátaðir eiginleikar:

| Eiginleiki | Slóð/staður | minTier |
|---|---|---|
| Útboðsvaktin | `/utbod/` (var subGate utbod) | 1 (Grunnur) |
| Fyrirtækjavaktin — fylgja félögum | prófílar + Mitt svæði | 1 |
| Fjölmiðlavakt | `/frettir/` (var subGate frettir) | 2 (Fyrirtæki) |
| Viðskiptamannavakt (kt-vöktun) | Fyrirtækjavaktin | 2 |

**Óbreytt í v1:** stakar skýrslur (fyrirtaeki/eigendur/fasteign) = **990 kr fyrir alla** (Teya, óbreytt). „Innifaldar skýrslur" í þrepum = v1.1. Frjálsar vaktir (Leitarorða/Eftirlit/Ökutæki&skip) áfram frjálsar.

## 5. Áskell-tenging (extend)

- **3 sölurásir** (Aron býr til í Áskeli, ein per þrep): secrets `ASKELL_CHANNEL_GRUNNUR`, `ASKELL_CHANNEL_FYRIRTAEKI`, `ASKELL_CHANNEL_FYRIRTAEKI_PLUS`. Sjálfgildi = þrep-slug (svo aðeins `ASKELL_PRIVATE_KEY` sé skylt, eins og nú).
- **worker `askellSessionHandler`:** tekur `tier` (í stað/auk `service`); velur rás úr `ASKELL_CHANNEL_<TIER>`; `metadata.tier`. Óvirkt (`unconfigured`) ef `ASKELL_PRIVATE_KEY` vantar.
- **worker webhook `askellWebhookHandler`:** `subscription_contract` (v2) → les `metadata.tier` + `customer_reference` (kt) → POST `/sub/grant { kt, tier, until }` (HMAC-varið `KARP_GRANT_SECRET`). Afbókun → engar fleiri greiðslur → rennur út.
- **framendi `auth.js`:** `karpSubscribeTier({slug,nafn,btn})` víruð í sama flæði og `karpAskellSubscribe`: safnar kt → `/sub/subscribe {tier,kt}` → `/api/sub/checkout-session?tier=&kt=` → `Askell.mountCheckout` → onSuccess reload; aðgangur opnast við webhook (server-hlið, ekki onSuccess einn).
- **`VerdTafla.astro`:** þrep-hnappar kalla nú á virka `karpSubscribeTier` (placeholder-textinn „opnar á næstunni" fjarlægður).

## 6. karp-user.php / WP breytingar

- `/sub/subscribe` tekur `tier` (geymir `karp_kt` → tengir vefkrók við notanda) — sama og nú fyrir service.
- `/sub/grant` tekur `{ kt, tier, until }` → setur `karp_tier` + `karp_tier_until` (idempotent á greiðslu-id). Í stað per-service `karp_sub_<svc>_until`.
- `/me` skilar `tier`/`tier_until` (sleppt ef útrunnið). `subs` reitur fjarlægður (eða skilinn eftir tómur til bakvið-samhæfni — sjá §8).
- Trial: `/sub/trial { tier }` → `karp_tier` + `karp_tier_until = now+1mán` (einu sinni, `karp_tier_trial_used`).

## 7. Aron-háð (fer ekki í loftið án þessa)

1. Búa til **3 áskriftar-plön/sölurásir í Áskeli** (Grunnur/Fyrirtæki/Fyrirtæki+ á réttum verðum), `customer_reference_setting=kennitala`, `allowed_origins=https://karp.is`.
2. Setja Cloudflare-secrets: `ASKELL_CHANNEL_GRUNNUR/FYRIRTAEKI/FYRIRTAEKI_PLUS` (+ `ASKELL_PRIVATE_KEY`, `ASKELL_WEBHOOK_SECRET`, `KARP_GRANT_SECRET` eru þegar sett).
3. Endurlíma uppfærðan `karp-user.php` á wp.karp.is.
4. Vefkrókur → `karp.is/api/askell/webhook` (þegar til).

## 8. Utan umfangs / v1.1

- **Skýrslu-kvóti** (5/20 innifaldar skýrslur/mán) — krefst mánaðar-teljara per notanda.
- **Tölulegir limitar** — fylgja-fjöldi (10/50/∞), viðskiptamanna-kt (25/100).
- **Uppfærsla/niðurfærsla milli þrepa** — v1: gerast áskrifandi að einu þrepi; þrep-skipti höndluð í Áskeli/handvirkt.

## 9. Bakvið-samhæfni & áhætta

- **Engir raunverulegir frettir/utbod áskrifendur** (staðfest af Aroni) → óhætt að fjarlægja `subs.frettir/utbod` + per-service kóða. Ef einhver `karp_sub_frettir_until` er í WP → hunsast (rennur út).
- Allt **secret-gated**: án `ASKELL_CHANNEL_*`/`ASKELL_PRIVATE_KEY` skilar `askellSessionHandler` `unconfigured` → þrep-hnappur sýnir hóflega villu, ekkert brotnar.
- 990 kr stakar skýrslur (Teya) **ósnertar**.

## 10. Prófun

- `astro build` gengur; `node --check` á `auth.js` + `lausnir.js`.
- Eining-próf á `tierLevel`/`hasTier` (þrep-stigveldi: 0/1/2/3 + admin=99).
- **Live-checkout bíður Áskell-uppsetningar Arons** — þá: raun test-greiðsla per þrep → webhook capture (`/api/askell/last?diag=1`) → staðfesta `metadata.tier` þáttun → aðgangur opnast á réttu þrepi.

## 11. Öryggi

- Ný secrets = Cloudflare Secrets (Encrypt), ALDREI plain-text (wrangler þurrkar text-breytur) né í commits.
- Webhook HMAC-SHA512 staðfesting óbreytt; grant HMAC-varið `KARP_GRANT_SECRET`.
- Aðgangur opnast AÐEINS við staðfestan webhook (server-hlið), ekki `onSuccess` einan.
