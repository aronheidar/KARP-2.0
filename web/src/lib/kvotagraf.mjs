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
      .on('mousemove', (ev, d) => T.syna('<b>' + stytt(d.data.name, 40) + '</b><br>' + tonn(d.value) + ' þorskígildi · ' + ((d.value / rot.value) * 100).toFixed(1) + '% af heild' + (d.depth === 2 ? '<br><i>' + stytt(d.parent.data.name, 30) + '</i>' : ''), ev))
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
