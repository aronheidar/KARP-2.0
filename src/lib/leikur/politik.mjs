// PÓLITÍSKI SKALINN — hvar situr stjórnin? Vinstri, miðja eða hægri út frá RAUNVERULEGUM stillingum liðs.
// Hreint leik-lag (eins og scoring/policies): snertir ALDREI engine/hermi — les bara sleða-stig + stefnu-rofa.
//
// ⚖️ HÖNNUNARREGLA: þetta er LÝSANDI kennslutæki um stefnublöndu, EKKI gildisdómur. Enginn flokkur er
// „réttur" og ekkert stig er „betra" — leikurinn dæmir árangur með markmiðum/KPI, þessi skali segir bara
// HVERNIG stjórn liðið er í raun að reka. Vigtirnar eru meðvituð einföldun á íslenskri stjórnmálahefð og
// eiga heima á EINUM stað (hér) svo auðvelt sé að endurstilla þær. Viðmið: skattar á fjármagn/hátekjur/
// auðlindir UPP = vinstri; ríkisútgjöld/velferð/bætur UPP = vinstri; skattalækkanir/einkavæðingar-átt =
// hægri; græn gjöld/losunarskattar = vinstri-græn (telja vinstri, minni vigt); peningastefna og
// þjóðhagsvarúð Seðlabankans = hlutlaus (ekki flokkspólitík).
import { POLICIES } from './policies.mjs';

// ── Vigtir sleða: {leverId: -3..+3}. Neikvætt = togar til VINSTRI þegar sleðinn fer UPP frá grunni,
// jákvætt = togar til HÆGRI þegar hann fer upp. Sleðar með 0-vigt eru SLEPPT úr objectinu (skjalfest neðst).
export const LEVER_VIGT = {
  // Ríkisfjármál & skattar
  skattar: -2,               // tekjuskattur upp = tekjuöflun/jöfnuður (vinstri); niður = skattalækkanir (hægri)
  fjarmagnstekjuskattur: -3, // skattur á fjármagn er eitt skýrasta V/H-markið í íslenskri umræðu
  tryggingagjald: -1,        // launatengd gjöld á atvinnurekendur upp = vinstri; lækkun klassísk hægri-krafa (væg — gagnrýnt þvert á flokka)
  utgjold: -2,               // almenn ríkisútgjöld upp = stærra ríki (vinstri); aðhald/niðurskurður = hægri
  tilfaerslur: -3,           // barnabætur/tilfærslur eru kjarna-velferðarstefna (vinstri)
  innvidir: -1,              // opinber fjárfesting hallar vinstra en nýtur breiðrar sáttar (væg)
  veidigjald: -3,            // hærra veiðigjald er skýr vinstri-krafa; lækkun/afnám hægri
  menntun: -2,               // aukin opinber útgjöld til menntunar/rannsókna = samneyslu-átt (vinstri)
  // Húsnæði
  leiguhusnaedi: -2,         // félagslegt/leiguhúsnæði er klassísk vinstristefna
  lodaframbod: 1,            // aukið lóðaframboð/losað skipulag = markaðslausn á húsnæðisvanda (væg hægri)
  // Vinnumarkaður & mannauður
  laun: -2,                  // miklar samningsbundnar launahækkanir = verkalýðshreyfingar-átt (vinstri)
  lifeyrisaldur: 1,          // hækkun lífeyrisaldurs = aðhalds-/vinnuhvata-átt (hægri); lækkun vinstri
  // Auðlindir, orka & loftslag
  fiskeldi: 1,               // útþensla fiskeldis = atvinnuuppbygging umfram náttúruvernd (væg hægri)
  fridun: -1,                // friðun/verndarsvæði sjávar = náttúruvernd (græn-vinstri, minni vigt)
  orka: 1,                   // meiri orka til stóriðju = stóriðjustefna (samræmt stjoridja-valinu +1)
  orkuskipti: -1,            // grænn hvati (græn-vinstri, minni vigt — talsverð þverpólitísk sátt)
  kolefnisgjald: -2,         // grænn SKATTUR: bæði gjald og loftslagsstýring (vinstri-græn)
  votlendi: -1,              // endurheimt votlendis = græn-vinstri áhersla (bændur/hægri efins)
  // Byggð & ferðaþjónusta
  ferdamannagjald: -1,       // nýtt gjald + álagsstýring ferðaþjónustu (væg vinstri)
};
// 0-vigt (sleppt að ofan — engin skýr pólitísk átt):
//   vextir/vedhlutfall/dsti/bindiskylda — peningastefna og þjóðhagsvarúð Seðlabankans, ekki flokkspólitík
//   verdtrygging (SLEÐINN) — tæknileg samsetning lánamarkaðar; pólitíska afstaðan (afnám) er fönguð í
//     POLICY_VIGT.verdtrygging — sleðinn fær 0 til að forðast tvítalningu
//   vsk — neysluskattur: hækkun er hvorki skýr vinstri (íþyngir lágtekjuhópum mest) né hægri
//   ivilnanir — ríkisstuðningur (vinstri-tæki) við atvinnulíf/nýsköpun (hægri-markmið): óskýr átt
//   frambod — allir flokkar vilja fleiri íbúðir; engin skýr átt
//   atvinnuthatttaka — virk vinnumarkaðsstefna nýtur breiðrar norrænnar sáttar
//   innflytjendastefna — opnun/lokun er ÖNNUR VÍDD (alþjóðahyggja/þjóðernishyggja), ekki V/H
//   kvoti — aflamark fylgir ráðgjöf Hafró; fagleg ákvörðun, ekki flokkspólitík
//   skograekt — kolefnisbinding með skógrækt nýtur þverpólitískrar sáttar
//   byggdastefna — byggðaáhersla er miðju-/dreifbýlisás (ekki skýr V/H)

