// =============================================================================
//  build_thingskyrsla.js — gagnavél Þingmannaskýrslunnar (seld vara, 990/áskrift)
//  Reiknar PER ÞINGMANN (aðalmenn úr althingi.json):
//   · rebel[]        uppreisnar-atkvæði (kaus gegn meirihluta eigin flokks) m/heiti+dags
//   · man[]          mánaðarleg þátttaka í nafnaköllum (mæting yfir tíma)
//   · voteAreas[]    atkvæði eftir OPINBERUM efnisflokkum Alþingis (33 flokkar/11 yfirflokkar)
//   · speechAreas[]  ræðumínútur eftir sömu efnisflokkum (úr raedulisti)
//   · fyrirspurnir[] fyrirspurnir hans til ráðherra (flutningsmaður úr þingskjals-XML) + svarað?
//   · flutt[]        mál sem hann er FYRSTI flutningsmaður að (frumvörp/tillögur) + staða
//   · medflutt       fjöldi mála sem meðflutningsmaður
//   · pct{}          hundraðshlutaröðun á þingi (ræðutími/mæting/andsvör/fyrirspurnir)
//  + avg (þingmeðaltöl) og flAvg (flokksmeðaltöl) til samanburðar í skýrslunni.
//
//  Úttak: gogn/thingskyrsla.json
//  Skyndiminni (inkremental, flutningsmenn breytast aldrei): gogn/flutningsmenn_cache.json
//  Keyrsla: node skriptur/build_thingskyrsla.js   (~3–8 mín; ~2–4þús köll á opna XML Alþingis)
//  ATH: build_votes.js notar gamla OneDrive-slóð — þetta skript er sjálfstætt m/réttum slóðum.
// =============================================================================
const fs = require('fs');
const path = require('path');
const GOGN = path.join(__dirname, '..', 'gogn');
const LTHING = 157;
const BASE = 'https://www.althingi.is/altext/xml/';
const UA = { headers: { 'User-Agent': 'KARP build (karp.is)' } };

const MPS = JSON.parse(fs.readFileSync(path.join(GOGN, 'althingi.json'), 'utf8'));
const RAEDUGR = (() => { try { return JSON.parse(fs.readFileSync(path.join(GOGN, 'raedugreining.json'), 'utf8')); } catch (e) { return { mp: {} }; } })();
const party = {}; const ids = new Set();
MPS.forEach((m) => { party[m.id] = m.flokkur; ids.add(m.id); });

const grab = (x, tag) => { const m = x.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''; };
async function getText(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, UA); if (r.ok) return await r.text(); } catch (e) {}
    await new Promise((s) => setTimeout(s, 400 * (i + 1)));
  }
  return '';
}
async function pool(items, n, fn) { let i = 0; async function w() { while (i < items.length) { const k = i++; await fn(items[k], k); } } await Promise.all(Array.from({ length: n }, w)); }

