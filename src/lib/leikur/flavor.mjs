// Flavor/UX-hjálp fyrir RÁS-Leikinn: sleða-áhrif (úr links), fréttafyrirsagnir, fylgi, leikslok-titlar.
// HREINT — tekur baseline/links/kpis sem viðföng (engin env/D1). Allt DERIVED til birtingar.

// Niðurstreymis-útkomur levers → tooltip „hefur áhrif á". dir úr net-coef; topp 5 eftir |coef|.
export function leverEffects(leverKey, baseline, links) {
  const arr = Array.isArray(links) ? links : (links && links.links) || [];
  const net = {};
  for (const l of arr) { if (l.from !== leverKey) continue; if (!baseline.outcomes[l.to]) continue; net[l.to] = (net[l.to] || 0) + (l.coef || 0); }
  return Object.entries(net).filter(([, c]) => Math.abs(c) > 1e-9)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5)
    .map(([k, c]) => ({ key: k, label: baseline.outcomes[k].label, dir: c > 0 ? 1 : -1 }));
}

// Reglu-drifnar fréttafyrirsagnir úr KPI-stöðu (≤3).
export function newsHeadlines(kpis) {
  const h = [], v = kpis.verdbolga, g = kpis.hagvoxtur, a = kpis.atvinnuleysi, s = kpis.skuldir;
  if (v != null && v > 8) h.push('Verðbólga í tveggja stafa tölu — heimilin mótmæla');
  else if (v != null && v < 0.5) h.push('Verðhjöðnun — Seðlabankinn hefur áhyggjur af stöðnun');
  if (g != null && g < 0) h.push('Samdráttur: hagkerfið skreppur saman');
  else if (g != null && g > 6) h.push('Met-hagvöxtur á Íslandi — bjartsýni ríkir');
  if (a != null && a > 8) h.push('Fjöldaatvinnuleysi — verkalýðshreyfingin krefst aðgerða');
  else if (a != null && a < 2.5) h.push('Þensla á vinnumarkaði — skortur á starfsfólki');
  if (s != null && s > 80) h.push('Ríkissjóður á heljarþröm — skuldabyrðin í hámarki');
  else if (s != null && s < 30) h.push('Ríkissjóður í kjörstöðu — skuldir í sögulegu lágmarki');
  if (!h.length) h.push('Rólegt í efnahagslífinu — engin stórtíðindi þetta kjörtímabil');
  return h.slice(0, 3);
}

// Fylgi ríkisstjórnar 0–100 úr verðbólgu/hagvexti/atvinnuleysi.
export function popularity(kpis) {
  const v = kpis.verdbolga == null ? 2.5 : kpis.verdbolga, g = kpis.hagvoxtur == null ? 2 : kpis.hagvoxtur, a = kpis.atvinnuleysi == null ? 4 : kpis.atvinnuleysi;
  const p = 58 + 3 * (g - 2) - 2.2 * Math.max(0, Math.abs(v - 2.5) - 1) - 4 * Math.max(0, a - 4.5);
  return Math.max(0, Math.min(100, Math.round(p)));
}

// Leikslok-titill eftir meðal-composite (0–100).
export function endTitle(avg) {
  if (avg >= 85) return { title: '🏆 Efnahags-undrið', blurb: 'Framúrskarandi hagstjórn — Ísland blómstraði undir ykkar forystu.' };
  if (avg >= 70) return { title: '🌟 Farsæl ríkisstjórn', blurb: 'Traust og árangursrík stjórn sem skilaði góðum árangri.' };
  if (avg >= 55) return { title: '👍 Traust hagstjórn', blurb: 'Sæmileg útkoma með nokkrum áskorunum á leiðinni.' };
  if (avg >= 40) return { title: '😬 Brösug kjörtímabil', blurb: 'Erfið stjórn — margt fór úrskeiðis en þið hélduð sjó.' };
  return { title: '💥 Hrun-stjórnin', blurb: 'Efnahagslegt öngþveiti. Sagan fer ekki mjúkum höndum um ykkur.' };
}
