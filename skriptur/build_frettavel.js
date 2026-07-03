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
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
const manIS = (ym) => { const m = String(ym).match(/(\d{4})-(\d{2})/); return m ? MAN[+m[2] - 1] + ' ' + m[1] : ym; };

// ── Detectorar ────────────────────────────────────────────────
function detect() {
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
  const events = detect();
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
