// ─────────────────────────────────────────────────────────────
// build_urslit.js — NIÐURSTÖÐUR ÚTBOÐA (LOTA 30): hver vann og á hvaða verði.
// Veitur:
//   TED award-notices (can-standard, place-of-performance ISL) — sigurvegari,
//     kaupandi, samningsverðmæti; 3×100 nýjustu um opið API ESB.
//   Landsvirkjun opnunarfundargerðir — bjóðendur + tilboðsupphæðir (ISK) úr
//     __NEXT_DATA__ accordion-texta útboðssíðunnar.
// Gjaldmiðlavarúð: TED-gjaldmiðlaskráning er stundum gölluð (GBP á íslenskum
// útboðum) — upphæð aðeins túlkuð sem kr. ef 'ISK' er í cur-fylkinu.
// Úttak: gogn/utbod_urslit.json + web/public/gogn (awards, opnanir, byWinner).
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const UA = { 'User-Agent': 'KARP utbodsvakt (karp.is; aronheidars@gmail.com)' };

const txtOf = (v) => {
  // TED-svið koma ýmist sem strengur, fylki eða {lang: strengur|fylki}
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(txtOf).filter(Boolean).join('; ');
  if (typeof v === 'object') { const p = v.isl || v.eng || Object.values(v)[0]; return txtOf(p); }
  return String(v);
};
const listOf = (v) => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(txtOf).filter(Boolean);
  if (typeof v === 'object') { const p = v.isl || v.eng || Object.values(v)[0]; return listOf(p); }
  return [String(v)];
};

async function tedAwards() {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const r = await fetch('https://api.ted.europa.eu/v3/notices/search', {
        method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'place-of-performance IN (ISL) AND notice-type IN (can-standard) SORT BY publication-date DESC',
          fields: ['publication-number', 'notice-title', 'publication-date', 'buyer-name', 'winner-name', 'total-value', 'total-value-cur'],
          limit: 100, page,
        }),
      });
      if (!r.ok) { console.log('  TED bls.', page, 'svar', r.status); break; }
      const j = await r.json();
      for (const n of j.notices || []) {
        const winners = listOf(n['winner-name']);
        if (!winners.length) continue; // hætt við / án niðurstöðu
        const curs = listOf(n['total-value-cur']);
        const isk = curs.includes('ISK');
        const val = Array.isArray(n['total-value']) ? n['total-value'][0] : n['total-value'];
        out.push({
          nr: n['publication-number'],
          t: txtOf(n['notice-title']).slice(0, 160),
          buyer: txtOf(n['buyer-name']).slice(0, 90),
          winners,
          value: typeof val === 'number' ? Math.round(val) : null,
          cur: isk ? 'ISK' : (curs[0] || null),
          d: String(n['publication-date'] || '').slice(0, 10),
          u: 'https://ted.europa.eu/is/notice/-/detail/' + n['publication-number'],
          src: 'ted',
        });
      }
      if ((j.notices || []).length < 100) break;
    } catch (e) { console.log('  TED villa:', String(e).slice(0, 70)); break; }
  }
  return out;
}

// Landsvirkjun: „Orkuvirki ehf: ISK 224.090.440“ línur úr opnunarfundargerðum
async function lvOpnanir() {
  try {
    const html = await (await fetch('https://www.landsvirkjun.is/utbod', { headers: UA })).text();
    const i = html.indexOf('__NEXT_DATA__');
    if (i < 0) return [];
    const j = JSON.parse(html.slice(i).match(new RegExp('>({[\\s\\S]*?})</script>'))[1]);
    const rich = (v) => (Array.isArray(v) ? v.map((x) => (x && x.text) || '').join('\n') : '');
    const MAN = { 'janúar': '01', 'febrúar': '02', 'mars': '03', 'apríl': '04', 'maí': '05', 'júní': '06', 'júlí': '07', 'ágúst': '08', 'september': '09', 'október': '10', 'nóvember': '11', 'desember': '12' };
    const out = [];
    for (const blk of (((j.props || {}).pageProps || {}).page || {}).body || []) {
      for (const f of blk.fields || []) {
        const txt = rich(f.accordion_text);
        if (!/opnu(ð|n)/i.test(txt)) continue;
        const bids = [];
        for (const m of txt.matchAll(/^([^\n:]{3,70}?):\s*ISK\s*([\d.]{6,})/gm)) {
          const isk = +m[2].split('.').join('');
          if (isk > 100000) bids.push({ n: m[1].trim(), isk });
        }
        if (!bids.length) continue;
        bids.sort((a, b) => a.isk - b.isk);
        const dm = txt.match(new RegExp('(\\d{1,2})\\.\\s*(' + Object.keys(MAN).join('|') + ')\\s*(\\d{4})'));
        out.push({
          t: rich(f.accordion_title).slice(0, 140),
          d: dm ? `${dm[3]}-${MAN[dm[2]]}-${String(+dm[1]).padStart(2, '0')}` : null,
          bids, laegst: bids[0],
          u: 'https://www.landsvirkjun.is/utbod', src: 'lv',
        });
      }
    }
    return out;
  } catch (e) { console.log('  Landsvirkjun villa:', String(e).slice(0, 70)); return []; }
}

async function main() {
  const [awards, opnanir] = await Promise.all([tedAwards(), lvOpnanir()]);
  // byWinner: samantekt á sigurvegurum (normaliserað nafn → fjöldi + ISK-summa)
  const norm = (s) => String(s).toLowerCase().replace(/\b(ehf|hf|ohf|slf|sf)\.?\b/g, '').replace(/[^a-za-ö0-9]+/gi, ' ').trim();
  const byWinner = {};
  for (const a of awards) {
    for (const w of a.winners) {
      const k = norm(w);
      if (!k) continue;
      byWinner[k] = byWinner[k] || { nafn: w, n: 0, isk: 0 };
      byWinner[k].n++;
      if (a.cur === 'ISK' && a.value) byWinner[k].isk += Math.round(a.value / a.winners.length);
    }
  }
  // SAMTENGINGIN: sigurvegarar ↔ opnirreikningar (birgjar.json, 12 mán).
  // Aðeins nákvæm norm-nafnasamsvörun (ehf/hf/. strípað) — engin ágiskun.
  try {
    const bir = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gogn', 'birgjar.json'), 'utf8'));
    const payMap = {};
    (bir.vendors || []).forEach((v) => { payMap[norm(v.n)] = v.t; });
    let matched = 0;
    for (const [k, w] of Object.entries(byWinner)) {
      if (payMap[k] != null) { w.greidslur12m = payMap[k]; matched++; }
    }
    console.log('  Join v. opnirreikninga: ' + matched + ' af ' + Object.keys(byWinner).length + ' sigurvegurum með greiðslusögu (top-200 birgjar).');
  } catch (e) { console.log('  birgjar.json join sleppt:', String(e).slice(0, 50)); }

  const out = { updated: new Date().toISOString(), nAwards: awards.length, nOpnanir: opnanir.length, awards, opnanir, byWinner };
  const payload = JSON.stringify(out);
  fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'utbod_urslit.json'), payload);
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'utbod_urslit.json'), payload);
  console.log('Skrifað: utbod_urslit.json ·', awards.length, 'awards (ISK:', awards.filter((a) => a.cur === 'ISK').length + ') ·', opnanir.length, 'opnanir ·', Object.keys(byWinner).length, 'sigurvegarar ·', Math.round(payload.length / 1024), 'KB');
}
main().catch((e) => { console.error(e); process.exit(1); });
