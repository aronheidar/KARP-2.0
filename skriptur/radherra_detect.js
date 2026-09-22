// radherra_detect.js — hreinn fréttavél-skynjari: ráðherra tekur við embætti (cabinet.json). CommonJS; engin fs/net.
// pickRadherra(cab, grunnur, {idag, dagar=14}) → { cand: [{nafn, embaetti, flokkur, adur}],
//   grunnur: {radherrar: {id: {nafn, emb, flokkur, sidast}}} }
//
// AF HVERJU (22.9.2026): allar fjórar ráðherrafréttir vélarinnar voru rangar.
//   · 22.8 skilaði Alþingi engu (HTTP 429), cabinet.json varð [] og grunnurinn tæmdist; 23.8 „tóku" Þorgerður Katrín,
//     Hanna Katrín og Logi „við" embættum sem þau höfðu gegnt síðan 2024. Tóm skrá skrifar því ekki yfir grunninn, og
//     ráðherra sem vantar í skrána einn dag (hálf skrá) geymist í grunninum í GLEYMA daga (`sidast` = síðasti
//     keyrsludagur sem hann var í skránni; skráin ber enga dagsetningu), svo hann er ekki nýr þegar hann kemur aftur.
//   · Ráðherra sem vantar í grunninn er aðeins frétt ef seta hans (`sidan`, eigin dagsetning færslunnar) hófst á
//     síðustu `dagar` dögum. `sidan` er upphaf setu á yfirstandandi þingi og endurstillist við þingsetningu, svo þessi
//     vörn ein dugar ekki fyrstu `dagar` daga hvers þings; geymslan hér að ofan ber það tímabil.
//   · 8.9 (nýtt þing) raðaði Alþingi embættum Loga öðruvísi og „ráðherra norrænna samstarfsmála" varð emb[0]; vélin
//     sagði hann taka við því. Embættin eru því borin saman sem mengi og aðeins NÝ embætti eru frétt.
// Grunnur á gamla sniðinu ({id: {emb: strengur}}) endurstillist í þögn.
'use strict';

const GLEYMA = 30;

const dagur = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function sidanIso(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return ISO.test(String(s || '')) ? String(s) : null;
}

function pickRadherra(cab, grunnur, opts) {
  const o = opts || {};
  const dagar = o.dagar || 14;
  if (!Array.isArray(cab) || !cab.length) return { cand: [], grunnur };

  const cur = {}, sidan = {};
  for (const c of cab) {
    cur[c.id] = { nafn: c.nafn, emb: (c.emb || []).filter(Boolean), flokkur: c.flok || c.flokur || '', sidast: o.idag };
    sidan[c.id] = sidanIso(c.sidan);
  }
  const g = grunnur && grunnur.radherrar && typeof grunnur.radherrar === 'object' ? grunnur.radherrar : null;
  const cand = [];
  if (g) {
    for (const [id, c] of Object.entries(cur)) {
      const p = g[id];
      if (!p || !Array.isArray(p.emb)) {
        const aldur = sidan[id] && o.idag ? dagur(o.idag) - dagur(sidan[id]) : NaN;
        if (aldur >= 0 && aldur <= dagar && c.emb.length) cand.push({ nafn: c.nafn, embaetti: c.emb.join(' og '), flokkur: c.flokkur, adur: null });
        continue;
      }
      const ny = c.emb.filter((e) => !p.emb.includes(e));
      if (!ny.length) continue;
      const farin = p.emb.filter((e) => !c.emb.includes(e));
      cand.push({ nafn: c.nafn, embaetti: ny.join(' og '), flokkur: c.flokkur, adur: farin.length ? farin.join(' og ') : null });
    }
    // Horfnir úr skránni geymast í GLEYMA daga (hálf skrá); síðan gleymast þeir.
    for (const [id, p] of Object.entries(g)) {
      if (cur[id] || !p || !Array.isArray(p.emb) || !ISO.test(String(p.sidast)) || !o.idag) continue;
      if (dagur(o.idag) - dagur(p.sidast) <= GLEYMA) cur[id] = p;
    }
  }
  return { cand, grunnur: { radherrar: cur } };
}

module.exports = { pickRadherra };
