// kvotagraf.mjs — heildarmynds-gröf Kvótavaktarinnar (D3 v7, lazy af CDN — sama mynstur og choropleth.mjs).
// Þrjú gröf yfir gogn/kvoti.json:
//   teiknaSolgeisla(el, D)  — zoomable sunburst: Kvótinn → tegundir → top-útgerðir (+ Aðrir)
//   teiknaStrengi(el, D)    — chord: tegundir ↔ topp-útgerðir (hver heldur hverju, flæðin sjást)
//   teiknaPakka(el, D)      — circle packing: útgerðir → skip (stærð = þorskígildi skips)
// Öll dökk-þema, íslensk talnasnið, viewBox-responsive. Engin ný npm-ávöxun.

let _d3Promise = null;
export function withD3(cb) {
  if (typeof window === 'undefined') return;
  if (window.d3 && window.d3.partition) { cb(window.d3); return; }
  if (!_d3Promise) {
    _d3Promise = new Promise((res) => {
      let s = document.getElementById('d3-js');
      if (!s) {
        s = document.createElement('script');
        s.id = 'd3-js';
        s.src = 'https://unpkg.com/d3@7/dist/d3.min.js';
        document.head.appendChild(s);
      }
      const t = setInterval(() => { if (window.d3 && window.d3.partition) { clearInterval(t); res(window.d3); } }, 60);
    });
  }
  _d3Promise.then(cb);
}

