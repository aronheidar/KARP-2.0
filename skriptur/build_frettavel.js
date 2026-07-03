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
      ev.push({ id: `fylgi-${last.date}-${st}-${met}`, type: 'fylgi', facts: { flokkur: nafn, fylgi: nu, met, pollster: last.pollster, dags: last.date, kannanir: serie.length, kosningar2024: kosn ?? null }, url: '/kannanir/',
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
        ev.push({ id: `fast-${s.m}`, type: 'fast', facts: { manudur: s.m, m2: s.hbsv.m2, n: s.hbsv.n, fyrraMet: prevMax }, url: '/fasteignir/',
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
    const cand = [];
    for (const s of mk.stocks) {
      const h = (s.hist || []).filter((x) => x > 0);
      if (typeof s.chgPct === 'number' && Math.abs(s.chgPct) >= 4) {
        cand.push({ w: Math.abs(s.chgPct), e: { id: `mark-${TODAY}-${slug(s.sym)}`, type: 'mark', facts: { felag: s.name, breyting: +s.chgPct.toFixed(1), verd: s.price }, url: '/markadir/',
          title: `${s.name} ${s.chgPct > 0 ? 'hækkar' : 'lækkar'} um ${pct1(Math.abs(s.chgPct))}% í Kauphöllinni`,
          text: `Gengi ${s.name} ${s.chgPct > 0 ? 'hækkaði' : 'lækkaði'} um ${pct1(Math.abs(s.chgPct))}% í dag og stendur í ${String(s.price).replace('.', ',')}.` } });
      } else if (h.length >= 30 && (s.price >= Math.max(...h) || s.price <= Math.min(...h))) {
        const ha = s.price >= Math.max(...h);
        cand.push({ w: 2, e: { id: `markmet-${TODAY}-${slug(s.sym)}-${ha ? 'ha' : 'la'}`, type: 'mark', facts: { felag: s.name, verd: s.price, met: ha ? 'hæsta' : 'lægsta', dagar: h.length }, url: '/markadir/',
          title: `${s.name} í ${ha ? 'hæsta' : 'lægsta'} gildi í gagnaröð Karp`,
          text: `Gengi ${s.name} stendur í ${String(s.price).replace('.', ',')} — það ${ha ? 'hæsta' : 'lægsta'} í gagnaröð Karp (${h.length} síðustu viðskiptadagar).` } });
      }
    }
    cand.sort((a, b) => b.w - a.w).slice(0, 3).forEach((c) => ev.push(c.e));
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
    if (lowN >= 12) ev.push({ id: `atv-${last.t}-lag`, type: 'atv', facts: { gildi: last.v, timabil: last.t, manudir: lowN }, url: '/atvinnuleysi/',
      title: `Atvinnuleysi ekki lægra í ${lowN} mánuði: ${pct1(last.v)}%`,
      text: `Skráð atvinnuleysi mældist ${pct1(last.v)}% í ${manIS(last.t.replace('M', '-'))} — það lægsta í ${lowN} mánuði samkvæmt Vinnumálastofnun.` });
    if (hiN >= 12) ev.push({ id: `atv-${last.t}-ha`, type: 'atv', facts: { gildi: last.v, timabil: last.t, manudir: hiN }, url: '/atvinnuleysi/',
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

  return ev;
}

// ── AI-skrif (gated á lykil; grundað eingöngu í staðreyndunum) ─
async function aiWrite(events) {
  if (!process.env.ANTHROPIC_API_KEY || !events.length) return 0;
  let Anthropic;
  try { const p = require('@anthropic-ai/sdk'); Anthropic = p.Anthropic || p.default || p; }
  catch (e) { console.log('• @anthropic-ai/sdk ekki til — sniðmátstextar notaðir.'); return 0; }
  const client = new Anthropic();
  const batch = events.slice(0, 14); // kostnaðarþak per keyrslu
  const spec = batch.map((e) => ({ id: e.id, type: e.type, facts: e.facts }));
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: 'Þú ert fréttavél Karp (karp.is). Þú skrifar ÖRSTUTTAR fréttir á íslensku (2–3 setningar) EINGÖNGU úr staðreyndunum í facts-hlutnum. STRANGT BANN: engar tölur, nöfn eða fullyrðingar sem ekki standa í facts; engar orsakaskýringar, engin gildishlaðin orð, engin upphrópunarmerki. Hlutlaus fréttatónn. Skilaðu AÐEINS JSON-fylki: [{"id":"...","title":"...","text":"..."}] — title hámark 90 stafir.',
      messages: [{ role: 'user', content: JSON.stringify(spec) }],
    });
    const raw = (msg.content || []).map((c) => c.text || '').join('');
    const arr = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
    let n = 0;
    for (const w of arr) {
      const e = batch.find((x) => x.id === w.id);
      if (e && w.text && w.title) { e.title = String(w.title).slice(0, 120); e.text = String(w.text).slice(0, 600); e.ai = true; n++; }
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
  console.log('Atburðir fundnir:', events.length, '· nýir:', fresh.length, '·', fresh.map((e) => e.type + ':' + e.id.slice(0, 40)).join(' | ') || '—');

  const aiN = await aiWrite(fresh);
  console.log('AI-skrifaðar:', aiN, 'af', Math.min(fresh.length, 14), process.env.ANTHROPIC_API_KEY ? '' : '(enginn lykill — sniðmát)');

  const old = (J('frettavel.json') || {}).items || [];
  const items = fresh.map((e) => ({ id: e.id, date: TODAY, type: e.type, title: e.title, text: e.text, url: e.url, ai: !!e.ai }))
    .concat(old.filter((o) => !fresh.some((f) => f.id === o.id)))
    .slice(0, 120);

  fresh.forEach((e) => { seen[e.id] = TODAY; });
  // seen-skráin vex ekki endalaust: klippum færslur sem eru horfnar úr items og eldri en 180 daga
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  for (const [id, d] of Object.entries(seen)) { if (d < cutoff && !items.some((x) => x.id === id)) delete seen[id]; }

  const out = { updated: new Date().toISOString(), n: items.length, items };
  fs.writeFileSync(G('frettavel.json'), JSON.stringify(out));
  fs.writeFileSync(G('frettavel_seen.json'), JSON.stringify(seen));
  const pub = path.join(__dirname, '..', 'web', 'public', 'gogn');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'frettavel.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(__dirname, '..', 'web', 'public', 'frettavel.xml'), rss(items));
  console.log('Skrifað: frettavel.json (' + items.length + ' fréttir) + frettavel.xml (RSS)');
}
main().catch((e) => { console.error(e); process.exit(1); });
