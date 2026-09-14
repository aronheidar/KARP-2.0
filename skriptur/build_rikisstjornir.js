// Ríkisstjórnir lýðveldisins — söguleg tímalína úr ráðherrasetum Alþingis.
//
// Af hverju (14.9.2026): Karp átti EKKERT um fyrri ríkisstjórnir — cabinet.json geymir aðeins
// núverandi ráðherra. Án sögunnar er ekki hægt að segja neitt um hversu lengi stjórnir sitja,
// hversu oft þær springa, né hvar þessi stjórn stendur í samanburði. Enginn birtir þetta á
// skipulegu formi; Alþingi á gögnin en aðeins per einstakling.
//
// Aðferð: ráðherraseta hvers ráðherra ber <embætti>, <þingflokkur> og <tímabil><inn>/<út>.
// Setur eru KLIPPTAR EFTIR ÞINGUM (sami ráðherra fær eina færslu per þing), svo samfelldar setur
// eru sameinaðar aftur. Forsætisráðherra-seturnar skilgreina stjórnartímabil; ráðherrar sem sitja
// á sama tíma gefa flokkasamsetninguna. Breytist flokkasamsetningin innan setu forsætisráðherra
// er tímabilinu SKIPT — það er einmitt klofningurinn sem við viljum mæla.
//
// ⚠ Skriptan ÁLYKTAR EKKI um ástæðu stjórnarloka (kosningar vs. slit). Til þess þarf kosninga-
// dagsetningar úr sjálfstæðri heimild; sviðið `endir` er `null` þar til það liggur fyrir.
//
// Skyndiminni: gogn/_cache/rikisstjornir/ (í .gitignore). Söguleg gögn breytast ekki — aðeins
// yfirstandandi þing er sótt aftur. Full köld keyrsla er ~400 beiðnir, endurkeyrsla ~3.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'gogn') + '/';
const CACHE = DIR + '_cache/rikisstjornir/';
const OUT = DIR + 'rikisstjornir.json';
const { fetchText, writeJsonUnlessEmpty, nuverandiThing } = require('./_seigla.js');

const LYDVELDI_THING = 63;          // þing 63 = 1944–1945; lýðveldið stofnað 17.6.1944
const GAP_MS = Number(process.env.ALTHINGI_GAP_MS || 700);   // althingi.is 429-ar við skrið (sjá _seigla.js)
const dec = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const svefn = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(CACHE, { recursive: true });

