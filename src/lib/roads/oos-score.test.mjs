import { scoreEpisode } from './oos-score.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// Rétt átt + trúverðug stærð
let s = scoreEpisode({ verdbolga: 6, atvinnuleysi: 4 }, { verdbolga: 7.7, atvinnuleysi: 5 });
ok('bæði rétt átt', s.dirHits === 2 && s.total === 2);
ok('bæði trúverðug stærð (good)', s.goodMag === 2);
ok('verdbolga verdict=good', s.rows.find((r) => r.kpi === 'verdbolga').verdict === 'good');

// Röng átt
s = scoreEpisode({ hagvoxtur: 2 }, { hagvoxtur: -8 });
ok('röng átt → dir-miss', s.rows[0].verdict === 'dir-miss' && s.dirHits === 0);

// Rétt átt en ofmetið (>3x)
s = scoreEpisode({ verdbolga: 30 }, { verdbolga: 5 });
ok('ofmetið (ratio 6) → over', s.rows[0].verdict === 'over' && s.rows[0].dirHit === true);

// Rétt átt en vanmetið (<1/3)
s = scoreEpisode({ verdbolga: 1 }, { verdbolga: 8 });
ok('vanmetið (ratio 0.125) → under', s.rows[0].verdict === 'under');

// Bæði nálægt núlli → átt telst rétt
s = scoreEpisode({ verdbolga: 0.05 }, { verdbolga: 0.1 });
ok('bæði örsmá → dirHit true', s.rows[0].dirHit === true);

// Vantar spá → na
s = scoreEpisode({}, { verdbolga: 5 });
ok('vantar spá → na, ekki talið', s.rows[0].verdict === 'na' && s.total === 0);

// Tómt → tómt
ok('tómt → 0/0', scoreEpisode({}, {}).total === 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
