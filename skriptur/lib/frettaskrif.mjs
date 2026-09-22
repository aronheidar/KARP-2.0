// frettaskrif.mjs — ein frétt í hverju kalli til Claude, talnavörn eftir hverja, eitt endurskrif, annars sniðmát.
//
// AF HVERJU (22.9.2026): áður fóru allar fréttir dagsins í EITT kall (16 fréttir, 5.000 tókar) og fengu 1–2
// setningar hver. Nú fær hver frétt eigið kall og bakgrunn (frettasamhengi.mjs), og talnavörnin (talnavorn.mjs)
// tryggir að lengri texti beri ekki uppspunnar tölur. Falli frétt tvisvar helst sniðmátstexti skynjarans.
import { athugaTolur } from './talnavorn.mjs';

export const SJALFGEFID_LIKAN = 'claude-opus-5';
export const HAMARK = 30;   // kostnaðarþak á keyrslu; umfram fréttir halda sniðmátstexta
export const TOLUFRETTIR = new Set(['mark', 'vextir', 'verdbolga', 'vika', 'fylgi', 'fast', 'fastthr', 'samanburdur', 'gengi', 'spike']);
export const snidFyrir = (type) => (TOLUFRETTIR.has(type) ? 'tolur' : 'efni');

export const KERFI = [
  'Þú ert fréttavél Karp (karp.is). Þú skrifar EINA hlutlausa frétt á íslensku EINGÖNGU úr staðreyndunum í facts.',
  'facts.bakgrunnur er samhengi úr gögnum Karp. Notaðu það til að setja fréttina í samhengi, en aðeins það sem stendur þar.',
  'SNIÐ: ef snid er "tolur" skaltu skrifa 2–4 setningar í einni málsgrein. Ef snid er "efni" skaltu skrifa 2–3 málsgreinar aðskildar með auðri línu: fyrst hvað gerðist, síðan samhengi úr bakgrunni, loks annað sem máli skiptir. Séu staðreyndirnar fáar skaltu skrifa stutt. ALDREI teygja textann með endurtekningu eða almennum orðum.',
  'STRANGT BANN: engar tölur, nöfn, dagsetningar eða fullyrðingar sem ekki standa í facts. Ekki reikna nýjar tölur (hvorki mismun, hlutföll né samtölur) nema þær standi í facts. Engar orsakaskýringar eða spádómar. Engin gildishlaðin orð og engin upphrópunarmerki. Ekki nefna facts, bakgrunn eða heiti sviða. Einstaklingar sem heita X í facts haldast nafnlausir.',
  'Tölur á íslensku sniði: 1.024.188.084 kr., 7,3%, 17,7 milljarðar króna.',
  'Skilaðu AÐEINS JSON-hlut: {"title":"...","text":"..."}. title hámark 90 stafir, text hámark 2000 stafir, málsgreinar aðskildar með \\n\\n.',
].join('\n');

// Claude setur stundum hrá línuskil inni í JSON-streng (þekkt gildra úr hjálparfulltrúanum), sem JSON.parse hafnar.
function lagaLinuskil(json) {
  let ut = '', iStreng = false, flotta = false;
  for (const c of json) {
    if (iStreng) {
      if (flotta) { ut += c; flotta = false; continue; }
      if (c === '\\') { ut += c; flotta = true; continue; }
      if (c === '"') { iStreng = false; ut += c; continue; }
      if (c === '\n') { ut += '\\n'; continue; }
      if (c === '\r') continue;
      ut += c;
    } else { if (c === '"') iStreng = true; ut += c; }
  }
  return ut;
}

/** {title, text} úr svari, eða null. */
export function thattaSvar(raw) {
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  for (const kandidat of [s.slice(a, b + 1), lagaLinuskil(s.slice(a, b + 1))]) {
    try {
      const o = JSON.parse(kandidat);
      if (o && typeof o.title === 'string' && typeof o.text === 'string' && o.title.trim() && o.text.trim()) return { title: o.title.trim(), text: o.text.trim() };
    } catch (e) { /* næsta tilraun */ }
  }
  return null;
}

async function kalla(client, model, messages) {
  const msg = await client.messages.create({ model, max_tokens: 1500, system: [{ type: 'text', text: KERFI, cache_control: { type: 'ephemeral' } }], messages });
  return (msg.content || []).map((c) => c.text || '').join('');
}

export async function skrifaFrettir(events, { client, model = SJALFGEFID_LIKAN, hamark = HAMARK, skra = console.log } = {}) {
  const t = { skrifadar: 0, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0 };
  if (!client) return t;
  const hopur = (events || []).filter((e) => e && !e.noai);
  t.sleppt = Math.max(0, hopur.length - hamark);
  for (const e of hopur.slice(0, hamark)) {
    const facts = e.facts || {};
    const skilabod = [{ role: 'user', content: JSON.stringify({ type: e.type, snid: snidFyrir(e.type), facts }) }];
    try {
      let raw = await kalla(client, model, skilabod);
      let ut = thattaSvar(raw);
      let vorn = ut ? athugaTolur(ut.title + '\n' + ut.text, facts) : null;
      if (!ut || !vorn.ok) {
        t.endurskrifadar++;
        const athugasemd = ut
          ? 'Þessar tölur standa ekki í facts: ' + vorn.rangar.join(', ') + '. Skrifaðu fréttina aftur án þeirra eða með réttum gildum úr facts. Skilaðu AÐEINS JSON-hlutnum.'
          : 'Svarið var ekki gildur JSON-hlutur. Skilaðu AÐEINS {"title":"...","text":"..."}.';
        skilabod.push({ role: 'assistant', content: raw || '(tómt)' }, { role: 'user', content: athugasemd });
        raw = await kalla(client, model, skilabod);
        ut = thattaSvar(raw);
        vorn = ut ? athugaTolur(ut.title + '\n' + ut.text, facts) : null;
      }
      if (ut && vorn && vorn.ok) { e.title = ut.title.slice(0, 120); e.text = ut.text.slice(0, 2200); e.ai = true; t.skrifadar++; }
      else { t.hafnad++; if (vorn && !vorn.ok) e.talnavorn = vorn.rangar; }
    } catch (err) { t.villur++; skra('• ritun brást fyrir ' + e.id + ': ' + String(err).slice(0, 100)); }
  }
  return t;
}

/** Læsileg samantekt prufukeyrslu (markdown): áður/nýtt, bakgrunnur, höfnun talnavarnar. */
export function samantektMd(events, { titill = 'Prufukeyrsla fréttavélar' } = {}) {
  const l = ['## ' + titill, ''];
  for (const e of (events || [])) {
    l.push('### ' + e.type + ' · ' + e.id);
    if (e.gamall) l.push('**Áður:** ' + e.gamall.title, '', e.gamall.text || '', '');
    l.push('**' + (e.ai ? 'Nýtt' : 'Sniðmát (ekki vélskrifað)') + ':** ' + e.title, '', e.text || '', '');
    const bg = e.facts && e.facts.bakgrunnur;
    l.push('_Bakgrunnur:_ ' + (bg ? '`' + JSON.stringify(bg) + '`' : 'enginn'));
    if (e.talnavorn) l.push('_Talnavörn hafnaði:_ ' + e.talnavorn.join(', '));
    l.push('');
  }
  return l.join('\n');
}
