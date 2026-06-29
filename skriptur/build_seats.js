// Áfangi 6: raunveruleg sætaskipan þingsalsins úr opinberu PDF (Thingsalur_..pdf).
// Extracts each name's (x,y) from the PDF text runs by pairing first+last name tokens
// by spatial proximity, matches to MPs/ministers, bakes seat coords (sx,sy) + report.
const fs = require('fs');
const PDFParser = require('pdf2json');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
let cabinet = []; try { cabinet = JSON.parse(fs.readFileSync(DIR + 'cabinet.json', 'utf8')); } catch (e) {}
const norm = s => decodeURIComponent(s || '').replace(/­/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const p = new PDFParser();
p.on('pdfParser_dataError', e => console.log('ERR', e.parserError));
p.on('pdfParser_dataReady', data => {
  const pg = data.Pages[0];
  // collect non-space text runs with position + tokens
  const runs = [];
  pg.Texts.forEach(t => {
    const txt = norm(t.R.map(r => r.T).join(''));
    if (!txt) return;
    runs.push({ x: t.x, y: t.y, txt: txt, tok: txt.split(' ') });
  });
  console.log('non-empty runs:', runs.length);

  // master list of people we want to place: sitting MPs (+ ministers from cabinet not already MPs)
  const people = mps.map(m => ({ id: m.id, nafn: m.nafn, flokkur: m.flokkur, src: 'mp' }));
  const mpNames = new Set(mps.map(m => norm(m.nafn)));
  cabinet.forEach(c => { if (!mpNames.has(norm(c.nafn))) people.push({ id: c.id, nafn: c.nafn, flokkur: c.flokur, src: 'min', emb: c.emb }); });

  // 8 names are drawn ROTATED on the U's arms and pdf2json drops them entirely → place by
  // interpolation against the 55 exact neighbours (verified visually vs the PDF render).
  // (Ingveldur Anna Sigurðardóttir is NOT in this PDF dated 04.06.2026 → no seat.)
  const MANUAL = {
    'eydís ásbjörnsdóttir': [6.5, 5.2], 'kristján þórður snæbjarnarson': [11.8, 10.2],
    'grímur grímsson': [8.6, 11.8], 'halla hrund logadóttir': [14, 15.5],
    'jón gnarr': [42, 4.8], 'guðlaugur þór þórðarson': [34.3, 9.2],
    'sigmundur ernir rúnarsson': [36.2, 11.8], 'eiríkur björn björgvinsson': [31.8, 15.2]
  };
  function locate(nafn) {
    const m = MANUAL[norm(nafn)]; if (m) return { x: m[0], y: m[1], d: 0, man: true };
    const tk = norm(nafn).split(' '); const fn = tk[0], ln = tk[tk.length - 1];
    const fnR = runs.filter(r => r.tok.indexOf(fn) > -1);
    const lnR = runs.filter(r => r.tok.indexOf(ln) > -1);
    let best = null, bd = 1e9;
    fnR.forEach(a => lnR.forEach(b => { const d = (a === b) ? 0 : dist(a, b); if (d < bd) { bd = d; best = { a, b }; } }));
    if (!best || bd > 4.2) return null;
    return { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2, d: bd };
  }
  const cabMap = {}; cabinet.forEach(c => { cabMap[norm(c.nafn)] = (c.emb && c.emb[0]) || 'ráðherra'; });

  const seats = []; const miss = [];
  people.forEach(pp => { const L = locate(pp.nafn); if (L) seats.push({ id: pp.id, nafn: pp.nafn, flokkur: pp.flokkur, src: pp.src, role: cabMap[norm(pp.nafn)] || null, x: +L.x.toFixed(2), y: +L.y.toFixed(2), man: !!L.man }); else miss.push(pp.nafn + ' (' + pp.src + ')'); });
  console.log('placed:', seats.length, '/', people.length);
  if (miss.length) console.log('NOT FOUND in PDF:', JSON.stringify(miss));

  // STRAIGHTEN: the PDF text anchors wobble, so rows/columns look scattered. Classify each
  // seat as part of a horizontal row or vertical column (by its 3 nearest neighbours), then
  // snap the cross-axis to the line's mean so arms render as clean straight lines.
  seats.forEach(s => {
    const nb = seats.filter(z => z !== s).map(z => ({ z, d: dist(s, z) })).sort((a, b) => a.d - b.d).slice(0, 3).map(o => o.z);
    s.orient = nb.filter(z => Math.abs(z.y - s.y) < Math.abs(z.x - s.x)).length >= 2 ? 'h' : 'v';
  });
  // group seats whose coord chains within tol, then snap each group to its mean
  function regroup(list, get, set, tol) {
    const sorted = list.slice().sort((a, b) => get(a) - get(b)); let g = [];
    sorted.forEach(s => { const last = g.length ? g[g.length - 1] : null; if (last && get(s) - get(last[last.length - 1]) <= tol) last.push(s); else g.push([s]); });
    g.forEach(grp => { const m = grp.reduce((a, s) => a + get(s), 0) / grp.length; grp.forEach(s => set(s, Math.round(m * 100) / 100)); });
    return g.length;
  }
  const rows = regroup(seats.filter(s => s.orient === 'h'), s => s.y, (s, v) => s.y = v, 1.25);
  const cols = regroup(seats.filter(s => s.orient === 'v'), s => s.x, (s, v) => s.x = v, 1.25);
  console.log('straightened →', rows, 'rows,', cols, 'columns');

  // FINAL leveling: same-bench seats (esp. the symmetric left/right side benches) wobble a few
  // tenths in the raw PDF anchors, so seats that should share a horizontal line sit at slightly
  // different y → the chamber looks "off". Snap every y to its bench level. Gap-aware with a 0.9
  // span cap (benches are ~2.7 apart) so two distinct benches can never be merged together.
  const yBefore = new Set(seats.map(s => s.y)).size;
  (function levelY() {
    const sorted = seats.slice().sort((a, b) => a.y - b.y); let cluster = [];
    function flush() { if (!cluster.length) return; const m = cluster.reduce((a, s) => a + s.y, 0) / cluster.length, v = Math.round(m * 100) / 100; cluster.forEach(s => s.y = v); cluster = []; }
    sorted.forEach(s => { if (cluster.length && (s.y - cluster[0].y) > 0.9) flush(); cluster.push(s); }); flush();
  })();
  console.log('leveled →', new Set(seats.map(s => s.y)).size, 'bench levels (was', yBefore + ')');

  // HANDVIRKAR LEIÐRÉTTINGAR (úr sæta-ritlinum í mælaborðinu, gogn/seat_overrides.json) VINNA
  // yfir PDF-leiddu+réttu hnitin → hand-lagfæringar haldast við endurbyggingu.
  try {
    const ov = JSON.parse(fs.readFileSync(DIR + 'seat_overrides.json', 'utf8'));
    const omap = {}; ov.forEach(o => { omap[o.id] = o; });
    let oc = 0; seats.forEach(s => { const o = omap[s.id]; if (o) { s.x = o.x; s.y = o.y; delete s.man; oc++; } });
    console.log('applied seat_overrides.json →', oc, 'seats');
  } catch (e) { console.log('no seat_overrides.json (skipping manual overrides)'); }

  // report spread
  const xs = seats.map(s => s.x), ys = seats.map(s => s.y);
  console.log('x range', Math.min(...xs).toFixed(1), '-', Math.max(...xs).toFixed(1), '| y range', Math.min(...ys).toFixed(1), '-', Math.max(...ys).toFixed(1));
  // sample a few known anchors to sanity check orientation
  ['Kristrún Frostadóttir', 'Alma D. Möller', 'Grímur Grímsson', 'Eydís Ásbjörnsdóttir', 'Bergþór Ólason'].forEach(n => {
    const s = seats.find(z => norm(z.nafn) === norm(n)); if (s) console.log('  ', n, '→ x', s.x, 'y', s.y);
  });
  console.log('\nSAMPLE seats JSON:', JSON.stringify(seats.slice(0, 2)));
  fs.writeFileSync(DIR + 'seats.json', JSON.stringify(seats));
  console.log('wrote seats.json (', seats.length, 'seats )');
});
p.loadPDF('C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/heimildir/Thingsalur_04062026-kjornir-thingmenn.pdf');
