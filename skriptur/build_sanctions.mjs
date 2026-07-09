#!/usr/bin/env node
// build_sanctions.mjs — þvingunaraðgerða-/refsilistar (F9): ESB + SÞ + OFAC -> nafna-index.
// -> web/public/gogn/sanctions.json : { updated, sources, n, names:[{n, nafn, listar}] }
// n = normaliserað nafn (sama og pepNorm). Notað server-hlið í worker /api/sanctions.
// Heimildir eru OPINBERIR listar (engin OpenSanctions — atvinnuleyfisskylt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'sanctions.json');
const UA = { 'User-Agent': 'KARP dashboard build (karp.is)' };

const SOURCES = [
  { id: 'ESB', url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw', parse: parseEU },
  { id: 'SÞ', url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', parse: parseUN },
  { id: 'OFAC', url: 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML', parse: parseOFAC },
];

// Sama normalisering og pepNorm (fyrirtaeki.astro): halda a-z + ð þ æ, henda diakritík/tákn.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
const ent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const tag = (block, name) => { const m = block.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>')); return m ? ent(m[1]).trim() : ''; };
const allTags = (block, name) => [...block.matchAll(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'g'))].map((m) => ent(m[1]).trim());

// ESB: <nameAlias wholeName="..."/>
function parseEU(xml) {
  const out = [];
  for (const m of xml.matchAll(/wholeName="([^"]+)"/g)) out.push(ent(m[1]));
  return out;
}
// SÞ: einstaklingar (FIRST..FOURTH_NAME + ALIAS_NAME) + lögaðilar (FIRST_NAME + ALIAS_NAME)
function parseUN(xml) {
  const out = [];
  for (const b of [...xml.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g)].map((m) => m[1])) {
    const full = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((t) => tag(b, t)).filter(Boolean).join(' ');
    if (full) out.push(full);
    out.push(...allTags(b, 'ALIAS_NAME'));
  }
  for (const b of [...xml.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g)].map((m) => m[1])) {
    const nm = tag(b, 'FIRST_NAME'); if (nm) out.push(nm);
    out.push(...allTags(b, 'ALIAS_NAME'));
  }
  return out;
}
// OFAC: <sdnEntry> firstName+lastName + <aka> firstName/lastName
function parseOFAC(xml) {
  const out = [];
  for (const b of [...xml.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g)].map((m) => m[1])) {
    const fn = tag(b, 'firstName'), ln = tag(b, 'lastName');
    const full = [fn, ln].filter(Boolean).join(' '); if (full) out.push(full);
    for (const a of [...b.matchAll(/<aka>([\s\S]*?)<\/aka>/g)].map((m) => m[1])) {
      const af = [tag(a, 'firstName'), tag(a, 'lastName')].filter(Boolean).join(' '); if (af) out.push(af);
    }
  }
  return out;
}

(async () => {
  const byN = new Map();
  const srcMeta = [];
  for (const s of SOURCES) {
    try {
      console.log('sæki', s.id, '…');
      const r = await fetch(s.url, { headers: UA });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const xml = await r.text();
      const names = s.parse(xml);
      let added = 0;
      for (const raw of names) {
        const n = norm(raw);
        if (n.length < 3) continue;
        if (!byN.has(n)) { byN.set(n, { n, nafn: raw.trim(), listar: new Set([s.id]) }); added++; }
        else byN.get(n).listar.add(s.id);
      }
      srcMeta.push({ id: s.id, raw: names.length, ny: added });
      console.log('  ', s.id, '| hrá nöfn:', names.length, '| ný:', added);
    } catch (e) {
      console.error('  VILLA', s.id, e.message, '(sleppi þessum lista)');
      srcMeta.push({ id: s.id, villa: e.message });
    }
  }
  if (byN.size < 1000) throw new Error('Grunsamlega fá nöfn (' + byN.size + ') — hætti frekar en að skrifa yfir góða skrá');
  const names = [...byN.values()].map((x) => ({ n: x.n, nafn: x.nafn, listar: [...x.listar].join(',') }));
  const data = { updated: new Date().toISOString().slice(0, 10), sources: srcMeta, n: names.length, names };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('sanctions.json | einstök nöfn:', names.length, '| bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
