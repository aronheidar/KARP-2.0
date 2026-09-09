// ─────────────────────────────────────────────────────────────
// build_spyrdu_context.js — samhengispakki fyrir „Spyrðu Karp" (LOTA 18, #10)
// Þjappar helstu tölum úr gogn/*.json í EINN stuttan íslenskan texta + síðuskrá.
// Úttak: web/public/gogn/spyrdu_context.json → worker les úr ASSETS og leggur
// fyrir gervigreindina sem EINA heimild svarsins (grounding).
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const G = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gogn', f), 'utf8')); } catch (e) { return null; } };
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// ⚠ kr() námundar í heiltölu. Það eyðileggur litlar tölur þar sem aukastafurinn ER fréttin:
//   afgangur 4,7 ma.kr. varð „+5" — sem felur einmitt hversu þunnur hann er. kr1 heldur einum.
// Þúsundapunktur AÐEINS á heiltöluhlutann — annars stöðvar aukastafs-komman lookahead-ið
// og „1708,5" fær engan punkt.
const kr1 = (v) => { const [i, d] = v.toFixed(1).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };

async function liveFacts() {
  const out = [];
  // Verðbólgan beint frá Hagstofu (PxWeb — ATH: EKKERT Content-Type, simple request)
  try {
    const r = await fetch('https://px.hagstofa.is/pxis/api/v1/is/Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px', {
      method: 'POST',
      body: JSON.stringify({ query: [{ code: 'Vísitala', selection: { filter: 'item', values: ['CPI'] } }, { code: 'Liður', selection: { filter: 'item', values: ['change_A'] } }], response: { format: 'json' } }),
    });
    const j = await r.json();
    const rows = (j.data || []).filter((x) => x.values[0] !== '.');
    const last = rows[rows.length - 1];
    if (last) out.push(`VERÐBÓLGA: ${String(last.values[0]).replace('.', ',')}% á ársgrundvelli (${last.key[0]}, vísitala neysluverðs Hagstofunnar).`);
  } catch (e) { console.log('  (verðbólgu-fetch brást — sleppt)'); }
  // Gengi (ECB viðmið um frankfurter.dev)
  try {
    const j = await (await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=ISK')).json();
    const eur = j.rates && j.rates.ISK;
    const j2 = await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=ISK')).json();
    const usd = j2.rates && j2.rates.ISK;
    if (eur) out.push(`GENGI (${j.date}): evran ${String(Math.round(eur * 10) / 10).replace('.', ',')} kr${usd ? `, dollarinn ${String(Math.round(usd * 10) / 10).replace('.', ',')} kr` : ''} (ECB-viðmiðunargengi).`);
  } catch (e) { console.log('  (gengis-fetch brást — sleppt)'); }
  return out;
}

const L = [];
L.push('STÝRIVEXTIR: 7,75% frá 20. maí 2026 (Seðlabanki Íslands); næsta vaxtaákvörðun 19. ágúst 2026.');

const FLOKKAR = { S: 'Samfylkingin', D: 'Sjálfstæðisflokkurinn', M: 'Miðflokkurinn', C: 'Viðreisn', F: 'Flokkur fólksins', B: 'Framsóknarflokkurinn', V: 'Vinstri græn', J: 'Sósíalistaflokkurinn', P: 'Píratar' };
const polls = G('polls.json');
if (polls && Array.isArray(polls.polls) && polls.polls.length) {
  const last = polls.polls[polls.polls.length - 1];
  const latest = Object.entries(last.v || {}).map(([k, v]) => ({ n: FLOKKAR[k] || k, v })).sort((a, b) => b.v - a.v);
  if (latest.length) L.push(`FYLGI FLOKKA (${last.pollster || 'könnun'} ${last.date || ''}): ` + latest.map((x) => `${x.n} ${String(x.v).replace('.', ',')}%`).join(', ') + '.');
}

const cab = G('cabinet.json');
if (Array.isArray(cab)) L.push('RÍKISSTJÓRN: ' + cab.map((m) => `${m.nafn} (${(m.emb || [])[0] || 'ráðherra'}${m.flokur ? ', ' + m.flokur : ''})`).join('; ') + '.');

const atv = G('atvinnuleysi.json');
if (atv && atv.latest != null) {
  const lv = typeof atv.latest === 'object' ? (atv.latest.v ?? atv.latest.value) : atv.latest;
  const lm = typeof atv.latest === 'object' ? (atv.latest.m || atv.latest.d || '') : '';
  if (lv != null) L.push(`ATVINNULEYSI: ${String(lv).replace('.', ',')}%${lm ? ' (' + lm + ')' : ''} — skráð atvinnuleysi VMST.`);
}

const fast = G('fasteignir.json');
if (fast && Array.isArray(fast.months) && fast.months.length) {
  const fm = fast.months[fast.months.length - 1];
  const med = fm.medM2 || fm.med || fm.v;
  if (med) L.push(`FASTEIGNIR: miðgildi fermetraverðs ${kr(med)} kr/m² (${fm.m || fm.d || 'nýjasti mánuður'}, kaupskrá HMS).`);
}

const leiga = G('leiga.json');
if (leiga && Array.isArray(leiga.quarters) && leiga.quarters.length) {
  const q = leiga.quarters[leiga.quarters.length - 1];
  L.push(`LEIGA: miðgildi ${kr(q.medM2)} kr/m² (${q.q}, leiguskrá HMS — nær aðeins til þinglýstra samninga).`);
}

const mark = G('markadir.json');
if (mark && Array.isArray(mark.indices) && mark.indices[0] && mark.indices[0].price) L.push(`HLUTABRÉF: ${mark.indices[0].name || 'OMXI15'} ${String(mark.indices[0].price).replace('.', ',')} stig (síðast bakað ${mark.updated || ''}; lifandi verð eru á /markadir/).`);

const fr = G('frumvorp.json');
if (Array.isArray(fr) && fr.length) {
  const newest = fr.slice(0, 6).map((b) => `„${(b.titill || '').slice(0, 70)}“ (${b.d || ''}, já ${b.ja ?? '?'} / nei ${b.nei ?? '?'})`);
  L.push('NÝJUSTU ÞINGMÁL MEÐ ATKVÆÐAGREIÐSLU: ' + newest.join('; ') + '.');
}

const jof = G('jofnun.json');
if (jof && jof.total) L.push(`JÖFNUNARSJÓÐUR: heildarframlög ${kr(jof.total / 1e6)} m.kr (${jof.ar || ''}).`);

// ── Ríkisfjármál ────────────────────────────────────────────────────────────
// ⚠ Áður stóð hér EIN vísilína („sundurliðun ársins X er á /skattar/") og engar tölur.
//   Aðstoðarmaðurinn gat því hvorki svarað „hver er afkoman" né varist því að draga
//   heildartekjur frá heildarfjárheimildum — sem gefur ~57 ma.kr. „halla" sem er ekki til.
//   Grunna-viðvörunin hér að neðan er villuvörn, ekki skraut.
const skattar = G('skattar.json');
const utgj = G('utgjold.json');
if (skattar && skattar.ar && utgj && utgj.afkoma) {
  const a = utgj.afkoma;
  L.push(`FJÁRLAGAFRUMVARP ${utgj.ar}: heildartekjur ${kr1(skattar.heildartekjur)} ma.kr, þar af `
    + `skatttekjur ${kr1(skattar.skatttekjur)} og tryggingagjöld ${kr1(skattar.tryggingagjold)}. `
    + `Heildarjöfnuður ${a.heildarjofnudur > 0 ? '+' : ''}${kr1(a.heildarjofnudur)} ma.kr, `
    + `frumjöfnuður +${kr1(a.frumjofnudur)} ma.kr, vaxtagjöld ${kr1(a.vaxtagjold)} ma.kr. `
    + `Heimild: ${utgj.heimild}. ⚠ Þetta er FRUMVARP sem bíður afgreiðslu Alþingis — tölurnar `
    + `breytast í meðförum þingsins og verða aðrar í samþykktum fjárlögum.`);
  L.push(`⚠ RÍKISFJÁRMÁL — ÞRÍR ÓLÍKIR GRUNNAR, MÁ ALDREI BLANDA: fjárheimildir málefnasviða `
    + `${kr1(utgj.heild)} ma.kr (IPSAS, 3. gr.) · þjóðhagsgrunnur 1.703,8 ma.kr (GFS, 1. gr.) · `
    + `greiðslugrunnur 1.620,3 ma.kr (2. gr.). ${a.skyring || ''} Afkoman verður AÐEINS reiknuð `
    + `innan sama grunns. Sama gildir um vaxtagjöld: 154,9 (GFS), 136,1 (fjárheimildir), `
    + `107,8 (greidd) — allar réttar, allar ólíkar.`);
  L.push(`SKULDIR RÍKISSJÓÐS ${utgj.ar}: 2.645,7 ma.kr (47,4% af VLF), hækka um 189 ma.kr milli ára `
    + `ÞRÁTT FYRIR afganginn — skýringin er 67,5 ma.kr. halli á lánsfjárjöfnuði og erlend lántaka `
    + `til styrkingar gjaldeyrisforða. M.v. skuldareglu laga um opinber fjármál: 2.108,8 ma.kr (37,8%).`);
  const stor = (h, k, n) => (h || []).flatMap((g) => g[k]).sort((x, y) => y[1] - x[1]).slice(0, n)
    .map((r) => `${r[0]} ${kr1(r[1])}`).join(', ');
  L.push(`STÆRSTU ÚTGJALDALIÐIR (ma.kr, ${utgj.ar}): ${stor(utgj.hopar, 'svid', 6)}. Sundurliðun á /utgjold/.`);
  L.push(`STÆRSTU TEKJUSTOFNAR (ma.kr, ${skattar.ar}): ${stor(skattar.hopar, 'skattar', 6)}. Sundurliðun á /skattar/.`);
} else if (skattar && skattar.ar) {
  L.push(`SKATTTEKJUR: sundurliðun ársins ${skattar.ar} er á síðunni /skattar/.`);
}

const org = G('orka.json');
if (org && Array.isArray(org.rows) && org.rows.length) {
  const r = org.rows[org.rows.length - 1];
  L.push(`RAFORKA: framleiðsla ${kr(r.total)} GWh (${r.y}; vatnsafl ${kr(r.hydro)} GWh, jarðvarmi ${kr(r.geo)} GWh).`);
}

const birgjar = G('birgjar.json');
if (birgjar && birgjar.vendors && birgjar.vendors[0]) L.push(`GREIÐSLUR RÍKISINS (12 mán til ${birgjar.til}): alls ${kr(birgjar.grandTotal / 1e9)} ma.kr; stærsti birgir ${birgjar.vendors[0].n} (${kr(birgjar.vendors[0].t / 1e6)} m.kr). Nánar á /birgjar/.`);

const stjorar = G('sveitarstjorar.json');
if (stjorar && stjorar.byName) {
  const rvk = stjorar.byName['Reykjavíkurborg'];
  if (rvk && rvk.stjori) L.push(`BORGARSTJÓRI REYKJAVÍKUR: ${rvk.stjori}. Stjórar allra sveitarfélaga eru á sveitarfélagasíðunum.`);
}

const PAGES = [
  ['/verdlag/', 'verðbólga, vísitala neysluverðs, stýrivextir, gengi, verðsamanburður borga'],
  ['/vinnumarkadur/', 'laun, launavísitala, kaupmáttur, atvinnuleysi'],
  ['/fasteignir/', 'fasteignaverð, kaupskrá, leigumarkaður'],
  ['/rikisfjarmal/', 'tekjur og útgjöld ríkisins, Sankey-flæðirit, skuldir'],
  ['/skattar/', 'skatttekjur eftir tegundum'], ['/utgjold/', 'útgjöld ríkisins eftir málaflokkum'],
  ['/birgjar/', 'hverjir fá greitt frá ríkinu — topplisti birgja'],
  ['/althingi/', 'þingsalur, atkvæði, pólitískt kort, þingmenn'],
  ['/thingmal/', 'nýjustu frumvörp og atkvæðagreiðslur + lifandi málalisti'],
  ['/kannanir/', 'fylgi flokka í skoðanakönnunum'], ['/stefnuprof/', 'stefnupróf — hvar stendur þú?'],
  ['/sveitarfelog/', 'sveitarfélögin 61: fjárhagur, fólksfjölgun, sveitarstjórnir'],
  ['/kort/', 'Íslandskort með kortahömum'], ['/jofnunarsjodur/', 'jöfnunarsjóður sveitarfélaga'],
  ['/markadir/', 'hlutabréf, gjaldmiðlar, rafmyntir'], ['/vaktir/', 'útboðs-, dóma-, samráðs- og greiðsluvaktir'],
  ['/frettir/', 'fjölmiðlavöktun og umfjöllun um fyrirtæki og stofnanir'],
  ['/orka/', 'raforkuframleiðsla og orkunotkun'], ['/audlindir/', 'auðlindir, veiðigjöld, umhverfisgjöld'],
  ['/atvinnuvegir/', 'sjávarútvegur, ferðaþjónusta, stóriðja, landbúnaður, hugverk'],
  ['/hagspar/', 'hagspár IMF og greiningaraðila'], ['/reiknivelar/', 'launa-, húsnæðislána-, lífeyris- og verðmatsreiknivélar'],
  ['/hermir/', 'hagkerfishermir (fræðslulíkan)'], ['/ees/', 'EES-mál og nýjustu EES-merktu gerðir ESB'],
  ['/samanburdur/', 'alþjóðlegur samanburður'], ['/utanrikis/', 'utanríkisverslun og alþjóðamál'],
];

liveFacts().then((live) => {
  const all = [...live, ...L];
  const out = {
    updated: new Date().toISOString().slice(0, 10),
    text: all.join('\n'),
    pages: PAGES.map(([u, d]) => u + ' — ' + d).join('\n'),
  };
  const dest = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'spyrdu_context.json'), JSON.stringify(out));
  console.log('Skrifað: web/public/gogn/spyrdu_context.json ·', out.text.length, 'stafir ·', all.length, 'staðreyndalínur');
});
