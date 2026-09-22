// Samningsaðgangur í auth-laginu: /me leiðir réttindin af samningnum, og aðgangur sem var stofnaður
// án lykilorðs fær BOÐSPÓST (eigin texti, vikulangur hlekkur) þegar beðið er um hlekk á /endurstilla/.
// ⚠ Lykilorð fara aldrei um þetta flæði. Starfsmaðurinn velur það sjálfur á /endurstilla/.
// ⚠ Repóið er opinbert: nöfn og netföng hér eru TILBÚIN. Aldrei raunverulegt starfsfólk samningsaðila.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authForgotHandler, authMeHandler, authResetHandler } from '../src/worker/auth.mjs';
import { _hmac } from '../src/worker/felag.mjs';

const SECRET = 'profa-leyndarmal-ekki-i-notkun';
const HASH = 'pbkdf2$100000$c2FsdA$aGFzaA';

/** Falskur D1: `svara(sql, args, hattur)` ákveður svarið; allar fyrirspurnir skráðar í `log`. */
function fakeDb(svara, log = []) {
  return {
    log,
    prepare(sql) {
      const mk = (args) => ({
        bind: (...a) => mk(a),
        first: async () => { log.push([sql, args]); return svara(sql, args, 'first') ?? null; },
        all: async () => { log.push([sql, args]); return { results: svara(sql, args, 'all') || [] }; },
        run: async () => { log.push([sql, args]); svara(sql, args, 'run'); return { meta: {} }; },
      });
      return mk([]);
    },
  };
}

/** D1 með einum notanda (og engu öðru). `tokniFellur` = INSERT í auth_tokens kastar. */
const envMed = (notandi, subs = [], log = [], { tokniFellur = false } = {}) => ({
  SESSION_SECRET: SECRET,
  TENGSL: fakeDb((sql, args, h) => {
    if (tokniFellur && /INSERT INTO auth_tokens/.test(sql)) throw new Error('D1 niðri');
    if (/FROM users WHERE id=\?/.test(sql)) return args[0] === notandi.id ? notandi : null;
    if (/FROM users WHERE email=\? OR username=\?/.test(sql)) return args[0] === notandi.email ? notandi : null;
    if (/FROM sub_service WHERE user_id=\?/.test(sql)) return h === 'all' ? subs : null;
    return null;
  }, log),
});

async function getMe(env, uid) {
  const body = uid + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const cookie = 'karp_session=' + encodeURIComponent(body + '.' + await _hmac(env, body));
  return (await authMeHandler(new Request('https://karp.is/api/auth/me', { headers: { Cookie: cookie } }), env)).json();
}

const STARFSMADUR = { id: 40, email: 'jon@stofa.example', name: 'Jón Þór Jónsson', pass_hash: '!', email_verified: 1, is_admin: 0, free_access: 0, samningur: 'allt' };

test('/me: starfsmaður á samningi fær fasteignamatið sem þjónustu og samninginn með', async () => {
  const j = await getMe(envMed({ ...STARFSMADUR, pass_hash: HASH }), 40);
  assert.equal(j.loggedIn, true);
  assert.ok(j.subs.includes('fasteign'), 'fasteign verður að vera í subs svo hasSub opni matið');
  assert.deepEqual(j.samningur, { id: 'allt', nafn: 'Allt fasteignasala', thjonustur: ['fasteign'] });
  assert.equal(j.plus, true);
});

test('/me: eigin áskrift og samningur um sömu þjónustu telst EINU sinni', async () => {
  const j = await getMe(envMed({ ...STARFSMADUR, pass_hash: HASH }, [{ service: 'fasteign', used: 3, used_month: '2026-09' }]), 40);
  assert.deepEqual(j.subs.filter((s) => s === 'fasteign'), ['fasteign']);
});

