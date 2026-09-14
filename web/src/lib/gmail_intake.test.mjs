import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LES_SCOPES, afkodaB64, afkodaHaus, erEiginn, erSjalfvirkur, gmailLeit, hausaMap, hefurLesheimild, hreinsaTilvitnun, netfangUrFra, textiUrPayload, urHtml } from './gmail_intake.mjs';

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const hluti = (mimeType, texti, charset) => ({ mimeType, headers: charset ? [{ name: 'Content-Type', value: mimeType + '; charset=' + charset }] : [], body: { data: b64u(texti) } });

test('hefurLesheimild: send-heimild EIN dugir ekki — readonly/modify/full duga', () => {
  assert.equal(hefurLesheimild('https://www.googleapis.com/auth/gmail.send'), false);
  assert.equal(hefurLesheimild(''), false);
  assert.equal(hefurLesheimild('openid https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly'), true);
  for (const s of LES_SCOPES) assert.equal(hefurLesheimild([s]), true, s);
});

test('gmailLeit: útilokar eigin netföng + sent/chats/drafts og klemmir dagafjölda', () => {
  const q = gmailLeit({ netfang: 'hjalp@karp.is', dagar: 2, eigin: ['noreply@karp.is', 'HJALP@karp.is'] });
  assert.match(q, /\(to:hjalp@karp\.is OR deliveredto:hjalp@karp\.is\)/);
  assert.match(q, /-from:hjalp@karp\.is/);
  assert.match(q, /-from:noreply@karp\.is/);
  assert.equal((q.match(/-from:hjalp@karp\.is/g) || []).length, 1, 'hástafa-tvítak sameinast');
  for (const x of ['-in:sent', '-in:chats', '-in:drafts', 'newer_than:2d']) assert.ok(q.includes(x), x);
  assert.match(gmailLeit({ dagar: 999 }), /newer_than:30d/);
  assert.match(gmailLeit({ dagar: 0 }), /newer_than:7d/);
});

test('afkodaHaus: B- og Q-kóðun, samliggjandi orð límd saman, latin1 og ókóðað óbreytt', () => {
  assert.equal(afkodaHaus('=?UTF-8?B?' + b64('Þetta er efni') + '?='), 'Þetta er efni');
  assert.equal(afkodaHaus('=?UTF-8?Q?Villa_=C3=AD_ver=C3=B0mati?='), 'Villa í verðmati');
  // RFC 2047: bilið MILLI samliggjandi orða er umbúðir, ekki texti
  assert.equal(afkodaHaus('=?UTF-8?B?' + b64('Jón ') + '?= =?UTF-8?B?' + b64('Þór') + '?='), 'Jón Þór');
  assert.equal(afkodaHaus('=?ISO-8859-1?Q?J=F3n?='), 'Jón');
  assert.equal(afkodaHaus('Venjuleg efnislína'), 'Venjuleg efnislína');
  assert.equal(afkodaHaus(null), '');
});

test('afkodaB64: base64url OG venjulegt base64, rusl → tómt', () => {
  assert.equal(afkodaB64(b64u('Sæl og blessuð — 100 kr.')), 'Sæl og blessuð — 100 kr.');
  assert.equal(afkodaB64(b64('Sæl')), 'Sæl');
  assert.equal(afkodaB64('!!!ekki base64!!!'), '');
  assert.equal(afkodaB64(''), '');
});

test('hausaMap: lágstafir, fyrsta gildi ræður, gildin afkóðuð', () => {
  const h = hausaMap({ headers: [{ name: 'From', value: '=?UTF-8?B?' + b64('Anna Björk') + '?= <anna@example.is>' }, { name: 'SUBJECT', value: 'Halló' }, { name: 'Subject', value: 'seinna gildi' }] });
  assert.equal(h.from, 'Anna Björk <anna@example.is>');
  assert.equal(h.subject, 'Halló');
  assert.deepEqual(hausaMap(null), {});
});

test('netfangUrFra: nafn+netfang, bert netfang, gæsalappir, ógilt → tómt netfang (póstinum sleppt)', () => {
  assert.deepEqual(netfangUrFra('Anna Björk <Anna@Example.IS>'), { nafn: 'Anna Björk', netfang: 'anna@example.is' });
  assert.deepEqual(netfangUrFra('"Jón, Þór" <jon@x.is>'), { nafn: 'Jón, Þór', netfang: 'jon@x.is' });
  assert.deepEqual(netfangUrFra('bert@x.is'), { nafn: '', netfang: 'bert@x.is' });
  assert.deepEqual(netfangUrFra('Enginn <ekkinetfang>'), { nafn: 'Enginn', netfang: '' });
  assert.deepEqual(netfangUrFra(''), { nafn: '', netfang: '' });
});

