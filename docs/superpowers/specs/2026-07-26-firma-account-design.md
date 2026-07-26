# Firma-account (org/sæta-sameign) v1 — Hönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun (brainstorming), tilbúið fyrir writing-plans.
**Repo:** aronheidar/KARP-2.0 · worktree `C:\Users\aronh\dev\KARP\mitt-svaedi-wt`
**Tengt:** fast-follow úr [[karp-areidanleikavaktin]] (gerir KYC-listann firma-sameiginlegan).

## Markmið

Gera „sætin" í Karp+ þrepunum raunveruleg: paying user (**eigandi**) getur haft team-meðlimi sem **erfa þrep/áskriftir/skýrslu-heimildir eigandans** og **deila account-gögnum** (KYC-vöktunar-listi, ktwatch, follows). Beachhead: lögmanns-/bókhaldsstofur með marga starfsmenn.

## Læstar ákvarðanir (brainstorming)

1. **Umfang:** full firma-account — meðlimir erfa þrep + deila account-gögnum (ekki bara þrep-erfð).
2. **Tenging:** email-auto-tenging um núverandi `/team`-lista (notandi sem innskráir sig og er á virkum team-lista eiganda → tengist).
3. **Réttindi:** allir meðlimir jafnir í notkun; **aðeins eigandi** stjórnar team-lista + billing.
4. **Nálgun A:** `users.parent_account_id` + `accountId()`-resolver (account = eigenda-röðin). Ekki sérstök `accounts`-tafla (nálgun B = of stórt fyrir v1).
5. **Billing:** sæti innifalin í þrep-verði, engin per-sæti gjald, engin ný billing-pípa.

## Staðfestar kóða-staðreyndir (úttekt 2026-07-26)

