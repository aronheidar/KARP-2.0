import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KB, TICKET_TEGUNDIR, ticketSubject, parseTicketNr, efniUrLysingu, flokkaFallback, parseGreining, kbSjalfvirkt, greiningPrompt, ackVars } from './hjalp_agent.mjs';

test('ticketSubject + parseTicketNr eru samhverf og þola „Re:"/„Fwd:"', () => {
  const s = ticketSubject(42, 'Villa í verðmati  á   Leirdal 36');
  assert.equal(s, '[Karp #42] Villa í verðmati á Leirdal 36');
  assert.equal(parseTicketNr('Re: ' + s), 42);
  assert.equal(parseTicketNr('Fwd: RE: [karp #7]'), 7);
  assert.equal(parseTicketNr('Ný hjálparbeiðni'), null);
  assert.equal(ticketSubject(3, ''), '[Karp #3]');
});

test('efniUrLysingu: fyrsta setning, klippt á orðaskilum með …', () => {
  assert.equal(efniUrLysingu('Ég kemst ekki inn. Lykilorðið virkar ekki.'), 'Ég kemst ekki inn.');
  const langt = efniUrLysingu('Þetta er mjög löng lýsing án punkts sem heldur áfram og áfram og áfram um allt mögulegt sem gæti verið að');
  assert.ok(langt.length <= 71 && langt.endsWith('…'), langt);
  assert.equal(efniUrLysingu(''), 'Hjálparbeiðni');
});

test('flokkaFallback: lykilorðaflokkun + forgangur', () => {
  assert.deepEqual(flokkaFallback('Greiðslur & áskrift', 'Ég var rukkaður tvisvar fyrir sama mánuð'), { tegund: 'reikningur', forgangur: 1 });
  assert.deepEqual(flokkaFallback('Innskráning & aðgangur', 'Kemst ekki inn, lykilorðið er rangt'), { tegund: 'adgangur', forgangur: 2 });
  assert.equal(flokkaFallback('Villa í gögnum', 'Verðmatið sýnir ekki réttar tölur fyrir götuna').tegund, 'villa');
  assert.deepEqual(flokkaFallback('Annað', 'Væri gott að fá excel-útflutning'), { tegund: 'osk', forgangur: 3 });
  assert.equal(flokkaFallback('Annað', 'Hvernig reiknið þið leiguverðmatið?').tegund, 'spurning');
  assert.equal(flokkaFallback('Annað', 'Takk fyrir mig').tegund, 'annad');
});

test('parseGreining: gilt JSON, girðingar, ógilt gildi → hreinsað; rusl → null', () => {
  const g = parseGreining('```json\n{"tegund":"spurning","forgangur":"2","samantekt":"Spyr um verð.","kb":{"id":"verd","vissa":0.95},"svar":"","cto_brief":""}\n```');
  assert.equal(g.tegund, 'spurning'); assert.equal(g.forgangur, 2); assert.equal(g.kb.id, 'verd'); assert.equal(g.kb.vissa, 0.95);
  const g2 = parseGreining('Hér er greiningin: {"tegund":"geimvera","forgangur":9,"samantekt":"x","kb":{"id":"ekki-til","vissa":1}}');
  assert.equal(g2.tegund, 'annad'); assert.equal(g2.forgangur, 2); assert.equal(g2.kb, null);
  assert.equal(parseGreining('ekkert json hér'), null);
  assert.equal(parseGreining(''), null);
  const g3 = parseGreining('{"tegund":"villa","forgangur":1,"samantekt":"' + 'a'.repeat(500) + '","cto_brief":"Síðan /fasteignaverd/ hrynur"}');
  assert.ok(g3.samantekt.length <= 240); assert.equal(g3.cto_brief, 'Síðan /fasteignaverd/ hrynur');
});

test('kbSjalfvirkt: aðeins spurning/adgangur/reikningur með vissu ≥ 0,9 — villur fara alltaf til Arons', () => {
  assert.equal(kbSjalfvirkt({ tegund: 'spurning', kb: { id: 'verd', vissa: 0.95 } }).id, 'verd');
  assert.equal(kbSjalfvirkt({ tegund: 'spurning', kb: { id: 'verd', vissa: 0.8 } }), null);
  assert.equal(kbSjalfvirkt({ tegund: 'villa', kb: { id: 'verd', vissa: 1 } }), null);
  assert.equal(kbSjalfvirkt({ tegund: 'spurning', kb: null }), null);
  assert.equal(kbSjalfvirkt(null), null);
});

test('KB: einkvæm id, öll með svar; prompt telur þau öll og krefst JSON', () => {
  const ids = KB.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  KB.forEach((k) => assert.ok(k.svar.length > 40 && k.um.length > 5, k.id));
  const p = greiningPrompt();
  ids.forEach((id) => assert.ok(p.includes('- ' + id + ':'), id));
  TICKET_TEGUNDIR.forEach((t) => assert.ok(p.includes(t)));
  assert.ok(/EINGÖNGU JSON/.test(p));
});

test('ackVars: efni fellur á lýsingu ef efni vantar', () => {
  assert.deepEqual(ackVars({ id: 5, nafn: 'Jóna', efni: '', lysing: 'Gögnin vantar. Meira.' }), { nr: '5', nafn: 'Jóna', efni: 'Gögnin vantar.' });
});
