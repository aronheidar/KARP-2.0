// Scrapes Numbeo public cost-of-living pages at BUILD TIME (no API key).
// All prices forced to ISK via ?displayCurrency=ISK. Purchasing-power + other
// indices come from one rankings_current.jsp fetch. Writes numbeo.json.
const fs = require('fs');
const DIR = 'C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/gogn/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Reykjavík is always home (first). Others are the comparison set.
const CITIES = [
  { slug: 'Reykjavik',  label: 'Reykjavík',     country: 'Ísland',      home: true },
  { slug: 'Copenhagen', label: 'Kaupmannahöfn', country: 'Danmörk' },
  { slug: 'Oslo',       label: 'Osló',          country: 'Noregur' },
  { slug: 'Stockholm',  label: 'Stokkhólmur',   country: 'Svíþjóð' },
  { slug: 'Helsinki',   label: 'Helsinki',      country: 'Finnland' },
  { slug: 'London',     label: 'London',        country: 'Bretland' },
  { slug: 'Berlin',     label: 'Berlín',        country: 'Þýskaland' },
  { slug: 'Amsterdam',  label: 'Amsterdam',     country: 'Holland' },
  { slug: 'Paris',      label: 'París',         country: 'Frakkland' },
  { slug: 'Zurich',     label: 'Zürich',        country: 'Sviss' },
  { slug: 'Dublin',     label: 'Dublin',        country: 'Írland' },
  { slug: 'New-York',   label: 'New York',      country: 'Bandaríkin' },
];

