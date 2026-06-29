// Flytur gogn/backfill.json (eitt-skiptis Wayback-bakvistun) inn í wp_karp_news á karp.is
// gegnum POST /wp-json/karp/v1/newsimport (INSERT IGNORE — dedup á url, óhætt að keyra aftur).
// Auðkenning: hausinn 'X-Karp-Import-Key' = innflutnings-lyklaorðið (borið saman við SHA-256 í karp-frettir.php).
//
// FORSENDA: uppfærð karp-frettir.php (með karp_import_authed) verður að vera komin í loftið fyrst.
//
// KEYRSLA (PowerShell):
//   $env:KARP_IMPORT_KEY='<lykill>'; node skriptur/import_backfill.js
//   (valfrjálst) $env:KARP_WP_URL='https://karp.is'   ·   $env:KARP_IMPORT_CHUNK='500'
// Lyklaorðið er AÐEINS lesið úr umhverfisbreytu — aldrei vistað í skrá.

const fs = require('fs');
const path = require('path');
const BASE = (process.env.KARP_WP_URL || 'https://karp.is').replace(/\/+$/, '');
const KEY = process.env.KARP_IMPORT_KEY || '';
const CHUNK = Math.max(50, Math.min(1000, parseInt(process.env.KARP_IMPORT_CHUNK || '500', 10)));
const FILE = (process.argv[2] && process.argv[2][0] !== '-') ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'gogn', 'backfill.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!KEY) { console.error('Vantar KARP_IMPORT_KEY. Settu:  $env:KARP_IMPORT_KEY=\'<lykill>\'  og keyrðu aftur.'); process.exit(1); }
  if (!fs.existsSync(FILE)) { console.error('Finn ekki', FILE, '— keyrðu build_backfill.js --titles fyrst.'); process.exit(1); }
  let rows;
  try { rows = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { console.error('Get ekki lesið backfill.json:', e.message); process.exit(1); }
  if (!Array.isArray(rows) || !rows.length) { console.error('backfill.json er tóm.'); process.exit(1); }

  const url = BASE + '/wp-json/karp/v1/newsimport';
  console.log('Flyt inn', rows.length, 'greinar í', Math.ceil(rows.length / CHUNK), 'bútum →', url);
  let totAdded = 0, totRecv = 0, sent = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const clean = s => String(s || '').replace(/[­​‌‍﻿]/g, '');
    const chunk = rows.slice(i, i + CHUNK).map(r => ({ ts: r.ts, source: r.source, title: clean(r.title), url: r.url, body: clean((r.desc && r.desc.length > 2) ? (r.title + ' ' + r.desc) : r.title) }));
    let ok = false, lastErr = '';
    for (let a = 0; a < 4 && !ok; a++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Karp-Import-Key': KEY },
          body: JSON.stringify({ items: chunk })
        });
        const txt = await resp.text();
        if (resp.status === 401 || resp.status === 403) { console.error('\nHEIMILD HAFNAÐ (', resp.status, ') — er uppfærð karp-frettir.php komin í loftið og lykillinn réttur?\n', txt.slice(0, 300)); process.exit(2); }
        if (!resp.ok) { lastErr = 'HTTP ' + resp.status + ' ' + txt.slice(0, 160); await sleep(1500 * (a + 1)); continue; }
        let d; try { d = JSON.parse(txt); } catch (e) { lastErr = 'svar ekki JSON: ' + txt.slice(0, 160); await sleep(1500 * (a + 1)); continue; }
        totAdded += (d.added || 0); totRecv += (d.received || 0); ok = true;
      } catch (e) { lastErr = e.message; await sleep(1500 * (a + 1)); }
    }
    if (!ok) { console.error('\nBútur', (i / CHUNK + 1), 'mistókst eftir 4 tilraunir:', lastErr); process.exit(3); }
    sent += chunk.length;
    process.stdout.write('\r  ' + sent + '/' + rows.length + ' send · ' + totAdded + ' ný vistuð…');
    await sleep(150);
  }
  console.log('\nLokið. Sent:', totRecv, '· nýjar vistaðar (ekki til áður):', totAdded, '· til staðar áður:', (totRecv - totAdded));
  console.log('Athugaðu:', BASE + '/wp-json/karp/v1/newsstatus');
})().catch(e => { console.error('ERR', e); process.exit(1); });
