# Þrepa-áskriftarvél (Fyrirtækjalausnir Verk B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge the 3 tiers (Grunnur/Fyrirtæki/Fyrirtæki+) via Áskell and gate features by a tier hierarchy, by extending the existing per-service Áskell flow to per-tier.

**Architecture:** Tier level replaces per-service subs. `lausnir.js` holds the pure tier logic (`TIER_LVL`, `tierLevelOf`) — node-testable and shared. `auth.js` wraps it (`tierLevel`/`hasTier`/`lockedTier`/`tierGate`) and wires `karpSubscribeTier` into the same kt→checkout-session→`Askell.mountCheckout`→webhook-grant flow as `karpAskellSubscribe`. Worker `askellSessionHandler`/`askellWebhookHandler` swap `service` for `tier`. `/frettir/` + `/utbod/` re-gate from `subGate(service)` to `tierGate(minTier)`. karp-user.php stores `karp_tier` + `karp_tier_until`. Everything secret-gated; nothing goes live until Aron creates 3 Áskell plans.

**Tech Stack:** Astro SSG, Cloudflare Worker (`web/worker.js`), vanilla JS ESM, WordPress REST (`wordpress/karp-user.php` via WPCode), `node --test`.

## Global Constraints

- **Replace, don't dual-run:** per-service `frettir`/`utbod` subs are removed (no real subscribers — confirmed). Remove `isSub`/`lockedSvc`; any lingering `karp_sub_*_until` in WP simply expires.
- **Tier slugs (verbatim):** `grunnur`=1, `fyrirtaeki`=2, `fyrirtaeki_plus`=3. `TIER_LVL = { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 }`. Admin → level 99.
- **v1 gated features (binary):** `/utbod/` minTier 1 · Fyrirtækjavaktin (follow) minTier 1 · `/frettir/` minTier 2 · viðskiptamannavakt minTier 2. One-off reports (fyrirtaeki/eigendur/fasteign) stay **990 kr for everyone** (Teya, unchanged). Free vaktir stay free.
- **Secret-gated:** without `ASKELL_PRIVATE_KEY` / `ASKELL_CHANNEL_*`, `askellSessionHandler` returns `{error:'unconfigured'}` and the tier button shows a gentle message — nothing breaks.
- **Access opens on webhook only** (server-side `subscription_contract` → `/sub/grant`), never on `onSuccess` alone.
- **Secrets = Cloudflare Secrets (Encrypt)**, never plain-text (wrangler wipes vars), never in commits.
- **Out of scope (v1.1):** report quota (5/20), numeric limits (follow 10/50, kt 25/100), tier upgrade/downgrade.
- **Verification (no pytest):** `node --test` for pure tier logic; `npm run build` (from `web/`) + `node --check` for the rest. Live checkout test is gated on Aron's Áskell setup — the final task is a hand-off checklist, not a payment.
- **karp-user.php** is applied by Aron on wp.karp.is (WPCode). This plan updates the repo copy AND flags the manual re-paste.
- **Commit after each task**, on a feature branch (created at execution start), merged by Aron.

---

## File Structure

**Modify:**
- `web/src/data/lausnir.js` — add `TIER_LVL` + `tierLevelOf(tier, isAdmin)` (pure) + `minTier` on gated `EIGINDIR` rows.
- `web/src/lib/auth.js` — import `tierLevelOf`; add `tierLevel`/`hasTier`/`lockedTier`/`tierGate`; rewire `karpSubscribeTier`; remove `isSub`/`lockedSvc`; `u.tier` replaces `u.subs`; update `window.karpAuth`.
- `web/worker.js` — `askellSessionHandler` (tier) `:1154`; `askellWebhookHandler` (tier grant) `~:1090`.
- `web/src/pages/frettir.astro:1096-1104` — `lockedSvc('frettir')`/`subGate` → `lockedTier(2)`/`tierGate`.
- `web/src/pages/utbod.astro:360-368` — `lockedSvc('utbod')`/`subGate` → `lockedTier(1)`/`tierGate`.
- `wordpress/karp-user.php` — `/me` tier; `/sub/subscribe` tier; `/sub/grant` tier; `/sub/trial` tier (L104, L205, L225, L291).

