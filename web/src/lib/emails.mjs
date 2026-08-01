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
