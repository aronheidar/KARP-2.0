import { HANDBOOK, handbookFor, THOKA_HANDBOOK } from './handbook.mjs';
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

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
