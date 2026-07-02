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

const skattar = G('skattar.json');
if (skattar && skattar.ar) L.push(`SKATTTEKJUR: sundurliðun ársins ${skattar.ar} er á síðunni /skattar/.`);

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

const out = {
  updated: new Date().toISOString().slice(0, 10),
  text: L.join('\n'),
  pages: PAGES.map(([u, d]) => u + ' — ' + d).join('\n'),
};
const dest = path.join(__dirname, '..', 'web', 'public', 'gogn');
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, 'spyrdu_context.json'), JSON.stringify(out));
console.log('Skrifað: web/public/gogn/spyrdu_context.json ·', out.text.length, 'stafir ·', L.length, 'staðreyndalínur');