- **Greenfield:** ekkert `parent_account_id`/`accountId` til. `users`-dálkar í `web/migrations/0002_auth.sql:6-24`. **Næsta migration = `0010`** (0009_leikur er til).
- **Enginn client-breyting þarf:** `auth.js` les `effectiveTier`/`subs`/`reports`/`reportsRemaining` úr `window.KARP_USER` (sett af `/me`, `auth.js:39,44-58`). `tierLevel` (`auth.js:189`) notar nú þegar `effectiveTier || tier`; athugasemd `auth.js:188` lýsir ásetningi („teymis-meðlimir erfi þrep eiganda"). **Öll mekaník server-megin.**
- **Miðpunktur:** `authMeHandler` (`worker.js:3176-3201`) + `userPayload` (`worker.js:3163-3174`). `/me` reiknar entitlements af caller-röð → verður að reikna af **account-eiganda**.
- **`/team`:** `worker.js:3509-3523` (email-blobb í `user_prefs k='team'`, per-uid, owner-hlið). `_seatsCap` `worker.js:3368` ({fyrirtaeki:5, fyrirtaeki_plus:10}). **Enginn öfug-index** email→eigandi til.
- **Gate-hjálparar** sem lesa caller-röð: `_kycGate`/`_kycWatchCap` (2548-2549), `topplistaEntitled` (2962), `_uTier` (3366), `_ktwatchCap` (3367), `_seatsCap` (3368).

## Gagnalíkan — migration `web/migrations/0010_account.sql`

```sql
-- 0010_account.sql — firma-account (org/sæta-sameign). parent_account_id = users.id eigandans; null = eigandi/sjálfstæður.
ALTER TABLE users ADD COLUMN parent_account_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_account_id);
```
(SQLite/D1 `ALTER ADD COLUMN` styður ekki self-FK → berr nullable INTEGER + index; sama mynstur og `0003` bætti dálkum.)

**Resolver (nýtt í worker.js):** `const accountId = (u) => u.parent_account_id || u.id;` + `async function accountOwner(env, u) { return u.parent_account_id ? await env.TENGSL.prepare('SELECT * FROM users WHERE id=?').bind(u.parent_account_id).first().catch(()=>null) || u : u; }`

## Auto-tenging (í `authMeHandler`, eftir röð-lestur `worker.js:3179`)

1. Hlaða caller-röð `u`.
2. Ef `u.parent_account_id` er null: finna eiganda þar sem `u.email` er á virkum `team`-lista OG eigandi með virkt þrep OG laust sæti. **Öfug-lookup:** í v1 skanna `SELECT user_id, v FROM user_prefs WHERE k='team'` og finna fyrsta eiganda sem inniheldur `u.email` og hefur `virka meðlimi < _seatsCap`. (Fast-follow: `account_members`-index; skönnun er ódýr meðan notendur eru fáir — flagga í plani.)
3. Á hit: `UPDATE users SET parent_account_id=? WHERE id=?`.
4. **Afskráning:** ef `parent_account_id` er sett EN `u.email` er EKKI lengur á team-lista þess eiganda (eða eigandi óvirkur) → `UPDATE users SET parent_account_id=NULL` (aftur í eigin þrep/gögn).
5. **Sæta-þak:** `/team` POST (3510-3518) heldur þaki eigandans; auto-link neitar ef þak fullt (meðlimur helst ótengdur → eigin þrep).

## Réttinda-erfð (`authMeHandler`/`userPayload`)

- Reikna `const acct = await accountOwner(env, u);` og keyra entitlement-lestur af `acct`:
  - `sub_service WHERE user_id=accountId(u)` (3184) · `reports_granted WHERE user_id=accountId(u)` (3185) · kvóti `used`/`quota` af `acct.reports_month`/`acct.reports_used`/`acct.tier` (3189-3190) · `svcQuota` (3197-3199) af account-subs.
- **`userPayload` split:** `tier` = **eigin** (`u`) þrep; `effectiveTier` = **account** (`acct`) þrep. (Client velur `effectiveTier || tier` → meðlimur með null eigin-þrep fær account-þrep.) `plus` = account-virkt.
- Halda `id`/`email`/`name` af `u` (raun-notandinn).

**Gate call-sites → `accountId`/account-þrep** (allir lesa caller-röð í dag; verða account-resolved):
| call-site | file:line |
|---|---|
| topplistar unlock | `worker.js:2978-2980` (`topplistaEntitled`) |
| KYC tier-gate | `worker.js:2563-2564` (`_kycGate`) |
| KYC watch-cap + count | `worker.js:2572,2577,2580` (`_kycWatchCap`, `COUNT owner_id`) |
| /reports/open kvóti + **increment** | `worker.js:3442-3450` (REPORT_QUOTA, `reports_used` UPDATE → **á account**) |
| /thing/open kvóti + **increment** | `worker.js:3459-3468` (`sub_service used` UPDATE → **á account**) |
| /fasteign/meta kvóti + **increment** | `worker.js:3477-3487` (`sub_service used` UPDATE → **á account**) |
| /ktwatch cap | `worker.js:3495-3497` (`_ktwatchCap`) |
| gated report DATA proxy | `worker.js:4315-4317` (`reports_granted WHERE user_id=accountId`) |

⚠ **Hæsta áhætta ef gleymt:** kvóta-increment (3450/3468/3487) verða að skrifa á **account-eigandann** (annars fær hver meðlimur eigin mánaðar-skammt); og data-proxy (4317) verður að lesa account-heimildir (annars sér meðlimur ekki skýrslur sem stofan keypti).

## Gögn account-scoped

- **KYC** (`kyc_watch`/`kyc_audit`/`kyc_ack` `owner_id` → `accountId(u)`): ~27 bind-síður `worker.js:2570-2687` (listi í úttekt). `kyc_snapshot`/`kyc_event` eru GLOBAL per kt → óbreytt. **`kyc_audit.actor` helst raun-notandinn** (`u.email`) → rekjanleiki hver gerði hvað.
- **ktwatch** (`user_prefs k='ktwatch'`, 3497/3503) → lyklað á `accountId`.
- **follows** (`user_prefs k='follows'`, /me 3194, /follows 3421) → lyklað á `accountId` (deildur Fyrirtækjavaktin-listi).
- **reports_granted / sub_service lestur** → `WHERE user_id=accountId(u)` (entitlements deildir).

## Scoping-ákvarðanir (⚠ staðfestu við spec-yfirferð)

**Deilt (account):** þrep/áskriftir/skýrslu-heimildir/kvóti · KYC-listi/audit/ack · ktwatch · follows.
**Per-notandi í v1 (EKKI account-scoped):** vakt/digest-**tilkynningastillingar** (`frettavakt`/`leitvakt`/`fastvakt`/`firmavakt`/`utbodvakt`/`digest`) + email-afhending → **eigandinn** stillir+fær account-tilkynningar; per-meðlims email-afhending = fast-follow. Rök: digest/vakt-cron (`worker.js:3691,3788,3796`) ítrar `user_prefs` per-röð; full account-scoping krefst cron-endurgerðar (dedup + hvaða email) — meiri áhætta, lítill v1-ávinningur. Meðlimir sjá deildu listana **í appinu**. Einnig per-notandi: `auth_tokens` (auth), persónuleg atkvæði (`bill_votes`/`spa_votes`/`poll_votes`).

**Grant-leiðir** (kaup): grants lenda á kaupanda-uid; billing er eiganda-haldið svo kaupandi=eigandi=account (checkout 1277, Áskell-stak 1661, webhook 1795, `grantSubD1`/`grantReportD1` um `_uidByKt`→eigandi). Jaðar: ef meðlimur kaupir stakt → grant á hans uid en lestur er account → ekki séð. v1: **grant líka á `accountId(kaupanda)`** svo kaup deilist (samræmi við „deila öllu").

## Team-UI

- **Eigandi:** „Team"-hluti í Mitt svæði (nýtir `/team`) — bæta/fjarlægja email (þak=`_seatsCap`), sér tengda + bíðandi (email á lista án tengds notanda enn).
- **Meðlimur:** borði „Þú ert í account [eigandi-email/nafn]"; fær aðgang; team-stjórn falin. Aðeins `parent_account_id IS NULL` sér team-stjórn.

## Jaðartilvik

- Email á mörgum team-listum → tengist fyrsta eiganda með laust sæti + virkt þrep.
- Meðlimur með EIGIN virkt þrep → `effectiveTier = hærra(eigin, account)` (tapar ekki sínu); `tier` (eigin) helst í /me.
- Eigandi missir þrep → meðlimir missa erfð réttindi (næsta /me: account-þrep óvirkt → falla í eigin þrep).
- Notandi getur ekki verið bæði eigandi (með sína meðlimi) OG meðlimur annars → v1: ef `parent_account_id` sett, hunsa hans eigin team-lista (flagga í plani).

## Öryggi/persónuvernd

- Meðlimur fær aðgang að account-gögnum (þ.m.t. KYC-viðskiptavinalisti stofu) — tilgangurinn (starfsfólk); eigandi ábyrgur fyrir team-lista. `kyc_audit.actor` = raun-notandinn → full rekjanleiki.
- DPA/DPIA (úr KYC-vöktun) nær yfir account-deilingu innan stofu (sömu ábyrgðaraðilar).

## Utan umfangs v1 (fast-follows)

Fínstillt hlutverk (admin/meðlimur/lesari) · invite-tákn/accept-flæði (v1=email-auto-link) · per-meðlims vakt/digest email-afhending + account-scoped vakt-config · `account_members`-index (v1=team-blobb skönnun) · margir account per notanda · per-sæti gjald.

## Prófun & sannreyning

- **Hrein resolver-próf** (nýtt `web/src/lib/account.mjs`? eða inline): `accountId(u)` (parent||id), `effectiveTier`-erfð (meðlimur með null-tier → account-þrep; með eigin-þrep → hærra). `node --test`.
- **Account-scope einangrun:** meðlimur A account-ins sér account-KYC-lista/ktwatch/follows; utanaðkomandi (annar account) sér EKKI.
- **Kvóta:** increment skrifar á eiganda (tveir meðlimir deila 20-skýrslu-potti, ekki 20 hvor).
- **Sæta-þak** virt (auto-link neitar við fullt þak). **Afskráning** hreinsar `parent_account_id` + aðgang.
- **Data-proxy:** meðlimur sér `/gogn/…` skýrslur sem eigandi keypti (4317 account-resolved).
- Græna hliðið: `astro build` + `node --check web/worker.js` + `node --test`.

## Opnar spurningar (leysast í plani)

1. Auto-link staðsetning: `authMeHandler` (link-on-/me, valið) vs register/login (3202-3227). /me er einfaldast (keyrir alltaf) en skrifar við hvert /me þar til tengt — nota `parent_account_id IS NULL`-vörð.
2. Öfug team-lookup skilvirkni: full `k='team'`-skönnun per /me fyrir ótengda notendur — í lagi við fáa notendur; `account_members`-index ef vex.
3. Nákvæm scoping vakt/digest (staðfest við yfirferð): v1 = per-notandi (eigandi fær account-tilkynningar) vs account-scoped config.
4. Splitta `userPayload` í `tier` (eigin) vs `effectiveTier` (account) án þess að brjóta núverandi neytendur (client notar nú þegar effectiveTier-first).
