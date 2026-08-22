import { HANDBOOK, handbookFor, THOKA_HANDBOOK, SATT_HANDBOOK, RADHERRAR_HANDBOOK } from './handbook.mjs';
import { RADUNEYTI } from './radherrar.mjs';
import { SATT_FYLKI } from './satt.mjs';
import { SCENARIO, ROUNDS } from './game-config.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

ok('handbók = ROUNDS færslur', HANDBOOK.length === ROUNDS);
ok('kjörtímabil 1..8 í röð', HANDBOOK.every((h, i) => h.round === i + 1));
ok('hver færsla með fullnægjandi efni', HANDBOOK.every((h) => h.situation && h.situation.length > 20 && h.varast && h.varast.length > 20 && h.strategy && h.strategy.length > 20 && Array.isArray(h.settings) && h.settings.length >= 2));
ok('handbook svið samsvara sviðsmynd (allar lotur til)', HANDBOOK.every((h) => SCENARIO.events.some((e) => e.round === h.round)));
ok('handbookFor skilar réttri lotu', handbookFor(3).round === 3 && handbookFor(99) === null);

// „Hagstjórn í þoku" — kennslu-rök + leikstjóra-texti (form sem client/analytics treysta á).
ok('THOKA_HANDBOOK hefur fjóra kjarna-kafla', ['hvers_vegna', 'hvenaer', 'hvad_ad_segja_hopnum', 'debrief_spurningar'].every((k) => k in THOKA_HANDBOOK));
ok('þoka: hvers_vegna er 2–4 setningar með hagfræði-rökum (Hagstofa, endurskoðun, nowcasting)', typeof THOKA_HANDBOOK.hvers_vegna === 'string' && THOKA_HANDBOOK.hvers_vegna.length > 200 && /Hagstof/.test(THOKA_HANDBOOK.hvers_vegna) && /endurskoð/.test(THOKA_HANDBOOK.hvers_vegna) && /nowcasting/i.test(THOKA_HANDBOOK.hvers_vegna));
ok('þoka: hvenaer nefnir aðra umferð og varar við Erfitt í fyrstu spilun', /annarri umferð/i.test(THOKA_HANDBOOK.hvenaer) && /Erfitt/.test(THOKA_HANDBOOK.hvenaer));
ok('þoka: hvad_ad_segja_hopnum er upplestrar-texti (≥3 setningar)', typeof THOKA_HANDBOOK.hvad_ad_segja_hopnum === 'string' && (THOKA_HANDBOOK.hvad_ad_segja_hopnum.match(/[.!?](\s|$)/g) || []).length >= 3);
ok('þoka: 4–5 debrief-spurningar, allar enda á ?', Array.isArray(THOKA_HANDBOOK.debrief_spurningar) && THOKA_HANDBOOK.debrief_spurningar.length >= 4 && THOKA_HANDBOOK.debrief_spurningar.length <= 5 && THOKA_HANDBOOK.debrief_spurningar.every((q) => typeof q === 'string' && q.trim().endsWith('?')));
ok('þoka: debrief nefnir fyrirsagnir, fylgi og 2008', THOKA_HANDBOOK.debrief_spurningar.some((q) => /fyrirsögn/i.test(q)) && THOKA_HANDBOOK.debrief_spurningar.some((q) => /fylgi/i.test(q)) && THOKA_HANDBOOK.debrief_spurningar.some((q) => /2008/.test(q)));
ok('þoka: blurb f. fac-rofa + heiti', typeof THOKA_HANDBOOK.blurb === 'string' && THOKA_HANDBOOK.blurb.length > 40 && THOKA_HANDBOOK.heiti === 'Hagstjórn í þoku');


