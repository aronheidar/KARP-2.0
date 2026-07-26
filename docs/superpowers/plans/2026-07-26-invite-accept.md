# Invite/accept fyrir firma-account — Útfærsluáætlun

> **Fyrir agentíska verkamenn:** NAUÐSYNLEG UNDIR-SKILL: superpowers:subagent-driven-development. Skref nota gátreiti (`- [ ]`).

**Markmið:** team-meðlimur samþykkir boð áður en hann tengist account-i (fær ekkert erft þrep/gögn fyrr). Lokar samþykkis-gati firma-account v1.

**Arkitektúr:** skipta sjálfvirka `_autoLinkAccount` út fyrir `_pendingInvite` (surfacar boð, tengir EKKI); nýir `/api/u/invite/accept|decline`; `/team` GET fær stöðu-kort; UI-borði. Byggir á firma-account (`parent_account_id`/`accountId`).

**Tæknistakkur:** Cloudflare Worker (`web/worker.js`), D1 `TENGSL`, Astro. Node 22.

## Global Constraints
- Græna hliðið: `npx astro build` (úr web/) + `node --check web/worker.js` + `node --test`.
- **Pending = ekkert:** meðlimur með ósett `parent_account_id` fær EIGIN þrep/gögn (ekki eigandans) — engin auto-tenging lengur.
- Accept virðir sæta-þak (`_seatsCap`) og að email sé raunverulega á team-lista þess eiganda. Höfnun í `user_prefs k='invite_declined'` (fylki owner_id).
- Höfnun EKKI sýnd eiganda (privacy). Commit strax eftir hverja skrá (automation-reset). Aðeins listaðar skrár.
- Núverandi ankeri: `authMeHandler` L3183 (kallar `_autoLinkAccount` L3189, setur `p.membership` L3213), `_autoLinkAccount` L3410, `_prefGet`/`_prefSet` L3398+, `userDataHandler` L3445 (dispatch á `path=url.pathname.replace(/^\/api\/u/,'')`), `/team` L3572, `_seatsCap` L3397.

---

### Task 1: Worker — `_pendingInvite` + authMe (fjarlægja auto-tengingu)

**Files:** Modify `web/worker.js`

**Interfaces:** Produces `_inviteEligible(env,u,ownerId,now)` (skilar owner-röð eða null) + `_pendingInvite(env,u,now)` (skilar `{owner_id,owner}` eða null) fyrir Task 2. `/me` skilar `p.pendingInvite`.

- [ ] **Step 1: Skipta `_autoLinkAccount` (L3410) út fyrir tvö föll:**
```js
// Er u boðið af ownerId (email á team-lista + eigandi virkur + laust sæti)? Skilar owner-röð eða null.
async function _inviteEligible(env, u, ownerId, now) {
  const owner = await env.TENGSL.prepare('SELECT id,email,name,is_admin,tier,tier_until FROM users WHERE id=?').bind(ownerId).first().catch(() => null);
  if (!owner || owner.id === u.id) return null;
  const ownerActive = owner.is_admin === 1 || (owner.tier && owner.tier_until > now);
  if (!ownerActive) return null;
  const team = await _prefGet(env, owner.id, 'team', []);
  if (!Array.isArray(team) || team.indexOf((u.email || '').toLowerCase()) < 0) return null;
  const cap = _seatsCap(owner, now);
  const n = (await env.TENGSL.prepare('SELECT COUNT(*) AS n FROM users WHERE parent_account_id=?').bind(owner.id).first().catch(() => ({ n: 0 }))).n || 0;
  if (cap >= 0 && n >= cap) return null;
  return owner;
}
// Fyrsta gilda boðið f. u sem er EKKI hafnað; null ef ekkert. Tengir EKKI.
async function _pendingInvite(env, u, now) {
  if (!u || u.parent_account_id) return null;
  const declined = await _prefGet(env, u.id, 'invite_declined', []);
  const rows = (await env.TENGSL.prepare("SELECT user_id FROM user_prefs WHERE k='team'").all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) {
    if (declined.indexOf(r.user_id) >= 0) continue;
    const owner = await _inviteEligible(env, u, r.user_id, now);
    if (owner) return { owner_id: owner.id, owner: owner.name || owner.email };
  }
  return null;
}
```

- [ ] **Step 2: `authMeHandler` — fjarlægja auto-tengingu, bæta pendingInvite.**
  - Fjarlægja línu `await _autoLinkAccount(env, u, now);` (L3189). **Halda** unlink-on-stale blokkinni (fyrir þegar-tengda meðlimi).
  - Á eftir `p.membership = …` (L3213) bæta: `p.pendingInvite = u.parent_account_id ? null : await _pendingInvite(env, u, now);`

- [ ] **Step 3: Sannreyna + commit**
```bash
node --check web/worker.js
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/worker.js && git commit -m "invite/accept: _pendingInvite (fjarlaegja auto-tengingu, surface bod i /me)"
```
Expected: `node --check` exit 0. **⚠ Þessi commit ein og sér slekkur á auto-tengingu — meðlimir tengjast ekki fyrr en accept-endapunktur (Task 2) er til; í lagi þar sem báðir fara saman í deploy.**

---

### Task 2: Worker — `/invite/accept` + `/invite/decline` + `/team` staða

**Files:** Modify `web/worker.js` (í `userDataHandler`)

**Interfaces:** Consumes `_inviteEligible`, `_prefGet`/`_prefSet`, `readSession`, `_ajson`.

