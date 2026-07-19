// ─────────────────────────────────────────────────────────────
// build_frettavel.js — FRÉTTAVÉL KARP (LOTA 28)
// Sjálfvirk gagnablaðamennska: detector-vél finnur atburði VÉLRÆNT í bökuðu
// gögnunum (engin ágiskun) → nýir atburðir (seen-dedup) fá stutta frétt.
// Textinn: Claude (claude-opus-4-8) skrifar GRUNDAÐ í reiknuðu staðreyndunum
// sé ANTHROPIC_API_KEY í umhverfinu (cron-secret) — annars sniðmátstexti úr
// sömu tölum. Hver frétt ber ai-flagg og hlekk á frumgögnin á karp.is.
//
// Detectorar v1:
//   rebel  — þingmaður kýs gegn ≥75% meirihluta eigin þingflokks
//   taep   — atkvæðagreiðsla ræðst á ≤5 atkvæðum
//   fylgi  — flokkur mælist hæst/lægst í kannanasögu Karp
//   fast   — meðalfermetraverð hbsv. nær sögulegu hámarki (mánaðarröð HMS)
//   spike  — greiðslur ríkisins til birgja ≥2,5× ellefu mánaða meðaltal
//   utbod  — ≥3 ný útboð í sama flokki auglýst sama dag (allar gáttir)
//
// Úttak: gogn/frettavel.json (+web/public/gogn/) + web/public/frettavel.xml (RSS)
// Ástand: gogn/frettavel_seen.json {id: fyrst-séð-dags} — aldrei tvísend frétt.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const G = (f) => path.join(__dirname, '..', 'gogn', f);
const J = (f) => { try { return JSON.parse(fs.readFileSync(G(f), 'utf8')); } catch (e) { return null; } };
const MODEL = process.env.KARP_FRETTAVEL_MODEL || 'claude-opus-4-8';
const TODAY = new Date().toISOString().slice(0, 10);

const LETTER = { S: 'Samfylkingin', C: 'Viðreisn', F: 'Flokkur fólksins', D: 'Sjálfstæðisflokkurinn', M: 'Miðflokkurinn', B: 'Framsóknarflokkurinn', J: 'Sósíalistaflokkurinn', P: 'Píratar', V: 'Vinstri græn' };
const NAME2LETTER = { 'Samfylkingin': 'S', 'Viðreisn': 'C', 'Flokkur fólksins': 'F', 'Sjálfstæðisflokkur': 'D', 'Sjálfstæðisflokkurinn': 'D', 'Miðflokkurinn': 'M', 'Framsóknarflokkur': 'B', 'Framsóknarflokkurinn': 'B', 'Sósíalistaflokkurinn': 'J', 'Píratar': 'P', 'Vinstri græn': 'V', 'Vinstrihreyfingin – grænt framboð': 'V' };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9á-öþæð]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
const pct1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const manIS = (ym) => { const m = String(ym).match(/(\d{4})-(\d{2})/); return m ? MAN[+m[2] - 1] + ' ' + m[1] : ym; };
// Smágraf: síðustu n tölugildi úr röð (fyrir sparkline á fréttakorti). Skilar [] ef of stutt.
const downsample = (arr, n = 24) => { const a = (arr || []).filter((x) => typeof x === 'number'); return a.length <= n ? a : a.slice(-n); };

