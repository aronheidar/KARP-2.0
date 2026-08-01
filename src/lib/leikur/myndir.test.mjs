// Próf fyrir myndir.mjs — keyrt með `node --test` (sama mynstur og aðrar *.test.mjs í möppunni:
// skráin sjálf er prófið, ok()-teljari + exit-kóði segir test-runnernum pass/fail).
import { SURPRISE_EVENTS } from './surprise.mjs';
import { EVENT_MYNDIR, PM_MYNDIR, PM_MYNDIR_KONA, ALTHINGI_MYND, myndFyrirAtvik } from './myndir.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// 1) öll 8 SURPRISE_EVENTS-id eiga mynd
for (const ev of SURPRISE_EVENTS) ok(`atvikið „${ev.id}" á mynd`, typeof EVENT_MYNDIR[ev.id] === 'string' && EVENT_MYNDIR[ev.id].length > 200);
ok('jafn margar atviks-myndir og atvik (engar auka/vantandi)', Object.keys(EVENT_MYNDIR).length === SURPRISE_EVENTS.length);

// 2) allir strengir gild flöt SVG: byrja á <svg, hafa viewBox, enda á </svg>
const allar = [
  ...Object.entries(EVENT_MYNDIR),
  ...Object.entries(PM_MYNDIR).map(([k, v]) => ['pm:' + k, v]),
  ...Object.entries(PM_MYNDIR_KONA).map(([k, v]) => ['pmKona:' + k, v]),
  ['althingi', ALTHINGI_MYND],
];
for (const [nafn, s] of allar) {
  ok(`${nafn}: byrjar á <svg`, s.startsWith('<svg'));
  ok(`${nafn}: inniheldur viewBox`, s.includes('viewBox'));
  ok(`${nafn}: endar á </svg>`, s.endsWith('</svg>'));
  ok(`${nafn}: enginn texti (<text) í SVG`, !s.includes('<text'));
  ok(`${nafn}: ekkert width/height á rótar-taggi (CSS ræður)`, !/^<svg[^>]*\s(?:width|height)=/.test(s));
}
for (const ev of SURPRISE_EVENTS) ok(`${ev.id}: viewBox 0 0 320 180`, EVENT_MYNDIR[ev.id].includes('viewBox="0 0 320 180"'));
ok('althingi: viewBox 0 0 320 180', ALTHINGI_MYND.includes('viewBox="0 0 320 180"'));

// 3) öryggi — ekkert keyranlegt í strengjunum
for (const [nafn, s] of allar) {
  const l = s.toLowerCase();
  ok(`${nafn}: ekkert </script`, !l.includes('</script'));
  ok(`${nafn}: ekkert javascript:`, !l.includes('javascript:'));
  ok(`${nafn}: ekkert onload`, !l.includes('onload'));
}

// 4) PM-pósarnir fjórir, allir með pm-blikk augnlok (og sama gull-nælan í öllum)
for (const posi of ['bjartsynn', 'hlutlaus', 'ahyggjufullur', 'kreppa']) {
  ok(`PM-pósi „${posi}" er til`, typeof PM_MYNDIR[posi] === 'string' && PM_MYNDIR[posi].length > 200);
  ok(`PM-pósi „${posi}" með pm-blikk augnlok`, (PM_MYNDIR[posi] || '').includes('class="pm-blikk"'));
  ok(`PM-pósi „${posi}" með viewBox 0 0 120 120`, (PM_MYNDIR[posi] || '').includes('viewBox="0 0 120 120"'));
  ok(`PM-pósi „${posi}" með gull-bindisnælu`, (PM_MYNDIR[posi] || '').includes('#f6b13b'));
  // PM-endurteiknun 2026-08-01: hlý húð, dökkblá jakkaföt og lithimnu-augu í ÖLLUM pósum
  ok(`PM-pósi „${posi}" með hlýjum húðlit`, (PM_MYNDIR[posi] || '').includes('#e8bc95'));
  ok(`PM-pósi „${posi}" með dökkbláum jakkafötum`, (PM_MYNDIR[posi] || '').includes('#2a3550'));
  ok(`PM-pósi „${posi}" með lithimnu í augum`, (PM_MYNDIR[posi] || '').includes('#3f6fae'));
}
ok('PM hefur nákvæmlega 4 pósa', Object.keys(PM_MYNDIR).length === 4);
ok('kreppa sker sig frá grunninum (svitadropi/úfið hár = lengri strengur)', PM_MYNDIR.kreppa.length > PM_MYNDIR.hlutlaus.length);

