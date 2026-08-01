import { uppsafnadSeries, uppsafnadLoka } from './uppsafnad.mjs';
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };

// 2 lotur með þekktum tölum — handreiknað:
// L1: verdbolga 10 → 100×1.1⁴ = 146.41 → 146.4 · hagvoxtur 2 → 100×1.02⁴ = 108.243 → 108.2 · kaupmattur 0 → 100
//     skuldir 30 → 30 · losun 95 → 95×4 = 380
// L2: verdbolga 0 → 146.41 → 146.4 · hagvoxtur 2 → 100×1.02⁸ = 117.166 → 117.2 · kaupmattur 1.5 → 100×1.015⁴ = 106.136 → 106.1
//     skuldir 45 → 45 · losun 90 → 380+360 = 740
const s2 = uppsafnadSeries([
  { round: 1, kpis: { verdbolga: 10, hagvoxtur: 2, kaupmattur: 0, skuldir: 30, losun: 95 } },
  { round: 2, kpis: { verdbolga: 0, hagvoxtur: 2, kaupmattur: 1.5, skuldir: 45, losun: 90 } },
]);
ok('verdlag L1 handreiknuð: 100×1.1⁴ → 146.4', s2.verdlag[0].round === 1 && s2.verdlag[0].value === 146.4);
ok('verdlag L2 óbreytt við 0% (samsett á ÓRÚNNAÐ)', s2.verdlag[1].value === 146.4);
ok('vlf L1/L2: 1.02⁴→108.2, 1.02⁸→117.2', s2.vlf[0].value === 108.2 && s2.vlf[1].value === 117.2);
ok('kaupmattur: 0%→100, svo 1.015⁴→106.1', s2.kaupmattur[0].value === 100 && s2.kaupmattur[1].value === 106.1);
ok('skuldir = beint level per lotu (30, 45)', s2.skuldir[0].value === 30 && s2.skuldir[1].value === 45);
ok('losun = hlaupandi summa ×4 (380, 740)', s2.losun[0].value === 380 && s2.losun[1].value === 740);
ok('allar seríur bera round-númerin', ['verdlag', 'vlf', 'kaupmattur', 'skuldir', 'losun'].every((k) => s2[k].length === 2 && s2[k][1].round === 2));

// Tómt inntak → allar seríur tómar; loka → allt null
const s0 = uppsafnadSeries([]);
ok('tómt inntak → tómar seríur', Object.values(s0).every((a) => Array.isArray(a) && a.length === 0));
ok('loka á tómum seríum → allt null', Object.values(uppsafnadLoka(s0)).every((v) => v === null));
ok('loka á null → allt null', Object.values(uppsafnadLoka(null)).every((v) => v === null));
ok('undefined inntak → tómar seríur', Object.values(uppsafnadSeries(undefined)).every((a) => a.length === 0));

// Vantandi KPI í lotu → 0% breyting / síðasta level endurtekið (aldrei NaN)
const sm = uppsafnadSeries([
  { round: 1, kpis: { verdbolga: 10, skuldir: 30, losun: 95 } },
  { round: 2, kpis: {} },
]);
ok('vantar verdbolga L2 → vísitala stendur (146.4)', sm.verdlag[1].value === 146.4);
ok('vantar hagvoxtur/kaupmattur alveg → 100 áfram', sm.vlf[1].value === 100 && sm.kaupmattur[1].value === 100);
ok('vantar skuldir L2 → síðasta level endurtekið (30)', sm.skuldir[1].value === 30);
ok('vantar losun L2 → summa stendur (380)', sm.losun[1].value === 380);
ok('engin NaN í neinni seríu', Object.values(sm).every((a) => a.every((p) => typeof p.value === 'number' && isFinite(p.value))));

// Lokagildi
const lk = uppsafnadLoka(s2);
ok('lokagildi rétt (verdlag/vlf/kaupmattur/skuldir/losun)', lk.verdlag === 146.4 && lk.vlf === 117.2 && lk.kaupmattur === 106.1 && lk.skuldir === 45 && lk.losun === 740);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