(async () => {
  // ── 1) Opinberir efnisflokkar: id→heiti/yfirflokkur + mál→flokkar ─────────
  console.log('1/5 Efnisflokkar…');
  const efIndex = await getText(BASE + 'efnisflokkar/');
  const areas = {}; // id → { h, y }
  efIndex.split('<yfirflokkur').slice(1).forEach((yb) => {
    const yh = grab(yb, 'heiti');
    yb.split('<efnisflokkur').slice(1).forEach((eb) => {
      const id = +((eb.match(/^ id='(\d+)'/) || [])[1] || 0);
      const h = grab(eb, 'heiti');
      if (id && h) areas[id] = { h, y: yh };
    });
  });
  const malAreas = {}; // malnr → [efnisflokkaId]
  await pool(Object.keys(areas), 6, async (aid) => {
    const x = await getText(BASE + 'efnisflokkar/efnisflokkur/?lthing=' + LTHING + '&efnisflokkur=' + aid);
    [...x.matchAll(/<mál málsnúmer='(\d+)'/g)].forEach((m) => { (malAreas[+m[1]] = malAreas[+m[1]] || []).push(+aid); });
  });
  console.log('  efnisflokkar:', Object.keys(areas).length, '| mál með flokkun:', Object.keys(malAreas).length);

  // ── 2) Öll nafnaköll: uppreisn m/heiti, mánaðarleg mæting, atkvæði eftir sviðum ──
  console.log('2/5 Atkvæðagreiðslur…');
  const listXml = await getText(BASE + 'atkvaedagreidslur/?lthing=' + LTHING);
  // hver færsla ber atkvæðagreiðslunúmer + málsnúmer + málsheiti + tíma (sjá minnisnótu 2026-06-19)
  const votes = listXml.split('<atkvæðagreiðsla ').slice(1).map((b) => ({
    vid: +((b.match(/atkvæðagreiðslunúmer='(\d+)'/) || [])[1] || 0),
    mal: +((b.match(/málsnúmer='(\d+)'/) || [])[1] || 0),
    heiti: grab(b, 'málsheiti'),
    timi: (grab(b, 'tími') || '').slice(0, 10),
  })).filter((v) => v.vid);
  console.log('  atkvæðagreiðslur:', votes.length);

  const T = {}; // per-MP söfnun
  MPS.forEach((m) => { T[m.id] = { rebel: [], man: {}, va: {}, recorded: 0, greidd: 0, fjarv: 0 }; });
  let recCount = 0, done = 0;
  await pool(votes, 10, async (v) => {
    const x = await getText(BASE + 'atkvaedagreidslur/atkvaedagreidsla/?numer=' + v.vid);
    if (++done % 300 === 0) console.log('  …', done, 'af', votes.length);
    if (!x) return;
    const pv = {}; // id → atkvæði
    x.split('<þingmaður id=').slice(1).forEach((b) => {
      const id = +((b.match(/^'(\d+)'/) || [])[1] || 0);
      const a = (b.match(/<atkvæði>([^<]*)<\/atkvæði>/) || [])[1];
      if (id && a) pv[id] = a;
    });
    const keys = Object.keys(pv).map(Number).filter((id) => ids.has(id));
    if (!keys.some((id) => pv[id] === 'já' || pv[id] === 'nei')) return; // ekki skráð já/nei-nafnakall
    recCount++;
    const mon = (v.timi || '').slice(0, 7);
    const pj = {}; // flokkur → {já,nei}
    keys.forEach((id) => { const a = pv[id]; if (a === 'já' || a === 'nei') { const p = party[id]; (pj[p] = pj[p] || { 'já': 0, nei: 0 })[a]++; } });
    keys.forEach((id) => {
      const a = pv[id], t = T[id];
      t.recorded++;
      if (mon) { const mm = (t.man[mon] = t.man[mon] || [0, 0]); mm[0]++; if (a === 'fjarverandi' || a === 'boðaði fjarvist') mm[1]++; }
      if (a === 'fjarverandi' || a === 'boðaði fjarvist') t.fjarv++;
      if (a === 'já' || a === 'nei') {
        t.greidd++;
        // atkvæði eftir efnisflokkum málsins
        (malAreas[v.mal] || []).forEach((aid) => { const c = (t.va[aid] = t.va[aid] || [0, 0, 0]); c[0]++; if (a === 'já') c[1]++; else c[2]++; });
        const c = pj[party[id]];
        const ja = c['já'] - (a === 'já' ? 1 : 0), nei = c.nei - (a === 'nei' ? 1 : 0); // meirihluti flokks ÁN hans sjálfs (sbr. build_votes.js)
        if (ja !== nei && a !== (ja > nei ? 'já' : 'nei')) {
          t.rebel.push({ v: v.vid, m: v.mal, h: v.heiti.slice(0, 120), t: v.timi, atk: a, fj: [ja, nei] });
        }
      }
    });
  });
  console.log('  skráð já/nei-nafnaköll:', recCount);

  // ── 3) Ræðulisti → ræðumínútur eftir efnisflokkum ──────────────────────────
  console.log('3/5 Ræðulisti (stór skrá)…');
  const rl = await getText(BASE + 'raedulisti/?lthing=' + LTHING);
  const SA = {}; // id → { areaId: [min, n] }
  rl.split('<ræða>').slice(1).forEach((c) => {
    const id = +((c.match(/<ræðumaður id='(\d+)'/) || [])[1] || 0);
    if (!id || !ids.has(id)) return;
    if (c.includes('<forsetiAlþingis') || c.includes('<forsetiÍslands')) return; // fundarstjórn forseta
    const mal = +(grab(c, 'málsnúmer') || 0); // ATH: element í ræðulista (attribút í atkvgr.-lista!)
    const t0 = grab(c, 'ræðahófst'), t1 = grab(c, 'ræðulauk');
    if (!mal || !t0 || !t1) return;
    const min = (new Date(t1) - new Date(t0)) / 60000;
    if (!(min > 0)) return;
    (malAreas[mal] || []).forEach((aid) => { const s = ((SA[id] = SA[id] || {})[aid] = SA[id][aid] || [0, 0]); s[0] += min; s[1]++; });
  });

  // ── 4) Flutningsmenn + fyrirspurnir (inkremental skyndiminni) ─────────────
  console.log('4/5 Þingmál + flutningsmenn…');
  const CACHE_F = path.join(GOGN, 'flutningsmenn_cache.json');
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE_F, 'utf8')); } catch (e) {}
  if (cache._thing !== LTHING) cache = { _thing: LTHING }; // nýtt þing → tæma
  const malXml = await getText(BASE + 'thingmalalisti/?lthing=' + LTHING);
  const mals = malXml.split('<mál ').slice(1).map((b) => ({
    nr: +((b.match(/málsnúmer='(\d+)'/) || [])[1] || 0),
    heiti: grab(b, 'málsheiti'),
    teg: (b.match(/<málstegund málstegund='([^']+)'/) || [])[1] || '',
    teg2: grab(b, 'heiti2'),
    til: grab(b, 'fyrirspurntil'),
  })).filter((m) => m.nr && m.heiti);
  // A-mál með flutningsmönnum: frumvörp (l), tillögur (a), fyrirspurnir (q/m), beiðnir (b)
  const withFm = mals.filter((m) => ['l', 'a', 'q', 'm', 'b'].includes(m.teg));
  const need = withFm.filter((m) => !cache[m.nr]);
  console.log('  þingmál:', mals.length, '| með flutningsm.:', withFm.length, '| ný í skyndiminni:', need.length);
  await pool(need, 10, async (m) => {
    const det = await getText(BASE + 'thingmalalisti/thingmal/?lthing=' + LTHING + '&malnr=' + m.nr);
    if (!det) return;
    const stada = grab(det, 'staðamáls');
    const skjalnr = +(((det.match(/<þingskjal skjalsnúmer='(\d+)'/) || [])[1]) || 0);
    let fm = [];
    if (skjalnr) {
      const sk = await getText(BASE + 'thingskjol/thingskjal/?lthing=' + LTHING + '&skjalnr=' + skjalnr);
      fm = [...sk.matchAll(/<flutningsmaður röð='(\d+)' id='(\d+)'>/g)].map((x) => [+x[2], +x[1]]); // [id, röð]
      // ráðherra-flutt stjórnarmál: <ráðherra ...> án flutningsmanna → tómt fm er í lagi
    }
    cache[m.nr] = { s: stada.slice(0, 90), fm };
  });
  fs.writeFileSync(CACHE_F, JSON.stringify(cache));

  const FYR = {}, FLUTT = {}, MED = {}; // per MP
  withFm.forEach((m) => {
    const c = cache[m.nr]; if (!c) return;
    (c.fm || []).forEach(([id, rod]) => {
      if (!ids.has(id)) return;
      if (m.teg === 'q' || m.teg === 'm') {
        if (rod === 1) (FYR[id] = FYR[id] || []).push({ m: m.nr, h: m.heiti.slice(0, 110), til: m.til, sv: /svarað/i.test(c.s || '') });
      } else if (rod === 1) {
        (FLUTT[id] = FLUTT[id] || []).push({ m: m.nr, h: m.heiti.slice(0, 110), teg: m.teg2 || m.teg, s: (c.s || '').slice(0, 60) });
      } else {
        MED[id] = (MED[id] || 0) + 1;
      }
    });
  });

  // ── 5) Samsetning + percentiles + meðaltöl ─────────────────────────────────
  console.log('5/5 Samsetning…');
  const pctOf = (arr, val) => { const s = arr.filter((x) => x != null).sort((a, b) => a - b); if (!s.length || val == null) return null; let i = 0; while (i < s.length && s[i] <= val) i++; return Math.round((i / s.length) * 100); };
  const allRaedumin = MPS.map((m) => m.raedumin || 0);
  const allMaeting = MPS.map((m) => (T[m.id].recorded ? 100 - (T[m.id].fjarv / T[m.id].recorded) * 100 : null));
  const allAndsvor = MPS.map((m) => (RAEDUGR.mp[m.id] || {}).andsvor || 0);
  const allFyr = MPS.map((m) => (FYR[m.id] || []).length);
  const allFlutt = MPS.map((m) => (FLUTT[m.id] || []).length);

  const num = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  const mp = {};
  MPS.forEach((m) => {
    const t = T[m.id];
    const maeting = t.recorded ? 100 - (t.fjarv / t.recorded) * 100 : null;
    mp[m.id] = {
      rebel: t.rebel.sort((a, b) => (b.t || '').localeCompare(a.t || '')),
      man: Object.keys(t.man).sort().map((k) => [k, t.man[k][0], t.man[k][1]]),
      voteAreas: Object.keys(t.va).map((aid) => [+aid, ...t.va[aid]]).sort((a, b) => b[1] - a[1]).slice(0, 14),
      speechAreas: Object.keys(SA[m.id] || {}).map((aid) => [+aid, Math.round(SA[m.id][aid][0]), SA[m.id][aid][1]]).sort((a, b) => b[1] - a[1]).slice(0, 14),
      fyrirspurnir: (FYR[m.id] || []).sort((a, b) => b.m - a.m),
      flutt: (FLUTT[m.id] || []).sort((a, b) => b.m - a.m),
      medflutt: MED[m.id] || 0,
      maeting: num(maeting),
      pct: {
        raedumin: pctOf(allRaedumin, m.raedumin || 0),
        maeting: pctOf(allMaeting, maeting),
        andsvor: pctOf(allAndsvor, (RAEDUGR.mp[m.id] || {}).andsvor || 0),
        fyrirspurnir: pctOf(allFyr, (FYR[m.id] || []).length),
        flutt: pctOf(allFlutt, (FLUTT[m.id] || []).length),
      },
    };
  });

  const avgOf = (arr) => { const v = arr.filter((x) => x != null); return v.length ? num(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const avg = {
    raedumin: avgOf(MPS.map((m) => m.raedumin)),
    hollusta: avgOf(MPS.map((m) => m.hollusta)),
    maeting: avgOf(allMaeting),
    uppreisn: avgOf(MPS.map((m) => m.uppreisn)),
    fyrirspurnir: avgOf(allFyr),
    flutt: avgOf(allFlutt),
    laun: avgOf(MPS.map((m) => m.laun)),
  };
  const flAvg = {};
  [...new Set(MPS.map((m) => m.flokkur))].forEach((f) => {
    const g = MPS.filter((m) => m.flokkur === f);
    flAvg[f] = { hollusta: avgOf(g.map((m) => m.hollusta)), maeting: avgOf(g.map((m) => (T[m.id].recorded ? 100 - (T[m.id].fjarv / T[m.id].recorded) * 100 : null))), raedumin: avgOf(g.map((m) => m.raedumin)) };
  });

  const out = { updated: new Date().toISOString().slice(0, 10), thing: LTHING, recVotes: recCount, areas, avg, flAvg, mp };
  fs.writeFileSync(path.join(GOGN, 'thingskyrsla.json'), JSON.stringify(out));
  const sz = fs.statSync(path.join(GOGN, 'thingskyrsla.json')).size;
  console.log('WROTE gogn/thingskyrsla.json', (sz / 1024).toFixed(0) + 'KB');
  // stikkprufa
  const sample = MPS.find((m) => m.nafn === 'Jón Pétur Zimsen') || MPS[0];
  const s = mp[sample.id];
  console.log('DÆMI', sample.nafn, '| rebel:', s.rebel.length, '| voteAreas:', s.voteAreas.length, '| speechAreas:', s.speechAreas.length, '| fyrirspurnir:', s.fyrirspurnir.length, '| flutt:', s.flutt.length, '| meðflutt:', s.medflutt, '| mæting:', s.maeting + '%', '| pct:', JSON.stringify(s.pct));
  const rebelTop = MPS.map((m) => [m.nafn, mp[m.id].rebel.length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('FLEST uppreisnar-atkvæði:', JSON.stringify(rebelTop));
})().catch((e) => { console.error('ERR', e); process.exit(1); });
