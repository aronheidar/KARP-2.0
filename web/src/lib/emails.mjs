// emails.mjs — SKRÁ yfir alla pósta sem Karp sendir + sniðmáts-úrlausn. HREIN modúla (engin I/O)
// svo hún sé prófanleg (node:test) og nothæf bæði í worker og framenda-forskoðun.
// -----------------------------------------------------------------------------
// Hönnun: hver póst-tegund á SJÁLFGEFIÐ sniðmát sem er ORÐRÉTT núverandi texti worker.js.
// Stjórnandi getur vistað yfirskrift (override) í D1 (stjorn_sync k='email_templates');
// `resolveEmail` bræðir saman sjálfgefið + yfirskrift. Vanti yfirskrift → hegðun ÓBREYTT.
//
// TVEIR FLOKKAR:
//  • fastur   — allt meginmálið er sniðmát (audkenningar-póstar). Ritanlegt: subject + html.
//  • kvikur   — meginmálið er BÚIÐ TIL úr gögnum við sendingu (fréttalisti, vöktunar-atburðir).
//               Ritanlegt: subject + intro (á undan listanum) + footer (á eftir).
//
// ⚠ ÖRYGGI: `krafist` telur upp breytur sem MEGA EKKI hverfa úr sniðmátinu. T.d. án
//   {{hlekkur}} í 'verify' kæmist enginn nýr notandi inn. `validateEmail` hafnar slíku.

