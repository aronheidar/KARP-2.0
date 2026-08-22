// ÞJÓÐARSÁTTIN — fangaklemma ÞVERT Á LIÐ (leik-lag, snertir ALDREI engine/hermi). HREINT — engin env/D1/crypto.
// Rofi: config.satt = true (sjálfgefið false). Í sáttar-lotum (sjálfgefið KT3=2008-12 „hrunið" og KT6=2020-24
// „verðbólguskotið"; fac má breyta með config.sattLotur) stendur ÖLLUM liðum sama BLINDA tvíkosta-valið í decide:
//   'satt'   = Þjóðarsátt: halda aftur af launum og verðlagi (treysta því að hin liðin geri það líka)
//   'saekja' = Sækja fram: launa-/verðhækkanir sem gagnast okkur NÚNA (á kostnað stöðugleikans)
// Lið sem LÆSIR ÁN ÞESS AÐ VELJA telst 'saekja' (sá sem ekki skrifar undir er utan sáttar) — sjá SATT_TEXTI.ekkiValid.
// ÚTKOMAN ræðst af því hvað ÖLL lið völdu (n lið, k völdu 'satt'):
//   samvinna  k = n        → allir fá samvinnu-bónus (stöðugleiki skilar sér)
//   svik      n/2 ≤ k < n  → svikarar fá FREISTINGAR-ábata (en kynda eigin verðbólgu), sáttar-lið (sogarar) fá smit + vonbrigði
//   spirall   k < n/2      → allir fá verðbólguspíral; svikarar halda minnkandi freistingu, sáttar-lið tapa á heiðarleikanum
//   einn      n = 1        → 'satt' = samvinnu-bónus (ríkisstjórn + ASÍ/SA í huganum), 'saekja' = freistingar-ábati svikara
// Áhrifin beitast á uppgjörs-KPI eins og surprise/policies: EFTIR applySurprise og policies, FYRIR scoring (server.mjs).
// 'pop' = bein fylgis-breyting → govtStability(kpis, popAdj) (hönnunin kallar þetta „stability" — það er fylgið).
// Stigagjöf ÓBREYTT — áhrifin fara gegnum KPI (+ fylgi → stöðugleika-stuðul).
//
// ── SATT_FYLKI — TÖLURNAR (einn staður). Jafnvægis-hermt í satt.test.mjs (sjá þar: skilyrði (i)–(iv)). ─────────────
// Upphafstillaga hönnunar (samvinna −0,8/+0,3/+4 · svikari +1,2/+0,5/+5 · sogari +0,4/−2 · spírall +1,0/−3 · ±0,5/−0,3)
// STÓÐST EKKI skilyrði (ii) „eitt svik er best fyrir svikarann þegar hinir halda": í GOAL_SPECS-hallanum kostar
// 1 pp verðbólga 28,6 stig (zeroAt 3,5·w1) en 1 pp kaupmáttur gefur aðeins 21,7 stig (zeroAt 6·w1,3) → verðbólgu-
// sveiflan 0,8+0,5 = 1,3 pp (37 stig) vó þyngra en kaupmáttar-ábatinn 1,2−0,3 = 0,9 pp (19,5 stig) — svik var
// ALDREI freistandi í stigum (aðeins +1 fylgi). Stillt innan ±30%-rammans — fjórar KPI-tölurnar sem ráða (ii) að
// jaðri rammans + fylgi svikara: samvinna verðbólga −0,8→−0,56 (−30%), kaupmáttur +0,3→+0,21 (−30%);
// svikari kaupmáttur +1,2→+1,56 (+30%), verðbólga +0,5→+0,35 (−30%), fylgi +5→+6 (+20%). Annað ÓBREYTT.
// Niðurstaða (línulegt svæði GOAL_SPECS, KT3-umboð, fylgi hlutlaust): samvinna ≈ +4,0 stig/lið, svikari ≈ +4,5 stig
// (+2 fylgi umfram) → freistingin er RAUNVERULEG en hófleg; sogari ≈ −2,2; spírall ≈ −3,2 (svikari) / −6,7 (sáttar-lið).
// Svik er EKKI ráðandi: sé liðið á vogarskálinni (svik þess kæmi spíralnum af stað) borgar sig að halda.
// ⚠ GILDISSVIÐ: stig-hvatarnir lifa aðeins þar sem KPI er UTAN markmiðs-bands en INNAN zeroAt (scoreRound er flöt
// 100 innan bands og gólfuð í 0 handan zeroAt): verðbólga ≈ 3,3–6,8 %, kaupmáttur < 0,5 (medium). Hermir-lota með
// hlutlausa stjórn: KT3 endar ≈ 7,7 % (verðbólgu-stig þegar 0 → verðbólgu-áhrif sáttar ósýnileg, kaupmáttur −3,6
// ber allt) · KT6 ≈ 2,5 % / kaupm. 1,6 (hvort tveggja innan bands → nær engin stigaáhrif) · KT7 ≈ 4,1 % / −0,1
// (kjörsvæði). Fylgið (pop → ólgu-/uppreisnar-þröskuldar 40/28) ber kennsluna alls staðar.
export const SATT_FYLKI = {
  samvinna: { verdbolga: -0.56, kaupmattur: 0.21, pop: 4 },                   // allir satt — hver og einn
  svik: {
    svikari: { kaupmattur: 1.56, verdbolga: 0.35, pop: 6 },                    // freisting — en þeir kynda sjálfir
    sattLid: { verdbolga: 0.4, pop: -2 },                                      // sogari: svikin smita, „létum plata okkur"
  },
  spirall: {
    allir: { verdbolga: 1.0, pop: -3 },                                        // verðbólguspírall hjá ÖLLUM
    svikari: { kaupmattur: 0.5 },                                              // minnkandi freisting (ofan á allir)
    sattLid: { kaupmattur: -0.3 },                                             // töpuðu á heiðarleikanum (ofan á allir)
  },
  // einn (n=1): 'satt' → samvinna, 'saekja' → svik.svikari (eigin verðbólga, enginn sogari) — ekki sér-tölur.
};

