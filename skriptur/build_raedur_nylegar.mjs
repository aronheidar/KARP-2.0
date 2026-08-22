#!/usr/bin/env node
// build_raedur_nylegar.mjs — Ræðuvakt: nýlegar ræður af Alþingi (síðustu ~7 daga) inn í leitarorðavaktina
// (lobbývakt + fréttavaktar-póstur). Opinberar umritanir úr XML-veitu Alþingis (CORS-opin, engin auðkenning).
//
// Heimildir (sjá minni iceland-althingi-api + skriptur/build_raedur.js sem les sama lista):
//   - raedulisti/?lthing=N: ~15þ færslur per þing; hver <ræða> ber ræðumann (nafn+embætti), tíma,
//     tegund, málsheiti og slóðir — þ.m.t. HTML-slóð ræðunnar OG XML-slóð ræðutextans (/xml/N/raedur/).
//   - loggjafarthing/yfirstandandi/: <þing númer='N'> → sjálfvirk þing-uppfærsla (157 → 158 í sept. 2026).
//   - Per-ræðu XML: <ns:ræðutexti><ns:mgr>…</ns:mgr>… → textabrot ≤800 stafir (eins og news.body).
//
// Úttak: web/public/gogn/raedur_nylegar.json (+ gogn/) — { updated, thing, dagar, raedur:[
//   { id, nafn, embaetti, dags, hofst, teg, malsheiti, malnr, brot, hlekkur } ] }
// Neytendur: veitur.mjs lobbyvaktHandler (augGet) + worker.js frettavaktCron (_dget) + /lobbyvakt/.
//
// ⚠ Tómur gluggi er GILT ástand (þinghlé júní–sept) og skrifast — en netbilun/óvænt svar kastar
// svo góð skrá skemmist ekki. Tóm textabrot eru reynd aftur næstu nótt (umritun birtist á eftir
// ræðulista-færslunni) — sama sjálfsheilunar-regla og lobbyvakt-cache (sjá karp-lobbyvakt minni).
//
// Keyra: node skriptur/build_raedur_nylegar.mjs [--dry]   (env: KARP_LTHING, KARP_RAEDUR_DAGAR)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_WEB = join(__dirname, '..', 'web', 'public', 'gogn', 'raedur_nylegar.json');
const OUT_ROOT = join(__dirname, '..', 'gogn', 'raedur_nylegar.json');

const UA = { 'User-Agent': 'KARP build (karp.is)' };
const DRY = process.argv.includes('--dry');
const DAGAR = Math.max(1, parseInt(process.env.KARP_RAEDUR_DAGAR || '7', 10) || 7);
const TEXT_MAX_FETCH = 600;   // þak á per-ræðu XML-sóknir per keyrslu (annasöm þingvika ≈ 100+/dag)
const BROT_MAX = 800;

const unesc = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const grab = (xml, tag) => { const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].trim() : ''; };