**Create:**
- `web/test/tier.test.mjs` — unit tests for `tierLevelOf`.

---

## Task 1: Pure tier logic in `lausnir.js` + unit test

**Files:**
- Modify: `web/src/data/lausnir.js`
- Create: `web/test/tier.test.mjs`

**Interfaces:**
- Produces: `export const TIER_LVL`, `export function tierLevelOf(tier, isAdmin)`. Consumed by Task 2 (auth.js) + tests.

- [ ] **Step 1: Write the failing test**

Create `web/test/tier.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { tierLevelOf, TIER_LVL } from '../src/data/lausnir.js';

test('tierLevelOf maps slugs to levels', () => {
  assert.equal(tierLevelOf('grunnur', false), 1);
  assert.equal(tierLevelOf('fyrirtaeki', false), 2);
  assert.equal(tierLevelOf('fyrirtaeki_plus', false), 3);
});
test('tierLevelOf: none/unknown = 0', () => {
  assert.equal(tierLevelOf(null, false), 0);
  assert.equal(tierLevelOf('bogus', false), 0);
  assert.equal(tierLevelOf(undefined, false), 0);
});
test('tierLevelOf: admin = 99 regardless of tier', () => {
  assert.equal(tierLevelOf(null, true), 99);
  assert.equal(tierLevelOf('grunnur', true), 99);
});
test('TIER_LVL is the ordered map', () => {
  assert.deepEqual(TIER_LVL, { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run (from `web/`): `node --test test/tier.test.mjs`
Expected: FAIL — `tierLevelOf` is not exported.

- [ ] **Step 3: Add the tier logic to `lausnir.js`**

At the top of `web/src/data/lausnir.js` (after the opening comment, before `export const THREP`), add:
```js
// Þrep-stigveldi: eitt þrep per notandi. Hrein rökvísi hér (node-prófanleg) — auth.js vefur.
export const TIER_LVL = { grunnur: 1, fyrirtaeki: 2, fyrirtaeki_plus: 3 };
export function tierLevelOf(tier, isAdmin) { return isAdmin ? 99 : (TIER_LVL[tier] || 0); }
```

- [ ] **Step 4: Add `minTier` to the gated EIGINDIR rows**

In `web/src/data/lausnir.js`, in the `EIGINDIR` array, add `minTier` to the four gated rows (leave the others unchanged — informational only):
```js
  { titill: 'Fyrirtækjavaktin (fylgja félögum)', gildi: ['10 félög', '50 félög', 'ótakmarkað'], minTier: 1 },
  { titill: 'Viðskiptamannavakt (kt-vöktun)', gildi: [false, '25 kt', '100 kt'], minTier: 2 },
  { titill: 'Fjölmiðlavakt', gildi: [false, true, true], minTier: 2 },
  { titill: 'Opnar vaktir (útboð, styrkir, Lögbirting, vörumerki, skip…)', gildi: [true, true, true], minTier: 1 },
