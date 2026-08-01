// Fasi E — STEFNU-ROFAR (leik-lag, snerta EKKI deilda líkanið/hermi): stórar tvíkosta-ákvarðanir úr íslenskri
// hagsögu. Rofar (toggle: á/af, halda þar til breytt) eða val (choice: einu sinni, varanlegt). Áhrif beitt á
// uppgjörs-KPI eins og höftin — skýr fórnarskipti fyrir kennslu. `from`/`to` = kjörtímabils-gluggi.
import { applyHoft } from './hoft.mjs';

export const POLICIES = [
  { id: 'hoft', icon: '🔒', label: 'Gjaldeyrishöft', kind: 'toggle', from: 3,
    onLabel: 'Setja á höft', offLabel: 'Afnema höftin', desc: 'Stöðva fjármagnsflótta í kreppu. Verja gengi & verðbólgu — en drag á hagvöxt (fæla fjárfestingu). Sett 2008, afnumin 2015–17.' },
  { id: 'verdtrygging', icon: '🏠', label: 'Verðtrygging', kind: 'toggle', from: 1,
    onLabel: 'Afnema verðtryggingu', offLabel: 'Taka aftur upp', desc: 'Afnám verndar heimilin gegn því að lán stökkbreytist í verðbólgu (eins og 2008) — en hækkar nafnvexti og gerir lánsfé dýrara. Sígilt deiluefni.' },
  { id: 'esb', icon: '🇪🇺', label: 'ESB / evru-stefna', kind: 'toggle', from: 4, to: 7,
    onLabel: 'Sækja um ESB-aðild', offLabel: 'Draga umsókn til baka', desc: 'Stefna á aðild og evru: gengis-stöðugleiki og lægra áhættuálag — en tap á sjálfstæðri peningastefnu og skammtíma-aðlögun. Umsókn 2009, dregin 2015.' },
  { id: 'icesave', icon: '💷', label: 'Icesave', kind: 'choice', from: 4, to: 4,
    options: [{ key: 'pay', label: 'Greiða' }, { key: 'reject', label: 'Hafna (þjóðaratkvæði)' }],
    desc: 'Greiða kröfur breskra/hollenskra sparifjáreigenda? Greiða → hærri skuldir en endurheimt traust. Hafna → engar nýjar skuldir en lánshæfi versnar skammtímalega. Tvær þjóðaratkvæðagreiðslur.' },
  { id: 'bankar', icon: '🏦', label: 'Bankarnir eftir hrun', kind: 'choice', from: 3, to: 4,
    options: [{ key: 'thjod', label: 'Þjóðnýta / ríkiseign' }, { key: 'einka', label: 'Einkavæða á ný' }],
    desc: 'Halda bönkunum í ríkiseigu eða einkavæða? Ríkiseign → stöðugleiki en fjárhagsáhætta. Einkavæðing → fjárhags-léttir og kraftur en endurtekningar-áhætta.' },
  { id: 'stjoridja', icon: '🏭', label: 'Stóriðja (Kárahnjúkar/álver)', kind: 'choice', from: 2, to: 3,
    options: [{ key: 'reisa', label: 'Reisa stórver' }, { key: 'hafna', label: 'Hafna — vernda náttúru' }],
    desc: 'Virkja og reisa álver? Reisa → kröftugur hagvöxtur, störf og byggð úti á landi, EN stóraukin losun og óafturkræf náttúruspjöll. Hafna → grænni ferill en minni vöxtur. Kárahnjúkar/Fjarðaál-deilan 2003–07.' },
  { id: 'fjarmalaregluverk', icon: '📊', label: 'Regluverk fjármálakerfis (útrás)', kind: 'choice', from: 2, to: 3,
    options: [{ key: 'losa', label: 'Losa um höftin (útrás)' }, { key: 'adhald', label: 'Strangt fjármálaeftirlit' }],
    desc: 'Leyfa bönkunum að þenjast út erlendis eða halda þeim í skefjum? Losa → mikill uppgangur og kaupmáttur strax, EN kerfisáhætta hleðst upp. Aðhald → hægari vöxtur en traustara kerfi. Útrásin 2004–08.' },
  { id: 'audlindasjodur', icon: '🪙', label: 'Þjóðarsjóður auðlinda', kind: 'toggle', from: 5,
    onLabel: 'Stofna þjóðarsjóð', offLabel: 'Leggja sjóðinn niður', desc: 'Leggja auðlindaarð (orka/sjávarútvegur/ferðamenn) í varasjóð í stað þess að eyða jafnóðum. Lækkar skuldir og styrkir viðnám gegn áföllum — en minna til skiptanna núna. Norska leiðin.' },
];
const byId = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// Er stefnu-rofi í boði í tiltekinni umferð (og — fyrir choice — ekki þegar ákveðinn)?
export function policyAvailable(p, round, states) {
  if (round < (p.from || 1)) return false;
  if (p.to && round > p.to) return false;
  if (p.kind === 'choice' && states && states[p.id] != null) return false; // val er varanlegt
  return true;
}

