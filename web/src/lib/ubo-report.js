// ── 🔗 Endanlegir eigendur (UBO) — sameiginleg skýrsluvél ────────────────────
// Dregið út úr fyrirtaeki.astro (LOTA 111) svo /fyrirtaeki/ OG /eigendur/ noti
// sömu vél. Engin tvítekin rökvísi. Public API neðst.
import { isAdmin, hasReport, karpCheckout, helpNote, loginHref } from './auth.js';
import { pendingBarHtml, pollUntilChanged } from './report-nav.js';
import { escF, ktFmt } from './snid.mjs';

const eigPctFmt = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + '%');
const eigNorm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
const eigMkr = (v, cur) => (v == null ? '—' : Math.round(v).toLocaleString('is-IS') + ' ' + (cur || 'm.kr'));
const eigOwnerKey = (nd) => ((nd.kt) ? nd.kt : eigNorm(nd.nafn) + '|' + (nd.faeding || ''));   // sami lykill og build_eigendur_reverse.mjs
const eigForeign = (r) => !!(r && r.rikisfang && !/ísland|iceland/i.test(String(r.rikisfang)));   // erlent ríkisfang
// F4/F5/F6 aukagögn — sótt einu sinni, cache-uð, öll null-þolin (brjóta ekki grunn-skýrsluna).
let _pepCache, _revCache;
async function eigPepSet() {
  if (_pepCache !== undefined) return _pepCache;
  try { const j = await fetch('/gogn/pep.json').then((r) => (r.ok ? r.json() : null)); _pepCache = j ? new Map((j.folk || []).map((p) => [eigNorm(p.nafn), p.hlutverk || ''])) : null; }
  catch (e) { _pepCache = null; }
  return _pepCache;
}
async function eigReverseData() {
  if (_revCache !== undefined) return _revCache;
  try { _revCache = await fetch('/gogn/eigendur_reverse.json').then((r) => (r.ok ? r.json() : null)); }
  catch (e) { _revCache = null; }
  return _revCache;
}
async function eigRootEigidfe(kt) {
  if (!kt) return null;
  try {
    const j = await fetch('/gogn/arsreikningar/' + String(kt).replace(/\D/g, '') + '.json').then((r) => (r.ok ? r.json() : null));
    if (!j || !j.ar) return null;
    for (const y of Object.keys(j.ar).sort().reverse()) {
      const a = j.ar[y];
      if (a && a.efnahagur && a.efnahagur.eigid_fe) return { mkr: a.efnahagur.eigid_fe * (a.kvardi || 1) / 1e6, ar: y, cur: (!a.mynt || a.mynt === 'ISK') ? 'm.kr' : ('m. ' + a.mynt) };
    }
    return null;
  } catch (e) { return null; }
}