```
(Match each on its existing `titill`; add the `minTier` key. Do not change `gildi`.)

- [ ] **Step 5: Run test, verify it passes**

Run (from `web/`): `node --test test/tier.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/data/lausnir.js web/test/tier.test.mjs
git commit -m "Verk B: threp-stigveldi rokvisi (TIER_LVL/tierLevelOf) + minTier a EIGINDIR + prof"
```

---

## Task 2: Tier entitlement + gate in `auth.js`

**Files:**
- Modify: `web/src/lib/auth.js`

**Interfaces:**
- Consumes: `tierLevelOf`, `TIER_LVL` (Task 1).
- Produces: `tierLevel(u)`, `hasTier(min)`, `lockedTier(min)`, `tierGate(el, {minTier,title,blurb})`. Consumed by Tasks 3, 6. Removes `isSub`, `lockedSvc`.

- [ ] **Step 1: Add the import**

At the top of `web/src/lib/auth.js` (with the other module-level code, before the exports), add:
```js
import { tierLevelOf } from '../data/lausnir.js';
const TIER_NAME = { 1: 'Grunnur', 2: 'Fyrirtæki', 3: 'Fyrirtæki+' };
```

- [ ] **Step 2: Replace the per-service entitlement (lines ~127-131)**

Replace this block:
```js
// Per-þjónustu ÁSKRIFT (LOTA 100): tvær aðskildar mánaðaráskriftir — 'frettir' (Fjölmiðlagreining/
// Vöktun & umfjöllun) og 'utbod' (Útboðsvaktin), 3.490 kr/mán hvor. u.subs = { frettir:bool, utbod:bool }
// (admin = allt). lockedSvc(service) = greiðsluveggur virkur OG notandi ekki áskrifandi/admin.
export function isSub(service) { const u = _u(); return u.isAdmin === true || (u.subs && u.subs[service] === true); }
export function lockedSvc(service) { return _u().paywall === true && !isSub(service); }
```
with:
```js
// Þrep-áskrift (Verk B): eitt þrep per notandi (u.tier ∈ grunnur|fyrirtaeki|fyrirtaeki_plus), stigveldi.
// hasTier(min) = notandi (eða admin) hefur a.m.k. þrep-stig `min` (1|2|3). lockedTier = veggur virkur OG ekki nógu hátt þrep.
export function tierLevel(u) { u = u || _u(); return tierLevelOf(u.tier, u.isAdmin === true); }
export function hasTier(min) { return tierLevel() >= min; }
export function lockedTier(min) { return _u().paywall === true && !hasTier(min); }
```

- [ ] **Step 3: Add `tierGate` (right after `subGate`, replacing `subGate`'s body is NOT needed — keep subGate removed in Step 5; add tierGate here)**

Add this function immediately before the existing `subGate` definition (line ~182):
```js
// Þrep-gátt: teaser þegar efni krefst hærra þreps. Trektar á /karp-pro/ (þar sem VerdTafla sér um checkout).
export function tierGate(el, opts) {
  if (!el) return; injectGateCss(); opts = opts || {};
  const need = TIER_NAME[opts.minTier] || 'Karp+'; const u = _u();
  el.innerHTML = '<div class="plus-gate"><div class="pg-badge">⭐ ' + esc(need) + '-þrep</div>'
    + '<h2 class="pg-h">' + esc(opts.title || 'Hluti af Karp+') + '</h2>'
    + '<p class="pg-b">' + esc(opts.blurb || '') + '</p>'
    + '<div class="pg-btns"><a class="pg-main" href="/karp-pro/#verd">Sjá þrep & verð</a>'
    + (u.loggedIn ? '' : '<a class="pg-sec" href="' + esc(loginHref()) + '">Skrá inn</a>')
    + '</div><div class="pg-note">Innifalið í ' + esc(need) + '-þrepi Karp+. Fyrsti mánuður frír.</div></div>';
}
```

- [ ] **Step 4: Remove `subGate` (lines ~181-194)**

Delete the entire `subGate` function (the block starting `// Per-þjónustu áskriftar-gátt (LOTA 100).` through its closing `}` that ends with `if (b) b.onclick = () => karpAskellSubscribe(svc, el); }`). Its only callers (frettir/utbod) are rewired in Task 6.

- [ ] **Step 5: Update the `window.karpAuth` registry (line ~248)**

In the `window.karpAuth = { ... }` object literal: remove `isSub, lockedSvc, subGate`; add `hasTier, lockedTier, tierGate, tierLevel`. (Leave `karpAskellSubscribe` — Task 3 reuses its flow; `karpSubscribeTier` is already present.)

- [ ] **Step 6: Verify it parses**

