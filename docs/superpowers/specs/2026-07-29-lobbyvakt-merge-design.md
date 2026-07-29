# Lobbývakt 2.0 — sameina leitarorðavakt (efnisvakt) — hönnunarskjal

**Dagsetning:** 2026-07-29
**Staða:** samþykkt hönnun (Aron), bíður spec-yfirferðar → útfærsluáætlun.

## 1. Markmið

Steypa **leitarorðavaktinni** (leitvakt — frí, fréttir) inn í **Lobbývaktina** (Fyrirtæki+, þingmál/samráð) undir sama nafni og URL (`/lobbyvakt/`). Ein „efnisvakt": eitt leitarorða-sett sem matchar þvert á **fréttir + þingmál + samráð**, ein síða, einn digest-kafli. Fasteignavakt + Fyrirtækjavakt haldast SÉR (sjálfstæðar vörur).

## 2. Val (úr brainstorm)

- **Gátun = tvö lög:** leitarorð → **fréttir** er ÁFRAM FRÍTT (innskráð, engin afturför); greinar + leitarorð → **þingmál/samráð + AI-brief** eru Fyrirtæki+.
- **Nafn:** halda „Lobbývakt" + `/lobbyvakt/` URL (engin rebrand/SEO-kostnaður), víkka lýsingu.

## 3. Gögn & lyklar (STAÐFEST í kóða)

- `lobbyvakt_ord` (user_prefs, per uid) = **sameinaða leitarorða-settið** framvegis. `lobbyvakt_greinar` = greinar (óbreytt).
- `leitvakt` (user_prefs) = `{ ord:[...] }` — GÖMLU leitarorðin. **Lesin áfram** (back-compat): frétta-matcher notar `ord = union(lobbyvakt_ord, leitvakt.ord)`. Engin eyðandi færsla; ný orð → `lobbyvakt_ord`.
- Fréttir: `newsSince(env, days, limit)` (worker.js:4195) → D1 `news` → `[{ title, url, source, date, ts, body }]`.
- Reglur: `augGet('lobbyvakt.json')` → `.items` (item-form í lobbyvakt.mjs hausum: `{id,kind:'thingmal'|'samrad',titill,hlekkur,greinar,brief,stig,frestur,stada,dags}`).

## 4. Arkitektúr — 4 lög

### 4.1 Hrein rökvél `web/src/lib/lobbyvakt.mjs` (viðbót, prófuð)

`export function matchNews(item, ord)` → `true` ef eitthvert `ord` (lágstafað) er hlutstrengur af `(item.title + ' ' + (item.body||item.text||'')).toLowerCase()`. Tómt `ord` → `false`. (Frétta-hliðstæða `matchKeyword`, sem les `titill/brief/efni` — fréttir bera `title/body`.)

### 4.2 Worker — þrepaskiptur `lobbyvaktHandler` (worker.js:2803)

FJARLÆGJA hörðu `_lobbyGate`-höfnun (lína 2809). Nýtt flæði:
1. `uid` (login-only; `!uid` → `{ok:false,error:'login'}`).
2. `ord = union(_prefGet('lobbyvakt_ord'), _prefGet('leitvakt').ord)`; `greinar = _prefGet('lobbyvakt_greinar')`.
3. `entitled = _lobbyGate(await accountOwner(env,u), now)`.
4. **Fréttir (frí):** `frettir = newsSince(env, 30, 500).filter(n => matchNews(n, ord)).slice(0, 30)`.
5. **Reglur (Fyrirtæki+):** `reglur = entitled ? feedFor(augGet('lobbyvakt.json').items, {greinar, ord}) : []`.
6. Skila `{ ok:true, entitled, greinar, ord, frettir, reglur, updated, needsSetup:(!ord.length && !greinar.length) }`.

Route `/api/lobbyvakt` óbreytt (2802-lína `_lobbyGate` skilgreining stendur — notuð fyrir `entitled`).

### 4.3 Síða `/lobbyvakt/` (`web/src/pages/lobbyvakt.astro`) — opnast innskráðum

- **Opnun:** ekki lengur heil-síðu Fyrirtæki+ gátt; opið innskráðum (client `auth`-hlið: innskráð → sýna, óinnskráð → innskráningar-hvatning).
- **Frítt lag:** leitarorða-innslátt (vistar `lobbyvakt_ord` um `POST /api/u/lobbyvakt-greinar {ord}`) + **frétta-straumur** (`frettir` úr svarinu; titill+hlekkur+heimild+dags).
- **Fyrirtæki+ lag:** greina-pillur + reglu-straumur (`reglur`: 📜/💬, brief, stig, frestur). Fyrir óréttindahafa (`entitled:false`) → **teaser/læst** með upsölu-CTA (Fyrirtæki+), fréttir standa.
- **Víkkuð lýsing/hero:** „Vaktaðu leitarorð og atvinnugreinar — fáðu fréttir, þingmál og samráðsmál sem snerta þig." `_esc` á öllu.

