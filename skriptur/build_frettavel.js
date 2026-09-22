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
const { malLykill, flettaLykil } = require('./lib/malalyklar.cjs');   // þingmál lykluð <þing>-<nr> (22.9.2026)
const { pickThrotlok } = require('./throtlok_detect.js');
const { pickVikan } = require('./vikan_detect.js');
const { pickSvaedi } = require('./svaedi_detect.js');   // fasteignaverð per matssvæði HMS (19.8.2026)
const { pickSent } = require('./sent_detect.js');   // tónsveifla; grunnur með dagsetningu (22.9.2026)
const { pickMark } = require('./mark_detect.js');   // markaðir; frétt ber viðskiptadag bréfsins (22.9.2026)
const { pickNyjar } = require('./nyjar_detect.js');   // nýjar færslur (útboð, opnanir, styrkir); dagsettur grunnur (22.9.2026)
const { pickRadherra } = require('./radherra_detect.js');   // ráðherraskipti; embætti sem mengi (22.9.2026)
const { pickLyf } = require('./lyf_detect.js');   // lyfjaskortur + lyfFyrst; dagsettur grunnur (22.9.2026)
const { pickRaedur } = require('./raedur_detect.js');   // ræðumínútur vikunnar; grunnur með dagsetningu skrár (22.9.2026)
const { pickEftirlit } = require('./eftirlit_detect.js');   // eftirlitsvaktin; dagsettur grunnur, hálf skrá ekki borin saman (22.9.2026)
const { pickStjorar } = require('./stjorar_detect.js');   // bæjar-/sveitarstjórar; dagsettur grunnur (22.9.2026)
const { pickNefndir } = require('./nefndir_detect.js');   // formennska þingnefnda; dagsetning úr althingi_meta (22.9.2026)
const { pickFastthr } = require('./fastthr_detect.js');   // taktur íbúðamarkaðar; AÐEINS liðinn mánuður, dagsettur grunnur (22.9.2026)
const { pickSendirad } = require('./sendirad_detect.js');   // sendiherraskipti; dagsettur grunnur, hálf skrá þurrkar ekki (22.9.2026)
let slugifyIS = null;   // @lib/format.mjs slugify (ESM) — hlaðið í main() svo svæðis-slóðir séu þær sömu og /fasteignaverd/[slug]
const G = (f) => path.join(__dirname, '..', 'gogn', f);
const J = (f) => { try { return JSON.parse(fs.readFileSync(G(f), 'utf8')); } catch (e) { return null; } };
const MODEL = process.env.KARP_FRETTAVEL_MODEL || 'claude-opus-4-8';
// Nýja ritunin (bakgrunnur + ein frétt/kall + talnavörn, 22.9.2026) keyrir AÐEINS á rofa þar til Aron hefur
// samþykkt sýnishorn úr prufukeyrslu. Án rofans er gamla leiðin (aiWrite) nákvæmlega óbreytt.
const THURR = process.argv.includes('--thurr');
const NYTT = THURR || process.env.KARP_FRETTAVEL_NYTT === '1';
const _eI = process.argv.indexOf('--endurskrifa');
const ENDURSKRIFA = _eI > 0 ? Math.max(0, Math.min(40, parseInt(process.argv[_eI + 1], 10) || 0)) : 0;
const TODAY = new Date().toISOString().slice(0, 10);

// RÁS-vörpun: macro-fréttir fá projection úr þjóðhags-herminum (bakað í facts → archive → article-síðu).
const RAS_ROOT = path.join(__dirname, '..', 'gogn', 'roads');
const RJ = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RAS_ROOT, f), 'utf8')); } catch (e) { return null; } };
const RAS_CTX = (() => { const b = RJ('baseline.json'), l = RJ('links.json'), s = RJ('scenarios.json'); return (b && l) ? { baseline: b, links: l, scenarios: s || [] } : null; })();
const RAS_MAP = {
  vextir: (f) => (typeof f.nyir === 'number' ? { kind: 'lever', key: 'vextir', value: f.nyir } : null),
  gengi: (f) => ({ kind: 'shock', key: 'gengi', value: f.met === 'hæsta' ? -5 : 5, illustrative: true }),
  verdbolga: () => ({ kind: 'outcome', key: 'verdbolga' }),
  atv: () => ({ kind: 'outcome', key: 'atvinnuleysi' }),
  fast: () => ({ kind: 'outcome', key: 'husnaedi' }),
  fastthr: () => ({ kind: 'outcome', key: 'husnaedi' }),
};

const LETTER = { S: 'Samfylkingin', C: 'Viðreisn', F: 'Flokkur fólksins', D: 'Sjálfstæðisflokkurinn', M: 'Miðflokkurinn', B: 'Framsóknarflokkurinn', J: 'Sósíalistaflokkurinn', P: 'Píratar', V: 'Vinstri græn' };
const NAME2LETTER = { 'Samfylkingin': 'S', 'Viðreisn': 'C', 'Flokkur fólksins': 'F', 'Sjálfstæðisflokkur': 'D', 'Sjálfstæðisflokkurinn': 'D', 'Miðflokkurinn': 'M', 'Framsóknarflokkur': 'B', 'Framsóknarflokkurinn': 'B', 'Sósíalistaflokkurinn': 'J', 'Píratar': 'P', 'Vinstri græn': 'V', 'Vinstrihreyfingin – grænt framboð': 'V' };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9á-öþæð]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
const pct1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
// Vextir eru alltaf margfeldi af 0,25 → TVEIR aukastafir (7,75%/8,00%). pct1 námundaði 7,75 í 7,8.
const pct2 = (v) => Number(v).toFixed(2).replace('.', ',');
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const manIS = (ym) => { const m = String(ym).match(/(\d{4})-(\d{2})/); return m ? MAN[+m[2] - 1] + ' ' + m[1] : ym; };
const dmyIS = (d) => { const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : d; };
// Smágraf: síðustu n tölugildi úr röð (fyrir sparkline á fréttakorti). Skilar [] ef of stutt.
const downsample = (arr, n = 24) => { const a = (arr || []).filter((x) => typeof x === 'number'); return a.length <= n ? a : a.slice(-n); };

