// ─────────────────────────────────────────────────────────────
// build_thingskyrsla_ai.js — DJÚP AI-greining fyrir Þingmannaskýrsluna (selda varan)
// Ítarlegri en build_malrof_ai.js: les 12–18 ræður per þingmann VALDAR ÞVERT Á MÁLEFNI
// (ekki bara nýjustu) og skilar yfirliti, tón, rökstuðningi, samskiptastíl og
// greiningu EFTIR MÁLAFLOKKUM → gogn/thingskyrsla_ai.json.
// Keyrsla: ANTHROPIC_API_KEY=... node skriptur/build_thingskyrsla_ai.js
// (í CI: skilyrt AI-þrep refresh-data.yml með secrets.ANTHROPIC_API_KEY)
// SJÁLFVIRK UPPFÆRSLA: inkremental — greinir þingmann þegar (a) hann VANTAR í skrána
// eða (b) hæfum ræðum hans hefur fjölgað um ≥30% síðan síðast (geymt í `tot` per færslu)
// → engin API-köll dag frá degi í þinghléi, endurnýjast sjálfkrafa þegar þing kemur saman.
// Færsla án `tot` (t.d. handunnið sýnishorn) fær tot-stimpil ÁN endurgreiningar.
// LYKILLINN ER ALDREI SKRIFAÐUR Í SKRÁ — aðeins process.env.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('Vantar ANTHROPIC_API_KEY í umhverfi.'); process.exit(1); }
const client = new Anthropic({ apiKey: KEY });
const MODEL = 'claude-opus-4-8';

const GOGN = path.join(__dirname, '..', 'gogn');
const THINGMENN = JSON.parse(fs.readFileSync(path.join(GOGN, 'althingi.json'), 'utf8'));
const OUT = path.join(GOGN, 'thingskyrsla_ai.json');

const grab = (x, tag) => { const m = x.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].trim() : ''; };