const CAT_IS = {
  'Restaurants': 'Veitingastaðir',
  'Markets': 'Matvara',
  'Transportation': 'Samgöngur',
  'Utilities (Monthly)': 'Veitur (mánaðarlega)',
  'Sports And Leisure': 'Íþróttir & afþreying',
  'Childcare': 'Barnagæsla',
  'Clothing And Shoes': 'Föt & skór',
  'Rent Per Month': 'Leiga á mánuði',
  'Buy Apartment Price': 'Kaupverð íbúðar',
  'Salaries And Financing': 'Laun & fjármögnun',
};
const ITEM_IS = {
  'Meal at an Inexpensive Restaurant': 'Máltíð á ódýrum veitingastað',
  'Meal for Two at a Mid-Range Restaurant (Three Courses, Without Drinks)': 'Máltíð fyrir tvo (miðlungs, 3 réttir)',
  "Combo Meal at McDonald's (or Equivalent Fast-Food Meal)": 'Skyndibitamáltíð (McDonald\'s eða sambærilegt)',
  'Domestic Draft Beer (0.5 Liter)': 'Innlendur kranabjór (0,5 l)',
  'Imported Beer (0.33 Liter Bottle)': 'Innfluttur bjór (0,33 l flaska)',
  'Cappuccino (Regular Size)': 'Cappuccino',
  'Soft Drink (Coca-Cola or Pepsi, 0.33 Liter Bottle)': 'Gosdrykkur (0,33 l)',
  'Bottled Water (0.33 Liter)': 'Vatn í flösku (0,33 l)',
  'Milk (Regular, 1 Liter)': 'Mjólk (1 l)',
  'Fresh White Bread (500 g Loaf)': 'Hvítt brauð (500 g)',
  'White Rice (1 kg)': 'Hrísgrjón (1 kg)',
  'Eggs (12, Large Size)': 'Egg (12 stk)',
  'Local Cheese (1 kg)': 'Ostur (1 kg)',
  'Chicken Fillets (1 kg)': 'Kjúklingabringur (1 kg)',
  'Beef Round or Equivalent Back Leg Red Meat (1 kg)': 'Nautakjöt (1 kg)',
  'Apples (1 kg)': 'Epli (1 kg)',
  'Bananas (1 kg)': 'Bananar (1 kg)',
  'Oranges (1 kg)': 'Appelsínur (1 kg)',
  'Tomatoes (1 kg)': 'Tómatar (1 kg)',
  'Potatoes (1 kg)': 'Kartöflur (1 kg)',
  'Onions (1 kg)': 'Laukur (1 kg)',
  'Lettuce (1 Head)': 'Salathöfuð (1 stk)',
  'Bottled Water (1.5 Liter)': 'Vatn í flösku (1,5 l)',
  'Bottle of Wine (Mid-Range)': 'Rauðvínsflaska (miðlungs)',
  'Domestic Beer (0.5 Liter Bottle)': 'Innlendur bjór (0,5 l flaska)',
  'Cigarettes (Pack of 20, Marlboro)': 'Sígarettur (20 stk, Marlboro)',
  'One-Way Ticket (Local Transport)': 'Stakur miði (strætó)',
  'Monthly Public Transport Pass (Regular Price)': 'Mánaðarkort í strætó',
  'Taxi Start (Standard Tariff)': 'Leigubíll: byrjunargjald',
  'Taxi 1 km (Standard Tariff)': 'Leigubíll: 1 km',
  'Taxi 1 Hour Waiting (Standard Tariff)': 'Leigubíll: bið í 1 klst',
  'Gasoline (1 Liter)': 'Bensín (1 l)',
  'Volkswagen Golf 1.5 (or Equivalent New Compact Car)': 'Nýr smábíll (VW Golf eða sambærilegt)',
  'Toyota Corolla Sedan 1.6 (or Equivalent New Mid-Size Car)': 'Nýr meðalstór bíll (Toyota Corolla eða sambærilegt)',
  'Basic Utilities for 85 m2 Apartment (Electricity, Heating, Cooling, Water, Garbage)': 'Veitur fyrir 85 m² íbúð (rafmagn, hiti, vatn, sorp)',
  'Mobile Phone Plan (Monthly, with Calls and 10GB+ Data)': 'Farsímaáskrift (símtöl + 10GB+ gögn)',
  'Broadband Internet (Unlimited Data, 60 Mbps or Higher)': 'Internet/ljósleiðari (60 Mbps+)',
  'Monthly Fitness Club Membership': 'Líkamsræktarkort (mánaðarlegt)',
  'Tennis Court Rental (1 Hour, Weekend)': 'Tennisvöllur (1 klst, helgi)',
  'Cinema Ticket (International Release)': 'Bíómiði',
  'Private Full-Day Preschool or Kindergarten, Monthly Fee per Child': 'Einkaleikskóli (heilsdags, á barn/mánuði)',
  'International Primary School, Annual Tuition per Child': 'Alþjóðlegur grunnskóli (skólagjöld á ári)',
  "Jeans (Levi's 501 or Similar)": 'Gallabuxur (Levi\'s 501 eða sambærilegt)',
  'Summer Dress in a Chain Store (e.g. Zara or H&M)': 'Sumarkjóll (Zara/H&M)',
  'Nike Running Shoes (Mid-Range)': 'Hlaupaskór (Nike, miðlungs)',
  "Men's Leather Business Shoes": 'Spariskór (leður, herra)',
  '1 Bedroom Apartment in City Centre': 'Íbúð m/1 svefnh., miðbær',
  '1 Bedroom Apartment Outside of City Centre': 'Íbúð m/1 svefnh., utan miðbæjar',
  '3 Bedroom Apartment in City Centre': 'Íbúð m/3 svefnh., miðbær',
  '3 Bedroom Apartment Outside of City Centre': 'Íbúð m/3 svefnh., utan miðbæjar',
  'Price per Square Meter to Buy Apartment in City Centre': 'Kaupverð á m², miðbær',
  'Price per Square Meter to Buy Apartment Outside of Centre': 'Kaupverð á m², utan miðbæjar',
  'Average Monthly Net Salary (After Tax)': 'Meðallaun á mánuði (eftir skatt)',
  'Annual Mortgage Interest Rate (20-Year Fixed, in %)': 'Vextir húsnæðisláns (% á ári)',
};
const PCT = new Set(['Annual Mortgage Interest Rate (20-Year Fixed, in %)']);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function num(s) { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.text();
}

