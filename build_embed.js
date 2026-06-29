// Builds a wpautop-proof embed: minifies JS to a single line (no newlines that
// WordPress wpautop could turn into <br>/<p> and break), collapses CSS + HTML newlines.
const fs = require('fs');
const { minify } = require('terser');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/';
// Runtime URL of the externalised data file (karp-data.txt). For production, set this to the
// URL where you upload karp-data.txt on WordPress (Media → upload the .txt → copy its URL),
// e.g. 'https://www.karp.is/wp-content/uploads/2026/06/karp-data.txt'. Defaults to a relative
// path that works for local preview (file served from this folder). Override via env KARP_DATA_URL.
const DATA_FILE_URL = process.env.KARP_DATA_URL || '/wp-content/uploads/2026/06/karp-data.txt';

(async () => {
  // 0a) Strip doc wrappers from the canonical dashboard.html → embed fragment
  //     (keep <style>…</style> + #hagvisir-app + <script>…; drop <head>/<body>/<html> tags).
  const src = fs.readFileSync(DIR + 'dashboard.html', 'utf8');
  const si = src.indexOf('<style>');
  if (si < 0) { console.error('no <style> in dashboard.html'); process.exit(1); }
  // keep a charset hint so the standalone fragment renders UTF-8 outside WordPress (inert inside WP, whose head already sets it)
  let html = '<meta charset="utf-8">' + src.slice(si).replace(/<\/head>/i, '').replace(/<body>/i, '').replace(/<\/body>/i, '').replace(/<\/html>/i, '').trim();

  // 0b) Bake the (white-on-transparent) logos as data URIs into the LOGO placeholders
  function logoURI(f) { try { return 'data:image/png;base64,' + fs.readFileSync(DIR + f).toString('base64'); } catch (e) { return ''; } }
  html = html.replace('/*LOGO_HEAD*/', logoURI('logo_header.png')).replace('/*LOGO_WORD*/', logoURI('logo_wordmark.png')).replace('/*LOGO_FISH*/', logoURI('logo_fish.png'));
  console.log('baked logos');

  // 0) Lazy data: the large static datasets are NOT inlined — they go to an external file
  //    (karp-data.txt) fetched at runtime, keeping the snippet small. Only the small datasets
  //    read synchronously at boot (NUMBEO for the cost-of-living charts in go(), + tiny meta)
  //    stay inline so live econ rendering never waits on the external fetch.
  try { const al2 = fs.readFileSync(DIR + 'gogn/althingi_meta.json', 'utf8').trim(); html = html.replace('/*ALTHINGI_META*/{}', '/*ALTHINGI_META*/' + al2); console.log('inline althingi_meta.json'); } catch (e) {}
  try { const nb = fs.readFileSync(DIR + 'gogn/numbeo.json', 'utf8').trim(); html = html.replace('/*NUMBEO*/{}', '/*NUMBEO*/' + nb); console.log('inline numbeo.json'); } catch (e) { console.log('no numbeo.json'); }

  // Collect the externalised datasets → karp-data.txt (one JSON object; keys match JS globals).
  const EXT = { THINGMENN: 'althingi.json', FRUMVORP: 'frumvorp.json', CABINET: 'cabinet.json', SEATS: 'seats.json', NEFNDIR: 'nefndir.json', DAGATAL: 'dagatal.json', SENDIRAD: 'sendirad.json', MARKADIR: 'markadir.json', SVEITAR: 'sveitarfelog.json', RVKGOV: 'sveitarstjorn_rvk.json', SVCOORDS: 'sveitarfelog_coords.json', SVPOP: 'sveitarfelog_pop.json', STOFNANIR: 'stofnanir.json', REGIONGEO: 'landshlutar.json', SVDEEP: 'sveitarstjorn_deep.json', SVFIN: 'sveitarfelog_fin.json', SVMETA: 'sveitarfelog_meta.json', SVMAL: 'sveitarfelog_mal.json', SVPROJ: 'sveitarfelog_proj.json', SVREV: 'sveitarfelog_rev.json', EDICTS: 'ivilnanir.json', SKATTAR: 'skattar.json', UTGJOLD: 'utgjold.json', LANGTIMA: 'langtima.json', NATOEXP: 'natoexp.json', JOFNUN: 'jofnun.json', SEREIGN: 'sereign.json', POLLS: 'polls.json', FASTEIGNIR: 'fasteignir.json', ORKA: 'orka.json', ATVINNULEYSI: 'atvinnuleysi.json', GLAEPIR: 'glaepir.json', RAUNVIRDI: 'raunvirdi.json', SENTIMENT: 'sentiment.json' };
  const dataObj = {};
  for (const k in EXT) { try { dataObj[k] = JSON.parse(fs.readFileSync(DIR + 'gogn/' + EXT[k], 'utf8')); } catch (e) { console.log('skip ' + EXT[k] + ' (' + e.message + ')'); } }
  const dataStr = JSON.stringify(dataObj);
  fs.writeFileSync(DIR + 'wordpress/karp-data.txt', dataStr);
  console.log('wrote karp-data.txt:', dataStr.length, 'B —', Object.keys(dataObj).join(', '));

  // Bake the runtime data URL into the placeholder (edit DATA_FILE_URL at top for production).
  // split/join → replace ALL occurrences and treat the URL literally (no regex/$ surprises).
  html = html.split('__KARP_DATA_URL__').join(DATA_FILE_URL);
  console.log('data URL:', DATA_FILE_URL);

  // 1) Minify CSS inside <style>…</style>
  html = html.replace(/<style>([\s\S]*?)<\/style>/i, function (m, css) {
    const min = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s*([{}:;,>])\s*/g, '$1')
      .replace(/\s*\n\s*/g, '')
      .trim();
    return '<style>' + min + '</style>';
  });

  // 2) Minify the main IIFE <script> (the one with our code) to a single line
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    if (m[1].indexOf('loadEcharts') > -1 || m[1].indexOf('use strict') > -1) {
      const res = await minify(m[1], { compress: true, mangle: true, format: { ascii_only: true } });
      if (res.error) { console.error('TERSER ERROR:', res.error); process.exit(1); }
      // base64-wrap so WordPress wptexturize/wpautop can't mangle &&, <, >, quotes, etc. inside the JS
      const b64 = Buffer.from(res.code, 'utf8').toString('base64');
      html = html.replace(m[0], '<script>(0,eval)(atob("' + b64 + '"))</script>');
    }
  }

  // 3) Remove all remaining newlines between/within structural HTML so wpautop has nothing to mangle
  html = html.replace(/>\s*\n\s*</g, '><').replace(/\n/g, ' ').trim();

  fs.writeFileSync(DIR + 'wordpress/karp-embed.html', html);
  console.log('OK — wpautop-proof embed bytes:', html.length, '| newlines left:', (html.match(/\n/g) || []).length);
})();
