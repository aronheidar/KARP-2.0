// skriptur/lib/gjaldthrot.test.mjs
// Gjaldþrot og nýskráningar (FYR03001 + FYR03010). Tölurnar birtast á /gjaldthrot/ og á forsíðu, svo
// hver útreikningur er festur hér: gluggar, frá áramótum, heil ár, röðun bálka og útgáfuskörun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREYTUR, lesaPx, manudirFra, hlidra, nyjastiManudur, summa, rullandi12, fraAramotum, breytingPct,
  hlutfallSamhengi, hreinsaHeiti, timabilsHeiti, balkaTafla, smidaGjaldthrot,
} from './gjaldthrot.mjs';

const fastar = (fra, til, v) => Object.fromEntries(manudirFra(fra, til).map((m) => [m, v]));

test('lesaPx les víddir úr columns, þolir lækkandi röð og gerir „..“ að null', () => {
  const svar = {
    columns: [{ code: 'Mánuður', type: 't' }, { code: 'Atvinnugreinar', type: 'd' }, { code: 'Rekstrarform', type: 'd' }, { code: 'Breytur', type: 'd' }, { code: 'tafla', type: 'c' }],
    data: [
      { key: ['2026M02', 'Alls', 'Alls', 'Fjöldi gjaldþrota'], values: ['12'] },
      { key: ['2026M01', 'Alls', 'Alls', 'Fjöldi gjaldþrota'], values: ['..'] },
    ],
  };
  assert.deepEqual(lesaPx(svar), { Alls: { 'Fjöldi gjaldþrota': { '2026M02': 12, '2026M01': null } } });
  assert.throws(() => lesaPx({ columns: [{ code: 'Mánuður', type: 't' }], data: [] }), /vantar vídd/);
});

test('mánaðaraðgerðir yfir áramót', () => {
  assert.deepEqual(manudirFra('2025M11', '2026M02'), ['2025M11', '2025M12', '2026M01', '2026M02']);
  assert.equal(hlidra('2026M06', 11), '2025M07');
  assert.equal(hlidra('2026M06', 23), '2024M07');
  assert.equal(nyjastiManudur({ '2026M05': 3, '2026M06': null, '2025M12': 1 }), '2026M05');
});

test('summa er null ef einhvern mánuð vantar og 12 mánaða summan bíður heils glugga', () => {
  const r = Object.fromEntries(manudirFra('2025M01', '2026M01').map((m, i) => [m, i + 1]));   // 1..13
  assert.equal(summa(r, ['2025M01', '2025M02']), 3);
  assert.equal(summa(r, ['2024M12', '2025M01']), null);
  assert.deepEqual(rullandi12(r, ['2025M11', '2025M12', '2026M01']), [null, 78, 90]);
});

test('frá áramótum á móti sömu mánuðum árið áður, breyting í heilum prósentum', () => {
  const r = { '2025M01': 10, '2025M02': 20, '2025M03': 99, '2026M01': 15, '2026M02': 30 };
  assert.deepEqual(fraAramotum(r, '2026M02'), { nu: 45, fyrra: 30 });
  assert.equal(breytingPct(45, 30), 50);
  assert.equal(breytingPct(693, 595), 16);
  assert.equal(breytingPct(1168, 1217), -4);
  assert.equal(breytingPct(5, 0), null);
  assert.equal(breytingPct(null, 5), null);
  assert.ok(Object.is(breytingPct(1000, 1003), 0), 'lítil lækkun verður 0, ekki -0');
});

test('hlutfall nýskráninga á gjaldþrot: aðeins heil ár í lægsta og hæsta gildi', () => {
  const nyskr = { ...fastar('2010M01', '2010M12', 20), ...fastar('2011M01', '2011M12', 30), ...fastar('2012M01', '2012M06', 50) };
  const skrad = fastar('2010M01', '2012M06', 10);
  const h = hlutfallSamhengi(nyskr, skrad, '2012M06');
  assert.deepEqual(h.lagmark, { ar: 2010, v: 2 });
  assert.deepEqual(h.hamark, { ar: 2011, v: 3 });                  // hálfa árið 2012 (5) er ekki með
  assert.equal(h.nu, 4);                                             // (6·30 + 6·50) / 120
});

test('heiti greina án ÍSAT-kóða, líka þegar svigi er í nafninu', () => {
  assert.deepEqual(hreinsaHeiti('Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)'), { nafn: 'Byggingarstarfsemi og mannvirkjagerð', isat: '41-43' });
  assert.deepEqual(hreinsaHeiti('Atvinnugreinaflokkun iðnaðarins (alls) (ÍSAT2008: 05-33 án 102, 41-43)'), { nafn: 'Atvinnugreinaflokkun iðnaðarins (alls)', isat: '05-33 án 102, 41-43' });
  assert.deepEqual(hreinsaHeiti('Óþekkt starfsemi'), { nafn: 'Óþekkt starfsemi', isat: null });
});

test('heiti tímabils frá áramótum', () => {
  assert.equal(timabilsHeiti(2026, 6), 'jan–jún 2026');
  assert.equal(timabilsHeiti(2026, 1), 'jan 2026');
  assert.equal(timabilsHeiti(2025, 12), 'árið 2025');
});