/** Skiptir út {{breyta}} fyrir gildi. Óþekktar breytur haldast óbreyttar (sýnilegt merki um villu). */
export function renderEmail(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

const KARP_FOOT = '<p style="color:#999;font-size:12px;margin-top:24px">karp.is</p>';
const BTN = (label) => '<p style="margin:22px 0"><a href="{{hlekkur}}" style="background:#8a5e00;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">' + label + '</a></p>';
const WRAP = (h2, body) => '<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;color:#222"><h2 style="color:#8a5e00;margin:0 0 12px">' + h2 + '</h2>' + body + KARP_FOOT + '</div>';

export const EMAIL_TYPES = [
  // ── Auðkenning (fastur texti) ────────────────────────────────────────────────
  {
    id: 'verify', label: 'Staðfestu netfangið', flokkur: 'fastur', hopur: 'Auðkenning',
    ritanlegt: ['subject','html'],
    hvenaer: 'Þegar notandi nýskráir sig', vidtakandi: 'Nýr notandi',
    breytur: ['hlekkur'], krafist: ['hlekkur'],
    subject: 'Staðfestu netfangið þitt á Karp',
    html: WRAP('Staðfestu netfangið þitt',
      '<p>Velkomin í Karp! Smelltu á hnappinn til að virkja aðganginn þinn.</p>'
      + BTN('Staðfesta netfang')
      + '<p style="color:#666;font-size:13px">Hlekkurinn gildir í 24 klukkustundir. Nýskráðir þú þig ekki? Hunsaðu þennan póst.</p>'),
  },
  {
    id: 'reset', label: 'Endurstilla lykilorð', flokkur: 'fastur', hopur: 'Auðkenning',
    ritanlegt: ['subject','html'],
    hvenaer: 'Notandi biður um endurstillingu („gleymt lykilorð")', vidtakandi: 'Notandi',
    breytur: ['hlekkur'], krafist: ['hlekkur'],
    subject: 'Endurstilla lykilorð á Karp',
    html: WRAP('Endurstilla lykilorð',
      '<p>Þú (eða einhver) baðst um að endurstilla lykilorðið á Karp-aðgangi þínum.</p>'
      + BTN('Velja nýtt lykilorð')
      + '<p style="color:#666;font-size:13px">Hlekkurinn gildir í eina klukkustund. Baðstu ekki um þetta? Hunsaðu póstinn — lykilorðið breytist ekki.</p>'),
  },
  {
    id: 'reset_admin', label: 'Endurstilling (stjórnandi ýtir)', flokkur: 'fastur', hopur: 'Auðkenning',
    ritanlegt: ['subject','html'],
    hvenaer: 'Stjórnandi sendir endurstillingu úr /stjorn/', vidtakandi: 'Notandi',
    breytur: ['hlekkur'], krafist: ['hlekkur'],
    subject: 'Endurstilla lykilorð á Karp',
    html: WRAP('Endurstilla lykilorð',
      '<p>Stjórnandi Karp bjó til hlekk til að endurstilla lykilorðið á aðgangi þínum.</p>'
      + BTN('Velja nýtt lykilorð')
      + '<p style="color:#666;font-size:13px">Hlekkurinn gildir í eina klukkustund.</p>'),
  },

  // ── Vaktir & yfirlit (kvikt meginmál) ───────────────────────────────────────
  {
    id: 'digest', label: '🐟 Vikuyfirlitið', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject'],
    hvenaer: 'Mánudags-cron (vikulegt yfirlit áskrifenda)', vidtakandi: 'Notendur með digest á',
    breytur: ['nafn'], krafist: [],
    subject: '🐟 Vikuyfirlitið þitt á Karp',
    intro: '', footer: '',
    ath: 'Meginmálið er sett saman úr vöktum notandans (digestBuild). Inngangur birtist efst, fótur neðst.',
  },
  {
    id: 'frettavakt', label: '🔔 Fréttavakt', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject'],
    hvenaer: '3-tíma cron — ný mál finnast sem passa við vöktun', vidtakandi: 'Notandi með fréttavakt',
    breytur: ['fjoldi', 'lysing'], krafist: [],
    subject: '🔔 Fréttavakt: {{lysing}}',
    intro: '', footer: '',
    ath: 'Listi yfir ný mál myndast sjálfkrafa. {{lysing}} = „1 nýtt mál" eða „N ný mál".',
  },
  {
    id: 'kyc_alert', label: 'Áreiðanleikavaktin — kritísk breyting', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject','intro','footer'],
    hvenaer: 'KYC-vöktun greinir kritíska breytingu á vöktuðu félagi', vidtakandi: 'Fyrirtæki+ áskrifandi',
    breytur: ['kt'], krafist: [],
    subject: 'Áreiðanleikavaktin: kritísk breyting ({{kt}})',
    intro: 'Kritísk vöktunar-breyting á vöktuðu félagi {{kt}}:',
    footer: 'Skoðaðu möppuna: https://karp.is/areidanleikavaktin/?kt={{kt}}',
  },
  {
    id: 'kyc_digest', label: '🗂️ Compliance-morgunfundurinn (viku-forgangsröðun)', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject', 'intro', 'footer'],
    hvenaer: 'Mánudags-cron — viku-forgangsröðun allra vaktaðra félaga áskrifandans',
    vidtakandi: 'Fyrirtæki+ áskrifandi með virka KYC-vöktun',
    breytur: ['fjoldi', 'obreytt'], krafist: [],
    subject: '🗂️ Morgunfundurinn: {{fjoldi}} félög þurfa athygli · {{obreytt}} án breytinga',
    intro: 'Viku-forgangsröðun Áreiðanleikavaktarinnar — alvarlegast efst:',
    footer: 'Mappan: https://karp.is/areidanleikavaktin/ · Forgangsröðunin er sjálfvirk ábending Karp — endanlegt mat er alltaf hjá tilkynningarskylda aðilanum.',
    ath: 'Meginmálið (félög + atburðir + fastar aðgerðatillögur) er deterministic úr kyc-digest.mjs — ekkert AI-skrifað.',
  },
  {
    id: 'ordspor_vakt', label: '📉 Orðsporsvakt (umfjöllun snarversnar)', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject', 'intro', 'footer'],
    hvenaer: 'Daglegur cron — orðspors-einkunn vaktaðs félags fellur skarpt eða verður mjög lág',
    vidtakandi: 'Notandi sem vaktar félagið',
    breytur: ['fjoldi', 'lysing'], krafist: [],
    subject: '📉 Orðsporsvakt: {{lysing}}',
    intro: 'Umfjöllun um eftirfarandi félög á vaktinni þinni hefur versnað marktækt. Einkunnin (0–100) byggir á tón fréttaumfjöllunar síðustu daga:',
    footer: 'Sjá nánar: https://karp.is/frettir/\n\nEinkunnin er vélrænt mat á tón umfjöllunar — ekki ritstjórnardómur. Þú færð þennan póst því þú vaktar félagið; stjórnaðu vöktun á https://karp.is/lobbyvakt/',
  },
  {
    id: 'eftirlit_crit', label: '🚨 Eftirlits-viðvörun (einkunn fellur)', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject','intro','footer'],
    hvenaer: '3-tíma cron — vaktaður staður fær einkunn 0-1', vidtakandi: 'Notandi sem vaktar staðinn',
    breytur: ['fjoldi', 'lysing'], krafist: [],
    subject: '🚨 Heilbrigðiseftirlit: {{lysing}} í einkunn 0-1',
    intro: 'Eftirfarandi staðir á vaktinni þinni fengu einkunn 0-1 (stöðvun/takmörkun) í nýjasta heilbrigðiseftirliti Reykjavíkur:',
    footer: 'Sjá nánar: https://karp.is/eftirlit-byggingar/?t=eftirlit\n\nÞú færð þennan póst því þú vaktar félagið í Fyrirtækjavaktinni — stjórnaðu vöktun á https://karp.is/lobbyvakt/',
  },
  {
    id: 'logbirting_crit', label: '🚨 Gjaldþrota-viðvörun', flokkur: 'kvikur', hopur: 'Vaktir & yfirlit',
    ritanlegt: ['subject','intro','footer'],
    hvenaer: '3-tíma cron — alvarleg tilkynning í Lögbirtingablaðinu', vidtakandi: 'Notandi sem vaktar félagið',
    breytur: ['lysing', 'kt'], krafist: [],
    subject: '🚨 Lögbirting: {{lysing}}',
    intro: 'Ný tilkynning í Lögbirtingablaðinu um félag á vaktinni þinni:',
    footer: 'Ferill málsins er á fyrirtækjaprófílnum: https://karp.is/fyrirtaeki/{{kt}}/\n\nÞú færð þennan póst því þú vaktar félagið í Fyrirtækjavaktinni — stjórnaðu vöktun á https://karp.is/lobbyvakt/',
  },

  // ── RÁS-Leikurinn (hægur hamur) ────────────────────────────────────────────
  // ⚠ PERSÓNUVERND (DPIA Viðbót 1, V1.3): þessir póstar mega EKKI bera liðsheiti,
  //   stig, uppgjör né ákvarðanir. Þátttakanda-pósturinn ber aðeins leikkóða,
  //   umferð, frest og hlekk; leikstjóra-pósturinn má að auki bera SAMTÖLUR um
  //   leikinn (fjölda liða) — aldrei neitt um einstakt lið. Bæti einhver slíku við
  //   verður fullyrðing skjalanna ósönn. Sendist EINGÖNGU þeim sem skráðu sig
  //   sjálfir í `leikur_askrift` (slökkt sjálfgefið).
  {
    id: 'leikur_lota', label: 'RÁS-Leikur: ný umferð opin', flokkur: 'fastur', hopur: 'RÁS-Leikurinn',
    ritanlegt: ['subject','html'],
    hvenaer: 'Hægur hamur — ný umferð opnast sjálfkrafa', vidtakandi: 'Þátttakandi sem kveikti á áminningu',
    breytur: ['kodi', 'lota', 'frestur', 'hlekkur'], krafist: ['hlekkur'],
    subject: 'Kjörtímabil {{lota}} er opið — leikur {{kodi}}',
    html: WRAP('Kjörtímabil {{lota}} er opið',
      '<p>Ný umferð er hafin í RÁS-Leiknum. Þið hafið til <b>{{frestur}}</b> til að stilla stefnuna og læsa henni.</p>'
      + BTN('Opna leikinn')
      + '<p style="color:#666;font-size:13px">Læsi liðið ekki fyrir frestinn eru þær stillingar sem þið hafið þegar sett læstar sjálfkrafa — leikurinn heldur áfram án tafar.</p>'
      + '<p style="color:#999;font-size:12px">Þú færð þennan póst því þú baðst um áminningu fyrir leik {{kodi}}. Slökktu á henni hvenær sem er inni í leiknum.</p>'),
    ath: 'Ber ENGIN liðsheiti, stig né ákvarðanir — sjá DPIA Viðbót 1, V1.3.',
  },
  {
    id: 'leikur_uppgjor', label: 'RÁS-Leikur: umferð gerð upp (leikstjóri)', flokkur: 'fastur', hopur: 'RÁS-Leikurinn',
    ritanlegt: ['subject','html'],
    hvenaer: 'Hægur hamur — umferð gerð upp sjálfkrafa', vidtakandi: 'Leikstjóri sem kveikti á áminningu',
    breytur: ['kodi', 'lota', 'lokid', 'laest', 'hlekkur'], krafist: ['hlekkur'],
    subject: 'Kjörtímabil {{lota}} gert upp — leikur {{kodi}}',
    html: WRAP('Kjörtímabil {{lota}} gert upp',
      '<p>Umferðin er gerð upp og næsta kjörtímabil er opið.</p>'
      + '<p><b>{{lokid}}</b> lið luku umferðinni sjálf · <b>{{laest}}</b> voru sjálf-læst þegar fresturinn rann út.</p>'
      + BTN('Skoða uppgjörið')
      + '<p style="color:#999;font-size:12px">Þú færð þennan póst því þú kveiktir á áminningu sem leikstjóri leiks {{kodi}}. Slökktu á henni inni í leiknum.</p>'),
    ath: 'Aðeins SAMTÖLUR um leikinn — engin liðsheiti, stig né ákvarðanir. Sjá DPIA Viðbót 1, V1.3.',
  },

  // ── Innri ──────────────────────────────────────────────────────────────────
  {
    id: 'hjalp', label: '[Hjálp] beiðni', flokkur: 'kvikur', hopur: 'Innri',
    ritanlegt: ['subject'],
    hvenaer: 'Notandi sendir fyrirspurn á /hjalp/', vidtakandi: 'hjalp@karp.is (innri)',
    breytur: ['flokkur', 'nafn'], krafist: [],
    subject: '[Hjálp] {{flokkur}} — {{nafn}}',
    intro: '', footer: '',
    ath: 'Innri tilkynning til þjónustuborðs — efnið er erindi notandans sjálfs.',
  },

  // ── Þjónustuborð (ticket-flæðið, sjá src/worker/tickets.mjs) ────────────────
  {
    id: 'ticket_mottaka', label: 'Ticket: móttökusvar til notanda', flokkur: 'fastur', hopur: 'Þjónustuborð',
    ritanlegt: ['subject','html'],
    hvenaer: 'Strax eftir að hjálparbeiðni berst — þjónustufulltrúinn (AI) hefur lesið erindið', vidtakandi: 'Notandinn sem sendi inn',
    breytur: ['ticket', 'nafn', 'svar'], krafist: ['ticket', 'svar'],
    subject: 'Erindið þitt er móttekið — mál {{ticket}}',
    html: WRAP('Erindið þitt er móttekið',
      '<p>{{svar}}</p>'
      + '<p style="margin:16px 0"><b>Málsnúmer:</b> {{ticket}} — hafðu það með ef þú bætir einhverju við (svaraðu bara þessum pósti).</p>'
      + '<p style="color:#666;font-size:13px">Þetta er sjálfvirkt móttökusvar frá þjónustufulltrúa Karp. Manneskja les samt öll erindi.</p>'),
    ath: 'Sjálfvirknin er sögð berum orðum — {{svar}} kemur frá AI-þjónustufulltrúanum og er gátað (engin loforð).',
  },
  {
    id: 'ticket_tillaga', label: 'Ticket: tillaga CTO-agents (samþykkja/hafna)', flokkur: 'fastur', hopur: 'Þjónustuborð',
    ritanlegt: ['subject','html'],
    hvenaer: 'CTO-agentinn hefur lagt lagfæringu á grein og bíður staðfestingar', vidtakandi: 'Stjórnandi (hjalp@)',
    breytur: ['ticket', 'flokkur', 'nafn', 'lysing', 'greining', 'diffstat', 'ahaetta', 'hlekkur_ja', 'hlekkur_nei', 'hlekkur_diff'], krafist: ['hlekkur_ja', 'hlekkur_nei'],
    subject: '[Ticket] Tillaga að lagfæringu — {{ticket}} ({{flokkur}})',
    html: '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#222">'
      + '<h2 style="color:#8a5e00;margin:0 0 12px">Tillaga að lagfæringu — {{ticket}}</h2>'
      + '<p style="margin:4px 0"><b>Erindi {{nafn}}:</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;margin:8px 0;color:#555">{{lysing}}</p>'
      + '<p style="margin:14px 0 4px"><b>Greining CTO-agents (áhætta: {{ahaetta}}):</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px;margin:8px 0">{{greining}}</p>'
      + '<pre style="background:#f6f3ea;padding:10px;border-radius:6px;font-size:12px;overflow-x:auto">{{diffstat}}</pre>'
      + '<p style="margin:22px 0"><a href="{{hlekkur_ja}}" style="background:#1c7a3d;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Já — leggja lagfæringuna út</a>'
      + ' &nbsp; <a href="{{hlekkur_nei}}" style="background:#8a2222;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Nei — hafna</a></p>'
      + '<p style="color:#666;font-size:13px">Diff-inn í heild: <a href="{{hlekkur_diff}}">{{hlekkur_diff}}</a><br>Já = ticket-merge keyrir prófin og sameinar við main; notandinn fær sjálfkrafa lokasvar. Hlekkirnir eru einnota.</p>'
      + KARP_FOOT + '</div>',
    ath: 'Ekkert fer í main án þessa pósts — mannlega samþykkið er hluti af hönnuninni, ekki millibilsástand.',
  },
  {
    id: 'ticket_greint', label: 'Ticket: greining án lagfæringar', flokkur: 'fastur', hopur: 'Þjónustuborð',
    ritanlegt: ['subject','html'],
    hvenaer: 'CTO-agentinn greindi málið en leggur ekki til patch (t.d. utanaðkomandi orsök)', vidtakandi: 'Stjórnandi (hjalp@)',
    breytur: ['ticket', 'flokkur', 'nafn', 'lysing', 'greining'], krafist: ['ticket'],
    subject: '[Ticket] Greining án lagfæringar — {{ticket}}',
    html: WRAP('Greining án lagfæringar — {{ticket}}',
      '<p><b>Erindi {{nafn}} ({{flokkur}}):</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;color:#555">{{lysing}}</p>'
      + '<p><b>Greining CTO-agents:</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #8a5e00;padding-left:12px">{{greining}}</p>'
      + '<p style="color:#666;font-size:13px">Engin breyting var lögð til — málið er hjá þér. Notandinn fékk móttökusvar en bíður lokasvars frá manneskju (Reply-To í hjálparpóstinum).</p>'),
  },
  {
    id: 'ticket_villa', label: 'Ticket: sjálfvirknin brást', flokkur: 'fastur', hopur: 'Þjónustuborð',
    ritanlegt: ['subject','html'],
    hvenaer: 'CTO-keyrsla eða ticket-merge féll — bilun á að ÖSKRA, ekki þegja', vidtakandi: 'Stjórnandi (hjalp@)',
    breytur: ['ticket', 'flokkur', 'nafn', 'lysing', 'greining'], krafist: ['ticket'],
    subject: '[Ticket] ⚠ Sjálfvirkni brást — {{ticket}}',
    html: WRAP('⚠ Sjálfvirkni brást — {{ticket}}',
      '<p><b>Erindi {{nafn}} ({{flokkur}}):</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px;color:#555">{{lysing}}</p>'
      + '<p><b>Villa:</b></p>'
      + '<p style="white-space:pre-wrap;border-left:3px solid #8a2222;padding-left:12px">{{greining}}</p>'
      + '<p style="color:#666;font-size:13px">Sjá Actions-loggana (cto.yml / ticket-merge.yml). Notandinn hefur EKKI fengið lokasvar — málið er hjá þér.</p>'),
  },
  {
    id: 'ticket_lagad', label: 'Ticket: lokasvar til notanda (málið leyst)', flokkur: 'fastur', hopur: 'Þjónustuborð',
    ritanlegt: ['subject','html'],
    hvenaer: 'Lagfæringin er komin í main eftir samþykki stjórnanda', vidtakandi: 'Notandinn sem sendi inn',
    breytur: ['ticket', 'nafn', 'svar'], krafist: ['ticket', 'svar'],
    subject: 'Málið þitt er leyst — {{ticket}}',
    html: WRAP('Málið þitt er leyst',
      '<p>{{svar}}</p>'
      + '<p style="margin:16px 0"><b>Málsnúmer:</b> {{ticket}}. Ef eitthvað er enn ekki eins og það á að vera skaltu endilega svara þessum pósti.</p>'
      + '<p style="color:#666;font-size:13px">Lagfæringin var yfirfarin og samþykkt af starfsmanni áður en hún var lögð út.</p>'),
    ath: '{{svar}} eru drög CTO-agents, send EFTIR mannlegt samþykki á breytingunni sjálfri.',
  },
];

export const emailById = (id) => EMAIL_TYPES.find((t) => t.id === id) || null;

/** Sjálfgefið sniðmát + yfirskrift stjórnanda. Skilar null ef tegund er óþekkt. */
export function resolveEmail(id, overrides) {
  const def = emailById(id);
  if (!def) return null;
  const ov = (overrides && overrides[id]) || {};
  const pick = (k) => (typeof ov[k] === 'string' ? ov[k] : def[k]);
  const out = { id: def.id, label: def.label, flokkur: def.flokkur, subject: pick('subject') };
  if (def.flokkur === 'fastur') out.html = pick('html');
  else { out.intro = pick('intro') || ''; out.footer = pick('footer') || ''; }
  out.breytt = Object.keys(ov).length > 0;
  return out;
}

/**
 * Gátar yfirskrift ÁÐUR en hún er vistuð. Skilar { ok, villa? }.
 * Hafnar: óþekktri tegund, reitum sem eru ekki ritanlegir, og vantandi SKYLDU-breytum
 * (t.d. {{hlekkur}} úr staðfestingar-pósti → enginn kæmist inn).
 */
export function validateEmail(id, patch) {
  const def = emailById(id);
  if (!def) return { ok: false, villa: 'Óþekkt póst-tegund.' };
  // `ritanlegt` telur upp reiti sem eru RAUNVERULEGA víraðir í sendingu — UI býður ekkert annað.
  const leyfd = def.ritanlegt || (def.flokkur === 'fastur' ? ['subject', 'html'] : ['subject']);
  for (const k of Object.keys(patch || {})) {
    if (!leyfd.includes(k)) return { ok: false, villa: 'Reiturinn „' + k + '" er ekki ritanlegur í þessari tegund.' };
    if (typeof patch[k] !== 'string') return { ok: false, villa: 'Reiturinn „' + k + '" verður að vera texti.' };
  }
  if ((patch.subject != null) && !patch.subject.trim()) return { ok: false, villa: 'Efnislína má ekki vera tóm.' };
  // Skyldu-breytur: leita í ÖLLU sniðmátinu eins og það verður eftir vistun.
  const eftir = resolveEmail(id, { [id]: patch });
  const allt = [eftir.subject, eftir.html, eftir.intro, eftir.footer].filter(Boolean).join(' ');
  for (const b of (def.krafist || [])) {
    if (allt.indexOf('{{' + b + '}}') < 0) return { ok: false, villa: 'Sniðmátið VERÐUR að innihalda {{' + b + '}} — án hennar virkar pósturinn ekki.' };
  }
  return { ok: true };
}