// ── Detectorar ────────────────────────────────────────────────
// state = frettavel_state.json: snapshot-samanburður milli keyrslna (diff-fréttir)
// og viku/mánaðar-taktar. FYRSTA keyrsla hvers hluta er HLJÓÐ (initialiserar bara).
function detect(state) {
  const ev = [];

  // Þinggögn: atkvæði + þingmenn + frumvörp
  const atk = J('atkvaedi.json');
  const mps = J('althingi.json') || [];
  const bills = J('frumvorp.json') || [];
  const flokkurAf = {}; mps.forEach((m) => { if (m.flokkur && m.flokkur !== 'utan þingflokka') flokkurAf[m.nafn] = m.flokkur; });
  const billAf = {}; bills.forEach((b) => { billAf[b.nr] = b; });

  // Formsatriði (lengd þingfundar, afbrigði, dagskrártillögur) eru ekki fréttir.
  const FORMSATRIDI = /lengd þingfundar|afbrigði|dagskrá|frestun.*fund|fundarhlé/i;
  if (atk && atk.mal) {
    for (const [nr, v] of Object.entries(atk.mal)) {
      const b = billAf[+nr] || billAf[nr] || {};
      const titill = b.titill || ('mál nr. ' + nr);
      if (FORMSATRIDI.test(titill)) continue;
      const ja = (v.ja || []), nei = (v.nei || []);
      // taep — ræðst á ≤5 atkvæðum (raunveruleg atkvgr., ekki einróma formsatriði)
      const munur = Math.abs(ja.length - nei.length);
      if (ja.length + nei.length >= 40 && nei.length >= 10 && munur <= 5) {
        ev.push({ id: `taep-${atk.thing}-${nr}`, type: 'taep', facts: { titill, nr: +nr, thing: atk.thing, ja: ja.length, nei: nei.length, munur, nidurstada: ja.length > nei.length ? 'samþykkt' : 'fellt' }, url: `/thingmal/?nr=${nr}`,
          title: `Naumur meirihluti um „${titill.length > 60 ? titill.slice(0, 57) + '…' : titill}“`,
          text: `„${titill}“ var ${ja.length > nei.length ? 'samþykkt' : 'fellt'} á Alþingi með ${ja.length} atkvæðum gegn ${nei.length} — aðeins ${munur} atkvæða munur.` });
      }
      // rebel — gegn ≥75% meirihluta eigin flokks (flokkur með ≥3 í atkvgr.)
      const tally = {};
      ja.forEach((n) => { const f = flokkurAf[n]; if (f) (tally[f] = tally[f] || { ja: [], nei: [] }).ja.push(n); });
      nei.forEach((n) => { const f = flokkurAf[n]; if (f) (tally[f] = tally[f] || { ja: [], nei: [] }).nei.push(n); });
      for (const [fl, t] of Object.entries(tally)) {
        const alls = t.ja.length + t.nei.length;
        if (alls < 3) continue;
        const meiriJa = t.ja.length >= t.nei.length;
        const meiri = meiriJa ? t.ja.length : t.nei.length;
        if (meiri / alls < 0.75) continue;
        const rebels = meiriJa ? t.nei : t.ja;
        for (const nafn of rebels) {
          ev.push({ id: `rebel-${atk.thing}-${nr}-${nafn.replace(/\s+/g, '_')}`, type: 'rebel', facts: { nafn, flokkur: fl, titill, nr: +nr, thing: atk.thing, kaus: meiriJa ? 'nei' : 'já', flokkurKaus: meiriJa ? 'já' : 'nei', medFlokki: meiri, alls, ja: ja.length, nei: nei.length }, url: `/thingmal/?nr=${nr}`,
            title: `${nafn} kaus gegn eigin flokki um „${titill.length > 55 ? titill.slice(0, 52) + '…' : titill}“`,
            text: `${nafn} (${fl}) kaus ${meiriJa ? 'nei' : 'já'} í atkvæðagreiðslu um „${titill}“ þótt ${meiri} af ${alls} flokksfélögum í atkvæðagreiðslunni kysu ${meiriJa ? 'já' : 'nei'}. Niðurstaða þingsins: ${ja.length} já, ${nei.length} nei.` });
        }
      }
    }
  }

  // fylgi — met í kannanaröðinni
  const polls = J('polls.json');
  if (polls && Array.isArray(polls.polls) && polls.polls.length >= 10) {
    const last = polls.polls[polls.polls.length - 1];
    for (const [st, nafn] of Object.entries(LETTER)) {
      const serie = polls.polls.map((p) => (p.v || {})[st]).filter((x) => typeof x === 'number');
      if (serie.length < 10 || typeof (last.v || {})[st] !== 'number') continue;
      const nu = last.v[st], fyrri = serie.slice(0, -1);
      const met = nu > Math.max(...fyrri) ? 'hæsta' : nu < Math.min(...fyrri) ? 'lægsta' : null;
      if (!met) continue;
      const kosn = ((polls.election2024 || {}).v || {})[st];
      ev.push({ id: `fylgi-${last.date}-${st}-${met}`, type: 'fylgi', spark: downsample(serie, 24), facts: { flokkur: nafn, fylgi: nu, met, pollster: last.pollster, dags: last.date, kannanir: serie.length, kosningar2024: kosn ?? null }, url: '/kannanir/',
        title: `${nafn} ${met === 'hæsta' ? 'aldrei hærri' : 'aldrei lægri'} í könnunum: ${String(nu).replace('.', ',')}%`,
        text: `${nafn} mælist með ${String(nu).replace('.', ',')}% fylgi hjá ${last.pollster} (${last.date}) — það ${met} í ${serie.length} könnunum sem Karp hefur safnað.${typeof kosn === 'number' ? ` Í alþingiskosningunum 2024 fékk flokkurinn ${String(kosn).replace('.', ',')}%.` : ''}` });
    }
  }

  // fast — sögulegt hámark fermetraverðs (mánaðarröð hbsv.)
  const fast = J('fasteignir.json');
  if (fast && Array.isArray(fast.months) && fast.months.length > 24) {
    const m = fast.months, s = m[m.length - 1];
    if (s && s.hbsv && s.hbsv.n >= 30) {
      const fyrri = m.slice(0, -1).map((x) => (x.hbsv || {}).m2 || 0);
      const prevMax = Math.max(...fyrri);
      if (s.hbsv.m2 > prevMax) {
        ev.push({ id: `fast-${s.m}`, type: 'fast', spark: downsample(m.map((x) => (x.hbsv || {}).m2 || 0), 24), facts: { manudur: s.m, m2: s.hbsv.m2, n: s.hbsv.n, fyrraMet: prevMax }, url: '/fasteignir/',
          title: `Fermetraverð á höfuðborgarsvæðinu í nýju hámarki: ${kr(s.hbsv.m2)} þús. kr.`,
          text: `Meðalfermetraverð íbúða á höfuðborgarsvæðinu náði sögulegu hámarki í ${manIS(s.m)}: ${kr(s.hbsv.m2)} þús. kr. á fermetra samkvæmt kaupskrá HMS (${s.hbsv.n} kaupsamningar). Fyrra hámark mánaðarraðarinnar var ${kr(prevMax)} þús. kr.` });
      }
    }
  }

  // spike — birgjagreiðslur margfaldast síðasta mánuð
  const bir = J('birgjar.json');
  if (bir && bir.vendorDetail && Array.isArray(bir.months) && bir.months.length === 12) {
    const siðasti = bir.months[11].m;
    const spikes = [];
    for (const [nafn, d] of Object.entries(bir.vendorDetail)) {
      const m = d.m || [];
      if (m.length !== 12) continue;
      const fyrri = m.slice(0, 11).filter((x) => x > 0);
      if (fyrri.length < 6) continue;
      const medal = fyrri.reduce((a, b) => a + b, 0) / fyrri.length;
      if (m[11] >= 2.5 * medal && m[11] >= 20_000_000) {
        spikes.push({ nafn, sidast: m[11], medal, hlutfall: m[11] / medal, org: ((d.orgs || [])[0] || [])[0] || '' });
      }
    }
    spikes.sort((a, b) => b.hlutfall - a.hlutfall).slice(0, 4).forEach((s) => {
      ev.push({ id: `spike-${siðasti}-${s.nafn.replace(/\s+/g, '_')}`, type: 'spike', facts: { birgir: s.nafn, manudur: siðasti, upphaed: Math.round(s.sidast), medaltal: Math.round(s.medal), hlutfall: +s.hlutfall.toFixed(1), staersti: s.org }, url: '/birgjar/',
        title: `${s.nafn}: greiðslur ríkisins ${String(s.hlutfall.toFixed(1)).replace('.', ',')}-földuðust`,
        text: `Greiðslur ríkisins til birgjans „${s.nafn}“ námu ${kr(s.sidast)} kr. í ${manIS(siðasti)} — ${String(s.hlutfall.toFixed(1)).replace('.', ',')}× meðaltal síðustu ellefu mánaða (${kr(s.medal)} kr.) samkvæmt opnum reikningum ríkisins.${s.org ? ` Stærsti kaupandinn er ${s.org}.` : ''}` });
    });
  }

  // utbod — bylgja í sama flokki í gær (heill dagur)
  const ut = J('utbod.json');
  if (ut && Array.isArray(ut.tenders)) {
    const ydate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const perCat = {};
    ut.tenders.filter((t) => t.d === ydate).forEach((t) => { (perCat[t.cat] = perCat[t.cat] || []).push(t); });
    for (const [cat, list] of Object.entries(perCat)) {
      if (list.length < 3 || cat === 'annad') continue;
      const heiti = ((ut.cats || {})[cat] || [cat])[0];
      ev.push({ id: `utbod-${ydate}-${cat}`, type: 'utbod', facts: { flokkur: heiti, fjoldi: list.length, dags: ydate, daemi: list.slice(0, 3).map((t) => t.t.slice(0, 70)) }, url: '/utbod/',
        title: `${list.length} ný útboð í flokknum ${heiti} á einum degi`,
        text: `${list.length} ný opinber útboð í flokknum ${heiti} voru auglýst ${ydate} á gáttunum sem Karp vaktar — þar á meðal: ${list.slice(0, 2).map((t) => '„' + t.t.slice(0, 60) + '“').join(' og ')}.` });
    }
  }

  // ── LOTA 29: stjórnarfylgi, þröskuldar, leiðtogaskipti (cabinet ↔ polls) ──
  const cab = J('cabinet.json');
  if (polls && Array.isArray(polls.polls) && polls.polls.length >= 10 && Array.isArray(cab)) {
    const ps = polls.polls, last = ps[ps.length - 1], prev = ps[ps.length - 2];
    const govL = [...new Set(cab.map((c) => NAME2LETTER[c.flokur]).filter(Boolean))];
    if (govL.length >= 2) {
      const sum = (p) => govL.reduce((a, l) => a + ((p.v || {})[l] || 0), 0);
      const sums = ps.map(sum), nu = sums[sums.length - 1], fyrri = sums.slice(0, -1);
      const kjor = govL.reduce((a, l) => a + (((polls.election2024 || {}).v || {})[l] || 0), 0);
      const govNames = govL.map((l) => LETTER[l]).join(', ');
      if (nu <= Math.min(...fyrri)) {
        ev.push({ id: `stjorn-${last.date}-lagmark`, type: 'stjorn', facts: { flokkar: govNames, fylgi: +nu.toFixed(1), kjorfylgi: +kjor.toFixed(1), pollster: last.pollster, dags: last.date, kannanir: sums.length }, url: '/kannanir/',
          title: `Stjórnarflokkarnir aldrei með minna fylgi: ${pct1(nu)}%`,
          text: `Ríkisstjórnarflokkarnir (${govNames}) mælast samanlagt með ${pct1(nu)}% hjá ${last.pollster} (${last.date}) — það lægsta í ${sums.length} könnunum sem Karp hefur safnað. Í alþingiskosningunum 2024 fengu flokkarnir samanlagt ${pct1(kjor)}%.` });
      }
      const pv = sum(prev);
      if (pv >= 50 !== nu >= 50) {
        ev.push({ id: `stjorn-${last.date}-${nu >= 50 ? 'yfir50' : 'undir50'}`, type: 'stjorn', facts: { flokkar: govNames, fylgi: +nu.toFixed(1), adur: +pv.toFixed(1), pollster: last.pollster, dags: last.date }, url: '/kannanir/',
          title: `Stjórnarflokkarnir ${nu >= 50 ? 'ná aftur meirihluta' : 'missa meirihlutann'} í könnunum: ${pct1(nu)}%`,
          text: `Samanlagt fylgi ríkisstjórnarflokkanna (${govNames}) fór ${nu >= 50 ? 'yfir' : 'undir'} 50% hjá ${last.pollster} (${last.date}): ${pct1(nu)}%, var ${pct1(pv)}% í könnuninni á undan.` });
      }
    }
    // 5%-þröskuldur jöfnunarsæta + stærsti flokkur
    if (prev && prev.v && last && last.v) {
      for (const l of Object.keys(last.v)) {
        const a = prev.v[l], b = last.v[l];
        if (typeof a !== 'number' || typeof b !== 'number' || !LETTER[l]) continue;
        if (a < 5 !== b < 5) {
          ev.push({ id: `throskuldur-${last.date}-${l}-${b >= 5 ? 'yfir' : 'undir'}`, type: 'fylgi', facts: { flokkur: LETTER[l], fylgi: b, adur: a, pollster: last.pollster, dags: last.date }, url: '/kannanir/',
            title: `${LETTER[l]} ${b >= 5 ? 'yfir' : 'undir'} 5%-þröskuldinn: ${pct1(b)}%`,
            text: `${LETTER[l]} mælist með ${pct1(b)}% hjá ${last.pollster} (${last.date}) og fer þar með ${b >= 5 ? 'yfir' : 'undir'} 5%-þröskuld jöfnunarsæta — var ${pct1(a)}% í könnuninni á undan.` });
        }
      }
      const lead = (p) => Object.entries(p.v).filter(([l]) => LETTER[l]).sort((x, y) => y[1] - x[1])[0];
      const ln = lead(last), lp = lead(prev);
      if (ln && lp && ln[0] !== lp[0]) {
        ev.push({ id: `leidtogi-${last.date}-${ln[0]}`, type: 'fylgi', facts: { nyr: LETTER[ln[0]], fylgi: ln[1], adur: LETTER[lp[0]], pollster: last.pollster, dags: last.date }, url: '/kannanir/',
          title: `${LETTER[ln[0]]} orðinn stærsti flokkurinn í könnunum: ${pct1(ln[1])}%`,
          text: `${LETTER[ln[0]]} mælist stærsti flokkur landsins með ${pct1(ln[1])}% hjá ${last.pollster} (${last.date}) og tekur toppsætið af ${LETTER[lp[0]]}.` });
      }
    }
  }

  // ── Fjarvistayfirlit þingsins (mánaðarlega) ──────────────────
  if (atk && atk.mal) {
    const total = Object.keys(atk.mal).length;
    if (total >= 60) {
      const ym = TODAY.slice(0, 7);
      const cnt = {};
      Object.values(atk.mal).forEach((v) => (v.fjar || []).forEach((n) => { cnt[n] = (cnt[n] || 0) + 1; }));
      const top = Object.entries(cnt).filter(([n]) => flokkurAf[n]).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([n, c]) => ({ nafn: n, flokkur: flokkurAf[n], fjoldi: c, hlutfall: Math.round(c / total * 100) }));
      if (top.length && top[0].hlutfall >= 25) {
        ev.push({ id: `fjarvist-${atk.thing}-${ym}`, type: 'fjarvist', facts: { thing: atk.thing, timabil: ym, atkvaedagreidslur: total, listi: top }, url: '/althingi/',
          title: `${top[0].nafn} greiddi ekki atkvæði í ${top[0].hlutfall}% atkvæðagreiðslna þingsins`,
          text: `Á yfirstandandi þingi (nr. ${atk.thing}) hefur ${top[0].nafn} (${top[0].flokkur}) ekki greitt atkvæði í ${top[0].fjoldi} af ${total} atkvæðagreiðslum (${top[0].hlutfall}%). Næst koma ${top[1] ? top[1].nafn + ' (' + top[1].hlutfall + '%)' : ''}${top[2] ? ' og ' + top[2].nafn + ' (' + top[2].hlutfall + '%)' : ''}. Fjarvistir geta átt eðlilegar skýringar, svo sem veikindi, fæðingarorlof eða störf erlendis.` });
      }
    }
  }

  // ── Ræðukóngur vikunnar (diff á ræðugreiningu) ───────────────
  const ra = J('raedugreining.json');
  if (ra && ra.mp) {
    const nafnAf = {}; mps.forEach((m) => { nafnAf[m.id] = m.nafn; });
    const cur = {}; Object.entries(ra.mp).forEach(([id, d]) => { cur[id] = Math.round(d.min || 0); });
    const snap = state.raedur;
    if (snap && snap.thing === ra.thing && snap.date && (Date.parse(TODAY) - Date.parse(snap.date)) >= 6 * 86400000) {
      const deltas = Object.entries(cur).map(([id, m]) => ({ id, nafn: nafnAf[id], min: m - (snap.min[id] || 0) })).filter((x) => x.nafn && x.min > 0).sort((a, b) => b.min - a.min);
      if (deltas.length && deltas[0].min >= 60) {
        const t = deltas.slice(0, 3);
        ev.push({ id: `raedur-${TODAY}`, type: 'raedur', facts: { fra: snap.date, til: TODAY, listi: t.map((x) => ({ nafn: x.nafn, minutur: x.min })) }, url: '/althingi/',
          title: `${t[0].nafn} talaði mest á Alþingi: ${kr(t[0].min)} mínútur á viku`,
          text: `${t[0].nafn} átti flestar ræðumínútur á Alþingi frá ${snap.date} til ${TODAY}: ${kr(t[0].min)} mínútur.${t[1] ? ` Næst komu ${t[1].nafn} (${kr(t[1].min)} mín)${t[2] ? ' og ' + t[2].nafn + ' (' + kr(t[2].min) + ' mín)' : ''}.` : ''}` });
      }
      state.raedur = { thing: ra.thing, date: TODAY, min: cur };
    } else if (!snap || snap.thing !== ra.thing) {
      state.raedur = { thing: ra.thing, date: TODAY, min: cur };
    }
  }

  // ── Markaðir: dagshreyfarar ≥4% + met í gagnaröð ─────────────
  const mk = J('markadir.json');
  if (mk && Array.isArray(mk.stocks)) {
    const rec = state.markRec || {}, recInit = !!state.markRec;   // markRec = síðasta TILKYNNTA met per bréfi
    const cand = [];
    for (const s of mk.stocks) {
      const h = (s.hist || []).filter((x) => x > 0);
      const sp = downsample((s.hist || []).concat([s.price]), 30);
      if (typeof s.chgPct === 'number' && Math.abs(s.chgPct) >= 4) {
        cand.push({ w: Math.abs(s.chgPct), e: { id: `mark-${TODAY}-${slug(s.sym)}`, type: 'mark', spark: sp, facts: { felag: s.name, breyting: +s.chgPct.toFixed(1), verd: s.price }, url: '/markadir/',
          title: `${s.name} ${s.chgPct > 0 ? 'hækkar' : 'lækkar'} um ${pct1(Math.abs(s.chgPct))}% í Kauphöllinni`,
          text: `Gengi ${s.name} ${s.chgPct > 0 ? 'hækkaði' : 'lækkaði'} um ${pct1(Math.abs(s.chgPct))}% í dag og stendur í ${String(s.price).replace('.', ',')}.` } });
      } else if (h.length >= 30) {
        // ENDURTEKNINGARVÖRN: met-frétt kviknar AÐEINS þegar NÝTT met er sett — ekki daglega meðan bréfið
        // situr í hámarki. rec[sym] geymir síðasta tilkynnta hámark/lágmark. Fyrsta keyrsla er þögul (recInit=false).
        const r = rec[s.sym] || {};
        if (recInit && s.price >= Math.max(...h) && s.price > (typeof r.hi === 'number' ? r.hi : 0)) {
          cand.push({ w: 3, e: { id: `markmet-${TODAY}-${slug(s.sym)}-ha`, type: 'mark', spark: sp, facts: { felag: s.name, verd: s.price, met: 'hæsta', dagar: h.length }, url: '/markadir/',
            title: `${s.name} í hæsta gildi í gagnaröð Karp`,
            text: `Gengi ${s.name} stendur í ${String(s.price).replace('.', ',')} — það hæsta í gagnaröð Karp (${h.length} viðskiptadagar).` } });
        } else if (recInit && s.price <= Math.min(...h) && s.price < (typeof r.lo === 'number' ? r.lo : Infinity)) {
          cand.push({ w: 3, e: { id: `markmet-${TODAY}-${slug(s.sym)}-la`, type: 'mark', spark: sp, facts: { felag: s.name, verd: s.price, met: 'lægsta', dagar: h.length }, url: '/markadir/',
            title: `${s.name} í lægsta gildi í gagnaröð Karp`,
            text: `Gengi ${s.name} stendur í ${String(s.price).replace('.', ',')} — það lægsta í gagnaröð Karp (${h.length} viðskiptadagar).` } });
        }
        rec[s.sym] = { hi: Math.max(typeof r.hi === 'number' ? r.hi : 0, s.price), lo: Math.min(typeof r.lo === 'number' ? r.lo : Infinity, s.price) };
      }
    }
    state.markRec = rec;
    cand.sort((a, b) => b.w - a.w).slice(0, 2).forEach((c) => ev.push(c.e));   // þak 2 markaðsfréttir/dag
  }

  // ── Umfjöllunarviðsnúningur (diff á sentiment-vísitölu) ──────
  const se = J('sentiment.json');
  if (se && se.companies) {
    if (state.sent) {
      const cand = [];
      for (const [nafn, d] of Object.entries(se.companies)) {
        const prev = state.sent[nafn];
        if (typeof prev !== 'number' || typeof d.idx !== 'number' || (d.n || 0) < 5) continue;
        const delta = d.idx - prev;
        if (Math.abs(delta) >= 40) cand.push({ w: Math.abs(delta), nafn, fra: prev, i: d.idx, n: d.n });
      }
      cand.sort((a, b) => b.w - a.w).slice(0, 3).forEach((c) => {
        ev.push({ id: `sent-${TODAY}-${slug(c.nafn)}`, type: 'sent', facts: { fyrirtaeki: c.nafn, fra: c.fra, i: c.i, frettir: c.n, kvardi: '-100 til +100' }, url: '/frettir/',
          title: `Tónn umfjöllunar um ${c.nafn} ${c.i > c.fra ? 'batnar' : 'versnar'} skarpt`,
          text: `Tónvísitala Karp fyrir ${c.nafn} fór úr ${String(c.fra).replace('.', ',')} í ${String(c.i).replace('.', ',')} (kvarði -100 til +100) miðað við ${c.n} nýlegar fréttir í fjölmiðlavöktun Karp.` });
      });
    }
    state.sent = {}; Object.entries(se.companies).forEach(([n, d]) => { if (typeof d.idx === 'number') state.sent[n] = d.idx; });
  }

  // ── Glæpir: árssveiflur landshluta ≥15% ──────────────────────
  const gl = J('glaepir.json');
  if (gl && gl.byRegion) {
    for (const [reg, d] of Object.entries(gl.byRegion)) {
      const s = d.series || []; if (s.length < 2) continue;
      const a = s[s.length - 1], b = s[s.length - 2];
      if (!b.v || b.v < 1) continue;
      const chg = (a.v - b.v) / b.v * 100;
      if (Math.abs(chg) >= 15) {
        ev.push({ id: `glaepir-${a.y}-${slug(reg)}`, type: 'glaepir', facts: { landshluti: reg, ar: a.y, fyrraAr: b.y, gildi: a.v, fyrra: b.v, breyting: +chg.toFixed(1), eining: gl.unit || 'hegningarlagabrot á 1.000 íbúa' }, url: '/afbrot/',
          title: `Hegningarlagabrotum ${chg < 0 ? 'fækkaði' : 'fjölgaði'} um ${pct1(Math.abs(chg))}% — ${reg}`,
          text: `Hegningarlagabrotum á hverja 1.000 íbúa ${chg < 0 ? 'fækkaði' : 'fjölgaði'} um ${pct1(Math.abs(chg))}% á landshlutanum ${reg} milli ${b.y} og ${a.y}: úr ${String(b.v).replace('.', ',')} í ${String(a.v).replace('.', ',')} samkvæmt tölum ríkislögreglustjóra.` });
      }
    }
  }

  // ── Atvinnuleysismet (≥12 mánaða met, annars þögn) ───────────
  const at = J('atvinnuleysi.json');
  if (at && Array.isArray(at.monthly) && at.monthly.length > 24) {
    const m = at.monthly, last = m[m.length - 1];
    let lowN = 0; for (let i = m.length - 2; i >= 0 && m[i].v > last.v; i--) lowN++;
    let hiN = 0; for (let i = m.length - 2; i >= 0 && m[i].v < last.v; i--) hiN++;
    if (lowN >= 12) ev.push({ id: `atv-${last.t}-lag`, type: 'atv', spark: downsample(m.map((x) => x.v), 24), facts: { gildi: last.v, timabil: last.t, manudir: lowN }, url: '/atvinnuleysi/',
      title: `Atvinnuleysi ekki lægra í ${lowN} mánuði: ${pct1(last.v)}%`,
      text: `Skráð atvinnuleysi mældist ${pct1(last.v)}% í ${manIS(last.t.replace('M', '-'))} — það lægsta í ${lowN} mánuði samkvæmt Vinnumálastofnun.` });
    if (hiN >= 12) ev.push({ id: `atv-${last.t}-ha`, type: 'atv', spark: downsample(m.map((x) => x.v), 24), facts: { gildi: last.v, timabil: last.t, manudir: hiN }, url: '/atvinnuleysi/',
      title: `Atvinnuleysi ekki hærra í ${hiN} mánuði: ${pct1(last.v)}%`,
      text: `Skráð atvinnuleysi mældist ${pct1(last.v)}% í ${manIS(last.t.replace('M', '-'))} — það hæsta í ${hiN} mánuði samkvæmt Vinnumálastofnun.` });
  }

  // ── Persónu-diffar: ráðherrar, bæjarstjórar, sendiherrar, ívilnanir ──
  if (Array.isArray(cab)) {
    const cur = {}; cab.forEach((c) => { cur[c.id] = { nafn: c.nafn, emb: (c.emb || [])[0] || '', flokkur: c.flok || c.flokur || '' }; });
    if (state.cabinet) {
      for (const [id, c] of Object.entries(cur)) {
        const p = state.cabinet[id];
        if (!p || p.emb !== c.emb) {
          ev.push({ id: `radherra-${TODAY}-${slug(c.nafn)}`, type: 'radherra', facts: { nafn: c.nafn, embaetti: c.emb, flokkur: c.flokkur, adur: p ? p.emb : null }, url: '/althingi/',
            title: `${c.nafn} tekur við sem ${c.emb}`,
            text: `${c.nafn} (${c.flokkur}) er ${c.emb} samkvæmt uppfærðri ráðherraskrá Alþingis.${p && p.emb ? ` Var áður ${p.emb}.` : ''}` });
        }
      }
    }
    state.cabinet = cur;
  }
  const st = J('sveitarstjorar.json');
  if (st && st.byName) {
    const cur = {}; Object.entries(st.byName).forEach(([muni, d]) => { if (d.stjori) cur[muni] = { stjori: d.stjori, titill: d.stjoriTitill || 'sveitarstjóri' }; });
    if (state.stjorar) {
      for (const [muni, c] of Object.entries(cur)) {
        const p = state.stjorar[muni];
        if (p && p.stjori !== c.stjori) {
          ev.push({ id: `baejarstjori-${slug(muni)}-${slug(c.stjori)}`, type: 'baejarstjori', facts: { sveitarfelag: muni, nafn: c.stjori, titill: c.titill, fyrri: p.stjori }, url: '/sveitarfelog/',
            title: `${c.stjori} nýr ${c.titill} — ${muni}`,
            text: `${c.stjori} er ${c.titill} sveitarfélagsins ${muni} samkvæmt uppfærðri skrá Sambands íslenskra sveitarfélaga. Fyrri ${c.titill} var ${p.stjori}.` });
        }
      }
    }
    state.stjorar = cur;
  }
  const sr = J('sendirad.json');
  if (sr && Array.isArray(sr.abroad)) {
    const cur = {}; sr.abroad.forEach((s) => { if (s.sendiherra) cur[s.is] = s.sendiherra; });
    if (state.sendirad) {
      for (const [land, nafn] of Object.entries(cur)) {
        if (state.sendirad[land] && state.sendirad[land] !== nafn) {
          ev.push({ id: `sendiherra-${slug(land)}-${slug(nafn)}`, type: 'sendiherra', facts: { land, nafn, fyrri: state.sendirad[land] }, url: '/sendirad/',
            title: `${nafn} nýr sendiherra Íslands — ${land}`,
            text: `${nafn} er sendiherra Íslands gagnvart ${land} samkvæmt uppfærðri sendiráðaskrá utanríkisráðuneytisins. Fyrri sendiherra var ${state.sendirad[land]}.` });
        }
      }
    }
    state.sendirad = cur;
  }
  const iv = J('ivilnanir.json');
  if (Array.isArray(iv)) {
    const keys = iv.map((x) => slug(x.nafn) + '|' + x.fra);
    if (Array.isArray(state.ivilnanir)) {
      iv.forEach((x, i) => {
        if (!state.ivilnanir.includes(keys[i])) {
          ev.push({ id: `ivilnun-${keys[i].replace('|', '-')}`, type: 'ivilnun', facts: { nafn: x.nafn, lysing: x.lysing, umfang: x.umfang, raduneyti: x.raduneyti, fra: x.fra }, url: '/ivilnanir/',
            title: `Ný ríkisívilnun: ${x.nafn}`,
            text: `${x.nafn} hefur fengið ívilnun frá ríkinu (${x.raduneyti || 'ráðuneyti óskráð'}): ${String(x.lysing || '').slice(0, 140)}${x.umfang ? ` Umfang: ${x.umfang}.` : ''}` });
        }
      });
    }
    state.ivilnanir = keys;
  }

  // ── Stjórnarmeirihlutinn undir + einn flokkur gegn öllum ─────
  if (Array.isArray(bills) && Array.isArray(cab)) {
    const govL = new Set(cab.map((c) => NAME2LETTER[c.flokur]).filter(Boolean));
    const FORM2 = /lengd þingfundar|afbrigði|dagskrá|frestun.*fund|fundarhlé/i;
    let einnCount = 0;
    for (const b of bills) {
      if (!b.P || FORM2.test(b.titill || '')) continue;
      const govJa = [...govL].reduce((a, l) => a + ((b.P[l] || [0, 0])[0]), 0);
      const govNei = [...govL].reduce((a, l) => a + ((b.P[l] || [0, 0])[1]), 0);
      if (govJa > govNei && govJa >= 10 && b.nei > b.ja) {
        ev.push({ id: `stjorntap-${atk ? atk.thing : ''}-${b.nr}`, type: 'stjorntap', facts: { titill: b.titill, nr: b.nr, ja: b.ja, nei: b.nei, stjornJa: govJa, stjornNei: govNei }, url: `/thingmal/?nr=${b.nr}`,
          title: `Stjórnarmeirihlutinn undir í atkvæðagreiðslu um „${String(b.titill).slice(0, 50)}“`,
          text: `„${b.titill}“ var fellt með ${b.nei} atkvæðum gegn ${b.ja} þótt meirihluti stjórnarþingmanna (${govJa}) styddi málið.` });
      }
      // einn flokkur einn gegn öllum (einróma nei, allir aðrir án nei)
      const parties = Object.entries(b.P).filter(([l, v]) => LETTER[l] && v[0] + v[1] >= 2);
      const neiParties = parties.filter(([, v]) => v[1] >= 2 && v[0] === 0);
      const jaParties = parties.filter(([, v]) => v[1] === 0 && v[0] >= 1);
      if (einnCount < 2 && neiParties.length === 1 && jaParties.length >= 4 && b.ja >= 40) {
        const [l, v] = neiParties[0];
        einnCount++;
        ev.push({ id: `einn-${atk ? atk.thing : ''}-${b.nr}-${l}`, type: 'einn', facts: { flokkur: LETTER[l], nei: v[1], titill: b.titill, nr: b.nr, ja: b.ja, neiAlls: b.nei }, url: `/thingmal/?nr=${b.nr}`,
          title: `${LETTER[l]} einn gegn öllum um „${String(b.titill).slice(0, 55)}“`,
          text: `Allir ${v[1]} viðstaddir þingmenn ${LETTER[l]} greiddu atkvæði gegn „${b.titill}“ á meðan enginn þingmaður annarra flokka gerði það. Málið var samþykkt með ${b.ja} atkvæðum gegn ${b.nei}.` });
      }
    }
  }

  // ── 🏆 Útboðsniðurstöður: hver vann (TED awards, LOTA 30) ────
  // Silent-init: fyrsta keyrsla merkir allt séð — annars 259 fréttir dag 1.
  const ur = J('utbod_urslit.json');
  if (ur && Array.isArray(ur.awards)) {
    if (state.urslitInit) {
      const nyjar = ur.awards.filter((a) => !state.urslitInit.includes(a.nr));
      nyjar.sort((a, b) => (b.cur === 'ISK' ? b.value || 0 : 0) - (a.cur === 'ISK' ? a.value || 0 : 0));
      for (const a of nyjar.slice(0, 3)) {
        const w1 = a.winners[0];
        const fleiri = a.winners.length > 1;
        const upph = a.cur === 'ISK' && a.value ? kr(a.value) + ' kr.' : null;
        const titill = a.t.replace(/^Iceland – /, '');
        ev.push({ id: `urslit-${a.nr}`, type: 'urslit', facts: { titill, kaupandi: a.buyer, sigurvegarar: a.winners, verdmaeti: upph ? a.value : null, dags: a.d, tedNr: a.nr }, url: '/utbod/',
          title: fleiri ? `${w1} og ${a.winners.length - 1} til viðbótar valin í „${titill.slice(0, 45)}“` : `${w1} vann útboð${upph ? ' upp á ' + upph : ''}: ${titill.slice(0, 50)}`,
          text: `${fleiri ? a.winners.slice(0, 4).join(', ') + (a.winners.length > 4 ? ' o.fl.' : '') + ' voru valin' : w1 + ' var valið'} í útboðinu „${titill}“ hjá ${a.buyer}${upph ? `. Samningsverðmæti: ${upph}` : ''} samkvæmt samningstilkynningu í TED (${a.d}).` });
      }
    }
    state.urslitInit = ur.awards.map((a) => a.nr).slice(0, 400);
  }
  // Tilboðsopnanir (Landsvirkjun) — lægstbjóðandi er frétt fyrir verktaka
  if (ur && Array.isArray(ur.opnanir)) {
    if (state.opnanirInit) {
      for (const o of ur.opnanir.filter((x) => !state.opnanirInit.includes(slug(x.t))).slice(0, 2)) {
        ev.push({ id: `opnun-lv-${slug(o.t)}`, type: 'urslit', facts: { titill: o.t, dags: o.d, tilbod: o.bids.length, laegst: o.laegst.n, upphaed: o.laegst.isk }, url: '/utbod/',
          title: `Tilboð opnuð hjá Landsvirkjun: lægst bauð ${o.laegst.n}`,
          text: `${o.bids.length} tilboð bárust í útboð Landsvirkjunar „${o.t}“${o.d ? ' (opnuð ' + o.d + ')' : ''}. Lægsta boð átti ${o.laegst.n}: ${kr(o.laegst.isk)} kr. án VSK. Lægsta boð er ekki sjálfkrafa það sem verður valið.` });
      }
    }
    state.opnanirInit = ur.opnanir.map((x) => slug(x.t)).slice(0, 100);
  }

  // ══ LOTA 31: fjölbreytni — ný gagnaefni ═════════════════════════
  const RECENT = (d, days = 30) => d && d >= new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  // ── Gjaldþrot / skiptabeiðnir (Lögbirtingablaðið, aðeins lögaðilar, nýlegt) ──
  const lb = J('logbirting.json');
  if (lb && lb.byKt) {
    const nyleg = [];
    for (const [kt, o] of Object.entries(lb.byKt)) {
      for (const n of (o.notices || [])) {
        if ((n.type === 'gjaldthrot_beidni' || n.type === 'skiptabeidni') && RECENT(n.date, 30)) nyleg.push({ kt, nafn: o.name, ...n });
      }
    }
    nyleg.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3).forEach((n) => {
      const heiti = (lb.typeLabels || {})[n.type] || n.type;
      ev.push({ id: `gjaldthrot-${n.ref || n.date}-${n.kt}`, type: 'gjaldthrot', facts: { felag: n.nafn, tegund: heiti, domstoll: n.court || null, dags: n.date, fyrirtaka: n.when || null }, url: '/logbirting/',
        title: `${heiti}: ${n.nafn}`,
        text: `${heiti} vegna ${n.nafn} birtist í Lögbirtingablaðinu ${n.date}${n.court ? ' (' + n.court + ')' : ''}${n.when ? `. Fyrirtaka málsins er ${n.when}` : ''}.` });
    });
  }

  // ── Dómar Hæstaréttar/Landsréttar (AI-einfölduð reifun liggur fyrir í domar_ai) ──
  const dm = J('domar_ai.json');
  if (dm) {
    Object.entries(dm).map(([k, v]) => ({ k, ...v })).filter((x) => x.einfalt && RECENT(x.d, 30))
      .sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 3).forEach((x) => {
        const dom = x.k.startsWith('hr') ? 'Hæstiréttur' : x.k.startsWith('lr') ? 'Landsréttur' : 'Dómstóll';
        const malsnr = x.k.replace(/^[a-z]+:/, '');
        ev.push({ id: `domur-${slug(x.k)}`, type: 'domur', facts: { domstoll: dom, malsnr, svid: x.svid || null, reifun: x.einfalt, dags: x.d }, url: '/domar/',
          title: `${dom} í máli nr. ${malsnr}${x.svid ? ' — ' + x.svid : ''}`,
          text: x.einfalt });
      });
  }

  // ── Nýir styrkir (kvikmynda-/vísinda-/atvinnusjóðir) — state-diff, þögul frumstilling ──
  const sty = J('styrkir.json');
  if (sty && Array.isArray(sty.styrkir)) {
    const key = (s) => `${s.slug}-${s.ar}-${s.upphaed}`;
    if (Array.isArray(state.styrkirSeen)) {
      const seen = new Set(state.styrkirSeen);
      sty.styrkir.filter((s) => s.upphaed >= 15000000 && !seen.has(key(s)))
        .sort((a, b) => b.upphaed - a.upphaed).slice(0, 3).forEach((s) => {
          ev.push({ id: `styrkur-${s.slug}-${s.ar}`, type: 'styrkur', facts: { thegi: s.nafn, sjodur: s.sjodur, flokkur: s.flokkur || null, upphaed: s.upphaed, ar: s.ar, verkefni: s.verkefni || null }, url: '/styrkir/',
            title: `${s.nafn} fær ${kr(s.upphaed)} kr. styrk úr ${s.sjodur}`,
            text: `${s.nafn} hlýtur ${kr(s.upphaed)} kr. styrk úr ${s.sjodur}${s.flokkur ? ' (' + s.flokkur + ')' : ''}${s.verkefni ? ` fyrir verkefnið „${s.verkefni}“` : ''}${s.ar ? `, úthlutað ${s.ar}` : ''}.` });
        });
    }
    state.styrkirSeen = sty.styrkir.map(key).slice(0, 4000);
  }

  // ── Seðlabankinn: meginvextir (breyting) + verðbólga (ný mæling) ──
  const sb = J('sedlabanki.json');
  if (sb && sb.datasets) {
    const meg = ((sb.datasets.vextir_si || {}).series || []).find((s) => /megin/i.test(s.name));
    if (meg && Array.isArray(meg.points) && meg.points.length >= 2) {
      const [dNu, vNu] = meg.points[meg.points.length - 1], vFyrri = meg.points[meg.points.length - 2][1];
      if (typeof vNu === 'number' && typeof vFyrri === 'number' && vNu !== vFyrri) {
        ev.push({ id: `vextir-${dNu}`, type: 'vextir', spark: downsample(meg.points.map((p) => p[1]), 24), facts: { nyir: vNu, fyrri: vFyrri, breyting: +(vNu - vFyrri).toFixed(2), dags: dNu }, url: '/vextir/',
          title: `Seðlabankinn ${vNu > vFyrri ? 'hækkar' : 'lækkar'} meginvexti í ${pct1(vNu)}%`,
          text: `Meginvextir Seðlabanka Íslands eru nú ${pct1(vNu)}% og ${vNu > vFyrri ? 'hækkuðu' : 'lækkuðu'} úr ${pct1(vFyrri)}% (${dNu}).` });
      }
    }
    const vb = ((sb.datasets.verdbolga || {}).series || []).find((s) => s.name === 'Vísitala neysluverðs' && (s.points || []).some((p) => typeof p[1] === 'number' && p[1] < 50));
    if (vb && Array.isArray(vb.points) && vb.points.length >= 2) {
      const [dNu, vNu] = vb.points[vb.points.length - 1], vF = vb.points[vb.points.length - 2][1];
      if (typeof vNu === 'number' && typeof vF === 'number') {
        ev.push({ id: `verdbolga-${dNu}`, type: 'verdbolga', spark: downsample(vb.points.map((p) => p[1]), 24), facts: { verdbolga: vNu, fyrri: vF, stefna: vNu > vF ? 'jókst' : vNu < vF ? 'minnkaði' : 'óbreytt', dags: dNu }, url: '/verdlag/',
          title: `Verðbólga ${vNu > vF ? 'eykst' : vNu < vF ? 'hjaðnar' : 'stendur í stað'}: ${pct1(vNu)}%`,
          text: `Ársverðbólga mældist ${pct1(vNu)}% í ${manIS(dNu.slice(0, 7))} samkvæmt vísitölu neysluverðs — ${vNu > vF ? 'hækkun' : vNu < vF ? 'lækkun' : 'óbreytt'} frá ${pct1(vF)}% mánuðinn á undan.` });
      }
    }
  }

  // ── Lyfjaskortur á nauðsynlegum lyfjum (Sérlyfjaskrá) — state-diff, þögul frumstilling ──
  const lyf = J('lyf.json');
  if (lyf && Array.isArray(lyf.lyf)) {
    const inShort = lyf.lyf.filter((x) => x.shortage);
    if (Array.isArray(state.lyfSeen)) {
      const seen = new Set(state.lyfSeen);
      inShort.filter((x) => x.essential && !seen.has(x.slug)).slice(0, 2).forEach((x) => {
        const efni = (x.ingredients || []).join(', ') || ((x.atc || {}).name) || '';
        ev.push({ id: `lyfskortur-${x.slug}`, type: 'lyf', facts: { lyf: x.name, virkt: efni || null, styrkur: x.strength || null, form: x.form || null, markadsleyfishafi: x.holder || null }, url: '/lyf/',
          title: `Lyfjaskortur: ${x.name}${x.strength ? ' ' + x.strength : ''}`,
          text: `Skráður er skortur á lyfinu ${x.name}${x.strength ? ' (' + x.strength + ')' : ''}${efni ? `, virkt efni ${efni}` : ''} samkvæmt Sérlyfjaskrá Lyfjastofnunar. Lyfið er skráð sem nauðsynlegt lyf.` });
      });
    }
    state.lyfSeen = inShort.map((x) => x.slug).slice(0, 4000);
  }

  // ── Ný vörumerki íslenskra aðila (Hugverkastofan) ──
  const vm = J('vorumerki_nyskrad.json');
  if (vm && vm.byKt) {
    const nyleg = [];
    for (const [kt, list] of Object.entries(vm.byKt)) {
      for (const t of (list || [])) { if (t.eigandi && t.titill && String(kt).replace(/\D/g, '').length === 10) nyleg.push({ kt, ...t }); }
    }
    const dnum = (d) => String(d || '').split('.').reverse().join('-');
    nyleg.sort((a, b) => dnum(b.skrad).localeCompare(dnum(a.skrad))).slice(0, 2).forEach((t) => {
      ev.push({ id: `vorumerki-${t.id}`, type: 'vorumerki', facts: { merki: t.titill, tegund: t.tegund || null, eigandi: t.eigandi, flokkar: t.flokkar || null, skrad: t.skrad || null }, url: '/vorumerki/',
        title: `Nýtt vörumerki skráð: ${t.titill}`,
        text: `${t.eigandi} hefur skráð vörumerkið „${t.titill}“${t.tegund ? ' (' + t.tegund + ')' : ''} hjá Hugverkastofunni${(t.flokkar || []).length ? ', í vöru-/þjónustuflokki ' + t.flokkar.join(', ') : ''}.` });
    });
  }

  return ev;
}

