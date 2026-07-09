// ── 🔗 Endanlegir eigendur (UBO) — sameiginleg skýrsluvél ────────────────────
// Dregið út úr fyrirtaeki.astro (LOTA 111) svo /fyrirtaeki/ OG /eigendur/ noti
// sömu vél. Engin tvítekin rökvísi. Public API neðst.
import { isAdmin, hasReport, karpCheckout } from './auth.js';

const escF = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ktFmt = (kt) => (kt && kt.length === 10 ? kt.slice(0, 6) + '-' + kt.slice(6) : kt || '');
const eigPctFmt = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + '%');

function eigTable(rep) {
  const rows = (rep.endanlegir || []).map((e) =>
    `<tr><td class="eig-nm"><span class="eig-dot ${e.tegund === 'felag' ? 'is-felag' : 'is-einst'}${e.hlutur >= 25 ? ' yfir' : ''}"></span>${escF(e.nafn)}${e.kt ? ' <span class="eig-kt">' + escF(ktFmt(e.kt)) + '</span>' : (e.faeding ? ' <span class="eig-kt">f. ' + escF(e.faeding) + '</span>' : '')}</td>`
    + `<td class="eig-pct">${eigPctFmt(e.hlutur)}</td>`
    + `<td class="eig-geg">${e.gegnum && e.gegnum.length ? e.gegnum.map(escF).join(', ') : '<span class="eig-direct">Bein eign</span>'}</td></tr>`).join('');
  const othekkt = (rep.othekkt || 0) > 0.005 ? `<tr class="eig-othekkt"><td>Óþekktir endanlegir eigendur</td><td class="eig-pct">${eigPctFmt(rep.othekkt)}</td><td></td></tr>` : '';
  return `<table class="eig-tafla"><thead><tr><th>Endanlegur eigandi</th><th>Eignarhluti</th><th>Eignatengsl í gegnum</th></tr></thead>`
    + `<tbody>${rows}${othekkt}</tbody><tfoot><tr><td>Samtals</td><td class="eig-pct">100,00%</td><td></td></tr></tfoot></table>`;
}
function eigRaunv(rep) {
  if (rep.raunverulegirTomt) return '<p class="eig-tom">Enginn einstaklingur skráður með raunverulegt eignarhald yfir 25% — dæmigert fyrir dreift eða skráð eignarhald.</p>';
  if (!(rep.raunverulegir || []).length) return '<p class="eig-tom">Raunverulegir eigendur ekki skráðir í fyrirtækjaskrá.</p>';
  const rows = rep.raunverulegir.map((e) =>
    `<tr><td>${escF(e.nafn)}</td><td>${escF(e.faeding || '—')}</td><td>${escF(e.buseta || '—')}</td><td>${escF(e.rikisfang || '—')}</td><td>${escF(e.tegund || '—')}</td><td class="eig-pct">${escF(e.hlutur || '—')}</td></tr>`).join('');
  return `<table class="eig-tafla"><thead><tr><th>Aðili</th><th>Fæðingarár/mán</th><th>Búsetuland</th><th>Ríkisfang</th><th>Tegund eignahalds</th><th>Eignarhlutur</th></tr></thead><tbody>${rows}</tbody></table>`;
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
function eigLegend() {
  return '<div class="eig-legend">'
    + '<span class="eig-lg"><i class="nd root"></i>Fyrirtækið</span>'
    + '<span class="eig-lg"><i class="nd einst yfir"></i>Eign einstaklings umfram 25%</span>'
    + '<span class="eig-lg"><i class="nd einst"></i>Eign einstaklings minni en 25%</span>'
    + '<span class="eig-lg"><i class="nd felag yfir"></i>Eign fyrirtækis umfram 25%</span>'
    + '<span class="eig-lg"><i class="nd felag"></i>Eign fyrirtækis minni en 25%</span>'
    + '<span class="eig-lg"><i class="ed b51"></i>Eign 51% eða meiri</span>'
    + '<span class="eig-lg"><i class="ed b25"></i>Eign á bilinu 25% til 51%</span>'
    + '<span class="eig-lg"><i class="ed blt"></i>Eign minni en 25%</span></div>';
}
function eigSources(rep) {
  return `<div class="eig-src">ⓘ Skýrslan byggir á opinberum gögnum: hlutafélagaskrá og ársreikningaskrá RSK, skráðum raunverulegum eigendum frá Skattinum${rep.afmarkad ? ', og er afmörkuð við ' + (rep.dypt || 0) + ' þrep eignarhalds' : ''}. Eignatengsl eru skráð eða möguleg — án kennitölu einstaklinga er sömu-manneskju-tenging milli félaga ekki tæmandi. Karp birtir hvorki lánshæfismat né vanskilaskrá. Sótt: ${escF(rep.sott || '—')}.</div>`;
}
function eigNet(rep) {
  return '<div class="eig-net-wrap" id="eig-net" role="group" aria-label="Eignarhaldsnet: endanlegir eigendur"></div>';
}
// Lagskipt útlit: rótin (félagið) EFST í lagi 0; eigendur neðar eftir dýpt keðjunnar. Leggir = inline SVG.
function eigWireNet(rep, nav) {
  const wrap = document.getElementById('eig-net');
  if (!wrap || wrap.dataset.done) return;
  wrap.dataset.done = '1';
  const nodes = rep.net.nodes, edges = rep.net.edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootId = (nodes.find((n) => n.er_rot) || nodes[0]).id;
  // dýpt hvers hnúts = fjarlægð frá rót eftir "á"-leggjum (fra -> til). Rót = 0, eigendur hennar = 1 …
  const depth = new Map([[rootId, 0]]);
  let changed = true, guard = 0;
  while (changed && guard++ < 40) { changed = false; for (const e of edges) { if (depth.has(e.til) && (!depth.has(e.fra) || depth.get(e.fra) < depth.get(e.til) + 1)) { depth.set(e.fra, depth.get(e.til) + 1); changed = true; } } }
  const maxD = Math.max(0, ...[...depth.values()]);
  const stakeOf = new Map();                          // hnútur -> stærsti eignarhlutur hans (fyrir yfir/undir 25%)
  for (const e of edges) stakeOf.set(e.fra, Math.max(stakeOf.get(e.fra) || 0, e.hlutur || 0));

  function paint() {
    const W = Math.max(280, wrap.clientWidth || 680), mob = W < 520;
    const NW = mob ? 116 : 150, NH = 46, ROWH = mob ? 92 : 108, PAD = 10;
    const layers = [];
    for (const [id, d] of depth) { (layers[d] = layers[d] || []).push(id); }
    const H = PAD * 2 + (maxD + 1) * ROWH;
    const pos = new Map();
    layers.forEach((ids, d) => {
      const yTop = PAD + d * ROWH;                     // rót (d=0) efst, dýpri eigendur neðar
      const n = ids.length, span = W - PAD * 2;
      ids.forEach((id, k) => { const x = n === 1 ? W / 2 : PAD + NW / 2 + k * ((span - NW) / (n - 1)); pos.set(id, { x, y: yTop + NH / 2 }); });
    });
    let sedges = '', snodes = '', chips = '';
    for (const e of edges) {
      const a = pos.get(e.fra), b = pos.get(e.til); if (!a || !b) continue;
      const sw = e.hlutur == null ? 1.4 : (1.3 + Math.min(e.hlutur, 100) / 100 * 3).toFixed(2);
      sedges += `<path class="eig-edge b${e.band}" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${a.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)},${b.x.toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)},${b.x.toFixed(1)} ${b.y.toFixed(1)}" style="stroke-width:${sw}px"${e.hlutur == null ? ' stroke-dasharray="4 5"' : ''}/>`;
      if (e.hlutur != null) chips += `<span class="eig-echip" style="left:${((a.x + b.x) / 2).toFixed(1)}px;top:${((a.y + b.y) / 2).toFixed(1)}px">${eigPctFmt(e.hlutur)}</span>`;
    }
    for (const nd of nodes) {
      const p = pos.get(nd.id); if (!p) continue;
      const stake = nd.er_rot ? 100 : (stakeOf.get(nd.id) || 0);
      const cls = nd.er_rot ? 'root' : (nd.tegund === 'felag' ? 'felag' : 'einst') + (stake >= 25 ? ' yfir' : '');
      const clickable = !nd.er_rot && nd.kt;
      const meta = nd.er_rot ? 'kt. ' + escF(ktFmt(nd.kt)) : (nd.kt ? 'kt. ' + escF(ktFmt(nd.kt)) + ' ↗' : (nd.faeding ? 'f. ' + escF(nd.faeding) : ''));
      snodes += `<${clickable ? 'button type="button"' : 'div'} class="eig-node ${cls}${clickable ? ' klik' : ''}" ${clickable ? 'data-kt="' + escF(nd.kt) + '"' : ''} style="left:${(p.x - NW / 2).toFixed(1)}px;top:${(p.y - NH / 2).toFixed(1)}px;width:${NW}px;height:${NH}px" title="${escF(nd.nafn)}">`
        + `<span class="eig-node-nm">${nd.er_rot ? '🏢 ' : ''}${escF(nd.nafn)}</span><span class="eig-node-mt">${meta}</span></${clickable ? 'button' : 'div'}>`;
    }
    wrap.style.height = H + 'px';
    wrap.innerHTML = `<svg class="eig-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${sedges}</svg>${snodes}${chips}`;
  }
  paint();
  let rt = 0; const relayout = () => { clearTimeout(rt); rt = setTimeout(paint, 90); };
  if (window.ResizeObserver) { try { new ResizeObserver(relayout).observe(wrap); } catch (e) {} }
  window.addEventListener('resize', relayout);
  wrap.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.eig-node.klik'); if (b && b.dataset.kt) nav(b.dataset.kt); });
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
function eigReport(rep, kt) {
  return '<div class="eig-report" id="eig-report">'
    + '<div class="eig-h"><h3>Endanlegir eigendur</h3><button type="button" class="eig-print" id="eig-print">🖨️ Prenta / PDF</button></div>'
    + (kt ? '<div class="eig-related"><a class="eig-fulllink" href="/fyrirtaeki/?q=' + encodeURIComponent(kt) + '">🏢 Fyrirtækjaskýrsla →</a><a class="eig-fulllink" href="/fyrirtaeki/?vidmot=areidanleiki&q=' + encodeURIComponent(kt) + '">🛡️ Áreiðanleikamat →</a></div>' : '')
    + '<p class="eig-intro">Endanlegir eigendur innihalda upplýsingar um eigendur íslenskra fyrirtækja og vensl þeirra. Upplýsingarnar byggja á gögnum úr hlutafélagaskrá, ársreikningum og skráðum raunverulegum eigendum frá Skattinum. Jafnframt fylgir listi yfir skráða hluthafa.</p>'
    + '<h4 class="eig-sec">Yfirlit yfir endanlega eigendur</h4>'
    + '<p class="eig-cap">Myndin sýnir alla endanlega eigendur sem eiga 10% eða meira í félaginu en þó alltaf þrjá stærstu.</p>'
    + eigNet(rep) + eigLegend()
    + eigTable(rep)
    + '<h4 class="eig-sec">Raunverulegir eigendur samkvæmt fyrirtækjaskrá</h4>' + eigRaunv(rep)
    + '<h4 class="eig-sec">Yfirlit yfir hluthafa</h4>' + eigPie(rep) + eigHluthafar(rep)
    + eigSources(rep)
    + '</div>';
}
// Setur skýrsluna í gám, teiknar netið, tengir prentun.
function eigMount(rep, host, nav, kt) {
  host.innerHTML = eigReport(rep, kt);
  eigWireNet(rep, nav);
  const pb = document.getElementById('eig-print');
  if (pb) pb.onclick = () => { document.body.classList.add('fs-printing'); window.print(); setTimeout(() => document.body.classList.remove('fs-printing'), 600); };
}

// ── Public API ───────────────────────────────────────────────────────────────
export function uboOwned(kt) { return isAdmin() || hasReport('eigendur:' + kt); }

function uboCtaHtml(kt, nafn) {
  return '<div class="eig-cta"><b>🔗 Endanlegir eigendur</b>'
    + '<span>Full, litakóðuð eignarhaldsskýrsla: endanlegir eigendur í gegnum allar félagakeðjur, raunverulegir eigendur, hluthafalisti og prentvæn PDF — sérskýrsla eins og hjá Creditinfo.</span>'
    + '<div class="eig-cta-btns"><button type="button" class="eig-buy" data-kt="' + escF(kt) + '" data-nafn="' + escF(nafn || '') + '">🛒 Kaupa eigenda-skýrslu — 990 kr</button>'
    + '<a class="eig-sample" href="/eigendur/?syni=1">👁️ Sjá sýnishorn</a></div></div>';
}

function wireBuy(hostEl, kt, nafn) {
  const buy = hostEl.querySelector('.eig-buy'); if (!buy) return;
  buy.addEventListener('click', async () => {
    const orig = buy.textContent; buy.disabled = true; buy.textContent = '⏳ Opna greiðslu…';
    const res = await karpCheckout({ kind: 'eigendur', ref: (nafn || '') + ' ' + kt, key: 'eigendur:' + kt });
    if (res === 'redirected') return;
    buy.textContent = res === 'unconfigured' ? 'Greiðslur opna fljótlega' : 'Ekki tókst — reyndu aftur';
    buy.disabled = false; setTimeout(() => { buy.textContent = orig; }, 2800);
  });
}

const defaultNav = (kt) => { try { location.href = '/eigendur/?q=' + encodeURIComponent(kt); } catch (e) {} };

// Heildar-flæði: gátun → (990 kr CTA | sótt+poll → net+töflur). hostEl er tómur gámur.
export function mountUboReport({ kt, nafn, hostEl, navTo }) {
  if (!hostEl) return;
  const nav = navTo || defaultNav;
  if (!uboOwned(kt)) { hostEl.innerHTML = uboCtaHtml(kt, nafn); wireBuy(hostEl, kt, nafn); return; }
  hostEl.innerHTML = '<div class="eig-loading">🔗 Rek eignarhald gegnum allar félagakeðjur beint úr RSK…'
    + '<br><small style="opacity:.75">Í fyrsta skipti getur þetta tekið 1–2 mín — svo vistast skýrslan og birtist samstundis eftirleiðis.</small></div>';
  let tries = 0;
  const tick = async () => {
    const d = await eigData(kt, true);
    if (d && !d.pending && !d.engin) { eigMount(d, hostEl, nav, kt); return; }
    if (d && d.engin) { hostEl.innerHTML = '<div class="eig-tom">Ekki tókst að byggja eignarhaldsnet fyrir félagið (hvorki hluthafalisti né raunverulegir eigendur fundust).</div>'; return; }
    if (tries++ < 80) setTimeout(tick, tries < 12 ? 2000 : 3500);   // hraðari fyrstu pollin → grípur fljótari byggingar fyrr
    else hostEl.innerHTML = '<div class="eig-tom">Skýrslan er enn í vinnslu — endurhlaðið síðuna eftir smástund (hún vistast þegar hún er tilbúin).</div>';
  };
  tick();
}

// Opið sýnishorn (Gervifyrirtæki) — engin innskráning/kaup.
export function renderUboSample(hostEl, opts) {
  opts = opts || {};
  const nav = opts.navTo || defaultNav;
  if (!hostEl) return Promise.resolve();
  return fetch('/gogn/eigendur/_synishorn.json').then((r) => r.json()).then((rep) => { eigMount(rep, hostEl, nav); return rep; })
    .catch(() => { hostEl.innerHTML = '<p class="eig-tom">Villa við að sækja sýnishorn.</p>'; });
}