Run (from repo root): `node --check web/src/lib/auth.js`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/auth.js
git commit -m "Verk B: threp-entitlement i auth.js (tierLevel/hasTier/lockedTier/tierGate); fjarlaegja isSub/lockedSvc/subGate"
```

---

## Task 3: Wire `karpSubscribeTier` into the real checkout flow

**Files:**
- Modify: `web/src/lib/auth.js`

**Interfaces:**
- Consumes: `loadAskellJs`, `karpPost` (existing). Mirrors `karpAskellSubscribe`.
- Produces: working `karpSubscribeTier({slug,nafn,btn})` that opens the Áskell embedded checkout for a tier. Consumed by `VerdTafla.astro` (already calls it).

- [ ] **Step 1: Replace the placeholder `karpSubscribeTier`**

Replace the current placeholder body (the `karpSubscribeTier` added in Verk A that shows an alert) with:
```js
// Þrep-áskrift: opnar Áskell embedded checkout fyrir valið þrep. Sami dans og karpAskellSubscribe (kt →
// /sub/subscribe → /api/sub/checkout-session?tier= → Askell.mountCheckout). Aðgangur opnast við vefkrók.
export async function karpSubscribeTier({ slug, nafn, btn }) {
  const u = _u();
  if (!u.loggedIn) { location.href = loginHref(); return; }
  injectGateCss();
  // Setur einfaldan kt-innslátt + checkout beint í hnappinn (nafn = þrep-heiti).
  const host = btn && btn.closest ? (btn.closest('th') || btn.parentElement) : null;
  const box = document.createElement('div'); box.className = 'sg-checkout'; box.style.marginTop = '10px';
  box.innerHTML = '<input type="text" class="sg-kt" placeholder="Kennitala (10 tölur)" maxlength="11" inputmode="numeric" autocomplete="off" style="width:150px" />'
    + '<button type="button" class="pg-main" style="margin-top:8px">Halda áfram →</button><div class="sg-err" hidden></div>';
  if (host) { host.appendChild(box); } else if (btn) { btn.after(box); }
  if (btn) btn.disabled = true;
  const ktIn = box.querySelector('.sg-kt'), go = box.querySelector('button'), err = box.querySelector('.sg-err');
  if (ktIn) ktIn.focus();
  const fail = (m) => { err.hidden = false; err.textContent = m; };
  go.onclick = async () => {
    const kt = String(ktIn.value || '').replace(/\D/g, '');
    if (kt.length !== 10) return fail('Sláðu inn gilda 10 stafa kennitölu.');
    go.disabled = true; go.textContent = 'Opna greiðslu…'; err.hidden = true;
    try {
      await karpPost('/sub/subscribe', { tier: slug, kt });
      const d = await (await fetch('/api/sub/checkout-session?tier=' + encodeURIComponent(slug) + '&kt=' + kt, { credentials: 'include' })).json();
      if (!d || !d.token) throw new Error(d && d.error === 'unconfigured' ? 'Áskrift ekki virkjuð enn — reyndu síðar.' : 'nosession');
      await loadAskellJs();
      box.innerHTML = '<div id="askell-checkout-' + esc(slug) + '" class="sg-checkout"></div>';
      window.Askell.mountCheckout('#askell-checkout-' + slug, {
        baseUrl: 'https://askell.is', sessionToken: d.token, language: 'is', colorScheme: 'auto',
        onSuccess() { box.innerHTML = '<div class="pg-note">✅ Takk! Aðgangurinn opnast eftir augnablik…</div>'; setTimeout(() => location.reload(), 3500); },
        onError() { fail('Villa kom upp í greiðslu — reyndu aftur.'); },
      });
    } catch (e) {
      go.disabled = false; go.textContent = 'Halda áfram →';
      fail(e && typeof e.message === 'string' && e.message.length < 60 ? e.message : 'Ekki tókst að opna greiðslu — reyndu aftur.');
    }
  };
}
```

- [ ] **Step 2: Verify it parses**

Run (from repo root): `node --check web/src/lib/auth.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/auth.js
git commit -m "Verk B: vira karpSubscribeTier i Askell embedded checkout (per threp)"
```

---

## Task 4: Worker `askellSessionHandler` — tier

**Files:**
- Modify: `web/worker.js:1154-1172`

**Interfaces:**
- Consumes: `env.ASKELL_PRIVATE_KEY`, `env.ASKELL_CHANNEL_GRUNNUR|FYRIRTAEKI|FYRIRTAEKI_PLUS`.
- Produces: `/api/sub/checkout-session?tier=&kt=` → `{ token }`. Webhook (Task 5) reads `metadata.tier`.

- [ ] **Step 1: Replace the service logic with tier logic**

In `askellSessionHandler`, replace lines 1156-1161 (from `const u = new URL...` through the `metadata` body + customer_reference) with:
```js
  const u = new URL(request.url);
  const TIERS = { grunnur: 'ASKELL_CHANNEL_GRUNNUR', fyrirtaeki: 'ASKELL_CHANNEL_FYRIRTAEKI', fyrirtaeki_plus: 'ASKELL_CHANNEL_FYRIRTAEKI_PLUS' };
  const tier = TIERS[u.searchParams.get('tier')] ? u.searchParams.get('tier') : 'grunnur';
  const kt = String(u.searchParams.get('kt') || '').replace(/\D/g, '');
  const channel = env[TIERS[tier]] || tier;   // sjálfgefið = þrep-slug → aðeins ASKELL_PRIVATE_KEY skylt
  const body = { sales_channel: channel, expires_in_seconds: 1800, metadata: { tier } };   // metadata.tier → vefkrókur veit þrepið
  if (kt.length === 10) body.customer_reference = kt;
