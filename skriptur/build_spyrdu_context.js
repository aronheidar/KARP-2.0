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

const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const dagIS = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? +p[2] + '. ' + MAN[+p[1] - 1] + ' ' + p[0] : String(iso); };

const L = [];
// ⚠⚠ STÝRIVEXTIR VORU HARÐKÓÐAÐIR („7,75% frá 20. maí 2026; næsta vaxtaákvörðun 19. ágúst 2026") og
//    duttu úr takti við ákvörðunina 19.8.2026 sem hækkaði í 8%. Versta afleiðingin var ekki gamla talan
//    heldur ÁREKSTURINN: AUG-lagið (sedlabanki.json) lagði RÉTTU töluna í sömu hvatningu og fasta lagið
//    þá röngu → módelið fékk tvær ólíkar stýrivaxtatölur og valdi. Lesum því úr sömu uppsprettu og bæði
//    AUG-lagið og /verdlag/ nota.
// ⚠ „Frá“-dagurinn er EKKI headline.meginvextir.date — það er síðasti MÆLIPUNKTUR raðarinnar (grisjuð,
//   ~vikulega), ekki gildistökudagur. Hann fæst með því að rekja seríu 17923 aftur á bak meðan gildið
//   helst óbreytt (sama reikniaðferð og verdlag.astro:36). Sé serían ekki til fellur hann á headline-dag.
// ⚠ „Næsta vaxtaákvörðun“ er VILJANDI EKKI hér: sá dagur er hvergi í tímaröðunum (SÍ birtir hann í
//   dagatali) og harðkóðuð dagsetning er einmitt það sem brotnaði. Betra að þegja en að spá.
const sb = G('sedlabanki.json');
const mv = ((sb || {}).headline || {}).meginvextir;
if (mv && mv.value != null) {
  const ser = (((sb.datasets || {}).vextir_si || {}).series || []).find((x) => x.id === 17923);
  let fra = mv.date;
  if (ser && Array.isArray(ser.points) && ser.points.length) {
    const p = ser.points, nuv = p[p.length - 1][1];
    fra = p[p.length - 1][0];
    for (let i = p.length - 2; i >= 0; i--) { if (p[i][1] === nuv) fra = p[i][0]; else break; }
  }
  L.push('STÝRIVEXTIR: meginvextir Seðlabanka Íslands ' + String(mv.value).replace('.', ',') + '% frá ' + dagIS(fra)
    + (mv.date ? ' (staða ' + dagIS(mv.date) + ')' : '') + '. Vaxtaferill, dráttarvextir og raunvextir eru á /vextir/.');
}

// Flokksheitin voru harðkóðuð HÉR og lesin úr `polls.json` í worker-laginu — en sú skrá geymir
// `parties` sem bert fylki af bókstöfum, svo worker-uppflettingin gat aldrei heppnast og AUG sagði
// „S 26,2%" meðan þessi pakki sagði „Samfylkingin 26,2%". Nú lesa BÁÐIR web/src/lib/flokkar.mjs.
// ⚠ Taflan er ESM og þessi skripta CJS → hún kemur inn um dynamískt import() í async-hlutanum
//   neðst. Þess vegna er sætinu haldið frá með PLASSHALDARA hér: staðreyndalínurnar eiga fasta röð
//   (stýrivextir → fylgi → ríkisstjórn …) og að ýta fylginu aftast myndi rugla henni.
const POLLS_SLOT = { plasshaldari: 'polls' };
const polls = G('polls.json');
if (polls && Array.isArray(polls.polls) && polls.polls.length) L.push(POLLS_SLOT);

function pollsLina(FLOKKAR) {
  const last = polls.polls[polls.polls.length - 1];
  const latest = Object.entries(last.v || {}).map(([k, v]) => ({ n: FLOKKAR[k] || k, v })).sort((a, b) => b.v - a.v);
  return latest.length ? `FYLGI FLOKKA (${last.pollster || 'könnun'} ${last.date || ''}): ` + latest.map((x) => `${x.n} ${String(x.v).replace('.', ',')}%`).join(', ') + '.' : null;
}

const cab = G('cabinet.json');
if (Array.isArray(cab)) L.push('RÍKISSTJÓRN: ' + cab.map((m) => `${m.nafn} (${(m.emb || [])[0] || 'ráðherra'}${m.flokur ? ', ' + m.flokur : ''})`).join('; ') + '.');

