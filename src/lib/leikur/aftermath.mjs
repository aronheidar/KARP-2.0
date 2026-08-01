// ARFLEIFÐ FYRRI KJÖRTÍMABILS: stuttur texti í byrjun lotu sem lýsir hvernig standandi stórar ákvarðanir
// (stefnu-rofar) OG óvænt atvik síðustu lotu lita ÞESSA lotu. Hrein birting — snertir hvorki hermi né stig.
import { policyById } from './policies.mjs';
import { dilemmaChoiceLabel } from './surprise.mjs';

// „Enn í gildi"-áhrifalýsing per rofa/vali (framvirk: hvað það þýðir fyrir yfirstandandi kjörtímabil).
const POLICY_LEGACY = {
  hoft: 'Höftin halda genginu stöðugu og hemja verðbólgu — en fæla enn frá fjárfestingu og halda aftur af vexti.',
  verdtrygging: 'Verðtryggingin er af — heimilin sleppa við að lánin stökkbreytist, en nafnvextir eru hærri og lánsfé dýrara.',
  esb: 'ESB/evru-stefnan heldur genginu stöðugu og áhættuálagi lágu, en bindur hendur sjálfstæðrar peningastefnu.',
  icesave: { pay: 'Icesave-greiðslurnar íþyngja enn ríkissjóði, en traust erlendra fjárfesta er komið á ný.',
             reject: 'Höfnun Icesave sparar skuldir, en lánshæfið er enn viðkvæmt eftir deiluna.' },
  bankar: { thjod: 'Ríkisbankarnir veita stöðugleika en binda fé og áhættu hjá ríkinu.',
            einka: 'Einkavæddu bankarnir knýja vöxt en vanskila-áhættan er komin aftur í kerfið.' },
  stjoridja: { reisa: 'Stórverið malar gjaldeyri og heldur uppi byggð og störfum — en losunin er há og sækir í sig veðrið.',
               hafna: 'Náttúran var varin, en vaxtar-innspýtingin sem álverið hefði gefið vantar.' },
  fjarmalaregluverk: { losa: 'Útrásin og lausbeislaða fjármálakerfið kynda undir uppgang — en kerfisáhættan hleðst upp undir yfirborðinu.',
                       adhald: 'Stranga fjármálaeftirlitið heldur aftur af vexti en gerir kerfið mun traustara gegn áföllum.' },
  audlindasjodur: 'Þjóðarsjóðurinn safnar auðlindaarði — minna er til skiptanna núna, en skuldir lækka og viðnám gegn áföllum eykst.',
};

// Eftirmál óvænts atviks síðustu lotu (per atviks-kóða). Val liðsins fléttað inn þar sem það á við.
const EVENT_LEGACY = {
  eldgos: 'Uppbyggingin eftir eldgosið heldur áfram og litar fjárlög þessa kjörtímabils.',
  makrill: 'Makríl-vertíðin setti mark sitt á sjávarútveginn og umræðuna um sjálfbæra nýtingu.',
  verkfall: 'Kjarasamningarnir frá síðustu lotu hafa nú áhrif á launakostnað og verðlag.',
  gagnaver: 'Ákvörðunin um gagnaverið mótar enn orkunotkun og fjárfestingu.',
  spilling: 'Eftirmál spillingarmálsins lita enn traust almennings á stjórnvöldum.',
  tsunami: 'Tjónið eftir óveðrið kallar enn á viðgerðir á innviðum úti á landi.',
  nyskopun: 'Velgengni nýsköpunarfyrirtækisins hefur styrkt orðspor landsins og laðað að fjárfestingu.',
  jafnretti: 'Jafnréttis-viðurkenningin heldur áfram að styrkja ímynd og samheldni þjóðarinnar.',
};

// Byggir arfleifðar-samantekt. Skilar { policies:[{icon,label,text,deltas?}], event:{icon,title,choice,text}|null }
// eða null ef ekkert er að segja (engar virkar ákvarðanir og ekkert fyrra atvik).
// deltas (valfrjálst, F1-V2): {id:{kpi:delta}} úr policyDeltas síðustu lotu → berst áfram sem `deltas` á policy-röð (óbreytt annars).
export function carryover({ policyStates = {}, prevEvent = null, prevChoiceKey = null, deltas = null } = {}) {
  const policies = [];
  for (const id in policyStates) {
    const v = policyStates[id]; if (v == null || v === false) continue;
    const p = policyById[id]; if (!p) continue;
    const leg = POLICY_LEGACY[id];
    const text = (leg && typeof leg === 'object') ? (leg[v] || '') : (leg || p.desc || '');
    const row = { id, icon: p.icon, label: p.label, text };
    if (deltas && deltas[id] != null) row.deltas = deltas[id];
    policies.push(row);
  }
  let event = null;
  if (prevEvent && prevEvent.id) {
    event = { id: prevEvent.id, icon: prevEvent.icon, title: prevEvent.title,
      choice: dilemmaChoiceLabel(prevEvent, prevChoiceKey),
      text: EVENT_LEGACY[prevEvent.id] || '' };
  }
  if (!policies.length && !event) return null;
  return { policies, event };
}

export { POLICY_LEGACY, EVENT_LEGACY };
