// build_fasteignaskra.js (LOTA 64) — byggir NÁNAST HEILA fasteignaskrá úr FULLU kaupskránni.
// Flestar íbúðir hafa selst a.m.k. einu sinni frá 2006, og hver kaupskrárröð ber GILDANDI
// fasteignamat + brunabótamat. Við tökum nýjustu færslu per eign → skrá með mati fyrir
// ~allar seldar eignir (ekki bara síðustu 180 daga eins og kaupskra_nyjast).
//
// Skipt eftir PÓSTNÚMERI → web/public/gogn/fasteignaskra/<pn>.json (létt, ein hlaðin í einu).
// + index.json {pn: fjöldi}. Fasteignavaktin les rétt póstnúmer þegar notandi slær inn heimilisfang.
//
// KEYRSLA: node skriptur/build_fasteignaskra.js  (~45MB niðurhal, 1–2 mín)

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'fasteignaskra');
const URL = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupskra.csv';
const RESID = new Set(['Fjölbýli', 'Sérbýli', 'Einbýli']);

(async () => {
  console.log('sæki HMS kaupskrá (~45MB)…');
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = Buffer.from(await r.arrayBuffer()).toString('latin1');
  const lines = txt.split(/\r?\n/);
  const H = lines[0].split(';').map((s) => s.trim());
  const i = {
    hf: H.indexOf('HEIMILISFANG'), pn: H.indexOf('POSTNR'), sv: H.indexOf('SVEITARFELAG'),
    dt: H.indexOf('THINGLYSTDAGS'), kv: H.indexOf('KAUPVERD'), teg: H.indexOf('TEGUND'), on: H.indexOf('ONOTHAEFUR_SAMNINGUR'),
    mat: H.indexOf('FASTEIGNAMAT_GILDANDI'), matN: H.indexOf('FYRIRHUGAD_FASTEIGNAMAT'), bruna: H.indexOf('BRUNABOTAMAT_GILDANDI'),
    ar: H.indexOf('BYGGAR'), flm: H.indexOf('EINFLM'), fastnum: H.indexOf('FASTNUM'),
    herb: H.indexOf('FJHERB'), lod: H.indexOf('LOD_FLM'), fb: H.indexOf('FULLBUID'),
  };
  // lykill per eign = FASTNUM (stöðugt) — annars heimilisfang+pn. Halda NÝJUSTU sölu.
  const props = new Map();
  let total = 0;
  const num = (v) => { const n = +v; return n > 0 ? n : null; };
  const flmOf = (v) => Math.round((parseFloat((v || '').replace(',', '.')) || 0) * 10) / 10 || null;
  // SÖLUSAGA (LOTA 67): ALLAR gildar sölur sl. ~5,5 ár per póstnúmer → sölugraf + sambærilegar
  const SOLU_FRA = new Date(Date.now() - 2010 * 864e5).toISOString().slice(0, 10);
  const salesByPn = {};
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(';'); if (c.length < H.length) continue;
    if ((c[i.on] || '').trim() !== '0') continue;
    if (!RESID.has((c[i.teg] || '').trim())) continue;
    const a = (c[i.hf] || '').trim(), pn = (c[i.pn] || '').trim();
    if (!a || !/^\d{3}$/.test(pn)) continue;
    const d = (c[i.dt] || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const teg = (c[i.teg] || '').trim();
    const kvN = num(c[i.kv]), fmN = flmOf(c[i.flm]);
    // sölusaga: hver þinglýst sala (eign getur selst oft) innan glugga með gilt verð+stærð
    if (d >= SOLU_FRA && kvN && fmN && fmN > 15) {
      (salesByPn[pn] = salesByPn[pn] || []).push({
        a, d, kv: kvN, fm: fmN, teg, herb: num(c[i.herb]), ar: num(c[i.ar]),
        ppm: Math.round((kvN * 1000) / fmN),               // verð á m² í kr
      });
    }
    const key = (c[i.fastnum] || '').trim() || (a.toLowerCase() + '|' + pn);
    const prev = props.get(key);
    if (prev && prev.d >= d) continue;                 // höldum nýjustu sölu
    props.set(key, {
      a, pn, sv: (c[i.sv] || '').trim(), teg,
      fnr: (c[i.fastnum] || '').trim() || null, full: (c[i.fb] || '').trim() === '1' ? 1 : 0,
      mat: num(c[i.mat]), matN: num(c[i.matN]), bruna: num(c[i.bruna]),
      ar: num(c[i.ar]), fm: fmN, herb: num(c[i.herb]),
      lod: Math.round(parseFloat((c[i.lod] || '').replace(',', '.')) || 0) || null,
      ld: d.slice(0, 7), lv: kvN,                          // síðasta sala: mánuður + verð (þús.kr)
    });
    total++;
  }
  // hópa eftir póstnúmeri
  const byPn = {};
  for (const p of props.values()) (byPn[p.pn] = byPn[p.pn] || []).push(p);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = {}, bySv = {};
  let bytes = 0;
  for (const pn of Object.keys(byPn)) {
    const arr = byPn[pn].sort((a, b) => a.a.localeCompare(b.a, 'is'));
    const s = JSON.stringify(arr);
    fs.writeFileSync(path.join(OUT, pn + '.json'), s);
    index[pn] = arr.length; bytes += s.length;
    // sveitarfélag → póstnúmer (svo framendi geti hlaðið rétt skjöl þegar muni er valið)
    for (const sv of new Set(arr.map((p) => p.sv).filter(Boolean))) (bySv[sv] = bySv[sv] || new Set()).add(pn);
  }
  const bySvArr = {}; Object.keys(bySv).forEach((sv) => (bySvArr[sv] = [...bySv[sv]].sort()));
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), n: props.size, note: 'Fasteignaskrá úr kaupskrá HMS — nýjasta þinglýsta sala per eign + gildandi fasteignamat/brunabótamat. Nær yfir eignir sem hafa selst frá 2006.', byPn: index, bySv: bySvArr }));
  // GÖTU-VÍSIR (LOTA 65): götunafn → póstnúmer, svo fléttilistinn finni rétta skrá strax
  // og notandi þurfi EKKI að skrifa póstnúmerið fyrst. { "brunnstígur": ["230"], … }
  const gotur = {};
  for (const p of props.values()) {
    const g = p.a.replace(/\s+\d+[a-zæöðáéíóúý]?$/i, '').toLowerCase().trim();
    if (g.length < 2) continue;
    (gotur[g] = gotur[g] || new Set()).add(p.pn);
  }
  const gArr = {}; Object.keys(gotur).forEach((g) => (gArr[g] = [...gotur[g]].sort()));
  const gs = JSON.stringify(gArr);
  fs.writeFileSync(path.join(OUT, 'gotur.json'), gs);
  console.log('gotur.json:', Object.keys(gArr).length, 'einkvæm götunöfn |', (gs.length / 1024).toFixed(0), 'KB');
  console.log('fasteignaskra:', props.size, 'eignir í', Object.keys(byPn).length, 'póstnúmerum |', (bytes / 1024 / 1024).toFixed(1), 'MB alls | stærsta pn:', Object.entries(index).sort((a, b) => b[1] - a[1])[0].join('='));

  // ── SÖLUSAGA per póstnúmer (LOTA 67): sölugraf + sambærilegar eignir ──
  const SOL = path.join(OUT, '..', 'solusaga');
  fs.rmSync(SOL, { recursive: true, force: true });
  fs.mkdirSync(SOL, { recursive: true });
  let solBytes = 0, solN = 0;
  const solIdx = {};
  for (const pn of Object.keys(salesByPn)) {
    const arr = salesByPn[pn].sort((a, b) => b.d.localeCompare(a.d));   // nýjast fyrst
    const s = JSON.stringify(arr);
    fs.writeFileSync(path.join(SOL, pn + '.json'), s);
    solBytes += s.length; solN += arr.length; solIdx[pn] = arr.length;
  }
  fs.writeFileSync(path.join(SOL, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), fra: SOLU_FRA, n: solN, byPn: solIdx }));
  console.log('solusaga:', solN, 'sölur (frá ' + SOLU_FRA + ') í', Object.keys(salesByPn).length, 'póstnúmerum |', (solBytes / 1024 / 1024).toFixed(1), 'MB');
})().catch((e) => { console.error('ERR', e); process.exit(1); });
