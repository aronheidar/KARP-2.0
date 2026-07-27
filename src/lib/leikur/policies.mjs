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

// Beitir áhrifum allra virkra rofa á uppgjörs-KPI (levels). baselineLevels: grunn-gildi (path í lok umferðar).
export function applyPolicies(kpis, states = {}, baselineLevels = {}) {
  let k = { ...kpis };
  const infl = k.verdbolga == null ? 2.5 : k.verdbolga;
  // 🔒 Höft: stöðugleiki (dregur gengi/verðbólgu að grunni) + vaxtar-drag.
  if (states.hoft === true) k = applyHoft(k, baselineLevels);
  // 🏠 Verðtrygging afnumin: verndar heimilin þegar verðbólga er há (kaupmáttur↑, vanskil↓) en smá vaxtar-drag alltaf.
  if (states.verdtrygging === true) {
    const prot = Math.max(0, infl - 4);
    if (k.kaupmattur != null) k.kaupmattur += prot * 0.2;
    if (k.vanskil != null) k.vanskil -= prot * 2;
    if (k.hagvoxtur != null) k.hagvoxtur -= 0.2;
  }
  // 🇪🇺 ESB/evru-stefna: stöðugleiki verðbólgu/gengis — en skammtíma vaxtar-drag (sterkari króna/aðlögun).
  if (states.esb === true) {
    const stab = (key) => { if (k[key] != null && baselineLevels[key] != null) k[key] += 0.25 * (baselineLevels[key] - k[key]); };
    stab('verdbolga'); stab('gengi'); stab('gengi_endo');
    if (k.hagvoxtur != null) k.hagvoxtur -= 0.2;
  }
  // 💷 Icesave: greiða → skuldir+ en traust/vöxtur+; hafna → engar skuldir en skammtíma vaxtar-högg + gengisþrýstingur.
  if (states.icesave === 'pay') { if (k.skuldir != null) k.skuldir += 7; if (k.hagvoxtur != null) k.hagvoxtur += 0.4; }
  else if (states.icesave === 'reject') { if (k.hagvoxtur != null) k.hagvoxtur -= 0.5; if (k.verdbolga != null) k.verdbolga += 0.3; }
  // 🏦 Bankar: þjóðnýta → skuldir+ og minni kraftur en meiri atvinnu-stöðugleiki; einkavæða → skuldir− og vöxtur+ en endurnýjuð vanskil-áhætta.
  if (states.bankar === 'thjod') { if (k.skuldir != null) k.skuldir += 5; if (k.hagvoxtur != null) k.hagvoxtur -= 0.3; if (k.atvinnuleysi != null) k.atvinnuleysi -= 0.3; }
  else if (states.bankar === 'einka') { if (k.skuldir != null) k.skuldir -= 4; if (k.hagvoxtur != null) k.hagvoxtur += 0.3; if (k.vanskil != null) k.vanskil += 3; }
  return k;
}

export { byId as policyById };
