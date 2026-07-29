# Strax-viðvörun við falli í 0-1 (heilbrigðiseftirlit) — hönnunarskjal

**Dagsetning:** 2026-07-29 · **Staða:** samþykkt (Aron: „allir sem vakta félagið"). Fast-follow á einkunn-átt (`dfa6c0a`).

## 1. Markmið

Fall í einkunn **0-1 (stöðvun/takmörkun)** er alvarlegt — vikubið er of löng. Senda **strax-póst** á þá sem vakta félagið, í stað þess að bíða mánudags-yfirlitsins.

## 2. Raunveruleikinn um „strax" (mikilvægt)

`eftirlit.json` er **skrapað daglega** (`build_eftirlit.js`, refresh-data 06:00 UTC; pípan skilar ~07:00-07:30). Raun-rauntími er því ómögulegur. Lausn: hengja á **3-tíma „critical"-rásina sem er þegar til** (`0 */3 * * *`, sama og `kycCriticalCron`) → viðvörun berst **innan ~2 klst frá því gögnin lenda** (09:00-keyrslan í síðasta lagi), sama morgun. Engin `wrangler.toml`-breyting.

## 3. Arkitektúr

### 3.1 Hrein `criticalDrop(prev, cur)` — `web/src/lib/vaktir-signals.mjs`

Byggir á `ratingMovement`: skilar `mv` ef `mv.dir==='down' && mv.to<=1`, annars `null`. Prófuð (4→1 ✓, 1→0 ✓, 4→2 ✗, 0→3 ✗, engin saga ✗).

### 3.2 Worker `eftirlitCriticalCron(env)`

Þrjú skref, í ÞESSARI röð:
1. **Greina (global per uuid):** vaktendur úr `user_prefs k='firmavakt'` (JOIN users f. netfang, krefst `fv.on`) → `byKt[kt]=Set(email)`. Fyrir hvern stað í `eftirlit.json` með vaktað kt: `prev` úr **`eftirlit_crit`** (ný D1: uuid PK, kt, rating, ts — **EIGIN grunnlína**, snertir EKKI `eftirlit_last` svo vikulega díffið raskist ekki) → `criticalDrop` → `drops[kt]`.
2. **Fan-out:** einn póstur per notanda með ÖLLUM hans föllum (`sendGmail`, eins og `kycSendAlert`).
3. **Merkja (LOKS):** UPSERT allar athuganir í `eftirlit_crit`. ⚠ Röðin skiptir máli — ef merkt væri á undan fan-out myndi fyrsti notandi „stela" viðvöruninni frá hinum sem vakta sama félag.

Fyrsta keyrsla **sáir** (ekkert `prev` → `criticalDrop`=null) → engin sprenging af gömlum 0-1.

## 4. Gátt & persónuvernd

`firmavakt.on` = samþykkið (speglar `kycCriticalCron`); ÓHÁÐ `digest.on` (önnur rás). Opinber HER-gögn. Pósturinn segir hvers vegna hann barst + hlekk á /vaktir/. `sendGmail` er secret-gated (án Gmail-secrets → `{unconfigured:true}`, brotnar ekki).

## 5. Villumeðferð

`!env.TENGSL` / engin gögn → `{sent:0}` (engin villa). D1 `.catch`. Ógilt netfang → sleppt. Enginn vaktandi → snemm-út.

## 6. Prófun

`node --test vaktir-signals.test.mjs` (criticalDrop) · `node --check web/worker.js` · `astro build`. Live: cron-only (Aron staðfestir; fyrsta keyrsla sáir).

## 7. Skrár

`web/src/lib/vaktir-signals.mjs` (+`criticalDrop`) · `.test.mjs` · `web/worker.js` (`eftirlitCriticalCron` + hengt á 3-tíma keðjuna). ⚠ hunk-stöguð git-add á worker.js.
