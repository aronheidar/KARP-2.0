// Fylgi flokka — parses the aggregated opinion-poll table from Wikipedia
// ("Next Icelandic parliamentary election", CC BY-SA) → gogn/polls.json (baked).
// Multi-pollster (Gallup, Maskína, Prósent, …). Party codes match the dashboard (S,C,F,D,M,B,J,P,V).
//
// KEYRSLA: node skriptur/build_polls.js   → svo: node build_embed.js
// Heimild birt í mælaborðinu (Wikipedia + listed pollsters), CC BY-SA.

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const PAGE = 'Next_Icelandic_parliamentary_election';
const URL = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + PAGE + '&format=json&prop=wikitext&origin=*';
// column order in the table after pollster/date/sample/response-rate:
const PARTIES = ['S', 'C', 'F', 'D', 'M', 'B', 'J', 'P', 'V'];
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function num(cell) {
  if (cell == null) return null;
  let t = String(cell);
  // Cells are "<pct>" or styled "...| '''<pct>'''" optionally followed by a seat
  // template "<br/>{{font|...|text=<seats>}}". The PERCENTAGE is the leading number;
  // cut everything from the first <br or {{ so we never read the seat count.
  t = t.split(/<br|\{\{/)[0];
  if (t.indexOf('|') > -1) t = t.split('|').pop();           // styled cell → content after last pipe
  t = t.replace(/'''/g, '').replace(/,/g, '').replace(/<[^>]*>/g, '').trim(); // strip bold, thousands-comma, tags
  if (/^[–\-—]+$/.test(t) || t === '' || /^\?/.test(t)) return null;          // not polled / blank
  const m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function pollster(cell) {
  let t = String(cell || '');
  t = t.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1'); // [[a|b]]→b, [[a]]→a
  t = t.replace(/\[\S+\s+([^\]]*)\]/g, '$1');                                          // [url label]→label
  t = t.replace(/[\[\]]/g, '').replace(/'''/g, '').replace(/<[^>]*>/g, '');
  t = t.replace(/style\s*=\s*"[^"]*"/g, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

function parseDate(s, fallbackYear) {
  s = String(s || '').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, ' ');
  // Ártalið verður að koma úr ENDA bilsins eins og dagur og mánuður — „29 Dec 2025 – 5 Jan 2026“
  // á heima í janúar 2026, ekki 2025.
  const arAll = s.match(/\b(20\d\d)\b/g) || [];
  const yr = arAll.length ? arAll[arAll.length - 1] : fallbackYear;
  // ⚠ 12.9.2026: hér stóð \b(Jan|…|Dec)\b. Orðamörkin í lokin fella út FULLT mánaðarheiti:
  // „June“ passar ekki við \bJun\b því á eftir kemur „e“. Wikipedia-taflan blandar saman
  // „2–11 Jun 2026“ og „1–30 June 2026“, svo allar raðir með fullu heiti duttu út í þögn —
  // nýjasta Gallup-könnunin (n=12.102) vantaði þannig mánuðum saman.
  // Bilið getur spannað mánaðamót („30 Apr – 31 May 2026“). Dagurinn er tekinn úr SÍÐUSTU tölu,
  // svo mánuðurinn verður að koma úr SÍÐASTA mánaðarheiti — annars parast 31 við Apr og úr verður
  // 2026-04-31, dagsetning sem er ekki til. Sú villa sat í polls.json á Gallup-könnun með 12.979 svarendum.
  const moAll = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/g) || [];
  const moName = moAll.length ? moAll[moAll.length - 1].slice(0, 3) : null;
  const mo = moName ? MON[moName] : null;
  // end day = last 1-2 digit number that is not the year (handles "2–31 Mar 2026")
  const nums = (s.replace(/\b20\d\d\b/g, '').match(/\b\d{1,2}\b/g) || []).map(Number).filter(n => n >= 1 && n <= 31);
  let day = nums.length ? nums[nums.length - 1] : 15;
  if (!yr || !mo) return null;
  // Verja gegn ógildum degi (t.d. 31 í 30-daga mánuði ef heimildin er á skjön).
  const síðastiDagur = new Date(Date.UTC(+yr, mo, 0)).getUTCDate();
  if (day > síðastiDagur) day = síðastiDagur;
  return yr + '-' + String(mo).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

const main = async () => {
  const r = await fetch(URL, { headers: { 'User-Agent': 'KARP dashboard build (karp.is)' } });
  const j = await r.json();
  const wt = j.parse.wikitext['*'];
  let sec = wt.slice(wt.search(/==\s*Opinion polls/i));
  sec = sec.slice(0, sec.indexOf('|}'));
  const blocks = sec.split('|-').slice(1); // drop the header chunk before the first row sep

  const polls = [];
  const slepptar = [];   // raðir sem dagsetningarþáttun réð ekki við
  let election = null;
  blocks.forEach(b => {
    const cells = b.split(/\n\s*\|/).map(c => c.replace(/^\s*\|/, '').trim());
    // drop leading empty/style-only cells until we reach the pollster
    while (cells.length && (cells[0] === '' || /^\s*$/.test(cells[0]) || /^(rowspan|colspan|style|class|scope)/i.test(cells[0]))) cells.shift();
    if (cells.length < 13) return;
    const who = pollster(cells[0]);
    const dateRaw = cells[1];
    const isElection = /election/i.test(who) || /election/i.test(dateRaw);
    const vals = {};
    PARTIES.forEach((p, k) => { vals[p] = num(cells[4 + k]); });
    const got = PARTIES.filter(p => vals[p] != null).length;
    if (got < 3) return; // not a real poll row
    if (isElection) {
      election = { date: parseDate(dateRaw, '2024') || '2024-11-30', v: vals };
    } else {
      const date = parseDate(dateRaw);
      // Þögul brottfelling faldi mánaðarheitis-villuna að ofan. Nú er talið og sagt frá.
      if (!date) { slepptar.push(who + ' / ' + String(dateRaw).slice(0, 40)); return; }
      polls.push({ date: date, pollster: who, sample: num(cells[2]) || null, v: vals });
    }
  });

  polls.sort((a, b) => a.date < b.date ? -1 : 1); // ascending for time series
  const out = {
    source: 'Wikipedia — Next Icelandic parliamentary election',
    sourceUrl: 'https://en.wikipedia.org/wiki/' + PAGE,
    license: 'CC BY-SA 4.0',
    parties: PARTIES,
    polls: polls,
    election2024: election
  };
  fs.writeFileSync(DIR + 'polls.json', JSON.stringify(out));
  // public-afrit (LOTA 51): Spyrðu-Karp-RAG sækir kannanirnar á keyrslutíma
  const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(path.join(PUB, 'polls.json'), JSON.stringify(out));
  console.log('WROTE polls.json | kannanir:', polls.length, '| election baseline:', !!election, '| bytes:', fs.statSync(DIR + 'polls.json').size);
  console.log('pollsters:', JSON.stringify([...new Set(polls.map(p => p.pollster))]));
  console.log('date range:', polls.length ? polls[0].date + ' → ' + polls[polls.length - 1].date : '—');
  console.log('latest:', JSON.stringify(polls[polls.length - 1]));
  if (election) console.log('2024 election:', JSON.stringify(election));
  if (slepptar.length) console.warn('⚠ ' + slepptar.length + ' raðir án lesanlegrar dagsetningar:', JSON.stringify(slepptar));
};

// Keyrt beint => byggja. Flutt inn (próf) => aðeins föllin, ENGIN netköll.
if (require.main === module) main().catch((e) => { console.error('ERR', e); process.exit(1); });
module.exports = { parseDate, pollster, num };
