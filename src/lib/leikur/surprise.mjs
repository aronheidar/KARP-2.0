// Fasi „skemmtun 3": ÓVÆNT ATVIK + klemmu-spjöld (leik-lag, valfrjálst — leikstjóri kveikir).
// Áhrif beitt á uppgjörs-KPI eins og policies (+ `pop` = bein fylgis-áhrif). Sum atvik hafa KLEMMU (tvíkosta-val).
// Roll er DETERMINÍSKT úr (kóða, umferð) → sama atvik fyrir ÖLL lið, engin geymsla, endurtakanlegt.
export const SURPRISE_EVENTS = [
  { id: 'eldgos', icon: '🌋', title: 'Eldgos á Reykjanesi', text: 'Kvika brýtur sér leið upp og hraun ógnar innviðum og flugumferð. Þjóðin bíður milli vonar og ótta.', effect: { hagvoxtur: -0.3 },
    dilemma: { q: 'Hvernig bregstu við?', options: [{ key: 'neydarfe', label: 'Setja neyðar-innviðafé', effect: { skuldir: 2, byggdajofnudur: 3, pop: 4 } }, { key: 'bida', label: 'Halda ró og treysta vörnum', effect: { pop: -3 } }] } },
  { id: 'makrill', icon: '🐟', title: 'Makríll gengur í lögsöguna', text: 'Óvæntur makríl-uppgangur skapar deilur: stórsókn strax eða gæta stofnsins?', effect: { hagvoxtur: 0.2 },
    dilemma: { q: 'Hvað gerir þú?', options: [{ key: 'storsokn', label: 'Leyfa stórsókn', effect: { hagvoxtur: 0.3, fiskistofn: -5 } }, { key: 'hofleg', label: 'Hófleg, sjálfbær nýting', effect: { fiskistofn: 3, pop: 2 } }] } },
  { id: 'verkfall', icon: '✊', title: 'Verkföll boðuð', text: 'Verkalýðshreyfingin boðar allsherjarverkfall — kröfur um bætt kjör harðna.', effect: { hagvoxtur: -0.2 },
    dilemma: { q: 'Samningaviðræður?', options: [{ key: 'semja', label: 'Semja um launahækkun', effect: { kaupmattur: 2, verdbolga: 0.4, pop: 5 } }, { key: 'standa', label: 'Standa fast á ríkiskassanum', effect: { pop: -5, atvinnuleysi: 0.2 } }] } },
  { id: 'gagnaver', icon: '🏭', title: 'Risa-gagnaver vill fjárfesta', text: 'Alþjóðlegt tæknifyrirtæki vill reisa gagnaver — störf og fjárfesting, en það étur orku og losun.', effect: {},
    dilemma: { q: 'Bjóða ívilnanir?', options: [{ key: 'ja', label: 'Laða það hingað', effect: { hagvoxtur: 0.4, losun: 4, byggdajofnudur: 2 } }, { key: 'nei', label: 'Hafna — vernda orku og umhverfi', effect: { pop: -2 } }] } },
  { id: 'spilling', icon: '📰', title: 'Spillingarmál kemur upp', text: 'Fjölmiðlar afhjúpa vafasama hagsmunagæslu ráðherra. Almenningur er reiður.', effect: { pop: -6 },
    dilemma: { q: 'Viðbrögð?', options: [{ key: 'segjaaf', label: 'Ráðherra segir af sér', effect: { pop: 4 } }, { key: 'verja', label: 'Verja ráðherrann', effect: { pop: -5 } }] } },
  { id: 'tsunami', icon: '❄️', title: 'Óveður og samgöngurof', text: 'Fárviðri lamar samgöngur og raforku um land allt í nokkra daga.', effect: { hagvoxtur: -0.2, byggdajofnudur: -2 } },
  { id: 'nyskopun', icon: '💡', title: 'Íslenskt tæknifyrirtæki slær í gegn', text: 'Sprotafyrirtæki er selt fyrir metfé — landið kemst á kortið sem nýsköpunar-þjóð.', effect: { hagvoxtur: 0.4, pop: 2 } },
  { id: 'jafnretti', icon: '🌍', title: 'Ísland efst á jafnréttis-lista', text: 'Alþjóðleg viðurkenning fyrir jafnrétti og lífsgæði vekur stolt og athygli.', effect: { jofnudur: 2, pop: 4 } },
];
const byId = Object.fromEntries(SURPRISE_EVENTS.map((e) => [e.id, e]));
export function surpriseById(id) { return byId[id] || null; }

// Merki valins klemmu-kosts (fyrir leikstjóra-samantekt). Skilar null ef atvik/klemma/val vantar.
export function dilemmaChoiceLabel(event, choiceKey) {
  if (!event || !event.dilemma) return null;
  const o = (event.dilemma.options || []).find((x) => x.key === choiceKey);
  return o ? o.label : null;
}

// Deterministískt atvik fyrir (kóða, umferð). ~55% líkur; ekki í KT1 (kynning). Sama f. öll lið.
export function rollSurprise(code, round) {
  if (!code || round < 2) return null;
  let h = 2166136261; const s = code + '#' + round; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  if ((h % 100) < 45) return null;                       // ~55% að eitthvað gerist
  return SURPRISE_EVENTS[h % SURPRISE_EVENTS.length];
}

// Beitir atviks-áhrifum (+ valinni klemmu-leið) á uppgjörs-KPI. Skilar { kpis, pop } (pop=bein fylgis-breyting).
export function applySurprise(kpis, event, choiceKey) {
  let k = { ...kpis }, pop = 0;
  const apply = (eff) => { if (!eff) return; for (const key in eff) { if (key === 'pop') pop += eff[key]; else if (k[key] != null) k[key] += eff[key]; } };
  if (event) { apply(event.effect); if (event.dilemma && choiceKey) { const o = (event.dilemma.options || []).find((x) => x.key === choiceKey); if (o) apply(o.effect); } }
  return { kpis: k, pop };
}
