// kyc-digest.mjs — „Compliance-morgunfundurinn": hrein forgangsröðun viku-atburða
// Áreiðanleikavaktarinnar fyrir mánudags-digestið. VILJANDI EKKERT LLM (rýni 2026-08-01):
// deterministic röðun + FASTAR aðgerðatillögur per atburðategund = ekkert hallucination-rými,
// enginn API-kostnaður í worker, og textinn er alltaf rekjanlegur í atburðina sjálfa.
import { SEVERITY_RANK } from './kyc.mjs';
import { FATF_FLOKKAR } from './adverse-media.mjs';

// Fastar aðgerðatillögur — ábending, ekki fyrirmæli. Lykill = kyc_event.kind.
export const ADGERDIR = {
  sanctions_hit: 'Frystu afgreiðslu, staðfestu samsvörunina í frumheimild refsilistans og metu tilkynningarskyldu.',
  bankruptcy: 'Staðfestu skiptin í Lögbirtingablaðinu og endurmettu viðskiptasambandið.',
  adverse_fatf: 'Lestu frumheimild fréttarinnar, metu áreiðanleika hennar og skráðu niðurstöðu í möppuna.',
  new_beneficial: 'Uppfærðu UBO-skrána og gerðu áreiðanleikakönnun á nýja endanlega eigandanum.',
  removed_beneficial: 'Staðfestu breytinguna á eignarhaldinu og uppfærðu UBO-skrána.',
  new_ubo: 'Staðfestu nýja eigandann í fyrirtækjaskrá og uppfærðu eigendayfirlitið.',
  removed_ubo: 'Staðfestu eigendabreytinguna og metu hvort hún kalli á endurskoðun áhættumats.',
  status_change: 'Flettu félaginu upp í fyrirtækjaskrá og staðfestu nýju stöðuna.',
  filing_default: 'Kannaðu hvers vegna ársreikningi var ekki skilað — vanskil á skilum eru sjálfstæður áhættuvísir.',
  filing_resolved: 'Engin aðgerð nauðsynleg — skil komin í lag; skráðu í möppuna ef við á.',
  tax_claim: 'Staðfestu kröfuna í frumheimild og metu áhrif á áhættuflokkun.',
  pep_change: 'Staðfestu PEP-tenginguna og beittu aukinni áreiðanleikakönnun ef við á.',
  board_change: 'Uppfærðu yfirlit stjórnar; engin frekari aðgerð nema breytingin veki spurningar.',
  adverse_media: 'Lestu fréttina og metu hvort hún kalli á skráningu í möppuna.',
  sanctions_weak: 'Óstaðfest eins-þátta samsvörun — staðfestu eða afskrifaðu í frumheimild listans.',
  innkollun: 'Kannaðu innköllunina í Lögbirtingablaðinu og metu stöðu krafna.',
  nauthungarsala: 'Kannaðu nauðungarsöluna og metu áhrif á fjárhagsstöðu félagsins.',
  legal: 'Kannaðu birtinguna í Lögbirtingablaðinu.',
};
export const ADGERD_ANNAD = 'Skoðaðu atburðinn í möppunni og skráðu mat þitt.';

// Skyldu-fyrirvarinn (persónuverndar-rýni): digestið er ákvörðunarstuðningur, ekki flokkun.
export const DIGEST_FYRIRVARI = 'Forgangsröðunin er sjálfvirk ábending Karp — endanlegt mat og '
  + 'viðbrögð eru alltaf hjá tilkynningarskylda aðilanum sjálfum.';

export const adgerdFyrir = (kind) => ADGERDIR[kind] || ADGERD_ANNAD;

/** Læsileg eins-línu lýsing atburðar í digestinu (deterministic úr detail_json). */
export function atburdarLina(ev) {
  const d = (() => { try { return JSON.parse(ev.detail_json || '{}'); } catch (e) { return {}; } })();
  switch (ev.kind) {
    case 'sanctions_hit': return 'Refsilista-samsvörun: ' + (d.name || '?');
    case 'bankruptcy': return 'Bú félagsins tekið til gjaldþrotaskipta';
    case 'adverse_fatf': return 'Adverse media (' + (FATF_FLOKKAR[d.flokkur] || d.flokkur || '?') + '): „' + String(d.title || '').slice(0, 90) + '"';
    case 'new_beneficial': return 'Nýr endanlegur eigandi: ' + (d.nafn || d.key || '?');
    case 'removed_beneficial': return 'Endanlegur eigandi horfinn: ' + (d.nafn || d.key || '?');
    case 'new_ubo': return 'Nýr eigandi: ' + (d.nafn || d.key || '?');
    case 'removed_ubo': return 'Eigandi horfinn: ' + (d.nafn || d.key || '?');
    case 'status_change': return 'Staða félags breyttist: ' + (d.adur ? d.adur + ' → ' : '') + (d.stada || (d.afskrad ? 'afskráð' : '?'));
    case 'filing_default': return 'Ársreikningi ' + (d.ar || '?') + ' ekki skilað';
    case 'filing_resolved': return 'Ársreikningsskil ' + (d.ar || '?') + ' komin í lag';
    case 'tax_claim': return 'Ný opinber krafa: ' + (d.ref || '?');
    case 'pep_change': return 'PEP-tenging: ' + (d.name || '?');
    case 'board_change': return 'Stjórnarbreyting: ' + (d.nafn || d.key || '?') + (d.breyting === 'horfid' ? ' (horfin/n úr stjórn)' : ' (ný/r í stjórn)');
    case 'adverse_media': return 'Neikvæð umfjöllun: „' + String(d.title || '').slice(0, 90) + '"';
    case 'sanctions_weak': return 'Óstaðfest refsilista-vísbending: ' + (d.name || '?');
    default: return String(ev.kind || 'atburður');
  }
}

/**
 * Raðar viku-atburðum í aðgerðalista morgunfundarins.
 * @param {Array<{kt,nafn}>} watches — vöktuð félög eigandans
 * @param {Array<{kt,kind,severity,detail_json,detected_at,ack}>} events — atburðir vikunnar
 * @returns {{radad: Array<{kt,nafn,severity,atburdir:Array}>, obreytt: number, n: number}}
 * radad er í forgangsröð: hæsta severity fyrst, innan þess opnir atburðir og svo nýjastir.
 */
export function vikuForgangur(watches, events) {
  const byKt = new Map();
  for (const ev of events || []) {
    const b = byKt.get(ev.kt) || [];
    b.push(ev);
    byKt.set(ev.kt, b);
  }
  const radad = [];
  let obreytt = 0;
  for (const w of watches || []) {
    const evs = byKt.get(w.kt) || [];
    if (!evs.length) { obreytt++; continue; }
    evs.sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || (b.detected_at || 0) - (a.detected_at || 0));
    radad.push({
      kt: w.kt,
      nafn: w.nafn || w.kt,
      severity: evs[0].severity,
      opnir: evs.filter((e) => (e.ack || 'open') === 'open').length,
      atburdir: evs.slice(0, 6).map((e) => ({ kind: e.kind, severity: e.severity, lina: atburdarLina(e), adgerd: adgerdFyrir(e.kind) })),
      fleiri: Math.max(0, evs.length - 6),
    });
  }
  radad.sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) || b.opnir - a.opnir);
  return { radad, obreytt, n: (watches || []).length };
}