const tonn = (kg) => {
  const t = kg / 1000;
  return (t >= 100 ? Math.round(t).toLocaleString('is-IS') : t.toLocaleString('is-IS', { maximumFractionDigits: 1 })) + ' t';
};
const stytt = (s, n) => { s = String(s || '—'); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Litapalletta (dökkt þema): gull fyrst (Karp), svo aðgreinanlegir kaldir/heitir tónar.
const LITIR = ['#f6b13b', '#58a6ff', '#3fb950', '#ff8a8a', '#d2a8ff', '#76e3ea', '#ffa657', '#7ee787', '#f778ba', '#a5d6ff', '#e3b341', '#79c0ff'];

// Sameiginlegt tooltip (eitt á síðu, endurnýtt milli grafa).
function tip(el) {
  let t = document.getElementById('kvg-tip');
  if (!t) { t = document.createElement('div'); t.id = 'kvg-tip'; t.className = 'kvg-tip'; t.hidden = true; document.body.appendChild(t); }
  return {
    syna(html, ev) { t.innerHTML = html; t.hidden = false; this.faera(ev); },
    faera(ev) { t.style.left = (ev.clientX + 14) + 'px'; t.style.top = (ev.clientY + 10) + 'px'; },
    fela() { t.hidden = true; }
  };
}

// ── 1. SÓLGEISLI (zoomable sunburst): Kvótinn → tegundir → útgerðir ─────────
// dyptEin=true (sýnishorn) → aðeins tegunda-hringurinn, engin útgerðanöfn.
export function teiknaSolgeisla(el, D, { dyptEin = false } = {}) {
  withD3((d3) => {
    const teg = (D.tegundir || []).slice(0, 12);
    const born = teg.map((t) => {
      const topSum = t.top.reduce((a, h) => a + h.kg, 0);
      const b = dyptEin ? [] : t.top.slice(0, 10).map((h) => ({ name: h.nafn || h.kt, value: h.kg, kt: h.kt }));
      if (!dyptEin && t.heild_kg - topSum > 0) b.push({ name: 'Aðrir', value: t.heild_kg - topSum, adrir: true });
      return { name: t.nafn, children: b.length ? b : undefined, value: b.length ? undefined : t.heild_kg };
    });
    const annad = (D.heild.ti_kg || 0) - teg.reduce((a, t) => a + t.heild_kg, 0);
    if (annad > 0) born.push({ name: 'Aðrar tegundir', value: annad });
    const rot = d3.hierarchy({ name: 'Kvótinn', children: born }).sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
    const R = 320;
    d3.partition().size([2 * Math.PI, R * R])(rot);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', [-R, -R, 2 * R, 2 * R]).attr('class', 'kvg-svg');
    const litur = (d) => { let a = d; while (a.depth > 1) a = a.parent; return LITIR[(a.parent ? a.parent.children.indexOf(a) : 0) % LITIR.length]; };
    const arc = d3.arc().startAngle((d) => d.x0).endAngle((d) => d.x1)
      .innerRadius((d) => Math.sqrt(d.y0)).outerRadius((d) => Math.sqrt(d.y1) - 1);
    const T = tip(el);
    let fokus = rot;
    const g = svg.append('g');
    const slodir = g.selectAll('path').data(rot.descendants().filter((d) => d.depth)).join('path')
      .attr('d', arc).attr('fill', litur)
      .attr('fill-opacity', (d) => d.depth === 1 ? 0.92 : (d.data.adrir ? 0.25 : 0.55))
      .attr('class', 'kvg-arc')
      .on('mousemove', (ev, d) => T.syna('<b>' + stytt(d.data.name, 40) + '</b><br>' + tonn(d.value) + ' aflamark · ' + ((d.value / rot.value) * 100).toFixed(1) + '% af heild' + (d.depth === 2 ? '<br><i>' + stytt(d.parent.data.name, 30) + '</i>' : ''), ev))
      .on('mouseleave', () => T.fela())
      .on('click', (ev, d) => zoom(d.depth === 1 && fokus !== d ? d : rot));
    const merki = g.selectAll('text').data(rot.descendants().filter((d) => d.depth === 1 && (d.x1 - d.x0) > 0.12)).join('text')
      .attr('class', 'kvg-lbl').attr('dy', '0.35em')
      .attr('transform', (d) => {
        const x = ((d.x0 + d.x1) / 2) * 180 / Math.PI - 90, y = (Math.sqrt(d.y0) + Math.sqrt(d.y1)) / 2;
        return 'rotate(' + x + ') translate(' + y + ',0) rotate(' + (x < 90 ? 0 : 180) + ')';
      })
      .attr('text-anchor', 'middle').text((d) => stytt(d.data.name, 16));
    const midja = svg.append('text').attr('class', 'kvg-mid').attr('text-anchor', 'middle');
    const midjaTxt = (d) => {
      midja.selectAll('*').remove();
      midja.append('tspan').attr('x', 0).attr('dy', '-0.2em').text(d === rot ? 'Allur kvótinn' : stytt(d.data.name, 18));
      midja.append('tspan').attr('x', 0).attr('dy', '1.3em').attr('class', 'kvg-mid2').text(tonn(d.value));
    };
    midjaTxt(rot);
    function zoom(d) {
      fokus = d;
      const xd = d3.scaleLinear().domain([d.x0, d.x1]).range([0, 2 * Math.PI]);
      const yd = (v) => Math.sqrt(Math.max(0, v - d.y0)) / Math.sqrt(Math.max(1, R * R - d.y0)) * R;
      slodir.transition().duration(600).attrTween('d', (n) => () =>
        d3.arc().startAngle(Math.max(0, Math.min(2 * Math.PI, xd(n.x0)))).endAngle(Math.max(0, Math.min(2 * Math.PI, xd(n.x1))))
          .innerRadius(yd(n.y0)).outerRadius(Math.max(0, yd(n.y1) - 1))(n));
      merki.transition().duration(600).style('opacity', d === rot ? 1 : 0);
      midjaTxt(d);
    }
  });
}

// ── 2. STRENGIR (chord): tegundir ↔ topp-útgerðir ──────────────────────────
// Tvískipt (bipartite) chord: hnútar = topp-tegundir + topp-útgerðir; strengur = kg útgerðar í tegund.
export function teiknaStrengi(el, D) {
  withD3((d3) => {
    const teg = (D.tegundir || []).slice(0, 7).map((t) => t.nafn);
    const utg = (D.hafar || []).slice(0, 10);
    const n = teg.length + utg.length;
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    utg.forEach((h, ui) => {
      for (const t of (h.tegundir || [])) {
        const ti = teg.indexOf(t.nafn);
        if (ti < 0) continue;
        M[ti][teg.length + ui] = t.kg;
        M[teg.length + ui][ti] = t.kg;
      }
    });
    const nafnid = (i) => i < teg.length ? teg[i] : (utg[i - teg.length].nafn || utg[i - teg.length].kt);
    const erTeg = (i) => i < teg.length;
    const litur = (i) => erTeg(i) ? LITIR[i % LITIR.length] : '#8b98ab';
    const R = 330, innri = R - 68;
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', [-R, -R, 2 * R, 2 * R]).attr('class', 'kvg-svg');
    const chord = d3.chordDirected().padAngle(0.035).sortSubgroups(d3.descending)(M);
    const T = tip(el);
    svg.append('g').selectAll('path').data(chord).join('path')
      .attr('class', 'kvg-strengur')
      .attr('d', d3.ribbon().radius(innri - 4))
      .attr('fill', (d) => litur(erTeg(d.source.index) ? d.source.index : d.target.index))
      .attr('fill-opacity', 0.45)
      .on('mousemove', (ev, d) => {
        const ti = erTeg(d.source.index) ? d.source.index : d.target.index;
        const ui = erTeg(d.source.index) ? d.target.index : d.source.index;
        T.syna('<b>' + stytt(nafnid(ui), 34) + '</b> · ' + stytt(nafnid(ti), 24) + '<br>' + tonn(M[ti][ui]), ev);
      })
      .on('mouseleave', () => T.fela());
    const hop = svg.append('g').selectAll('g').data(chord.groups).join('g');
    hop.append('path')
      .attr('d', d3.arc().innerRadius(innri).outerRadius(innri + 14))
      .attr('fill', (d) => litur(d.index)).attr('fill-opacity', (d) => erTeg(d.index) ? 0.95 : 0.7)
      .on('mousemove', (ev, d) => T.syna('<b>' + stytt(nafnid(d.index), 36) + '</b><br>' + tonn(d.value / 2) + (erTeg(d.index) ? ' hjá topp-10 útgerðunum' : ' í topp-7 tegundunum'), ev))
      .on('mouseleave', () => T.fela());
    hop.append('text')
      .attr('class', 'kvg-lbl')
      .each((d) => { d.horn = (d.startAngle + d.endAngle) / 2; })
      .attr('dy', '0.35em')
      .attr('transform', (d) => 'rotate(' + (d.horn * 180 / Math.PI - 90) + ') translate(' + (innri + 20) + ',0)' + (d.horn > Math.PI ? ' rotate(180)' : ''))
      .attr('text-anchor', (d) => d.horn > Math.PI ? 'end' : 'start')
      .text((d) => stytt(nafnid(d.index), 20));
  });
}

// ── 4. KVÓTANÝTING (láréttar stikur, hreint DOM — engin D3 þörf): afli sem % af kvóta per tegund ──
// SJ = gogn/sjavarutvegur.json (species[]: {nafn, aflamark, afli, nyting, ...}, dagleg Fiskistofu-bökun).
export function teiknaNyting(el, SJ) {
  const sp = ((SJ && SJ.species) || []).filter((s) => s.aflamark > 0).sort((a, b) => b.aflamark - a.aflamark).slice(0, 16);
  if (!sp.length) { el.innerHTML = '<div class="kv-empty">Nýtingargögn ekki tiltæk.</div>'; return; }
  const lit = (n) => (n >= 95 ? '#ff8a8a' : n >= 75 ? '#f6b13b' : '#3fb950');
  el.innerHTML = '<div class="kvg-nyt">' + sp.map((s) => {
    const n = Math.max(0, Math.min(100, +s.nyting || 0));
    return '<div class="kvg-nyt-r"><span class="kvg-nyt-n">' + s.nafn + '</span>'
      + '<span class="kvg-nyt-b"><span style="width:' + n.toFixed(1) + '%;background:' + lit(n) + '"></span></span>'
      + '<span class="kvg-nyt-v">' + n.toFixed(0) + '%</span>'
      + '<span class="kvg-nyt-t">' + tonn(s.afli || 0) + ' af ' + tonn(s.aflamark) + '</span></div>';
  }).join('') + '</div>'
  + '<p class="kvg-skyr">Afli fiskveiðiársins sem hlutfall af úthlutuðum kvóta — grænt &lt;75%, gult 75–95%, rautt ≥95% (kvótinn að klárast).</p>';
}

// ── 5. GREINING (dreifirit, D3): nýting × samþjöppun × umfang per tegund ───
export function teiknaDreifirit(el, SJ) {
  withD3((d3) => {
    const sp = ((SJ && SJ.species) || []).filter((s) => s.aflamark > 0 && s.nyting != null && s.top10pct != null).slice(0, 22);
    if (!sp.length) { el.innerHTML = '<div class="kv-empty">Greiningargögn ekki tiltæk.</div>'; return; }
    const W = 700, H = 460, M = { t: 18, r: 18, b: 44, l: 52 };
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', [0, 0, W, H]).attr('class', 'kvg-svg');
    const x = d3.scaleLinear().domain([0, 105]).range([M.l, W - M.r]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - M.b, M.t]);
    const r = d3.scaleSqrt().domain([0, d3.max(sp, (s) => s.aflamark)]).range([4, 26]);
    const T = tip(el);
    svg.append('g').attr('transform', 'translate(0,' + (H - M.b) + ')').call(d3.axisBottom(x).ticks(6).tickFormat((v) => v + '%')).attr('class', 'kvg-as');
    svg.append('g').attr('transform', 'translate(' + M.l + ',0)').call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + '%')).attr('class', 'kvg-as');
    svg.append('text').attr('class', 'kvg-lbl').attr('x', (M.l + W - M.r) / 2).attr('y', H - 8).attr('text-anchor', 'middle').text('Nýting kvótans (afli sem % af aflamarki)');
    svg.append('text').attr('class', 'kvg-lbl').attr('transform', 'rotate(-90)').attr('x', -(H - M.b + M.t) / 2).attr('y', 14).attr('text-anchor', 'middle').text('Samþjöppun (hlutdeild 10 stærstu skipa)');
    svg.append('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(50)).attr('y2', y(50)).attr('class', 'kvg-lina');
    svg.selectAll('circle').data(sp).join('circle')
      .attr('cx', (s) => x(Math.min(105, s.nyting))).attr('cy', (s) => y(Math.min(100, s.top10pct))).attr('r', (s) => r(s.aflamark))
      .attr('fill', (s, i) => LITIR[i % LITIR.length]).attr('fill-opacity', 0.6).attr('stroke', 'rgba(255,255,255,.35)')
      .on('mousemove', (ev, s) => T.syna('<b>' + s.nafn + '</b><br>nýting ' + (+s.nyting).toFixed(0) + '% · 10 stærstu skip: ' + (+s.top10pct).toFixed(0) + '%<br>aflamark ' + tonn(s.aflamark), ev))
      .on('mouseleave', () => T.fela());
    svg.selectAll('.kvg-pl').data(sp.filter((s) => r(s.aflamark) > 13)).join('text')
      .attr('class', 'kvg-lbl kvg-pl').attr('text-anchor', 'middle')
      .attr('x', (s) => x(Math.min(105, s.nyting))).attr('y', (s) => y(Math.min(100, s.top10pct)) - r(s.aflamark) - 4)
      .text((s) => stytt(s.nafn, 14));
  });
}