// 4b) PM-KONA: systur-sett 2026-08-01 — sömu 4 pósar, sami grunnur og gæðaflokkur
for (const posi of ['bjartsynn', 'hlutlaus', 'ahyggjufullur', 'kreppa']) {
  ok(`PM-kona-pósi „${posi}" er til`, typeof PM_MYNDIR_KONA[posi] === 'string' && PM_MYNDIR_KONA[posi].length > 200);
  ok(`PM-kona-pósi „${posi}" með pm-blikk augnlok`, (PM_MYNDIR_KONA[posi] || '').includes('class="pm-blikk"'));
  ok(`PM-kona-pósi „${posi}" með viewBox 0 0 120 120`, (PM_MYNDIR_KONA[posi] || '').includes('viewBox="0 0 120 120"'));
  ok(`PM-kona-pósi „${posi}" með gull-hálsmeni/nælu`, (PM_MYNDIR_KONA[posi] || '').includes('#f6b13b'));
  ok(`PM-kona-pósi „${posi}" með hlýjum húðlit`, (PM_MYNDIR_KONA[posi] || '').includes('#e8bc95'));
  ok(`PM-kona-pósi „${posi}" með dökkblárri dragt`, (PM_MYNDIR_KONA[posi] || '').includes('#2a3550'));
  ok(`PM-kona-pósi „${posi}" með lithimnu í augum`, (PM_MYNDIR_KONA[posi] || '').includes('#3f6fae'));
  ok(`PM-kona-pósi „${posi}" með kastaníubrúnu hári`, (PM_MYNDIR_KONA[posi] || '').includes('#5a3825'));
  ok(`PM-kona-pósi „${posi}" án bindis (hálsmen í staðinn)`, !(PM_MYNDIR_KONA[posi] || '').includes('56.8,78 63.2,78'));
}
ok('PM-kona hefur nákvæmlega 4 pósa', Object.keys(PM_MYNDIR_KONA).length === 4);
ok('kona-kreppa sker sig frá grunninum (svitadropi/úfið hár = lengri strengur)', PM_MYNDIR_KONA.kreppa.length > PM_MYNDIR_KONA.hlutlaus.length);

// 5) myndFyrirAtvik
ok("myndFyrirAtvik('eldgos') skilar streng", typeof myndFyrirAtvik('eldgos') === 'string');
ok("myndFyrirAtvik('bull') skilar null", myndFyrirAtvik('bull') === null);
ok('myndFyrirAtvik ver gegn prototype-lyklum', myndFyrirAtvik('constructor') === null && myndFyrirAtvik('__proto__') === null && myndFyrirAtvik(undefined) === null);

// 6) fast litaspjald — aðeins leyfðir litir í fill/stroke
// PM-endurteiknun 2026-08-01: hvítlistinn stækkaður MEÐVITAÐ um nákvæmlega 6 nýja liti
// (hámark skv. verkbeiðni): húð, húð-skuggi/varir, hár, skyrta/tennur/augnhvíta,
// jakkalitur, lithimna/fánanæla. Ekki bæta við fleirum án hönnunarákvörðunar.
// PM-KONA 2026-08-01: +1 litur (hámark skv. verkbeiðni var 1-2): #5a3825 kastaníubrúnt
// axlarsítt hár konunnar (líka brúnir+augnhár). Allt annað endurnýtir spjaldið óbreytt.
const leyfdir = new Set([
  '#1a2130', '#cdd6e6', '#f6b13b', '#e78284', '#8ca0c8', '#42d086', '#5d6b85', 'none',
  '#e8bc95', '#b5714f', '#3a2f2b', '#f7f9fc', '#2a3550', '#3f6fae',
  '#5a3825',
]);
for (const [nafn, s] of allar) {
  const litir = [...s.matchAll(/(?:^|[\s"])(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
  ok(`${nafn}: aðeins fast litaspjald í fill/stroke`, litir.length > 0 && litir.every((v) => leyfdir.has(v)));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
