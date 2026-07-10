// ─────────────────────────────────────────────────────────────
// build_ees.js — EES-tilskiptavakt: raunverulegur 3-ÞREPA rakningur á leið ESB-gerða
// inn í íslenskan rétt gegnum EES-samninginn. Leysir af hólmi flata „nýjustu tilskipanir"-listann.
//
//   Þrep 1  ESB samþykkir      → EUR-Lex CELLAR SPARQL: EES-merktar reglug./tilskipanir (~90 d).
//   Þrep 2  EES-nefndin tekur upp → CELLAR: ákvarðanir sameiginlegu EES-nefndarinnar (CELEX 2YYYYD####),
//                                   flokkað eftir viðauka EES-samningsins.
//   Þrep 3  Ísland innleiðir    → Alþingi XML: EES-mál (staðfesting ákvarðana / lagabreytingar) m/ stöðu.
//
// Krosstenging: ákvörðunarnúmer EES-nefndar (No X/ÁÁÁÁ) tengir Þrep 2 ↔ Þrep 3.
// ⚠ CELLAR geymir EKKI vélræna tengingu JCD → upptekna ESB-gerð (aðeins viðauka/heiti í titli) — sjá
//   memory/iceland-ees-directives.md. Flestar ákvarðanir eru innleiddar með reglugerð ÁN Alþingis; Þrep 3
//   nær aðeins þeim hluta sem fer fyrir þingið (lagabreyting eða stjórnskipulegur fyrirvari, 103. gr.).
//
// Úttak: gogn/ees.json → importað á byggingartíma í /ees/. Þolir bilun per þrep (heldur eldri skrá ef allt bregst).
// KEYRSLA: node skriptur/build_ees.js
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const CELLAR = 'https://publications.europa.eu/webapi/rdf/sparql';
const UA = { 'User-Agent': 'KARP dashboard build (karp.is)' };
const OUT = path.join(__dirname, '..', 'gogn', 'ees.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eurlex = (celex) => 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:' + celex;

// EES-viðaukar → íslensk stuttheiti (fastir → örugg vörpun úr rómverskri tölu í titli JCD)
const ANNEX_IS = {
  I: 'Heilbrigði dýra og plantna', II: 'Tæknilegar reglugerðir og staðlar', III: 'Skaðsemisábyrgð',
  IV: 'Orka', V: 'Frjáls för launþega', VI: 'Almannatryggingar', VII: 'Viðurkenning starfsmenntunar',
  VIII: 'Staðfesturéttur', IX: 'Fjármálaþjónusta', X: 'Þjónusta almennt', XI: 'Fjarskipti og upplýsingasamfélag',
  XII: 'Frjálsir fjármagnsflutningar', XIII: 'Flutningar', XIV: 'Samkeppni', XV: 'Ríkisaðstoð',
  XVI: 'Opinber innkaup', XVII: 'Hugverkaréttindi', XVIII: 'Vinnuvernd og jafnrétti', XIX: 'Neytendavernd',
  XX: 'Umhverfismál', XXI: 'Hagskýrslugerð', XXII: 'Félagaréttur',
};

async function sparql(q, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(CELLAR + '?query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
      const raw = (await r.text()).trim();
      if (r.status === 200 && raw[0] === '{') return JSON.parse(raw).results.bindings;
      if (t === tries - 1) throw new Error('CELLAR ' + r.status + ': ' + raw.slice(0, 120));
    } catch (e) { if (t === tries - 1) throw e; }
    await sleep(1500 * (t + 1));
  }
  return [];
}

// ── Þrep 1: EES-merktar ESB-gerðir síðustu ~90 daga (samþykktar, bíða upptöku) ──
async function stigESB() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const q = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?date ?title WHERE {
  ?act cdm:work_date_document ?date . FILTER(?date >= "${since}"^^<http://www.w3.org/2001/XMLSchema#date>)
  ?act cdm:work_has_resource-type ?rt . FILTER(?rt IN (<http://publications.europa.eu/resource/authority/resource-type/REG>, <http://publications.europa.eu/resource/authority/resource-type/DIR>, <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL>, <http://publications.europa.eu/resource/authority/resource-type/REG_DEL>))
  ?act cdm:resource_legal_id_celex ?celex .
  ?exp cdm:expression_belongs_to_work ?act ; cdm:expression_title ?title .
  FILTER(LANG(?title) = "en") FILTER(CONTAINS(?title, "EEA relevance"))
} ORDER BY DESC(?date) LIMIT 40`;
  const seen = new Set(); const out = [];
  for (const b of await sparql(q)) {
    const celex = (b.celex || {}).value || '';
    if (!celex || seen.has(celex)) continue; seen.add(celex);
    const title = ((b.title || {}).value || '').replace(/\s*\(Text with EEA relevance\)\s*/gi, '').trim();
    const teg = /^\d{5}R/.test(celex) ? 'Reglugerð' : /^\d{5}L/.test(celex) ? 'Tilskipun' : 'Gerð';
    out.push({ d: (b.date || {}).value, t: title.slice(0, 220), celex, teg, url: eurlex(celex) });
  }
  return out.slice(0, 20);
}

// ── Þrep 2: ákvarðanir sameiginlegu EES-nefndarinnar (JCD) síðustu ~24 mán ──
async function stigJCD() {
  const since = new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10);
  const q = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?date ?title WHERE {
  ?act cdm:resource_legal_id_celex ?celex . FILTER(REGEX(STR(?celex), "^2[0-9]{4}D[0-9]{4}$"))
  ?act cdm:work_date_document ?date . FILTER(?date >= "${since}"^^<http://www.w3.org/2001/XMLSchema#date>)
  ?exp cdm:expression_belongs_to_work ?act ; cdm:expression_title ?title . FILTER(LANG(?title) = "en")
} ORDER BY DESC(?date) LIMIT 150`;
  const seen = new Set(); const out = [];
  for (const b of await sparql(q)) {
    const title = ((b.title || {}).value || '').trim();
    if (!/EEA Joint Committee/i.test(title)) continue;              // aðeins EES-nefndin (ekki ESB/Sviss-nefndir o.fl.)
    const celex = (b.celex || {}).value || '';
    if (seen.has(celex)) continue; seen.add(celex);
    const noM = title.match(/EEA Joint Committee\s+No\s+(\d+\/\d{4})/i);
    const annexM = title.match(/amending\s+(?:Annex\s+([IVXLC]+)\s*\(([^)]+)\)|(Protocol\s+\d+))/i);
    const dateM = title.match(/\bof\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/);
    const annexNo = annexM ? (annexM[1] || null) : null;
    out.push({
      celex, decisionNo: noM ? noM[1] : null,
      pubDate: (b.date || {}).value, decisionDate: dateM ? dateM[1] : null,
      annexNo, annexIs: (annexNo && ANNEX_IS[annexNo]) || (annexM && annexM[3]) || null,
      annexEn: annexM ? (annexM[2] || annexM[3] || null) : null,
      title: title.replace(/\s*\[[^\]]*\]\s*$/, '').slice(0, 220), url: eurlex(celex),
    });
  }
  return out.slice(0, 40);
}

