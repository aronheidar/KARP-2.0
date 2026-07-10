// build_sveitarfelog_geo.js — sveitarfélaga-fjölhyrningar (choropleth-grunnur).
// -------------------------------------------------------------------------
// Sækir geoBoundaries ADM2 (opið, CC-BY 4.0) og lagar það að íslenskum
// sveitarfélaga-nöfnum eins og þau birtast í gögnunum okkar (fasteignir/atvinnuleysi):
//   • ADM2-settið er FRÁ 2018 (74 einingar) → sameinar for-sameinuð sveitarfélög
//     undir núverandi nafni (Múlaþing, Suðurnesjabær, Húnabyggð, Stykkishólmur,
//     Skagafjörður) svo öll fjölhyrningabútarnir fá sama gildi/lit.
//   • Lagar nafnabrigði (Hafnarfjarðarbær→…kaupstaður, Akureyrarkaupstaður→…bær,
//     styttar "…fjörðu" → "…fjörður").
//   • Rúnnar hnit í 4 aukastafi (~11 m) → skrárstærð niður.
// Úttak: web/public/gogn/sveitarfelog_adm2.json  ({type:FeatureCollection,
//        features:[{type,properties:{name},geometry}]}).
// Keyrsla: node skriptur/build_sveitarfelog_geo.js   (þarf net; node 18+ fyrir fetch).
// Boundaries breytast sjaldan (sameiningar á nokkurra ára fresti) → keyrist eftir þörf.
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'sveitarfelog_adm2.json');
const API = 'https://www.geoboundaries.org/api/current/gbOpen/ISL/ADM2/';
// Fastur commit-hlekkur til vara ef API svarar ekki (LFS-leyst gegnum github.com/.../raw/<sha>/).
const FALLBACK = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/ISL/ADM2/geoBoundaries-ISL-ADM2_simplified.geojson';

// ADM2 shapeName → núverandi (kanónískt) sveitarfélaga-nafn. Nöfn sem vantar hér
// halda sínu shapeName. Mörg gömul nöfn → sama nýja nafn = sameining.
const RELABEL = {
  // Sameiningar (margir bútar → eitt nafn)
  'Fljótsdalshérað': 'Múlaþing', 'Seyðisfjarðarkaupstaður': 'Múlaþing',
  'Djúpavogshreppur': 'Múlaþing', 'Borgarfjarðarhreppur': 'Múlaþing',
  'Sveitarfélagið Garður': 'Suðurnesjabær', 'Sandgerðisbær': 'Suðurnesjabær',
  'Blönduósbær': 'Húnabyggð', 'Húnavatnshreppur': 'Húnabyggð',
  'Stykkishólmsbær': 'Sveitarfélagið Stykkishólmur', 'Helgafellssveit': 'Sveitarfélagið Stykkishólmur',
  'Sveitarfélagið Skagafjörðu': 'Skagafjörður', 'Akrahreppur': 'Skagafjörður',
  // Nafnabrigði / styttingar
  'Hafnarfjarðarbær': 'Hafnarfjarðarkaupstaður',
  'Akureyrarkaupstaður': 'Akureyrarbær',
  'Sveitarfélagið Hornafjörðu': 'Sveitarfélagið Hornafjörður',
};

const round4 = (n) => Math.round(n * 1e4) / 1e4;
function roundCoords(c) {
  if (typeof c[0] === 'number') return [round4(c[0]), round4(c[1])];
  return c.map(roundCoords);
}

async function fetchGeo() {
  try {
    const meta = await (await fetch(API)).json();
    const url = meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL;
    if (url) {
      const txt = await (await fetch(url)).text();
      if (!txt.startsWith('version https://git-lfs')) return JSON.parse(txt);
    }
  } catch (e) { console.warn('API-leið brást:', e.message); }
  console.warn('Nota fasta commit-hlekkinn.');
  return JSON.parse(await (await fetch(FALLBACK)).text());
}

(async () => {
  const g = await fetchGeo();
  const src = g.features || [];
  const out = src.map((f) => {
    const raw = f.properties && f.properties.shapeName;
    const name = RELABEL[raw] || raw;
    return { type: 'Feature', properties: { name }, geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) } };
  });
  const fc = { type: 'FeatureCollection', properties: { source: 'geoBoundaries ADM2 (gbOpen, CC-BY 4.0)', note: 'For-sameinuð sveitarfélög endurmerkt á núverandi nafn.' }, features: out };
  fs.writeFileSync(OUT, JSON.stringify(fc));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  const names = new Set(out.map((f) => f.properties.name));
  console.log(`✔ ${OUT}  (${out.length} bútar → ${names.size} nöfn, ${kb} KB)`);

  // Sannprófun: mátun við gögnin.
  const gg = path.join(__dirname, '..', 'web', 'public', 'gogn');
  const norm = (s) => String(s).toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const nset = new Set([...names].map(norm));
  for (const [file, key] of [['fasteignir.json', 'byMuni'], ['atvinnuleysi.json', 'byMuni']]) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(gg, file), 'utf8'));
      const munis = Object.keys(data[key] || {});
      const miss = munis.filter((m) => !nset.has(norm(m)));
      console.log(`  ${file}.${key}: ${munis.length - miss.length}/${munis.length} mátast` + (miss.length ? ` — vantar: ${JSON.stringify(miss)}` : ' ✓'));
    } catch (e) { console.log(`  ${file}: ${e.message}`); }
  }
})();
