// greinar.mjs — atvinnugreinar fyrir topplista (nafn + ÍSAT-2-stafa forskeyti). Deilt worker + framenda.
export const GREINAR = [
  { slug: 'island', nafn: 'Ísland allt (stærstu)', isat: null },
  { slug: 'sjavarutvegur', nafn: 'Sjávarútvegur', isat: ['03'] },
  { slug: 'verslun', nafn: 'Verslun', isat: ['45', '46', '47'] },
  { slug: 'byggingar', nafn: 'Byggingarstarfsemi', isat: ['41', '42', '43'] },
  { slug: 'fjarskipti', nafn: 'Fjarskipti & tækni', isat: ['61', '62', '63'] },
  { slug: 'ferdathjonusta', nafn: 'Ferðaþjónusta', isat: ['55', '56', '79'] },
  { slug: 'idnadur', nafn: 'Iðnaður & framleiðsla', isat: ['10', '11', '13', '16', '17', '20', '22', '23', '25', '28', '32', '33'] },
  { slug: 'fjarmal', nafn: 'Fjármál & trygging', isat: ['64', '65', '66'] },
];
export const greinaBySlug = (slug) => GREINAR.find((g) => g.slug === slug) || null;

// SQL WHERE-brot á f.isat_primary. '' = engin sía (island). null = óþekkt grein.
export function greinaSql(slug) {
  const g = greinaBySlug(slug);
  if (!g) return null;
  if (!g.isat) return '';
  return "substr(f.isat_primary,1,2) IN (" + g.isat.map((p) => "'" + p + "'").join(',') + ")";
}