// ⚠ `latest` er BER TALA í atvinnuleysi.json, svo `latest.m` var alltaf undefined → línan birtist án
//   nokkurrar dagsetningar („4,24% — skráð atvinnuleysi VMST“) þótt gögnin séu frá 2026M05. Ódagsett
//   hlutfall er verra en ekkert: módelið ber það fram sem líðandi tölu. Mánuðurinn er í `updated`.
const atv = G('atvinnuleysi.json');
if (atv && atv.latest != null) {
  const lv = typeof atv.latest === 'object' ? (atv.latest.v ?? atv.latest.value) : atv.latest;
  const lm = (typeof atv.latest === 'object' ? (atv.latest.m || atv.latest.d) : '') || atv.updated || '';
  if (lv != null) L.push(`ATVINNULEYSI: ${String(lv).replace('.', ',')}% skráð atvinnuleysi${lm ? ' (' + lm + ')' : ''}`
    + `${atv.totalRegistered ? ', ' + kr(atv.totalRegistered) + ' á atvinnuleysisskrá' : ''} — Vinnumálastofnun. Sjá /vinnumarkadur/.`);
}

// ⚠ Leitaði áður að fm.medM2/med/v. Mánaðarfærslan er {m, hbsv:{n,vp,m2}, land:{n,vp,m2}} — enginn
//   þeirra reita er til, svo `med` varð undefined og LÍNAN DATT ÞÖGULT ÚT: fasta lagið hafði enga
//   fasteignatölu yfirleitt. Einingar eins og AUG-lagið notar: vp = m.kr, m2 = þ.kr/m².
const fast = G('fasteignir.json');
const fm = fast && Array.isArray(fast.months) && fast.months.length ? fast.months[fast.months.length - 1] : null;
if (fm && fm.hbsv) {
  L.push(`FASTEIGNAVERÐ (${fm.m}, miðgildi kaupsamninga úr kaupskrá HMS): höfuðborgarsvæðið `
    + `${String(fm.hbsv.vp).replace('.', ',')} m.kr (${kr(fm.hbsv.m2 * 1000)} kr/m², ${fm.hbsv.n} kaup)`
    + (fm.land ? `; landsbyggðin ${String(fm.land.vp).replace('.', ',')} m.kr (${kr(fm.land.m2 * 1000)} kr/m², ${fm.land.n} kaup)` : '')
    + '. Eftir sveitarfélögum á /fasteignir/, eftir matssvæðum á /fasteignaverd/.');
}

