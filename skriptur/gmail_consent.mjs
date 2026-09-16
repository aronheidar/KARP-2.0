#!/usr/bin/env node
// gmail_consent.mjs — EINSKIPTIS samþykki svo worker-inn megi LESA hjalp@karp.is (ekki bara senda).
//
// Af hverju: refresh-tokeninn í GMAIL_REFRESH_TOKEN var búinn til með `gmail.send` einni. Gmail svarar
// því 403 „Request had insufficient authentication scopes" þegar /api/admin/gmail reynir að lesa hólfið.
// Hér er nýr token sóttur með BÁÐUM heimildum (send + readonly) og settur beint í Cloudflare.
//
// ⚠ Lykillinn birtist HVERGI: hann fer úr Google beint í `wrangler secret put` um stdin — ekki á skjáinn,
//   ekki í skrá, ekki í git. Keyrðu skriptuna sjálf(ur); enginn annar þarf að sjá gildin.
//
// KEYRSLA (í rót repo-sins):
//     node skriptur/gmail_consent.mjs
//
// Skriptan spyr um Client ID/Secret (Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
// Client IDs → sami biðlari og sendingin notar). Þarf í eitt skipti: bæta slóðinni sem skriptan prentar
// við „Authorized redirect URIs" á þeim biðlara.

import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.GMAIL_CONSENT_PORT || 8931);
const REDIRECT = 'http://localhost:' + PORT + '/oauth';
const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

const p = (...a) => console.log(...a);

async function spyrja(spurning, sjalfgefid) {
  if (sjalfgefid) return sjalfgefid;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const svar = (await rl.question(spurning)).trim();
  rl.close();
  return svar;
}

/** Bíður eftir að Google sendi notandann til baka með `code`. Skilar kóðanum (eða kastar). */
function bidaEftirKoda() {
  return new Promise((leysa, hafna) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:' + PORT);
      if (u.pathname !== '/oauth') { res.writeHead(404).end(); return; }
      const code = u.searchParams.get('code'), villa = u.searchParams.get('error');
      // Google sendir ALLTAF annaðhvort code eða error. Berist hvorugt kom flakkið ekki frá
      // Google heldur beint úr vafra. Algengast er að smellt sé á sjálfa redirect-slóðina sem
      // prentuð er í skrefi 1 (hún er stutt og skeljar gera hana smellanlega, ólíkt löngu
      // Google-slóðinni sem brotnar yfir línur). Áður drap slíkt flakk þjóninn og sagði
      // "Haett vid" þótt notandinn hefði aldrei séð samþykkissíðuna. Núna bíðum við áfram.
      if (!code && !villa) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:40px;background:#0b0f1a;color:#f6f7fb">'
          + '<h2>Þetta er ekki slóðin</h2><p>Hún á bara að fara í Authorized redirect URIs hjá Google.</p>'
          + '<p>Farðu aftur í skelina og opnaðu <b>löngu</b> slóðina úr skrefi 2.</p></body>');
        return;   // þjónninn heldur áfram að hlusta
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:40px;background:#0b0f1a;color:#f6f7fb">'
        + (code ? '<h2 style="color:#46e08a">✔ Samþykkt</h2><p>Þú mátt loka þessum flipa — skriptan klárar afganginn.</p>'
                : '<h2 style="color:#ff6b6b">✕ Hætt við</h2><p>' + (villa || 'engin heimild veitt') + '</p>') + '</body>');
      s.close();
      code ? leysa(code) : hafna(new Error(villa || 'ekkert code'));
    });
    s.on('error', hafna);
    s.listen(PORT, () => p('   (hlusta á ' + REDIRECT + ')'));
    setTimeout(() => { s.close(); hafna(new Error('tímamörk — ekkert svar innan 5 mínútna')); }, 300000).unref();
  });
}

/** Endurnyjar wrangler-innskraninguna GAGNVIRKT og stadfestir ad hun virki.
 *  Af hverju thetta kemur FYRST: wrangler notar OAuth-token sem rennur ut eftir um klukkustund og
 *  getur adeins endurnyjad thad gagnvirkt. Skrefid sem skrifar leyndarmalid pipar gildid inn a stdin,
 *  sem gerir wrangler ogagnvirka, og tha neitar hun med "In a non-interactive environment, it is
 *  necessary to set a CLOUDFLARE_API_TOKEN". Thad gerdist 15. OG 16.9.2026, i baedi skiptin EFTIR ad
 *  notandinn var buinn med allan OAuth-dansinn, svo samthykkid tapadist tvisvar. Nuna fellur thetta
 *  a tveimur sekundum adur en nokkud er lagt a notandann. */
