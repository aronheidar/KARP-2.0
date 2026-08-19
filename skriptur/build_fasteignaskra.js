// build_fasteignaskra.js (LOTA 64) — byggir NÁNAST HEILA fasteignaskrá úr FULLU kaupskránni.
// Flestar íbúðir hafa selst a.m.k. einu sinni frá 2006, og hver kaupskrárröð ber GILDANDI
// fasteignamat + brunabótamat. Við tökum nýjustu færslu per eign → skrá með mati fyrir
// ~allar seldar eignir (ekki bara síðustu 180 daga eins og kaupskra_nyjast).
//
// Skipt eftir PÓSTNÚMERI → web/public/gogn/fasteignaskra/<pn>.json (létt, ein hlaðin í einu).
// + index.json {pn: fjöldi}. Fasteignavaktin les rétt póstnúmer þegar notandi slær inn heimilisfang.
//
// ➕ 19.8.2026: LEIGUSKRÁ HMS (sami OCI-fata, ~30MB) sem ÞRIÐJA stærðar-uppspretta. Íbúðir sem hafa verið
// leigðar út en aldrei selst síðan 2006 (11.919 einingar við mælingu, +13%) fá færslu með stærð, herbergjum
// og tegund — EKKERT mat (leiguskrá ber ekki fasteignamat) og merktar heimild:'leiga' svo framendinn segi
// það. Sjálffylling fasteignavaktar nær þá yfir þær; kaupskrár-færsla vinnur alltaf ef bæði eru til.
//
// KEYRSLA: node skriptur/build_fasteignaskra.js  (~80MB niðurhal, 2–3 mín)

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'fasteignaskra');
const URL = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupskra.csv';
const URL_LEIGA = 'https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/leiguskra.csv';
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
  // ── LEIGUSKRÁ: stærð/herbergi/tegund fyrir einingar sem kaupskráin þekkir ekki ──
  let leigaNy = 0, leigaAlls = 0;
  try {
    console.log('sæki HMS leiguskrá (~30MB)…');
    const rl = await fetch(URL_LEIGA, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
    if (!rl.ok) throw new Error('HTTP ' + rl.status);
    const lt = Buffer.from(await rl.arrayBuffer()).toString('latin1');
    const LL = lt.split(/\r?\n/);
    const LH = LL[0].split(';').map((s) => s.trim());
    const li = { a: LH.indexOf('HEIMILISFANG'), pn: LH.indexOf('POSTNUMER'), sv: LH.indexOf('SVEITARFELAG'), f: LH.indexOf('FASTNUM'), st: LH.indexOf('STAERD'), herb: LH.indexOf('FJ_HERBERGI'), teg: LH.indexOf('TEGUND'), on: LH.indexOf('ONOTHAEFUR_SAMNINGUR'), fra: LH.indexOf('DAGSFRA') };
    if (li.a < 0 || li.f < 0 || li.st < 0) throw new Error('leiguskrá: dálkar fundust ekki — ' + LH.slice(0, 8).join(','));
    const seenL = new Map();   // fastnum → nýjasti samningur (DAGSFRA)
    for (let k = 1; k < LL.length; k++) {
      const c = LL[k].split(';'); if (c.length < LH.length) continue;
      if ((c[li.on] || '').trim() !== '0') continue;
      const teg = (c[li.teg] || '').trim(); if (!RESID.has(teg)) continue;
      const f = (c[li.f] || '').trim(); if (!f || props.has(f)) continue;          // kaupskrá vinnur
      const a = (c[li.a] || '').trim(), pn = (c[li.pn] || '').trim();
      if (!a || !/^\d{3}$/.test(pn)) continue;
      const fm = flmOf(c[li.st]); if (!fm || fm <= 10) continue;
      const fra = (c[li.fra] || '').slice(0, 10);
      const prev = seenL.get(f); if (prev && prev.fra >= fra) continue;
      leigaAlls++;
      seenL.set(f, { a, pn, sv: (c[li.sv] || '').trim(), teg, fnr: f, full: null, mat: null, matN: null, bruna: null, ar: null, fm, herb: num(c[li.herb]), lod: null, ld: null, lv: null, heimild: 'leiga', fra });
    }
    for (const [f, e] of seenL) { delete e.fra; props.set(f, e); leigaNy++; }
    console.log('leiguskrá:', leigaNy, 'einingar bætt við úr leiguskrá (aðeins þær sem kaupskráin þekkir ekki)');
  } catch (e) {
    // Leiguskráin er viðbót — bili hún stendur kaupskrár-grunnurinn óskertur, en það á að SJÁST í keyrslu-loggnum.
    console.error('⚠ leiguskrá brást, haldið áfram án hennar:', String(e).slice(0, 200));
  }
  // ── HMS-eignarlýsing (hæð/lyfta/svalir/bílskúr/baðherb.) úr sölu-úrtaki fasteignamats 2027, per FASTNUM ──
  // gogn/hms/einingar.json (build_hms_2027.py, árlegt). Birtist á eignaspjaldi; breytir EKKI matinu (mælt: ±1%).
  try {
    const EP = path.join(__dirname, '..', 'gogn', 'hms', 'einingar.json');
    if (fs.existsSync(EP)) {
      const E = JSON.parse(fs.readFileSync(EP, 'utf8')).e || {};
      let hit = 0;
      for (const p of props.values()) { if (p.fnr && E[p.fnr]) { p.hms = E[p.fnr]; hit++; } }
      console.log('HMS-eignarlýsing:', hit, 'eignir fengu hæð/lyftuhús/svalir/bílskúr/baðkör-sturtur (af', Object.keys(E).length, 'í einingar.json)');
    } else console.warn('⚠ gogn/hms/einingar.json vantar — engin HMS-eignarlýsing (keyrðu build_hms_2027.py)');
  } catch (e) { console.error('⚠ HMS-eignarlýsing brást, haldið áfram án hennar:', String(e).slice(0, 160)); }
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
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), n: props.size, note: 'Fasteignaskrá úr kaupskrá HMS — nýjasta þinglýsta sala per eign + gildandi fasteignamat/brunabótamat (eignir seldar frá 2006) + einingar úr leiguskrá HMS (heimild:leiga — stærð/herb./tegund, EKKERT mat).', leiga: leigaNy, byPn: index, bySv: bySvArr }));
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

  // ── MATSSVÆÐI HMS: sölur síðustu 12 mán per svæði (fyrir /fasteignaverd/<svæði>/ SSG-síðurnar) ──
  // Svæðið á hverju heimilisfangi kemur úr hnit/<pn>.json [5] (build_hnit.js, k-NN úr sölu-úrtaki HMS).
  // Skrifað í gogn/matssvaedi_solur.json: per svæði miðgildi þ.kr/m² (fjölbýli / sérbýli+einbýli) sl. 12 mán
  // og 12 mán þar á undan (þróun), fjöldi, og 40 nýjustu sölur. Engin svæðaskrá → sleppt með viðvörun.
  try {
    const HNIT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'hnit');
    const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const NU = Date.now(), AR = 365 * 864e5;
    const zs = {};
    let med = 0, an = 0;
    for (const pn of Object.keys(salesByPn)) {
      const hp = path.join(HNIT, pn + '.json'); if (!fs.existsSync(hp)) continue;
      const hn = JSON.parse(fs.readFileSync(hp, 'utf8'));
      for (const sv of salesByPn[pn]) {
        const c = hn[norm(sv.a)]; const z = c && c[5]; if (!z) { an++; continue; }
        med++;
        const t = new Date(sv.d + 'T00:00:00').getTime(); const age = NU - t;
        const Z = (zs[z] = zs[z] || { n12: 0, f12: [], s12: [], fPrev: [], sPrev: [], solur: [] });
        const fj = sv.teg === 'Fjölbýli';
        if (age <= AR) { Z.n12++; (fj ? Z.f12 : Z.s12).push(sv.ppm); if (Z.solur.length < 40) Z.solur.push({ a: sv.a, pn, d: sv.d, kv: sv.kv, fm: sv.fm, teg: sv.teg, ar: sv.ar, ppm: sv.ppm }); }
        else if (age <= 2 * AR) (fj ? Z.fPrev : Z.sPrev).push(sv.ppm);
      }
    }
    const mid = (arr) => { if (!arr.length) return null; const s2 = arr.slice().sort((x, y) => x - y); const m = s2.length >> 1; return Math.round((s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2) / 1000); };
    const out = {};
    for (const z of Object.keys(zs)) {
      const Z = zs[z];
      Z.solur.sort((x, y) => y.d.localeCompare(x.d));
      out[z] = { n12: Z.n12, nFjol: Z.f12.length, nSer: Z.s12.length, medFjol: mid(Z.f12), medSer: mid(Z.s12), prevFjol: mid(Z.fPrev), prevSer: mid(Z.sPrev), nPrev: Z.fPrev.length + Z.sPrev.length, solur: Z.solur };
    }
    fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'matssvaedi_solur.json'), JSON.stringify({ updated: new Date().toISOString(), note: 'Sölur úr kaupskrá HMS varpaðar á matssvæði HMS (hnit/<pn>.json [5]). þ.kr/m² miðgildi sl. 12 mán + 12 mán á undan.', byZone: out }));
    console.log('matssvæði-sölur:', Object.keys(out).length, 'svæði |', med, 'sölur með svæði,', an, 'án');
  } catch (e) { console.error('⚠ matssvæði-sölur brugðust, haldið áfram:', String(e).slice(0, 160)); }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