test('textiUrPayload: text/plain er tekinn fram yfir HTML, líka innst í margþættu tré', () => {
  const p = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [hluti('text/plain', 'Halló, þetta er erindið.'), hluti('text/html', '<p>Halló, <b>HTML</b></p>')] },
    { mimeType: 'application/pdf', body: { attachmentId: 'x' } },
  ] };
  assert.equal(textiUrPayload(p), 'Halló, þetta er erindið.');
});

test('textiUrPayload: enginn plain-hluti → HTML strípað; latin1-hluti afkóðaður; klippt á max', () => {
  const html = { mimeType: 'text/html', headers: [], body: { data: b64u('<div>Lína 1<br>Lína&nbsp;2 &amp; meira</div><script>ill()</script>') } };
  assert.equal(textiUrPayload({ mimeType: 'multipart/alternative', parts: [html] }), 'Lína 1\nLína 2 & meira');
  const latin = { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="iso-8859-1"' }], body: { data: Buffer.from([0x4a, 0xf3, 0x6e]).toString('base64url') } };
  assert.equal(textiUrPayload(latin), 'Jón');
  assert.equal(textiUrPayload(hluti('text/plain', 'x'.repeat(50)), 10).length, 10);
  assert.equal(textiUrPayload(null), '');
});

test('urHtml: &amp;lt; verður að læsilegu &lt; (afkóðunarröðin skiptir máli)', () => {
  assert.equal(urHtml('a &amp;lt; b'), 'a &lt; b');
  assert.equal(urHtml('<p>a</p><p>b</p>').trim(), 'a\nb');
});

test('hreinsaTilvitnun: klippir Gmail-keðju, >-tilvitnun og Outlook-haus', () => {
  assert.equal(hreinsaTilvitnun('Nýja spurningin mín.\n\nOn Sat, Sep 13, 2026 at 9:21 PM Karp <hjalp@karp.is> wrote:\n> gamalt svar'), 'Nýja spurningin mín.');
  assert.equal(hreinsaTilvitnun('Takk fyrir svarið, en þetta virkar enn ekki.\n\n> Sæl, prófaðu að hlaða síðunni aftur'), 'Takk fyrir svarið, en þetta virkar enn ekki.');
  assert.equal(hreinsaTilvitnun('Sjáðu þetta.\nÞann 13. september 2026 skrifaði Sigrún:\nblabla'), 'Sjáðu þetta.');
  assert.equal(hreinsaTilvitnun('Erindið mitt hér.\nSent from my iPhone'), 'Erindið mitt hér.');
});

test('hreinsaTilvitnun: áframsending sem BYRJAR á keðjumerki heldur öllu (frekar of mikið en tómt)', () => {
  const fwd = 'From: notandi@x.is\nSubject: Villa\n\nÞetta er raunverulega erindið sem áframsent var.';
  assert.equal(hreinsaTilvitnun(fwd), fwd.trim());
  assert.equal(hreinsaTilvitnun('> bara tilvitnun'), '> bara tilvitnun');
  assert.equal(hreinsaTilvitnun(''), '');
});

test('erEiginn: lykkjuvörn gegn eigin sendingum (hástafir/bil skipta ekki máli)', () => {
  const eigin = ['hjalp@karp.is', 'noreply@karp.is'];
  assert.equal(erEiginn('HJALP@Karp.is ', eigin), true);
  assert.equal(erEiginn('anna@example.is', eigin), false);
  assert.equal(erEiginn('', eigin), false);
  assert.equal(erEiginn('hjalp@karp.is', []), false);
});

test('erSjalfvirkur: fjarvistarsvör, póstlistar og póstþjónar sleppt — venjulegt erindi ekki', () => {
  assert.equal(erSjalfvirkur({ from: 'Anna <anna@x.is>', subject: 'Hjálp' }), false);
  assert.equal(erSjalfvirkur({ 'auto-submitted': 'auto-replied' }), true);
  assert.equal(erSjalfvirkur({ 'auto-submitted': 'no' }), false);
  assert.equal(erSjalfvirkur({ precedence: 'bulk' }), true);
  assert.equal(erSjalfvirkur({ 'list-unsubscribe': '<mailto:x@y.is>' }), true);
  assert.equal(erSjalfvirkur({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' }), true);
  assert.equal(erSjalfvirkur({ from: 'Tilkynning <no-reply@banki.is>' }), true);
  assert.equal(erSjalfvirkur({}), false);
});