// Fastar mánaðartölur: `fyrr` í 2024M07–2025M06 og `nu` í 2025M07–2026M06.
function greinaradir(spec) {
  const tvo = (fyrr, nu) => ({ ...fastar('2024M07', '2025M06', fyrr), ...fastar('2025M07', '2026M06', nu) });
  const ut = {};
  for (const [kodi, g] of Object.entries(spec)) {
    ut[kodi] = {
      [BREYTUR.skradGrein]: tvo(0, g.skrad),
      [BREYTUR.virk]: tvo(g.virkFyrra, g.virk),
      [BREYTUR.launafolk]: tvo(0, g.launafolk ?? 0),
      [BREYTUR.velta]: tvo(0, g.velta ?? 0),
    };
  }
  return ut;
}

test('bálkatafla: 12 mánaða gluggar, röðun, síun og þverflokkar utan summu', () => {
  const radir = greinaradir({
    Alls: { skrad: 5, virk: 3, virkFyrra: 2, launafolk: 4, velta: 100 },
    F: { skrad: 2, virk: 2, virkFyrra: 1, launafolk: 3, velta: 80 },
    I: { skrad: 3, virk: 1, virkFyrra: 1, launafolk: 1, velta: 20 },
    B: { skrad: 0, virk: 0, virkFyrra: 0 },
    T_TOT_IS: { skrad: 1, virk: 1, virkFyrra: 0 },
  });
  const heiti = {
    Alls: 'Alls',
    F: 'Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)',
    I: 'Rekstur gististaða og veitingarekstur (ÍSAT2008: 55-56)',
    B: 'Námugröftur og vinnsla hráefna úr jörðu (ÍSAT2008: 05-09)',
    T_TOT_IS: 'Einkennandi greinar ferðaþjónustu á Íslandi (ÍSAT2008: 491, 551-553)',
  };
  const t = balkaTafla(radir, heiti, '2026M06');
  assert.equal(t.fra, '2025M07');
  assert.equal(t.til, '2026M06');
  assert.equal(t.heiti, 'júl 2025 – jún 2026');
  assert.deepEqual(t.rodir.map((r) => r.kodi), ['F', 'I']);          // B er núll í öllu og fellur út
  assert.deepEqual(t.rodir[0], { kodi: 'F', nafn: 'Byggingarstarfsemi og mannvirkjagerð', isat: '41-43', skrad: 24, virk: 24, virkFyrra: 12, launafolk: 36, velta: 960 });
  assert.deepEqual(t.thversnid.map((r) => [r.kodi, r.nafn, r.virk]), [['T_TOT_IS', 'Ferðaþjónusta', 12]]);
  assert.equal(t.alls.virk, 36);
  assert.equal(t.alls.virkFyrra, 24);
});

test('smidaGjaldthrot: nyjasti er mánuðurinn sem BÁÐAR töflur ná til', () => {
  const fyr03001 = { Alls: { [BREYTUR.nyskr]: fastar('2024M01', '2026M03', 30), [BREYTUR.skrad]: fastar('2024M01', '2026M03', 10) } };
  const grein = (virk) => ({
    [BREYTUR.skradGrein]: fastar('2024M01', '2026M02', 10), [BREYTUR.virk]: fastar('2024M01', '2026M02', virk),
    [BREYTUR.launafolk]: fastar('2024M01', '2026M02', 5), [BREYTUR.velta]: fastar('2024M01', '2026M02', 50),
  });
  const G = smidaGjaldthrot({ fyr03001, fyr03010: { Alls: grein(4), F: grein(4) }, heiti: { Alls: 'Alls', F: 'Byggingarstarfsemi og mannvirkjagerð (ÍSAT2008: 41-43)' } });
  assert.equal(G.nyjasti, '2026M02');                                 // FYR03001 nær til mars, FYR03010 aðeins febrúar
  assert.equal(G.nyjastiHeiti, 'febrúar 2026');
  assert.equal(G.ytd.heiti, 'jan–feb 2026');
  assert.equal(G.ytd.heitiFyrra, 'jan–feb 2025');
  assert.deepEqual(G.ytd.nu, { skrad: 20, virk: 8, launafolk: 10, velta: 100, nyskr: 60 });
  assert.deepEqual(G.ytd.breyting, { skrad: 0, virk: 0, launafolk: 0, velta: 0, nyskr: 0 });
  assert.equal(G.ytd.anStarfsemiPct, 60);
  assert.equal(G.r12.man[0], '2024M12');
  assert.equal(G.r12.man.at(-1), '2026M02');
  assert.deepEqual([G.r12.skrad[0], G.r12.virk[0], G.r12.nyskr[0]], [120, 48, 360]);
  assert.equal(G.hlutfall.nu, 3);
  assert.equal(G.balkar.til, '2026M02');
  assert.deepEqual(G.balkar.rodir.map((r) => r.kodi), ['F']);
});

test('breyti Hagstofan breytukóða nefnir villan hann', () => {
  assert.throws(() => smidaGjaldthrot({ fyr03001: { Alls: {} }, fyr03010: { Alls: {} }, heiti: {} }), /Fjöldi nýskráninga/);
});