test('⚠ /me: eigin GREIDD áskrift birtist sem áskrift (má segja upp), ekki sem samningur', async () => {
  // Rýnin 22.9: starfsmaður sem borgar sjálfur fyrir Fasteignavaktina og er svo settur á samning sá
  // aðeins samningslínuna, án „Segja upp", og Áskell hélt áfram að rukka hann.
  const j = await getMe(envMed({ ...STARFSMADUR, pass_hash: HASH }, [{ service: 'fasteign', used: 3, used_month: '2026-09' }]), 40);
  assert.deepEqual(j.samningur.thjonustur, [], 'samningurinn telur aðeins þjónustur sem koma EINGÖNGU úr honum');
});

test('/me: notandi án samnings fær engan samning og óbreytt subs', async () => {
  const j = await getMe(envMed({ ...STARFSMADUR, samningur: null, pass_hash: HASH }), 40);
  assert.equal(j.samningur, null);
  assert.deepEqual(j.subs, []);
});

// ── forgot → boðspóstur ─────────────────────────────────────────────────────
// sendGmail sækir aðgangstókn og sendir svo; hvort tveggja er gripið hér og ekkert fer út.
function gripaPost() {
  const sent = [], loggur = [];
  const upphafleg = globalThis.fetch, upphLog = console.log;
  console.log = (...a) => { loggur.push(a.map(String).join(' ')); };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'profa' }), { status: 200 });
    if (u.startsWith('https://gmail.googleapis.com/')) {
      const raw = JSON.parse(init.body).raw.replace(/-/g, '+').replace(/_/g, '/');
      const texti = Buffer.from(raw, 'base64').toString('utf8');
      const [haus, ...rest] = texti.split('\r\n\r\n');
      const html = Buffer.from(rest.join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
      const efni = Buffer.from((haus.match(/Subject: =\?UTF-8\?B\?(.+)\?=/) || [])[1] || '', 'base64').toString('utf8');
      sent.push({ haus, efni, html });
      return new Response('{}', { status: 200 });
    }
    throw new Error('óvænt fetch ' + u);
  };
  return { sent, loggur, skila: () => { globalThis.fetch = upphafleg; console.log = upphLog; } };
}

async function bidjaUmHlekk(notandi, login, valk = {}) {
  const log = [];
  const env = { ...envMed(notandi, [], log, valk), GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'x', GMAIL_REFRESH_TOKEN: 'x' };
  const bid = [];
  const pp = gripaPost();
  try {
    const r = await authForgotHandler(new Request('https://karp.is/api/auth/forgot', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login }),
    }), env, { waitUntil: (p) => bid.push(p) });
    await Promise.all(bid);
    const tokn = log.find(([sql]) => /INSERT INTO auth_tokens/.test(sql));
    return { svar: await r.json(), tokn: tokn && tokn[1], sent: pp.sent, loggur: pp.loggur };
  } finally { pp.skila(); }
}

test('forgot: aðgangur á samningi án lykilorðs fær BOÐSPÓST með vikulöngum hlekk í boðs-ham', async () => {
  const nu = Math.floor(Date.now() / 1000);
  const { svar, tokn, sent } = await bidjaUmHlekk(STARFSMADUR, 'jon@stofa.example');
  assert.deepEqual(svar, { ok: true });
  const [token, uid, tegund, rennur] = tokn;
  assert.equal(uid, 40);
  assert.equal(tegund, 'reset', '/api/auth/reset tekur aðeins reset-tókn — boðið notar sama flæði');
  assert.ok(Math.abs(rennur - (nu + 7 * 86400)) < 10, 'hlekkurinn gildir í viku');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].efni, 'Aðgangurinn þinn á Karp');
  assert.match(sent[0].html, /Hæ Jón,/);
  assert.match(sent[0].html, /Allt og Karp gerðu samning/);
  assert.ok(sent[0].html.includes('https://karp.is/endurstilla/?token=' + token + '&bod=1'), 'hlekkurinn ber sama tókn og var vistað');
  assert.match(sent[0].haus, /^To: jon@stofa\.example$/m);
});

