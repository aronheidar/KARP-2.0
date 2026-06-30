// build_app.js — builds a standalone, self-injecting karp-app.js for CDN hosting
// (Cloudflare Pages / Netlify / Vercel). The WordPress page then loads ONE stable line set:
//
//     <div id="karp-app"></div>
//     <script src="https://<your-pages-domain>/karp-app.js" defer></script>
//
// Served as a real .js file (NOT through WordPress wpautop), so the base64/eval hack that
// build_embed.js needs is unnecessary here — this is plain minified JS.
//
// Cross-platform paths (works locally on Windows AND on Cloudflare's Linux build runner).
// Data URL: defaults to the WordPress upload URL (same-origin when the script runs on karp.is →
// no CORS). Override for local preview with KARP_DATA_URL=/wordpress/karp-data.txt.
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const ROOT = __dirname;
const p = (...a) => path.join(ROOT, ...a);
const DATA_FILE_URL = process.env.KARP_DATA_URL || 'https://git-repository-hagvisir.aronheidars.workers.dev/karp-data.txt';

(async () => {
  const src = fs.readFileSync(p('dashboard.html'), 'utf8');
  const si = src.indexOf('<style>');
  if (si < 0) { console.error('no <style> in dashboard.html'); process.exit(1); }
  let html = src.slice(si);

  // Bake the logos into the CSS placeholders (data URIs)
  const logoURI = f => { try { return 'data:image/png;base64,' + fs.readFileSync(p(f)).toString('base64'); } catch (e) { return ''; } };
  html = html.replace('/*LOGO_HEAD*/', logoURI('logo_header.png')).replace('/*LOGO_WORD*/', logoURI('logo_wordmark.png')).replace('/*LOGO_FISH*/', logoURI('logo_fish.png'));

  // Inline the small datasets read synchronously at boot
  try { html = html.replace('/*ALTHINGI_META*/{}', '/*ALTHINGI_META*/' + fs.readFileSync(p('gogn', 'althingi_meta.json'), 'utf8').trim()); } catch (e) {}
  try { html = html.replace('/*NUMBEO*/{}', '/*NUMBEO*/' + fs.readFileSync(p('gogn', 'numbeo.json'), 'utf8').trim()); } catch (e) {}

  // Build the externalised data file (same key set as build_embed.js)
  const EXT = { THINGMENN: 'althingi.json', FRUMVORP: 'frumvorp.json', CABINET: 'cabinet.json', SEATS: 'seats.json', NEFNDIR: 'nefndir.json', DAGATAL: 'dagatal.json', SENDIRAD: 'sendirad.json', MARKADIR: 'markadir.json', SVEITAR: 'sveitarfelog.json', RVKGOV: 'sveitarstjorn_rvk.json', SVCOORDS: 'sveitarfelog_coords.json', SVPOP: 'sveitarfelog_pop.json', STOFNANIR: 'stofnanir.json', REGIONGEO: 'landshlutar.json', SVDEEP: 'sveitarstjorn_deep.json', SVFIN: 'sveitarfelog_fin.json', SVMETA: 'sveitarfelog_meta.json', SVMAL: 'sveitarfelog_mal.json', SVPROJ: 'sveitarfelog_proj.json', SVREV: 'sveitarfelog_rev.json', EDICTS: 'ivilnanir.json', SKATTAR: 'skattar.json', UTGJOLD: 'utgjold.json', LANGTIMA: 'langtima.json', NATOEXP: 'natoexp.json', JOFNUN: 'jofnun.json', SEREIGN: 'sereign.json', POLLS: 'polls.json', FASTEIGNIR: 'fasteignir.json', ORKA: 'orka.json', ATVINNULEYSI: 'atvinnuleysi.json', GLAEPIR: 'glaepir.json', RAUNVIRDI: 'raunvirdi.json', SENTIMENT: 'sentiment.json' };
  const dataObj = {};
  for (const k in EXT) { try { dataObj[k] = JSON.parse(fs.readFileSync(p('gogn', EXT[k]), 'utf8')); } catch (e) { console.log('skip ' + EXT[k] + ' (' + e.message + ')'); } }
  const dataStr = JSON.stringify(dataObj);
  fs.mkdirSync(p('dist'), { recursive: true });
  fs.writeFileSync(p('dist', 'karp-data.txt'), dataStr);              // CDN copy (optional use)
  try { fs.writeFileSync(p('wordpress', 'karp-data.txt'), dataStr); } catch (e) {} // WP upload copy
  console.log('data:', dataStr.length, 'B —', Object.keys(dataObj).length, 'datasets');

  // Bake the runtime data URL
  html = html.split('__KARP_DATA_URL__').join(DATA_FILE_URL);

  // Split dashboard.html fragment into CSS / app-HTML / scripts
  const sm = html.match(/<style>([\s\S]*?)<\/style>/i);
  const css = sm[1];
  const rest = html.slice(sm.index + sm[0].length);
  const fi = rest.indexOf('<script>');
  if (fi < 0) { console.error('no <script> after </style>'); process.exit(1); }
  const appHtml = rest.slice(0, fi).trim();
  const scripts = [...rest.slice(fi).matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n;\n');

  // Minify CSS + JS
  const cssMin = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/\s*\n\s*/g, '').trim();
  const res = await minify(scripts, { compress: true, mangle: true });
  if (res.error) { console.error('TERSER ERROR:', res.error); process.exit(1); }

  // Self-injecting wrapper: inject CSS → ensure mount → inject HTML → run app
  const out = '/* karp-app.js — generated from dashboard.html by build_app.js. Do not edit by hand. */\n'
    + '(function(){'
    + 'var C=' + JSON.stringify(cssMin) + ',H=' + JSON.stringify(appHtml) + ';'
    + 'try{var s=document.createElement("style");s.textContent=C;(document.head||document.documentElement).appendChild(s);}catch(e){}'
    + 'var m=document.getElementById("karp-app");if(!m){m=document.createElement("div");m.id="karp-app";(document.body||document.documentElement).appendChild(m);}'
    + 'm.innerHTML=H;'
    + res.code
    + '})();';
  fs.writeFileSync(p('dist', 'karp-app.js'), out);

  // Cloudflare Pages headers: CORS + short cache so deploys propagate quickly
  fs.writeFileSync(p('dist', '_headers'), '/karp-app.js\n  Cache-Control: public, max-age=600\n  Access-Control-Allow-Origin: *\n/karp-data.txt\n  Cache-Control: public, max-age=600\n  Access-Control-Allow-Origin: *\n');

  console.log('OK — dist/karp-app.js:', out.length, 'B | data URL:', DATA_FILE_URL);
})();
