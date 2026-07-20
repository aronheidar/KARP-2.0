// firma-timalina.mjs — sameinar dagsetta atburði félags í eina tímaröð (fyrir /fyrirtaeki/<kt>/). Hreint; worker-öruggt.
import { asciiId } from './frettavel-cat.mjs';

const LBL = { gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni', skiptabeidni: 'Skiptabeiðni', innkollun: 'Innköllun', skiptalok: 'Skiptalok', skiptafundur: 'Skiptafundur', felagsslit: 'Félagsslit' };
const kr = (v) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dmy = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(iso); };

export function buildTimalina(sources = {}, opts = {}) {
  const max = opts.max || 60;
  const ev = [];
  for (const n of sources.logbirting || []) if (n && n.date) ev.push({ dags: n.date, flokkur: 'gjaldthrot', titill: LBL[n.type] || n.type || 'Lögbirting', lysing: n.court || null, slod: n.url || '/logbirting/' });
  for (const v of sources.vorumerki || []) if (v && v.skrad) ev.push({ dags: v.skrad, flokkur: 'vorumerki', titill: 'Vörumerki skráð: ' + (v.titill || v.id || ''), lysing: v.tegund || null, slod: '/atvinnuvegir/hugverk/' });
  for (const s of sources.styrkir || []) if (s && s.ar) ev.push({ dags: s.ar + '-01-01', arGrof: true, ar: s.ar, flokkur: 'styrkur', titill: 'Styrkur úr ' + (s.sjodur || 'sjóði'), lysing: (s.verkefni ? '„' + s.verkefni + '" · ' : '') + (s.upphaed ? kr(s.upphaed) + ' kr.' : '') || null, slod: '/styrkir/' });
  for (const it of sources.frettir || []) if (it && it.date) ev.push({ dags: it.date, flokkur: 'frett', titill: it.title || '', lysing: null, slod: '/frettavel/' + asciiId(it.id) + '/' });
  ev.sort((a, b) => String(b.dags).localeCompare(String(a.dags)));
  return ev.slice(0, max).map((e) => ({ ...e, birt: e.arGrof ? 'Árið ' + e.ar : dmy(e.dags) }));
}