// ── Þrep 3: EES-mál á Alþingi (staðfesting/innleiðing) m/ stöðu ──
const EES_RX = /EES-nefnd|sameiginleg[au][^<]*EES|EES-samning|Evrópska efnahagssvæð|EES-gerð/i;
function tag(xml, t) { const m = xml.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>', 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : ''; }

async function stigAlthingi(things = ['156', '155']) {
  const items = [];
  for (const lthing of things) {
    let xml;
    try { xml = await (await fetch('https://www.althingi.is/altext/xml/thingmalalisti/?lthing=' + lthing, { headers: UA })).text(); }
    catch (e) { console.error('  Alþingi ' + lthing + ' brást:', e.message); continue; }
    const blocks = xml.split(/<mál\b/).slice(1).map((b) => '<mál' + b.slice(0, b.indexOf('</mál>') + 6));
    for (const b of blocks.filter((x) => EES_RX.test(tag(x, 'málsheiti')))) {
      const nr = (b.match(/málsnúmer=['"](\d+)['"]/) || [])[1]; if (!nr) continue;
      const heiti = tag(b, 'málsheiti');
      const htmlRaw = (b.match(/<html>([\s\S]*?)<\/html>/) || [])[1] || '';
      const html = htmlRaw ? htmlRaw.replace(/&amp;/g, '&').replace(/([^:])\/\//g, '$1/').trim()
        : 'https://www.althingi.is/thingstorf/thingmalalistar-eftir-thingum/ferill/' + lthing + '/' + nr + '/';
      const jcdRefs = [...new Set((heiti.match(/nr\.\s*(\d+\/\d{4})/gi) || []).map((x) => x.replace(/nr\.\s*/i, '')))];
      let stada = '', afgreidsla = '';
      try {
        const d = await (await fetch('https://www.althingi.is/altext/xml/thingmalalisti/thingmal/?lthing=' + lthing + '&malnr=' + nr, { headers: UA })).text();
        stada = tag(d, 'staðamáls'); afgreidsla = tag(d, 'afgreiðsla');
      } catch (e) {}
      items.push({ nr: +nr, thing: +lthing, heiti, efni: tag(b, 'efnisgreining'), tegund: tag(b, 'heiti2') || tag(b, 'heiti'), html, stada, afgreidsla, jcdRefs });
      await sleep(120);
    }
  }
  return items;
}

(async () => {
  let esb = [], jcd = [], althingi = [];
  try { esb = await stigESB(); } catch (e) { console.error('Þrep 1 (ESB) brást:', e.message); }
  try { jcd = await stigJCD(); } catch (e) { console.error('Þrep 2 (JCD) brást:', e.message); }
  try { althingi = await stigAlthingi(); } catch (e) { console.error('Þrep 3 (Alþingi) brást:', e.message); }

  // krosstenging JCD ↔ Alþingismál á ákvörðunarnúmeri (No X/ÁÁÁÁ)
  const byRef = {};
  for (const m of althingi) for (const ref of m.jcdRefs) (byRef[ref] = byRef[ref] || []).push({ nr: m.nr, thing: m.thing, heiti: m.heiti, html: m.html, stada: m.stada });
  let linked = 0;
  for (const d of jcd) if (d.decisionNo && byRef[d.decisionNo]) { d.althingi = byRef[d.decisionNo][0]; linked++; }

  if (esb.length + jcd.length + althingi.length === 0) throw new Error('öll þrep tóm — held eldri gogn/ees.json');
  const out = { updated: new Date().toISOString().slice(0, 10), esb, jcd, althingi, meta: { esb: esb.length, jcd: jcd.length, althingi: althingi.length, linked } };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('gogn/ees.json —', esb.length, 'ESB-gerðir ·', jcd.length, 'EES-ákvarðanir ·', althingi.length, 'Alþingismál ·', linked, 'krosstengd');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