```

- [ ] **Step 2: Update the success return (line 1170)**

Change `return sjson({ token: d.token, expires_at: d.expires_at || null, service });` to:
```js
    return sjson({ token: d.token, expires_at: d.expires_at || null, tier });
```

- [ ] **Step 3: Verify it parses**

Run (from repo root): `node --check web/worker.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/worker.js
git commit -m "Verk B: askellSessionHandler tekur tier -> velur solurasa ur ASKELL_CHANNEL_<TIER>"
```

---

## Task 5: Worker webhook — grant tier

**Files:**
- Modify: `web/worker.js` (`askellWebhookHandler`, ~1090-1130)

**Interfaces:**
- Consumes: validated `subscription_contract` payload with `metadata.tier` + `customer_reference` (kt).
- Produces: POST to karp-user.php `/sub/grant { kt, tier, until, ref, secret }`.

- [ ] **Step 1: Read the current grant block**

Read `web/worker.js` lines 1090-1135 to locate where the webhook, on a successful `subscription_contract`/`subscription.*` event, extracts `customer_reference` and POSTs to `/sub/grant`. It currently sends `{ service }` (or a per-service field).

- [ ] **Step 2: Change the grant to send `tier`**

In the grant POST body inside `askellWebhookHandler`, replace the `service` field with `tier` sourced from the webhook payload's `metadata.tier`, and compute `until` as the subscription's active-period end (the handler already derives an `until`; keep that). Concretely, where the handler builds the grant body, ensure it reads:
```js
      const tier = (payload && payload.metadata && payload.metadata.tier) || (data && data.metadata && data.metadata.tier) || 'grunnur';
      // ... kt from customer_reference (unchanged), until from the contract period (unchanged) ...
      grantBody = { kt, tier, until, ref, secret: env.KARP_GRANT_SECRET };
```
(Match the handler's existing variable names for `kt`/`until`/`ref`/`grantBody`; the only change is `service` → `tier` from `metadata.tier`.)

- [ ] **Step 3: Verify it parses**

Run (from repo root): `node --check web/worker.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/worker.js
git commit -m "Verk B: askell webhook veitir threp (metadata.tier -> /sub/grant {kt,tier,until})"
```

---

## Task 6: Re-gate `/frettir/` + `/utbod/` to tiers

**Files:**
- Modify: `web/src/pages/frettir.astro:1096-1104`, `web/src/pages/utbod.astro:360-368`

**Interfaces:**
- Consumes: `lockedTier`, `tierGate` (Task 2).

- [ ] **Step 1: `utbod.astro` — swap the import + gate (lines 360-368)**

Change the import (line 360) from:
```js
    import { loadUser, lockedSvc, subGate } from '../lib/auth.js';
