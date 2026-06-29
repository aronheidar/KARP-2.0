// Áfangi 4: pólitískt kort. Builds the MP×vote matrix from every recorded roll-call
// (já=+1, nei=-1, else 0), mean-centres each ballot, runs PCA (classical MDS via the
// MP-MP Gram matrix + power iteration) to 2D, and bakes per-MP {mx,my} into althingi.json.
// Proximity on the map = voting similarity. Editorial axis labels are NOT claimed.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const ids = mps.map(m => m.id);
const N = ids.length;
function parseVote(x) { const o = {}; x.split('<þingmaður id=').slice(1).forEach(b => { const id = +(b.match(/^'(\d+)'/) || [])[1]; const a = (b.match(/<atkvæði>([^<]*)<\/atkvæði>/) || [])[1]; if (id && a) o[id] = a; }); return o; }
async function getText(u) { const r = await fetch(u); return r.text(); }
async function pool(items, n, fn) { let i = 0; async function w() { while (i < items.length) { const k = i++; await fn(items[k]); } } await Promise.all(Array.from({ length: n }, w)); }

(async () => {
  const listXml = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/?lthing=157');
  const voteIds = [...listXml.matchAll(/atkvæðagreiðslunúmer=.(\d+)./g)].map(m => m[1]);
  console.log('votes to fetch:', voteIds.length);
  const cols = []; let done = 0;
  await pool(voteIds, 12, async (vid) => {
    let x; try { x = await getText('https://www.althingi.is/altext/xml/atkvaedagreidslur/atkvaedagreidsla/?numer=' + vid); } catch (e) { return; }
    if (++done % 300 === 0) console.log('  ...', done);
    const v = parseVote(x); const col = new Float64Array(N); let rec = 0;
    ids.forEach((id, i) => { const a = v[id]; if (a === 'já') { col[i] = 1; rec++; } else if (a === 'nei') { col[i] = -1; rec++; } });
    if (rec >= 10) cols.push(col); // a recorded já/nei roll-call with real participation
  });
  const V = cols.length; console.log('recorded vote columns:', V);

  // mean-centre each ballot across MPs, then Gram matrix G = X·Xᵀ (N×N)
  cols.forEach(col => { let mean = 0; for (let i = 0; i < N; i++) mean += col[i]; mean /= N; for (let i = 0; i < N; i++) col[i] -= mean; });
  const G = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) { let s = 0; for (let k = 0; k < V; k++) s += cols[k][i] * cols[k][j]; G[i][j] = s; G[j][i] = s; }

  function matvec(M, v) { const o = new Float64Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += M[i][j] * v[j]; o[i] = s; } return o; }
  function norm(v) { let s = 0; for (let i = 0; i < N; i++) s += v[i] * v[i]; return Math.sqrt(s); }
  function powIt(M) {
    let v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = Math.sin(i * 1.7 + 0.3);
    let nv = norm(v); for (let i = 0; i < N; i++) v[i] /= nv;
    for (let it = 0; it < 500; it++) { const w = matvec(M, v); const nw = norm(w); if (nw < 1e-12) break; for (let i = 0; i < N; i++) w[i] /= nw; let dot = 0; for (let i = 0; i < N; i++) dot += w[i] * v[i]; v = w; if (Math.abs(Math.abs(dot) - 1) < 1e-11) break; }
    const Mv = matvec(M, v); let lam = 0; for (let i = 0; i < N; i++) lam += v[i] * Mv[i]; return { v, lam };
  }
  const e1 = powIt(G);
  const G2 = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) G2[i][j] = G[i][j] - e1.lam * e1.v[i] * e1.v[j];
  const e2 = powIt(G2);
  const s1 = Math.sqrt(Math.max(0, e1.lam)), s2 = Math.sqrt(Math.max(0, e2.lam));
  let xs = ids.map((_, i) => e1.v[i] * s1), ys = ids.map((_, i) => e2.v[i] * s2);

  // orient: right-bloc parties to the right (PC1), government upward (PC2) — cosmetic only
  const RIGHT = new Set(['Sjálfstæðisflokkur', 'Miðflokkurinn']), GOV = new Set(['Samfylkingin', 'Viðreisn', 'Flokkur fólksins']);
  function meanBy(arr, pred) { let s = 0, n = 0; mps.forEach((m, i) => { if (pred(m)) { s += arr[i]; n++; } }); return n ? s / n : 0; }
  if (meanBy(xs, m => RIGHT.has(m.flokkur)) < meanBy(xs, m => !RIGHT.has(m.flokkur))) xs = xs.map(x => -x);
  if (meanBy(ys, m => GOV.has(m.flokkur)) < meanBy(ys, m => !GOV.has(m.flokkur))) ys = ys.map(y => -y);

  // scale to ~[-95,95] with one common factor (keeps PC1 visibly wider than PC2)
  let mAbs = 0; xs.concat(ys).forEach(v => { if (Math.abs(v) > mAbs) mAbs = Math.abs(v); });
  const f = mAbs > 0 ? 95 / mAbs : 1;
  mps.forEach((m, i) => { m.mx = Math.round(xs[i] * f * 10) / 10; m.my = Math.round(ys[i] * f * 10) / 10; });
  fs.writeFileSync(DIR + 'althingi.json', JSON.stringify(mps, null, 0));

  console.log('baked mx/my | PC1 var', Math.round(e1.lam), 'PC2 var', Math.round(e2.lam), '| PC1 share', (e1.lam / (e1.lam + e2.lam)).toFixed(2));
  const cen = {}; mps.forEach(m => { (cen[m.flokkur] = cen[m.flokkur] || [0, 0, 0]); cen[m.flokkur][0] += m.mx; cen[m.flokkur][1] += m.my; cen[m.flokkur][2]++; });
  console.log('party centroids (x,y):'); Object.keys(cen).forEach(p => console.log('  ', p, (cen[p][0] / cen[p][2]).toFixed(0), (cen[p][1] / cen[p][2]).toFixed(0)));
})().catch(e => console.log('ERR', e.message));
