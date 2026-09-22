// frettaskrif.mjs — ein frétt í hverju kalli til Claude, talnavörn eftir hverja, eitt endurskrif, annars sniðmát.
//
// AF HVERJU (22.9.2026): áður fóru allar fréttir dagsins í EITT kall (16 fréttir, 5.000 tókar) og fengu 1–2
// setningar hver. Nú fær hver frétt eigið kall og bakgrunn (frettasamhengi.mjs), og talnavörnin (talnavorn.mjs)
// tryggir að lengri texti beri ekki uppspunnar tölur. Falli frétt tvisvar helst sniðmátstexti skynjarans.
import { athugaTolur } from './talnavorn.mjs';

export const SJALFGEFID_LIKAN = 'claude-opus-5';
export const HAMARK = 30;   // kostnaðarþak á keyrslu; umfram fréttir halda sniðmátstexta
export const MAX_TOKENS = 4096;   // hugsunartókar claude-opus-5 teljast í max_tokens; 1500 dugði ekki fyrir hugsun + frétt
export const TIMATHAK = 12 * 60 * 1000;   // heildartími ritunar á keyrslu (ms); eftir hann byrjar engin ný frétt
// stop_reason sem endurskrif lagar ekki: max_tokens = svarið klipptist, refusal = líkanið neitaði að skrifa
const STOPP_AN_ENDURSKRIFS = new Set(['max_tokens', 'refusal']);
export const TOLUFRETTIR = new Set(['mark', 'vextir', 'verdbolga', 'vika', 'fylgi', 'fast', 'fastthr', 'samanburdur', 'gengi', 'spike']);
export const snidFyrir = (type) => (TOLUFRETTIR.has(type) ? 'tolur' : 'efni');

