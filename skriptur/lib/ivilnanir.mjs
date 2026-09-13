// Hrein föll fyrir ívilnana-vaktina (build_ivilnanir.mjs). Engin I/O, engin net-köll.
//
// Af hverju vakt en ekki byggingarskript (13.9.2026): `gogn/ivilnanir.json` er RITSTÝRÐ skrá.
// Engin veita listar „allar ívilnanir ríkisins" — hver færsla er mannleg ákvörðun um hvað telst
// ívilnun og hvernig hún er orðuð. Skript sem þættist búa listann til myndi skálda hann.
// Það sem VÉL getur gert er að vakta forsendurnar: hvort lögin sem vísað er í standi enn,
// hvort þeim hafi verið breytt, hvort færsla sé útrunnin — og benda á ný lög sem gætu átt heima.

export const STODUR = new Set(['virk', 'breytt', 'lidin']);

// Elstu lög í lagasafni Alþingis eru frá 1275 (Jónsbók) en lagasafns-slóðin nær frá 1874.
const FYRSTA_AR = 1874;

/** Slóð á lagatexta í gildandi lagasafni. 90/2003 → .../lagas/nuna/2003090.html */
export function lagaSlod(nr, ar) {
  return `https://www.althingi.is/lagas/nuna/${ar}${String(nr).padStart(3, '0')}.html`;
}

/** Hvernig lög eru rituð í heimildum okkar og í titlum Stjórnartíðinda: „nr. 90/2003". */
export function lagaMerki({ nr, ar }) {
  return `nr. ${nr}/${ar}`;
}

/**
 * Dregur lagatilvísanir úr `heimild`-streng.
 *
 * ⚠ Þrjár gildrur sem allar gefa ógildar slóðir ef þær eru hunsaðar:
 *   1. „Þingsályktun nr. 32/148" — 148 er ÞINGNÚMER, ekki ártal. Barnamenningarsjóður á engin lög.
 *   2. „rg. nr. 534/2020" / „reglugerð … nr. 203/1998" — reglugerðir eru ekki í lagasafninu.
 *   3. „nr. 111/2016" stakt á eftir „og" — ER lög (sjá séreignarsparnaðar-færsluna) og má ekki tapast.
 * Þess vegna er síað á UNDANFARANDA orði, ekki á því hvort „Lög" standi fremst.
 */
export function lagaTilvisanir(heimild) {
  if (!heimild) return [];
  const ut = [];
  const rx = /(\S+\s+)?nr\.\s*(\d{1,3})\/(\d{2,4})/g;
  let m;
  while ((m = rx.exec(heimild)) !== null) {
    const undan = (m[1] || '').toLowerCase();
    if (/(rg\.|reglugerð|reglur|þingsályktun|þál\.|augl\.|auglýsing)/.test(undan)) continue;
    const ar = Number(m[3]);
    if (!Number.isInteger(ar) || String(m[3]).length !== 4 || ar < FYRSTA_AR) continue;
    const nr = Number(m[2]);
    if (!ut.some((x) => x.nr === nr && x.ar === ar)) ut.push({ nr, ar });
  }
  return ut;
}

/** Reglugerðir sem heimildin styðst við — vaktaðar ekki, en taldar svo þær sjáist í úttaki. */
export function reglugerdaTilvisanir(heimild) {
  if (!heimild) return [];
  const ut = [];
  const rx = /(rg\.|reglugerð(?:ar)?(?:\s+um\s+[^,]{0,80})?)[^0-9]{0,12}nr\.\s*(\d{1,4})\/(\d{4})/gi;
  let m;
  while ((m = rx.exec(heimild)) !== null) {
    const nr = Number(m[2]);
    const ar = Number(m[3]);
    if (!ut.some((x) => x.nr === nr && x.ar === ar)) ut.push({ nr, ar });
  }
  return ut;
}

/**
 * Innri samkvæmni einnar færslu. Engin net-köll — þetta eru aðfinnslur sem gögnin bera sjálf.
 * Skilar fylki af { tegund, skyring }; tómt fylki = allt í lagi.
 */