```
to:
```js
    import { loadUser, lockedTier, tierGate } from '../lib/auth.js';
```
Change the guard (line 365) from `if (!lockedSvc('utbod') || ...)` to `if (!lockedTier(1) || ...)`.
Change the gate call (line 368) from `subGate(g, { service: 'utbod', title: 'Útboðsvaktin', blurb: '...', price: '3.490 kr/mán' });` to:
```js
        tierGate(g, { minTier: 1, title: 'Útboðsvaktin', blurb: 'Fylgstu með opinberum útboðum og innkaupum — nýjustu útboð, úrslit og vaktir eftir leitarorðum á einum stað.' });
```

- [ ] **Step 2: `frettir.astro` — swap the import + gate (lines 1096-1104)**

Change the import (line 1096) from `import { loadUser, lockedSvc, subGate } from '../lib/auth.js';` to:
```js
    import { loadUser, lockedTier, tierGate } from '../lib/auth.js';
```
Change the guard (line 1101) from `if (!lockedSvc('frettir') || ...)` to `if (!lockedTier(2) || ...)`.
Change the gate call (line 1104) from `subGate(g, { service: 'frettir', ... price: '3.490 kr/mán' });` to:
```js
        tierGate(g, { minTier: 2, title: 'Fjölmiðlagreining — Vöktun & umfjöllun', blurb: 'Fylgstu með fjölmiðlaumfjöllun um fyrirtæki, fólk og málefni á einum stað — fréttastraumar, leitarorðavaktir og greining.' });
```

- [ ] **Step 3: Build + verify no stale `lockedSvc`/`subGate` references remain**

Run (from `web/`): `npm run build`
Expected: build completes, no error (no import of removed `lockedSvc`/`subGate`).
Run (from repo root): `grep -rn "lockedSvc\|subGate\|isSub\b\|u.subs\|\.subs\[" web/src` — Expected: no matches (all migrated).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/frettir.astro web/src/pages/utbod.astro
git commit -m "Verk B: /frettir/ (threp 2) + /utbod/ (threp 1) threp-gatadar (tierGate)"
```

---

## Task 7: `karp-user.php` — tier fields (repo copy; Aron re-pastes on WP)

**Files:**
- Modify: `wordpress/karp-user.php` (L104-106, L205-217, L225-237, L291-312)

> **NOTE:** This is a WPCode snippet on wp.karp.is. Update the repo copy here for version control; **Aron must re-paste the updated snippet on wp.karp.is** for it to take effect. Nothing on the live site changes until then.

- [ ] **Step 1: `/me` — return tier instead of subs (L103-106)**

Replace:
```php
        // admin = allt; annars karp_sub_<svc>_until (unix-tími) í FRAMTÍÐ = virk áskrift/fríprófun.
        $data['subs'] = array(
            'frettir' => $data['isAdmin'] || ( (int) get_user_meta($u->ID, 'karp_sub_frettir_until', true) > time() ),
            'utbod'   => $data['isAdmin'] || ( (int) get_user_meta($u->ID, 'karp_sub_utbod_until', true) > time() ),
        );
```
with:
```php
        // Þrep-áskrift (Verk B): eitt þrep per notandi. karp_tier + karp_tier_until (unix). Sleppt ef útrunnið.
        $t_until = (int) get_user_meta($u->ID, 'karp_tier_until', true);
        $data['tier'] = ( $t_until > time() ) ? (string) get_user_meta($u->ID, 'karp_tier', true) : null;
        $data['tier_until'] = $t_until > time() ? $t_until : null;
```

- [ ] **Step 2: `/sub/trial` — tier trial (L205-217 callback)**