function wranglerTilbuinn() {
  return new Promise((leysa) => {
    const w = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'whoami'],
      { cwd: WEB, stdio: 'inherit', shell: process.platform === 'win32' });
    w.on('error', () => leysa(false));
    w.on('close', (k) => leysa(k === 0));
  });
}

/** Setur leyndarmál í Cloudflare um STDIN — gildið fer aldrei í skipanalínu, skrá né skjá. */
function setjaSecret(nafn, gildi) {
  return new Promise((leysa, hafna) => {
    const w = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'secret', 'put', nafn], { cwd: WEB, stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    w.on('error', hafna);
    w.on('close', (k) => (k === 0 ? leysa() : hafna(new Error('wrangler skilaði ' + k))));
    w.stdin.end(gildi);
  });
}

const j = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error((d.error_description || d.error || r.status) + ''); return d; };

try {
  p('\n🔑 Gmail-lesheimild fyrir hjalp@karp.is — einskiptis samþykki\n');
  p('0) Stadfesti wrangler-innskraningu. Hun rennur ut og endurnyjast adeins gagnvirkt.');
  if (!await wranglerTilbuinn()) {
    throw new Error('wrangler er ekki innskrad. Keyrdu  npx wrangler login  i thessum sama glugga og reyndu aftur. '
      + 'Thetta er athugad HER svo thu tapir ekki samthykkinu a sidasta skrefi, eins og gerdist 15. og 16.9.');
  }
  p('');
  const id = await spyrja('Google OAuth Client ID: ', process.env.GMAIL_CLIENT_ID);
  const secret = await spyrja('Google OAuth Client Secret: ', process.env.GMAIL_CLIENT_SECRET);
  if (!id || !secret) throw new Error('Client ID og Secret eru bæði nauðsynleg');

  const slod = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', login_hint: 'aron@karp.is',
  });
  p('\n1) Bættu þessari slóð við „Authorized redirect URIs" á biðlaranum (ef hún er ekki þar):\n   ' + REDIRECT);
  p('\n2) Opnaðu þessa slóð í vafra og samþykktu MEÐ aron@karp.is:\n\n' + slod + '\n');
  // Opnum sjálf svo enginn þurfi að afrita nokkur hundruð stafa slóð úr skel sem brýtur hana.
  if (!process.env.GMAIL_CONSENT_NO_OPEN) try {
    const opna = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', slod.replace(/&/g, '^&')]]
      : process.platform === 'darwin' ? ['open', [slod]] : ['xdg-open', [slod]];
    spawn(opna[0], opna[1], { stdio: 'ignore', detached: true }).unref();
  } catch (e) { /* prentaða slóðin dugar */ }
  p('   ⚠ Google varar við „óstaðfestu appi" ef biðlarinn er í Testing — það er þitt eigið app: Advanced → Continue.\n');

  const code = await bidaEftirKoda();
  p('\n   …sæki token…');
  const tok = await j(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  }));
  if (!tok.refresh_token) throw new Error('Google skilaði engum refresh_token — fjarlægðu appið á myaccount.google.com/permissions og reyndu aftur (prompt=consent þarf nýtt samþykki)');
  p('   ✔ token fenginn · heimildir: ' + (tok.scope || '?'));

  // Sannreyna LESTUR áður en leyndarmálinu er skipt út — annars gæti sendingin brotnað fyrir ekki neitt.
  const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=' + encodeURIComponent('to:hjalp@karp.is newer_than:30d'), { headers: { authorization: 'Bearer ' + tok.access_token } });
  if (!pr.ok) throw new Error('lestrarprófun féll (' + pr.status + ') — heimildin skilaði sér ekki');
  const pd = await pr.json();
  p('   ✔ lestur virkar · ' + ((pd.messages || []).length ? 'fann póst á hjalp@' : 'ekkert nýlegt á hjalp@ (í lagi)'));

  p('\n3) Set GMAIL_REFRESH_TOKEN í Cloudflare (karp21) — gildið fer um stdin, sést hvergi:\n');
  await setjaSecret('GMAIL_REFRESH_TOKEN', tok.refresh_token);
  p('\n✅ Búið. Worker-inn les nú hjalp@ á 3 klst fresti — og „📥 Sækja póst" á karp.is/stjorn/ virkar strax.');
  p('   (Sendingin notar sama token og heldur áfram óbreytt.)\n');
  process.exit(0);
} catch (e) {
  p('\n❌ ' + (e && e.message ? e.message : e));
  p('   Ekkert var snert í Cloudflare — gamla tokeninu (send-heimild) var ekki skipt út.\n');
  process.exit(1);
}
