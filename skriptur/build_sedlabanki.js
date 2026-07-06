// Seðlabanki Íslands — vextir, gengi, verðbólga & peningamál → gogn/sedlabanki.json
//
// KEYRSLA: node skriptur/build_sedlabanki.js   (svo build_ragcopy.js + endurbygging)
//
// OPINN, óauðkenndur XML-tímaraðaþjónn (arfleifð frá gamla vefnum en ENN lifandi og
// er uppspretta Gagnatorgs — sjá /gagnatorg/xml-gogn/). Einfaldur GET, ekkert token/cookie:
//   https://www.sedlabanki.is/xmltimeseries/Default.aspx?TimeSeriesID=<id>&Type=xml&DagsFra=MM.dd.yyyy[&DagsTil=MM.dd.yyyy]
//   • GroupID=<n> skilar ÖLLUM tímaröðum flokks; TimeSeriesID=<id> einni röð.
//   • Type=xml → application/xml (annað → texti/CSV). Villur eru <Error><Description>…
//   • ⚠ Dagsetningar eru LESNAR í en-US (MM.dd.yyyy!). Svar-dagsetning er M/d/yyyy.
//   • Sumar undirraðir flokks eru „staðnar" (engin ný gögn) → við síum á raðir sem skila
//     færslum í tímabilinu (t.d. Evra=4064 lifir, systur-ID 4063/4065 dauðar).
//   • Kurteis 500ms bið milli kalla — bakendinn getur IP-throttlað (sbr. Fiskistofu → 405).
//
// Fullt ID-kort í minnisnótu: memory/iceland-sedlabanki-api.md

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + path.sep;
const EP = 'https://www.sedlabanki.is/xmltimeseries/Default.aspx';
const UA = { 'User-Agent': 'KARP dashboard build (karp.is)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// MM.dd.yyyy (en-US) — N ár aftur í tímann
function dagsFra(years) {
  const d = new Date(); d.setFullYear(d.getFullYear() - years);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}.${d.getFullYear()}`;
}
// "7/3/2026 12:00:00 AM" → "2026-07-03"
function iso(s) {
  const [m, d, y] = s.split(' ')[0].split('/');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const round = v => Number(Number(v).toFixed(4));

// Grisja daglegar raðir niður í ~viku-upplausn (heldur ALLTAF fyrsta+síðasta punkti).
// Vaxta-/gengislínur á mælaborði þurfa ekki daglega upplausn yfir mörg ár; headline
// heldur nákvæmu nýjasta gildi. (Vilji stakt „widget" daglegt → sæki beint af endapunkti.)
// keepChanges=true (skref-raðir: vextir/dráttarvextir) → halda ALLTAF gildisbreytingum svo skref-dagur
// sé nákvæmur (réttur „frá"-dagur + hrein skref-gröf). Samfelldar markaðsraðir (gengi/REIBOR/vaxtaferill)
// breytast daglega → keepChanges myndi halda öllu → grisjum þær bara í tíma (~viku).
function thin(points, minGapDays, keepChanges) {
  if (points.length <= 2) return points;
  const out = [points[0]]; let last = Date.parse(points[0][0]), lastV = points[0][1];
  for (let i = 1; i < points.length - 1; i++) {
    const t = Date.parse(points[i][0]);
    if ((keepChanges && points[i][1] !== lastV) || t - last >= minGapDays * 864e5) { out.push(points[i]); last = t; lastV = points[i][1]; }
  }
  out.push(points[points.length - 1]);
  return out;
}

async function fetchXml(qs) {
  const r = await fetch(EP + '?' + qs, { headers: UA });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' (' + qs + ')');
  const xml = await r.text();
  if (/<Error>/.test(xml)) return { err: (xml.match(/Description><!\[CDATA\[(.*?)\]\]/) || [])[1] || 'villa', series: [] };
  const series = xml.split('<TimeSeries ID="').slice(1).map(ch => {
    const id = +(ch.match(/^(\d+)/) || [])[1];
    const name = ((ch.match(/<Name><!\[CDATA\[([\s\S]*?)\]\]>/) || [])[1] || '').trim();
    const points = [...ch.matchAll(/<Entry><Date>(.*?)<\/Date><Value>(.*?)<\/Value>/g)].map(m => [iso(m[1]), round(m[2])]);
    return { id, name, points };
  }).filter(s => s.points.length); // aðeins LIFANDI raðir (engin dauð systur-ID)
  return { series };
}

// Íslensk heiti → gjaldmiðilskóðar (lifandi „majors" í G9 + SDR)
const FX_CODE = {
  'Bandaríkjadalur': 'USD', 'Sterlingspund': 'GBP', 'Evra': 'EUR', 'Dönsk króna': 'DKK',
  'Norsk króna': 'NOK', 'Sænsk króna': 'SEK', 'Svissneskur franki': 'CHF', 'Japanskt jen': 'JPY',
  'Kanadadalur': 'CAD', 'Sérstök dráttarréttindi- SDR': 'SDR',
};

// Hvað á að baka: heill flokkur (group) eða stök ID (ids); saga N ár aftur.
const JOBS = [
  { key: 'vextir_si',    group: 1,  years: 12, unit: '%',      freq: 'D', step: true, label: 'Vextir Seðlabankans (m.a. meginvextir 17923)' },
  { key: 'drattarvextir',ids: [{ id: 22, code: 'drattarvextir' }], years: 16, unit: '%', freq: 'D', step: true, label: 'Dráttarvextir' },
  { key: 'reibor',       group: 4,  years: 5,  unit: '%',      freq: 'D', label: 'Millibankavextir (REIBOR/REIBID)' },
  { key: 'parvextir',    group: 20, years: 5,  unit: '%',      freq: 'D', label: 'Fastir lánstímavextir (par-vextir, ó-/verðtryggt 3/5/10 ár)' },
  { key: 'gengi',        group: 9,  years: 5,  unit: 'ISK',    freq: 'D', label: 'Opinbert viðmiðunargengi (á móti ISK)', fx: true },
  { key: 'gengisvisit',  group: 10, years: 8,  unit: 'vísit',  freq: 'D', label: 'Gengisvísitölur' },
  { key: 'verdbolga',    group: 3,  years: 20, unit: 'blandað',freq: 'M', label: 'Vísitala neysluverðs (ID1=gildi 1988=100, ID2=12-mán %)' },
  { key: 'peningamagn',  ids: [{ id: 81, code: 'M1' }, { id: 82, code: 'M3' }], years: 16, unit: 'm.kr.', freq: 'M', label: 'Peningamagn M1/M3' },
];

(async () => {
  console.log('sæki Seðlabanka xmltimeseries…');
  const datasets = {};
  for (const j of JOBS) {
    const df = dagsFra(j.years);
    let series = [];
    if (j.group) {
      ({ series } = await fetchXml(`GroupID=${j.group}&Type=xml&DagsFra=${df}`));
      if (j.fx) series.forEach(s => { s.code = FX_CODE[s.name] || null; });
      console.log(`  G${j.group} ${j.key}: ${series.length} lifandi raðir (frá ${df})`);
      await sleep(500);
    } else {
      for (const spec of j.ids) {
        const { series: ss } = await fetchXml(`TimeSeriesID=${spec.id}&Type=xml&DagsFra=${df}`);
        if (ss[0]) { ss[0].code = spec.code; series.push(ss[0]); }
        console.log(`  TS${spec.id} ${spec.code}: ${ss[0] ? ss[0].points.length + ' punktar' : 'engin gögn'}`);
        await sleep(500);
      }
    }
    if (j.freq === 'D') series.forEach(s => { s.points = thin(s.points, 6, j.step); }); // ~viku-upplausn (skref-raðir halda breytingum)
    datasets[j.key] = { label: j.label, unit: j.unit, freq: j.freq, group: j.group || null, series };
  }

  // Headline: nýjasta gildi lykiltalna (fyrir forsíðu / Spyrðu-Karp-samhengi)
  const lastPt = s => (s && s.points && s.points.length ? s.points[s.points.length - 1] : null);
  const find = (key, pred) => (datasets[key].series.find(pred) || {});
  const hv = (s, unit) => { const p = lastPt(s); return p ? { id: s.id, name: s.name, date: p[0], value: p[1], unit } : null; };
  const headline = {
    meginvextir:    hv(find('vextir_si', s => s.id === 17923), '%'),   // stýrivextir SÍ
    verdbolga:      hv(find('verdbolga', s => s.id === 2), '%'),       // 12-mán verðbólga
    visitala:       hv(find('verdbolga', s => s.id === 1), '1988=100'),
    evra:           hv(find('gengi', s => s.code === 'EUR'), 'ISK'),
    dollari:        hv(find('gengi', s => s.code === 'USD'), 'ISK'),
    gengisvisitala: hv(find('gengisvisit', s => s.id === 4118), 'vísit'),
  };

  const data = {
    source: 'Seðlabanki Íslands — Gagnatorg (xmltimeseries)',
    sourceUrl: 'https://www.sedlabanki.is/gagnatorg/xml-gogn/',
    endpoint: EP + '?{TimeSeriesID=<id>|GroupID=<n>}&Type=xml&DagsFra=MM.dd.yyyy[&DagsTil=MM.dd.yyyy]',
    note: 'Opinn XML-tímaraðaþjónn SÍ. Vextir/gengi dagleg, verðbólga/peningamagn mánaðarleg. Aðeins lifandi raðir; punktar = [ISO-dags, gildi].',
    updated: new Date().toISOString(),
    headline,
    datasets,
  };
  fs.writeFileSync(DIR + 'sedlabanki.json', JSON.stringify(data));
  const kb = (fs.statSync(DIR + 'sedlabanki.json').size / 1024).toFixed(0);
  console.log(`\nsedlabanki.json | ${Object.keys(datasets).length} gagnasett | ${kb} KB`);
  console.log('headline:', JSON.stringify(headline, null, 1));
})().catch(e => { console.error('ERR', e); process.exit(1); });
