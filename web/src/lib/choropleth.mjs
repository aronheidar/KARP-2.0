// choropleth.mjs — endurnýtanlegur Leaflet-choropleth (client-side eyja).
// -------------------------------------------------------------------------
// Ein útflutt fall, renderChoropleth(el, opts), sem:
//   • hleður Leaflet af CDN (sama mynstur og eftirlit.astro / fasteignavakt.astro),
//   • litar sveitarfélaga-/landshluta-fjölhyrninga eftir gildi (kvantíl-bil),
//   • sýnir tooltip við yfirsvif + popup/hlekk við smell + litakvarða-skýringu,
//   • sprautar sínum eigin dökka CSS einu sinni (engin scoped-CSS gildra),
//   • notar ENGAN grunnkortalag — fjölhyrningarnir einir teikna Ísland.
// Importað í eyju-script síðu: `import { renderChoropleth } from '../lib/choropleth.mjs'`.
// Sama innfluttningsmynstur og ../lib/ubo-report.js (fyrirtaeki/eigendur). #2.
// ─────────────────────────────────────────────────────────────

// Litastigar (dökkur bakgrunnur → björt gildi lesast). Sýnd lág→há.
export const RAMPS = {
  // Gott → slæmt (grænt → rautt): atvinnuleysi, afbrot.
  redgreen: ['#2ea043', '#7fce6a', '#f6b13b', '#f0883e', '#f85149', '#c1121f'],
  // Dauft → bjart gull (verð): hærra = bjartara = dýrara.
  gold: ['#4a3a1c', '#7d5a1e', '#b3831f', '#f6b13b', '#ffd479'],
  // Einlita blátt, dauft → bjart.
  blue: ['#123a5e', '#1c5a8c', '#2f81c4', '#4ea8de', '#8fd3ff'],
  // Fjólublátt, dauft → bjart.
  purple: ['#3a1f5e', '#5a3a94', '#7c5cf7', '#a98bff', '#d6c6ff'],
};

const NODATA = '#2b3444';

// ---------- litahjálp ----------
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgb2hex = (r) => '#' + r.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
function sampleRamp(ramp, n) {
  if (n <= 1) return [ramp[ramp.length - 1]];
  if (ramp.length === n) return ramp.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (ramp.length - 1);
    const lo = Math.floor(t), hi = Math.ceil(t), f = t - lo;
    const a = hex2rgb(ramp[lo]), b = hex2rgb(ramp[hi]);
    out.push(rgb2hex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]));
  }
  return out;
}

// ---------- bil (kvantíl eða jöfn) ----------
function computeBreaks(vals, n, mode) {
  const s = vals.slice().sort((a, b) => a - b);
  const breaks = [];
  if (mode === 'equal') {
    const mn = s[0], mx = s[s.length - 1];
    for (let i = 1; i < n; i++) breaks.push(mn + (mx - mn) * i / n);
  } else { // kvantíl
    for (let i = 1; i < n; i++) {
      const idx = i / n * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
      breaks.push(s[lo] + (s[hi] - s[lo]) * (idx - lo));
    }
  }
  return breaks; // n-1 skil → n bil
}
const binOf = (v, breaks) => { let i = 0; while (i < breaks.length && v > breaks[i]) i++; return i; };

// ---------- Leaflet-hleðsla (lazy, af CDN) ----------
function withLeaflet(cb) {
  if (window.L) return cb(window.L);
  if (!document.getElementById('leaflet-css')) {
    const l = document.createElement('link');
    l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(l);
  }
  let s = document.getElementById('leaflet-js');
  if (!s) { s = document.createElement('script'); s.id = 'leaflet-js'; s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; document.head.appendChild(s); }
  if (window.L) return cb(window.L);
  s.addEventListener('load', () => cb(window.L), { once: true });
}

