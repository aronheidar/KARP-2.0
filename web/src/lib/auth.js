// auth.js — client-side auth fyrir Astro-appið (karp.is). #2 Á5.
// ---------------------------------------------------------------------------
// Leysir af wp_head-sprautun mælaborðsins: sækir innskráningarstöðu frá WordPress
// GET /me (kross-undirléns með credentials), setur window.KARP_USER (SAMA lögun og
// á karp.is), og býður karpGet/karpPost með X-WP-Nonce.
//
// FORSENDA (þín infra, sjá Deploy-runbook): (1) deploya karp-user.php (GET /me + CORS),
// (2) define('COOKIE_DOMAIN','.karp.is') í wp-config, (3) karp.is undirlén.
// Þar til þetta er komið → /me skilar 404/engri lotu → allt sýnir „útskráð" (brotnar ekki).

// ATH: karp.is (apex, EKKI www) — WP-canonical hýsillinn þar sem innskráningar-kakan lifir.
// Að sækja www hér skilar „útskráð" því kakan (host-only karp.is) berst ekki til www.
import { tierLevelOf } from '../data/lausnir.js';
const TIER_NAME = { 1: 'Grunnur', 2: 'Fyrirtæki', 3: 'Fyrirtæki+' };

export const KARP_API = 'https://wp.karp.is/wp-json/karp/v1';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function setUser(u) { window.KARP_USER = u; return u; }

// Sækir KARP_USER. Fellur mjúkt á { loggedIn:false } ef bakendi/lota vantar.
// Memóað (_userPromise): margar eyjur á sömu síðu deila EINU /me-kalli.
let _userPromise = null;
export function loadUser() {
  if (_userPromise) return _userPromise;
  _userPromise = (async () => {
    try {
      const r = await fetch(KARP_API + '/me', { credentials: 'include' });
      if (!r.ok) return setUser({ loggedIn: false, _status: r.status });
      const u = await r.json();
      return setUser(u && typeof u.loggedIn === 'boolean' ? u : { loggedIn: false });
    } catch (e) {
      return setUser({ loggedIn: false, _error: String(e) });
    }
  })();
  return _userPromise;
}

function authHeaders(extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const n = window.KARP_USER && window.KARP_USER.nonce;
  if (n) h['X-WP-Nonce'] = n; // WP REST cookie-auth CSRF
  return h;
}

