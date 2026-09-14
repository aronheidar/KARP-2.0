import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PERSONUR, PERSONA_IDS, persona, MOOT_ADGERDIR, MOOT_AFSTODUR, MOOT_JA_TEXTI, MOOT_VILLUR, mootVilluTexti, veljaFundarmenn, AVATAR_PALETTE, avatarSvg, avatarDataUri, ROFAR, rofiLykill } from './personur.mjs';

const RETT_ROD = ['sigrun', 'hrafn', 'elin', 'bjarki', 'unnur', 'kari', 'hildur', 'egill'];
const HAETTULEGT = /<script|on[a-z]+=|href=|url\(#|<defs|id="/i;

test('einingin er hrein og isomorphic: engin import, engin Date, engin Math.random', () => {
  const src = readFileSync(fileURLToPath(new URL('./personur.mjs', import.meta.url)), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src), 'engin import-yfirlýsing');
  assert.ok(!/\bnew Date\b|\bDate\.\w+\(/.test(src), 'engin Date-notkun');
  assert.ok(!/Math\.random\(/.test(src), 'engin Math.random');
  assert.ok(!/\b(document|window|process|require)\b/.test(src), 'engin DOM/node-hnattbreyta');
});

test('P1 PERSONUR: 8 persónur, 4 kk / 4 kvk, einkvæm id, öll svið til, röð frosin', () => {
  assert.equal(PERSONUR.length, 8);
  assert.equal(PERSONUR.filter((p) => p.kyn === 'kk').length, 4);
  assert.equal(PERSONUR.filter((p) => p.kyn === 'kvk').length, 4);
  const ids = PERSONUR.map((p) => p.id);
  assert.equal(new Set(ids).size, 8);
  ids.forEach((id) => assert.match(id, /^[a-z]+$/));
  PERSONUR.forEach((p) => {
    assert.ok(p.nafn && p.hlutverk && p.emoji, p.id);
    assert.match(p.litur, /^#[0-9a-f]{6}$/);
    assert.ok(p.sjonarhorn.length >= 20, p.id + ' sjonarhorn');
    assert.ok(p.spyr.endsWith('?'), p.id + ' spyr');
    assert.ok(p.undirskrift.includes(p.nafn), p.id + ' undirskrift');
    assert.equal(typeof p.svipur, 'object');
    assert.ok(p.svipur.hud >= 0 && p.svipur.hud <= 3, p.id + ' hud');
    assert.ok(p.svipur.har >= 0 && p.svipur.har <= 5, p.id + ' har');
    assert.ok(['mondlu', 'kringlott'].includes(p.svipur.augu), p.id + ' augu');
    assert.equal(typeof p.svipur.harStill, 'string');
  });
  assert.deepEqual(PERSONA_IDS, RETT_ROD);
  assert.equal(persona('sigrun').undirskrift, 'Sigrún — þjónustufulltrúi Karp');
  assert.equal(persona('kari').hlutverk, 'COO · fundarstjóri');
});

test('P2 persona(): finnur eftir id, skilar null fyrir allt annað og kastar aldrei', () => {
  assert.equal(persona('sigrun').nafn, 'Sigrún');
  assert.equal(persona('hrafn').kyn, 'kk');
  assert.equal(persona('x'), null);
  assert.equal(persona(null), null);
  assert.equal(persona(undefined), null);
  assert.equal(persona(42), null);
  assert.equal(persona({ id: 'sigrun' }), null);
  assert.equal(persona('<img onerror=1>'), null);
  assert.equal(persona('Sigrún'), null);
});

test('P3 MOOT_ADGERDIR/MOOT_AFSTODUR: föst tafla með íslenskum merkimiðum', () => {
  assert.deepEqual(Object.keys(MOOT_ADGERDIR).sort(), ['cto', 'hafna', 'loka', 'meira', 'svara']);
  Object.values(MOOT_ADGERDIR).forEach((v) => assert.ok(typeof v === 'string' && v.length > 3, v));
  assert.equal(MOOT_ADGERDIR.svara, 'Senda svar Sigrúnar');
  assert.equal(MOOT_ADGERDIR.cto, 'Senda á CTO (Hrafn)');
  assert.deepEqual(MOOT_AFSTODUR, ['med', 'moti', 'hja']);
});

test('P3b MOOT_JA_TEXTI: einn texti per aðgerð, segir satt — svara/meira „opna“ (Aron sendir), cto/hafna/loka keyra', () => {
  assert.deepEqual(Object.keys(MOOT_JA_TEXTI).sort(), Object.keys(MOOT_ADGERDIR).sort(), 'sömu lyklar og MOOT_ADGERDIR');
  Object.values(MOOT_JA_TEXTI).forEach((v) => assert.ok(v.startsWith('Já — '), v));
  assert.match(MOOT_JA_TEXTI.svara, /opna drög/); assert.ok(MOOT_JA_TEXTI.svara.includes('ég sendi'), 'Aron sendir sjálfur');
  assert.match(MOOT_JA_TEXTI.meira, /opna spurningu/);
  assert.ok(!/senda svar/i.test(MOOT_JA_TEXTI.svara), 'lofar EKKI sendingu');
  assert.match(MOOT_JA_TEXTI.cto, /senda á CTO/);
});

test('P3c MOOT_VILLUR/mootVilluTexti: íslenska fyrir alla villukóða worker-sins, „ai NNN“ → þjónusta svaraði NNN, óþekkt → villa', () => {
  for (const k of ['parse', 'max_tokens', 'timi', 'lykill', 'bid', 'dagthak', 'vistun', 'ai json', 'net']) assert.ok(MOOT_VILLUR[k] && MOOT_VILLUR[k].length > 3 && !MOOT_VILLUR[k].includes('_') && MOOT_VILLUR[k] !== k, k + ' → ' + MOOT_VILLUR[k]);
  assert.equal(mootVilluTexti('parse'), 'ónothæf fundargerð');
  assert.equal(mootVilluTexti('ai 529'), 'þjónusta svaraði 529');
  assert.equal(mootVilluTexti('ai json'), 'ónothæft svar þjónustu');
  assert.equal(mootVilluTexti('eitthvad'), 'villa'); assert.equal(mootVilluTexti(null), 'villa'); assert.equal(mootVilluTexti(''), 'villa');
  assert.equal(mootVilluTexti('<img onerror=1>'), 'villa', 'inntak ratar aldrei í úttak');
});

test('P4 veljaFundarmenn: 4–5 (≥2 ræðumenn auk Sigrúnar), sigrun fyrst, kari síðastur, engin tvítekning, deterministískt', () => {
  const langt = 'Verðmatið sýnir ranga tölu og gögnin eru gömul; ég vil endurgreiðslu skv. skilmálum, þetta fyrirtæki hefur samning, kennitala 010190-1234, birti á LinkedIn ef villa virkar ekki';
  for (const tegund of ['villa', 'spurning', 'adgangur', 'reikningur', 'osk', 'annad', undefined, 'geimvera']) {
    for (const texti of ['', langt, null]) {
      const f = veljaFundarmenn(tegund, texti);
      assert.ok(f.length >= 4 && f.length <= 5, tegund + ': lengd ' + f.length + ' (≥2 ræðumenn auk Sigrúnar svo ágreiningur „með nafni“ sé mögulegur)');
      assert.equal(f[0], 'sigrun', tegund);
      assert.equal(f[f.length - 1], 'kari', tegund);
      assert.equal(new Set(f).size, f.length, tegund + ': tvítekning ' + f.join(','));
      f.forEach((id) => assert.ok(PERSONA_IDS.includes(id), id));
      assert.deepEqual(veljaFundarmenn(tegund, texti), f, 'deterministískt');
    }
  }
  const has = (f, ...ids) => ids.forEach((id) => assert.ok(f.includes(id), id + ' vantar í ' + f.join(',')));
  has(veljaFundarmenn('villa', 'verðmat sýnir ranga tölu'), 'hrafn', 'unnur');
  assert.deepEqual(veljaFundarmenn('villa', ''), ['sigrun', 'hrafn', 'egill', 'kari'], 'villa án gagnaorða: Hrafn + Egill (viðskiptavinurinn)');
  has(veljaFundarmenn('adgangur', ''), 'hrafn', 'hildur');
  has(veljaFundarmenn('reikningur', 'vil endurgreiðslu'), 'elin', 'hildur');
  assert.deepEqual(veljaFundarmenn('reikningur', ''), ['sigrun', 'elin', 'egill', 'kari'], 'reikningur án kveikjuorða: Elín + Egill');
  const osk = veljaFundarmenn('osk', '');
  has(osk, 'egill', 'bjarki', 'hrafn');
  assert.equal(osk.length, 5);
  has(veljaFundarmenn('spurning', 'hvaðan koma gögnin'), 'egill', 'unnur');
  // Verðspurning → Elín (CFO) MEÐ Agli — kostnaðarsjónarhornið sem gefur Moot-inu gildi
  has(veljaFundarmenn('spurning', 'hvað kostar Kvótavaktin fyrir 3?'), 'egill', 'elin');
  assert.deepEqual(veljaFundarmenn('spurning', 'hvað kostar áskriftin'), ['sigrun', 'egill', 'elin', 'kari']);
  assert.deepEqual(veljaFundarmenn('spurning', 'almenn spurning'), ['sigrun', 'egill', 'unnur', 'kari'], 'spurning án kveikjuorða fyllt upp með Unni');
  has(veljaFundarmenn('annad', 'hér er kennitala 010190-1234'), 'hildur');
  has(veljaFundarmenn(undefined, 'síðan virkar ekki'), 'egill', 'hrafn');
  has(veljaFundarmenn('annad', 'ég skrifa um þetta á LinkedIn'), 'bjarki');
  // Þvert á tegund: kostnaðar-/endurgreiðsluorð kalla Elínu inn
  has(veljaFundarmenn('villa', 'villa og ég vil endurgreiðslu'), 'hrafn', 'elin');
  has(veljaFundarmenn('annad', 'Vil endurgreiðslu, var rukkaður tvisvar'), 'egill', 'elin');
  // Ræðuröð: extras í forgangsröð milli sigrun og kari
  assert.deepEqual(veljaFundarmenn('reikningur', 'endurgreiðsla skilmálar fyrirtæki'), ['sigrun', 'elin', 'hildur', 'egill', 'kari']);
  // 6 kveikjuorð → aldrei yfir 5, fremstu halda
  const mikid = veljaFundarmenn('reikningur', 'endurgreiðslu skilmála fyrirtæki kennitala linkedin villa');
  assert.equal(mikid.length, 5);
  assert.deepEqual(mikid, ['sigrun', 'elin', 'hildur', 'egill', 'kari']);
});

test('P5 avatarSvg: gilt, öruggt, deterministískt SVG fyrir allar persónur + aron + óþekkt í 32/64/120', () => {
  const allir = [...PERSONA_IDS, 'aron', 'ókunnur'];
  for (const id of allir) {
    for (const size of [32, 64, 120]) {
      for (const talar of [false, true]) {
        const s = avatarSvg(id, { size, talar });
        assert.ok(s.startsWith('<svg'), id);
        assert.ok(s.endsWith('</svg>'), id);
        assert.ok(!HAETTULEGT.test(s), id + '/' + size + ': hættulegt mynstur');
        assert.ok(s.includes('width="' + size + '"') && s.includes('height="' + size + '"'), id + '/' + size);
        assert.ok(s.includes('viewBox="0 0 64 64"'), id);
        assert.equal(avatarSvg(id, { size, talar }), s, 'deterministískt ' + id);
        (s.match(/#[0-9a-fA-F]{6}/g) || []).forEach((c) => assert.ok(AVATAR_PALETTE.includes(c), id + ': litur ' + c + ' utan palettu'));
      }
    }
  }
  // 8 ólíkar persónur → 8 ólíkir strengir í smæstu stærð
  assert.equal(new Set(PERSONA_IDS.map((id) => avatarSvg(id, { size: 32 }))).size, 8);
  // kyn-merki beint eftir <svg …>
  PERSONUR.forEach((p) => {
    const s = avatarSvg(p.id, { size: 64 });
    const m = s.indexOf('>') + 1;
    if (p.kyn === 'kvk') { assert.equal(s.slice(m, m + 10), '<!--kvk-->', p.id); assert.ok(!s.includes('<!--kk-->'), p.id); }
    else { assert.equal(s.slice(m, m + 9), '<!--kk-->', p.id); assert.ok(!s.includes('<!--kvk-->'), p.id); }
  });
  // stærðarþrep: 32 sleppir brúnum/augnhárum/eyrnalokkum, 64 hefur þær
  assert.ok(!avatarSvg('sigrun', { size: 32 }).includes('class="brun"'));
  assert.ok(avatarSvg('sigrun', { size: 64 }).includes('class="brun"'));
  assert.ok(!avatarSvg('sigrun', { size: 32 }).includes('class="augnhar"'));
  assert.ok(avatarSvg('sigrun', { size: 64 }).includes('class="augnhar"'));
  assert.ok(!avatarSvg('hrafn', { size: 120 }).includes('class="augnhar"'), 'kk fá engin augnhár');
  // gleraugu HALDAST í öllum stærðum (kennimark Elínar/Unnar)
  assert.ok(avatarSvg('elin', { size: 32 }).includes('r="4.6"'));
  assert.ok(!avatarSvg('hrafn', { size: 32 }).includes('r="4.6"'));
  // talar: opinn munnur (ellipse í munnlit) og gull-ljómi; kyrr: bros-path
  const t = avatarSvg('hrafn', { size: 64, talar: true });
  assert.ok(t.includes('class="stj-moot-av talar"'));
  assert.match(t, /<ellipse [^>]*fill="#5a2a2a"/);
  assert.ok(!t.includes('stroke="#5a2a2a"'), 'enginn path-munnur þegar talað er');
  const k = avatarSvg('hrafn', { size: 64, talar: false });
  assert.ok(k.includes('class="stj-moot-av"'));
  assert.ok(k.includes('stroke="#5a2a2a"'));
  assert.ok(!/<ellipse [^>]*fill="#5a2a2a"/.test(k));
  assert.notEqual(t, k);
  // óþekkt id: inntakið fer ALDREI inn í úttakið
  const u = avatarSvg('<img src=x onerror=1>');
  assert.ok(!u.includes('img') && !u.includes('onerror'));
  assert.equal(u, avatarSvg('ókunnur'), 'öll óþekkt id gefa sama varahring');
  assert.equal(avatarSvg(null), avatarSvg(42));
  assert.ok(u.includes('>?<'));
  // aron: stóll, gullið A, ekkert andlit (enginn húðlitur)
  const a = avatarSvg('aron', { size: 64 });
  assert.ok(a.includes('stj-moot-aron-stoll') && a.includes('>A<'));
  AVATAR_PALETTE.slice(0, 4).forEach((hud) => assert.ok(!a.includes(hud), 'HUD-litur í Aroni: ' + hud));
  assert.ok(a.includes('aria-label="Aron, lokaatkvæði"'));
  // aria-label úr PERSONUR
  assert.ok(avatarSvg('sigrun').includes('aria-label="Sigrún, þjónustufulltrúi"'));
  // sjálfgildi: size 64, talar false; ógild stærð → 64, of lítil → 16
  assert.equal(avatarSvg('kari'), avatarSvg('kari', { size: 64, talar: false }));
  assert.equal(avatarSvg('kari', { size: 'abc' }), avatarSvg('kari', { size: 64 }));
  assert.ok(avatarSvg('kari', { size: 4 }).includes('width="16"'));
});

test('P6 avatarDataUri: encodeURIComponent af avatarSvg, samhverft', () => {
  const u = avatarDataUri('kari', { size: 32 });
  assert.ok(u.startsWith('data:image/svg+xml;utf8,%3Csvg'), u.slice(0, 40));
  assert.equal(decodeURIComponent(u.slice('data:image/svg+xml;utf8,'.length)), avatarSvg('kari', { size: 32 }));
  assert.ok(avatarSvg('kari').includes('xmlns="http://www.w3.org/2000/svg"'), 'xmlns þarf svo <img src=data:> virki');
});

test('Hrafn er forritari, ekki CTO — titill og undirskrift fylgjast að', () => {
  const h = persona('hrafn');
  assert.equal(h.hlutverk, 'forritari');
  assert.equal(h.undirskrift, 'Hrafn — forritari Karp');
  assert.ok(!JSON.stringify(PERSONUR).includes('CTO'), 'ekkert „CTO" eftir í persónuskránni');
});

test('ROFAR: aðeils starfsmenn með vél fá rofa; Sigrún heldur gamla lyklinum', () => {
  assert.equal(rofiLykill('sigrun'), 'hjalp_agent_off');   // ⚠ ekkert endurnefnt — flæðið í loftinu les þennan lykil
  assert.equal(rofiLykill('hrafn'), 'rofi_hrafn');
  assert.equal(rofiLykill('kari'), null);
  assert.equal(rofiLykill('ekki-til'), null);
  assert.equal(rofiLykill(null), null);
  for (const id of Object.keys(ROFAR)) assert.ok(PERSONA_IDS.includes(id), id + ' er til');
  // Erfðir eiginleikar mega ALDREI skila lykli — annars gæti `?starfsmadur=__proto__` slökkt á einhverju
  for (const gildra of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(rofiLykill(gildra), null, gildra);
  for (const rusl of [undefined, 42, {}, [], true]) assert.equal(rofiLykill(rusl), null, String(rusl));
});
