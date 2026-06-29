// Fetches current Althingi MPs from the official open XML (CORS-enabled), computes
// party / constituency / age / seniority, and writes althingi.json for the dashboard.
const fs = require('fs');
const LTHING = 157;
const BASE = 'https://www.althingi.is/altext/xml';

function txt(s, tag) { const m = new RegExp('<' + tag + "[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + tag + '>').exec(s); return m ? m[1].trim() : null; }
function attr(s, tag, a) { const m = new RegExp('<' + tag + "[^>]*\\b" + a + "='([^']*)'").exec(s); return m ? m[1] : null; }
function age(b) { if (!b) return null; const d = new Date(b + 'T00:00:00Z'); const n = new Date('2026-06-18T00:00:00Z'); let a = n.getUTCFullYear() - d.getUTCFullYear(); const m = n.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--; return a; }
function isoDate(d) { if (!d) return null; const p = d.split('.'); return p.length === 3 ? p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0') : null; }

async function get(url) { const r = await fetch(url); return await r.text(); }
async function resolvePhoto(id) {
  const urls = [
    `https://www.althingi.is/myndir/thingmenn-cache/${id}/${id}-220.jpg`,
    `https://www.althingi.is/myndir/mynd/thingmenn/${id}/org/mynd.jpg`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.status === 200 && /image/.test(r.headers.get('content-type') || '')) {
        if ((await r.arrayBuffer()).byteLength > 2000) return u; // >2KB = real photo, not the 786b placeholder
      }
    } catch (e) {}
  }
  return null;
}

(async () => {
  const listXml = await get(`${BASE}/thingmenn/?lthing=${LTHING}`);
  const blocks = listXml.split('<þingmaður').slice(1);
  console.log('MPs listed in þing', LTHING, ':', blocks.length);
  const ids = blocks.map(b => (b.match(/^[^>]*id='(\d+)'/) || [])[1]).filter(Boolean);

  const mps = [];
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    const res = await Promise.all(batch.map(async id => {
      try {
        const ts = await get(`${BASE}/thingmenn/thingmadur/thingseta/?nr=${id}`);
        const nafn = txt(ts, 'nafn');
        const setur = ts.split('<þingseta>').slice(1).map(s => ({
          thing: +txt(s, 'þing'),
          tegund: txt(s, 'tegund') || '',
          flokkur: txt(s, 'þingflokkur'),
          kjordaemi: txt(s, 'kjördæmi'),
          saeti: txt(s, 'þingsalssæti'),
          inn: isoDate((txt(s, 'inn') || '')),
          ut: isoDate((txt(s, 'út') || ''))
        }));
        const isMP = t => t === 'þingmaður' || t === 'með varamann';
        const sitjandi = x => x.thing === LTHING && isMP(x.tegund) && !x.ut;
        const cur = setur.filter(x => x.thing === LTHING).sort((a, b) => (sitjandi(b) - sitjandi(a)))[0];
        if (!cur) return null;
        const adalmadur = setur.some(sitjandi);
        const inns = setur.map(x => x.inn).filter(Boolean).sort();
        const things = [...new Set(setur.map(x => x.thing))];
        // detail for birthdate
        const det = await get(`${BASE}/thingmenn/thingmadur/?nr=${id}`);
        return {
          id: +id, nafn,
          flokkur: cur.flokkur, kjordaemi: cur.kjordaemi,
          adalmadur,
          aldur: age(txt(det, 'fæðingardagur')),
          fyrstInn: inns[0] || null,
          fyrstaThing: Math.min(...things),
          fjoldiThinga: things.length,
          saeti: cur.saeti,
          mynd: await resolvePhoto(id)
        };
      } catch (e) { return null; }
    }));
    res.forEach(r => { if (r) mps.push(r); });
  }

  const adal = mps.filter(m => m.adalmadur);
  console.log('Current aðalmenn (sitting MPs):', adal.length);

  // party breakdown
  const byParty = {}; adal.forEach(m => byParty[m.flokkur] = (byParty[m.flokkur] || 0) + 1);
  console.log('By party:', JSON.stringify(byParty));

  // seniority leaderboards
  const bySen = adal.slice().filter(m => m.fyrstInn).sort((a, b) => a.fyrstInn.localeCompare(b.fyrstInn));
  console.log('LONGEST serving:', bySen.slice(0, 3).map(m => m.nafn + ' (' + m.fyrstInn + ')'));
  console.log('SHORTEST serving:', bySen.slice(-3).map(m => m.nafn + ' (' + m.fyrstInn + ')'));

  fs.writeFileSync('C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/althingi.json', JSON.stringify(adal, null, 0));
  console.log('Wrote althingi.json with', adal.length, 'MPs. Sample:', JSON.stringify(adal[0]));
})().catch(e => console.log('ERR', e.message));