export function innraProf(f, nuAr) {
  const a = [];
  const nafn = f && f.nafn ? f.nafn : '(ónefnd)';
  if (!f || typeof f !== 'object') return [{ tegund: 'ogild-faersla', skyring: 'færslan er ekki hlutur' }];

  if (!STODUR.has(f.stada)) {
    a.push({ tegund: 'ogild-stada', skyring: `stada="${f.stada}" — leyfilegt er ${[...STODUR].join(', ')}` });
  }
  const heimild = (f.heimild || '').trim();
  if (!heimild) {
    a.push({ tegund: 'heimild-vantar', skyring: 'engin heimild skráð' });
  } else if (!lagaTilvisanir(heimild).length && !/þingsályktun|þál\./i.test(heimild)) {
    a.push({ tegund: 'heimild-olaesileg', skyring: `engin lagatilvísun fannst í "${heimild}"` });
  }

  const fra = Number(f.fra) || null;
  const til = Number(f.til) || null;
  if (fra && til && fra > til) {
    a.push({ tegund: 'ogild-ar', skyring: `fra=${fra} er á eftir til=${til}` });
  }
  if (til && til < nuAr && f.stada === 'virk') {
    a.push({ tegund: 'utrunnid', skyring: `merkt virk en lauk ${til} (nú er ${nuAr})` });
  }
  return a.map((x) => ({ ...x, nafn }));
}

// Orð sem benda til stuðnings-/ívilnunarúrræðis í titli nýrra laga.
const KANDIDAT_ORD = /(styrk|stuðning|endurgreiðsl|ívilnun|ívilnan|bóta|bætur|frádrátt|niðurfelling|afslátt|undanþág|sjóð)/i;
// Breytingalög eru vöktuð sérstaklega (þau breyta færslum sem við eigum þegar) — ekki kandídatar.
const EKKI_KANDIDAT = /(breyting|brottfall|staðfesting á|fjárauka|fjárlög|fjármálaáætlun)/i;

/** Er titill nýrra laga hugsanlega ný ívilnun sem vantar í skrána? Tillaga, aldrei sjálfvirk innsetning. */
export function erKandidat(titill) {
  if (!titill) return false;
  const t = String(titill);
  if (!/^\s*LÖG\b/i.test(t)) return false;
  if (EKKI_KANDIDAT.test(t)) return false;
  return KANDIDAT_ORD.test(t);
}

/**
 * Ný auglýsing sem breytir lögum sem við vitnum í.
 * Titlar Stjórnartíðinda bera lagatilvísunina orðrétt: „… kórónuveiru, nr. 38/2020 (…)".
 */
export function snertirLog(titill, logFylki) {
  if (!titill) return [];
  return logFylki.filter((l) => titill.includes(lagaMerki(l)));
}

/**
 * Samræming titla svo bera megi saman auglýsingu Stjórnartíðinda og færslu í lagasafns-vísinum.
 * „LÖG um ráðstöfun viðbótariðgjalds …." ↔ „Lög um ráðstöfun viðbótariðgjalds …"
 */
export function normTitill(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+\s*$/, '').trim();
}

/**
 * Þáttar lagasafns-vísi Alþingis → [{ nr, ar, heiti }].
 * Vísirinn ber númerið í `data-laganumer` og titilinn í hlekknum:
 *   <li data-laganumer="71/2026" …><a href="/lagas/157c/2026071.html">Lög um …</a>, 2026 nr. 71 28. júní</li>
 * ⚠ Númerið er LESIÐ ÚR data-laganumer, ekki úr slóðinni — slóðin ber útgáfu lagasafnsins
 *   („157c") sem breytist við hvert þing og myndi brjóta þáttunina árlega.
 */
export function lagaVisir(html) {
  const ut = [];
  const rx = /data-laganumer="(\d{1,3})\/(\d{4})"[\s\S]{0,600}?<a\s[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = rx.exec(html)) !== null) {
    ut.push({ nr: Number(m[1]), ar: Number(m[2]), heiti: m[3].replace(/\s+/g, ' ').trim() });
  }
  return ut;
}

/** Uppflettitafla úr vísinum: samræmdur titill → lög. Notuð til að gefa kandídötum laganúmer. */
export function titilTafla(visir) {
  const t = new Map();
  for (const l of visir) if (!t.has(normTitill(l.heiti))) t.set(normTitill(l.heiti), { nr: l.nr, ar: l.ar });
  return t;
}

/** Einkvæm lög úr öllum færslum, í stafrófsröð eftir ári og númeri (stöðug röð = stöðugt diff). */
export function ollLog(faerslur) {
  const seen = new Map();
  for (const f of faerslur) {
    for (const l of lagaTilvisanir(f.heimild)) seen.set(`${l.ar}-${l.nr}`, l);
  }
  return [...seen.values()].sort((a, b) => a.ar - b.ar || a.nr - b.nr);
}