// ── 6. ÞRÓUN (línurit, D3): samþjöppun yfir tíma úr kvoti_saga.json ────────
export function teiknaThroun(el, saga) {
  const p = ((saga && saga.punktar) || []).slice();
  if (p.length < 2) {
    el.innerHTML = '<div class="kv-empty">📈 Þróunarlínurnar teiknast þegar 2+ vikulegar mælingar eru komnar — fyrsta mæling var '
      + (p[0] ? p[0].dags : '—') + ' og ný bætist við hvern mánudag. Hér birtist þá þróun samþjöppunar (top-10 og HHI) viku fyrir viku.</div>';
    return;
  }
  withD3((d3) => {
    const W = 700, H = 380, M = { t: 16, r: 52, b: 40, l: 52 };
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', [0, 0, W, H]).attr('class', 'kvg-svg');
    const xs = d3.scalePoint().domain(p.map((d) => d.dags)).range([M.l, W - M.r]);
    const y1 = d3.scaleLinear().domain([0, Math.max(60, d3.max(p, (d) => d.top10pct) + 5)]).range([H - M.b, M.t]);
    const y2 = d3.scaleLinear().domain([0, Math.max(600, d3.max(p, (d) => d.hhi) + 50)]).range([H - M.b, M.t]);
    svg.append('g').attr('transform', 'translate(0,' + (H - M.b) + ')').call(d3.axisBottom(xs).tickValues(xs.domain().filter((_, i, a) => a.length <= 10 || i % Math.ceil(a.length / 10) === 0))).attr('class', 'kvg-as');
    svg.append('g').attr('transform', 'translate(' + M.l + ',0)').call(d3.axisLeft(y1).ticks(5).tickFormat((v) => v + '%')).attr('class', 'kvg-as');
    svg.append('g').attr('transform', 'translate(' + (W - M.r) + ',0)').call(d3.axisRight(y2).ticks(5)).attr('class', 'kvg-as');
    const l1 = d3.line().x((d) => xs(d.dags)).y((d) => y1(d.top10pct));
    const l2 = d3.line().x((d) => xs(d.dags)).y((d) => y2(d.hhi));
    svg.append('path').datum(p).attr('d', l1).attr('fill', 'none').attr('stroke', '#f6b13b').attr('stroke-width', 2.5);
    svg.append('path').datum(p).attr('d', l2).attr('fill', 'none').attr('stroke', '#58a6ff').attr('stroke-width', 2).attr('stroke-dasharray', '5,4');
    const T = tip(el);
    svg.selectAll('circle').data(p).join('circle')
      .attr('cx', (d) => xs(d.dags)).attr('cy', (d) => y1(d.top10pct)).attr('r', 4).attr('fill', '#f6b13b')
      .on('mousemove', (ev, d) => T.syna('<b>' + d.dags + '</b><br>top-10: ' + d.top10pct + '% · HHI: ' + d.hhi + '<br>' + tonn(d.ti_kg) + ' þorskígildi · ' + d.nHafar + ' útgerðir', ev))
      .on('mouseleave', () => T.fela());
    svg.append('text').attr('class', 'kvg-lbl').attr('x', M.l).attr('y', 12).text('— top-10 hlutdeild (gult) · - - HHI (blátt, hægri ás)');
  });
}

