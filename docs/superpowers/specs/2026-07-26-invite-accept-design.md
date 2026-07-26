# Invite/accept fyrir firma-account — Hönnun

**Dagsetning:** 2026-07-26
**Staða:** Samþykkt hönnun (brainstorming), tilbúið fyrir writing-plans.
**Tengt:** fast-follow úr [[karp-firma-account]] — lokar samþykkis-gatinu sem opus-lokarýni flaggaði (I-2: meðlimur fékk write-aðgang að sameiginlegri KYC-audit án samþykkis).

## Markmið

Bæta **samþykkis-skrefi** við firma-account: team-meðlimur fær EKKERT (ekkert erft þrep, engin gagna-deiling) fyrr en hann **samþykkir** boðið — í stað sjálfvirkrar tengingar (`_autoLinkAccount`) við innskráningu.

## Læstar ákvarðanir (brainstorming)

1. **Í-appi samþykki** — notandi á team-lista sér boð í Mitt svæði við innskráningu, samþykkir/hafnar. Engin email/token-infra (email-boð = fast-follow).
2. Pending (óaccepterað) → meðlimur fær **ekkert** þrep/gögn.
3. Höfnun **sticky** per (meðlimur, eigandi); v1 endurstillir ekki sjálfkrafa.
4. Eigandi sér stöðu (pending/active); **höfnun EKKI sýnd eiganda** (persónuvernd meðlimsins).

## Núverandi ástand (firma-account v1, byggt)

`authMeHandler` (`web/worker.js`) kallar `_autoLinkAccount(env,u,now)` sem SJÁLFKRAFA setur `parent_account_id` ef `u.email` er á virkum `/team`-lista eiganda. `accountId(u)=parent_account_id||id`; réttindi/gögn resolve-ast gegnum eiganda. `/team` (`/api/u/team`) geymir boðin netföng í `user_prefs k='team'`. `_prefGet`/`_prefSet` fyrir user_prefs-blobba. `_seatsCap(owner,now)` = sæta-þak.

## Breytingar

### 1. `authMeHandler`: auto-set → pending surface
- **Fjarlægja** sjálfvirku `parent_account_id`-setninguna úr `_autoLinkAccount` (eða skipta fallinu út). Meðlimur er EKKI tengdur við innskráningu lengur.
- Í staðinn: ef `parent_account_id` er null OG `u.email` er á virkum team-lista eiganda (virkur eigandi + laust sæti) OG `owner_id` er EKKI í `invite_declined`-pref meðlimsins → setja `p.pendingInvite = { owner_id, owner: eigandi.nafn||email }`.
- (Ef fleiri en eitt boð: skila fyrsta gilda — v1.) Meðan pending: `effectiveTier`/subs/gögn = meðlimsins eigin (ekki eigandans) því `parent_account_id` er ósett.
- Unlink-on-stale (þegar `parent_account_id` er sett en email dottið af lista) helst óbreytt.

### 2. Nýir endapunktar (í `userDataHandler`, `/api/u/*`)
- **`POST /api/u/invite/accept {owner_id}`** — staðfestir: `u.email` er á `team`-lista eiganda `owner_id` + eigandi með virkt þrep + laust sæti (`COUNT parent_account_id=owner_id < _seatsCap`). Ef gilt → `UPDATE users SET parent_account_id=owner_id WHERE id=uid`. (= gömlu auto-link-rökin, nú á bak við samþykki.) Skila `{ok:true}` eða villu (`notfound`/`cap`/`inactive`).
- **`POST /api/u/invite/decline {owner_id}`** — bæta `owner_id` í `_prefGet/_prefSet(uid,'invite_declined',[])`. Skila `{ok:true}`.

### 3. `/team` GET: staða per netfang
- Fyrir hvert netfang á listanum: `active` ef til notandi með `parent_account_id=owner.id` OG `email` = netfangið; annars `pending`. Skila `members: [{email, status}]` (eða samhliða `active`-lista). **Höfnun ekki reiknuð/sýnd** (privacy).

### 4. UI (`web/src/pages/mitt-svaedi.astro`)
- **Meðlimur:** ef `u.pendingInvite` → boð-borði efst („Stofan **{owner}** bauð þér í account sitt — þú munt deila gögnum og erfa þrep. **Samþykkja** / **Hafna**"). Samþykkja→`POST /api/u/invite/accept`, Hafna→`/decline`, svo endurhlaða.
- **Eigandi:** `#team-box` sýnir stöðu-merki per netfang („virk(ur)"/„bíður samþykkis").

### 5. Sæta-þak
Fært yfir á **accept-augnablikið** (ekki auto-link). `/team` POST heldur áfram að takmarka fjölda boðinna netfanga við þak (óbreytt).

## Utan umfangs v1 (fast-follows)
Email-boð með tákni (virkar áður en meðlimur á aðgang) · höfnun endurstillanleg í UI · eigandi sér „hafnaði"-stöðu · margir samtímis-boð valmynd.

## Prófun & sannreyning
- Pending gefur **ekkert** (meðlimur með ósett `parent_account_id` fær eigin þrep, ekki eigandans) — regression-vörn gegn auto-link.
- `accept` setur `parent_account_id` + virðir sæta-þak (hafnar ef fullt).
- `decline` → `invite_declined` → ekkert endur-prompt á næsta /me.
- `/team` GET skilar réttri active/pending stöðu.
- Einangrun: accept virkar aðeins ef email raunverulega á team-lista þess eiganda.
- Græna hliðið: `astro build` + `node --check web/worker.js` + `node --test`.

## ⚠ Staðfesti í plani (kóða)
Nákvæm staðsetning `_autoLinkAccount` + `authMeHandler` (línur hnikuðust eftir firma-account); `userDataHandler`-dispatch fyrir nýju `/invite/*` path-a; `/team`-handler; `_prefGet`/`_prefSet`.
