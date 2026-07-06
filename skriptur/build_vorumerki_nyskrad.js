// build_vorumerki_nyskrad.js (LOTA 91) — nýskráð vörumerki sl. 35 daga, LYKLAÐ Á ownerSsn (kt),
// fyrir tilkynninga-vaktina: karp-digest.php les gogn/vorumerki_nyskrad.json og samkeyrir við
// firmavaktar-félög notenda → „ný vörumerki hjá félögum á vaktinni" í vikupóstinn.
// Aðalleit Hugverkastofu m/ registrationDateFrom (gazette /v1 skilar 404). Sjá memory/iceland-hugverkastofa-api.md
// KEYRSLA: node skriptur/build_vorumerki_nyskrad.js
const fs = require('fs');
const path = require('path');
const OUT = [path.join(__dirname, '..', 'gogn'), path.join(__dirname, '..', 'web', 'public', 'gogn')];
const API = 'https://api.hugverk.is/umbraco/api/search/searchtrademarks';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const d = new Date(); d.setDate(d.getDate() - 35);
  const from = d.toISOString().slice(0, 10);
  const byKt = {};
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    let j;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ textfield: '', owner: [], agent: [], type: [], status: [], category: [], registrationDateFrom: from, page }) });
      if (!r.ok) break;
      j = await r.json();
    } catch (e) { break; }
    if (page === 1) total = j.totalCount || 0;
    const res = j.results || [];
    for (const it of res) {
      const x = it.document || {};
      const kt = String(((x.owner || [])[0] || {}).ownerSsn || '').replace(/\D/g, '');
      if (kt.length !== 10) continue;                       // aðeins merki m/ kt (matchanleg við firmavakt)
      (byKt[kt] = byKt[kt] || []).push({
        id: x.identifier, titill: x.titleUnchanged || x.title || '', tegund: x.type || '',
        skrad: (x.registrationDate || '').slice(0, 10), flokkar: (x.category || []).slice(0, 6),
        eigandi: ((x.owner || [])[0] || {}).ownerName || '',
      });
    }
    if (res.length < 50) break;
    await sleep(400);
  }
  for (const kt in byKt) byKt[kt].sort((a, b) => (b.skrad || '').localeCompare(a.skrad || ''));
  const out = { updated: new Date().toISOString(), from, total, companies: Object.keys(byKt).length, byKt };
  const s = JSON.stringify(out);
  OUT.forEach((dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'vorumerki_nyskrad.json'), s); });
  console.log(`vorumerki_nyskrad.json — ${total} nýskráð alls, ${Object.keys(byKt).length} félög m/ kt, frá ${from}`);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
