import { test } from 'node:test';
import assert from 'node:assert';
import { escF, ktFmt, mkrF, krFmt } from './snid.mjs';

// ── escF ─────────────────────────────────────────────────────────────────────

test('escF flýr fjórum HTML-stöfunum: & < > "', () => {
  assert.equal(escF('&'), '&amp;');
  assert.equal(escF('<'), '&lt;');
  assert.equal(escF('>'), '&gt;');
  assert.equal(escF('"'), '&quot;');
});

test('escF skilar tómum streng fyrir null/undefined (ekki "null"/"undefined")', () => {
  assert.equal(escF(null), '');
  assert.equal(escF(undefined), '');
  assert.equal(escF(''), '');
});

test('escF flýr & FYRST svo eining tvöfaldist ekki', () => {
  // Röð skiptir máli: ef < væri flúið á undan & yrði úr þessu "&amp;amp;lt;".
  assert.equal(escF('&lt;'), '&amp;lt;');
  assert.equal(escF('&amp;'), '&amp;amp;');
});

test('escF skiptir út ÖLLUM tilvikum, ekki bara því fyrsta', () => {
  assert.equal(escF('a&b&c'), 'a&amp;b&amp;c');
  assert.equal(escF('<<>>'), '&lt;&lt;&gt;&gt;');
});

test('escF þvingar önnur gildi í streng', () => {
  assert.equal(escF(0), '0');
  assert.equal(escF(5), '5');
  assert.equal(escF(false), 'false');
});

test('escF aftengir innspýtingu í raunverulegum nöfnum og gildrum', () => {
  assert.equal(escF('Jón & Co <hf>'), 'Jón &amp; Co &lt;hf&gt;');
  assert.equal(
    escF('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
  );
  // Brýtur sig út úr attr="…" — sannreynir að gæsalappir sleppi aldrei í gegn.
  assert.equal(escF('" onerror="alert(1)'), '&quot; onerror=&quot;alert(1)');
});

test('escF flýr EKKI úrfellingarmerki — aðeins nothæft í attr="…", aldrei attr=\'…\'', () => {
  // Skjalfest takmörkun (ekki villa í dag): allar þrjár síðurnar nota tvöfaldar
  // gæsalappir um eigindi. Noti einhver attr='…' þarf að herða escF fyrst.
  assert.equal(escF("O'Brien"), "O'Brien");
});

// ── ktFmt ────────────────────────────────────────────────────────────────────

test('ktFmt setur bandstrik í 10 stafa kennitölu', () => {
  assert.equal(ktFmt('5501012190'), '550101-2190');
  assert.equal(ktFmt('0101302989'), '010130-2989');
});

test('ktFmt skilar þegar sniðinni kennitölu óbreyttri', () => {
  // Lengd 11 → fellur í gegn, ekkert tvöfalt bandstrik.
  assert.equal(ktFmt('550101-2190'), '550101-2190');
});

test('ktFmt skilar tómum streng fyrir null/undefined/tómt', () => {
  assert.equal(ktFmt(null), '');
  assert.equal(ktFmt(undefined), '');
  assert.equal(ktFmt(''), '');
});

test('ktFmt hleypir röngum lengdum óbreyttum í gegn', () => {
  assert.equal(ktFmt('123'), '123');
  assert.equal(ktFmt('55010121901'), '55010121901');
});

test('ktFmt: tala án .length fellur í gegn óbreytt (kallandi verður að senda streng)', () => {
  // Skjalfestur hængur: 5501012190 sem TALA fær ekkert bandstrik.
  assert.equal(ktFmt(5501012190), 5501012190);
  assert.equal(ktFmt(0), '');
});

// ── mkrF ─────────────────────────────────────────────────────────────────────

test('mkrF breytir krónum í milljónir með íslenskum þúsundapunkti', () => {
  assert.equal(mkrF(1e6), '1');
  assert.equal(mkrF(1234e6), '1.234');
  assert.equal(mkrF(1234567e6), '1.234.567');
});

test('mkrF námundar að næstu milljón', () => {
  assert.equal(mkrF(1.4e6), '1');
  assert.equal(mkrF(1.5e6), '2');
  assert.equal(mkrF(999999), '1');
  assert.equal(mkrF(499999), '0');
});

test('mkrF heldur mínusmerki', () => {
  assert.equal(mkrF(-1e6), '-1');
  assert.equal(mkrF(-1234e6), '-1.234');
});

test('mkrF skilar "0" fyrir núll', () => {
  assert.equal(mkrF(0), '0');
});

test('krFmt: íslenskur þúsundapunktur án toLocaleString', () => {
  assert.equal(krFmt(1900), '1.900');
  assert.equal(krFmt(3900), '3.900');
  assert.equal(krFmt(9900), '9.900');
  assert.equal(krFmt(12900), '12.900');
  assert.equal(krFmt(990), '990');
  assert.equal(krFmt(1234567), '1.234.567');
  assert.equal(krFmt(0), '0');
  assert.equal(krFmt(null), '0');
  assert.equal(krFmt(undefined), '0');
  assert.equal(krFmt('2900'), '2.900');
});