async function main() {
  console.log('Sæki ræðulista 157…');
  const rl = await (await fetch('https://www.althingi.is/altext/xml/raedulisti/?lthing=157', { headers: { 'User-Agent': 'KARP build (karp.is)' } })).text();
  const chunks = rl.split('<ræða>').slice(1);
  const byMp = {};
  for (const c of chunks) {
    const idm = c.match(/<ræðumaður id='(\d+)'/);
    if (!idm) continue;
    const teg = grab(c, 'tegundræðu');
    if (teg !== 'ræða' && teg !== 'flutningsræða') continue; // efnisræður eingöngu
    const heiti = grab(c, 'málsheiti');
    if (/fundarstjórn|þingsetning|ávarp|minning/i.test(heiti)) continue;
    const t0 = grab(c, 'ræðahófst'), t1 = grab(c, 'ræðulauk');
    if (!t0) continue;
    const min = t1 ? (new Date(t1) - new Date(t0)) / 60000 : 0;
    if (min < 2) continue;
    const xm = c.match(new RegExp('<xml>(http[^<]*' + '/raedur/rad' + '[^<]+)</xml>'));
    (byMp[+idm[1]] = byMp[+idm[1]] || []).push({ t0, heiti, min, url: xm ? xm[1].replace(/&amp;/g, '&') : null });
  }

  const fetchText = async (t0, direct) => {
    const url = direct || ('https://www.althingi.is/xml/157/raedur/rad' + t0.replace(/[-:]/g, '') + '.xml');
    try {
      const x = await (await fetch(url, { headers: { 'User-Agent': 'KARP build (karp.is)' } })).text();
      const body = x.split(/<\/ns:umsýsla>/)[1] || x;
      return body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
    } catch (e) { return ''; }
  };

  // Veljum ræður ÞVERT Á MÁLEFNI: flokkum eftir málsheiti, tökum lengstu ræðu úr hverju
  // máli fyrst (round-robin yfir mál eftir samanlögðum tíma) — breidd fram yfir nýjabrum.
  const pickSpread = (list, wanted) => {
    const byMal = {};
    list.forEach((s) => { (byMal[s.heiti] = byMal[s.heiti] || []).push(s); });
    const mals = Object.values(byMal).map((g) => g.sort((a, b) => b.min - a.min));
    mals.sort((a, b) => b.reduce((x, s) => x + s.min, 0) - a.reduce((x, s) => x + s.min, 0));
    const picked = [];
    for (let round = 0; picked.length < wanted && round < 4; round++) {
      for (const g of mals) { if (picked.length >= wanted) break; if (g[round]) picked.push(g[round]); }
    }
    return picked;
  };

  let existing = { mp: {} };
  try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  existing.mp = existing.mp || {};
  // Val: vantar EÐA hæfum ræðum fjölgað ≥30% frá síðustu greiningu (tot).
  let stamped = 0;
  const mps = THINGMENN.filter((m) => {
    const tot = (byMp[m.id] || []).length;
    if (tot < 3) return false;
    const e = existing.mp[m.id];
    if (!e) return true;
    if (e.tot == null) { e.tot = tot; e.d = e.d || new Date().toISOString().slice(0, 10); stamped++; return false; } // handunnin færsla → stimpla, ekki endurgreina
    return tot >= e.tot * 1.3;
  });
  console.log('Þingmenn til greiningar (vantar eða +30% ræður):', mps.length, stamped ? '| tot-stimplaðar handfærslur: ' + stamped : '');
  if (!mps.length && !stamped) { console.log('Ekkert að greina — skrá óbreytt (engin API-köll).'); return; }
  const out = {
    updated: new Date().toISOString().slice(0, 10), model: MODEL, thing: 157,
    note: 'Vélrænt mat gervigreindar á tón, áherslum og málflutningi, byggt EINGÖNGU á brotum úr raunverulegum þingræðum viðkomandi á þingi 157 (althingi.is). Ekki dómur Karp og ekki staðreyndafullyrðing um viðkomandi.',
    mp: { ...(existing.mp || {}) },
  };

  let done = 0;
  const work = mps.map((m) => async () => {
    const candidates = pickSpread(byMp[m.id], 24);
    const texts = [];
    for (const s of candidates) {
      if (texts.length >= 15) break;
      const t = await fetchText(s.t0, s.url);
      if (t.length > 400) texts.push(`— Úr ræðu um „${s.heiti}“ (${Math.round(s.min)} mín, ${s.t0.slice(0, 10)}):\n${t}`);
    }
    if (texts.length < 3) { console.log('  sleppi (of lítill texti):', m.nafn); return; }
    const prompt = `Hér eru brot úr ${texts.length} þingræðum ${m.nafn} (${m.flokkur}) á þingi 157, valin þvert á málefni.

${texts.join('\n\n')}

Greindu málflutning þingmannsins ÍTARLEGA og EINGÖNGU út frá þessum brotum. Vertu hlutlaus og nákvæm(ur) — ekki geta í eyður, ekki nota almenna vitneskju um viðkomandi, ekki fella gildisdóma um persónuna. Flokkaðu ræðurnar í 4–6 málaflokka út frá efni þeirra. Svaraðu AÐEINS með gildu JSON á þessu formi:
{
  "yfirlit": "3-4 setningar: heildarmynd af þingstörfum viðkomandi eins og þau birtast í brotunum",
  "ton": "2-3 setningar um ræðustíl og tón — uppbygging máls, tilfinningahiti, formfesta, myndmál",
  "rokstudningur": "2 setningar: hvernig rökstyður viðkomandi — tölur/gögn, prinsipp, dæmisögur, reynsla, alþjóðlegur samanburður?",
  "samskipti": "1-2 setningar um samskiptastíl í andsvörum/gagnrýni ef það sést í brotunum",
  "malaflokkar": [ { "svid": "heiti málaflokks", "greining": "2-3 setningar um áherslur og tón á þessu sviði", "afstada": "1 setning: skýr afstaða sem birtist í brotunum", "n": fjöldi_raedna_a_svidinu } ],
  "merki": ["3-5 stutt stílmerki, 1-2 orð hvert"]
}`;
    try {
      const res = await client.messages.create({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
      const raw = (res.content || []).map((b) => b.text || '').join('');
      const jm = raw.match(/\{[\s\S]*\}/);
      if (!jm) throw new Error('ekkert JSON');
      const j = JSON.parse(jm[0]);
      if (j.yfirlit && Array.isArray(j.malaflokkar)) {
        out.mp[m.id] = {
          yfirlit: String(j.yfirlit).slice(0, 900),
          ton: String(j.ton || '').slice(0, 600),
          rokstudningur: String(j.rokstudningur || '').slice(0, 500),
          samskipti: String(j.samskipti || '').slice(0, 400),
          malaflokkar: j.malaflokkar.slice(0, 6).map((x) => ({ svid: String(x.svid || '').slice(0, 60), greining: String(x.greining || '').slice(0, 700), afstada: String(x.afstada || '').slice(0, 250), n: +x.n || 1 })),
          merki: (j.merki || []).slice(0, 5).map((x) => String(x).slice(0, 30)),
          n: texts.length,
          tot: byMp[m.id].length,                       // hæfar ræður við greiningu → +30%-reglan
          d: new Date().toISOString().slice(0, 10),
        };
        // vista jafnóðum svo hrun kosti ekki allt
        fs.writeFileSync(OUT, JSON.stringify(out));
      }
      done++;
      if (done % 5 === 0) console.log('  …', done, 'af', mps.length);
    } catch (e) { console.log('  villa hjá', m.nafn, ':', String(e.message || e).slice(0, 80)); }
  });

  // 3 samhliða (löng prompt — hógvær samhliða-keyrsla)
  const q = [...work];
  await Promise.all(Array.from({ length: 3 }, async () => { while (q.length) { const w = q.shift(); await w(); } }));

  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('Skrifað:', OUT, '· þingmenn með djúpgreiningu:', Object.keys(out.mp).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
