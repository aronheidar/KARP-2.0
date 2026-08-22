// Próf f. framtíðar-sviðsmyndina „Ísland 2026–2058" (svidsmynd-2058.mjs).
// VER GEGN: týpóum í shock-/lever-lyklum (sem myndu þegja í hermi), tómum texta, tvíteknum lotum,
// röngum byggingar-eiginleikum (dials/reality/hefurSogu/erFramtid) og því að framtíðin verði
// ÓSANNGJARNLEGA HARÐARI en sögulega sviðsmyndin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SVIDSMYND_2058 } from './svidsmynd-2058.mjs';
import { SCENARIO, ROUNDS, QUARTERS_PER_ROUND } from './game-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(__dirname, '../../../gogn/roads/baseline.json'), 'utf8'));
const LEV = baseline.levers, SHK = baseline.shocks;
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

const S = SVIDSMYND_2058;
const EV = Array.isArray(S.events) ? S.events : [];

// ── Grunnform sviðsmyndarinnar ──────────────────────────────────────────────
ok('id = island2026', S.id === 'island2026');
ok('heiti = Ísland 2026–2058', S.heiti === 'Ísland 2026–2058');
ok('undirtitill til staðar', typeof S.undirtitill === 'string' && S.undirtitill.length > 3);
ok('yearStart = 2026', S.yearStart === 2026);
ok('rounds = 8 (== ROUNDS)', S.rounds === 8 && S.rounds === ROUNDS);
// dials={} er RÉTT: baseline.json ER líkan af Íslandi ~2026 → engin spólun aftur í tímann þarf.
ok('dials = {} (engin spólun — baseline ER ~2026)',
  S.dials && typeof S.dials === 'object' && !Array.isArray(S.dials) && Object.keys(S.dials).length === 0);
ok('baseline er í raun ~2026 (updated byrjar á 2026)', String(baseline.updated || '').startsWith('2026'));
ok('reality = null (engin raungögn um framtíðina)', S.reality === null);
ok('hefurSogu = false', S.hefurSogu === false);
ok('erFramtid = true', S.erFramtid === true);
ok('blurb efnislegt', typeof S.blurb === 'string' && S.blurb.length > 150);
// Kennslu-fyrirvarinn MÁ EKKI hverfa úr blurb við ritstýringu.
ok('blurb merkir efnið sem TILBÚIÐ kennsluefni, ekki spá',
  /tilbún/i.test(S.blurb) && /ekki spá/i.test(S.blurb));

// ── Fjöldi, lotu-númer og ártöl ─────────────────────────────────────────────
ok('8 atburðir', EV.length === 8);
ok('engin tvítekin round', new Set(EV.map((e) => e.round)).size === EV.length);
EV.forEach((e, i) => {
  const r = i + 1, vaentAr = 2026 + (r - 1) * QUARTERS_PER_ROUND;
  ok('atburður ' + r + ': round = ' + r, e.round === r);
  ok('atburður ' + r + ': year = ' + vaentAr, e.year === vaentAr);
});
ok('lokaár sviðsmyndar = 2058', S.yearStart + S.rounds * QUARTERS_PER_ROUND === 2058);

// ── Texta-kröfur ────────────────────────────────────────────────────────────
for (const e of EV) {
  const r = 'r' + e.round;
  ok(r + ': icon til staðar', typeof e.icon === 'string' && e.icon.length > 0);
  ok(r + ': title efnislegur', typeof e.title === 'string' && e.title.trim().length > 3);
  ok(r + ': text ekki tómur og ≥3 setningar',
    typeof e.text === 'string' && e.text.length > 200 && (e.text.match(/\./g) || []).length >= 3);
  ok(r + ': focus til staðar', typeof e.focus === 'string' && e.focus.trim().length > 20);
  ok(r + ': watch til staðar', typeof e.watch === 'string' && e.watch.trim().length > 20);
  ok(r + ': enginn bráðabirgða-texti eftir', !/BRÁÐABIRGÐA|PLACEHOLDER|TODO/i.test(e.text + e.title + e.focus + e.watch));
}

// ── SHOCKS: allir lyklar TIL í baseline.shocks (vörn gegn týpóum) + innan marka ──
for (const e of EV) {
  const sh = e.shocks || {};
  ok('r' + e.round + ': shocks er hlutur', sh && typeof sh === 'object' && !Array.isArray(sh));
  for (const [k, v] of Object.entries(sh)) {
    ok('r' + e.round + ' shock-lykill til í baseline: ' + k, Object.prototype.hasOwnProperty.call(SHK, k));
    ok('r' + e.round + ' shock ' + k + ' er tala', typeof v === 'number' && Number.isFinite(v));
    if (SHK[k]) ok('r' + e.round + ' shock ' + k + '=' + v + ' innan [' + SHK[k].min + '..' + SHK[k].max + ']',
      v >= SHK[k].min && v <= SHK[k].max);
  }
  ok('r' + e.round + ': 0–3 sjokk', Object.keys(sh).length <= 3);
}