In the `/sub/trial` route callback, replace the per-service logic (reads `$req['service']`, writes `karp_sub_<svc>_until` + `karp_sub_<svc>_trial_used`) with tier logic:
```php
        function ($req) {
            $uid = get_current_user_id(); if ( ! $uid ) return new WP_Error('auth', 'login', array('status' => 401));
            $tier = preg_replace('/[^a-z_]/', '', (string) $req['tier']);
            if ( ! in_array($tier, array('grunnur','fyrirtaeki','fyrirtaeki_plus'), true) ) return new WP_Error('bad', 'tier', array('status' => 400));
            if ( get_user_meta($uid, 'karp_tier_trial_used', true) ) return array('ok' => false, 'reason' => 'used');
            $until = time() + 31 * DAY_IN_SECONDS;
            update_user_meta($uid, 'karp_tier', $tier);
            update_user_meta($uid, 'karp_tier_until', $until);
            update_user_meta($uid, 'karp_tier_trial_used', 1);
            return array('ok' => true, 'tier' => $tier, 'until' => $until);
        }
```
(Match the route's existing `permission_callback`/args shape; only the callback body changes.)

- [ ] **Step 3: `/sub/subscribe` — accept tier (L225-237 callback)**

In the `/sub/subscribe` callback, change it to read `$req['tier']` (validate against the 3 slugs) instead of `$req['service']`, keep `update_user_meta($uid, 'karp_kt', $kt);`, and store `array('kt'=>$kt,'tier'=>$tier,'status'=>'pending')` in `karp_subscribers` (replace the `service` key with `tier`):
```php
            $tier = preg_replace('/[^a-z_]/', '', (string) $req['tier']);
            $kt = preg_replace('/\D/', '', (string) $req['kt']);
            if ( ! in_array($tier, array('grunnur','fyrirtaeki','fyrirtaeki_plus'), true) || strlen($kt) !== 10 ) return new WP_Error('bad', 'input', array('status' => 400));
            update_user_meta($uid, 'karp_kt', $kt);
            $subs = (array) get_option('karp_subscribers', array());
            $subs[$kt . ':' . $tier] = array('kt' => $kt, 'tier' => $tier, 'status' => 'pending', 'ts' => time());
            update_option('karp_subscribers', $subs, false);
            return array('ok' => true);
```

- [ ] **Step 4: `/sub/grant` — set tier (L291-312 `karp_sub_grant`)**

Replace the `karp_sub_grant` function body's per-service grant with tier grant. Read `$tier` from the request (default `grunnur`), find the user by `karp_kt`, set `karp_tier` + `karp_tier_until = until` (guard idempotency via `karp_sub_granted_refs` unchanged):
```php
function karp_sub_grant($req) {
    if ( ! defined('KARP_GRANT_SECRET') || $req['secret'] !== KARP_GRANT_SECRET ) return new WP_Error('auth', 'no', array('status' => 403));
    $kt = preg_replace('/\D/', '', (string) $req['kt']);
    $tier = preg_replace('/[^a-z_]/', '', (string) $req['tier']);
    $until = (int) $req['until'];
    $ref = (string) $req['ref'];
    if ( strlen($kt) !== 10 || ! in_array($tier, array('grunnur','fyrirtaeki','fyrirtaeki_plus'), true) || $until < time() ) return new WP_Error('bad', 'input', array('status' => 400));
    $done = (array) get_option('karp_sub_granted_refs', array());
    if ( $ref !== '' && in_array($ref, $done, true) ) return array('ok' => true, 'dup' => true);
    $users = get_users(array('meta_key' => 'karp_kt', 'meta_value' => $kt, 'number' => 1, 'fields' => 'ID'));
    if ( empty($users) ) return array('ok' => false, 'reason' => 'nouser');
    $uid = $users[0];
    update_user_meta($uid, 'karp_tier', $tier);
    update_user_meta($uid, 'karp_tier_until', $until);
    if ( $ref !== '' ) { $done[] = $ref; if ( count($done) > 5000 ) $done = array_slice($done, -5000); update_option('karp_sub_granted_refs', $done, false); }
    return array('ok' => true);
}
```

- [ ] **Step 5: Sanity-check PHP syntax (if php is available)**

Run (from repo root): `php -l wordpress/karp-user.php` if PHP is installed; else visually confirm braces/quotes balance. Expected: "No syntax errors detected" (or a clean visual pass).

- [ ] **Step 6: Commit**

```bash
git add wordpress/karp-user.php
git commit -m "Verk B: karp-user.php threp-reitir (karp_tier/karp_tier_until; /me /sub/subscribe /sub/grant /sub/trial) — Aron endurlimir a WP"
```

---

## Task 8: Full build/verify + Áskell hand-off

- [ ] **Step 1: Full build + all checks**

Run (from `web/`): `npm run build` — Expected: 205 pages, no error.
Run (from `web/`): `node --test test/tier.test.mjs` — Expected: PASS.
Run (from repo root): `node --check web/src/lib/auth.js web/worker.js web/src/data/lausnir.js` — Expected: exit 0.
Run (from repo root): `grep -rn "lockedSvc\|subGate\|isSub\b" web/src` — Expected: no matches.

- [ ] **Step 2: Confirm secret-gated no-op**

Confirm `askellSessionHandler` still returns `{error:'unconfigured'}` when `ASKELL_PRIVATE_KEY` is unset (line 1155 unchanged) — so with no Áskell config, tier buttons fail gracefully and nothing breaks.

- [ ] **Step 3: Merge + deploy (clean astro churn first)**

```bash
git checkout -- web/.astro/content.d.ts web/.astro/types.d.ts 2>/dev/null || true
# merge feature branch to main, then:
git push origin HEAD    # deploys worker + site; tier machinery is live but inert until secrets set
```

- [ ] **Step 4: Hand-off checklist to Aron (NOT a code step — the go-live gate)**

Post this to Aron; the tiers cannot charge until all four are done:
1. **Áskell:** create 3 subscription plans/sales-channels — Grunnur (2.900), Fyrirtæki (6.900), Fyrirtæki+ (12.900 kr/mán), each `customer_reference_setting = kennitala`, `allowed_origins = https://karp.is`.
2. **Cloudflare Secrets (Encrypt):** `ASKELL_CHANNEL_GRUNNUR`, `ASKELL_CHANNEL_FYRIRTAEKI`, `ASKELL_CHANNEL_FYRIRTAEKI_PLUS` (the channel slugs). (`ASKELL_PRIVATE_KEY`, `ASKELL_WEBHOOK_SECRET`, `KARP_GRANT_SECRET` already set.)
3. **WordPress:** re-paste the updated `wordpress/karp-user.php` snippet (Task 7) via WPCode on wp.karp.is.
4. **Webhook:** confirm Áskell webhook → `https://karp.is/api/askell/webhook` (already configured).
Then: one real test payment per tier → check `https://karp.is/api/askell/last?diag=1` shows the event → confirm `metadata.tier` parsing → access opens at the right tier. This closes task #27.

---

## Self-Review (author checklist)

1. **Spec coverage:** entitlement hierarchy ✓ (T1+T2), minTier on EIGINDIR ✓ (T1), karpSubscribeTier wiring ✓ (T3), worker session tier ✓ (T4), worker webhook grant tier ✓ (T5), re-gate frettir/utbod ✓ (T6), karp-user.php tier ✓ (T7), secret-gated ✓ (T8 S2 + global constraint), remove per-service ✓ (T2 + T6 S3 grep), Aron dependency ✓ (T8 S4), v1.1 exclusions honored (no quota/limits/upgrade in any task).
2. **Placeholders:** none — all code complete; T5 references the handler's existing var names (kt/until/ref/grantBody) because the exact surrounding lines vary, but the change (service→tier from metadata.tier) is explicit; T5 S1 reads them first.
3. **Type consistency:** `tierLevelOf(tier,isAdmin)` defined T1, imported+wrapped T2 (`tierLevel`/`hasTier`/`lockedTier`), used T6 (`lockedTier(1|2)`, `tierGate({minTier})`). `karpSubscribeTier({slug,nafn,btn})` signature (T3) matches the `VerdTafla.astro` call from Verk A. Worker `tier` param (T4) ↔ `/api/sub/checkout-session?tier=` (T3) ↔ `metadata.tier` (T4→T5). PHP `karp_tier`/`karp_tier_until` consistent across /me, /sub/grant, /sub/trial (T7).