// „Þjóðarsáttin" — kennslu-rök + leikstjóra-texti fangaklemmunnar (form sem client/analytics treysta á).
ok('SATT_HANDBOOK hefur kjarna-kaflana', ['heiti', 'blurb', 'hvers_vegna', 'hvernig_keyra', 'debrief_spurningar', 'fylki_til_toflu'].every((k) => k in SATT_HANDBOOK));
ok('satt: heiti + blurb f. fac-rofa', SATT_HANDBOOK.heiti === 'Þjóðarsáttin' && typeof SATT_HANDBOOK.blurb === 'string' && SATT_HANDBOOK.blurb.length > 60 && /blind/i.test(SATT_HANDBOOK.blurb));
ok('satt: hvers_vegna nefnir 1990, Einar Odd, ASÍ og trúverðugleika/traust', /1990/.test(SATT_HANDBOOK.hvers_vegna) && /Einar Odd/.test(SATT_HANDBOOK.hvers_vegna) && /ASÍ/.test(SATT_HANDBOOK.hvers_vegna) && /trúverðugleik/i.test(SATT_HANDBOOK.hvers_vegna) && /traust/i.test(SATT_HANDBOOK.hvers_vegna));
ok('satt: verðbólgu-tölur MÝKTAR (engin „úr 25% í 2%“ fullyrðing án fyrirvara)', /um tuttugu/i.test(SATT_HANDBOOK.hvers_vegna) && /nákvæmar tölur/i.test(SATT_HANDBOOK.hvers_vegna) && !/25%/.test(SATT_HANDBOOK.hvers_vegna) && !/2%/.test(SATT_HANDBOOK.hvers_vegna));
ok('satt: hvernig_keyra nefnir Karphús, 3 mín og „ekki segja fylkið fyrirfram“', /Karphús/.test(SATT_HANDBOOK.hvernig_keyra) && /3 mín/.test(SATT_HANDBOOK.hvernig_keyra) && /EKKI FYLKIÐ FYRIRFRAM/.test(SATT_HANDBOOK.hvernig_keyra) && /debrief/i.test(SATT_HANDBOOK.hvernig_keyra));
ok('satt: nákvæmlega 5 debrief-spurningar, allar enda á ?', Array.isArray(SATT_HANDBOOK.debrief_spurningar) && SATT_HANDBOOK.debrief_spurningar.length === 5 && SATT_HANDBOOK.debrief_spurningar.every((q) => typeof q === 'string' && q.trim().endsWith('?')));
ok('satt: debrief nefnir svik, traust, KT6/KT3, trúverðugleika og 2024', ['svik', 'treyst', 'KT6', 'trúverðugleik', '2024'].every((w) => SATT_HANDBOOK.debrief_spurningar.some((q) => q.toLowerCase().includes(w.toLowerCase()))));
ok('satt: fylki_til_toflu ≥ 5 raðir með utkoma/lid/ahrif', Array.isArray(SATT_HANDBOOK.fylki_til_toflu) && SATT_HANDBOOK.fylki_til_toflu.length >= 5 && SATT_HANDBOOK.fylki_til_toflu.every((r) => typeof r.utkoma === 'string' && typeof r.lid === 'string' && typeof r.ahrif === 'string'));
// Taflan er REIKNUÐ úr SATT_FYLKI → tölurnar eldast ekki þótt fylkið sé stillt.
const ftt = SATT_HANDBOOK.fylki_til_toflu;
const tala = (v) => (v > 0 ? '+' : '−') + String(Math.abs(v)).replace('.', ',');
ok('satt: samvinnu-röðin ber tölur SATT_FYLKI.samvinna', ftt[0].ahrif.includes('verðbólga ' + tala(SATT_FYLKI.samvinna.verdbolga)) && ftt[0].ahrif.includes('kaupmáttur ' + tala(SATT_FYLKI.samvinna.kaupmattur)) && ftt[0].ahrif.includes('fylgi ' + tala(SATT_FYLKI.samvinna.pop)));
ok('satt: svikara-röðin ber tölur SATT_FYLKI.svik.svikari', ftt[1].ahrif.includes('kaupmáttur ' + tala(SATT_FYLKI.svik.svikari.kaupmattur)) && ftt[1].ahrif.includes('fylgi ' + tala(SATT_FYLKI.svik.svikari.pop)));
ok('satt: spíral-raðir leggja „allir“ ofan á svikara/sáttar-lið', ftt[3].ahrif.includes('verðbólga ' + tala(SATT_FYLKI.spirall.allir.verdbolga)) && ftt[3].ahrif.includes('kaupmáttur ' + tala(SATT_FYLKI.spirall.svikari.kaupmattur)) && ftt[4].ahrif.includes('kaupmáttur ' + tala(SATT_FYLKI.spirall.sattLid.kaupmattur)));

// „Ráðherraskipting innan liðs" — kennslu-rök + leikstjóra-texti (form sem client treystir á: blurb í rofa, handbókar-blað, debrief).
const RH = RADHERRAR_HANDBOOK;
ok('RADHERRAR_HANDBOOK hefur kjarna-kaflana', ['heiti', 'blurb', 'hvers_vegna', 'hvernig_keyra', 'debrief_spurningar'].every((k) => k in RH));
ok('ráðherrar: heiti + blurb f. fac-rofa (nefnir forsætisráðherra, ráðuneyti og læsingu)', RH.heiti === 'Ráðherraskipting' && typeof RH.blurb === 'string' && RH.blurb.length > 60 && /forsætisráðherra/i.test(RH.blurb) && /ráðuneyt/i.test(RH.blurb) && /læsir/i.test(RH.blurb));
ok('ráðherrar: hvers_vegna nefnir „einn með lyklaborðið", togstreitu ráðuneyta sem raunverulega hagstjórn og sjálfstæðan Seðlabanka', /lyklaborð/i.test(RH.hvers_vegna) && /togstreit/i.test(RH.hvers_vegna) && /raunveruleg hagstjórn/i.test(RH.hvers_vegna) && /Seðlabank/.test(RH.hvers_vegna) && /sjálfstæð/i.test(RH.hvers_vegna));
ok('ráðherrar: hvernig_keyra nefnir liðsstærð 3–7, Stjórnstöð og að PM-valið sé pólitík', /3–7/.test(RH.hvernig_keyra) && /Stjórnstöð/.test(RH.hvernig_keyra) && /pólitík/i.test(RH.hvernig_keyra));
ok('ráðherrar: nákvæmlega 3 debrief-spurningar, allar enda á ?', Array.isArray(RH.debrief_spurningar) && RH.debrief_spurningar.length === 3 && RH.debrief_spurningar.every((q) => typeof q === 'string' && q.trim().endsWith('?')));
ok('ráðherrar: debrief nefnir Seðlabankastjóra+fjármálaráðherra, klobbun ráðuneyta og „hver réði"', RH.debrief_spurningar.some((q) => /Seðlabankastjór/.test(q) && /fjármálaráðherr/i.test(q)) && RH.debrief_spurningar.some((q) => /klobb/i.test(q)) && RH.debrief_spurningar.some((q) => /hver réði/i.test(q)));
ok('ráðherrar: sætin sem debrief vísar í eru til í RADUNEYTI (Seðlabankastjóri, Fjármálaráðherra, Forsætisráðherra)', ['Seðlabankastjóri', 'Fjármálaráðherra', 'Forsætisráðherra'].every((h) => RADUNEYTI.some((r) => r.heiti === h)));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