### 4.4 Vikuyfirlit (digest) — sameina tvo kafla í einn

Í `digestBuild` (worker.js): FJARLÆGJA sér-kaflann „🔎 Leitarorðin þín í fréttum vikunnar" (4059-4064) OG „🏛️ Reglur í pípunni" (4091-4107); í staðinn EINN kafli **„🏛️ Lobbývaktin þín"**:
- **Fréttir (öllum):** `union(leitvakt.ord, lobbyvakt_ord)` matchað við `sh.news` (`matchNews`), top ~6.
- **Reglur (aðeins entitled):** núverandi `_lobbyNew`-listi (reiknaður í `digestRun`) — EN nú **aðeins ef notandi er Fyrirtæki+**. `digestRun` (4120-lykkja) reiknar `entitled` per notanda (`_lobbyGate(accountOwner)`), sleppir reglu-reikningi ef ekki.
- Fyrirvari „⚠ Sjálfvirk túlkun, ekki lögfræðiráðgjöf" stendur á reglu-hlutanum.

### 4.5 Vaktir-síða (`web/src/pages/vaktir.astro`) — fella leitvakt inn

Standalone leitarorðavakt-kaflann → skipta út fyrir stutta vísun/hlekk á `/lobbyvakt/` („Leitarorðavaktin er nú hluti af Lobbývaktinni →"). Gömul `leitvakt`-gögn haldast (lesin í digest + endapunkti). Engin ný `leitvakt`-skrif úr þessari síðu.

## 5. Gating & persónuvernd

Fréttir = opinberar (RSS/fréttavél), frí (innskráð). Reglur = opinber þingmál/samráð, Fyrirtæki+ (feed + digest + brief). Engin ný PII. Gátt speglar `_lobbyGate` (account-based, `accountOwner`). Skrif á vaktir = login-only (óbreytt).

## 6. Villumeðferð

- `!env.TENGSL`/D1-villa → `.catch` → tómir listar (aldrei 500). Endapunktur alltaf HTTP 200 + `{ok:…}`.
- Enginn `ord`/`greinar` → `needsSetup:true` (síða sýnir uppsetningu). Engar fréttir/reglur → tómur straumur + hvatning.
- `lobbyvakt.json` vantar → `reglur:[]` (fréttir standa).

## 7. Prófun (grænt hlið)

- `node --test web/src/lib/lobbyvakt.test.mjs`: `matchNews` (title/body-match, tómt→false, case-insensitive) — bætt við ~29-próf settið.
- `node --check web/worker.js`.
- `cd web && npx astro build`.
- Live: óinnskráð `/api/lobbyvakt` → `{ok:false,error:'login'}`; innskráð FRÍTT → `{entitled:false, frettir:[...], reglur:[]}`; Fyrirtæki+ → `{entitled:true, frettir, reglur}`. Síða: frí sér fréttir + teased reglur; Fyrirtæki+ sér allt. Digest-þurrkeyrsla → einn sameinaður kafli.

## 8. Utan v1 (fast-follows)

Eftirlits-/byggingavaktir (næsta sameining — gera úr flettisíðum raun-vaktir), greina-vöktun (fer í Fyrirtækjavaktina), sameina `leitvakt.ord`→`lobbyvakt_ord` með einskiptis-migration (v1 = union-lestur), rauntíma-tilkynning (strax/daglegt) fyrir fréttir.

## 9. Skrár

- **Breytt:** `web/src/lib/lobbyvakt.mjs` (+`matchNews`), `web/src/lib/lobbyvakt.test.mjs` (+próf), `web/worker.js` (`lobbyvaktHandler` þrepun + digest-sameining í `digestBuild`/`digestRun`), `web/src/pages/lobbyvakt.astro` (opnun + frítt frétta-lag + teased reglur), `web/src/pages/vaktir.astro` (leitvakt-kafli → vísun).
- ⚠ Samhliða-session breytir `web/worker.js` → **hunk-stöguð git-add** (aldrei `git add web/worker.js`/`-A`); aðrar skrár berur `git add <slóð>`.
