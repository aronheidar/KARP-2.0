// leidrettingar.mjs — hrein uppfletting/röðun leiðréttingaskrár. fs-frítt. Deilt af leidrettingar-síðu + [id].astro.
export function sortedLeidrett(data) {
  const items = (data && Array.isArray(data.items)) ? data.items.slice() : [];
  return items.sort((a, b) => String((b && b.dags) || '').localeCompare(String((a && a.dags) || '')));
}

export function leidrettFor(slug, data) {
  if (!slug) return null;
  const items = (data && Array.isArray(data.items)) ? data.items : [];
  let best = null;
  for (const it of items) {
    if (it && it.slug === slug && (!best || String(it.dags || '') > String(best.dags || ''))) best = it;
  }
  return best;
}