// ── Detectorar ────────────────────────────────────────────────
// state = frettavel_state.json: snapshot-samanburður milli keyrslna (diff-fréttir)
// og viku/mánaðar-taktar. FYRSTA keyrsla hvers hluta er HLJÓÐ (initialiserar bara).
// ⚠ Skynjari sem diffar við state þarf DAGSETTAN grunn (dagsetning gagnaskrárinnar sjálfrar, ekki keyrslunnar) og má
//   ekki láta tóma skrá skrifa yfir grunninn; annars birtist úrelt skrá sem lifnar við sem fréttir dagsins (22.9.2026).
//   Mynstrið og prófin eru í *_detect.js (sent, mark, nyjar, radherra, stjorar, lyf, raedur, eftirlit).
function detect(state) {
  const ev = [];

  // Þinggögn: atkvæði + þingmenn + frumvörp
  const atk = J('atkvaedi.json');
  const mps = J('althingi.json') || [];
  const bills = J('frumvorp.json') || [];
  const flokkurAf = {}; mps.forEach((m) => { if (m.flokkur && m.flokkur !== 'utan þingflokka') flokkurAf[m.nafn] = m.flokkur; });
  // ⚠ Lyklað á <þing>-<nr>: mál nr. 1 á 158 eru fjárlögin en allt annað á 157 (lib/malalyklar.cjs).
  const billAf = {}; bills.forEach((b) => { billAf[malLykill(b.thing, b.nr)] = b; });

  // Formsatriði (lengd þingfundar, afbrigði, dagskrártillögur) eru ekki fréttir.
  const FORMSATRIDI = /lengd þingfundar|afbrigði|dagskrá|frestun.*fund|fundarhlé/i;
  if (atk && atk.mal) {
    for (const [lykill, v] of Object.entries(atk.mal)) {
      // Lykillinn ber þingið. Beri lykill (skrá á gamla sniðinu meðan CI hefur ekki keyrt)
      // fellur aftur á þing skrárinnar — þá haldast atburða-ID óbreytt og ekkert tvíbirtist.
      const { thing: lThing, nr } = flettaLykil(lykill);
      const thing = lThing == null ? atk.thing : lThing;
      const b = billAf[malLykill(thing, nr)] || {};
      const titill = b.titill || ('mál nr. ' + nr);
      if (FORMSATRIDI.test(titill)) continue;
      const ja = (v.ja || []), nei = (v.nei || []);
      // taep — ræðst á ≤5 atkvæðum (raunveruleg atkvgr., ekki einróma formsatriði)
      const munur = Math.abs(ja.length - nei.length);
      if (ja.length + nei.length >= 40 && nei.length >= 10 && munur <= 5) {
        ev.push({ id: `taep-${thing}-${nr}`, type: 'taep', facts: { titill, nr, thing, ja: ja.length, nei: nei.length, munur, nidurstada: ja.length > nei.length ? 'samþykkt' : 'fellt' }, url: `/thingmal/?nr=${nr}`,
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
          ev.push({ id: `rebel-${thing}-${nr}-${nafn.replace(/\s+/g, '_')}`, type: 'rebel', facts: { nafn, flokkur: fl, titill, nr, thing, kaus: meiriJa ? 'nei' : 'já', flokkurKaus: meiriJa ? 'já' : 'nei', medFlokki: meiri, alls, ja: ja.length, nei: nei.length }, url: `/thingmal/?nr=${nr}`,
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
    // ⚠ Skráin spannar TVÖ þing (thingListi í build_frumvorp). Fréttin segir „á yfirstandandi
    //   þingi", svo hún má aðeins telja atkvæðagreiðslur ÞESS þings — annars blandaðist heilt
    //   liðið þing inn í hlutfallið. Beri lykill (gamla sniðið) telst til þings skrárinnar,
    //   svo talan er óbreytt þangað til CI endurbyggir.
    const thingAf = (k) => { const t = flettaLykil(k).thing; return t == null ? atk.thing : t; };
    const iAr = Object.entries(atk.mal).filter(([k]) => thingAf(k) === atk.thing);
    const total = iAr.length;
    if (total >= 60) {
      const ym = TODAY.slice(0, 7);
      const cnt = {};
      iAr.forEach(([, v]) => (v.fjar || []).forEach((n) => { cnt[n] = (cnt[n] || 0) + 1; }));
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
  // Hreinn skynjari í raedur_detect.js (próf): grunnurinn ber dagsetningu skrárinnar og er borinn saman við skrá sem er
  // 6–8 dögum yngri; lengra bil (skráin stóð og lifnaði), nýtt þing og gamla sniðið endurstilla í þögn.
  const ra = J('raedugreining.json');
  if (ra && ra.mp) {
    const nafnAf = {}; mps.forEach((m) => { nafnAf[m.id] = m.nafn; });
    const r = pickRaedur(ra, state.raedur, { nafnAf });
    const t = r.listi;
    if (t.length) {
      ev.push({ id: `raedur-${r.til}`, type: 'raedur', facts: { fra: r.fra, til: r.til, listi: t }, url: '/althingi/',
        title: `${t[0].nafn} talaði mest á Alþingi: ${kr(t[0].minutur)} mínútur á viku`,
        text: `${t[0].nafn} átti flestar ræðumínútur á Alþingi frá ${r.fra} til ${r.til}: ${kr(t[0].minutur)} mínútur.${t[1] ? ` Næst komu ${t[1].nafn} (${kr(t[1].minutur)} mín)${t[2] ? ' og ' + t[2].nafn + ' (' + kr(t[2].minutur) + ' mín)' : ''}.` : ''}` });
    }
    state.raedur = r.snap;
  }

  // ── Markaðir: dagshreyfarar ≥4% + met í gagnaröð ─────────────
  // Hreinn skynjari í mark_detect.js (próf): fréttin ber síðasta viðskiptadag bréfsins (id og texti) og bréf sem hefur
  // ekki verslast í 4 daga er ekki fréttaefni. Met kviknar aðeins þegar nýtt met er sett (markRec). Þak 2 á dag.
  const mk = J('markadir.json');
  if (mk && Array.isArray(mk.stocks)) {
    const { cand, rec } = pickMark(mk, state.markRec, { idag: TODAY });
    for (const c of cand) {
      const sp = downsample((c.hist || []).concat([c.verd]), 30);
      const verd = String(c.verd).replace('.', ',');
      if (c.tegund === 'hreyfing') {
        ev.push({ id: `mark-${c.dags}-${slug(c.sym)}`, type: 'mark', spark: sp, facts: { felag: c.nafn, breyting: +c.breyting.toFixed(1), verd: c.verd, dags: c.dags }, url: '/markadir/',
          title: `${c.nafn} ${c.breyting > 0 ? 'hækkar' : 'lækkar'} um ${pct1(Math.abs(c.breyting))}% í Kauphöllinni`,
          text: `Gengi ${c.nafn} ${c.breyting > 0 ? 'hækkaði' : 'lækkaði'} um ${pct1(Math.abs(c.breyting))}% ${c.dags === TODAY ? 'í dag' : 'í viðskiptum ' + dmyIS(c.dags)} og stendur í ${verd}.` });
      } else {
        ev.push({ id: `markmet-${c.dags}-${slug(c.sym)}-${c.met === 'hæsta' ? 'ha' : 'la'}`, type: 'mark', spark: sp, facts: { felag: c.nafn, verd: c.verd, met: c.met, dagar: c.dagar, dags: c.dags }, url: '/markadir/',
          title: `${c.nafn} í ${c.met} gildi í gagnaröð Karp`,
          text: `Gengi ${c.nafn} stendur í ${verd} — það ${c.met} í gagnaröð Karp (${c.dagar} viðskiptadagar).` });
      }
    }
    state.markRec = rec;
  }

  // ── Umfjöllunarviðsnúningur (diff á sentiment-vísitölu) ──────
  // Hreinn skynjari í sent_detect.js (próf): ber aðeins saman við grunn sem er ≤ 3 dögum eldri en skráin, hálf skrá
  // þurrkar ekki grunninn og hvert félag fær í mesta lagi eina tónfrétt á 30 daga (flökt-vörn).
  // ⚠ id ber dagsetningu SKRÁRINNAR, ekki keyrsludaginn: seen-dedup lyklar á id og óbreytt skrá á ekki að fá nýtt id.
  const se = J('sentiment.json');
  if (se && se.companies) {
    const { cand, grunnur } = pickSent(se, state.sent);
    cand.forEach((c) => {
      ev.push({ id: `sent-${String(se.updated).slice(0, 10)}-${slug(c.nafn)}`, type: 'sent', facts: { fyrirtaeki: c.nafn, fra: c.fra, i: c.i, frettir: c.n, kvardi: '-100 til +100' }, url: '/frettir/',
        title: `Tónn umfjöllunar um ${c.nafn} ${c.i > c.fra ? 'batnar' : 'versnar'} skarpt`,
        text: `Tónvísitala Karp fyrir ${c.nafn} fór úr ${String(c.fra).replace('.', ',')} í ${String(c.i).replace('.', ',')} (kvarði -100 til +100) miðað við ${c.n} nýlegar fréttir í fjölmiðlavöktun Karp.` });
    });
    state.sent = grunnur;
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
  // Ráðherrar: hreinn skynjari í radherra_detect.js (próf). Tóm skrá skrifar ekki yfir grunninn, embætti eru borin saman
  // sem mengi og ráðherra sem vantar í grunninn er aðeins nýr ef seta hans hófst á síðustu 14 dögum.
  if (Array.isArray(cab)) {
    // `sott` = sóknardagur cabinet.json úr cabinet_meta.json (fylkið sjálft ber enga dagsetningu og seiglan getur
    // haldið því dögum saman). ⚠ id má EKKI bera TODAY: seen-dedup lyklar á id og flöktandi embættafylki birti
    // þá sömu frétt aftur á nýjum degi.
    const { cand, grunnur } = pickRadherra(cab, state.cabinet, { idag: TODAY, sott: (J('cabinet_meta.json') || {}).updated });
    for (const c of cand) {
      ev.push({ id: `radherra-${slug(c.nafn)}-${slug(c.embaetti)}`, type: 'radherra', facts: { nafn: c.nafn, embaetti: c.embaetti, flokkur: c.flokkur, adur: c.adur }, url: '/althingi/',
        title: `${c.nafn} tekur við sem ${c.embaetti}`,
        text: `${c.nafn} (${c.flokkur}) er ${c.embaetti} samkvæmt uppfærðri ráðherraskrá Alþingis.${c.adur ? ` Var áður ${c.adur}.` : ''}` });
    }
    state.cabinet = grunnur;
  }
  // Bæjar-/sveitarstjórar: hreinn skynjari í stjorar_detect.js (próf) — dagsettur grunnur (≤ 3 dagar), tóm skrá haldin.
  const st = J('sveitarstjorar.json');
  if (st && st.byName) {
    const { cand, grunnur } = pickStjorar(st, state.stjorar);
    for (const c of cand) {
      ev.push({ id: `baejarstjori-${slug(c.sveitarfelag)}-${slug(c.nafn)}`, type: 'baejarstjori', facts: { sveitarfelag: c.sveitarfelag, nafn: c.nafn, titill: c.titill, fyrri: c.fyrri }, url: '/sveitarfelog/',
        title: `${c.nafn} nýr ${c.titill} — ${c.sveitarfelag}`,
        text: `${c.nafn} er ${c.titill} sveitarfélagsins ${c.sveitarfelag} samkvæmt uppfærðri skrá Sambands íslenskra sveitarfélaga. Fyrri ${c.titill} var ${c.fyrri}.` });
    }
    state.stjorar = grunnur;
  }
  // Sendiherrar: hreinn skynjari í sendirad_detect.js (próf). ⚠⚠ Tóm skrá ÞURRKAÐI grunninn 29.7.2026 (20 nöfn → {})
  // þegar skrapið fór að skrifa yfir ritstýrðu skrána; nú heldur hálf eða tóm skrá grunninum, hann er dagsettur
  // (≤ 3 dagar) og land sem vantar geymist í 30 daga. `sendiherra` er RITSTÝRÐUR reitur — sjá build_sendirad.js.
  const sr = J('sendirad.json');
  {
    const { cand, grunnur } = pickSendirad(sr, state.sendirad);
    for (const c of cand) {
      ev.push({ id: `sendiherra-${slug(c.land)}-${slug(c.nafn)}`, type: 'sendiherra', facts: { land: c.land, nafn: c.nafn, fyrri: c.fyrri }, url: '/sendirad/',
        title: `${c.nafn} nýr sendiherra Íslands — ${c.land}`,
        text: `${c.nafn} er sendiherra Íslands gagnvart ${c.land} samkvæmt uppfærðri sendiráðaskrá utanríkisráðuneytisins. Fyrri sendiherra var ${c.fyrri}.` });
    }
    state.sendirad = grunnur;
  }
  // Ívilnanir: skráin er RITSTÝRÐ og ber enga dagsetningu, svo grunnurinn er dagsettur eftir keyrsludegi. Ný færsla í
  // skránni er ekki sama og ný ívilnun: færsla sem ritstjóri bætir við (eða endurnefnir) er aðeins frétt ef hún tók
  // gildi á þessu ári eða því síðasta. Ódagsett færsla (`fra` vantar, fjórar í skránni) er aldrei frétt.
  const iv = J('ivilnanir.json');
  if (Array.isArray(iv)) {
    const { nyjar, grunnur } = pickNyjar(iv, state.ivilnanir, { dags: TODAY, lykill: (x) => slug(x.nafn) + '|' + x.fra, ar: (x) => x.fra });
    for (const x of nyjar) {
      ev.push({ id: `ivilnun-${slug(x.nafn)}-${x.fra}`, type: 'ivilnun', facts: { nafn: x.nafn, lysing: x.lysing, umfang: x.umfang, raduneyti: x.raduneyti, fra: x.fra }, url: '/ivilnanir/',
        title: `Ný ríkisívilnun: ${x.nafn}`,
        text: `${x.nafn} hefur fengið ívilnun frá ríkinu (${x.raduneyti || 'ráðuneyti óskráð'}): ${String(x.lysing || '').slice(0, 140)}${x.umfang ? ` Umfang: ${x.umfang}.` : ''}` });
    }
    state.ivilnanir = grunnur;
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
        ev.push({ id: `stjorntap-${b.thing ?? (atk ? atk.thing : '')}-${b.nr}`, type: 'stjorntap', facts: { titill: b.titill, nr: b.nr, ja: b.ja, nei: b.nei, stjornJa: govJa, stjornNei: govNei }, url: `/thingmal/?nr=${b.nr}`,
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
        ev.push({ id: `einn-${b.thing ?? (atk ? atk.thing : '')}-${b.nr}-${l}`, type: 'einn', facts: { flokkur: LETTER[l], nei: v[1], titill: b.titill, nr: b.nr, ja: b.ja, neiAlls: b.nei }, url: `/thingmal/?nr=${b.nr}`,
          title: `${LETTER[l]} einn gegn öllum um „${String(b.titill).slice(0, 55)}“`,
          text: `Allir ${v[1]} viðstaddir þingmenn ${LETTER[l]} greiddu atkvæði gegn „${b.titill}“ á meðan enginn þingmaður annarra flokka gerði það. Málið var samþykkt með ${b.ja} atkvæðum gegn ${b.nei}.` });
      }
    }
  }

  // ── 🏆 Útboðsniðurstöður: hver vann (TED awards, LOTA 30) ────
  // Silent-init: fyrsta keyrsla merkir allt séð — annars 259 fréttir dag 1. Hreinn skynjari í nyjar_detect.js (próf):
  // tóm skrá skrifar ekki yfir grunninn, grunnurinn er dagsettur (≤ 3 dagar) og niðurstaða eldri en 30 daga er ekki frétt.
  const ur = J('utbod_urslit.json');
  if (ur && Array.isArray(ur.awards)) {
    const { nyjar, grunnur } = pickNyjar(ur.awards, state.urslitInit, { dags: ur.updated, lykill: (a) => a.nr, dagsetning: (a) => a.d });
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
    state.urslitInit = grunnur;
  }
  // Tilboðsopnanir (Landsvirkjun) — lægstbjóðandi er frétt fyrir verktaka. Sami skynjari og niðurstöðurnar.
  if (ur && Array.isArray(ur.opnanir)) {
    const { nyjar, grunnur } = pickNyjar(ur.opnanir, state.opnanirInit, { dags: ur.updated, lykill: (x) => slug(x.t), dagsetning: (x) => x.d });
    for (const o of nyjar.slice(0, 2)) {
      ev.push({ id: `opnun-lv-${slug(o.t)}`, type: 'urslit', facts: { titill: o.t, dags: o.d, tilbod: o.bids.length, laegst: o.laegst.n, upphaed: o.laegst.isk }, url: '/utbod/',
        title: `Tilboð opnuð hjá Landsvirkjun: lægst bauð ${o.laegst.n}`,
        text: `${o.bids.length} tilboð bárust í útboð Landsvirkjunar „${o.t}“${o.d ? ' (opnuð ' + o.d + ')' : ''}. Lægsta boð átti ${o.laegst.n}: ${kr(o.laegst.isk)} kr. án VSK. Lægsta boð er ekki sjálfkrafa það sem verður valið.` });
    }
    state.opnanirInit = grunnur;
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
      ev.push({ id: `gjaldthrot-${n.ref || n.date}-${n.kt}`, type: 'gjaldthrot', kt: n.kt, facts: { felag: n.nafn, tegund: heiti, domstoll: n.court || null, dags: n.date, fyrirtaka: n.when || null }, url: '/logbirting/',
        samhengi: `Ein af ${nyleg.length} gjaldþrota- og skiptabeiðnum lögaðila sem birst hafa í Lögbirtingablaðinu síðustu 30 daga.`,
        title: `${heiti}: ${n.nafn}`,
        text: `${heiti} vegna ${n.nafn} birtist í Lögbirtingablaðinu ${n.date}${n.court ? ' (' + n.court + ')' : ''}${n.when ? `. Fyrirtaka málsins er ${n.when}` : ''}.` });
    });
  }

  // ── Þrotabú gert upp (skiptalok, Lögbirtingablaðið) — landar á kt með fullan feril → söguþráður "Lokið" ──
  if (lb && lb.byKt) {
    for (const it of pickThrotlok(lb.byKt, lb.typeLabels, { todayISO: TODAY, days: 30, max: 3 })) ev.push(it);
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
  // Hreinn skynjari í nyjar_detect.js (próf): sjóður sem vantaði í skrána síðast er ekki borinn saman (sjóðir detta
  // reglulega út í einn dag), grunnurinn er dagsettur (≤ 3 dagar), þekktir styrkir gleymast ekki og styrkur með
  // úthlutunarár meira en ári á undan skránni er ekki frétt.
  const sty = J('styrkir.json');
  if (sty && Array.isArray(sty.styrkir)) {
    const { nyjar, grunnur } = pickNyjar(sty.styrkir, state.styrkirSeen, { dags: sty.updated, lykill: (s) => `${s.slug}-${s.ar}-${s.upphaed}`, hopur: (s) => s.sjodur, ar: (s) => s.ar });
    nyjar.filter((s) => s.upphaed >= 15000000)
      .sort((a, b) => b.upphaed - a.upphaed).slice(0, 3).forEach((s) => {
        ev.push({ id: `styrkur-${s.slug}-${s.ar}`, type: 'styrkur', facts: { thegi: s.nafn, sjodur: s.sjodur, flokkur: s.flokkur || null, upphaed: s.upphaed, ar: s.ar, verkefni: s.verkefni || null }, url: '/styrkir/',
          title: `${s.nafn} fær ${kr(s.upphaed)} kr. styrk úr ${s.sjodur}`,
          text: `${s.nafn} hlýtur ${kr(s.upphaed)} kr. styrk úr ${s.sjodur}${s.flokkur ? ' (' + s.flokkur + ')' : ''}${s.verkefni ? ` fyrir verkefnið „${s.verkefni}“` : ''}${s.ar ? `, úthlutað ${s.ar}` : ''}.` });
      });
    state.styrkirSeen = grunnur;
  }

  // ── Seðlabankinn: meginvextir (breyting) + verðbólga (ný mæling) ──
  const sb = J('sedlabanki.json');
  if (sb && sb.datasets) {
    // Nýjasta ársverðbólga (til raun-vaxta samhengis) — sama röð og verðbólgu-skynjarinn notar
    const vbS = ((sb.datasets.verdbolga || {}).series || []).find((s) => s.name === 'Vísitala neysluverðs' && (s.points || []).some((p) => typeof p[1] === 'number' && p[1] < 50));
    const vbLatest = vbS && vbS.points.length ? vbS.points[vbS.points.length - 1][1] : null;
    const meg = ((sb.datasets.vextir_si || {}).series || []).find((s) => /megin/i.test(s.name));
    if (meg && Array.isArray(meg.points) && meg.points.length >= 2) {
      const [dNu, vNu] = meg.points[meg.points.length - 1], vFyrri = meg.points[meg.points.length - 2][1];
      if (typeof vNu === 'number' && typeof vFyrri === 'number' && vNu !== vFyrri) {
        ev.push({ id: `vextir-${dNu}`, type: 'vextir', spark: downsample(meg.points.map((p) => p[1]), 24), facts: { nyir: vNu, fyrri: vFyrri, breyting: +(vNu - vFyrri).toFixed(2), dags: dNu }, url: '/vextir/',
          samhengi: typeof vbLatest === 'number' ? `Raunstýrivextir eru um ${pct2(vNu - vbLatest)}% — meginvextir að frádreginni ${pct1(vbLatest)}% ársverðbólgu.` : undefined,
          title: `Seðlabankinn ${vNu > vFyrri ? 'hækkar' : 'lækkar'} meginvexti í ${pct2(vNu)}%`,
          text: `Meginvextir Seðlabanka Íslands eru nú ${pct2(vNu)}% og ${vNu > vFyrri ? 'hækkuðu' : 'lækkuðu'} úr ${pct2(vFyrri)}% (${dNu}).` });
      }
    }
    const vb = ((sb.datasets.verdbolga || {}).series || []).find((s) => s.name === 'Vísitala neysluverðs' && (s.points || []).some((p) => typeof p[1] === 'number' && p[1] < 50));
    if (vb && Array.isArray(vb.points) && vb.points.length >= 2) {
      const [dNu, vNu] = vb.points[vb.points.length - 1], vF = vb.points[vb.points.length - 2][1];
      if (typeof vNu === 'number' && typeof vF === 'number') {
        ev.push({ id: `verdbolga-${dNu}`, type: 'verdbolga', spark: downsample(vb.points.map((p) => p[1]), 24), facts: { verdbolga: vNu, fyrri: vF, stefna: vNu > vF ? 'jókst' : vNu < vF ? 'minnkaði' : 'óbreytt', dags: dNu }, url: '/verdlag/',
          samhengi: `${pct1(Math.abs(vNu - 2.5))} prósentustigum ${vNu >= 2.5 ? 'yfir' : 'undir'} 2,5% verðbólgumarkmiði Seðlabankans.`,
          title: `Verðbólga ${vNu > vF ? 'eykst' : vNu < vF ? 'hjaðnar' : 'stendur í stað'}: ${pct1(vNu)}%`,
          text: `Ársverðbólga mældist ${pct1(vNu)}% í ${manIS(dNu.slice(0, 7))} samkvæmt vísitölu neysluverðs — ${vNu > vF ? 'hækkun' : vNu < vF ? 'lækkun' : 'óbreytt'} frá ${pct1(vF)}% mánuðinn á undan.` });
      }
    }
  }

  // ── Lyfjaskortur á nauðsynlegum lyfjum (Sérlyfjaskrá) — state-diff, þögul frumstilling ──
  // Hreinn skynjari í lyf_detect.js (próf): dagsettur grunnur (≤ 3 dagar), skortur sem sást á síðustu 30 dögum er ekki
  // nýr, tóm eða hálf skrá er gagnabilun og upphafsdagur skorts (lyfFyrst) er dagsetning skrárinnar.
  const lyf = J('lyf.json');
  if (lyf && Array.isArray(lyf.lyf)) {
    const r = pickLyf(lyf, state.lyfSeen, state.lyfFyrst);
    r.cand.forEach((x) => {
      const efni = (x.ingredients || []).join(', ') || ((x.atc || {}).name) || '';
      ev.push({ id: `lyfskortur-${x.slug}`, type: 'lyf', facts: { lyf: x.name, virkt: efni || null, styrkur: x.strength || null, form: x.form || null, markadsleyfishafi: x.holder || null }, url: '/lyf/',
        title: `Lyfjaskortur: ${x.name}${x.strength ? ' ' + x.strength : ''}`,
        text: `Skráður er skortur á lyfinu ${x.name}${x.strength ? ' (' + x.strength + ')' : ''}${efni ? `, virkt efni ${efni}` : ''} samkvæmt Sérlyfjaskrá Lyfjastofnunar. Lyfið er skráð sem nauðsynlegt lyf.` });
    });
    if (r.vidvorun) console.log('⚠ ' + r.vidvorun);
    state.lyfSeen = r.grunnur;
    state.lyfFyrst = r.fyrst;
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
      ev.push({ id: `vorumerki-${t.id}`, type: 'vorumerki', kt: t.kt, facts: { merki: t.titill, tegund: t.tegund || null, eigandi: t.eigandi, flokkar: t.flokkar || null, skrad: t.skrad || null }, url: '/atvinnuvegir/hugverk/',
        title: `Nýtt vörumerki skráð: ${t.titill}`,
        text: `${t.eigandi} hefur skráð vörumerkið „${t.titill}“${t.tegund ? ' (' + t.tegund + ')' : ''} hjá Hugverkastofunni${(t.flokkar || []).length ? ', í vöru-/þjónustuflokki ' + t.flokkar.join(', ') : ''}.` });
    });
  }

  // ══ LOTA 32 (Fasi 3): sjávarútvegur, gengi, EES, vikuyfirlit ══
  // Gengi krónu — met í gengisvísitölu (state-gated svo endurtaki sig EKKI daglega; fyrsta keyrsla þögul).
  if (sb && sb.datasets) {
    const g = ((sb.datasets.gengisvisit || {}).series || []).find((s) => s.name === 'Gengisvísitala');
    if (g && Array.isArray(g.points) && g.points.length >= 30) {
      const rec = state.gengiRec || {}, gInit = !!state.gengiRec;
      const dNu = g.points[g.points.length - 1][0], vNu = g.points[g.points.length - 1][1], hist = g.points.map((p) => p[1]).filter((x) => typeof x === 'number');
      if (typeof vNu === 'number' && hist.length) {
        if (gInit && vNu >= Math.max(...hist) && vNu > (typeof rec.hi === 'number' ? rec.hi : 0)) {
          ev.push({ id: `gengi-${dNu}-hi`, type: 'gengi', spark: downsample(hist, 24), facts: { gildi: +vNu.toFixed(1), met: 'hæsta', dags: dNu }, url: '/vextir/',
            title: 'Krónan aldrei veikari — gengisvísitala í hæsta gildi',
            text: `Gengisvísitala krónunnar stendur í ${pct1(vNu)} (${dNu}), það hæsta í gagnaröð Karp. Hærri gengisvísitala merkir veikari krónu.` });
        } else if (gInit && vNu <= Math.min(...hist) && vNu < (typeof rec.lo === 'number' ? rec.lo : Infinity)) {
          ev.push({ id: `gengi-${dNu}-lo`, type: 'gengi', spark: downsample(hist, 24), facts: { gildi: +vNu.toFixed(1), met: 'lægsta', dags: dNu }, url: '/vextir/',
            title: 'Krónan aldrei sterkari — gengisvísitala í lægsta gildi',
            text: `Gengisvísitala krónunnar stendur í ${pct1(vNu)} (${dNu}), það lægsta í gagnaröð Karp. Lægri gengisvísitala merkir sterkari krónu.` });
        }
        state.gengiRec = { hi: Math.max(typeof rec.hi === 'number' ? rec.hi : 0, vNu), lo: Math.min(typeof rec.lo === 'number' ? rec.lo : Infinity, vNu) };
      }
    }
  }

  // Sjávarútvegur — aflamark fisktegundar nálgast fullnýtingu (aggregat, engin PII)
  const sja = J('sjavarutvegur.json');
  if (sja && Array.isArray(sja.featured)) {
    sja.featured.filter((f) => f && f.pct >= 85 && f.kvoti > 0).sort((a, b) => b.pct - a.pct).slice(0, 2).forEach((f) => {
      ev.push({ id: `kvoti-${sja.timabil}-${slug(f.species)}`, type: 'kvoti', facts: { tegund: f.species, nyting: f.pct, afli: f.afli, kvoti: f.kvoti, fiskveidiar: sja.timabilLabel }, url: '/atvinnuvegir/sjavarutvegur/',
        title: `${f.species}kvótinn ${f.pct}% nýttur — nálgast fullnýtingu`,
        text: `Aflamark ${String(f.species).toLowerCase()} fiskveiðiársins ${sja.timabilLabel} er ${f.pct}% nýtt — ${kr(f.afli)} af ${kr(f.kvoti)} þúsund tonnum landað samkvæmt flotavísi Karp úr gögnum Fiskistofu.` });
    });
  }

  // EES — nýjar ESB-gerðir (AI þýðir enska titilinn í CI; sniðmát ber enska heitið til vara)
  const ees = J('ees.json');
  if (ees && Array.isArray(ees.esb)) {
    ees.esb.filter((x) => x && RECENT(x.d, 30)).sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 2).forEach((x) => {
      ev.push({ id: `ees-${x.celex || slug(String(x.t).slice(0, 40))}`, type: 'ees', facts: { titill_enska: x.t, celex: x.celex || null, dags: x.d }, url: '/ees/',
        title: 'Ný ESB-gerð til skoðunar á EES-vettvangi',
        text: `Ný gerð Evrópusambandsins (birt ${x.d}) sem kann að verða tekin upp í EES-samninginn og þar með í íslensk lög. Heiti á ensku: ${String(x.t).slice(0, 220)}.` });
    });
  }

  // Vika í tölum — vikulegur talna-útdráttur (aðeins mánudaga)
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1 && sb && sb.datasets) {
    const lastPt = (arr, name, pred) => { const s = (arr || []).find((x) => x.name === name && (!pred || (x.points || []).some((p) => pred(p[1])))); return s && s.points && s.points.length ? s.points[s.points.length - 1][1] : null; };
    const vb = lastPt((sb.datasets.verdbolga || {}).series, 'Vísitala neysluverðs', (v) => typeof v === 'number' && v < 50);
    const meg = lastPt((sb.datasets.vextir_si || {}).series, 'Meginvextir (vextir á 7 daga bundnum innlánum)');
    const g = lastPt((sb.datasets.gengisvisit || {}).series, 'Gengisvísitala');
    const at = J('atvinnuleysi.json'); const atv = at && Array.isArray(at.monthly) && at.monthly.length ? at.monthly[at.monthly.length - 1].v : null;
    const parts = [];
    if (vb != null) parts.push(`verðbólga ${pct1(vb)}%`);
    if (meg != null) parts.push(`meginvextir ${pct2(meg)}%`);
    if (atv != null) parts.push(`atvinnuleysi ${pct1(atv)}%`);
    if (g != null) parts.push(`gengisvísitala ${pct1(g)}`);
    if (parts.length >= 3) {
      ev.push({ id: `vika-${TODAY}`, type: 'vika', facts: { verdbolga: vb, meginvextir: meg, atvinnuleysi: atv, gengisvisitala: g == null ? null : +g.toFixed(1) }, url: '/frettavel/',
        title: `Vika í tölum: ${parts.slice(0, 2).join(', ')}`,
        text: `Lykiltölur íslensks efnahagslífs í dag: ${parts.join(', ')}. Samantekt Fréttavélar Karp úr opinberum hagtölum Seðlabanka Íslands og Vinnumálastofnunar.` });
    }
  }

  // ══ BYLGJA 1 (LOTA 33): kross-tengingar + innsýn ══
  const birW = J('birgjar.json');
  const lbW = J('logbirting.json');
  // #9 Hvert fer ríkisféð? — mánaðarlegt yfirlit greiðslna ríkisins (heild + stærstu birgjar)
  if (birW && Array.isArray(birW.months) && birW.months.length && birW.vendorDetail) {
    const li = birW.months.length - 1, mM = birW.months[li];
    const top = Object.entries(birW.vendorDetail).map(([n, d]) => ({ n, v: (d.m || [])[li] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
    if (top.length >= 3 && mM && mM.total) {
      ev.push({ id: `rikisfe-${mM.m}`, type: 'rikisfe', facts: { manudur: mM.m, heildargreidslur: Math.round(mM.total), faerslur: mM.n, staerstu: top.map((t) => ({ birgir: t.n, upphaed: Math.round(t.v) })) }, url: '/birgjar/',
        title: `Ríkið greiddi ${kr(Math.round(mM.total / 1e6))} m.kr. til birgja í ${manIS(mM.m)}`,
        text: `Greiðslur ríkisins til birgja námu ${kr(Math.round(mM.total))} kr. í ${manIS(mM.m)} samkvæmt opnum reikningum ríkisins. Stærstu birgjarnir: ${top.map((t) => t.n + ' (' + kr(Math.round(t.v)) + ' kr.)').join(', ')}.` });
    }
  }
  // #1 ⭐ Ríkisbirgir í gjaldþrotameðferð — KROSS-TENGING: birgjar (nafn) × logbirting (kt/nafn). Watchdog.
  if (birW && birW.vendorDetail && lbW && lbW.byKt) {
    const norm = (s) => String(s).toLowerCase().replace(/\s+(ehf|hf|ohf|slhf|sf|ses)\.?$/g, '').replace(/[^a-zá-öþæð0-9]/g, '');
    const gjald = {};
    for (const [kt, o] of Object.entries(lbW.byKt)) { const g = (o.notices || []).find((n) => (n.type === 'gjaldthrot_beidni' || n.type === 'skiptabeidni') && RECENT(n.date, 150)); if (g) gjald[norm(o.name)] = { name: o.name, kt, date: g.date }; }
    Object.entries(birW.vendorDetail).map(([n, d]) => ({ n, tot: (d.m || []).reduce((a, b) => a + (b || 0), 0), g: gjald[norm(n)] })).filter((x) => x.g && x.tot >= 20000000).sort((a, b) => b.tot - a.tot).slice(0, 2).forEach((x) => {
      ev.push({ id: `birgirthrot-${x.g.kt}`, type: 'birgirthrot', facts: { birgir: x.n, rikisgreidslur_12man: Math.round(x.tot), gjaldthrot_dags: x.g.date, kt: x.g.kt }, url: '/logbirting/',
        title: `Ríkisbirgir í gjaldþrotameðferð: ${x.n}`,
        text: `${x.n} fékk ${kr(Math.round(x.tot))} kr. í greiðslur frá ríkinu síðustu tólf mánuði en er nú kominn í gjaldþrotameðferð samkvæmt Lögbirtingablaðinu (${x.g.date}).` });
    });
  }
  // #17 Ný formennska þingnefndar — diff (þögul frumstilling). Hreinn skynjari í nefndir_detect.js (próf): dagsettur
  // grunnur (≤ 3 dagar) þar sem dagsetningin kemur úr althingi_meta.json (nefndir.json er fylki og ber enga), tóm skrá
  // heldur grunninum og nefnd sem vantar í skrána geymist í 30 daga.
  const nef = J('nefndir.json');
  if (Array.isArray(nef)) {
    const { cand, grunnur } = pickNefndir(nef, J('althingi_meta.json'), state.nefndir);
    for (const c of cand) {
      ev.push({ id: `nefnd-${c.id}-${slug(c.formadur)}`, type: 'nefnd', facts: { nefnd: c.nefnd, formadur: c.formadur, fyrri: c.fyrri }, url: '/althingi/',
        title: `${c.formadur} nýr formaður ${c.nefnd}`,
        text: `${c.formadur} er orðinn formaður ${c.nefnd} Alþingis samkvæmt uppfærðri nefndaskrá Alþingis. Fyrri formaður var ${c.fyrri}.` });
    }
    state.nefndir = grunnur;
  }
  // #27 Topplisti — verðmætustu opinberu útboð nýlega (kviknar þegar nýtt stærsta útboð birtist)
  const urW = J('utbod_urslit.json');
  if (urW && Array.isArray(urW.awards)) {
    const top = urW.awards.filter((a) => a.cur === 'ISK' && a.value > 0 && RECENT(a.d, 30)).sort((a, b) => b.value - a.value).slice(0, 5);
    if (top.length >= 3) {
      ev.push({ id: `toppar-utbod-${top[0].nr}`, type: 'toppar', facts: { flokkur: 'Verðmætustu útboð (30 dagar)', listi: top.map((a) => ({ titill: String(a.t).replace(/^Iceland – /, '').slice(0, 80), kaupandi: a.buyer, sigurvegari: (a.winners || [])[0], verdmaeti: a.value })) }, url: '/utbod/',
        title: 'Verðmætustu opinberu útboð undanfarið',
        text: `Stærstu samningar í opinberum útboðum síðustu 30 daga: ${top.slice(0, 3).map((a) => `${(a.winners || [])[0]} — ${kr(Math.round(a.value / 1e6))} m.kr. (${a.buyer})`).join('; ')}.` });
    }
  }

  // ══ BYLGJA 2 (LOTA 34): djúp innsýn ══
  // Íbúðamarkaðurinn skiptir um takt — verdict-diff. Hreinn skynjari í fastthr_detect.js (próf): AÐEINS liðinn
  // mánuður er dæmdur (dómurinn flökti fimm sinnum meðan júlí 2026 fylltist og birti þrjár mótsagnakenndar fréttir
  // um sama mánuðinn), lágmarksfjöldi kaupa miðað við næstu 12 mánuði, dagsettur grunnur og biluð skrá heldur honum.
  const fa2 = J('fasteignir.json');
  {
    const { cand, grunnur } = pickFastthr(fa2, state.fastthr, { todayISO: TODAY });
    for (const c of cand) {
      ev.push({ id: `fastthr-${c.manudur}-${c.verdict}`, type: 'fastthr', spark: downsample(((fa2 || {}).months || []).map((m) => (m.hbsv || {}).m2 || 0), 24), facts: { verdict: c.verdict, breyting3man: c.chg3, breyting12man: c.chg12, manudur: c.manudur, kaupsamningar: c.n }, url: '/fasteignir/',
        title: `Íbúðamarkaðurinn ${c.ordalag}`,
        text: `Íbúðaverð á höfuðborgarsvæðinu ${c.chg3 < 0 ? 'lækkaði' : 'hækkaði'} um ${pct1(Math.abs(c.chg3))}% á þremur mánuðum til loka ${manIS(c.manudur)} (${c.chg12 >= 0 ? '+' : ''}${pct1(c.chg12)}% á tólf mánuðum) samkvæmt kaupskrá HMS — markaðurinn ${c.ordalag}.` });
    }
    state.fastthr = grunnur;
    delete state.fastVerdict;   // gamla sniðið: ber strengur án mánaðar eða dagsetningar
  }
  // Leiguverð í sögulegu hámarki
  const lei = J('leiga.json');
  if (lei && lei.latest && Array.isArray(lei.quarters) && lei.quarters.length > 8 && lei.latest.medM2) {
    const cur = lei.latest, prev = lei.quarters.filter((q) => q.q !== cur.q).map((q) => q.medM2 || 0);
    if (prev.length && cur.medM2 > Math.max(...prev)) {
      ev.push({ id: `leiga-${cur.q}`, type: 'leiga', spark: downsample(lei.quarters.map((q) => q.medM2 || 0), 24), facts: { arsfjordungur: cur.q, medaltal_m2: cur.medM2, samningar: cur.n }, url: '/fasteignir/',
        title: `Leiguverð í sögulegu hámarki: ${kr(cur.medM2)} kr./m²`,
        text: `Miðgildi leiguverðs á íbúðarhúsnæði náði sögulegu hámarki á ${String(cur.q).replace(/(\d{4})F(\d)/, '$2. ársfj. $1')}: ${kr(cur.medM2)} kr. á fermetra samkvæmt þinglýstum leigusamningum í Leiguskrá HMS (${cur.n} samningar).` });
    }
  }
  // Fasteignaverð per MATSSVÆÐI HMS (svæðis-skynjari 19.8.2026): ≥6% breyting milli ára í svæði með ≥40 kaup →
  // frétt með hlekk á /fasteignaverd/<svæði>/. Hreinn skynjari í svaedi_detect.js (próf). Einn per svæði per ársfjórðung.
  try {
    const ZS = J('matssvaedi_solur.json');
    if (ZS && ZS.byZone && slugifyIS) {
      let hms = null; try { hms = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'public', 'gogn', 'hms', 'matssvaedi_2027.json'), 'utf8')) || {}).svaedi || null; } catch (e) {}
      for (const e of pickSvaedi(ZS.byZone, { todayISO: TODAY, slugify: slugifyIS, hms })) ev.push(e);
    }
  } catch (e) { console.error('svæðis-skynjari brást:', String(e).slice(0, 140)); }
  // Ísland í samhengi — Reykjavík vs höfuðborgir Norðurlanda (Numbeo)
  const nb2 = J('numbeo.json');
  if (nb2 && nb2.indices && nb2.indices.Reykjavik && typeof nb2.indices.Reykjavik.pp === 'number') {
    const nordic = ['Reykjavik', 'Copenhagen', 'Oslo', 'Stockholm', 'Helsinki'];
    const gr = nordic.map((c) => ({ c, g: (nb2.indices[c] || {}).groceries })).filter((x) => typeof x.g === 'number').sort((a, b) => b.g - a.g);
    const rvkG = gr.find((x) => x.c === 'Reykjavik'), rank = gr.findIndex((x) => x.c === 'Reykjavik') + 1, mm = (nb2.updated || 'x').slice(0, 7);
    if (rvkG && rank >= 1) {
      ev.push({ id: `samanburdur-${mm}`, type: 'samanburdur', facts: { borg: 'Reykjavík', matvara_visitala: rvkG.g, matvara_rod: rank + ' af ' + gr.length, kaupmattur: nb2.indices.Reykjavik.pp, kaupmannahofn: (nb2.indices.Copenhagen || {}).groceries, oslo: (nb2.indices.Oslo || {}).groceries }, url: '/verdlag/',
        title: rank === 1 ? 'Matarkarfan dýrust í Reykjavík af Norðurlöndum' : `Reykjavík ${rank}. dýrust í matvöru á Norðurlöndum`,
        text: `Matvöruvísitala Reykjavíkur mælist ${rvkG.g} samkvæmt Numbeo — ${rank === 1 ? 'sú hæsta' : rank + '. hæsta'} af ${gr.length} höfuðborgum Norðurlanda (Kaupmannahöfn ${(nb2.indices.Copenhagen || {}).groceries}, Osló ${(nb2.indices.Oslo || {}).groceries}). Kaupmáttarvísitala Reykjavíkur er ${nb2.indices.Reykjavik.pp}.` });
    }
  }

  // ══ BYLGJA 3 (LOTA 35): byggingar · sveitarfjármál · grænar tölur ══
  // Nýtt byggingarleyfi fyrir atvinnuhúsnæði SAMÞYKKT hjá byggingarfulltrúa RVK (nýlegt, ekki íbúðarhúsnæði — engin PII)
  const byW = J('byggingarleyfi_vakt.json');
  if (byW && Array.isArray(byW.recent)) {
    const COM = /veitingasta|verslun|hótel|gistihe|atvinnuh|skrifstof|iðnað|verksmiðj|kaffihús|þjónustuh|samkomu/i;
    const RES = /íbúð|einbýl|bílskúr|sólskál|viðbygg|svalir|heimili|raðhús/i;
    byW.recent
      .filter((m) => m.decisionCode === 'samthykkt' && RECENT(m.date, 40) && COM.test(m.desc || '') && !RES.test(m.desc || ''))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 2)
      .forEach((m) => {
        const stutt = String(m.desc || '').replace(/\s+/g, ' ').trim();
        const stad = m.hverfi ? `${m.addr} (${m.hverfi})` : m.addr;
        ev.push({ id: `bygging-${m.caseNo}`, type: 'bygging', facts: { heimilisfang: m.addr, hverfi: m.hverfi || null, malsnumer: m.caseNo, dagsetning: m.date, lysing: stutt.slice(0, 200) }, url: '/byggingarvakt/',
          title: `Nýtt byggingarleyfi fyrir atvinnuhúsnæði: ${m.addr}`,
          text: `Byggingarfulltrúi Reykjavíkur samþykkti byggingarleyfi fyrir atvinnuhúsnæði að ${stad} þann ${dmyIS(m.date)}: ${stutt.slice(0, 180)}${stutt.length > 180 ? '…' : ''} (málsnr. ${m.caseNo}).` });
      });
  }
  // Röðun sveitarfélaga eftir skuldum á hvern íbúa — kviknar á skuldsettasta (breytist sjaldan; sjálf-dedup um seen)
  const sfW = J('sveitarfelog_fin.json');
  if (sfW && typeof sfW === 'object' && !Array.isArray(sfW)) {
    const arr = Object.entries(sfW).map(([n, v]) => ({ n, ...v })).filter((x) => typeof x.skuldir_ibui === 'number' && x.skuldir_ibui > 0);
    arr.sort((a, b) => b.skuldir_ibui - a.skuldir_ibui);
    if (arr.length >= 5) {
      const top = arr[0], medal = Math.round(arr.reduce((s, x) => s + x.skuldir_ibui, 0) / arr.length);
      const naest = arr.slice(1, 4).map((x) => `${x.n} (${kr(x.skuldir_ibui)} þús.)`).join(', ');
      ev.push({ id: `sveitfe-skuld-${slug(top.n)}`, type: 'sveitfe', facts: { sveitarfelag: top.n, skuldir_a_ibua_thus: top.skuldir_ibui, medaltal_thus: medal, naestu: arr.slice(1, 4).map((x) => ({ sveitarfelag: x.n, skuldir_ibui: x.skuldir_ibui })) }, url: '/sveitarfelog/',
        title: `${top.n} skuldsettasta sveitarfélagið: ${kr(top.skuldir_ibui)} þús. kr. á íbúa`,
        text: `${top.n} er skuldsettasta sveitarfélag landsins miðað við skuldir á hvern íbúa — ${kr(top.skuldir_ibui)} þús. kr., borið saman við ${kr(medal)} þús. kr. að meðaltali hjá ${arr.length} sveitarfélögum. Næst á eftir koma ${naest}.` });
    }
  }
  // Hlutfall hreinorkubíla (BEV) í bílaflotanum — árleg gögn (sjálf-dedup um ár)
  const rbW = J('rafbilar.json');
  if (rbW && rbW.CARS && rbW.CARS.total && rbW.CARS.bev) {
    const c = rbW.CARS, yr = c.lastY, bevPct = c.bev / c.total * 100;
    const bevSeries = (c.series || []).find((s) => /BEV|Rafmagn/i.test(s.name));
    ev.push({ id: `graent-bev-${yr}`, type: 'graent', spark: bevSeries ? downsample(bevSeries.data.map((x) => x || 0), 20) : undefined, facts: { ar: yr, bev_fjoldi: c.bev, floti: c.total, bev_hlutfall: Math.round(bevPct * 10) / 10, rafmagnadir_hlutfall: c.rafPct }, url: '/rafbilar/',
      title: `Hreinorkubílar ${pct1(bevPct)}% af bílaflotanum ${yr}`,
      text: `Hreinir rafmagnsbílar (BEV) voru ${kr(c.bev)} talsins í árslok ${yr} — ${pct1(bevPct)}% af ${kr(c.total)} bíla flota landsmanna. Séu tengiltvinnbílar taldir með eru rafmagnaðir bílar ${pct1(c.rafPct)}% flotans samkvæmt tölum Samgöngustofu.` });
  }

  // ══ BYLGJA 4 (LOTA 36): kross-tenging margra opinberra gagnaheimilda ══
  // Fyrirtæki í brennidepli — EINKAfyrirtæki (ehf./hf.) sem kemur fram í fleiri en einni opinberri fjárstreymis-heimild
  // (styrkir · ríkisgreiðslur · útboð). Vikulegt (mánudaga), snýst gegnum lista (state.fyrvikSeen). HLUTLAUST: aðeins
  // staðreyndir + heimildir; ehf/hf-sía útilokar einstaklinga (styrkir geta farið til einstaklinga → aldrei birt). noai=fastur texti.
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const styF = J('styrkir.json'), biF = J('birgjar.json'), urF = J('utbod_urslit.json');
    if (styF && biF && urF) {
      const nmz = (s) => String(s || '').toLowerCase().replace(/\s+(ehf|hf|ohf|slhf|sf|ses)\.?$/g, '').replace(/[^a-zá-öþæð0-9]/g, '');
      const priv = (s) => /\s(ehf|hf)\.?$/i.test(String(s || ''));
      const grants = {}, vend = {}, win = {};
      (styF.styrkir || []).forEach((g) => { if (!priv(g.nafn)) return; const k = nmz(g.nafn); if (!k) return; (grants[k] = grants[k] || { nafn: g.nafn, tot: 0, n: 0, sjodir: new Set() }); grants[k].tot += g.upphaed || 0; grants[k].n++; grants[k].sjodir.add(g.sjodur); });
      Object.entries(biF.vendorDetail || {}).forEach(([n, d]) => { if (!priv(n)) return; const k = nmz(n); if (!k) return; vend[k] = { nafn: n, tot: (d.m || []).reduce((a, b) => a + (b || 0), 0) }; });
      (urF.awards || []).forEach((a) => { (a.winners || []).forEach((w) => { if (!priv(w)) return; const k = nmz(w); if (!k) return; (win[k] = win[k] || { nafn: w, n: 0 }); win[k].n++; }); });
      const cand = [];
      for (const k of new Set([...Object.keys(grants), ...Object.keys(vend), ...Object.keys(win)])) {
        const src = []; if (grants[k]) src.push('styrkur'); if (vend[k]) src.push('rikisgreidslur'); if (win[k]) src.push('utbod');
        if (src.length >= 2) cand.push({ k, nsrc: src.length, nafn: (vend[k] || win[k] || grants[k]).nafn, rank: ((grants[k] || {}).tot || 0) + ((vend[k] || {}).tot || 0) });
      }
      // Röðun: fleiri heimildir fyrst, svo styrkur+ríkisgreiðslur samtala (útboðs-fjárhæð sleppt — getur verið rammasamningur/ofmetin).
      cand.sort((a, b) => b.nsrc - a.nsrc || b.rank - a.rank);
      const seenF = new Set(state.fyrvikSeen || []);
      const pick = cand.find((c) => !seenF.has(c.k));
      if (pick) {
        const g = grants[pick.k], v = vend[pick.k], w = win[pick.k], h = [];
        if (g) h.push(`styrk${g.n > 1 ? 'i (' + g.n + ')' : ''} úr ${[...g.sjodir].slice(0, 2).join(', ')}${g.tot ? ' að fjárhæð ' + kr(Math.round(g.tot)) + ' kr.' : ''}`);
        if (v && v.tot > 0) h.push(`ríkisgreiðslur upp á ${kr(Math.round(v.tot))} kr. síðustu tólf mánuði`);
        if (w) h.push(`${w.n} unnin opinber útboð`);
        ev.push({ id: `fyrvik-${pick.k}`, type: 'fyrvik', noai: true, facts: { fyrirtaeki: pick.nafn, heimildir_fjoldi: pick.nsrc, styrkur_kr: g ? Math.round(g.tot) : null, sjodir: g ? [...g.sjodir] : [], rikisgreidslur_12man_kr: v ? Math.round(v.tot) : null, utbod_unnin: w ? w.n : 0 }, url: '/birgjar/',
          title: `Fyrirtæki í brennidepli: ${pick.nafn}`,
          text: `Fréttavél Karp tengdi saman opinberar gagnaheimildir og fann að ${pick.nafn} kemur fram í ${pick.nsrc} þeirra: ${h.join('; ')}. Allar upplýsingarnar eru úr opnum opinberum gögnum — opinberum sjóðum, opnum reikningum ríkisins og útboðsgáttum. Að birtast í fleiri en einni slíkri heimild er algengt hjá stærri þjónustu- og verktakafyrirtækjum og felur ekki í sér neitt óeðlilegt; yfirlitið sýnir hvernig Karp tengir saman opinberar gagnaveitur.` });
        state.fyrvikSeen = [...(state.fyrvikSeen || []), pick.k].slice(-200);
      }
    }
  }

  // AI-ÞEMAGREIN — vikuleg (mánudaga) samantekt sem TENGIR margar opinberar gagnaveitur í eina mynd. Rótering milli þema.
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const sbT = J('sedlabanki.json');
    const lastPtN = (ds, nm, pred) => { const s = ((ds || {}).series || []).find((x) => (nm instanceof RegExp) ? nm.test(x.name) : x.name === nm); if (!s || !Array.isArray(s.points)) return null; const p = pred ? s.points.filter((q) => pred(q[1])) : s.points; return p.length ? p[p.length - 1][1] : null; };
    const themas = [];
    // Þema 1: Peningastefnan — vextir × verðbólga × gengi × raunvextir
    if (sbT && sbT.datasets) {
      const meg = lastPtN(sbT.datasets.vextir_si, /megin/i), vbv = lastPtN(sbT.datasets.verdbolga, 'Vísitala neysluverðs', (v) => typeof v === 'number' && v < 50), ge = lastPtN(sbT.datasets.gengisvisit, 'Gengisvísitala');
      if (typeof meg === 'number' && typeof vbv === 'number') {
        const raun = +(meg - vbv).toFixed(2);
        themas.push({ key: 'peningastefna', url: '/vextir/', facts: { meginvextir: meg, arsverdbolga: vbv, raunvextir: raun, verdbolgumarkmid: 2.5, gengisvisitala: ge == null ? null : +ge.toFixed(1) },
          samhengi: `Raunstýrivextir ≈ ${pct1(raun)}%; verðbólga ${pct1(Math.abs(vbv - 2.5))} pp ${vbv >= 2.5 ? 'yfir' : 'undir'} 2,5% markmiði.`,
          title: `Peningastefnan: ${pct2(meg)}% meginvextir, ${pct1(vbv)}% verðbólga`,
          text: `Peningastefna Seðlabanka Íslands í hnotskurn: meginvextir standa í ${pct2(meg)}% og ársverðbólga mælist ${pct1(vbv)}% — ${pct1(Math.abs(vbv - 2.5))} prósentustigum ${vbv >= 2.5 ? 'yfir' : 'undir'} 2,5% verðbólgumarkmiðinu. Raunstýrivextir (meginvextir að frádreginni verðbólgu) eru því um ${pct2(raun)}%.${ge != null ? ` Gengisvísitala krónunnar stendur í ${pct1(ge)}.` : ''} Tölurnar eru teknar saman úr opinberum gögnum Seðlabankans.` });
      }
    }
    // Þema 2: Hvert fer ríkisféð — ríkisgreiðslur × útboð × styrkir
    const biT = J('birgjar.json'), urT = J('utbod_urslit.json'), stT = J('styrkir.json');
    if (biT && Array.isArray(biT.months) && biT.months.length) {
      const mM = biT.months[biT.months.length - 1], topV = (biT.vendors || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0))[0];
      const nAward = ((urT && urT.awards) || []).filter((a) => RECENT(a.d, 30)).length, stTot = ((stT && stT.styrkir) || []).reduce((s, x) => s + (x.upphaed || 0), 0);
      if (mM && mM.total) {
        themas.push({ key: 'opinbertfe', url: '/birgjar/', facts: { manudur: mM.m, rikisgreidslur: Math.round(mM.total), staersti_birgir: topV ? topV.n : null, ny_utbod_30d: nAward, styrkir_alls: Math.round(stTot) },
          samhengi: `Þrjár fjárstreymis-leiðir: ríkisgreiðslur, ${nAward} ný útboð (30 d.) og ${kr(Math.round(stTot / 1e6))} m.kr. í skráðum styrkjum.`,
          title: `Hvert fer ríkisféð? ${kr(Math.round(mM.total / 1e9))} ma.kr. til birgja í ${manIS(mM.m)}`,
          text: `Opinbert fé streymir eftir mörgum leiðum. Í ${manIS(mM.m)} greiddi ríkið ${kr(Math.round(mM.total))} kr. til birgja samkvæmt opnum reikningum${topV ? `, þar sem ${topV.n} var stærsti einstaki birgirinn` : ''}. Á sama tíma voru ${nAward} ný opinber útboð með skráða niðurstöðu síðustu 30 daga og ${kr(Math.round(stTot))} kr. í skráðum styrkjum úr opinberum sjóðum. Karp tengir þessar gagnaveitur saman í eina mynd.` });
      }
    }
    // Þema 3: Húsnæðismarkaðurinn — kaupverð × leiga
    const faT = J('fasteignir.json'), leT = J('leiga.json');
    if (faT && faT.direction && typeof faT.direction.chg12 === 'number' && typeof faT.direction.chg3 === 'number') {
      const d = faT.direction, m2 = (faT.months && faT.months.length ? (faT.months[faT.months.length - 1].hbsv || {}).m2 : null), rent = (leT && leT.latest) ? leT.latest.medM2 : null;
      themas.push({ key: 'husnaedi', url: '/fasteignir/', facts: { breyting3man: d.chg3, breyting12man: d.chg12, fermetraverd_thus: m2, leiga_m2: rent, takt: d.verdict || null },
        samhengi: `Kaupverð ${d.chg3 < 0 ? 'lækkaði' : 'hækkaði'} ${pct1(Math.abs(d.chg3))}% á 3 mán.${rent ? ` · leiga ${kr(rent)} kr./m².` : ''}`,
        title: `Húsnæðismarkaðurinn: ${d.chg12 >= 0 ? '+' : ''}${pct1(d.chg12)}% á tólf mánuðum`,
        text: `Húsnæðismarkaðurinn í einni mynd: íbúðaverð á höfuðborgarsvæðinu ${d.chg12 >= 0 ? 'hækkaði' : 'lækkaði'} um ${pct1(Math.abs(d.chg12))}% á tólf mánuðum og ${d.chg3 < 0 ? 'lækkaði' : 'hækkaði'} um ${pct1(Math.abs(d.chg3))}% síðustu þrjá mánuði${m2 ? ` (fermetraverð um ${kr(m2)} þús. kr.)` : ''}.${rent ? ` Miðgildi leiguverðs stendur í ${kr(rent)} kr. á fermetra.` : ''} Samantekt úr kaupskrá og leiguskrá HMS.` });
    }
    if (themas.length) {
      const ti = ((typeof state.themaIdx === 'number' ? state.themaIdx : -1) + 1);
      const pick = themas[ti % themas.length];
      ev.push({ id: `thema-${pick.key}-${TODAY}`, type: 'thema', facts: pick.facts, url: pick.url, samhengi: pick.samhengi, title: pick.title, text: pick.text });
      state.themaIdx = ti;
    }
  }

  // „Sama fyrirsvar" — NAFNLAUS AGGREGATE-innsýn (Aron valdi 19.7: engin einstaklings-birting, ~85% ein-gjaldþrota
  // tilvik saklaus). Heildartala einstaklinga sem stýrðu gjaldþrota félagi OG eru í fyrirsvari annars starfandi félags.
  // Vikulegt (mánudaga) + birtir aðeins þegar talan breytist ≥10 frá síðast birtu (D1 í uppbyggingu → talan vex m/þekju).
  const fx = J('tengsl_fonix.json');
  if (fx && typeof fx.total === 'number' && fx.total > 0 && new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const prev = state.fonixPub;
    if (typeof prev !== 'number' || Math.abs(fx.total - prev) >= 10) {
      const rad = fx.radmynstur || 0;
      ev.push({ id: `fonix-yfirlit-${TODAY}`, type: 'fonix', facts: { einstaklingar: fx.total, radmynstur_2plus: rad, timabil_fra: fx.cutoff || null }, url: '/logbirting/',
        title: `${fx.total} stýrðu gjaldþrota félagi og eru í fyrirsvari annarra félaga`,
        text: `Í tengslagrunni Karp eru ${fx.total} einstaklingar sem voru í fyrirsvari fyrir félag sem fór í gjaldþrotameðferð (síðustu tvö ár) og eru jafnframt skráðir í fyrirsvari fyrir annað starfandi félag. Þar af eru ${rad} með fleiri en eitt gjaldþrot að baki. Yfirlitið er á heildar-grunni og nefnir enga einstaklinga; tengslagrunnurinn er í uppbyggingu svo talan endurspeglar núverandi þekju. Að stofna eða stýra nýju félagi eftir gjaldþrot fyrra félags er löglegt og oftast fullkomlega eðlilegt.` });
      state.fonixPub = fx.total;
    }
  }

  // Eftirlitsvaktin (matvælaeftirlit RVK) — AGGREGATE, engin nöfn. Diff á fjölda stöðvaðra/takmarkaðra (einkunn 0–1).
  // Hreinn skynjari í eftirlit_detect.js (próf): dagsettur grunnur (≤ 3 dagar) og hálf skrá er ekki borin saman.
  const eft = J('eftirlit.json');
  if (eft && Array.isArray(eft.dist) && eft.dist.length >= 6 && eft.count) {
    const { bad, fyrri, grunnur } = pickEftirlit(eft, state.eftirlitBad);
    const full = eft.dist[5] || 0;
    if (fyrri !== null) {
      ev.push({ id: `eftirlit-${TODAY}`, type: 'eftirlit', facts: { stodvud_takmorkud: bad, fjoldi: eft.count, medaleinkunn: eft.avg, krofur_uppfylltar: full, fyrri }, url: '/eftirlit/',
        title: `Eftirlitsvaktin: ${bad} matvælastaðir með stöðvaða eða takmarkaða starfsemi`,
        text: `${bad} af ${eft.count} matvæla- og veitingastöðum í Reykjavík eru nú með stöðvaða eða takmarkaða starfsemi samkvæmt heilbrigðiseftirliti Reykjavíkur (einkunn 0–1 á kvarðanum 0–5), borið saman við ${fyrri} áður. Meðaleinkunn allra staða er ${String(eft.avg).replace('.', ',')} og ${full} staðir uppfylla allar kröfur. Yfirlitið er á heildar-grunni og nefnir ekki einstaka staði.` });
    }
    state.eftirlitBad = grunnur;
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
  const batch = events.filter((e) => !e.noai).slice(0, 16); // kostnaðarþak per keyrslu; noai=fastur (hlutlaus) texti óbreyttur
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
    <description>${xesc(String(x.text || '').replace(/\s*\n\s*\n\s*/g, ' '))} (Vélskrifuð frétt úr opinberum gögnum — heimild: karp.is${xesc(x.url)})</description>
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

// ── Nýja ritunin: gögn bakgrunns, client og prufuhamur ────────
// ⚠ Enginn ársreikningsaðgangur hér: ársreikningatölur eru greidda 990 kr varan og gögnin óáreiðanleg (sjá haus
//   lib/frettasamhengi.mjs). Aðgangur hér myndi bjóða næsta manni að setja þær aftur í fréttir.
function gognBakgrunns() {
  return {
    felagaskra: J('felagaskra.json'), birgjar: J('birgjar.json'), utbod_urslit: J('utbod_urslit.json'), styrkir: J('styrkir.json'),
    markadir: J('markadir.json'), sedlabanki: J('sedlabanki.json'), atvinnuleysi: J('atvinnuleysi.json'), lyf: J('lyf.json'),
  };
}
function nyrClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // 120 s á kall (verstu tilvik ~100 s fyrir 4096 tóka svar, sjá MAX_TOKENS) og eitt endurkall (sjálfgefið í SDK:
  // 10 mín og 2): eitt hangandi kall má ekki éta tímaþak ritunarinnar, en 60 s var of naumt fyrir lengsta svarið.
  try { const p = require('@anthropic-ai/sdk'); const A = p.Anthropic || p.default || p; return new A({ timeout: 120_000, maxRetries: 1 }); }
  catch (e) { console.log('• @anthropic-ai/sdk ekki til — sniðmátstextar notaðir.'); return null; }
}
// Safnið geymir ekki kt, en persónuverndarvörnin hvílir á henni (5 af 7 vörumerkjasýnishornum 22.9 voru einstaklingar):
// gjaldþrot bera kt aftast í id (gjaldthrot-<ref>-<kt>), vörumerki finnast eftir id í vorumerki_nyskrad.byKt.
function vorumerkjaKt(vm) {
  const m = new Map();
  for (const [kt, listi] of Object.entries((vm && vm.byKt) || {})) for (const t of (listi || [])) if (t && t.id) m.set(String(t.id), kt);
  return m;
}
function ktSynishorns(a, vmKt) {
  if (a.type === 'gjaldthrot') { const m = /-(\d{10})$/.exec(String(a.id)); return m ? m[1] : null; }
  if (a.type === 'vorumerki') return vmKt.get(String(a.id).replace(/^vorumerki-/, '')) || null;
  return null;
}
// Sýnishorn úr safninu: hringferð yfir tegundir svo sýnishornið nái yfir sem flesta hópa. `birt` = birtingardagur
// fréttarinnar, svo bakgrunnurinn miðist við hann en ekki daginn í dag (engin gögn sem komu eftir fréttina).
function synishornUrSafni(items, n, { studdar, markMork, vmKt }) {
  const hopar = {};
  for (const a of (items || [])) {
    if (!a || !a.facts || (!studdar.includes(a.type) && a.type !== 'domur')) continue;
    if (a.type === 'mark' && String(a.date) < markMork) continue;
    (hopar[a.type] = hopar[a.type] || []).push(a);
  }
  const rodir = Object.values(hopar), ut = [];
  for (let i = 0; ut.length < n && rodir.some((r) => r.length); i++) {
    const r = rodir[i % rodir.length];
    if (!r.length) continue;
    const a = r.shift();
    const f = JSON.parse(JSON.stringify(a.facts)); delete f.bakgrunnur;
    const s = { id: 'prufa-' + a.id, type: a.type, facts: f, title: a.title, text: a.text, gamall: { title: a.title, text: a.text }, birt: a.date || null };
    const kt = ktSynishorns(a, vmKt);
    if (kt) s.kt = kt;
    ut.push(s);
  }
  return ut;
}
// ⚠ Prufuhamur skrifar EKKERT. Hann skrifar sýnishorn úr safninu og fréttir dagsins (áður vs nýtt), án fjöldaþaks, og
//   prentar HVERJA frétt um leið og hún er tilbúin (líka í $GITHUB_STEP_SUMMARY), svo sýnishorn glatist ekki þótt
//   vinnuflæðið nái tímamörkum; tölfræðin kemur í lokin. Tímaþak ritunar (12 mín) gildir áfram, innan 25 mín vinnuflæðisins.
//   Sýnishornin eru FYRST í röðinni (22.9, síðari lota): lendi tímaþakið á einhverjum eiga það að vera fréttir dagsins,
//   ekki sýnishornin sem áður/nýtt-samanburðurinn — sem eigandinn dæmir efnið á — hvílir á.
//   Markaðsfréttir aðeins frá deginum í dag: bakgrunnur markaða er reiknaður úr gögnum dagsins, svo eldri frétt fengi
//   vísitölu og verðbil annars dags (22.9: Síminn 21.9 fékk vísitölu 22.9). `client` er inndælanlegur (próf).
async function prufukeyrsla(published, state, { client = nyrClient() } = {}) {
  const { baetaVidBakgrunni, STUDDAR_TEGUNDIR } = await import('./lib/frettasamhengi.mjs');
  const { skrifaFrettir, efnisgreinMd, hafnadarLinur } = await import('./lib/frettaskrif.mjs');
  let synishorn = [];
  if (ENDURSKRIFA) {
    synishorn = synishornUrSafni((J('frettavel_archive.json') || {}).items, ENDURSKRIFA, {
      studdar: STUDDAR_TEGUNDIR, markMork: TODAY, vmKt: vorumerkjaKt(J('vorumerki_nyskrad.json')),
    });
    const gogn = gognBakgrunns();
    for (const s of synishorn) baetaVidBakgrunni([s], gogn, { idag: s.birt || TODAY, state });
  }
  const allt = synishorn.concat(published);
  const skrifa = (md) => {
    console.log(md);
    if (!process.env.GITHUB_STEP_SUMMARY) return;
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (e) { console.log('• samantekt náðist ekki í skrá: ' + String(e).slice(0, 80)); }
  };
  console.log('\n===== PRUFUKEYRSLA — ekkert skrifað =====');
  skrifa('## Prufukeyrsla fréttavélar ' + TODAY + (client ? '' : ' (enginn lykill: aðeins bakgrunnur)') + '\n');
  const prentud = new Set();
  const prenta = (e, h, merki) => { prentud.add(e); skrifa(efnisgreinMd(e, h, merki)); };
  const t = client ? await skrifaFrettir(allt, { client, model: process.env.KARP_FRETTAVEL_MODEL || undefined, hamark: Infinity, eftirHverja: prenta }) : null;
  // Þau sem féllu af TÍMAÞAKI (síðustu t.sleppt í hópnum sem mátti fara í kall) fá sér-merki í útskriftinni — ekki sama
  // sniðmáts-merki og greinar sem aldrei áttu að fara í kall (noai eða enginn lykill).
  const hopur = allt.filter((e) => e && !e.noai);
  const timaThakSett = new Set(t && t.sleppt ? hopur.slice(hopur.length - t.sleppt) : []);
  for (const e of allt) if (!prentud.has(e)) prenta(e, null, timaThakSett.has(e) ? 'utan tímaþaks' : undefined);   // ekki sendar: noai, utan tímaþaks eða enginn lykill
  if (t) {
    const { hafnadar, ...tolur } = t;
    skrifa('### Samantekt\n\nTölfræði: ' + JSON.stringify(tolur) + (hafnadar.length ? '\n\n' + hafnadarLinur(hafnadar).join('\n') : '') + '\n');
  }
}

