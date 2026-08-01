// demo-logic.mjs — „Lifðu af 2008": opinn demo-hamur RÁS-Leiksins (/leikur/demo/, engin innskráning).
// HREIN eining — ekkert DOM, engin env/D1/fetch. Endurnýtir prófuðu leik-einingarnar ÓBREYTTAR:
// resolve (hermir), scoring (umboðs-stig), policies (stóru ákvarðanirnar), flavor (fyrirsagnir/fylgi)
// og kort-throp (Íslandskorts-þrep). Sviðsmyndin er EITT kjörtímabil — KT3, bankahrunið 2008–2012 —
// tekið beint úr SCENARIO í game-config svo demo-ið segir sömu sögu og fulli leikurinn.
//
// Keyrir jafnt í vafra (Vite, /leikur/demo/) og í Node (próf) — sama isomorphic-regla og engine.mjs.
import { SCENARIO, REALITY, YEAR_START, GOAL_SPECS, mandateFor } from './game-config.mjs';
import { resolveTeam } from './resolve.mjs';
import { scoreRound } from './scoring.mjs';
import { newsHeadlines, govtStability } from './flavor.mjs';
import { applyPolicies, policyApproval, policyById } from './policies.mjs';
import { kortThrep } from './kort-throp.mjs';

// — Fastar demo-stillingar ————————————————————————————————————————————
export const DEMO_ROUND = 3; // KT3 = bankahrunið
export const DEMO_YEAR_FROM = 2008;
export const DEMO_YEAR_TO = 2012;
// Atburður kjörtímabilsins (titill/texti/sjokk) — beint úr sögulegu sviðsmyndinni.
export const DEMO_EVENT = SCENARIO.events[DEMO_ROUND - 1];

// 7 kjarna-sleðar sem BÍTA í kreppu (úrval úr baseline.levers; studio-hamur tekur alger gildi):
//   vextir       — stýrivextir: verja krónuna/verðbólgu vs kæfa hagvöxt
//   utgjold      — ríkisútgjöld: örva eða skera niður
//   skattar      — tekjuskattur: afla tekna vs kremja kaupmátt
//   tilfaerslur  — verja heimilin (barnabætur o.fl.)
//   innvidir     — fjárfesta út úr kreppunni
//   menntun      — menntun & rannsóknir (langtíma-viðspyrna)
//   laun         — kjarasamningar: launahækkanir í kreppu
export const DEMO_LEVERS = ['vextir', 'utgjold', 'skattar', 'tilfaerslur', 'innvidir', 'menntun', 'laun'];

// Stóru ákvarðanirnar sem eiga við KT3 (from/to í policies.mjs): bankarnir (choice, from 3)
// og gjaldeyrishöftin (toggle, from 3). Icesave er from=4 og er því EKKI í boði í demo-inu.
export const DEMO_POLICY_IDS = ['bankar', 'hoft'];
export const DEMO_POLICIES = DEMO_POLICY_IDS.map((id) => policyById[id]);

// KPI-lyklarnir sem demo-ið birtir (flísar + raun-samanburður). Labels úr GOAL_SPECS.
export const DEMO_KPIS = ['verdbolga', 'atvinnuleysi', 'skuldir', 'hagvoxtur'];

// Sviðsmynd demo-sins: aðeins bankahruns-atburðurinn (events[0] ↔ eina umferðin).
export function demoScenario() {
  return { id: 'demo2008', events: [DEMO_EVENT] };
}

// Hreinsun inntaks úr UI: aðeins demo-sleðar með endanlegar tölur (resolve klippir svo í [min,max]).
function sanitizeLevers(levers) {
  const out = {};
  if (!levers || typeof levers !== 'object') return out;
  for (const k of DEMO_LEVERS) {
    const v = +levers[k];
    if (k in levers && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// Aðeins gild stefnu-gildi: hoft = strangt true; bankar ∈ {thjod, einka}.
function sanitizePolicies(policies) {
  const st = {};
  if (!policies || typeof policies !== 'object') return st;
  if (policies.hoft === true) st.hoft = true;
  if (policies.bankar === 'thjod' || policies.bankar === 'einka') st.bankar = policies.bankar;
  return st;
}

/**
 * resolveDemo — allt kjörtímabilið 2008–2012 leyst Í EINU (sama keðja og server.mjs notar við uppgjör,
 * án D1/erfiðleikastigs/óvæntra atvika): resolveTeam (studio, 1 umferð, 2008-sjokkin) → applyPolicies
 * → scoreRound með mandateFor(3) → govtStability (fylgi + pólitísk vigt ákvarðana).
 *
 * @param {object} inp
 * @param {object} inp.baseline  gogn/roads/baseline.json
 * @param {object} inp.links     gogn/roads/links.json
 * @param {object} [inp.levers]   {lyklar úr DEMO_LEVERS: alger gildi} (studio-hamur)
 * @param {object} [inp.policies] { hoft?: true, bankar?: 'thjod'|'einka' }
 * @returns {{ kpis, perKpi, composite, crisis, stability, survived, score, headlines, threp, policyStates }}
 */
export function resolveDemo({ baseline, links, levers = {}, policies = {} }) {
  const history = [{ levers: sanitizeLevers(levers) }];
  const { kpis, quarters } = resolveTeam({ baseline, links, history, scenario: demoScenario(), mode: 'studio' });
  // Grunn-gildi í lok umferðar (sama og server.mjs) — höft/ESB draga KPI að þessum grunni.
  const qL = quarters - 1, bl2 = {};
  for (const bk of ['gengi', 'gengi_endo', 'verdbolga', 'hagvoxtur']) bl2[bk] = baseline.outcomes[bk] ? baseline.outcomes[bk].path[qL] : null;
  const states = sanitizePolicies(policies);
  const kpis2 = applyPolicies(kpis, states, bl2);
  const sc = scoreRound(kpis2, mandateFor(DEMO_ROUND));
  const stability = govtStability(kpis2, policyApproval(states));
  const score = Math.round(sc.composite * stability.factor * 10) / 10;
  return {
    kpis: kpis2,
    perKpi: sc.perKpi,
    composite: sc.composite,
    crisis: sc.crisis,
    stability,
    survived: stability.level !== 'revolt',
    score,
    headlines: newsHeadlines(kpis2),
    threp: kortThrep({ kpis: kpis2, policyStates: states }),
    policyStates: states,
  };
}

// — „Svona fór það í alvöru": raun-gildi (stílfært viðmið úr REALITY) við lok kjörtímabilsins 2012.
export function reality2012() {
  const i = DEMO_YEAR_TO - YEAR_START; // 2012 − 2000 = vísitala 12
  const out = {};
  for (const k of DEMO_KPIS) out[k] = REALITY[k][i];
  return out;
}

// Samanburðar-raðir: þitt gildi vs raun 2012, delta = þú − raun. Aðeins KPI með endanleg gildi.
export function vsReality(kpis = {}) {
  const real = reality2012();
  return DEMO_KPIS.filter((k) => Number.isFinite(kpis[k])).map((k) => ({
    key: k,
    label: (GOAL_SPECS[k] && GOAL_SPECS[k].label) || k,
    icon: (GOAL_SPECS[k] && GOAL_SPECS[k].icon) || '',
    you: Math.round(kpis[k] * 10) / 10,
    real: real[k],
    delta: Math.round((kpis[k] - real[k]) * 10) / 10,
  }));
}