// Leysir núverandi stöðu allra rofa úr ákvörðunasögu. history = [{...decision, policies?}] í röð (umferð 1..N).
export function policyStates(history = []) {
  const st = {};
  for (const h of history) {
    const pol = (h && h.policies) || {};
    for (const p of POLICIES) {
      if (!(p.id in pol)) continue;
      const v = pol[p.id];
      if (p.kind === 'toggle') st[p.id] = !!v;                 // rofi: síðasta stilling gildir
      else if (st[p.id] == null && v != null) st[p.id] = v;    // val: fyrsta ákvörðun varanleg
    }
  }
  return st;
}

// F1-V2: eins og policyStates() en skilar líka `since` = {id: lotan þar sem NÚVERANDI staða var FYRST sett}.
// Toggle sem er slökkt og kveikt aftur → since = seinni kveikjan; endurtekin SAMA stilling færir since ekki.
// history-item án .round → vísitala í fylkinu + 1 (history er byggt umferð 1..N í server.mjs).
export function policyStatesMeta(history = []) {
  const states = {}, since = {};
  history.forEach((h, i) => {
    const round = (h && h.round != null) ? h.round : i + 1;
    const pol = (h && h.policies) || {};
    for (const p of POLICIES) {
      if (!(p.id in pol)) continue;
      const v = pol[p.id];
      if (p.kind === 'toggle') { const nv = !!v; if (states[p.id] !== nv) { states[p.id] = nv; since[p.id] = round; } }
      else if (states[p.id] == null && v != null) { states[p.id] = v; since[p.id] = round; }
    }
  });
  return { states, since };
}

// F1-V2: stig ákvörðunar í tiltekinni lotu. ESB-lífsferill: 'umsokn' (lotan sem sótt er um) → 'adild' (upp frá því);
// 'ursogn' = lotan sem slökkt var (esb false og since===round — toggle fór true→false í þeirri lotu).
// Aðrar virkar ákvarðanir → 'virk'; óvirkar → null (ekkert stig).
export function policyStage(id, states = {}, since = {}, round) {
  const v = states[id];
  if (id === 'esb') {
    if (v === true) return round === since.esb ? 'umsokn' : 'adild';
    if (v === false && since.esb === round) return 'ursogn';
    return null;
  }
  return (v == null || v === false) ? null : 'virk';
}

