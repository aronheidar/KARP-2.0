#!/usr/bin/env node
// build_storidja.mjs — daglegt gagna-snapshot fyrir /atvinnuvegir/storidja/:
//   • Útflutningsverðmæti áls (UTA06105 fl.15) + kísiljárns (fl.13), frá 1995 (ma.kr)  (Hagstofa UTA06105)
// Áður sótt í .astro-frontmatter á HVERRI byggingu → nú daglegt snapshot (seigla + saga). #2 LOTA 10.
// -> gogn/storidja.json + web/public/gogn/storidja.json
import { px, sel, num, loadPrev, writeSnapshot, today } from './_pxlib.mjs';

const curYear = new Date().getFullYear(); // sjálf-uppfærist (var harðkóðað 2026)
const prev = loadPrev('storidja');

// Útflutningsverðmæti áls (fl.15) + kísiljárns (fl.13), verðmæti þús.kr → ma.kr, frá 1995.
let C1 = null, alL = null;
try {
  const j = await px('Efnahagur/utanrikisverslun/1_voruvidskipti/01_voruskipti/UTA06105.px', [sel('Eining', 'item', ['1']), sel('Flokkur', 'item', ['15', '13']), sel('Ár', 'all', ['*'])]);
  const al = {}, kis = {};
  // key = [Eining, Flokkur, Ár] — stöðubundnir lyklar (kóðaskörun!)
  j.data.forEach((d) => { const f = d.key[1], y = d.key[2]; const v = num(d.values[0]); if (!y || v == null || +y < 1995 || +y >= curYear) return; (f === '15' ? al : kis)[y] = Math.round(v / 1e5) / 10; });
  const ys = [...new Set([...Object.keys(al), ...Object.keys(kis)])].sort();
  if (ys.length) {
    C1 = { x: ys, u: 'ma.kr', series: [{ name: 'Ál', color: '#cdd6e6', data: ys.map((y) => al[y] ?? null) }, { name: 'Kísiljárn', color: '#8892a6', data: ys.map((y) => kis[y] ?? null) }] };
    const l = ys[ys.length - 1];
    alL = { y: l, al: al[l], kis: kis[l] };
  }
} catch (e) { console.error('C1', e.message); }

// Seigla: haltu fyrri hluta ef ný sókn brást (tæmir aldrei hluta sem áður var til).
C1 = C1 ?? prev.C1 ?? null;
alL = alL ?? prev.alL ?? null;
if (!C1 && !alL) { console.error('storidja: allt tómt og ekkert fyrra snapshot — hætti án skrifa'); process.exit(1); }

const bytes = writeSnapshot('storidja', { updated: today(), C1, alL });
console.log('storidja.json | C1', C1 && C1.x.length, 'ár | alL', alL && alL.y, '| bytes', bytes);