// Heiti + bil vigtaðra sleða (afrit úr gogn/roads/baseline.json — prófið staðfestir að bilin séu í takt,
// svo endurnefning/endurskölun í baseline brýtur prófin en aldrei hljóðlega útreikninginn).
// game-config geymir engin sleða-heiti; þau koma hér (spegla baseline-labels), ákvörðunar-heiti úr policies.mjs.
export const LEVER_META = {
  skattar: { heiti: 'Tekjuskattur', min: -15, base: 0, max: 15 },
  fjarmagnstekjuskattur: { heiti: 'Fjármagnstekjuskattur', min: -10, base: 0, max: 15 },
  tryggingagjald: { heiti: 'Tryggingagjald', min: -5, base: 0, max: 8 },
  utgjold: { heiti: 'Ríkisútgjöld', min: -15, base: 0, max: 15 },
  tilfaerslur: { heiti: 'Tilfærslur (barnabætur o.fl.)', min: -10, base: 0, max: 20 },
  innvidir: { heiti: 'Innviðafjárfesting', min: -10, base: 0, max: 30 },
  veidigjald: { heiti: 'Veiðigjald', min: -50, base: 0, max: 100 },
  menntun: { heiti: 'Menntun & rannsóknir', min: -10, base: 0, max: 30 },
  leiguhusnaedi: { heiti: 'Félagslegt/leiguhúsnæði', min: 0, base: 0, max: 40 },
  lodaframbod: { heiti: 'Lóðaframboð & skipulag', min: -10, base: 0, max: 40 },
  laun: { heiti: 'Launahækkanir (kjarasamningar)', min: 0, base: 6, max: 14 },
  lifeyrisaldur: { heiti: 'Lífeyrisaldur', min: 65, base: 67, max: 72 },
  fiskeldi: { heiti: 'Fiskeldi', min: -20, base: 0, max: 60 },
  fridun: { heiti: 'Friðun/verndarsvæði sjávar', min: 0, base: 0, max: 30 },
  orka: { heiti: 'Orka til stóriðju', min: -15, base: 0, max: 30 },
  orkuskipti: { heiti: 'Orkuskipta-hvati', min: -10, base: 0, max: 40 },
  kolefnisgjald: { heiti: 'Kolefnisgjald', min: -50, base: 0, max: 100 },
  votlendi: { heiti: 'Endurheimt votlendis', min: 0, base: 0, max: 40 },
  ferdamannagjald: { heiti: 'Ferðamannagjald', min: 0, base: 0, max: 40 },
};

// ── Vigtir stefnu-rofa/vala: {policyId: vigt} (toggle, gildir þegar Á) eða {policyId: {valkostur: vigt}}.
export const POLICY_VIGT = {
  bankar: { thjod: -2, einka: 2 },          // ríkiseign vs einkavæðing banka: skýrasta V/H-val leiksins
  fjarmalaregluverk: { losa: 2, adhald: -1 }, // afregluvæðing/útrás = hægri; strangt eftirlit hallar vinstra
  stjoridja: { reisa: 1, hafna: -1 },       // stóriðja = vöxtur/atvinnu-átt (væg hægri); höfnun = græn-vinstri
  verdtrygging: -1,                          // afnám = inngrip í lánamarkað í þágu heimila (væg vinstri)
  hoft: -1,                                  // gjaldeyrishöft = ríkisstýring fjármagnsflæðis (væg vinstri)
  audlindasjodur: -1,                        // auðlindaarður í sameiginlegan sjóð = samneyslu-átt (væg vinstri)
  esb: 0,     // ÖNNUR VÍDD: alþjóðahyggja/fullveldi klýfur báðar blokkir (Samfylking já, VG nei) — ekki V/H
  icesave: 0, // þjóðaratkvæði þvert á flokkslínur — ekki V/H
};