// ── AI-skrif (gated á lykil; grundað eingöngu í staðreyndunum) ─
async function aiWrite(events) {
  if (!process.env.ANTHROPIC_API_KEY || !events.length) return 0;
  let Anthropic;
  try { const p = require('@anthropic-ai/sdk'); Anthropic = p.Anthropic || p.default || p; }
  catch (e) { console.log('• @anthropic-ai/sdk ekki til — sniðmátstextar notaðir.'); return 0; }
  const client = new Anthropic();
  const batch = events.slice(0, 16); // kostnaðarþak per keyrslu (ein köllun/dag)
  const spec = batch.map((e) => ({ id: e.id, type: e.type, facts: e.facts }));
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 5000,
      system: 'Þú ert fréttavél Karp (karp.is). Þú skrifar hlutlausar fréttir á íslensku EINGÖNGU úr staðreyndunum í facts-hlutnum. LENGD RÆÐST AF EFNI: 1–2 setningar fyrir einfaldar tölur (markaðshreyfingar, vísitölur, vextir); 3–6 setningar með samhengi fyrir efnismeiri mál (þing, dómar, gjaldþrot, útboð, styrkir) — nýttu þá ÖLL viðeigandi atriði úr facts (dagsetningar, dómstól, upphæðir, aðila, samanburð). STRANGT BANN: engar tölur, nöfn eða fullyrðingar sem ekki standa í facts; engar orsakaskýringar eða spádómar; engin gildishlaðin orð; engin upphrópunarmerki. Hlutlaus, skýr fréttatónn. Skilaðu AÐEINS JSON-fylki: [{"id":"...","title":"...","text":"..."}] — title hámark 90 stafir, text hámark 800 stafir.',
      messages: [{ role: 'user', content: JSON.stringify(spec) }],
    });
    const raw = (msg.content || []).map((c) => c.text || '').join('');
    const arr = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
    let n = 0;
    for (const w of arr) {
      const e = batch.find((x) => x.id === w.id);
      if (e && w.text && w.title) { e.title = String(w.title).slice(0, 120); e.text = String(w.text).slice(0, 900); e.ai = true; n++; }
    }
    return n;
  } catch (e) { console.log('• AI-skrif brugðust (' + String(e).slice(0, 80) + ') — sniðmátstextar notaðir.'); return 0; }
}

