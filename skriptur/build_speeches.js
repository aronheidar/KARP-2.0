// Phase 2b: speaking time. Fetches the þing-157 speech list (~15MB), sums debate
// speaking seconds per MP (excludes Speaker/President chairing), merges into althingi.json.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const mps = JSON.parse(fs.readFileSync(DIR + 'althingi.json', 'utf8'));
const ids = new Set(mps.map(m => m.id));

(async () => {
  const x = await (await fetch('https://www.althingi.is/altext/xml/raedulisti/?lthing=157')).text();
  const secs = {}, cnt = {};
  const blocks = x.split('<ræða>').slice(1);
  console.log('speech entries:', blocks.length);
  blocks.forEach(b => {
    if (/<forsetiAlþingis>|<forsetiÍslands>/.test(b)) return; // skip chairing / ceremonial
    const id = +(b.match(/<ræðumaður id='(\d+)'/) || [])[1];
    if (!ids.has(id)) return;
    const s = (b.match(/<ræðahófst>([^<]+)<\/ræðahófst>/) || [])[1];
    const e = (b.match(/<ræðulauk>([^<]+)<\/ræðulauk>/) || [])[1];
    if (!s || !e) return;
    const d = (new Date(e) - new Date(s)) / 1000;
    if (d > 0 && d < 36000) { secs[id] = (secs[id] || 0) + d; cnt[id] = (cnt[id] || 0) + 1; }
  });
  mps.forEach(m => { m.raedumin = secs[m.id] ? Math.round(secs[m.id] / 60) : 0; m.raedur = cnt[m.id] || 0; });
  fs.writeFileSync(DIR + 'althingi.json', JSON.stringify(mps, null, 0));

  const wr = mps.filter(m => m.raedur > 0);
  console.log('talar LENGST:', wr.slice().sort((a, b) => b.raedumin - a.raedumin).slice(0, 5).map(m => m.nafn + ' ' + m.raedumin + ' mín / ' + m.raedur + ' ræður'));
  console.log('talar STYST:', wr.slice().sort((a, b) => a.raedumin - b.raedumin).slice(0, 5).map(m => m.nafn + ' ' + m.raedumin + ' mín'));
  console.log('MPs með 0 ræður:', mps.filter(m => m.raedur === 0).map(m => m.nafn).join(', ') || 'engir');
})().catch(e => console.log('ERR', e.message));