function eigTable(rep, ctx) {
  const efe = ctx && ctx.eigidfe;                              // F6: bókfært eigið fé rótar (m.kr)
  const krCol = efe ? '<th>Bókfært virði*</th>' : '';
  const krCell = (hl) => (efe ? '<td class="eig-kr">' + (hl != null ? '≈ ' + eigMkr(hl / 100 * efe.mkr, efe.cur) : '—') + '</td>' : '');
  const rows = (rep.endanlegir || []).map((e) =>
    `<tr><td class="eig-nm"><span class="eig-dot ${e.tegund === 'felag' ? 'is-felag' : 'is-einst'}${e.hlutur >= 25 ? ' yfir' : ''}"></span>${escF(e.nafn)}${e.kt ? ' <span class="eig-kt">' + escF(ktFmt(e.kt)) + '</span>' : (e.faeding ? ' <span class="eig-kt">f. ' + escF(e.faeding) + '</span>' : '')}</td>`
    + `<td class="eig-pct">${eigPctFmt(e.hlutur)}${e.hlutur > 0 ? '<span class="eig-pbar"><i style="width:' + Math.min(100, e.hlutur).toFixed(0) + '%"></i></span>' : ''}</td>${krCell(e.hlutur)}`
    + `<td class="eig-geg">${e.gegnum && e.gegnum.length ? e.gegnum.map(escF).join(', ') : '<span class="eig-direct">Bein eign</span>'}</td></tr>`).join('');
  const othekkt = (rep.othekkt || 0) > 0.005 ? `<tr class="eig-othekkt"><td>Óþekktir endanlegir eigendur</td><td class="eig-pct">${eigPctFmt(rep.othekkt)}</td>${efe ? '<td></td>' : ''}<td></td></tr>` : '';
  return `<table class="eig-tafla"><thead><tr><th>Endanlegur eigandi</th><th>Eignarhluti</th>${krCol}<th>Eignatengsl í gegnum</th></tr></thead>`
    + `<tbody>${rows}${othekkt}</tbody><tfoot><tr><td>Samtals</td><td class="eig-pct">100,00%</td>${efe ? '<td></td>' : ''}<td></td></tr></tfoot></table>`
    + (efe ? `<p class="eig-krnote">* Bókfært virði = eignarhluti × bókfært eigið fé félagsins skv. ársreikningi ${escF(efe.ar)} (${eigMkr(efe.mkr, efe.cur)}). Ekki markaðsvirði né verðmat.</p>` : '');
}
function eigRaunv(rep, ctx) {
  if (rep.raunverulegirTomt) return '<p class="eig-tom">Enginn einstaklingur skráður með raunverulegt eignarhald yfir 25% — dæmigert fyrir dreift eða skráð eignarhald.</p>';
  if (!(rep.raunverulegir || []).length) return '<p class="eig-tom">Raunverulegir eigendur ekki skráðir í fyrirtækjaskrá.</p>';
  const efe = ctx && ctx.eigidfe;
  const hlNum = (s) => { const m = String(s == null ? '' : s).replace(',', '.').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
  const krCol = efe ? '<th>Bókfært virði*</th>' : '';
  const krCell = (s) => { if (!efe) return ''; const h = hlNum(s); return '<td class="eig-kr">' + (h != null ? '≈ ' + eigMkr(h / 100 * efe.mkr, efe.cur) : '—') + '</td>'; };
  const rows = rep.raunverulegir.map((e) =>
    `<tr${eigForeign(e) ? ' class="eig-foreign"' : ''}><td>${escF(e.nafn)}</td><td>${escF(e.faeding || '—')}</td><td>${escF(e.buseta || '—')}</td><td>${escF(e.rikisfang || '—')}${eigForeign(e) ? ' 🌍' : ''}</td><td>${escF(e.tegund || '—')}</td><td class="eig-pct">${escF(e.hlutur || '—')}</td>${krCell(e.hlutur)}</tr>`).join('');
  return `<table class="eig-tafla"><thead><tr><th>Aðili</th><th>Fæðingarár/mán</th><th>Búsetuland</th><th>Ríkisfang</th><th>Tegund eignahalds</th><th>Eignarhlutur</th>${krCol}</tr></thead><tbody>${rows}</tbody></table>`
    + (efe ? `<p class="eig-krnote">* Bókfært virði = eignarhluti × bókfært eigið fé (ársreikn. ${escF(efe.ar)}). Ekki markaðsvirði.</p>` : '');
}
function eigHluthafar(rep) {
  if (!(rep.hluthafar || []).length) return '<p class="eig-tom">Hluthafalisti er ekki tilgreindur í nýjasta ársreikningi félagsins.</p>';
  const rows = rep.hluthafar.map((h) =>
    `<tr><td>${escF(h.nafn)}${h.kt ? ' <span class="eig-kt">' + escF(ktFmt(h.kt)) + '</span>' : ''}</td><td class="eig-pct">${eigPctFmt(h.hlutur)}</td><td>${escF(h.dags || '—')}</td><td>${escF(h.heimild || '—')}</td></tr>`).join('');
  return `<table class="eig-tafla"><thead><tr><th>Hluthafi</th><th>Eignarhluti</th><th>Dags. heimildar</th><th>Heimild</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function eigPie(rep) {
  const hs = (rep.hluthafar || []).filter((h) => h.hlutur > 0).slice(0, 8);
  if (!hs.length) return '';
  const cols = ['#f6b13b', '#5aa9e6', '#6ee7b7', '#c084fc', '#f87171', '#fbbf24', '#38bdf8', '#a3e635'];
  const tot = hs.reduce((s, h) => s + h.hlutur, 0) || 1;
  let a = -Math.PI / 2, seg = '';
  hs.forEach((h, i) => {
    const frac = h.hlutur / tot, a2 = a + frac * 2 * Math.PI, big = frac > 0.5 ? 1 : 0;
    const x1 = 60 + 55 * Math.cos(a), y1 = 60 + 55 * Math.sin(a), x2 = 60 + 55 * Math.cos(a2), y2 = 60 + 55 * Math.sin(a2);
    seg += `<path d="M60 60 L${x1.toFixed(1)} ${y1.toFixed(1)} A55 55 0 ${big} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${cols[i % cols.length]}" stroke="#0b0f17" stroke-width="1"/>`;
    a = a2;
  });
  const leg = hs.map((h, i) => `<span class="eig-leg-i"><i style="background:${cols[i % cols.length]}"></i>${escF(h.nafn)} (${eigPctFmt(h.hlutur)})</span>`).join('');
  return `<div class="eig-pie"><svg viewBox="0 0 120 120" width="140" height="140" role="img" aria-label="Skipting hluthafa">${seg}</svg><div class="eig-pie-leg">${leg}</div></div>`;
}
// F4 — öfugt eignarhaldsnet: önnur félög sem eigendur ÞESSA félags eiga einnig (úr eigendur_reverse.json).
function eigReverse(rep, ctx) {
  if (!ctx || !ctx.reverse || !ctx.reverse.byOwner) return '';
  const rootKt = ctx.kt, seen = new Set(), items = [];
  for (const nd of (rep.net && rep.net.nodes || [])) {
    if (nd.er_rot) continue;
    const key = eigOwnerKey(nd);
    if (!key || key === '|' || seen.has(key)) continue;
    seen.add(key);
    const rec = ctx.reverse.byOwner[key];
    if (!rec) continue;
    const others = (rec.a || []).filter((c) => c.kt && c.kt !== rootKt);
    if (!others.length) continue;
    items.push({ nafn: nd.nafn, others });
  }
  if (!items.length) return '';
  const body = items.map((it) =>
    '<div class="eig-rev-r"><span class="eig-rev-o">' + escF(it.nafn) + '</span><span class="eig-rev-c">'
    + it.others.map((c) => '<a href="/fyrirtaeki/?q=' + encodeURIComponent(c.kt) + '">' + escF(c.nafn) + (c.hlutur != null ? ' <em>(' + eigPctFmt(c.hlutur) + ')</em>' : '') + '</a>').join('') + '</span></div>').join('');
  return '<h4 class="eig-sec">Önnur félög sömu eigenda</h4>'
    + '<p class="eig-cap">Önnur íslensk félög sem eigendur þessa félags eiga einnig í — byggt á félögum sem Karp hefur rakið (vex eftir því sem fleiri eignatengsl bætast við).</p>'
    + '<div class="eig-rev">' + body + '</div>';
}
function eigSources(rep) {
  return `<div class="eig-src">ⓘ Skýrslan byggir á opinberum gögnum: hlutafélagaskrá og ársreikningaskrá RSK, skráðum raunverulegum eigendum frá Skattinum${rep.afmarkad ? ', og er afmörkuð við ' + (rep.dypt || 0) + ' þrep eignarhalds' : ''}. Eignatengsl eru skráð eða möguleg — án kennitölu einstaklinga er sömu-manneskju-tenging milli félaga ekki tæmandi. Karp birtir hvorki lánshæfismat né vanskilaskrá. Sótt: ${escF(rep.sott || '—')}.</div>`;
}
async function eigData(kt, owned) {
  let missing = false;
  try {
    const r = await fetch('/gogn/eigendur/' + kt + '.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j && j.engin) return { engin: true, ...j }; return j; }
    if (r.status === 404) missing = true;
  } catch (e) { return null; }
  if (missing && owned) { try { fetch('/api/eigendur/request?kt=' + kt, { method: 'POST', credentials: 'include' }); } catch (e) {} return { pending: true }; }
  return null;
}
// Auðgun 11 — erlent eignarhald: raunverulegir eigendur með erlent ríkisfang (KYC-áhætta).
function eigErlent(rep) {
  const fs = (rep.raunverulegir || []).filter(eigForeign);
  if (!fs.length) return '';
  return '<div class="eig-erlent">🌍 <b>Erlent eignarhald</b> — raunverulegir eigendur með erlent ríkisfang: '
    + fs.map((r) => escF(r.nafn) + ' <span class="eig-kt">(' + escF(r.rikisfang) + ')</span>').join('; ')
    + '. <span class="eig-erlent-n">Getur kallað á aukna skjölun við áreiðanleikakönnun (PEP-/refsilista-athugun þvert á lögsögur).</span></div>';
}
// Auðgun 12 — samstæðukort niður: félög sem RÓTIN sjálf á eignarhlut í (reverse[rootKt]).
function eigSubsidiaries(rep, ctx) {
  if (!ctx || !ctx.reverse || !ctx.reverse.byOwner || !ctx.kt) return '';
  const rec = ctx.reverse.byOwner[ctx.kt];
  const subs = rec && rec.a ? rec.a.filter((c) => c.kt && c.kt !== ctx.kt) : [];
  if (!subs.length) return '';
  const body = subs.map((c) => '<a class="eig-sub-i" href="/fyrirtaeki/?q=' + encodeURIComponent(c.kt) + '">' + escF(c.nafn) + (c.hlutur != null ? ' <em>(' + eigPctFmt(c.hlutur) + ')</em>' : '') + '</a>').join('');
  return '<h4 class="eig-sec">Dótturfélög og eignarhlutir</h4>'
    + '<p class="eig-cap">Félög sem félagið á eignarhlut í — byggt á félögum sem Karp hefur rakið (vex með þekju).</p>'
    + '<div class="eig-subs">' + body + '</div>';
}
function eigReport(rep, kt, ctx) {
  return '<div class="eig-report" id="eig-report">'
    + '<div class="eig-h"><h3>Endanlegir eigendur</h3><button type="button" class="eig-print" id="eig-print">🖨️ Prenta / PDF</button></div>'
    + (kt ? '<div class="eig-related"><a class="eig-fulllink" href="/fyrirtaeki/?q=' + encodeURIComponent(kt) + '">🏢 Fyrirtækjaskýrsla →</a><a class="eig-fulllink" href="/fyrirtaeki/?vidmot=areidanleiki&q=' + encodeURIComponent(kt) + '">🛡️ Áreiðanleikamat →</a></div>' : '')
    + '<p class="eig-intro">Endanlegir eigendur innihalda upplýsingar um eigendur íslenskra fyrirtækja og vensl þeirra. Upplýsingarnar byggja á gögnum úr hlutafélagaskrá, ársreikningum og skráðum raunverulegum eigendum frá Skattinum. Jafnframt fylgir listi yfir skráða hluthafa.</p>'
    + '<h4 class="eig-sec">Yfirlit yfir endanlega eigendur</h4>'
    // 🕸️ Tengslakortið er nú EINA myndræna netið (fliparnir Listi/Kort fjarlægðir — kortið er sjálfgefið).
    + '<p class="eig-cap">Myndrænt net eignarhalds (heil lína, %) og stjórnar/fyrirsvars (brotalína) þvert á félög. Fjarlægari einstaklingar eru grímuklæddir skv. persónuverndarstefnu — nöfn þeirra fara ekki í vafrann.</p>'
    + '<div class="eig-kort-host" id="eig-kort-host"></div>'
    + eigTable(rep, ctx)
    + eigReverse(rep, ctx) + eigSubsidiaries(rep, ctx)
    + '<div id="eig-stjornir"></div>'
    + '<h4 class="eig-sec">Raunverulegir eigendur samkvæmt fyrirtækjaskrá</h4>' + eigErlent(rep) + eigRaunv(rep, ctx)
    + '<h4 class="eig-sec">Yfirlit yfir hluthafa</h4>' + eigPie(rep) + eigHluthafar(rep)
    + eigSources(rep)
    + '</div>';
}
// 🪑 Stjórnendatengsl (F10) — lifandi úr /api/tengslanet (RSK opinbert API): stjórn/framkvæmdastjórn/
// prókúra rótarinnar + í hvaða ÖÐRUM félögum innan eignarhaldsnetsins sama fólk gegnir hlutverkum.
// Null-þolið: hólfið er einfaldlega tómt ef endapunkturinn svarar ekki / er unconfigured.
async function eigStjornir(rootKt) {
  const holf = document.getElementById('eig-stjornir');
  if (!holf || !rootKt) return;
  try {
    const d = await fetch('/api/tengslanet?kt=' + encodeURIComponent(rootKt), { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null));
    if (!d || !d.holdur || !(d.stjornendur || []).length) return;
    const rows = d.stjornendur.map((p) => {
      const onnur = (p.onnur || []).map((o) =>
        '<a href="/fyrirtaeki/?q=' + encodeURIComponent(o.kt) + '">' + escF(o.nafn) + ' <em>' + escF(o.hlutverk || '') + '</em></a>').join('');
      return '<div class="eig-stj-r"><span class="eig-stj-p">' + escF(p.nafn) + '<br><span class="eig-stj-h">' + escF((p.hlutverk_rot || []).join(' · ')) + '</span></span>'
        + '<span class="eig-stj-c">' + (onnur || '<span class="eig-stj-h">engin önnur hlutverk fundin innan netsins</span>') + '</span></div>';
    }).join('');
    const krossar = (d.krossar || []).length
      ? '<p class="eig-cap" style="margin-top:10px"><b>Krosstengsl:</b> ' + d.krossar.map((p) => escF(p.nafn) + ' (' + (p.felog || []).map((f) => escF(f.nafn)).join(', ') + ')').join('; ') + '</p>'
      : '';
    holf.innerHTML = '<h4 class="eig-sec">Stjórnendatengsl — stjórn, framkvæmdastjórn og prókúra</h4>'
      + '<p class="eig-cap">Fyrirsvarsmenn félagsins og hlutverk sama fólks í öðrum félögum <b>innan greinds eignarhaldsnets</b> (' + (d.n_felog || 1) + ' félög skoðuð) — beint úr opinberu API fyrirtækjaskrár Skattsins. Samsvörun er nákvæm (kennitölu-byggð hjá Skattinum) en birt án kennitalna einstaklinga.</p>'
      + '<div class="eig-stj">' + rows + '</div>' + krossar;
  } catch (e) {}
}
// 🕸️ Tengslakortið — eina myndræna netið (engir flipar). Einingin sjálf er áfram lazy-import
// (tengslakort.mjs + cytoscape af CDN) svo hún þyngir ekki fyrstu hleðslu skýrslunnar.
async function eigMountKort(rep, rootKt, pepSet) {
  const host = document.getElementById('eig-kort-host');
  if (!host || host.dataset.done) return;
  host.dataset.done = '1';
  host.innerHTML = '<div class="eig-kort-load">🕸️ Hleð tengslakorti…</div>';
  let stjornData = null;   // null-þolið: án innskráningar / í sýnishorni skilar þetta null → eignarhalds-kort eitt
  if (rootKt) { try { stjornData = await fetch('/api/tengslanet?kort=1&kt=' + encodeURIComponent(rootKt), { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null)); } catch (e) {} }
  try {
    const { renderTengslakort } = await import('./tengslakort.mjs');
    host.innerHTML = '';
    // F5: PEP-samsvörun flyst inn í kortið (sama nafna-norm og listinn notaði) → 🏛️-merki + gullhringur.
    const pepLookup = pepSet ? (nafn) => pepSet.get(eigNorm(nafn)) || null : null;
    await renderTengslakort(host, { rotKt: rootKt, eignData: rep, stjornData, pepLookup });
  } catch (e) { host.innerHTML = '<div class="eig-tom">Ekki tókst að hlaða tengslakorti.</div>'; }
}
// Setur skýrsluna í gám, teiknar netið, tengir prentun.
async function eigMount(rep, host, nav, kt) {
  const rootKt = kt || ((rep.net && rep.net.nodes || []).find((n) => n.er_rot) || {}).kt || null;
  // F4/F5/F6 aukagögn samhliða (öll null-þolin → grunn-skýrslan brotnar ekki þótt þau vanti).
  const [pepSet, eigidfe, reverse] = await Promise.all([eigPepSet(), eigRootEigidfe(rootKt), eigReverseData()]);
  const hasPep = !!(pepSet && (rep.net && rep.net.nodes || []).some((n) => !n.er_rot && n.tegund !== 'felag' && pepSet.get(eigNorm(n.nafn))));
  const ctx = { pepSet, eigidfe, reverse, kt: rootKt, hasPep };
  host.innerHTML = eigReport(rep, kt, ctx);
  eigStjornir(rootKt);   // 🪑 F10 fyllist async — brýtur ekkert þótt endapunktur svari ekki
  eigMountKort(rep, rootKt, pepSet);   // 🕸️ Tengslakortið strax (sjálfgefið, engir flipar)
  const pb = document.getElementById('eig-print');
  if (pb) pb.onclick = () => { document.body.classList.add('fs-printing'); window.print(); setTimeout(() => document.body.classList.remove('fs-printing'), 600); };
}

// Tómstöðu-skýrsla (engin:true) — hvorki hluthafalisti né raunverulegir eigendur fundust.
// Í stað dauðrar endastöðvar: skýr útskýring (dreift/skráð eignarhald) + stjórnenda-/
// fyrirsvarstengsl (úr /api/tengslanet — birtast þótt eignarhald sé óskráð) + dótturfélög
// sem félagið sjálft á í (úr eigendur_reverse.json). Sömu paywall-forsendur og full skýrsla.
function eigEmptyReport(rep, kt, ctx) {
  const subs = eigSubsidiaries(rep || {}, ctx);
  return '<div class="eig-report" id="eig-report">'
    + '<div class="eig-h"><h3>Endanlegir eigendur</h3><button type="button" class="eig-print" id="eig-print">🖨️ Prenta / PDF</button></div>'
    + (kt ? '<div class="eig-related"><a class="eig-fulllink" href="/fyrirtaeki/?q=' + encodeURIComponent(kt) + '">🏢 Fyrirtækjaskýrsla →</a><a class="eig-fulllink" href="/fyrirtaeki/?vidmot=areidanleiki&q=' + encodeURIComponent(kt) + '">🛡️ Áreiðanleikamat →</a></div>' : '')
    + '<div class="eig-empty">'
    +   '<div class="eig-empty-h"><span class="eig-empty-ico">🔎</span><h4>Engir endanlegir eigendur skráðir</h4></div>'
    +   '<p>Hvorki hluthafalisti í nýjasta ársreikningi félagsins né skráðir raunverulegir eigendur (yfir 25%) fundust hjá Skattinum. Þetta á oftast við um félög með <b>dreift eða skráð eignarhald</b> — t.d. félög skráð á markað eða í eigu margra smærri hluthafa — þar sem enginn einn aðili nær því 25% raunverulegu eignarhaldi sem skylt er að skrá.</p>'
    +   '<p class="eig-empty-sub">Það þýðir <b>ekki</b> að engar upplýsingar séu til. Hér að neðan birtast stjórnenda- og fyrirsvarstengsl félagsins, og eignarhlutir sem félagið sjálft á í öðrum félögum — eftir því sem þau eru skráð í opinberum gögnum.</p>'
    + '</div>'
    + '<div id="eig-stjornir"></div>'
    + subs
    + eigSources(rep || {})
    + '</div>';
}
async function eigMountEmpty(rep, host, nav, kt) {
  const rootKt = kt || (rep && rep.kt) || null;
  const reverse = await eigReverseData().catch(() => null);   // dótturfélög: félög sem RÓTIN á í
  const ctx = { reverse, kt: rootKt };
  host.innerHTML = eigEmptyReport(rep, rootKt, ctx);
  eigStjornir(rootKt);   // fyllir #eig-stjornir async — stjórn/framkvæmdastjórn úr RSK-API (null-þolið, eigin fyrirsögn)
  const pb = document.getElementById('eig-print');
  if (pb) pb.onclick = () => { document.body.classList.add('fs-printing'); window.print(); setTimeout(() => document.body.classList.remove('fs-printing'), 600); };
}

// ── Public API ───────────────────────────────────────────────────────────────
export function uboOwned(kt) { return isAdmin() || hasReport('eigendur:' + kt); }

function uboCtaHtml(kt, nafn) {
  return '<div class="eig-cta"><b>🔗 Endanlegir eigendur</b>'
    + '<span>Full, litakóðuð eignarhaldsskýrsla: endanlegir eigendur í gegnum allar félagakeðjur, raunverulegir eigendur, hluthafalisti og prentvæn PDF — sérskýrsla eins og hjá Creditinfo.</span>'
    + '<div class="eig-cta-btns"><button type="button" class="eig-buy" data-kt="' + escF(kt) + '" data-nafn="' + escF(nafn || '') + '">🛒 Kaupa eigenda-skýrslu — 990 kr</button>'
    + '<a class="eig-sample" href="/eigendur/?syni=1">👁️ Sjá sýnishorn</a></div>'
    + '<p class="eig-cta-sub">Þarftu fleiri skýrslur? <a href="/karp-pro/#verd">⭐ Komdu í áskrift — frá 2.900 kr/mán →</a></p></div>';
}

function wireBuy(hostEl, kt, nafn) {
  const buy = hostEl.querySelector('.eig-buy'); if (!buy) return;
  // Þrepa-áskrifandi með innifaldar skýrslur → „Opna með áskrift" (sami server-kvóti og fyrirtækja-/KYC-skýrslur).
  const AU = (typeof window !== 'undefined') && window.karpAuth;
  const rem = (AU && AU.reportsRemaining) ? AU.reportsRemaining() : 0;
  const qbtns = hostEl.querySelector('.eig-cta-btns');
  if (rem !== 0 && AU && AU.openReport) {
    const qb = document.createElement('button');
    qb.type = 'button'; qb.className = 'eig-buy';
    qb.textContent = '📄 Opna með áskrift';
    buy.parentNode.insertBefore(qb, buy);
    buy.textContent = '🛒 eða kaupa staka — 990 kr';
    qb.addEventListener('click', async () => {
      qb.disabled = true; qb.textContent = 'Opna…';
      const r = await AU.openReport('eigendur:' + kt, (nafn || kt) + ' — eigendaskýrsla');
      if (r && (r.granted || r.owned)) { location.reload(); return; }
      if (r && r.needPay) { qb.remove(); buy.textContent = '🛒 Kaupa eigenda-skýrslu — 990 kr'; if (AU.paintReportQuota) AU.paintReportQuota(qbtns); return; }
      qb.disabled = false; qb.textContent = 'Ekki tókst — reyndu aftur';
    });
  }
  if (AU && AU.paintReportQuota) AU.paintReportQuota(qbtns);   // teljari „N skýrslur eftir í mánuðinum" + upsell
  buy.addEventListener('click', async () => {
    const orig = buy.textContent; buy.disabled = true; buy.textContent = '⏳ Opna greiðslu…';
    const res = await karpCheckout({ kind: 'eigendur', ref: (nafn || '') + ' ' + kt, key: 'eigendur:' + kt }, hostEl.querySelector('.eig-cta'));
    if (res === 'redirected' || res === 'embedded') return;
    buy.textContent = res === 'unconfigured' ? 'Greiðslur opna fljótlega' : 'Ekki tókst — reyndu aftur';
    helpNote(buy);
    buy.disabled = false; setTimeout(() => { buy.textContent = orig; }, 2800);
  });
}

const defaultNav = (kt) => { try { location.href = '/eigendur/?q=' + encodeURIComponent(kt); } catch (e) {} };

// Heildar-flæði: gátun → (990 kr CTA | sótt+poll → net+töflur). hostEl er tómur gámur.
export function mountUboReport({ kt, nafn, hostEl, navTo }) {
  if (!hostEl) return;
  const nav = navTo || defaultNav;
  if (!uboOwned(kt)) { hostEl.innerHTML = uboCtaHtml(kt, nafn); wireBuy(hostEl, kt, nafn); return; }
  let barSett = false;   // stikan birtist aðeins þegar bygging er raunverulega í gangi (fyrsta poll = 404/pending)
  let tries = 0;
  const tick = async () => {
    const d = await eigData(kt, true);
    if (d && !d.pending && !d.engin) { eigMount(d, hostEl, nav, kt); return; }
    if (d && d.engin) { eigMountEmpty(d, hostEl, nav, kt); return; }
    if (!barSett) {   // sama hleðslustika og á fjárhagsmælaborðinu (deild úr report-nav.js)
      barSett = true;
      hostEl.innerHTML = pendingBarHtml({
        title: 'Rek eignarhald gegnum allar félagakeðjur beint úr RSK…',
        sub: 'Sæki hluthafalista og raunverulega eigendur hvers félags í keðjunni',
        note: '🔄 Skýrslan birtist sjálfkrafa þegar hún er tilbúin — í fyrsta skipti getur þetta tekið 1–2 mín; svo vistast hún og opnast samstundis eftirleiðis.',
        sfx: '-eig',
      });
      pollUntilChanged({ url: '/gogn/eigendur/' + kt + '.json', est: 120, sfx: '-eig', onDone: () => {} });   // stikan tifar; tick() sér um raun-birtingu
    }
    if (tries++ < 80) setTimeout(tick, tries < 12 ? 2000 : 3500);   // hraðari fyrstu pollin → grípur fljótari byggingar fyrr
    else hostEl.innerHTML = '<div class="eig-tom">Skýrslan er enn í vinnslu — endurhlaðið síðuna eftir smástund (hún vistast þegar hún er tilbúin).</div>';
  };
  tick();
}

// 🔄 „Sækja aftur": endurkeyrir eigenda-bygginguna (GH-dispatch), sýnir hleðslustiku og
// endurbirtir skýrsluna þegar NÝJA skráin (≠ baseline) er komin.
export async function refreshUboReport({ kt, hostEl, navTo, btn }) {
  if (!hostEl || !uboOwned(kt)) return;   // ⚠ paywall: aðeins eigandi/admin má endurbyggja og fá skýrsluna birta
  const nav = navTo || defaultNav;
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Bið RSK…'; }
  let baseline = null;
  try { const r0 = await fetch('/gogn/eigendur/' + kt + '.json?t=' + Date.now(), { cache: 'no-store' }); if (r0.ok) baseline = await r0.text(); } catch (e) {}
  let ok = false;
  try {
    const rr = await fetch('/api/eigendur/request?kt=' + kt, { method: 'POST', credentials: 'include' });
    const j = await rr.json().catch(() => null); ok = !!(j && j.ok);
    if (j && j.error === 'login') { location.href = loginHref(); return; }
  } catch (e) {}
  if (!ok) { if (btn) { btn.textContent = 'Ekki tókst — reyndu aftur'; setTimeout(() => { btn.textContent = '🔄 Sækja aftur'; btn.disabled = false; }, 2600); } return; }
  if (btn) btn.textContent = '🔄 Sæki…';
  hostEl.innerHTML = pendingBarHtml({
    title: 'Sæki eignarhaldið aftur frá RSK og endurreikna…',
    sub: 'Rek hluthafakeðjur og raunverulega eigendur upp á nýtt',
    note: '🔄 Skýrslan birtist sjálfkrafa með nýjum gildum — tekur venjulega 1–2 mín.',
    sfx: '-eigr',   // sér-id svo mount-pollinn (sfx '-eig') ruglist ekki við þennan
  });
  pollUntilChanged({
    url: '/gogn/eigendur/' + kt + '.json', baseline, est: 120, sfx: '-eigr',
    onDone: (txt, stale) => {
      if (btn) { btn.textContent = '🔄 Sækja aftur'; btn.disabled = false; }
      try { const d = JSON.parse(txt); if (d && d.engin) { eigMountEmpty(d, hostEl, nav, kt); return; } if (d && !d.engin) { eigMount(d, hostEl, nav, kt); if (stale) setTimeout(() => { const h = document.getElementById('eig-report'); if (h) h.insertAdjacentHTML('afterbegin', '<p class="eig-cap">ⓘ Engin ný gögn hjá RSK — skýrslan er óbreytt.</p>'); }, 50); return; } } catch (e) {}
      hostEl.innerHTML = '<div class="eig-tom">Endurbyggingin skilaði engu neti — endurhlaðið síðuna.</div>';
    },
  });
}

// Opið sýnishorn (Gervifyrirtæki) — engin innskráning/kaup.
export function renderUboSample(hostEl, opts) {
  opts = opts || {};
  const nav = opts.navTo || defaultNav;
  if (!hostEl) return Promise.resolve();
  return fetch('/gogn/eigendur/_synishorn.json').then((r) => r.json()).then((rep) => { eigMount(rep, hostEl, nav); return rep; })
    .catch(() => { hostEl.innerHTML = '<p class="eig-tom">Villa við að sækja sýnishorn.</p>'; });
}