// Sækir og geymir. `ferskt` (yfirstandandi þing) fer fram hjá skyndiminninu.
async function sakja(lykill, url, ferskt = false) {
  const f = CACHE + lykill + '.xml';
  if (!ferskt && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const t = await fetchText(url.replace('http://', 'https://'));
  fs.writeFileSync(f, t);
  await svefn(GAP_MS);
  return t;
}

// dd.mm.yyyy → yyyy-mm-dd (Alþingi skilar íslensku sniði í <inn>/<út>)
const dags = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const dagar = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

async function main() {
  const nuThing = await nuverandiThing().catch(() => 158);

  // ── 1 · þing → tímabil (líka til að vita hvaða þing tilheyra lýðveldinu) ──
  const ltXml = await sakja('loggjafarthing', 'https://www.althingi.is/altext/xml/loggjafarthing/', true);
  const thingin = [];
  for (const b of ltXml.match(/<þing númer=[\s\S]*?<\/þing>/g) || []) {
    const nr = +(/<þing númer='(\d+)'/.exec(b) || [])[1];
    if (!nr || nr < LYDVELDI_THING) continue;
    thingin.push({ nr, setning: dags((/<þingsetning>(.*?)<\/þingsetning>/.exec(b) || [])[1]), lok: dags((/<þinglok>(.*?)<\/þinglok>/.exec(b) || [])[1]) });
  }
  console.log(`þing frá lýðveldi: ${thingin.length} (${thingin[0].nr}–${thingin[thingin.length - 1].nr})`);

  // ── 2 · ráðherra-listar per þing → einkvæm auðkenni ──
  const idur = new Set();
  for (const t of thingin) {
    const x = await sakja('lthing-' + t.nr, 'https://www.althingi.is/altext/xml/radherrar/?lthing=' + t.nr, t.nr >= nuThing);
    for (const m of x.match(/<ráðherra id='(\d+)'/g) || []) idur.add(+/\d+/.exec(m)[0]);
  }
  console.log(`einkvæmir ráðherrar: ${idur.size}`);

  // ── 3 · ráðherraseta per einstakling ──
  const setur = [];
  let n = 0;
  for (const id of idur) {
    const x = await sakja('seta-' + id, 'https://www.althingi.is/altext/xml/radherrar/radherraseta/?nr=' + id, false);
    const nafn = dec((/<nafn>(.*?)<\/nafn>/.exec(x) || [])[1]);
    const blokk = (/<ráðherrasetur>([\s\S]*?)<\/ráðherrasetur>/.exec(x) || [])[1] || '';
    for (const s of blokk.match(/<ráðherraseta>[\s\S]*?<\/ráðherraseta>/g) || []) {
      const emb = /<embætti id='(\d+)'>(.*?)<\/embætti>/.exec(s);
      const fl = /<þingflokkur id='(\d+)'>(.*?)<\/þingflokkur>/.exec(s);
      const inn = dags((/<inn>(.*?)<\/inn>/.exec(s) || [])[1]);
      const ut = dags((/<út>(.*?)<\/út>/.exec(s) || [])[1]);
      if (!inn) continue;
      setur.push({ id, nafn, thing: +(/<þing>(\d+)<\/þing>/.exec(s) || [])[1] || null,
        embId: emb ? +emb[1] : null, emb: emb ? dec(emb[2]) : null,
        flokkur: fl ? dec(fl[2]) : null, inn, ut });
    }
    if (++n % 25 === 0) console.log(`  … ${n}/${idur.size}`);
  }
  console.log(`ráðherrasetur: ${setur.length}`);

  // ── 4 · sameina setur sem eru klipptar eftir þingum (sami maður, sama embætti, samfellt) ──
  const lyk = (s) => `${s.id}|${s.embId}`;
  const hopar = new Map();
  for (const s of setur) { if (!hopar.has(lyk(s))) hopar.set(lyk(s), []); hopar.get(lyk(s)).push(s); }
  const samfellt = [];
  for (const arr of hopar.values()) {
    arr.sort((a, b) => a.inn.localeCompare(b.inn));
    let cur = null;
    for (const s of arr) {
      // ⚠⚠ Fyrir 1991 sat Alþingi í HAUST–VOR LOTUM og ráðherrasetur eru klipptar eftir þingum með
      // SUMARHLÉI á milli (t.d. út 03.07.1951, inn 01.10.1951 — sami ráðherra, sama stjórn). Bil eitt
      // og sér dugar því ekki: krafan er að þingin séu SAMLIGGJANDI (n → n+1) og flokkurinn sá sami.
      // Væri aðeins horft á daga-bil klofnaði hver einasta stjórn fyrir 1991 við hvert sumarfrí —
      // miðgildi líftíma mældist þá 212 dagar í stað rúmra þriggja ára.
      const samfella = cur && cur.flokkur === s.flokkur
        && ((cur.ut && dagar(cur.ut, s.inn) <= 2) || (s.thing != null && cur.thingTil != null && s.thing === cur.thingTil + 1));
      if (samfella) { cur.ut = s.ut; cur.thingTil = s.thing; continue; }
      if (cur) samfellt.push(cur);
      cur = { ...s, thingFra: s.thing, thingTil: s.thing };
    }
    if (cur) samfellt.push(cur);
  }
  console.log(`samfelldar setur: ${samfellt.length}`);

  // ── 5 · stjórnartímabil: forsætisráðherra + flokkasamsetning ──
  // ⚠ Við stjórnarskipti SKARAST fráfarandi og verðandi stjórn um nákvæmlega einn dag: <út> er
  // síðasti dagur fráfarandi ráðherra og <inn> fyrsti dagur þess verðandi — SAMI dagur. Væri `út`
  // talið með sæist t.d. Björt framtíð og Viðreisn í stjórn Katrínar 30.11.2017. Því er lokadagur
  // UNDANSKILINN: á skiptidegi telst aðeins sú stjórn sem er að taka við.
  const virkir = (d) => samfellt.filter((s) => s.inn <= d && (!s.ut || s.ut > d));
  const flokkarA = (d) => [...new Set(virkir(d).map((s) => s.flokkur).filter(Boolean))].sort();
  const FORS = samfellt.filter((s) => s.emb && /^forsætisráðherra$/i.test(s.emb)).sort((a, b) => a.inn.localeCompare(b.inn));

  const stjornir = [];
  for (const f of FORS) {
    // atburðadagar innan setunnar: hvenær sem einhver ráðherra kemur eða fer
    const endir = f.ut || null;
    const punktar = new Set([f.inn]);
    for (const s of samfellt) {
      if (s.inn > f.inn && (!endir || s.inn <= endir)) punktar.add(s.inn);
      if (s.ut && s.ut > f.inn && (!endir || s.ut < endir)) {
        const d = new Date(s.ut); d.setDate(d.getDate() + 1);
        punktar.add(d.toISOString().slice(0, 10));
      }
    }
    // Lokadagur setunnar er SKIPTIDAGUR: þá er verðandi stjórn þegar talin virk (sjá regluna að ofan),
    // svo mat á þeim degi lýsir EFTIRMANNINUM. Hann má því ekki stofna nýtt tímabil hjá fráfarandi
    // forsætisráðherra — annars fær hver einustu stjórnarskipti eins dags gervitímabil.
    const rod = [...punktar].sort().filter((d) => d === f.inn || !endir || d < endir);
    let seg = null;
    for (const d of rod) {
      const fl = flokkarA(d);
      if (!fl.length) continue;
      const sig = fl.join('|');
      if (seg && seg.sig === sig) continue;
      if (seg) { seg.til = d; stjornir.push(seg); }
      seg = { sig, fra: d, til: endir, forsaetisradherra: { id: f.id, nafn: f.nafn, flokkur: f.flokkur }, flokkar: fl };
    }
    if (seg) stjornir.push(seg);
  }

  // ⚠ STARFANDI FORSÆTISRÁÐHERRA: Alþingi skráir staðgengil undir sama embættisheiti og hinn
  // reglulega, svo t.d. Bjarni Benediktsson 10.10.1961–01.01.1962 (í veikindum Ólafs Thors) birtist
  // sem sjálfstætt tímabil INNI Í tímabili Ólafs. Slík tímabil eru ekki nýjar ríkisstjórnir. Þau
  // þekkjast á hreiðrun: allt tímabilið liggur innan annars. Þau eru tekin út en EKKI hent — þau
  // fylgja móður-tímabilinu í `starfandi`.
  const hreidrud = new Set();
  for (const a of stjornir) {
    for (const b of stjornir) {
      if (a === b || !a.til || !b.til) continue;
      if (b.fra >= a.fra && b.til <= a.til && dagar(b.fra, b.til) >= 2 && b.forsaetisradherra.id !== a.forsaetisradherra.id) {
        hreidrud.add(b);
        (a.starfandi = a.starfandi || []).push({ fra: b.fra, til: b.til, nafn: b.forsaetisradherra.nafn });
      }
    }
  }
  if (hreidrud.size) console.log(`starfandi forsætisráðherrar (hreiðruð tímabil tekin út): ${hreidrud.size}`);

  const ut = stjornir
    .filter((s) => !hreidrud.has(s))
    .filter((s) => !s.til || dagar(s.fra, s.til) >= 1)          // sleppa núll-daga skiptibrotum
    .map((s, i) => ({
      nr: i + 1, fra: s.fra, til: s.til,
      dagar: s.til ? dagar(s.fra, s.til) : dagar(s.fra, new Date().toISOString().slice(0, 10)),
      stendur: !s.til,
      forsaetisradherra: s.forsaetisradherra,
      starfandi: s.starfandi || undefined,
      flokkar: s.flokkar,
      radherrar: virkir(s.fra).length,
      // STARFSSTJÓRN: fráfarandi stjórn situr áfram þar til ný er mynduð — ráðherrum fækkar skarpt
      // (hver ber fleiri ráðuneyti). Í öllu safninu á þetta við um EITT tímabil: 24.4.–16.5.1995,
      // sex ráðherrar; næstfæstu eru tíu. Merkt en ekki hent — greining á klofningi verður að
      // undanskilja þessi tímabil, annars telst brotthvarf samstarfsflokks við kosningar sem klofningur.
      starfsstjorn_lykleg: virkir(s.fra).length <= 8 || undefined,
      endir: null,        // ⚠ kosningar vs. slit — krefst kosningadagsetninga úr sjálfstæðri heimild
    }));

  writeJsonUnlessEmpty(OUT, {
    uppfaert: new Date().toISOString().slice(0, 10),
    heimild: 'Alþingi — ráðherrasetur (althingi.is/altext/xml/radherrar/radherraseta/)',
    fra_thingi: LYDVELDI_THING,
    aths: 'Tímabil eru brotin þar sem FLOKKASAMSETNING stjórnarinnar breytist, ekki aðeins við skipti á forsætisráðherra. `endir` er óútfyllt: ástæða stjórnarloka (kosningar vs. slit) krefst kosningadagsetninga úr sjálfstæðri heimild.',
    stjornir: ut,
  }, { isEmpty: (d) => !d || !(d.stjornir || []).length, label: 'rikisstjornir.json' });
  console.log(`\nSKRIFAÐ ${OUT} — ${ut.length} stjórnartímabil`);
  console.log(ut.slice(-6).map((s) => `  ${s.fra} → ${s.til || 'situr'}  ${String(s.dagar).padStart(5)} d  ${s.forsaetisradherra.nafn} · ${s.flokkar.join(', ')}`).join('\n'));
}

main().catch((e) => { console.error('VILLA:', e && e.message); process.exit(1); });