export const SATT_DEFAULT_LOTUR = [3, 6];   // KT3 = 2008–12 hrunið · KT6 = 2020–24 verðbólguskotið

export const SATT_VAL = {
  satt: { key: 'satt', label: 'Þjóðarsátt', icon: '🤝', blurb: 'Halda aftur af launum og verðlagi — og treysta því að hin liðin geri það líka. Stöðugleikinn skilar sér, EF hann er gagnkvæmur.' },
  saekja: { key: 'saekja', label: 'Sækja fram', icon: '💪', blurb: 'Launahækkanir og verðhækkanir sem gagnast okkur núna. Ábati strax — en verðbólgan kynnt, og hin liðin sitja uppi með smitið.' },
};

export const SATT_FLOKKAR = {
  samvinna: { key: 'samvinna', icon: '🤝', label: 'Samvinna — allir héldu' },
  svik: { key: 'svik', icon: '🗡️', label: 'Svik — sumir sóttu fram' },
  spirall: { key: 'spirall', icon: '🌀', label: 'Verðbólguspírall — flestir sóttu fram' },
  einn: { key: 'einn', icon: '🏛️', label: 'Eitt lið — sáttin við sjálfan sig' },
};

// UI-textar (einn staður f. decide/watch/results — Verk 2/3 nota þessa).
export const SATT_TEXTI = {
  titill: '🤝 Þjóðarsáttin',
  spurning: 'Kjarasamningar eru lausir og verðbólgan bítur. Skrifið þið undir þjóðarsátt — eða sækið þið fram?',
  blint: 'Valið er blint: hin liðin sjá það ekki fyrr en í uppgjöri.',
  karphus: 'Karphúsið er opið — talið saman. Leikstjóri lokar hléinu og þá læsa liðin valinu sínu.',
  ekkiValid: 'Þið hafið ekki tekið afstöðu — telst Sækja fram (sá sem ekki skrifar undir er utan sáttar).',
  watch: 'Þjóðarsátt í gangi — lið velja',
  results: '🤝 Þjóðarsáttin — hvað gerðist',
};

// Lotu-listi úr config: fylki af tölum, eða strengur „3,6" (fac-form). null/undefined → sjálfgefið. Tómt fylki = aldrei.
function sattLotur(cfg) {
  const raw = cfg && cfg.sattLotur;
  if (raw == null) return SATT_DEFAULT_LOTUR;
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[\s,;]+/);
  return arr.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
}

