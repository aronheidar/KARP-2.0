// build_ragcopy.js (LOTA 61) — afritar gagnaskrár sem Spyrðu-Karp-RAG-inn (worker) þarf úr
// gogn/ í web/public/gogn/. Workerinn les AÐEINS úr ASSETS (web/public/gogn), svo hvert
// gagnasett sem á að vera svaranlegt VERÐUR að vera hér. Keyrt síðast í refresh-data.yml.
//
// KEYRSLA: node skriptur/build_ragcopy.js

const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'gogn');
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');

// Hvítlisti: skrár sem AUG-kortið í worker.js vísar í (og eru ekki þegar dual-write).
const FILES = [
  'sveitarstjorar.json', 'cabinet.json', 'althingi.json', 'althingi_meta.json',
  'frumvorp.json', 'atvinnuleysi.json', 'orka.json', 'glaepir.json', 'leiga.json',
  'markadir.json', 'ivilnanir.json', 'skattar.json', 'utgjold.json', 'nefndir.json',
  'sendirad.json', 'numbeo.json', 'sedlabanki.json',
  'styrkir.json',   // LOTA 92: opinberar styrkveitingar (nafn→úthlutun; /api/styrkir + #fs-styrkir)
  'logbirting.json',// LOTA 95: Lögbirtingablaðið (kt→lögform. tilkynningar; /api/logbirting + #fs-logbirting)
];

fs.mkdirSync(PUB, { recursive: true });
let ok = 0, skip = 0;
for (const f of FILES) {
  const src = path.join(G, f);
  if (!fs.existsSync(src)) { console.log('  – vantar:', f); skip++; continue; }
  fs.copyFileSync(src, path.join(PUB, f));
  ok++;
}
console.log('RAG-afrit: ' + ok + ' skrár í web/public/gogn/' + (skip ? ' (' + skip + ' vantaði)' : ''));