// Beitir áhrifum allra virkra rofa á uppgjörs-KPI (levels). baselineLevels: grunn-gildi (path í lok umferðar).
// stages (valfrjálst, F1-V2): {id:stig} úr policyStage — stýrir ESB-lífsferli; vantar → óbreytt hegðun.
export function applyPolicies(kpis, states = {}, baselineLevels = {}, stages = null) {
  let k = { ...kpis };
  const infl = k.verdbolga == null ? 2.5 : k.verdbolga;
  // 🔒 Höft: stöðugleiki (dregur gengi/verðbólgu að grunni) + vaxtar-drag.
  if (states.hoft === true) k = applyHoft(k, baselineLevels);
  // 🏠 Verðtrygging afnumin: léttir alltaf á heimilum (kaupmáttur↑, vanskil↓), MEIRA í hárri verðbólgu — en dýrara lánsfé (nafnvextir↑) dregur úr vexti.
  if (states.verdtrygging === true) {
    const prot = Math.max(0, infl - 4);
    if (k.kaupmattur != null) k.kaupmattur += 0.3 + prot * 0.25;
    if (k.vanskil != null) k.vanskil -= 3 + prot * 2;
    if (k.hagvoxtur != null) k.hagvoxtur -= 0.3;
    if (k.verdbolga != null) k.verdbolga += 0.2;
  }
  // 🇪🇺 ESB-lífsferill (stages.esb): 'umsokn' → AÐEINS vægt drag (aðildarferlið kostar en skilar engu enn);
  // 'ursogn' → úrsagnar-högg í eina lotu og ENGIN ESB-áhrif; 'adild'/stages vantar → full áhrif ef virkt:
  // stöðugleiki verðbólgu/gengis + lægra áhættuálag (skuldir−) — en skammtíma vaxtar-drag (sterkari króna/aðlögun).
  const esbStage = stages ? stages.esb : null;
  if (esbStage === 'umsokn') { if (k.hagvoxtur != null) k.hagvoxtur -= 0.1; }
  else if (esbStage === 'ursogn') { if (k.hagvoxtur != null) k.hagvoxtur -= 0.4; if (k.verdbolga != null) k.verdbolga += 0.3; }
  else if (states.esb === true) {
    const stab = (key) => { if (k[key] != null && baselineLevels[key] != null) k[key] += 0.25 * (baselineLevels[key] - k[key]); };
    stab('verdbolga'); stab('gengi'); stab('gengi_endo');
    if (k.hagvoxtur != null) k.hagvoxtur -= 0.2;
    if (k.skuldir != null) k.skuldir -= 2;
  }
  // 💷 Icesave: greiða → skuldir+ en traust/vöxtur+; hafna → engar nýjar skuldir (skuldir−) en skammtíma vaxtar-högg + gengisþrýstingur.
  if (states.icesave === 'pay') { if (k.skuldir != null) k.skuldir += 7; if (k.hagvoxtur != null) k.hagvoxtur += 0.4; }
  else if (states.icesave === 'reject') { if (k.skuldir != null) k.skuldir -= 3; if (k.hagvoxtur != null) k.hagvoxtur -= 0.5; if (k.verdbolga != null) k.verdbolga += 0.3; }
  // 🏦 Bankar: þjóðnýta → skuldir+ og minni kraftur en meiri atvinnu-stöðugleiki; einkavæða → skuldir− og vöxtur+ en endurnýjuð vanskil-áhætta.
  if (states.bankar === 'thjod') { if (k.skuldir != null) k.skuldir += 5; if (k.hagvoxtur != null) k.hagvoxtur -= 0.3; if (k.atvinnuleysi != null) k.atvinnuleysi -= 0.3; }
  else if (states.bankar === 'einka') { if (k.skuldir != null) k.skuldir -= 4; if (k.hagvoxtur != null) k.hagvoxtur += 0.3; if (k.vanskil != null) k.vanskil += 3; }
  // 🏭 Stóriðja: reisa → kröftugur vöxtur + byggð + störf EN mikil losun; hafna → grænni ferill en minni vöxtur.
  if (states.stjoridja === 'reisa') { if (k.hagvoxtur != null) k.hagvoxtur += 0.6; if (k.byggdajofnudur != null) k.byggdajofnudur += 4; if (k.atvinnuleysi != null) k.atvinnuleysi -= 0.3; if (k.losun != null) k.losun += 6; }
  else if (states.stjoridja === 'hafna') { if (k.hagvoxtur != null) k.hagvoxtur -= 0.3; if (k.byggdajofnudur != null) k.byggdajofnudur -= 2; if (k.losun != null) k.losun -= 4; }
  // 📊 Fjármálaregluverk: losa → uppgangur + kaupmáttur strax EN kerfisáhætta (vanskil↑, skuldir↑, verðbólga↑); aðhald → hægari en traustara (vanskil↓).
  if (states.fjarmalaregluverk === 'losa') { if (k.hagvoxtur != null) k.hagvoxtur += 0.7; if (k.kaupmattur != null) k.kaupmattur += 0.4; if (k.vanskil != null) k.vanskil += 6; if (k.skuldir != null) k.skuldir += 2; if (k.verdbolga != null) k.verdbolga += 0.3; }
  else if (states.fjarmalaregluverk === 'adhald') { if (k.hagvoxtur != null) k.hagvoxtur -= 0.3; if (k.vanskil != null) k.vanskil -= 4; if (k.verdbolga != null) k.verdbolga -= 0.2; }
  // 🪙 Þjóðarsjóður: leggja arð til hliðar → lægri skuldir + viðnám, en minna til skiptanna núna (vöxtur/kaupmáttur örlítið lægri).
  if (states.audlindasjodur === true) { if (k.skuldir != null) k.skuldir -= 6; if (k.hagvoxtur != null) k.hagvoxtur -= 0.15; if (k.kaupmattur != null) k.kaupmattur -= 0.2; }
  return k;
}