// Þáttar raedulisti-XML í ræðu-færslur. Sleppir færslum án HTML-slóðar (ekkert að tengja á) eða nafns.
// id = raeda-<lthing>-<rad-skráarheiti> (einkvæmt per ræðu hjá Alþingi, stöðugt milli keyrslna).
export function parseRaedulisti(xml, lthing) {
  const out = [];
  const seen = new Set();
  for (const c of String(xml || '').split('<ræða>').slice(1)) {
    const html = (c.match(/<html>([^<]*\/altext\/raeda\/[^<]*)<\/html>/) || [])[1] || '';
    const fm = html.match(/(rad\d{8}T\d{6})\.html/);
    if (!fm) continue;
    const nafn = unesc(grab(c, 'nafn'));
    if (!nafn) continue;
    const id = `raeda-${lthing}-${fm[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hofst = grab(c, 'ræðahófst');
    const dm = grab(c, 'dagur').match(/(\d{2})\.(\d{2})\.(\d{4})/);
    out.push({
      id,
      nafn,
      embaetti: unesc(grab(c, 'ráðherra') || grab(c, 'forsetiÍslands') || grab(c, 'forsetiAlþingis') || ''),
      dags: hofst ? hofst.slice(0, 10) : (dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : ''),
      hofst,
      teg: unesc(grab(c, 'tegundræðu')) || 'ræða',
      malsheiti: unesc(grab(c, 'málsheiti')),
      malnr: parseInt(grab(c, 'málsnúmer'), 10) || null,
      hlekkur: html.replace(/^http:/, 'https:'),
      xmlSlod: (c.match(/<xml>([^<]*\/raedur\/[^<]*)<\/xml>/) || [])[1] || '',
    });
  }
  return out;
}

// Textabrot úr per-ræðu XML: málsgreinar <ns:mgr> sameinaðar, tögg strípuð, entities afkóðaðar,
// bil felld saman, klippt í ≤max stafi með ellipsu. Enginn ræðutexti (óumrituð ræða) → ''.
export function extractBrot(xml, max = BROT_MAX) {
  const m = String(xml || '').match(/<(?:\w+:)?ræðutexti[^>]*>([\s\S]*?)<\/(?:\w+:)?ræðutexti>/);
  if (!m) return '';
  const text = unesc(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Aðeins ræður innan síðustu `dagar` daga m.v. nowMs (hofst fremur en dags); ógildar dagsetningar burt.
export function sidustuDagar(raedur, dagar, nowMs) {
  const cutoff = (Number(nowMs) || Date.now()) - dagar * 86400000;
  return (Array.isArray(raedur) ? raedur : []).filter((r) => {
    if (!r) return false;
    const t = Date.parse(r.hofst || r.dags);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

async function detectLthing() {
  if (process.env.KARP_LTHING) return process.env.KARP_LTHING;
  try {
    const r = await fetch('https://www.althingi.is/altext/xml/loggjafarthing/yfirstandandi/', { headers: UA });
    if (r.ok) { const m = (await r.text()).match(/<þing númer='(\d+)'/); if (m) return m[1]; }
  } catch (e) { /* fallback að neðan */ }
  return '157';
}

async function main() {
  const LTHING = await detectLthing();
  console.log(`Ræðuvakt: sæki ræðulista löggjafarþings ${LTHING} (gluggi ${DAGAR} dagar)…`);
  const r = await fetch(`https://www.althingi.is/altext/xml/raedulisti/?lthing=${LTHING}`, { headers: UA });
  if (!r.ok) throw new Error('raedulisti HTTP ' + r.status);
  const xml = await r.text();
  if (!/<ræðulisti/.test(xml)) throw new Error('óvænt svar (ekki ræðulisti-XML) — skrifa EKKI yfir góða skrá');
  const allar = parseRaedulisti(xml, LTHING);
  // Þinghlé (júlí–sept.): ef færri en 20 ræður finnast í glugganum er hann víkkaður í 90 daga svo síðan standi ekki tóm.
  let DAGAR_NOTAD = DAGAR;
  let nylegar = sidustuDagar(allar, DAGAR, Date.now());
  if (nylegar.length < 20 && DAGAR < 90) { DAGAR_NOTAD = 90; nylegar = sidustuDagar(allar, 90, Date.now()); if (nylegar.length) console.log('  þinghlé: víkka gluggann í 90 daga →', nylegar.length, 'ræður'); }
  nylegar = nylegar
    .sort((a, b) => String(b.hofst || b.dags).localeCompare(String(a.hofst || a.dags)));
  console.log(`  ræður alls á þinginu: ${allar.length} · innan glugga: ${nylegar.length}${nylegar.length ? '' : ' (þinghlé — tómt er gilt)'}`);

  let prev = {};
  if (existsSync(OUT_WEB)) {
    try { for (const p of (JSON.parse(readFileSync(OUT_WEB, 'utf8')).raedur || [])) if (p && p.id && p.brot) prev[p.id] = p.brot; } catch (e) { /* byrja tómt */ }
  }
  const vantar = nylegar.filter((x) => !prev[x.id] && x.xmlSlod).slice(0, TEXT_MAX_FETCH);
  if (nylegar.length) console.log(`  textabrot: ${nylegar.length - vantar.length} endurnýtt · sæki ${vantar.length} ræðutexta…`);
  let sott = 0, antexta = 0;
  const CONC = 6;
  for (let i = 0; i < vantar.length; i += CONC) {
    await Promise.all(vantar.slice(i, i + CONC).map(async (x) => {
      try {
        const sr = await fetch(x.xmlSlod, { headers: UA });
        x.brot = sr.ok ? extractBrot(await sr.text()) : '';
      } catch (e) { x.brot = ''; }
      if (x.brot) sott++; else antexta++;
    }));
  }
  for (const x of nylegar) if (!x.brot) x.brot = prev[x.id] || '';
  if (vantar.length) console.log(`  ræðutextar: ${sott} sóttir · ${antexta} án texta (óumritað — reynt aftur næst)`);

  const raedur = nylegar.map(({ xmlSlod, ...keep }) => keep);
  const out = { updated: new Date().toISOString().slice(0, 10), thing: parseInt(LTHING, 10) || LTHING, dagar: DAGAR_NOTAD, thinghle: DAGAR_NOTAD !== DAGAR, raedur: raedur.slice(0, 800) };   // þak 800 nýjustu (≈0,8 MB) — augGet/_dget hlaða skránni í heilu
  if (!DRY) {
    writeFileSync(OUT_WEB, JSON.stringify(out));
    writeFileSync(OUT_ROOT, JSON.stringify(out));
    console.log('Skrifað:', OUT_WEB);
    console.log('Skrifað:', OUT_ROOT);
  } else {
    console.log(`(--dry: engin skrif — ${raedur.length} ræður, ${JSON.stringify(out).length} bæti)`);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('build_raedur_nylegar.mjs')) {
  main().catch((e) => { console.error('VILLA', e); process.exit(1); });
}