// ---------- dökkur CSS (sprautað einu sinni) ----------
function injectCss() {
  if (document.getElementById('chl-styles')) return;
  const st = document.createElement('style');
  st.id = 'chl-styles';
  st.textContent = `
  .chl-mapbox{height:460px;border-radius:12px;border:1px solid rgba(255,255,255,.08);overflow:hidden}
  @media (max-width:560px){.chl-mapbox{height:380px}}
  .chl-map{background:transparent;z-index:0}
  .chl-map.leaflet-container,.chl-map .leaflet-container{background:transparent!important;font:inherit}
  .chl-map .leaflet-interactive{transition:fill-opacity .12s}
  .chl-tip{background:rgba(9,14,26,.94)!important;border:1px solid rgba(255,255,255,.14)!important;color:#eaf1fb!important;
    border-radius:8px!important;box-shadow:0 4px 18px rgba(0,0,0,.5);font-size:12.5px;padding:6px 10px;white-space:nowrap}
  .chl-tip::before{display:none!important}
  .chl-map .leaflet-popup-content-wrapper{background:rgba(9,14,26,.96);color:#eaf1fb;border:1px solid rgba(255,255,255,.14);border-radius:10px}
  .chl-map .leaflet-popup-tip{background:rgba(9,14,26,.96);border:1px solid rgba(255,255,255,.14)}
  .chl-map .leaflet-popup-content{font-size:13px;margin:10px 13px;line-height:1.5}
  .chl-map .leaflet-popup-content b{color:#f6b13b}
  .chl-map .leaflet-popup-content a{color:#19d3c5}
  .chl-map .leaflet-container a.leaflet-popup-close-button{color:#9fb0c8}
  .chl-map .leaflet-control-attribution{background:rgba(9,14,26,.7);color:#7e8ca6;font-size:10px}
  .chl-map .leaflet-control-attribution a{color:#9fb0c8}
  .chl-legend{position:absolute;left:12px;bottom:12px;z-index:500;background:rgba(9,14,26,.86);
    border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;font-size:11.5px;color:#cdd6e6;max-width:220px}
  .chl-legend .chl-lt{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#7e8ca6;font-weight:700;margin-bottom:6px}
  .chl-legend .chl-row{display:flex;align-items:center;gap:7px;margin:3px 0;line-height:1.15}
  .chl-legend .chl-sw{width:14px;height:14px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.5)}
  @media (max-width:560px){.chl-legend{font-size:10.5px;max-width:170px;padding:7px 9px}}`;
  document.head.appendChild(st);
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {HTMLElement} el  ílát (fær position:relative + .chl-map).
 * @param {object} o
 *   geojson | geojsonUrl : FeatureCollection eða slóð til að sækja.
 *   nameProp='name'      : eiginleiki fitju sem geymir svæðisnafn.
 *   values               : { nafn: tala }  (litar).
 *   detail               : { nafn: obj }   (aukagögn fyrir popup).
 *   aliases              : { gagnanafn: fjölhyrningsnafn }  (samræming).
 *   ramp='redgreen' | colors:[..]          : litastigi (lág→há).
 *   bins=5, binMode='quantile'|'equal'.
 *   format=v=>v          : tala → strengur (tooltip/skýring).
 *   label                : mælikvarða-heiti (tooltip).
 *   legendTitle.
 *   tooltip(name,val,d)  : yfirskrift-html (annars name + label + val).
 *   popupHtml(name,val,d): smell-html (annars ekkert popup).
 *   onClick(name,val,d)  : yfirtekur popup (t.d. fara á undirsíðu).
 *   attribution          : credit-strengur (Leaflet-attribution).
 * @returns Promise<L.Map>
 */
export function renderChoropleth(el, o) {
  return new Promise((resolve) => {
    if (!el || el.dataset.chlDone) return resolve(null);
    el.dataset.chlDone = '1';
    injectCss();
    el.classList.add('chl-map');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const ready = (geo) => withLeaflet((L) => {
      const values = o.values || {};
      const detail = o.detail || {};
      const aliases = o.aliases || {};
      const nameProp = o.nameProp || 'name';
      const fmt = o.format || ((v) => String(v));
      // Samræma gagnalykla → fjölhyrningsnöfn.
      const V = {};
      for (const k in values) V[aliases[k] || k] = values[k];
      const D = {};
      for (const k in detail) D[aliases[k] || k] = detail[k];

      const nums = Object.values(V).filter((v) => typeof v === 'number' && isFinite(v));
      const distinct = new Set(nums).size;
      const bins = Math.max(1, Math.min(o.bins || 5, distinct || 1));
      const colors = sampleRamp(o.colors || RAMPS[o.ramp] || RAMPS.redgreen, bins);
      const breaks = nums.length > 1 ? computeBreaks(nums, bins, o.binMode || 'quantile') : [];
      const colorFor = (v) => (typeof v === 'number' && isFinite(v)) ? colors[binOf(v, breaks)] : NODATA;

      const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      el.style.background = 'transparent';   // yfirskrifa sjálfgefinn ljósgráan Leaflet-bakgrunn
      if (o.attribution) map.attributionControl.addAttribution(o.attribution);
      map.attributionControl.setPrefix(false);

      const style = (f) => {
        const v = V[f.properties[nameProp]];
        return { fillColor: colorFor(v), weight: 1, color: 'rgba(255,255,255,.35)', fillOpacity: (typeof v === 'number') ? 0.85 : 0.4 };
      };
      const layer = L.geoJSON(geo, {
        style,
        onEachFeature: (f, lyr) => {
          const name = f.properties[nameProp];
          const v = V[name], d = D[name];
          const tip = o.tooltip ? o.tooltip(name, v, d)
            : `<b>${esc(name)}</b><br>${esc(o.label || '')}${o.label ? ': ' : ''}<b>${v == null ? '—' : esc(fmt(v))}</b>`;
          lyr.bindTooltip(tip, { sticky: true, direction: 'top', className: 'chl-tip', opacity: 1 });
          lyr.on('mouseover', () => lyr.setStyle({ weight: 2.4, color: '#eaf1fb', fillOpacity: (typeof v === 'number') ? 0.95 : 0.5 }));
          lyr.on('mouseout', () => layer.resetStyle(lyr));
          if (o.onClick) lyr.on('click', () => o.onClick(name, v, d));
          else if (o.popupHtml) lyr.bindPopup(o.popupHtml(name, v, d), { maxWidth: 260 });
          else lyr.on('click', () => map.fitBounds(lyr.getBounds(), { padding: [20, 20] }));
        },
      }).addTo(map);

      try { map.fitBounds(layer.getBounds(), { padding: [8, 8] }); } catch (e) { map.setView([64.9, -18.9], 6); }
      setTimeout(() => map.invalidateSize(), 120);

      // Litakvarða-skýring.
      if (nums.length) {
        const lg = document.createElement('div');
        lg.className = 'chl-legend';
        const rng = (i) => {
          const lo = i === 0 ? Math.min(...nums) : breaks[i - 1];
          const hi = i === bins - 1 ? Math.max(...nums) : breaks[i];
          return `${fmt(lo)}–${fmt(hi)}`;   // fmt síðunnar sér um námundun
        };
        let html = o.legendTitle ? `<div class="chl-lt">${esc(o.legendTitle)}</div>` : '';
        for (let i = bins - 1; i >= 0; i--) html += `<div class="chl-row"><span class="chl-sw" style="background:${colors[i]}"></span>${esc(rng(i))}</div>`;
        html += `<div class="chl-row"><span class="chl-sw" style="background:${NODATA}"></span>engin gögn</div>`;
        lg.innerHTML = html;
        el.appendChild(lg);
      }
      resolve(map);
    });

    if (o.geojson) ready(o.geojson);
    else fetch(o.geojsonUrl).then((r) => r.json()).then(ready).catch(() => { el.dataset.chlDone = ''; resolve(null); });
  });
}
