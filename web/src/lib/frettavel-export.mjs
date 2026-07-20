// frettavel-export.mjs — gagna-/graf-útflutningur per frétt (fyrir fréttamenn). Hreint; keyrir á byggingartíma.
import { catOf, spark, asciiId } from './frettavel.mjs';

const SITE = 'https://karp.is';
const LICENSE = 'Frjáls til notkunar með tilvísun í Karp (karp.is)';
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const numSeries = (a) => (Array.isArray(a) ? a.filter((n) => typeof n === 'number') : []);
const isk = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');   // íslenskur aukastafur

export function hasExport(item) {
  if (!item) return false;
  const f = item.facts;
  return (isObj(f) && Object.keys(f).length > 0) || numSeries(item.spark).length >= 4;
}

export function exportJson(item) {
  const cat = catOf(item.type);
  const srcAbs = String(item.url || '').startsWith('http') ? item.url : SITE + (item.url || '/frettavel/');
  const series = numSeries(item.spark);
  const facts = isObj(item.facts) && Object.keys(item.facts).length ? item.facts : null;
  return {
    id: item.id,
    slod: SITE + '/frettavel/' + asciiId(item.id) + '/',
    dagsetning: item.date,
    tegund: item.type,
    flokkur: cat.label,
    titill: item.title,
    texti: item.text || '',
    heimild: cat.heimild,
    heimild_slod: srcAbs,
    adferd: cat.rule,
    facts,
    rod: series.length >= 4 ? { lysing: 'Síðustu ' + series.length + ' gildi (tímaröð)', gildi: series } : null,
    leyfi: LICENSE,
    hofundur: 'Fréttavél Karp',
  };
}

export function exportCsv(item) {
  const j = exportJson(item);
  const esc = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const cell = (v) => (typeof v === 'number' ? isk(v) : esc(v));
  const lines = ['reitur;gildi', 'titill;' + esc(j.titill), 'dagsetning;' + esc(j.dagsetning), 'flokkur;' + esc(j.flokkur), 'heimild;' + esc(j.heimild)];
  if (j.facts) for (const [k, v] of Object.entries(j.facts)) lines.push(esc(k) + ';' + cell(v));
  if (j.rod) { lines.push('', 'nr;gildi'); j.rod.gildi.forEach((v, i) => lines.push((i + 1) + ';' + isk(v))); }
  return lines.join('\n');
}

export function chartSvg(item) {
  const series = numSeries(item.spark);
  if (series.length < 4) return null;
  const cat = catOf(item.type);
  const W = 640, H = 280, padL = 20, padR = 20, padT = 56, padB = 40;
  const sp = spark(series, W - padL - padR, H - padT - padB);
  if (!sp) return null;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const c = cat.color || '#f6b13b';
  const last = series[series.length - 1], mn = Math.min(...series), mx = Math.max(...series);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui,Arial,sans-serif">
  <rect width="${W}" height="${H}" fill="#fffdf6"/>
  <text x="${padL}" y="26" font-size="17" font-weight="700" fill="#2b2417">${esc(cat.label)}</text>
  <text x="${padL}" y="46" font-size="13" fill="#6b5d43">${esc(clip(String(item.title || ''), 62))}</text>
  <g transform="translate(${padL},${padT})">
    <polyline points="${sp.area}" fill="${c}" opacity="0.14" stroke="none"/>
    <polyline points="${sp.pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${sp.ex}" cy="${sp.ey}" r="4" fill="${c}"/>
  </g>
  <text x="${W - padR}" y="${padT + Number(sp.ey) - 8}" font-size="13" font-weight="700" fill="${c}" text-anchor="end">${isk(last)}</text>
  <text x="${padL}" y="${H - 14}" font-size="11" fill="#9a8c6f">Lægst ${isk(mn)} · hæst ${isk(mx)} · ${series.length} gildi</text>
  <text x="${W - padR}" y="${H - 14}" font-size="11" fill="#9a8c6f" text-anchor="end">Heimild: Karp · karp.is</text>
</svg>`;
}