test('forgot: svör við boðspóstinum fara til tengiliðar samningsins, ekki í hjálparborðið', async () => {
  const { sent } = await bidjaUmHlekk(STARFSMADUR, 'jon@stofa.example');
  assert.match(sent[0].haus, /^Reply-To: aron@karp\.is$/m);
});

test('⚠ forgot: vistist tóknið ekki fer enginn boðspóstur (dauður hlekkur væri verri en enginn)', async () => {
  const { svar, sent, loggur } = await bidjaUmHlekk(STARFSMADUR, 'jon@stofa.example', { tokniFellur: true });
  assert.deepEqual(svar, { ok: true }, 'svarið er alltaf það sama (engin upptalning)');
  assert.equal(sent.length, 0);
  assert.ok(loggur.some((l) => /^bod villa/.test(l)), 'bilunin sést í loggnum');
});

test('⚠ forgot: loggurinn ber hvorki tókn, netfang né notandanúmer', async () => {
  const { tokn, loggur } = await bidjaUmHlekk(STARFSMADUR, 'jon@stofa.example');
  const allt = loggur.join('\n');
  assert.match(allt, /^bod sent$/m);
  assert.equal(allt.includes(tokn[0]), false, 'tóknið má aldrei rata í logg');
  assert.equal(/jon@stofa|\b40\b/.test(allt), false, 'hvorki netfang né notandanúmer');
});

test('forgot: notandi MEÐ lykilorð fær áfram venjulegu endurstillinguna (klukkustund, ekkert boð)', async () => {
  const nu = Math.floor(Date.now() / 1000);
  const { tokn, sent } = await bidjaUmHlekk({ ...STARFSMADUR, pass_hash: HASH }, 'jon@stofa.example');
  assert.ok(Math.abs(tokn[3] - (nu + 3600)) < 10);
  assert.equal(sent[0].efni, 'Endurstilla lykilorð á Karp');
  assert.equal(sent[0].html.includes('bod=1'), false);
  assert.equal(/^Reply-To:/m.test(sent[0].haus), false);
});

test('forgot: aðgangur án lykilorðs og ÁN samnings fær venjulegu endurstillinguna', async () => {
  const { tokn, sent } = await bidjaUmHlekk({ ...STARFSMADUR, samningur: null }, 'jon@stofa.example');
  assert.ok(tokn[3] - Math.floor(Date.now() / 1000) <= 3600);
  assert.equal(sent[0].efni, 'Endurstilla lykilorð á Karp');
});

test('forgot: óþekkt netfang svarar eins og alltaf og sendir ekkert', async () => {
  const { svar, tokn, sent } = await bidjaUmHlekk(STARFSMADUR, 'enginn@stofa.example');
  assert.deepEqual(svar, { ok: true });
  assert.equal(tokn, undefined);
  assert.equal(sent.length, 0);
});

// ── reset: notað tókn ógildir ÖLL hin ────────────────────────────────────────
test('⚠ reset: tókst → ÖLL endurstillingartókn notandans eyðast, ekki aðeins það sem var notað', async () => {
  // Rýnin 22.9: boðið býr til nýtt vikutókn við hverja beiðni. Væri aðeins notaða tóknið eytt, gilti eldri
  // hlekkur (t.d. í áframsendum pósti) áfram í viku og gæti yfirskrifað nýja lykilorðið.
  const log = [];
  const env = {
    SESSION_SECRET: SECRET,
    TENGSL: fakeDb((sql) => (/FROM auth_tokens WHERE token=\?/.test(sql) ? { token: 'tokn-b', user_id: 40 } : null), log),
  };
  const r = await authResetHandler(new Request('https://karp.is/api/auth/reset', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tokn-b', password: 'nytt-lykilord-1' }),
  }), env);
  assert.equal((await r.json()).ok, true);
  const eyding = log.find(([sql]) => /DELETE FROM auth_tokens/.test(sql));
  assert.ok(eyding, 'ekkert tókn eytt');
  assert.match(eyding[0], /WHERE user_id=\? AND kind='reset'/);
  assert.deepEqual(eyding[1], [40]);
});
