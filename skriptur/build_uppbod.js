// Nauðungarsölur sýslumanna (LOTA 48) → uppbod.json — opinberar uppboðsauglýsingar af
// island.is GraphQL (getSyslumennAuctions, sama opna gátt og samráðsvaktin L17).
// Notað í fasteignavaktinni á /vaktir/: 🔨 „uppboð í götunni þinni".
//
// KEYRSLA: node skriptur/build_uppbod.js   (engir lyklar)

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const PUB = path.join(__dirname, '..', 'web', 'public', 'gogn');

(async () => {
  const gql = {
    operationName: 'GetSyslumennAuctions',
    variables: {},
    query: 'query GetSyslumennAuctions { getSyslumennAuctions { office location auctionType lotType lotName lotId auctionDate auctionTime petitioners respondent } }',
  };
  const r = await fetch('https://island.is/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'KARP dashboard build (karp.is)' },
    body: JSON.stringify(gql),
  });
  if (!r.ok) throw new Error('island.is GraphQL HTTP ' + r.status);
  const j = await r.json();
  const raw = (j.data && j.data.getSyslumennAuctions) || [];
  if (!raw.length) throw new Error('engin uppboð í svari — athuga query');
  // auctionDate kemur á US-sniði „M/D/YYYY," (með kommu!) → varpa í ISO
  const pad = (n) => String(n).padStart(2, '0');
  const isoD = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + pad(m[1]) + '-' + pad(m[2]) : String(s || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? String(s).slice(0, 10) : ''; };
  const rows = raw.map((x) => ({
    e: x.office || '', st: x.location || '', teg: x.auctionType || '', flokkur: x.lotType || '',
    a: (x.lotName || '').trim(), id: x.lotId || '', d: isoD(x.auctionDate), kl: x.auctionTime || '',
  })).filter((x) => x.a).sort((a, b) => a.d.localeCompare(b.d));
  const fast = rows.filter((x) => /fasteign/i.test(x.flokkur)).length;
  const out = {
    updated: new Date().toISOString(), n: rows.length, nFasteignir: fast,
    source: 'Sýslumenn — opinberar uppboðsauglýsingar (island.is)',
    sourceUrl: 'https://island.is/nauthungarsolur',
    note: 'auctionType segir stöðu (byrjun/framhald/sölu lokið). Uppboðsauglýsingar eru opinberar skv. lögum um nauðungarsölu.',
    rows,
  };
  const s = JSON.stringify(out);
  fs.writeFileSync(DIR + 'uppbod.json', s);
  fs.mkdirSync(PUB, { recursive: true });
  fs.writeFileSync(path.join(PUB, 'uppbod.json'), s);
  const teg = {};
  rows.forEach((x) => { teg[x.flokkur] = (teg[x.flokkur] || 0) + 1; });
  console.log('uppbod.json:', rows.length, 'uppboð (' + fast + ' fasteignir) |', (s.length / 1024).toFixed(1), 'KB | flokkar:', JSON.stringify(teg));
})().catch((e) => { console.error('ERR', e); process.exit(1); });