// ── CHOICES / RESPONSES: lever-id TIL í baseline.levers + gild áhrifsgildi ──
for (const e of EV) {
  const r = 'r' + e.round;
  ok(r + ': choices er fylki með 2–3 valkostum', Array.isArray(e.choices) && e.choices.length >= 2 && e.choices.length <= 3);
  // Samhæfi við eldri neytendur (resolve.mjs/game-validate.mjs/client.mjs lesa `.responses`).
  ok(r + ': responses === choices (sama fylki)', e.responses === e.choices);
  ok(r + ': einstakir choice-lyklar', new Set((e.choices || []).map((c) => c.key)).size === (e.choices || []).length);
  for (const c of (e.choices || [])) {
    ok(r + '/' + c.key + ': label efnislegt', typeof c.label === 'string' && c.label.trim().length > 3);
    const eff = (c.effect || {});
    const levs = eff.lever || {};
    ok(r + '/' + c.key + ': hefur a.m.k. eitt lever-áhrif', Object.keys(levs).length >= 1);
    for (const [id, v] of Object.entries(levs)) {
      ok(r + '/' + c.key + ' lever-id til í baseline: ' + id, Object.prototype.hasOwnProperty.call(LEV, id));
      ok(r + '/' + c.key + ' lever ' + id + ' er tala', typeof v === 'number' && Number.isFinite(v));
      // resolve.mjs beitir áhrifum sem clamp(base + v, min, max) → base+v á að rúmast innan marka
      // (annars er valkosturinn í reynd veikari en textinn lofar).
      if (LEV[id]) {
        const nyttGildi = LEV[id].base + v;
        ok(r + '/' + c.key + ': base+' + v + ' á ' + id + ' = ' + nyttGildi + ' innan [' + LEV[id].min + '..' + LEV[id].max + ']',
          nyttGildi >= LEV[id].min && nyttGildi <= LEV[id].max);
      }
    }
    for (const k of Object.keys(eff.shock || {})) ok(r + '/' + c.key + ' shock-lykill til: ' + k, Object.prototype.hasOwnProperty.call(SHK, k));
  }
}

// ── SANNGIRNI: framtíðin má ekki vera harðari en fortíðin ───────────────────
// Berum saman mesta einstaka |shock| í báðum sviðsmyndum. Þak = 1,5× island2000 svo framtíðin geti
// verið krefjandi en aldrei ósanngjörn miðað við söguna sem leikmenn þekkja.
const maxShock = (events) => events.reduce((m, e) => Math.max(m, ...Object.values(e.shocks || {}).map(Math.abs), 0), 0);
const max2000 = maxShock(SCENARIO.events), max2058 = maxShock(EV);
ok('island2000 hefur sjokk til viðmiðunar (' + max2000 + ')', max2000 > 0);
ok('2058 max|shock|=' + max2058 + ' ≤ 1,5× island2000 (' + (max2000 * 1.5) + ')', max2058 <= max2000 * 1.5);
// Og heildarþungi per lotu má heldur ekki fara fram úr sögunni (varnar mörgum meðalstórum í einu).
const maxSum = (events) => events.reduce((m, e) => Math.max(m, Object.values(e.shocks || {}).reduce((s, v) => s + Math.abs(v), 0)), 0);
const sum2000 = maxSum(SCENARIO.events), sum2058 = maxSum(EV);
ok('2058 þyngsta lota (Σ|shock|=' + sum2058 + ') ≤ 1,5× island2000 (' + (sum2000 * 1.5) + ')', sum2058 <= sum2000 * 1.5);
// Sviðsmyndin á að hafa a.m.k. eitt raunverulegt áfall — ekki bara mildan meðbyr allan tímann.
ok('a.m.k. eitt umtalsvert áfall (|shock| ≥ 20)',
  EV.some((e) => Object.values(e.shocks || {}).some((v) => v <= -20 || v >= 20)));
// … og a.m.k. eina hreina tækifæris-lotu (engin neikvæð sjokk).
ok('a.m.k. ein lota með eingöngu jákvæðum sjokkum (tækifæri)',
  EV.some((e) => { const v = Object.values(e.shocks || {}); return v.length > 0 && v.every((x) => x > 0); }));

// ── ENGIN NAFNGREIND RAUNVERULEG MANNESKJA í framtíðar-atburðum ─────────────
// Gróf vörn: nöfn sem koma fyrir í sögulegu efni leiksins mega ALDREI birtast í framtíðar-textum.
const BONNUD_NOFN = ['Davíð', 'Halldór', 'Geir', 'Jóhanna', 'Sigmundur', 'Sigurður Ingi', 'Bjarni', 'Katrín', 'Kristrún', 'forsætisráðherra '];
for (const e of EV) {
  const t = e.text + ' ' + e.title + ' ' + e.focus + ' ' + e.watch;
  for (const n of BONNUD_NOFN) ok('r' + e.round + ': nefnir ekki „' + n.trim() + '"', !t.includes(n));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