// ⚠ Notaði áður SÍÐASTA FJÓRÐUNG SKRÁRINNAR (2024F1, 3.086 kr/m²) sem líðandi leiguverð. Skráin
//   þagnar í ársbyrjun 2024 af því þinglýsingarskyldan féll með nýju húsaleigulögunum — hún er ekki
//   stöðnuð veita heldur ENDANLEG. Rétta líðandi talan er `nu`: þinglýstir samningar 2022–23
//   framreiknaðir með vísitölu leiguverðs HMS til nýjasta vísitölumánaðar (2026-07: 3.960 kr/m²) —
//   nákvæmlega sama tala og KPI-spjaldið á /fasteignir/ birtir. Gamla talan var 22% of lág.
const leiga = G('leiga.json');
if (leiga && leiga.nu && leiga.nu.medM2) {
  const n = leiga.nu, q = (leiga.quarters || []).slice(-1)[0];
  L.push(`LEIGUVERÐ: miðgildi ${kr(n.medM2)} kr/m² á mánuði (framreiknað til ${n.m})`
    + `${leiga.visitala && leiga.visitala.yoy != null ? `, vísitala leiguverðs +${String(leiga.visitala.yoy).replace('.', ',')}% milli ára` : ''}. `
    + `⚠ Opna leiguskrá HMS (þinglýstir samningar) nær aðeins fram í ${q ? q.q : 'ársbyrjun 2024'} — þinglýsingarskyldan féll `
    + `með nýju húsaleigulögunum. Karp framreiknar ${kr(n.n)} samninga frá ${String(n.fra).slice(0, 4)} með mánaðarlegri `
    + `vísitölu leiguverðs HMS. Skráðu töluna ALDREI sem beina mælingu líðandi mánaðar. Sjá /fasteignir/.`);
} else if (leiga && Array.isArray(leiga.quarters) && leiga.quarters.length) {
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
  // ── VIÐBÓT: síðukortið var 26 síður af 114 ───────────────────────────────────
  // Afleiðingin var ekki bara að vísanir voru fátæklegar heldur að Karp NEITAÐI að eiga gögn sem
  // það á: „Hvað kostar Parkódín?" fékk svarið „Karp fjallar um íslensk hagvísi, ekki lyfjaverð"
  // þótt /lyf/ geymi 3.040 lyf með verði. Kortið er eina leiðin sem módelið hefur til að vita hvað
  // er til þegar AUG-kveikja grípur ekki — og röng neitun er verri en engin vísun.
  // ⚠ Þetta er RATLISTI, ekki staðreyndalisti: engar tölur hér sem geta úrelst. Fjöldatölur eiga
  //   heima í AUG-færslunum, sem lesa þær úr gögnunum.
  ['/lyf/', 'sérlyfjaskrá: lyf, verð, lyfjaskortur, ATC-flokkar'],
  ['/fyrirtaeki/', 'fyrirtækjaleit og prófílar: eigendur, ársreikningar, stjórn, atvinnugrein'],
  ['/topplistar/', 'stærstu félög eftir atvinnugrein'],
  ['/atvinnugreinar/', 'skýrslur og rekstrarkennitölur einstakra atvinnugreina (ÍSAT)'],
  ['/vextir/', 'stýrivextir, vaxtaferill, dráttarvextir, raunvextir'],
  ['/hagvoxtur/', 'hagvöxtur, verg landsframleiðsla, VLF á mann'],
  ['/mannfjoldi/', 'mannfjöldi, aldursdreifing, innflytjendur, frjósemi, mannfjöldaspá'],
  ['/menntun/', 'menntunarstig og skólasókn'], ['/afbrot/', 'tilkynnt afbrot eftir brotaflokkum'],
  ['/atvinnuleysi/', 'skráð atvinnuleysi eftir mánuðum og sveitarfélögum'],
  ['/fasteignaverd/', 'fasteignaverð eftir matssvæðum (197 svæðasíður)'],
  ['/fasteignavakt/', 'verðmat og leiguverðmat einstakra eigna'],
  ['/sumarhus/', 'sumarhús: verð og matssvæði'],
  ['/utbod/', 'opinber útboð, TED-mál, útboðsúrslit og hæfiskröfur'],
  ['/styrkir/', 'opinberar styrkveitingar úr sjóðum'],
  ['/logbirting/', 'Lögbirtingablaðið: gjaldþrot, innkallanir, félagsslit'],
  ['/domar/', 'dómar Hæstaréttar og Landsréttar á mannamáli'],
  ['/refsilistar/', 'þvingunarlistar (ESB, OFAC) og nafnaskimun'],
  ['/eftirlit/', 'heilbrigðiseftirlit (Reykjavík)'], ['/byggingarvakt/', 'byggingarleyfi (Reykjavík)'],
  ['/leyfi/', 'rekstrarleyfi, ferðaleyfi og apótek'],
  ['/okutaeki-skip/', 'ökutækjaskrá, skipaskrá og loftfaraskrá'],
  ['/stjornartidindi/', 'nýbirt lög og reglugerðir'],
  ['/umferd/', 'umferðartölur'], ['/rafbilar/', 'hlutdeild rafbíla'],
  ['/vidskipti/', 'utanríkisverslun: út- og innflutningur eftir liðum og löndum'],
  ['/nato/', 'varnarútgjöld NATO-ríkja'], ['/sendirad/', 'sendiráð og ræðisskrifstofur'],
  ['/langtima/', 'langtímaþróun hagstærða'], ['/furduhagfraedi/', 'furðuhagfræði — óvæntar tengingar í gögnum'],
  ['/leikur/', 'RÁS-leikurinn: þjóðhagshermir fyrir hópa og kennslu'],
  ['/lobbyvakt/', 'hagsmunagæsla: ræður, þingmál og hlaðvörp eftir leitarorðum'],
  ['/kvotavaktin/', 'aflamark og kvótastaða útgerða'],
  ['/areidanleikavaktin/', 'áreiðanleikakönnun og KYC-vöktun fyrirtækja'],
  ['/karp-pro/', 'áskriftarþrep og verðskrá'], ['/lausnir/', 'vörur og vaktir Karp'],
  ['/mitt-svaedi/', 'mitt svæði: áskriftir, vaktir og stillingar'],
  ['/hjalp/', 'hjálp og samband við Karp'],
];

