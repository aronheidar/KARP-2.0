// ─────────────────────────────────────────────────────────────
// raeduval.cjs — val á EFNISRÆÐUM úr ræðulista Alþingis, fyrir AI-skriftirnar
// (build_malrof_ai.js og build_thingskyrsla_ai.js). Hreint — engin fs/net.
//
// Af hverju sameiginlegt (22.9.2026): báðar skriftirnar báru NÁKVÆMLEGA sömu þáttun og þar
// með sömu villuna — textaslóð ræðunnar var byggð á harðkóðuðu `/xml/157/raedur/…`.
//
// ⚠⚠ Rangt þing í slóðinni skilar EKKI 404 heldur **HTTP 200 með NÚLL bætum** (mælt 22.9:
//   /xml/158/…/rad20260909T200512.xml = 7.271 bæti, sama skrá undir /157/ og /999/ = 0 bæti).
//   `r.ok` er því satt, ekkert hendir, textinn verður tómur og ræðan dettur út á
//   `t.length > 400`. Þingmaðurinn birtist sem „of lítill texti" og er sleppt — þögult.
//   Þetta á við þær ræður sem bera enga beina <xml>-slóð í listanum (619 af 3.546 mældar).
//   Þess vegna ber HVER ræða sitt eigið þing hér.
// ─────────────────────────────────────────────────────────────
'use strict';

const grab = (x, tag) => {
  const m = x.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1].trim() : '';
};

// Formsræður: hvorki tónn né áherslur verða lesin úr ávarpi eða minningarorðum.
const EKKI_EFNI = /fundarstjórn|þingsetning|ávarp|minning/i;

// safnaEfnisraedum([{ thing, xml }, …], { lagmarkMin }) → { [mpId]: [{ t0, heiti, min, url, thing, teg }] }
// Tekur eina skrá per löggjafarþing og safnar öllu undir sama þingmann — ræður eru
// ATHAFNA-gögn og nýtt þing er nær tómt fyrstu vikurnar (sjá _seigla.js/thingListi).
function safnaEfnisraedum(skrar, opts = {}) {
  const lagmarkMin = opts.lagmarkMin == null ? 2 : opts.lagmarkMin;
  const byMp = {};
  for (const { thing, xml } of skrar || []) {
    for (const c of String(xml || '').split('<ræða>').slice(1)) {
      const idm = c.match(/<ræðumaður id='(\d+)'/);
      if (!idm) continue;
      const teg = grab(c, 'tegundræðu');
      if (teg !== 'ræða' && teg !== 'flutningsræða') continue;   // efnisræður eingöngu
      const heiti = grab(c, 'málsheiti');
      if (EKKI_EFNI.test(heiti)) continue;
      const t0 = grab(c, 'ræðahófst'), t1 = grab(c, 'ræðulauk');
      if (!t0) continue;
      const min = t1 ? (new Date(t1) - new Date(t0)) / 60000 : 0;
      if (min < lagmarkMin) continue;
      const xm = c.match(/<xml>(http[^<]*\/raedur\/rad[^<]+)<\/xml>/);
      (byMp[+idm[1]] = byMp[+idm[1]] || []).push({
        t0, heiti, min, teg,
        url: xm ? xm[1].replace(/&amp;/g, '&') : null,
        thing: Number(grab(c, 'löggjafarþing')) || Number(thing),   // ræðan á undan skránni
      });
    }
  }
  return byMp;
}

// Slóð á ræðutexta-XML. Beina slóðin úr listanum fyrst; annars byggð á ÞINGI RÆÐUNNAR.
function raeduTextaSlod(s) {
  if (s.url) return s.url;
  return 'https://www.althingi.is/xml/' + s.thing + '/raedur/rad' + String(s.t0).replace(/[-:]/g, '') + '.xml';
}

// Orðalag um þingin sem gögnin ná yfir — fer í `note` seldu skýrslunnar og inn í promptið.
// [158] → „þingi 158" · [158,157] → „þingum 157–158" (hækkandi, óháð röðinni sem berst).
function thingOrdalag(thingin) {
  const t = [...new Set((thingin || []).map(Number))].sort((a, b) => a - b);
  return t.length > 1 ? 'þingum ' + t[0] + '–' + t[t.length - 1] : 'þingi ' + t[0];
}

module.exports = { safnaEfnisraedum, raeduTextaSlod, thingOrdalag };