// ── RSS ───────────────────────────────────────────────────────
const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function rss(items) {
  const it = items.slice(0, 40).map((x) => `  <item>
    <title>${xesc(x.title)}</title>
    <link>https://karp.is/frettavel/#${xesc(x.id)}</link>
    <guid isPermaLink="false">${xesc(x.id)}</guid>
    <pubDate>${new Date(x.date + 'T08:00:00Z').toUTCString()}</pubDate>
    <description>${xesc(x.text)} (Vélskrifuð frétt úr opinberum gögnum — heimild: karp.is${xesc(x.url)})</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Fréttavél Karp</title>
  <link>https://karp.is/frettavel/</link>
  <description>Sjálfvirkar fréttir skrifaðar úr opinberum gögnum: Alþingi, kannanir, fasteignir, ríkisgreiðslur og útboð. Hver frétt tengir á frumgögnin.</description>
  <language>is</language>
${it}
</channel></rss>`;
}

// ── Aðal ──────────────────────────────────────────────────────
async function main() {
  const state = J('frettavel_state.json') || {};
  const events = detect(state);
  fs.writeFileSync(G('frettavel_state.json'), JSON.stringify(state));
  const seen = J('frettavel_seen.json') || {};
  const fresh = events.filter((e) => !seen[e.id]);
  // JAFNVÆGI: hámark 3 fréttir af hverri tegund á dag svo engin ein uppspretta (t.d. markaðir) drottni.
  // Umfram-fréttir eru EKKI merktar séðar → birtast næstu daga þegar rúm er (dreifir fjölbreytni yfir tíma).
  const perType = {};
  const published = fresh.filter((e) => { perType[e.type] = (perType[e.type] || 0) + 1; return perType[e.type] <= 3; });
  console.log('Atburðir fundnir:', events.length, '· nýir:', fresh.length, '· birtir:', published.length, '·', published.map((e) => e.type + ':' + e.id.slice(0, 34)).join(' | ') || '—');

  const aiN = await aiWrite(published);
  console.log('AI-skrifaðar:', aiN, 'af', Math.min(published.length, 16), process.env.ANTHROPIC_API_KEY ? '' : '(enginn lykill — sniðmát)');

  const old = (J('frettavel.json') || {}).items || [];
  const items = published.map((e) => ({ id: e.id, date: TODAY, type: e.type, title: e.title, text: e.text, url: e.url, ai: !!e.ai, spark: (e.spark && e.spark.length >= 4) ? e.spark : undefined }))
    .concat(old.filter((o) => !published.some((f) => f.id === o.id)))
    .slice(0, 120);

  published.forEach((e) => { seen[e.id] = TODAY; });
  // seen-skráin vex ekki endalaust: klippum færslur sem eru horfnar úr items og eldri en 180 daga
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  for (const [id, d] of Object.entries(seen)) { if (d < cutoff && !items.some((x) => x.id === id)) delete seen[id]; }

  // Þak per tegund í birtum straumi (8) svo eldri bylgja (t.d. uppsafnaðar markaðsfréttir) yfirtaki ekki
  // listann. items eru nýjast-fyrst → heldur 8 NÝJUSTU af hverri tegund, eldri detta af.
  const tcap = {}; const feed = items.filter((it) => { tcap[it.type] = (tcap[it.type] || 0) + 1; return tcap[it.type] <= 8; });
  const out = { updated: new Date().toISOString(), n: feed.length, items: feed };
  fs.writeFileSync(G('frettavel.json'), JSON.stringify(out));
  fs.writeFileSync(G('frettavel_seen.json'), JSON.stringify(seen));
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'frettavel.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(__dirname, '..', 'web', 'public', 'frettavel.xml'), rss(feed));
  console.log('Skrifað: frettavel.json (' + items.length + ' fréttir) + frettavel.xml (RSS)');
}
main().catch((e) => { console.error(e); process.exit(1); });