// ── UM KARP SJÁLFT: vörur, verð, prufur, heimildir ─────────────────────────
// Spyrðu Karp gat ekki svarað „hvað kostar Kvótavaktin?“ þótt svarið væri til ORÐRÉTT í KB-inu sem
// þjónustufulltrúinn á /hjalp/ notar. Við SÆKJUM það þangað í stað þess að endurrita verðin hér —
// tvær verðskrár í sama repo verða ósamstiga við fyrstu verðbreytingu, og þá segir spjallið eitt
// og pósturinn annað. `hjalp_agent.mjs` er ESM og þessi skripta CJS → dynamískt import().
// ⚠ KB-textarnir eru samdir til að SENDAST ORÐRÉTT í pósti („svaraðu þessum pósti…“). Hér eru þeir
//   BAKGRUNNSSTAÐREYNDIR, ekki svarsniðmát — merkjum þá sem slíkt svo spjallið byrji ekki að vísa
//   fólki í að svara pósti sem það fékk aldrei. Tökum aðeins efnislegu færslurnar; póstsértæku
//   úrræðafærslurnar (staðfesting/lykilorð) eiga heima hjá /hjalp/, sem spjallið vísar þegar á.
const KB_SLEPPA = new Set(['stadfesting', 'lykilord']);
// KB-svörin eru samin fyrir PÓST og vísa sum á „svaraðu þessum pósti“ — í spjalli fékk notandinn
// engan póst, svo sú setning er innihaldslaus þar. Færum hana á réttu rásina í stað þess að henda
// færslunni (uppsagnar-spurningin er réttmæt). Nái ný KB-færsla ekki þessu mynstri sér ramma-línan
// hér að neðan samt um að spjallið vísi á /hjalp/ en ekki á póstþráð sem er ekki til.
const postOrd = (s) => String(s)
  .replace(/,?\s*eða\s+svara(ð|ðu)\s+þessum\s+pósti\s+og\s+við\s+[^.]*/gi, ', eða sendu okkur línu á /hjalp/ og við göngum frá því fyrir þig')
  .replace(/svara(ð|ðu)\s+þessum\s+pósti/gi, 'sendu okkur línu á /hjalp/');
async function umKarp() {
  try {
    const { KB } = await import('../web/src/lib/hjalp_agent.mjs');
    const rows = (KB || []).filter((k) => !KB_SLEPPA.has(k.id))
      .map((k) => 'UM KARP (' + k.um + '): ' + postOrd(k.svar));
    if (rows.length) rows.push('UM KARP (rásin): þessar vöru- og verðupplýsingar eru þær sem gilda á karp.is. '
      + 'Þurfi notandinn mannlega aðstoð — aðgangur, reikningur, uppsögn, villa — vísaðu á /hjalp/. '
      + 'Vísaðu ALDREI á að „svara þessum pósti“: spjallið er ekki póstþráður.');
    return rows;
  } catch (e) { console.log('  (KB-import brást — sleppt:', e.message.slice(0, 60) + ')'); return []; }
}

// Flokkstaflan er ESM; sækjum hana eins og KB-ið og leysum plasshaldarann úr L á sínum stað.
async function flokkaTafla() {
  try { return (await import('../web/src/lib/flokkar.mjs')).FLOKKAR; }
  catch (e) { console.log('  (flokkar-import brást — fylgislínan sleppt:', e.message.slice(0, 50) + ')'); return null; }
}

Promise.all([liveFacts(), umKarp(), flokkaTafla()]).then(([live, vara, FLOKKAR]) => {
  const leyst = L.map((x) => (x === POLLS_SLOT ? (FLOKKAR ? pollsLina(FLOKKAR) : null) : x)).filter(Boolean);
  const all = [...live, ...leyst, ...vara];
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