export const KERFI = [
  'Þú ert fréttavél Karp (karp.is). Þú skrifar EINA hlutlausa frétt á íslensku EINGÖNGU úr staðreyndunum í facts.',
  'facts.bakgrunnur er samhengi úr gögnum Karp. Notaðu það til að setja fréttina í samhengi, en aðeins það sem stendur þar.',
  // „loks annað sem máli skiptir" var opið boð um efni utan facts; og bakgrunnsmálsgrein má ekki knýja fram án bakgrunns
  'SNIÐ: ef snid er "tolur" skaltu skrifa 2–4 setningar í einni málsgrein. Ef snid er "efni" skaltu skrifa 2–3 málsgreinar ef staðreyndir leyfa, annars færri, aðskildar með auðri línu: fyrst hvað gerðist, síðan samhengi úr bakgrunni ef hann er til, loks önnur atriði úr facts. Séu staðreyndirnar fáar skaltu skrifa stutt. ALDREI teygja textann með endurtekningu eða almennum orðum.',
  'STRANGT BANN: engar tölur, nöfn, dagsetningar eða fullyrðingar sem ekki standa í facts. Ekki reikna nýjar tölur (hvorki mismun, hlutföll né samtölur) nema þær standi í facts. Engar orsakaskýringar eða spádómar. Engin gildishlaðin orð og engin upphrópunarmerki. Ekki nefna facts, bakgrunn eða heiti sviða. Nöfn einstaklinga sem eru nafnlaus í facts (t.d. X) haldast nafnlaus.',
  // talnavörnin sér aðeins hvort tala sé til í facts, ekki hvað hún merkir (yfirferð 22.9); þetta bann ber merkinguna
  'EFSTASTIG OG TÍMABIL: engar efstastigs- eða tímabilsfullyrðingar sem facts segja ekki berum orðum, t.d. „í röð“, „frá upphafi“, „í fyrsta sinn“, „mesta/hæsta/lægsta … síðan“ eða „á árinu“. Tímabil skal nefna eins og facts lýsa þeim (t.d. „síðustu 40 viðskiptadaga“).',
  'Tölur á íslensku sniði: 1.024.188.084 kr., 7,3%, 17,7 milljarðar króna.',
  'Skilaðu AÐEINS JSON-hlut: {"title":"...","text":"..."}. title hámark 90 stafir, text hámark 2000 stafir, málsgreinar aðskildar með \\n\\n. Engin markdown.',
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

/** Styttir titil við orðaskil sé hann lengri en hamark stafir (sjálfgefið 90) — sker aldrei í miðju orði, engir þrípunktar. */
export function styttaTitil(titill, hamark = 90) {
  const s = String(titill || '');
  if (s.length <= hamark) return s;
  const skor = s.lastIndexOf(' ', hamark);
  const skorid = skor > 0 ? s.slice(0, skor) : s.slice(0, hamark);
  return skorid.replace(/[\s.,:;!?'"»«„“”–—-]+$/, '');
}

export const TEXTI_HAMARK = 2200;
/** Styttir texta við síðustu setningarlok innan hamarks (sjálfgefið 2200); null ef engin finnast (þá klippum við ekki í
 *  miðri setningu). Setningarlok = . ! ? (e.t.v. með gæsalöppum eða sviga) sem HVÍTBIL fylgir, svo punktur inni í tölu
 *  („1.024") eða skammstöfun („m.kr") teljist ekki. */
export function styttaTexta(texti, hamark = TEXTI_HAMARK) {
  const s = String(texti || '');
  if (s.length <= hamark) return s;
  const re = /[.!?][“”"»)]*(?=\s)/g;
  let skor = -1, m;
  while ((m = re.exec(s)) && m.index + m[0].length <= hamark) skor = m.index + m[0].length;
  return skor > 0 ? s.slice(0, skor).trim() : null;
}

async function kalla(client, model, messages) {
  // effort 'low' en hugsun EKKI gerð óvirk: á claude-opus-5 er aðlögunarhæf hugsun sjálfgefin (effort high) og skjöl
  // vara við thinking:{type:'disabled'} því þá lekur hugsun inn í textann. Skyndiminni (cache_control) krefst a.m.k.
  // 512 tóka á Opus 5; styttri fyrirmæli eru einfaldlega ekki geymd (engin villa).
  const msg = await client.messages.create({
    model, max_tokens: MAX_TOKENS, output_config: { effort: 'low' },
    system: [{ type: 'text', text: KERFI, cache_control: { type: 'ephemeral' } }], messages,
  });
  // svarið getur byrjað á thinking-blokk (án .text) á undan text-blokkinni; fréttin er AÐEINS í text-blokkum
  const texti = (msg.content || []).filter((c) => c && c.type === 'text').map((c) => c.text || '').join('');
  return { texti, stopp: msg.stop_reason || null };
}

// Röng tala er verri en of langur titill eða texti: nefnist EITT vandamál í endurskrifinu, aldrei fleiri.
function athugasemd(vandi, ut, vorn) {
  if (vandi === 'json') return 'Svarið var ekki gildur JSON-hlutur. Skilaðu AÐEINS {"title":"...","text":"..."}.';
  if (vandi === 'tolur') return 'Þessar tölur standa ekki í facts: ' + vorn.rangar.join(', ') + '. Skrifaðu fréttina aftur án þeirra eða með réttum gildum úr facts. Skilaðu AÐEINS JSON-hlutnum.';
  if (vandi === 'texti') return 'Textinn er ' + ut.text.length + ' stafir en má vera 2000 að hámarki. Styttu hann án þess að breyta staðreyndum. Skilaðu AÐEINS JSON-hlutnum.';
  return 'Titillinn er ' + ut.title.length + ' stafir en má vera 90 að hámarki. Styttu hann án þess að breyta staðreyndum. Skilaðu AÐEINS JSON-hlutnum.';
}

// Titill og texti athugaðir hvor fyrir sig: samskeytt gæti eining í fyrsta orði textans („milljörðum") fest sig við síðustu
// tölu titilsins, og eftir styttingu þarf hvort um sig að standast eitt og sér.
function vornFrettar(ut, facts) {
  const a = athugaTolur(ut.title, facts), b = athugaTolur(ut.text, facts);
  return { ok: a.ok && b.ok, rangar: [...new Set(a.rangar.concat(b.rangar))] };
}

/** Skrifar EINA frétt. { ok, endurskrifad, astaeda?, rangar? } — við höfnun helst sniðmátstextinn óbreyttur.
 *  ok ásamt astaeda 'titill' = textinn er vélskrifaður en styttur titill féll, svo sniðmátstitillinn helst. */
async function skrifaEina(e, client, model, skra) {
  // facts.ras (RÁS-spá þjóðhagshermisins) ber orsakafullyrðingar líkans („vaxtahækkun gæti hægt á verðbólgu á 1–2
  // árum"), sem reglan bannar, og tölur hennar mega ekki verða leyfð gildi í talnavörninni. Hún helst á e.facts
  // (RÁS-kassinn á fréttasíðunni) en fer hvorki til Claude né í vörnina.
  const facts = { ...(e.facts || {}) };
  delete facts.ras;
  const skilabod = [{ role: 'user', content: JSON.stringify({ type: e.type, snid: snidFyrir(e.type), facts }) }];
  let endurskrifad = false, vorn = null;
  try {
    let svar = await kalla(client, model, skilabod);
    if (STOPP_AN_ENDURSKRIFS.has(svar.stopp)) return { ok: false, endurskrifad, astaeda: svar.stopp };
    let ut = thattaSvar(svar.texti);
    vorn = ut ? vornFrettar(ut, facts) : null;
    const vandi = !ut ? 'json' : !vorn.ok ? 'tolur' : ut.title.length > 90 ? 'titill' : ut.text.length > TEXTI_HAMARK ? 'texti' : null;
    if (vandi) {
      endurskrifad = true;
      skilabod.push({ role: 'assistant', content: svar.texti || '(tómt)' }, { role: 'user', content: athugasemd(vandi, ut, vorn) });
      svar = await kalla(client, model, skilabod);
      if (STOPP_AN_ENDURSKRIFS.has(svar.stopp)) return { ok: false, endurskrifad, astaeda: svar.stopp };
      ut = thattaSvar(svar.texti);
      vorn = ut ? vornFrettar(ut, facts) : null;
    }
    if (!ut) return { ok: false, endurskrifad, astaeda: 'json' };
    if (!vorn.ok) return { ok: false, endurskrifad, astaeda: 'tolur', rangar: vorn.rangar };
    // Stytting getur slitið tölu frá einingu sinni („17,7 ma." án „kr.", „um 17,7" án „milljarða"), svo talnavörnin keyrir
    // AFTUR á lokatexta og lokatitil. Falli styttur texti helst sniðmátið allt; falli styttur titill helst sniðmátstitillinn.
    const texti = styttaTexta(ut.text);
    const vornTexta = texti === null ? null : athugaTolur(texti, facts);
    if (!vornTexta || !vornTexta.ok) return { ok: false, endurskrifad, astaeda: 'texti', rangar: vornTexta ? vornTexta.rangar : undefined };
    const titill = styttaTitil(ut.title), vornTitils = athugaTolur(titill, facts);
    if (vornTitils.ok) e.title = titill;
    e.text = texti;
    e.ai = true;
    delete e.talnavorn;   // hreinsa stakt merki frá fyrri keyrslu — má ekki lifa við hlið ferska ai:true textans
    return vornTitils.ok ? { ok: true, endurskrifad } : { ok: true, endurskrifad, astaeda: 'titill', rangar: vornTitils.rangar };
  } catch (err) {
    skra('• ritun brást fyrir ' + e.id + ': ' + String(err).slice(0, 100));
    // brást endurskrifið sjálft (t.d. 529) eftir talnavarnarhöfnun björgum við röngu tölunum úr fyrri atrennu
    return { ok: false, endurskrifad, astaeda: 'villa', rangar: vorn && !vorn.ok ? vorn.rangar : undefined };
  }
}

/** Skrifar fréttirnar hverja í sínu kalli. Tölfræðin ber `hafnadar: [{ id, astaeda, rangar? }]` þar sem astaeda er
 *  'tolur' | 'json' | 'titill' | 'texti' | 'max_tokens' | 'refusal' | 'villa'. `nu` er inndælanleg klukka (próf).
 *  `eftirHverja(e, hofnun)` kallast strax eftir hverja frétt (prufuhamur prentar jafnóðum). */
export async function skrifaFrettir(events, { client, model = SJALFGEFID_LIKAN, hamark = HAMARK, timaThak = TIMATHAK, nu = Date.now, skra = console.log, eftirHverja = null } = {}) {
  const t = { skrifadar: 0, endurskrifadar: 0, hafnad: 0, villur: 0, sleppt: 0, hafnadar: [] };
  if (!client) return t;
  const hopur = (events || []).filter((e) => e && !e.noai);
  const byrjun = nu();
  for (let i = 0; i < hopur.length; i++) {
    // Kostnaðarþak (fjöldi) og tímaþak: eftir annað hvort byrjar engin ný frétt og afgangurinn heldur sniðmáti. Tímaþakið
    // ver daglegu keyrsluna: hún uppfærir líka önnur gögn og má ekki stöðvast þótt API-ið hægi á sér.
    if (i >= hamark || nu() - byrjun >= timaThak) {
      t.sleppt = hopur.length - i;
      if (i < hamark) skra('• tímaþak ritunar náð eftir ' + i + ' fréttir; ' + t.sleppt + ' halda sniðmáti');
      break;
    }
    const e = hopur[i];
    const r = await skrifaEina(e, client, model, skra);
    if (r.endurskrifad) t.endurskrifadar++;
    if (r.ok) t.skrifadar++;
    else {
      if (r.astaeda === 'villa') t.villur++; else t.hafnad++;
      if (r.rangar) e.talnavorn = r.rangar;
    }
    const h = !r.astaeda ? null : r.rangar ? { id: e.id, astaeda: r.astaeda, rangar: r.rangar } : { id: e.id, astaeda: r.astaeda };
    if (h) t.hafnadar.push(h);
    if (eftirHverja) {
      try { eftirHverja(e, h); } catch (err) { skra('• prentun brást fyrir ' + e.id + ': ' + String(err).slice(0, 100)); }
    }
  }
  return t;
}

/** Ein lína á hverja höfnun: id · ástæða · rangar tölur (ef til). 'titill' er EKKI höfnun á fréttinni sjálfri — hún var
 *  skrifuð (telst með í skrifadar), en styttur titill féll á talnavörninni og sniðmátstitillinn hélst því; það orðalag
 *  fær því annan formála en raunveruleg höfnun. */
export const hafnadarLinur = (hafnadar) => (hafnadar || [])
  .map((h) => '• ' + (h.astaeda === 'titill' ? 'sniðmátstitill hélst' : 'hafnað') + ': ' + h.id + ' · ' + h.astaeda + (h.rangar && h.rangar.length ? ' · ' + h.rangar.join(', ') : ''));

/** Ein frétt prufukeyrslu (markdown): áður/nýtt, bakgrunnur og höfnun (h = færsla úr hafnadar, ef hún varð). `merki`
 *  yfirskrifar sjálfgefna sniðmáts-merkið, t.d. 'utan tímaþaks' fyrir fréttir sem tímaþak ritunar skildi eftir
 *  (það er ekki það sama og að hafa aldrei átt að fara í kall, sbr. noai eða enginn lykill). */
export function efnisgreinMd(e, h = null, merki = null) {
  const l = ['### ' + e.type + ' · ' + e.id];
  if (e.gamall) l.push('**Áður:** ' + e.gamall.title, '', e.gamall.text || '', '');
  l.push('**' + (merki || (e.ai ? 'Nýtt' : 'Sniðmát (ekki vélskrifað)')) + ':** ' + e.title, '', e.text || '', '');
  const bg = e.facts && e.facts.bakgrunnur;
  l.push('_Bakgrunnur:_ ' + (bg ? '`' + JSON.stringify(bg) + '`' : 'enginn'));
  if (h) l.push('_Hafnað:_ ' + h.astaeda + (h.rangar && h.rangar.length ? ' · ' + h.rangar.join(', ') : ''));
  else if (e.talnavorn) l.push('_Talnavörn hafnaði:_ ' + e.talnavorn.join(', '));
  l.push('');
  return l.join('\n');
}

/** Læsileg samantekt prufukeyrslu (markdown): áður/nýtt, bakgrunnur, höfnun talnavarnar. */
export function samantektMd(events, { titill = 'Prufukeyrsla fréttavélar' } = {}) {
  return ['## ' + titill, '', ...(events || []).map((e) => efnisgreinMd(e))].join('\n');
}