// ── SKÖLUN (skjalfest): hrátt stig = Σ(normað frávik × LEVER_VIGT) + Σ(POLICY_VIGT virkra rofa/vala).
// Normað frávik = (gildi−base)/(max−base) þegar sleði fer upp, (gildi−base)/(base−min) þegar niður →
// alltaf í [-1,1] þótt bilin séu ósamhverf (t.d. veiðigjald -50..+100). stig = round(hrátt × SKALI),
// klemmt á [-100,100]. Kvörðun SKALI=8: eitt full-nýtt stórmál (vigt 3) ≈ 24 stig — rétt INNAN miðju;
// tvö skýr vinstri/hægri útspil fara yfir flokka-mörkin (±25). Hrátt ±12,5 (≈helmingur heildar-getu
// annarrar áttar) klemmist á ±100.
export const SKALI = 8;
export const FLOKKA_MORK = 25; // stig ≤ -25 → vinstri · -25 < stig < 25 → miðja · stig ≥ 25 → hægri

const LYSING = { vinstri: 'Vinstrisinnuð stjórn', midja: 'Miðjustjórn', haegri: 'Hægrisinnuð stjórn' };
const policyById = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// Normað frávik sleða í [-1,1]. Tekur skalar-gildi; fái hún fylki (per-fjórðungs leið úr resolve) er
// SÍÐASTA gildið notað (núverandi staða). Óþekkt/ótölulegt gildi eða base-jaðar án svigrúms → 0.
function normFravik(id, v) {
  const m = LEVER_META[id];
  if (!m) return 0;
  const val = Array.isArray(v) ? v[v.length - 1] : v;
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  const dev = val - m.base;
  if (dev === 0) return 0;
  const span = dev > 0 ? m.max - m.base : m.base - m.min;
  if (!(span > 0)) return 0;
  return Math.max(-1, Math.min(1, dev / span));
}

// Merki togs fyrir birtingu: sleða-heiti + átt sleðans (↑/↓) eða ákvörðunar-heiti úr policies.mjs.
function policyLabel(id, v) {
  const p = policyById[id];
  if (!p) return id;
  if (p.kind === 'toggle') return p.onLabel || p.label;
  const o = (p.options || []).find((x) => x.key === v);
  return `${p.label}: ${o ? o.label : String(v)}`;
}

// Hvar situr stjórnin? levers = {leverId: núverandi gildi} (sama rými og baseline: alger gildi, fráviks-
// sleðar með base 0), policyStates = úr policyStates() í policies.mjs. → { stig, flokkur, lysing, togar }.
// togar = { vinstri: [allt að 3 {label, framlag}], haegri: [sama] } — stærstu framlögin hvora átt,
// framlag = jákvæð stærð í stigum (sama kvarða og `stig`), raðað stærsta fyrst.
export function politikStada(levers = {}, policyStates = {}) {
  const framlog = []; // {label, c} — c formerkt hrátt framlag (− = vinstri, + = hægri)
  let raw = 0;
  for (const id in LEVER_VIGT) {
    const n = normFravik(id, levers ? levers[id] : null);
    if (!n) continue;
    const c = n * LEVER_VIGT[id];
    raw += c;
    framlog.push({ label: `${LEVER_META[id].heiti} ${n > 0 ? '↑' : '↓'}`, c });
  }
  for (const id in POLICY_VIGT) {
    const v = policyStates ? policyStates[id] : null;
    if (v == null || v === false) continue; // óvirkur rofi/ekkert val → ekkert framlag
    const w = POLICY_VIGT[id];
    const c = typeof w === 'number' ? w : typeof v === 'string' && typeof w[v] === 'number' ? w[v] : 0;
    if (!c) continue;
    raw += c;
    framlog.push({ label: policyLabel(id, v), c });
  }
  const stig = Math.max(-100, Math.min(100, Math.round(raw * SKALI)));
  const flokkur = stig <= -FLOKKA_MORK ? 'vinstri' : stig >= FLOKKA_MORK ? 'haegri' : 'midja';
  const top = (sign) =>
    framlog
      .filter((f) => (sign < 0 ? f.c < 0 : f.c > 0))
      .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
      .slice(0, 3)
      .map((f) => ({ label: f.label, framlag: Math.round(Math.abs(f.c) * SKALI * 10) / 10 }));
  return { stig, flokkur, lysing: LYSING[flokkur], togar: { vinstri: top(-1), haegri: top(1) } };
}

// Ferill yfir leikinn: historyLevers = listi per-lotu, hvert stak annaðhvort hreint lever-sett
// {leverId: gildi} EÐA {round?, levers, policies?} → [{round, stig, flokkur}] í lotu-röð (f. leikslok-graf).
export function politikFerill(historyLevers = []) {
  return (historyLevers || []).map((item, i) => {
    const wrapped = item && typeof item === 'object' && item.levers !== undefined;
    const levers = wrapped ? item.levers : item;
    const policies = (wrapped && item.policies) || {};
    const round = wrapped && item.round != null ? item.round : i + 1;
    const s = politikStada(levers || {}, policies);
    return { round, stig: s.stig, flokkur: s.flokkur };
  });
}