// F1-V2: framlag hverrar VIRKRAR ákvörðunar á þessa lotu, reiknað með diffi (applyPolicies með öllum vs. öllum
// NEMA þessari) → nákvæmt líka fyrir skilyrt/víxlverkandi áhrif (verðtrygging×verðbólga, höft×gengi …).
// Skilar {id:{kpi:delta}}; deltas rúnnuð á 2 aukastafi, |delta|<0.005 sleppt; virk ákvörðun með engin áhrif → {} (EKKI sleppt — badge birtist samt).
export function policyDeltas(kpis, states = {}, baselineLevels = {}, stages = null) {
  const out = {};
  const full = applyPolicies(kpis, states, baselineLevels, stages);
  for (const p of POLICIES) {
    const v = states[p.id]; if (v == null || v === false) continue;
    const stW = { ...states }; delete stW[p.id];
    const sgW = stages ? { ...stages } : null; if (sgW) delete sgW[p.id];
    const without = applyPolicies(kpis, stW, baselineLevels, sgW);
    const d = {};
    for (const key in full) {
      if (typeof full[key] !== 'number' || typeof without[key] !== 'number') continue;
      const delta = Math.round((full[key] - without[key]) * 100) / 100;
      if (Math.abs(delta) >= 0.005) d[key] = delta;
    }
    out[p.id] = d;
  }
  return out;
}

// Pólitísk vigt hvers rofa/vals — BEIN áhrif á fylgi (óháð þjóðhags-útkomu). +vinsælt / −óvinsælt.
export const POLICY_POP = {
  hoft: { on: -2 },              // höft: væg óvinsæld (frelsis-skerðing) þótt stöðugleiki hjálpi
  verdtrygging: { on: 6 },       // afnám verðtryggingar mjög vinsælt hjá heimilum/skuldurum
  esb: { on: -2 },               // ESB/evra klofin þjóð, örlítið neikvætt í heild
  icesave: { pay: -8, reject: 8 }, // þjóðin hafnaði tvisvar — höfnun mjög vinsæl, greiðsla óvinsæl
  bankar: { thjod: 4, einka: -5 }, // þjóðnýting vinsæl (ábyrgð), endur-einkavæðing óvinsæl
  stjoridja: { reisa: 2, hafna: -1 },      // störf/vöxtur vinsæl á sínum tíma, en klofin þjóð (umhverfi)
  fjarmalaregluverk: { losa: 4, adhald: -3 }, // góðærið var vinsælt; aðhald óvinsælt í uppsveiflu
  audlindasjodur: { on: -1 },              // ábyrgt en „af hverju ekki nota arðinn núna?"
};
// Nettó fylgis-breyting af virkum rofum/völum.
export function policyApproval(states = {}) {
  let d = 0;
  for (const id in states) {
    const m = POLICY_POP[id]; if (!m) continue;
    const v = states[id];
    if (v === true && m.on != null) d += m.on;
    else if (typeof v === 'string' && m[v] != null) d += m[v];
  }
  return d;
}

// Manna-læsileg samantekt á stefnu-ákvörðunum liðs (úr lokastöðu rofa) — f. leikslok-samantekt + leikstjóra.
export function describePolicies(states = {}) {
  const out = [];
  for (const p of POLICIES) {
    const v = states[p.id]; if (v == null || v === false) continue;
    let choice;
    if (p.kind === 'toggle') choice = p.onLabel || 'virkt';
    else { const o = (p.options || []).find((x) => x.key === v); choice = o ? o.label : String(v); }
    out.push({ id: p.id, icon: p.icon, label: p.label, choice });
  }
  return out;
}

export { byId as policyById };