// Er umferð `round` sáttar-lota í þessum leik? Krefst cfg.satt (rofinn) OG að lotan sé í cfg.sattLotur||sjálfgefið.
export function sattLota(round, cfg) {
  if (!cfg || !cfg.satt) return false;
  return sattLotur(cfg).includes(Number(round));
}

// Eðlilegt val: aðeins 'satt' telst sátt — null/undefined/annað = 'saekja' (utan sáttar).
export function sattNormVal(v) { return v === 'satt' ? 'satt' : 'saekja'; }

const add = (...effs) => { const o = {}; for (const e of effs) { if (!e) continue; for (const k in e) o[k] = Math.round(((o[k] || 0) + e[k]) * 1000) / 1000; } return o; };

// Kennslusetning per flokk (ein setning, íslenska).
function sattTexti(flokkur, k, n, val) {
  if (flokkur === 'samvinna') return 'Allir héldu — traustið borgaði sig: verðbólgan hjaðnaði og kaupmátturinn hélt. Þetta var Þjóðarsáttin 1990: hún hélt af því hver og einn treysti því að hinir héldu.';
  if (flokkur === 'svik') return (n - k) + ' af ' + n + ' sóttu fram og græddu í bili — en sáttar-liðin sátu uppi með verðbólgusmitið og svikin. Traust sem er ekki gagnkvæmt er dýrt, og svikin sjást.';
  if (flokkur === 'spirall') return 'Flestir sóttu fram — enginn treysti neinum og verðbólguspírallinn át ávinninginn af öllum. Svona leit 9. áratugurinn út, áður en sáttin náðist.';
  // einn
  return val === 'satt'
    ? 'Þið hélduð aftur af ykkur — og samningsaðilarnir (ASÍ/SA í huganum) líka: stöðugleikinn skilaði sér. Í raun þurfti alla að borðinu.'
    : 'Þið sóttuð fram: kaupmáttur upp í bili — en þið kyntuð verðbólguna sjálf. Án sáttar borgar enginn annar reikninginn.';
}

// ÚTKOMA sáttar-lotu. valin = { teamId: 'satt'|'saekja'|null } (null/annað = 'saekja').
// → { flokkur, k, n, perTeam: { teamId: { val, svikari, effect: { verdbolga?, kaupmattur?, pop? } } }, texti }
// Hrein og deterministísk: sama inntak → sama úttak.
export function sattUtkoma(valin) {
  const ids = Object.keys(valin || {});
  const n = ids.length;
  const vals = {}; for (const id of ids) vals[id] = sattNormVal(valin[id]);
  const k = ids.filter((id) => vals[id] === 'satt').length;
  let flokkur;
  if (n === 0) return { flokkur: 'samvinna', k: 0, n: 0, perTeam: {}, texti: '' };
  if (n === 1) flokkur = 'einn';
  else if (k === n) flokkur = 'samvinna';
  else if (k >= n / 2) flokkur = 'svik';
  else flokkur = 'spirall';
  const F = SATT_FYLKI, perTeam = {};
  for (const id of ids) {
    const val = vals[id], svikari = val !== 'satt';
    let effect;
    if (flokkur === 'samvinna') effect = add(F.samvinna);
    else if (flokkur === 'svik') effect = add(svikari ? F.svik.svikari : F.svik.sattLid);
    else if (flokkur === 'spirall') effect = add(F.spirall.allir, svikari ? F.spirall.svikari : F.spirall.sattLid);
    else effect = add(svikari ? F.svik.svikari : F.samvinna);   // einn
    perTeam[id] = { val, svikari, effect };
  }
  return { flokkur, k, n, perTeam, texti: sattTexti(flokkur, k, n, n === 1 ? vals[ids[0]] : null) };
}

// Beitir sáttar-áhrifum á uppgjörs-KPI (sama form og applySurprise): aðeins tilgreindir lyklar hreyfast, og aðeins
// ef KPI er til í kpis; 'pop' fer í sér-gildi (bein fylgis-breyting). Skilar { kpis, pop }.
export function applySatt(kpis, effect) {
  const k = { ...(kpis || {}) }; let pop = 0;
  if (effect) for (const key in effect) { if (key === 'pop') pop += effect[key]; else if (k[key] != null) k[key] += effect[key]; }
  return { kpis: k, pop };
}