// Parse the cost-of-living price table(s): category header rows (<th>) + data rows (name, avg, range)
function parsePrices(html) {
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*data_wide_table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  const out = []; let cat = '';
  for (const t of tables) {
    const rows = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const r of rows) {
      const ths = [...r[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => strip(x[1]));
      if (ths.length) { const c = ths.find(x => x && !/^(edit|range)$/i.test(x)); if (c) cat = c; continue; }
      const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
      if (tds.length < 2) continue;
      const name = strip(tds[0]);
      const avg = num(strip(tds[1]));
      if (!name || avg == null) continue;
      let lo = null, hi = null;
      if (tds[2]) { const rg = strip(tds[2]).split('-'); if (rg.length === 2) { lo = num(rg[0]); hi = num(rg[1]); } }
      out.push({ cat, name, avg, lo, hi });
    }
  }
  return out;
}

// Parse rankings_current.jsp → slug -> {col, rent, colRent, groceries, restaurant, pp}
function parseRankings(html) {
  const map = {};
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const r of rows) {
    const slugM = r[1].match(/\/cost-of-living\/in\/([A-Za-z0-9\-]+)/);
    const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => strip(x[1]));
    if (!slugM || tds.length < 7) continue;
    const nums = tds.map(num).filter(x => x != null);
    // columns: rank, [city], col, rent, colRent, groceries, restaurant, pp
    const tail = nums.slice(-6); // col, rent, colRent, groceries, restaurant, pp
    if (tail.length === 6) map[slugM[1].toLowerCase()] = { col: tail[0], rent: tail[1], colRent: tail[2], groceries: tail[3], restaurant: tail[4], pp: tail[5] };
  }
  return map;
}

(async () => {
  console.log('Fetching rankings (purchasing power)...');
  const rank = parseRankings(await get('https://www.numbeo.com/cost-of-living/rankings_current.jsp'));
  console.log('rankings parsed for', Object.keys(rank).length, 'cities');

  const data = { updated: new Date().toISOString().slice(0, 10), currency: 'ISK', order: [], labels: {}, indices: {}, items: [], prices: {} };
  let canonical = null;
  const byKey = {};

  for (const c of CITIES) {
    await sleep(700);
    process.stdout.write('  ' + c.slug + ' ... ');
    try {
      const html = await get('https://www.numbeo.com/cost-of-living/in/' + c.slug + '?displayCurrency=ISK');
      const prices = parsePrices(html);
      if (!prices.length) { console.log('NO PRICES'); continue; }
      data.order.push(c.slug);
      data.labels[c.slug] = { label: c.label, country: c.country, home: !!c.home };
      byKey[c.slug] = {};
      prices.forEach(p => { byKey[c.slug][p.cat + '||' + p.name] = p.avg; });
      data.indices[c.slug] = rank[c.slug.toLowerCase()] || null;
      if (c.home) canonical = prices.map(p => ({ cat: p.cat, name: p.name, is: ITEM_IS[p.name] || p.name, fmt: PCT.has(p.name) ? 'pct' : 'kr' }));
      console.log(prices.length + ' items | pp=' + (data.indices[c.slug] ? data.indices[c.slug].pp : '?'));
    } catch (e) { console.log('ERR', e.message); }
  }
  data.items = canonical || [];
  data.cats = CAT_IS;
  // Store prices as arrays aligned to data.items order (no repeated keys → smaller payload)
  data.order.forEach(slug => { data.prices[slug] = data.items.map(it => { const v = byKey[slug][it.cat + '||' + it.name]; return (v == null) ? null : v; }); });

  fs.writeFileSync(DIR + 'numbeo.json', JSON.stringify(data));
  console.log('\nWROTE numbeo.json | cities:', data.order.length, '| canonical items:', data.items.length);
  console.log('\n=== CANONICAL ITEM LIST (for Icelandic translation) ===');
  data.items.forEach((it, i) => console.log(String(i).padStart(2), '[' + it.cat + ']', it.name));
})().catch(e => console.log('FATAL', e.message));