- [ ] **Step 1: Bæta path-greinum í `userDataHandler`** (nálægt `/team`, L3572; `uid`/`method`/`body`/`now` eru til í fallinu):
```js
  if (method === 'POST' && path === '/invite/accept') {
    if (!uid) return _ajson({ ok: false, error: 'login' });
    const u = await env.TENGSL.prepare('SELECT id,email,parent_account_id FROM users WHERE id=?').bind(uid).first().catch(() => null);
    if (!u) return _ajson({ ok: false, error: 'login' });
    if (u.parent_account_id) return _ajson({ ok: false, error: 'already' });
    const owner = await _inviteEligible(env, u, parseInt(body.owner_id, 10), now);
    if (!owner) return _ajson({ ok: false, error: 'invalid' });
    await env.TENGSL.prepare('UPDATE users SET parent_account_id=? WHERE id=?').bind(owner.id, uid).run().catch(() => {});
    return _ajson({ ok: true, owner: owner.name || owner.email });
  }
  if (method === 'POST' && path === '/invite/decline') {
    if (!uid) return _ajson({ ok: false, error: 'login' });
    const ownerId = parseInt(body.owner_id, 10);
    const declined = await _prefGet(env, uid, 'invite_declined', []);
    if (declined.indexOf(ownerId) < 0) { declined.push(ownerId); await _prefSet(env, uid, 'invite_declined', declined); }
    return _ajson({ ok: true });
  }
```

- [ ] **Step 2: `/team` GET — bæta stöðu-korti** (án þess að brjóta núverandi `members`-fylki). Í `/team`-handler, í GET-svarinu, bæta `status`-korti (email→'active'/'pending'); 'active' = til notandi með `parent_account_id=uid` og það email:
```js
    // í /team GET, á undan return:
    const activeSet = new Set(((await env.TENGSL.prepare('SELECT email FROM users WHERE parent_account_id=?').bind(uid).all().catch(() => ({ results: [] }))).results || []).map((r) => (r.email || '').toLowerCase()));
    const status = {}; for (const e of members) status[e] = activeSet.has(e) ? 'active' : 'pending';
    return _ajson({ members, cap, status });
```
(Ef `/team` GET og POST deila `return _ajson({members,cap})` — bæta `status` aðeins við GET-svarið; POST má skila `{ok,members,cap}` óbreytt.)

- [ ] **Step 3: Sannreyna + commit**
```bash
node --check web/worker.js
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/worker.js && git commit -m "invite/accept: /api/u/invite/accept|decline + /team stada-kort"
```

---

### Task 3: UI — boð-borði (meðlimur) + staða-merki (eigandi)

**Files:** Modify `web/src/pages/mitt-svaedi.astro`

- [ ] **Step 1: Lesa** núverandi `mitt-svaedi.astro` (client-script m/`u`/`karpGet`/`karpPost`, `#team-box`/`renderTeam(u)`, `#gate-note`). Bæta:
  - **Meðlima-boð:** ef `u.pendingInvite` (og EKKI `u.membership`), sýna borða efst í dash (t.d. í `#gate-note` eða nýjum reit):
```js
    if (u.pendingInvite) {
      gate.innerHTML = `<div class="gate">Stofan <b>${esc(u.pendingInvite.owner)}</b> bauð þér í account sitt — þú munt deila gögnum og erfa þrep. <button id="inv-yes">Samþykkja</button> <button id="inv-no">Hafna</button></div>`;
      document.getElementById('inv-yes').onclick = async () => { await karpPost('/invite/accept', { owner_id: u.pendingInvite.owner_id }); location.reload(); };
      document.getElementById('inv-no').onclick = async () => { await karpPost('/invite/decline', { owner_id: u.pendingInvite.owner_id }); location.reload(); };
    }
```
  - **Eigandi-staða:** í `renderTeam(u)`, þar sem netföng eru teiknuð, bæta merki úr `d.status[email]` („virk(ur)" ef 'active', annars „bíður samþykkis"). Sækja `status` úr `/team`-svarinu (`d.status`).

- [ ] **Step 2: Build + commit**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt/web" && npx astro build
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt" && git add web/src/pages/mitt-svaedi.astro && git commit -m "invite/accept: bod-bordi (medlimur) + stada-merki (eigandi) i Mitt svaedi"
```
Expected: build grænt.

---

### Task 4: Loka-sannreyning

- [ ] **Step 1: Fulla græna hliðið**
```bash
cd "C:/Users/aronh/dev/KARP/mitt-svaedi-wt/web" && npx astro build && cd .. && node --check web/worker.js && node --test web/src/lib/account.test.mjs && node --test web/src/lib/kyc.test.mjs
```
Expected: build OK, check 0, próf PASS (engin regression í account/kyc).

- [ ] **Step 2: Handoff-nóta:** engin ný migration (nýtir `user_prefs`). Deploy = push (Aron/automation). Firma-account migration `0010` þarf samt f. `parent_account_id`.

---

## Self-Review
**Spec-þekja:** pending-surface (auto-tenging burt) ✓T1 · accept/decline endapunktar + /team staða ✓T2 · UI-borði+merki ✓T3 · græna hliðið ✓T4.
**Opnar leystar:** fyrsta gilda boð (v1); höfnun sticky í `invite_declined`; /team skilar `status`-korti án að brjóta `members`.
**Type-samræmi:** `_inviteEligible` skilar owner-röð, notað eins í `_pendingInvite` (T1) og accept (T2); `pendingInvite={owner_id,owner}` samræmt við UI (T3).
**⚠ Verkamaður staðfestir:** að `/team` GET og POST deili ekki return-línu þannig að `status` lendi óvart á POST (bæta aðeins við GET); að `esc()` sé til í mitt-svaedi.astro (var notað í firma-account Task 6).
