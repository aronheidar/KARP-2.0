// soguthraedir.mjs — story-thread case arc for a fréttavél item (build-time, static). Pure; fs-free.
// threadKey: kt out of a gjaldþrot id. caseThread: that company's Lögbirting arc, oldest→newest,
// with a you-are-here step and a resolution status. Returns null below the 2-notice gate.

const LBL = {
  gjaldthrot_beidni: 'Gjaldþrotaskiptabeiðni',
  skiptabeidni: 'Skiptabeiðni (fyrirtaka)',
  innkollun: 'Innköllun þrotabús (kröfulýsing)',
  skiptafundur: 'Skiptafundur þrotabús',
  skiptalok: 'Skiptalok þrotabús',
  felagsslit: 'Félagsslit / afskráning',
};
const TERMINAL = new Set(['skiptalok', 'felagsslit']);

const dmy = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]}.${+m[2]}.${m[1]}` : String(iso); };
const dayNum = (iso) => { const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };

export function threadKey(item) {
  if (!item || typeof item.id !== 'string' || item.type !== 'gjaldthrot') return null;
  const last = item.id.split('-').pop();
  return /^\d{10}$/.test(last) ? last : null;
}

export function caseThread(item, byKt, opts = {}) {
  const min = opts.min || 2;
  const kt = threadKey(item);
  if (!kt) return null;
  const entry = byKt && byKt[kt];
  const notices = ((entry && entry.notices) || []).filter((n) => n && n.date);
  if (notices.length < min) return null;

  const sorted = notices.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))); // oldest→newest

  // current = notice nearest the item date; ties → newest (later index wins via <=)
  const idate = dayNum(item && item.date);
  let curIdx = -1, best = Infinity;
  sorted.forEach((n, i) => { const d = Math.abs(dayNum(n.date) - idate); if (d <= best) { best = d; curIdx = i; } });
  if (curIdx < 0) curIdx = sorted.length - 1; // guarantee exactly one current even if item date is unparsable

  const steps = sorted.map((n, i) => ({ dags: n.date, titill: LBL[n.type] || n.type || 'Lögbirting', birt: dmy(n.date), current: i === curIdx }));

  let terminal = null;
  for (const n of sorted) if (TERMINAL.has(n.type)) terminal = n; // ascending → last match = newest terminal
  const status = terminal
    ? { done: true, label: (terminal.type === 'felagsslit' ? 'Félagsslit ' : 'Lauk með skiptalokum ') + dmy(terminal.date) }
    : { done: false, label: 'Í ferli' };

  return { kt, n: steps.length, steps, status };
}
