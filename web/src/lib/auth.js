// auth.js — client-side auth fyrir Astro-appið (app.karp.is). #2 Á5.
// ---------------------------------------------------------------------------
// Leysir af wp_head-sprautun mælaborðsins: sækir innskráningarstöðu frá WordPress
// GET /me (kross-undirléns með credentials), setur window.KARP_USER (SAMA lögun og
// á karp.is), og býður karpGet/karpPost með X-WP-Nonce.
//
// FORSENDA (þín infra, sjá Deploy-runbook): (1) deploya karp-user.php (GET /me + CORS),
// (2) define('COOKIE_DOMAIN','.karp.is') í wp-config, (3) app.karp.is undirlén.
// Þar til þetta er komið → /me skilar 404/engri lotu → allt sýnir „útskráð" (brotnar ekki).

export const KARP_API = 'https://www.karp.is/wp-json/karp/v1';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  + '.kc-in{color:#06121a;background:#f6b13b;padding:5px 12px;border-radius:8px;font-weight:700}'
  + '.kc-reg{color:#cdd6e6;padding:5px 8px}'
  + '.kc-prof{display:flex;align-items:center;gap:7px;color:#eaf1fb}'
  + '.kc-av{border-radius:50%;object-fit:cover}'
  + '.kc-ini{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#1f6feb;color:#fff;font-weight:700;font-size:13px}'
  + '.kc-name{font-weight:600}'
  + '.kc-out{color:#7e8ca6;font-size:16px;padding:0 4px;text-decoration:none}';
function injectChipCss() {
  if (typeof document === 'undefined' || document.getElementById('karp-chip-css')) return;
  const s = document.createElement('style');
  s.id = 'karp-chip-css';
  s.textContent = CHIP_CSS;
  document.head.appendChild(s);
}

// Innskráningar-chip fyrir appbarinn (útskráð: Skrá inn/Nýskrá — innskráð: nafn + útskrá).
export function renderChip(el, u) {
  injectChipCss();
  u = u || window.KARP_USER || { loggedIn: false };
  const site = 'https://www.karp.is';
  if (u.loggedIn) {
    const av = u.avatar ? `<img class="kc-av" src="${esc(u.avatar)}" alt="" width="26" height="26">`
                        : `<span class="kc-av kc-ini">${esc((u.name || '?').charAt(0))}</span>`;
    el.innerHTML =
      `<a class="kc-prof" href="${esc(u.profileUrl || site)}">${av}<span class="kc-name">${esc(u.name || '')}</span></a>`
      + `<a class="kc-out" href="${esc(u.logoutUrl || site)}" title="Skrá út" aria-label="Skrá út">⏻</a>`;
  } else {
    el.innerHTML =
      `<a class="kc-in" href="${esc(u.loginUrl || site + '/innskraning/')}">Skrá inn</a>`
      + `<a class="kc-reg" href="${esc(u.registerUrl || site + '/nyskra/')}">Nýskrá</a>`;
  }
}

// Þægindi: sækja notanda + teikna chip í einu.
export async function mountChip(el) {
  renderChip(el, { loggedIn: false }); // strax útskráð svo ekkert hopp
  renderChip(el, await loadUser());
}

// Aðgengilegt öðrum eyju-skriftum + til prófunar (mælaborðið afhjúpar svipað).
if (typeof window !== 'undefined') window.karpAuth = { loadUser, karpGet, karpPost, renderChip, mountChip };
