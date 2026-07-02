// ─────────────────────────────────────────────────────────────
// build_malrof_ai.js — AI-mat á TÓN OG ÁHERSLUM þingmanna (LOTA 16+)
// Les nýjustu efnisræður hvers þingmanns (fullur texti úr XML Alþingis),
// biður Claude um stutt, hlutlaust mat GRUNDAГ EINGÖNGU á brotunum og
// bakar í gogn/malrof_ai.json. Keyrt HANDVIRKT með skammlífum lykli:
//   ANTHROPIC_API_KEY=... node skriptur/build_malrof_ai.js
// LYKILLINN ER ALDREI SKRIFAÐUR Í SKRÁ — aðeins process.env.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('Vantar ANTHROPIC_API_KEY í umhverfi.'); process.exit(1); }
const client = new Anthropic({ apiKey: KEY });
const MODEL = 'claude-opus-4-8';

const THINGMENN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gogn', 'althingi.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'gogn', 'malrof_ai.json');

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
    if (min < 1.5) continue; // örstuttar sleppa
    const xm = c.match(new RegExp('<xml>(http[^<]*' + '/raedur/rad' + '[^<]+)</xml>'));
    (byMp[+idm[1]] = byMp[+idm[1]] || []).push({ t0, heiti, min, url: xm ? xm[1].replace(/&amp;/g, '&') : null });
  }

  const fetchText = async (t0, direct) => {
    const url = direct || ('https://www.althingi.is/xml/157/raedur/rad' + t0.replace(/[-:]/g, '') + '.xml');
    try {
      const x = await (await fetch(url, { headers: { 'User-Agent': 'KARP build (karp.is)' } })).text();
      const body = x.split(/<\/ns:umsýsla>/)[1] || x;
      return body.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2600);
    } catch (e) { return ''; }
  };

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).mp || {}; } catch (e) {}
  const mps = THINGMENN.filter((m) => (byMp[m.id] || []).length >= 2 && !existing[m.id]);
  console.log('Þingmenn með 2+ efnisræður:', mps.length);
  const out = { updated: new Date().toISOString().slice(0, 10), model: MODEL, thing: 157,
    mpPrev: undefined,
    note: 'Vélrænt mat gervigreindar á tón og áherslum, byggt EINGÖNGU á brotum úr nýjustu efnisræðum viðkomandi á þingi 157. Ekki dómur Karp.', mp: { ...existing } };

  let done = 0;
  const work = mps.map((m) => async () => {
    // Uppskriftir birtast með töf — leita aftur í tímann þar til 5 textar nást (hám. 25 tilraunir)
    const speeches = byMp[m.id].sort((a, b) => b.t0.localeCompare(a.t0)).slice(0, 25);
    const texts = [];
    for (const s of speeches) {
      if (texts.length >= 5) break;
      const t = await fetchText(s.t0, s.url);
      if (t.length > 300) texts.push(`— Úr ræðu um „${s.heiti}“ (${Math.round(s.min)} mín):\n${t}`);
    }
    if (texts.length < 2) { console.log('  sleppi (of lítill texti):', m.nafn); return; }
    const prompt = `Hér eru brot úr ${texts.length} nýlegum þingræðum ${m.nafn} (${m.flokkur}).

${texts.join('\n\n')}

Metdu tón og áherslur þingmannsins EINGÖNGU út frá þessum brotum. Vertu hlutlaus og nákvæm(ur) — ekki geta í eyður, ekki nota almenna vitneskju um viðkomandi. Svaraðu AÐEINS með gildu JSON á þessu formi:
{"ton":"1-2 setningar um ræðustíl og tón (t.d. málefnalegur/gagnrýninn/talnadrifinn/persónulegur)","aherslur":["3 til 4 stuttar lykiláherslur sem birtast í brotunum"],"merki":["2-3 eins til tveggja orða merkimiðar um stílinn"]}`;
    try {
      const res = await client.messages.create({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] });
      const raw = (res.content || []).map((b) => b.text || '').join('');
      const jm = raw.match(/\{[\s\S]*\}/);
      if (!jm) throw new Error('ekkert JSON');
      const j = JSON.parse(jm[0]);
      if (j.ton && Array.isArray(j.aherslur)) {
        out.mp[m.id] = { ton: String(j.ton).slice(0, 300), aherslur: j.aherslur.slice(0, 4).map((x) => String(x).slice(0, 90)), merki: (j.merki || []).slice(0, 3).map((x) => String(x).slice(0, 30)), n: texts.length };
      }
      done++;
      if (done % 10 === 0) console.log('  …', done, 'af', mps.length);
    } catch (e) { console.log('  villa hjá', m.nafn, ':', String(e.message || e).slice(0, 80)); }
  });

  // 4 samhliða
  const q = [...work];
  await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const w = q.shift(); await w(); } }));

  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('Skrifað:', OUT, '· þingmenn með AI-mat:', Object.keys(out.mp).length);
}
main().catch((e) => { console.error(e); process.exit(1); });
