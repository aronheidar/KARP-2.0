// ─────────────────────────────────────────────────────────────
// build_sveitarstjorar.js — bæjar-/sveitar-/borgarstjórar + bæjarstjórnir
// allra 61 sveitarfélaga af vef Sambands íslenskra sveitarfélaga (LOTA 17).
// Svæðissíðurnar 8 bera Prismic-gögn hvers sveitarfélags í __NEXT_DATA__:
// title, number (sveitarfélagsnúmer), council_heads ({title,name} m. stjóra),
// council_members (m. flokksstaf!), website, kennitala, address.
// Úttak: gogn/sveitarstjorar.json — parað við nafn í gogn/sveitarfelog.json.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const REGIONS = ['hofudborgarsvaedid', 'sudurnes', 'vesturland', 'vestfirdir', 'nordurland-vestra', 'nordurland-eystra', 'austurland', 'sudurland'];
const UA = { 'User-Agent': 'KARP build (karp.is; aronheidars@gmail.com)' };

// Samræming nafna: samband.is „Reykjavík" vs okkar „Reykjavíkurborg" o.s.frv.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-záðéíóúýþæö]/g, '');
const ALIAS = { reykjavik: 'reykjavikurborg' };

async function region(slug) {
  const t = await (await fetch('https://www.samband.is/sveitarfelog/' + slug, { headers: UA })).text();
  const i = t.indexOf('__NEXT_DATA__');
  if (i < 0) { console.log('  ! ekkert __NEXT_DATA__ á', slug); return []; }
  const m = t.slice(i).match(/>({[\s\S]*?})<\/script>/);
  if (!m) return [];
  const j = JSON.parse(m[1]);
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.number !== undefined && o.council_members) { out.push(o); return; }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(j.props);
  return out.map((o) => {
    const heads = Array.isArray(o.council_heads) ? o.council_heads : [];
    const st = heads.find((x) => /(bæjar|sveitar|borgar)stjóri/i.test(x.title || '')) || null;
    const clean = (s) => { const v = String(s || '').trim(); return v && v !== '.' ? v : ''; };
    const members = (Array.isArray(o.council_members) ? o.council_members : [])
      .map((x) => ({ n: clean(x.council_member), f: clean(x.party) })).filter((x) => x.n);
    return {
      nafn: clean(o.title), num: clean(o.number), region: slug,
      stjori: st ? clean(st.name) : '', stjoriTitill: st ? clean(st.title).replace(/:$/, '') : '',
      vefur: o.website && o.website.url ? o.website.url : '',
      kt: clean(o.kennitala).replace(/^Kt\.\s*/i, ''),
      radhus: clean(o.address),
      stjornHeiti: clean(o.council_title) || 'Sveitarstjórn',
      fulltruar: members,
    };
  }).filter((x) => x.nafn);
}

async function main() {
  const all = [];
  for (const r of REGIONS) {
    const ms = await region(r);
    console.log(' ', r, '→', ms.length, 'sveitarfélög');
    all.push(...ms);
  }
  console.log('Samtals af samband.is:', all.length);

  // Pörun við okkar 61
  const ours = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gogn', 'sveitarfelog.json'), 'utf8'));
  const ourNames = (Array.isArray(ours) ? ours : Object.values(ours)).map((x) => x.nafn).filter(Boolean);
  const bySamband = {};
  for (const m of all) bySamband[ALIAS[norm(m.nafn)] || norm(m.nafn)] = m;
  const byName = {}; let hit = 0; const miss = [];
  for (const n of ourNames) {
    const k = norm(n);
    let f = bySamband[k];
    if (!f) { // forskeytis-leit: „Húnaþing vestra" o.þ.h. með ólíkum viðskeytum
      const cand = Object.keys(bySamband).filter((s) => s.startsWith(k.slice(0, 8)) || k.startsWith(s.slice(0, 8)));
      if (cand.length === 1) f = bySamband[cand[0]];
    }
    if (f) { byName[n] = f; hit++; } else miss.push(n);
  }
  console.log('Pöruð:', hit, 'af', ourNames.length, miss.length ? '· ÓPÖRUÐ: ' + miss.join(', ') : '');

  const out = { updated: new Date().toISOString().slice(0, 10), source: 'samband.is/sveitarfelog (Samband íslenskra sveitarfélaga)', byName };
  fs.writeFileSync(path.join(__dirname, '..', 'gogn', 'sveitarstjorar.json'), JSON.stringify(out));
  console.log('Skrifað: gogn/sveitarstjorar.json ·', Object.keys(byName).length, 'sveitarfélög með stjóra:', Object.values(byName).filter((x) => x.stjori).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
