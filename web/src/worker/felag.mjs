// felag.mjs — klofið úr worker.js 30.7.2026 (úttekt C10). Föllin eru ÓBREYTT;
// aðeins flutt milli skráa + import/export bætt við. Sjá docs/uttekt/2026-07-30-worker-klofningur-aaetlun.md

export const sjson = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'https://karp.is' },
});
// ── Mini-RAG (LOTA 51): efnisorð spurningar → viðeigandi gogn-JSON úr ASSETS ──
// (sama gagnaver, ekkert net — kostar ekkert). Hám. 2 blokkir per spurningu.
const AUG_CACHE = {};
async function augGet(env, file) {
  if (AUG_CACHE[file] !== undefined) return AUG_CACHE[file];
  try { AUG_CACHE[file] = await (await env.ASSETS.fetch(new Request('https://karp.internal/gogn/' + file))).json(); } catch (e) { AUG_CACHE[file] = null; }
  return AUG_CACHE[file];
}

export const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

export const htmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ktSep = (kt) => (/^\d{10}$/.test(kt) ? kt.slice(0, 6) + '-' + kt.slice(6) : String(kt || ''));

export const erLogadili = (kt) => /^\d{10}$/.test(kt) && +String(kt).slice(0, 2) >= 41 && +String(kt).slice(0, 2) <= 71;

export const isoDate = (s) => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined; };

export const repAll = (h, t, v) => h.split(t).join(v);

export const _te = new TextEncoder();

export const _b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const _fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function _hmac(env, msg) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET missing');   // fail-closed: ekkert giskanlegt fallback (annars mætti falsa lotu-köku)
  const key = await crypto.subtle.importKey('raw', _te.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return _b64u(await crypto.subtle.sign('HMAC', key, _te.encode(msg)));
}

export const _ajson = (obj, extra = {}) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json', ...extra } });

export const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const _tokenHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');

const _b64std = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));   // stöðluð base64 (encoded-word/MIME-body)
async function _gmailToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString(),
  }).catch(() => null);
  const d = r && (await r.json().catch(() => null));
  return (d && d.access_token) || null;
}

let _emailOv = null, _emailOvAt = 0;
// ⚠ Breytilegt module-ástand fer EKKI um import-bindingu (read-only) → setter fyrir adminEmailHandler,
// sem uppfærir cache STRAX eftir vistun svo næsti póstur noti nýja sniðmátið (sama hegðun og áður).
export function _emailOvSet(all) { _emailOv = all; _emailOvAt = Date.now(); }

export async function _emailTpl(env, id) {
  const nowMs = Date.now();
  if (!_emailOv || nowMs - _emailOvAt > 60000) {
    try {
      const row = await env.TENGSL.prepare("SELECT v FROM stjorn_sync WHERE k='email_templates'").first();
      const parsed = row && row.v ? JSON.parse(row.v) : {};
      _emailOv = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) { _emailOv = _emailOv || {}; }
    _emailOvAt = nowMs;
  }
  return resolveEmail(id, _emailOv) || resolveEmail(id, {});
}

export async function sendGmail(env, { to, subject, html, text, replyTo, inReplyTo }) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) return { ok: false, unconfigured: true };
  const tok = await _gmailToken(env);
  if (!tok) return { ok: false, error: 'token' };
  const from = env.GMAIL_FROM || 'Karp <hjalp@karp.is>';
  const bodyHtml = html || (text != null ? _esc(text).replace(/\n/g, '<br>') : '');
  const lines = ['From: ' + from, 'To: ' + to];
  if (replyTo) lines.push('Reply-To: ' + replyTo);
  if (inReplyTo) { lines.push('In-Reply-To: ' + inReplyTo); lines.push('References: ' + inReplyTo); }   // þráður (hjalp-svör)
  lines.push(
    'Subject: =?UTF-8?B?' + _b64std(_te.encode(subject)) + '?=',
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    _b64std(_te.encode(bodyHtml)).replace(/(.{76})/g, '$1\r\n'),
  );
  const raw = _b64u(_te.encode(lines.join('\r\n')));
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ raw }),
  }).catch(() => null);
  return (r && r.ok) ? { ok: true } : { ok: false, error: 'send', status: r ? r.status : 0 };
}

export async function _dget(env, path) {
  try {
    const req = new Request('https://karp.is' + path);
    const r = (env && env.ASSETS) ? await env.ASSETS.fetch(req) : await fetch(req);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export const _cdata = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();

export const _fjson = (o, ttl) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=' + (ttl || 600) } });