// ── Aðal ──────────────────────────────────────────────────────
async function main() {
  try { slugifyIS = (await import('../src/lib/format.mjs')).slugify; } catch (e) { console.error('slugify vantar — svæðis-skynjari sleppt:', String(e).slice(0, 100)); }
  const state = J('frettavel_state.json') || {};
  const events = detect(state);
  // RÁS-projection á macro-fréttir (regla per skynjara). Þögult ef módel vantar eða projection = null.
  if (RAS_CTX) {
    const { projectRas } = await import('../src/lib/roads/frett-ras.mjs');
    for (const e of events) {
      const mk = RAS_MAP[e.type];
      if (!mk || !e.facts) continue;
      const trig = mk(e.facts);
      if (!trig) continue;
      const proj = projectRas(trig, RAS_CTX);
      if (proj) e.facts.ras = proj;
    }
  }
  // „5 mál vikunnar" — vikuleg samantekt (mánudaga). Raðar safninu (síðustu 7 daga) eftir vægi; noai (fastur listi).
  if (new Date(TODAY + 'T00:00:00Z').getUTCDay() === 1) {
    const { weightOf, catOf, asciiId } = await import('../web/src/lib/frettavel.mjs');
    const arch = (J('frettavel_archive.json') || {}).items || [];
    const vikan = pickVikan([...events, ...arch], { todayISO: TODAY, weightOf, catOf, asciiId });
    if (vikan) events.push(vikan);
  }
  if (NYTT) {
    const { baetaVidBakgrunni } = await import('./lib/frettasamhengi.mjs');
    console.log('Bakgrunnur bættur við', baetaVidBakgrunni(events, gognBakgrunns(), { idag: TODAY, state }), 'atburði');
  }
  if (!THURR) fs.writeFileSync(G('frettavel_state.json'), JSON.stringify(state));
  const seen = J('frettavel_seen.json') || {};
  const fresh = events.filter((e) => !seen[e.id]);
  // JAFNVÆGI: hámark 3 fréttir af hverri tegund á dag svo engin ein uppspretta (t.d. markaðir) drottni.
  // Umfram-fréttir eru EKKI merktar séðar → birtast næstu daga þegar rúm er (dreifir fjölbreytni yfir tíma).
  const perType = {};
  const published = fresh.filter((e) => { perType[e.type] = (perType[e.type] || 0) + 1; return perType[e.type] <= 3; });
  console.log('Atburðir fundnir:', events.length, '· nýir:', fresh.length, '· birtir:', published.length, '·', published.map((e) => e.type + ':' + e.id.slice(0, 34)).join(' | ') || '—');
  if (THURR) { await prufukeyrsla(published, state); return; }

  if (NYTT) {
    const { skrifaFrettir, hafnadarLinur } = await import('./lib/frettaskrif.mjs');
    const client = nyrClient();
    const t = client ? await skrifaFrettir(published, { client, model: process.env.KARP_FRETTAVEL_MODEL || undefined }) : null;
    if (!t) console.log('Ný ritun: (enginn lykill — sniðmát)');
    else { const { hafnadar, ...tolur } = t; console.log('Ný ritun:', JSON.stringify(tolur)); hafnadarLinur(hafnadar).forEach((l) => console.log(l)); }
  } else {
    const aiN = await aiWrite(published);
    console.log('AI-skrifaðar:', aiN, 'af', Math.min(published.length, 16), process.env.ANTHROPIC_API_KEY ? '' : '(enginn lykill — sniðmát)');
  }

  const old = (J('frettavel.json') || {}).items || [];
  const items = published.map((e) => ({ id: e.id, date: TODAY, type: e.type, title: e.title, text: e.text, url: e.url, ai: !!e.ai, spark: (e.spark && e.spark.length >= 4) ? e.spark : undefined, samhengi: e.samhengi || undefined }))
    .concat(old.filter((o) => !published.some((f) => f.id === o.id)))
    .slice(0, 120);
  // Leiðrétta úreltar frumgagna-slóðir (síður undir /atvinnuvegir/) í öllum birtum fréttum — líka eldri.
  const URLFIX = { '/sjavarutvegur/': '/atvinnuvegir/sjavarutvegur/', '/vorumerki/': '/atvinnuvegir/hugverk/' };
  items.forEach((it) => { if (URLFIX[it.url]) it.url = URLFIX[it.url]; });

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
  // Varanlegt safn (500 nýjustu, ber `facts`) fyrir sér-fréttasíður — permalink /frettavel/<id>/ hverfur EKKI
  // þótt frétt detti úr forsíðu-straumnum (feed-cap). facts → „Aðferð Karp" á article-síðunni.
  const arch0 = (J('frettavel_archive.json') || {}).items || [];
  // Safnið = birtar fréttir dagsins (m/facts) → allur straumurinn (items, þ.m.t. eldri) → fyrra safn. Dedup á id
  // svo HVER frétt á forsíðunni eigi sér article-síðu (ekkert 404), og eldri fréttir haldist sem permalink.
  const archById = new Map();
  for (const e of published) archById.set(e.id, { id: e.id, date: TODAY, type: e.type, title: e.title, text: e.text, url: e.url, ai: !!e.ai, spark: (e.spark && e.spark.length >= 4) ? e.spark : undefined, samhengi: e.samhengi || undefined, facts: e.facts || undefined });
  // ⚠ SAFNIÐ Á UNDAN STRAUMNUM: `items` er hvítlistuð (ENGIN facts, sjá l. ~949) en `arch0` geymir
  // facts — þ.m.t. RÁS-kassann. Öfug röð þurrkaði facts út daginn eftir birtingu, svo `facts.ras`
  // komst ALDREI á permalink-síðu (0 af 222 færslum höfðu kassa þegar þetta fannst).
  for (const a of arch0) if (!archById.has(a.id)) archById.set(a.id, a);
  for (const it of items) if (!archById.has(it.id)) archById.set(it.id, it);
  const archItems = [...archById.values()].slice(0, 500);
  archItems.forEach((it) => { if (URLFIX[it.url]) it.url = URLFIX[it.url]; });
  const archive = JSON.stringify({ updated: new Date().toISOString(), n: archItems.length, items: archItems });
  fs.writeFileSync(G('frettavel_archive.json'), archive);
  fs.writeFileSync(path.join(pub, 'frettavel_archive.json'), archive);
  fs.writeFileSync(path.join(__dirname, '..', 'web', 'public', 'frettavel.xml'), rss(feed));
  console.log('Skrifað: frettavel.json (' + feed.length + ') + frettavel_archive.json (' + archItems.length + ') + frettavel.xml (RSS)');
}
// Keyrt beint => byggja. Flutt inn (próf) => aðeins föllin: main() keyrir EKKI og ekkert er skrifað.
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { synishornUrSafni, vorumerkjaKt, prufukeyrsla };
