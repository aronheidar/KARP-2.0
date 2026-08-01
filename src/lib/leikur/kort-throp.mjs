// kort-throp.mjs — hrein vörpunareining fyrir Lifandi Íslandskortið (hönnunarskjal kafli E).
//
// Varpar KPI-gildum leiksins + stefnu-ástandi (policyStates) + atviks-valum (eventChoices)
// í fá, gróf ÞREP (heiltölur 0-3) sem kort-svg.mjs teiknar sem lög á kortinu.
// Ekkert DOM, engin hliðaráhrif — bara hrein föll. Módel=gögn: öll mörk skjalfest hér.
//
// Dæmigert gildissvið KPI-anna (sbr. GOAL_SPECS í game-config.mjs):
//   fiskistofn      ~80-120  (vísitala, min-markmið 101)
//   byggdajofnudur  ~85-115  (vísitala, min-markmið 100)
//   losun           ~60-118  (vísitala, max-markmið 94 — LÆGRA er betra)

/**
 * Almenn þriggja-marka vörpun í þrep 0-3 (hálf-opin bil, neðra markið telst með efra þrepi):
 *   v <  m1        -> 0
 *   m1 <= v < m2   -> 1
 *   m2 <= v < m3   -> 2
 *   v >= m3        -> 3
 */
function threpUr(v, m1, m2, m3) {
  if (v < m1) return 0;
  if (v < m2) return 1;
  if (v < m3) return 2;
  return 3;
}

/** Skilar tölunni sjálfri ef hún er raunveruleg endanleg tala, annars null. */
function tala(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * kortThrep — varpar stöðu leiksins í kort-þrep.
 *
 * @param {object} inp
 * @param {object} [inp.kpis]         KPI-gildi (vísitölur ~100), t.d. { byggdajofnudur: 103, fiskistofn: 95, losun: 88, menntun: 0.2 }
 * @param {object} [inp.policyStates] Ástand stóru ákvarðananna, sbr. policyStates() í policies.mjs:
 *                                    { esb: true, stjoridja: 'reisa'|'hafna', audlindasjodur: true, hoft: true, ... }
 * @param {object} [inp.eventChoices] Atviks-val liðsins, t.d. { gagnaver: 'ja' }
 * @returns {{ byggd: number, menntun: number, fiskur: number, losun: number, taknmyndir: string[] }}
 *          byggd/menntun/fiskur/losun eru heiltölu-þrep 0-3; taknmyndir er listi fastra tákn-nafna.
 */
export function kortThrep({ kpis = {}, policyStates = {}, eventChoices = {} } = {}) {
  // — Byggð: úr byggdajofnudur-vísitölunni.
  //   Mörk: <92 -> 0 · 92-99 -> 1 · 99-106 -> 2 · >=106 -> 3 · vantar/ógilt -> 1
  const byggdV = tala(kpis.byggdajofnudur);
  const byggd = byggdV === null ? 1 : threpUr(byggdV, 92, 99, 106);

  // — Fiskistofn: úr fiskistofn-vísitölunni.
  //   Mörk: <90 -> 0 · 90-100 -> 1 · 100-110 -> 2 · >=110 -> 3 · vantar/ógilt -> 1
  const fiskV = tala(kpis.fiskistofn);
  const fiskur = fiskV === null ? 1 : threpUr(fiskV, 90, 100, 110);

  // — Losun: ÖFUGT — lægri losun er betri, þrepið er MENGUNAR-þrep á kortinu (0 = hreint).
  //   Mörk: <85 -> 0 · 85-95 -> 1 · 95-105 -> 2 · >=105 -> 3 · vantar/ógilt -> 2
  //   (threpUr gefur mengunar-þrepið beint: hærri losunar-vísitala -> hærra mistur-þrep.)
  const losunV = tala(kpis.losun);
  const losun = losunV === null ? 2 : threpUr(losunV, 85, 95, 105);

  // — Menntun: styður tvo mælikvarða.
  //   Gildi lesið úr kpis.menntun, annars kpis.mennt; vantar/ógilt -> 1.
  //   a) Sleða-frávik á bilinu -1..1 (báðir endar meðtaldir):
  //      <=-0.15 -> 0 · -0.15..0.15 -> 1 · 0.15..0.5 -> 2 · >0.5 -> 3
  //      (hálf-opin bil að ofan: 0.15 telst þrep 1, 0.5 telst þrep 2)
  //   b) Annars vísitala ~100: sömu mörk og byggð (<92 -> 0 · 92-99 -> 1 · 99-106 -> 2 · >=106 -> 3)
  const menntV = tala(kpis.menntun) ?? tala(kpis.mennt);
  let menntun;
  if (menntV === null) {
    menntun = 1;
  } else if (menntV >= -1 && menntV <= 1) {
    if (menntV <= -0.15) menntun = 0;
    else if (menntV <= 0.15) menntun = 1;
    else if (menntV <= 0.5) menntun = 2;
    else menntun = 3;
  } else {
    menntun = threpUr(menntV, 92, 99, 106);
  }

  // — Táknmyndir: stórar ákvarðanir og atviks-val birtast sem föst tákn á kortinu.
  //   Föst röð svo úttakið sé alltaf eins fyrir sama inntak (deterministic).
  const taknmyndir = [];
  if (policyStates.stjoridja === 'reisa') taknmyndir.push('alver');       // álver við Reyðarfjörð
  if (eventChoices.gagnaver === 'ja') taknmyndir.push('gagnaver');        // gagnaver við Blönduós
  if (policyStates.esb) taknmyndir.push('esb');                           // ESB-fáni við RVK-höfn (truthy nægir)
  if (policyStates.audlindasjodur === true) taknmyndir.push('sjodur');    // gull-kista við miðju (strangt true)
  if (policyStates.hoft === true) taknmyndir.push('hoft');                // lás við RVK (strangt true)

  return { byggd, menntun, fiskur, losun, taknmyndir };
}
