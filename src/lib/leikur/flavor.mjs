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

// Fasi B — Stjórnar-stöðugleiki: lágt fylgi → ólga/uppreisn með STIG-afleiðingum (búsáhaldabyltingin 2009).
// factor margfaldast við umferðar-stig (server + client-forskoðun). Hrein — aðeins úr kpis.
export function govtStability(kpis, approvalAdj = 0) {
  const approval = Math.max(0, Math.min(100, popularity(kpis) + (approvalAdj || 0)));
  if (approval < 28) return { approval, level: 'revolt', factor: 0.80, icon: '🍳', title: 'Búsáhaldabyltingin', blurb: 'Fylgið hrundi (' + approval + '%) — fjöldamótmæli á Austurvelli, ríkisstjórnin fellur. Stig ×0,80.' };
  if (approval < 40) return { approval, level: 'unrest', factor: 0.92, icon: '😠', title: 'Fjöldamótmæli', blurb: 'Vaxandi ólga (fylgi ' + approval + '%) — mótmæli og verkföll veikja stjórnina. Stig ×0,92.' };
  return { approval, level: 'stable', factor: 1, icon: '🗳️', title: 'Starfhæf stjórn', blurb: 'Fylgi ' + approval + '% — stjórnin heldur umboði sínu.' };
}

// Ráðgjafar: 3–4 hagsmuna-raddir sem gefa ANDSTÆÐ ráð eftir núverandi stöðu (bregst live við drögum).
// Hrein — aðeins úr kpis (+ valfrjáls round f. þemu). Ráðgefandi, engin vélræn áhrif; sýnir togstreitu.
export function advisors(kpis = {}, round = 1) {
  const v = kpis.verdbolga == null ? 2.5 : kpis.verdbolga, g = kpis.hagvoxtur == null ? 2 : kpis.hagvoxtur;
  const a = kpis.atvinnuleysi == null ? 4 : kpis.atvinnuleysi, km = kpis.kaupmattur == null ? 1 : kpis.kaupmattur;
  const sk = kpis.skuldir == null ? 40 : kpis.skuldir, lo = kpis.losun == null ? 100 : kpis.losun;
  const out = [];
  // 🏦 Seðlabankinn — verðstöðugleiki
  out.push({ icon: '🏦', who: 'Seðlabankinn', advice: v > 3.5 ? 'Verðbólgan er of há — herðið tökin: hærri vextir og aðhald, annars festist hún í sessi.' : v < 1.5 ? 'Verðhjöðnun vofir yfir — slakið á peningastefnunni og örvið eftirspurn.' : 'Verðbólga nálægt markmiði — haldið stöðugleikanum, ekki ofhitnun.' });
  // ✊ Verkalýðshreyfingin — störf & kaupmáttur
  out.push({ icon: '✊', who: 'Verkalýðshreyfingin', advice: a > 5 ? 'Atvinnuleysi bítur á fólk — verjið störf og heimili með tilfærslum og fjárfestingu.' : km < 0 ? 'Kaupmáttur rýrnar — tryggið að fólk haldi í við verðlagið með launum og bótum.' : 'Uppsveiflan verður að skila sér í launaumslögin — ekki bara til fyrirtækjanna.' });
  // 💼 Atvinnulífið — vöxtur & samkeppnishæfni
  out.push({ icon: '💼', who: 'Atvinnulífið', advice: g < 1.5 ? 'Hjólin hægja á sér — lækkið skatta og örvið fjárfestingu áður en það harðnar.' : sk > 55 ? 'Skuldir ríkisins fæla frá — sýnið aðhald svo lánsfé haldist ódýrt.' : 'Fyrirsjáanleiki er allt — haldið stöðugu umhverfi svo fyrirtæki þori að fjárfesta.' });
  // þema-ráðgjafi eftir tímabili
  if (round >= 6) out.push({ icon: '🌱', who: 'Umhverfissinnar', advice: lo > 105 ? 'Losunin stefnir í ranga átt — kolefnisgjald og orkuskipti STRAX, framtíðin er í húfi.' : 'Þið eruð á réttri leið í loftslagsmálum — haldið kúrsinum, ekki hvika við fyrsta mótlæti.' });
  else if (round === 2 || round === 5) out.push({ icon: '🐟', who: 'Sjávarútvegurinn', advice: 'Ekki drepa gullgæsina með of háu veiðigjaldi — en gætið að stofninum, hann er sameign þjóðarinnar.' });
  return out;
}

// Leikslok-titill eftir meðal-composite (0–100).
export function endTitle(avg) {
  if (avg >= 85) return { title: '🏆 Efnahags-undrið', blurb: 'Framúrskarandi hagstjórn — Ísland blómstraði undir ykkar forystu.' };
  if (avg >= 70) return { title: '🌟 Farsæl ríkisstjórn', blurb: 'Traust og árangursrík stjórn sem skilaði góðum árangri.' };
  if (avg >= 55) return { title: '👍 Traust hagstjórn', blurb: 'Sæmileg útkoma með nokkrum áskorunum á leiðinni.' };
  if (avg >= 40) return { title: '😬 Brösug kjörtímabil', blurb: 'Erfið stjórn — margt fór úrskeiðis en þið hélduð sjó.' };
  return { title: '💥 Hrun-stjórnin', blurb: 'Efnahagslegt öngþveiti. Sagan fer ekki mjúkum höndum um ykkur.' };
}