// ── 3. PAKKAGRAF (circle packing): útgerðir → skip ─────────────────────────
export function teiknaPakka(el, D) {
  withD3((d3) => {
    const utg = (D.hafar || []).slice(0, 24).map((h) => ({
      name: h.nafn || h.kt, kt: h.kt, pct: h.pct,
      children: (h.skip && h.skip.length ? h.skip : [{ nafn: '—', ti_kg: h.ti_kg }]).map((s) => ({
        name: s.nafn || ('Skip ' + s.regno), value: Math.max(1, s.ti_kg || Math.round(h.ti_kg / Math.max(1, (h.skip || []).length))), regno: s.regno,
      })),
    }));
    const rot = d3.hierarchy({ name: 'Kvótinn', children: utg }).sum((d) => d.value || 0).sort((a, b) => b.value - a.value);
    const S = 700;
    d3.pack().size([S, S]).padding(3)(rot);
    el.innerHTML = '';
    const svg = d3.select(el).append('svg').attr('viewBox', [0, 0, S, S]).attr('class', 'kvg-svg');
    const T = tip(el);
    svg.selectAll('circle').data(rot.descendants().filter((d) => d.depth)).join('circle')
      .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => d.r)
      .attr('class', (d) => d.depth === 1 ? 'kvg-utg' : 'kvg-skip')
      .attr('fill', (d) => d.depth === 1 ? 'rgba(246,177,59,.08)' : LITIR[(d.parent.parent.children.indexOf(d.parent)) % LITIR.length])
      .attr('fill-opacity', (d) => d.depth === 1 ? 1 : 0.55)
      .attr('stroke', (d) => d.depth === 1 ? 'rgba(246,177,59,.5)' : 'none')
      .on('mousemove', (ev, d) => T.syna(d.depth === 1
        ? '<b>' + stytt(d.data.name, 36) + '</b><br>' + tonn(d.value) + ' · ' + (d.data.pct || 0) + '% af heild · ' + d.children.length + ' skip'
        : '<b>' + stytt(d.data.name, 32) + '</b><br>' + tonn(d.value) + '<br><i>' + stytt(d.parent.data.name, 30) + '</i>', ev))
      .on('mouseleave', () => T.fela());
    svg.selectAll('text').data(rot.children.filter((d) => d.r > 34)).join('text')
      .attr('class', 'kvg-lbl').attr('text-anchor', 'middle')
      .attr('x', (d) => d.x).attr('y', (d) => d.y - d.r + 15)
      .text((d) => stytt(d.data.name, Math.max(6, Math.floor(d.r / 4.2))));
  });
}
