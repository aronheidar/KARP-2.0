// Hrein eining fyrir src/lib — engar deps. Keyra:  node "src/lib/_test.mjs"
import { PARTIES, partyName, partyColor, colorByName, codeByName } from './parties.mjs';
import { esc, fmt, groupThousands, fmtNum, monthLabel, slugify, MON } from './format.mjs';
import { projectSeats } from './seats.mjs';
import { computeMuniIndex } from './muniIndex.mjs';
import { makeMuniStats, svStab } from './muniStats.mjs';
import { pointInRing, pointInFeat, makeRegionOf, makeLifsQ } from './geo.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
  else { fail++; console.log(`  ✗ ${name}: fékk ${JSON.stringify(got)} — vildi ${JSON.stringify(want)}`); }
};

// parties — source-of-truth (leysir drift milli 3 korta í mælaborðinu)
eq('partyColor D', partyColor('D'), '#3a8dff');
eq('partyName S', partyName('S'), 'Samfylkingin');
eq('colorByName Sjálfstæðis', colorByName('Sjálfstæðisflokkur'), '#3a8dff');
eq('colorByName VG en-dash', colorByName('Vinstrihreyfingin – grænt framboð'), '#5aa84a');
eq('codeByName óþekkt', codeByName('Xflokkur'), null);
eq('PARTIES fjöldi', Object.keys(PARTIES).length, 10);

// format — nákvæmlega eins og mælaborðið
eq('esc', esc('<a>&"'), '&lt;a&gt;&amp;&quot;');
eq('fmt', fmt(3.5), '3,5');
eq('groupThousands', groupThousands(1234567), '1.234.567');
eq('fmtNum', fmtNum(1234.5, 1), '1.234,5');
eq('monthLabel', monthLabel('2026M06'), 'jún 2026');
eq('MON lengd', MON.length, 12);
eq('slugify Múlaþing', slugify('Múlaþing'), 'mulathing');
eq('slugify Reykjavíkurborg', slugify('Reykjavíkurborg'), 'reykjavikurborg');
eq('slugify Ölfus-bil', slugify('Sveitarfélagið Ölfus'), 'sveitarfelagid-olfus');

// seats — D'Hondt úthlutar nákvæmlega TOT sætum
const polls = { parties: ['S','C','F','D','M','B'], polls: [{ v: { S:25, C:12, F:9, D:24, M:11, B:12 } }] };
const r = projectSeats(polls, [{ flokkur:'Samfylkingin' }, { flokkur:'Sjálfstæðisflokkur' }]);
eq('seats summa = 63', Object.values(r.proj).reduce((a,b)=>a+b,0), 63);
eq('seats maj er bool', typeof r.maj, 'boolean');
eq('cur telur S', r.cur.S, 1);
eq('undir þröskuldi fær 0', projectSeats({ polls:[{ v:{ S:97, Z:3 } }] }).proj.Z, undefined);

// muniIndex — kvörðuð samsetning; betra sveitarfélag fær hærri vísitölu
const midata = {
  SVFIN: { A: { afkoma_ibui: 100, skuldir_ibui: 1000 }, B: { afkoma_ibui: -50, skuldir_ibui: 3000 } },
  SVMETA: { A: { breyting_pct: 1, ung: 20 }, B: { breyting_pct: -0.5, ung: 15 } },
  SVPOP: { A: 5000, B: 2000 },
  ATVINNULEYSI: { byMuni: { A: { rate: 2 }, B: { rate: 6 } } },
};
const idx = computeMuniIndex(midata);
eq('muniIndex A > B', idx.A.idx > idx.B.idx, true);
eq('muniIndex innan 0–100', idx.A.idx <= 100 && idx.B.idx >= 0, true);
eq('muniIndex sleppir <1000 íbúa', computeMuniIndex({ SVFIN: { C: {} }, SVPOP: { C: 500 } }).C, undefined);

// muniStats — uppflettingar
const st = makeMuniStats({
  ATVINNULEYSI: { byMuni: { Rvk: { rate: 3.2 } }, byRegion: [{ name: 'Norðurland eystra', v: 2.1 }] },
  GLAEPIR: { byRegion: { 'Suðurland': { hegn: 300 } } },
  FASTEIGNIR: { byMuni: { Rvk: { m2: 750 } }, months: [{ hbsv: { m2: 700 }, land: { m2: 500 } }] },
});
eq('svUnemp byMuni', st.svUnemp('Rvk'), 3.2);
eq('svUnemp byRegion', st.svUnemp('X', 'Norðurland eystra'), 2.1);
eq('svUnempMuni', st.svUnempMuni('Rvk'), true);
eq('svCrime', st.svCrime('Suðurland').hegn, 300);
eq('svHouse byMuni', st.svHouse('Rvk').v, 750);
eq('svHouse hbsv', st.svHouse('X', 'Höfuðborgarsvæðið').v, 700);
eq('svHouse land', st.svHouse('X', 'Annað').v, 500);
eq('svStab skh=50 → 99', svStab({ tekjur: 100, skuldir: 50, afkoma_ibui: 10 }), 99);

// geo — point-in-polygon
const sq = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
eq('pointInRing inni', pointInRing([0.5, 0.5], sq), true);
eq('pointInRing úti', pointInRing([2, 2], sq), false);
eq('pointInFeat Polygon', pointInFeat([0.5, 0.5], { type: 'Polygon', coordinates: [sq] }), true);

// geo — regionOf (SVCOORDS = [lat,lon]; landshluti með/án fallback)
const REGIONGEO = { features: [
  { properties: { name: 'R1' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]] } },
  { properties: { name: 'R2' }, geometry: { type: 'Polygon', coordinates: [[[10, 10], [10, 12], [12, 12], [12, 10], [10, 10]]] } },
]};
const regionOf = makeRegionOf({ SVCOORDS: { A: [1, 1], B: [11, 11], C: [5, 5] }, REGIONGEO });
eq('regionOf inni R1', regionOf('A'), 'R1');
eq('regionOf inni R2', regionOf('B'), 'R2');
eq('regionOf fallback nálægast', regionOf('C'), 'R1');
eq('regionOf óþekkt', regionOf('Z'), null);

// geo — lifsQ (deps injectuð; hegn=225 → öryggi 50, atv 67, vöxtur 62 → meðaltal 60)
const lifsQ = makeLifsQ({
  SVMETA: { A: { breyting_pct: 1 } },
  regionOf: () => 'R1',
  svUnemp: () => 3,
  svCrime: () => ({ hegn: 225 }),
});
eq('lifsQ samsett', lifsQ('A'), 60);
eq('lifsQ engin gögn → null', makeLifsQ({})('X'), null);

console.log(`\n${fail ? '✗ FALL' : '✓ ALLT Í LAGI'} — ${pass} tókust, ${fail} féllu`);
process.exit(fail ? 1 : 0);