// Auðkennd köll — credentials + nonce (eins og karpGet/knPost í mælaborðinu).
export async function karpGet(path) {
  try {
    const r = await fetch(KARP_API + path, { credentials: 'include', headers: authHeaders() });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}
export async function karpPost(path, body) {
  try {
    const r = await fetch(KARP_API + path, {
      method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify(body || {}),
    });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

// Chip-stílar sprautaðir héðan (ekki úr .astro <style>) því chip-HTML er búið til á
// keyrslutíma → Astro-scoped CSS næði ekki til þess. Þannig virkar chip á HVAÐA síðu sem er.
const CHIP_CSS = '.chip a{text-decoration:none}'
  // LOTA 22: chip-inn helst innan rammans — avatar klemmdur, nafnið á EINNI línu m. ellipsis
  + '.chip{flex-wrap:nowrap!important;min-width:0}'
  + '.kc-in{color:#06121a;background:#f6b13b;padding:5px 12px;border-radius:8px;font-weight:700}'
  + '.kc-reg{color:#cdd6e6;padding:5px 8px}'
  + '.kc-prof{display:flex;align-items:center;gap:7px;color:#eaf1fb;min-width:0;flex:1}'
  + '.kc-av{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:none}'
  + '.kc-ini{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#1f6feb;color:#fff;font-weight:700;font-size:13px;flex:none}'
  + '.kc-name{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}'
  + '.kc-out{color:#7e8ca6;padding:0 4px;text-decoration:none;flex:none;display:inline-flex;align-items:center}'
  + '.kc-out:hover{color:#f6b13b}';
function injectChipCss() {
  if (typeof document === 'undefined' || document.getElementById('karp-chip-css')) return;
  const s = document.createElement('style');
  s.id = 'karp-chip-css';
  s.textContent = CHIP_CSS;
  document.head.appendChild(s);
}

// Innskráningarslóð sem SKILAR notandanum á síðuna sem hann var á: UM-login
// endurspeglar ?redirect_to= í formið og karp-user.php leyfir karp.is-hýsla
// (allowed_redirect_hosts) svo wp_safe_redirect strípar ekki cross-host slóðina.
export function loginHref(returnTo) {
  const base = ((typeof window !== 'undefined' && window.KARP_USER && window.KARP_USER.loginUrl) || 'https://wp.karp.is/login/');
  const to = returnTo || (typeof location !== 'undefined' ? location.href : 'https://karp.is/');
  return base + (base.indexOf('?') > -1 ? '&' : '?') + 'redirect_to=' + encodeURIComponent(to);
}

// Innskráningar-chip fyrir appbarinn (útskráð: Skrá inn/Nýskrá — innskráð: nafn + útskrá).
export function renderChip(el, u) {
  injectChipCss();
  u = u || window.KARP_USER || { loggedIn: false };
  const site = 'https://wp.karp.is'; // innskráningarsíðurnar búa á WP (Leið A)
  if (u.loggedIn) {
    const av = u.avatar ? `<img class="kc-av" src="${esc(u.avatar)}" alt="" width="26" height="26">`
                        : `<span class="kc-av kc-ini">${esc((u.name || '?').charAt(0))}</span>`;
    el.innerHTML =
      `<a class="kc-prof" href="/mitt-svaedi/">${av}<span class="kc-name">${esc(u.name || '')}</span></a>`
      + `<a class="kc-out" href="${esc(u.logoutUrl || site)}" title="Skrá út" aria-label="Skrá út"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>`;
  } else {
    el.innerHTML =
      `<a class="kc-in" href="${esc(loginHref())}">Skrá inn</a>`
      + `<a class="kc-reg" href="${esc(u.registerUrl || site + '/nyskraning/')}">Nýskrá</a>`;
  }
}

// Þægindi: sækja notanda + teikna chip í einu.
export async function mountChip(el) {
  renderChip(el, { loggedIn: false }); // strax útskráð svo ekkert hopp
  renderChip(el, await loadUser());
}

// ── Karp+ aðgangur / entitlement (LOTA 94) ──────────────────────────────────
// KARP_USER-svið frá WordPress (karp-user.php): isAdmin (allt frítt), plus (áskrifandi/í
// fríprófun), paywall (bool: eru greiðsluveggir VIRKIR — SLÖKKT sjálfgefið svo ekkert brotni
// fyrir launch; kveikt af Aroni þegar billing er tilbúið), reports (fylki lykla keyptra skýrslna).
const _u = () => (typeof window !== 'undefined' && window.KARP_USER) || {};
export function isAdmin() { return _u().isAdmin === true; }
export function isPlus() { const u = _u(); return u.isAdmin === true || u.plus === true; }
// Er efni læst fyrir ÞENNAN notanda? AÐEINS ef greiðsluveggir eru virkir OG notandi er ekki áskrifandi/admin.
export function locked() { return _u().paywall === true && !isPlus(); }
// Hefur notandinn keypt (eða admin) þessa skýrslu? key = t.d. 'fasteign:<pn>' eða 'fyrirtaeki:<kt>'.
export function hasReport(key) { const u = _u(); return isAdmin() || (Array.isArray(u.reports) && u.reports.indexOf(key) !== -1); }

// Þrep-áskrift (Verk B): eitt þrep per notandi (u.tier ∈ grunnur|fyrirtaeki|fyrirtaeki_plus), stigveldi.
// hasTier(min) = notandi (eða admin) hefur a.m.k. þrep-stig `min` (1|2|3). lockedTier = veggur virkur OG ekki nógu hátt þrep.
export function tierLevel(u) { u = u || _u(); return tierLevelOf(u.tier, u.isAdmin === true); }
export function hasTier(min) { return tierLevel() >= min; }
export function lockedTier(min) { return _u().paywall === true && !hasTier(min); }

// Hefja greiðslu (Teya SecurePay, LOTA 97). Worker undirritar pöntun og skilar { action, fields };
// við byggjum falið form og POST-um → kaupandi fer á hýstu greiðslusíðu Teya. Skilar 'redirected'
// ef sent var af stað, annars villukóða ('unconfigured'|'free'|'error') svo kallandi geti fallið á prentleið.
export async function karpCheckout(body) {
  try {
    const r = await fetch('/api/pay/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => null);
    if (d && d.ok && d.action && d.fields) {
      const f = document.createElement('form');
      f.method = 'POST'; f.action = d.action; f.style.display = 'none';
      for (const k in d.fields) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = d.fields[k]; f.appendChild(i); }
      document.body.appendChild(f); f.submit();
      return 'redirected';
    }
    if (d && d.error === 'login') { location.href = loginHref(); return 'redirected'; }   // kaup krefjast innskráningar (vistast á Mitt svæði)
    return (d && d.error) ? d.error : 'error';
  } catch (e) { return 'error'; }
}

const GATE_CSS = '.plus-gate{max-width:520px;margin:24px auto;background:rgba(246,177,59,.06);border:1px solid rgba(246,177,59,.35);border-radius:16px;padding:24px 26px;text-align:center}'
  + '.pg-badge{display:inline-block;background:#f6b13b;color:#131a29;font-weight:800;font-size:12px;letter-spacing:.05em;padding:4px 12px;border-radius:999px}'
  + '.pg-h{font-size:21px;color:#eaf1fb;margin:12px 0 6px}.pg-b{color:#cdd6e6;font-size:14px;line-height:1.55;margin:0 0 16px}'
  + '.pg-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}'
  + '.pg-main{background:#f6b13b;color:#131a29;font-weight:800;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:11px;border:0;cursor:pointer}'
  + '.pg-sec{border:1px solid rgba(255,255,255,.2);color:#cdd6e6;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:11px}'
  + '.pg-note{color:#8fa0b8;font-size:12px;margin-top:12px}'
  + '.sg-kt{padding:11px 14px;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:rgba(255,255,255,.05);color:#eaf1fb;font:inherit;font-size:14px;width:200px;text-align:center;letter-spacing:.06em}'
  + '.sg-kt:focus{outline:none;border-color:#f6b13b}'
  + '.sg-err{color:#ff8a8a;font-size:12.5px;margin-top:10px}'
  + '.sg-checkout{margin-top:14px;text-align:left;min-height:60px}';
function injectGateCss() { if (typeof document === 'undefined' || document.getElementById('karp-gate-css')) return; const s = document.createElement('style'); s.id = 'karp-gate-css'; s.textContent = GATE_CSS; document.head.appendChild(s); }

// Teiknar Karp+ gátt-teaser inn í el (t.d. í stað læsts efnis). Innskráð → „Prófa frítt í mánuð"
// (POST /plus/trial → reload); útskráð → innskráning (1 mánuður frír eftir á).
export function plusGate(el, opts) {
  if (!el) return; injectGateCss(); opts = opts || {};
  const u = _u();
  el.innerHTML = '<div class="plus-gate"><div class="pg-badge">⭐ Karp+</div>'
    + '<h2 class="pg-h">' + esc(opts.title || 'Þetta er hluti af Karp+') + '</h2>'
    + '<p class="pg-b">' + esc(opts.blurb || '') + '</p>'
    + '<div class="pg-btns">'
    + (u.loggedIn ? '<button class="pg-main" id="pg-trial" type="button">Prófa frítt í mánuð</button>' : '<a class="pg-main" href="' + esc(loginHref()) + '">Skráðu þig inn — 1 mánuður frír</a>')
    + '<a class="pg-sec" href="/karp-pro/">Sjá Karp+</a></div>'
    + '<div class="pg-note">Ókeypis fyrsta mánuðinn' + (opts.price ? ', svo ' + esc(opts.price) : '') + '. Hættu hvenær sem er.</div></div>';
  const t = el.querySelector('#pg-trial');
  if (t) t.onclick = async () => { t.disabled = true; t.textContent = 'Virkja…'; const r = await karpPost('/plus/trial', {}); if (r && r.ok) location.reload(); else { t.disabled = false; t.textContent = 'Náði ekki — reyndu aftur'; } };
}

// Þrep-gátt (Verk B): teaser þegar efni krefst hærra þreps. Trektar á /karp-pro/ (þar sem VerdTafla sér um checkout).
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
// Áskell v2 embedded checkout (LOTA 110). Safnar kt (tengir Áskell-viðskiptavin við Karp-notanda um
// karp_kt) → worker /api/sub/checkout-session stofnar lotu → askell.js widget rendrar kort+3DS á karp.is.
// Aðgangur opnast við vefkrók (subscription_contract → /sub/grant), EKKI aðeins onSuccess (staðfest server-hlið).
let _askellP = null;
function loadAskellJs() {
  if (_askellP) return _askellP;
  _askellP = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Askell && window.Askell.mountCheckout) return resolve();
    const s = document.createElement('script'); s.src = 'https://cdn.askell.is/js/dist/askell.js'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('askell.js'));
    document.head.appendChild(s);
  });
  return _askellP;
}
export async function karpAskellSubscribe(service, gateEl) {
  const btns = gateEl.querySelector('.pg-btns'); if (!btns) return;
  btns.innerHTML = '<input type="text" id="sg-kt" class="sg-kt" placeholder="Kennitala (10 tölur)" maxlength="11" inputmode="numeric" autocomplete="off" />'
    + '<button class="pg-main" id="sg-next" type="button">Halda áfram →</button>';
  const err = document.createElement('div'); err.className = 'sg-err'; err.hidden = true; btns.after(err);
  const ktIn = gateEl.querySelector('#sg-kt'); if (ktIn) ktIn.focus();
  const fail = (m) => { err.hidden = false; err.textContent = m; };
  gateEl.querySelector('#sg-next').onclick = async () => {
    const kt = String(ktIn.value || '').replace(/\D/g, '');
    if (kt.length !== 10) return fail('Sláðu inn gilda 10 stafa kennitölu.');
    const nb = gateEl.querySelector('#sg-next'); nb.disabled = true; nb.textContent = 'Opna greiðslu…'; err.hidden = true;
    try {
      await karpPost('/sub/subscribe', { service, kt });   // vistar karp_kt → tengir vefkrók við notanda
      const d = await (await fetch('/api/sub/checkout-session?service=' + encodeURIComponent(service) + '&kt=' + kt, { credentials: 'include' })).json();
      if (!d || !d.token) throw new Error(d && d.error === 'unconfigured' ? 'Áskrift ekki virkjuð enn — reyndu síðar.' : 'nosession');
      await loadAskellJs();
      btns.innerHTML = '<div id="askell-checkout" class="sg-checkout"></div>';
      window.Askell.mountCheckout('#askell-checkout', {
        baseUrl: 'https://askell.is', sessionToken: d.token, language: 'is', colorScheme: 'auto',
        onSuccess() { gateEl.innerHTML = '<div class="plus-gate"><div class="pg-badge">✅ Áskrift virk</div><h2 class="pg-h">Takk fyrir áskriftina!</h2><p class="pg-b">Aðgangurinn opnast eftir augnablik…</p></div>'; setTimeout(() => location.reload(), 3500); },
        onError() { fail('Villa kom upp í greiðslu — reyndu aftur.'); },
      });
    } catch (e) {
      const nb2 = gateEl.querySelector('#sg-next'); if (nb2) { nb2.disabled = false; nb2.textContent = 'Halda áfram →'; }
      fail(e && typeof e.message === 'string' && e.message.length < 60 ? e.message : 'Ekki tókst að opna greiðslu — reyndu aftur.');
    }
  };
}
// Hefja áskrift. ENDANLEGT: recurring checkout (kort geymt + Teya boðgreiðslur/RPG-tóki) — BÍÐUR Teya-svars
// + worker-mergs. BRÁÐABIRGÐA: fríprófun (án korts) svo flæðið sé prófanlegt fyrir launch.
export async function karpSubscribe(service, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Virkja…'; }
  const r = await karpPost('/sub/trial', { service });
  if (r && r.ok) { location.reload(); return true; }
  if (btn) { btn.disabled = false; btn.textContent = 'Náði ekki — reyndu aftur'; }
  return false;
}

// Þrep-áskrift (Verk B): opnar Áskell embedded checkout fyrir valið þrep. Sami dans og karpAskellSubscribe
// (kt → /sub/subscribe → /api/sub/checkout-session?tier= → Askell.mountCheckout). Aðgangur opnast við vefkrók.
export async function karpSubscribeTier({ slug, nafn, btn }) {
  const u = _u();
  if (!u.loggedIn) { location.href = loginHref(); return; }
  injectGateCss();
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

// Aðgengilegt öðrum eyju-skriftum + til prófunar (mælaborðið afhjúpar svipað).
if (typeof window !== 'undefined') window.karpAuth = { loadUser, karpGet, karpPost, renderChip, mountChip, isAdmin, isPlus, locked, hasReport, karpCheckout, plusGate, hasTier, lockedTier, tierLevel, tierGate, karpSubscribe, karpAskellSubscribe, karpSubscribeTier };
