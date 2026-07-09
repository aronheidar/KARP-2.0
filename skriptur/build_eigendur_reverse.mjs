#!/usr/bin/env node
// build_eigendur_reverse.mjs — öfugt eignarhaldsnet (F4).
// Skannar öll gogn/eigendur/<kt>.json og snýr við brúnum: eigandi -> félög sem hann á.
// -> web/public/gogn/eigendur_reverse.json : { updated, n, byOwner:{ <ownerKey>:{ nafn, a:[{kt,nafn,hlutur}] } } }
// ownerKey: félag=kt ; einstaklingur=norm(nafn)+'|'+faeding. Þekja = aðeins greind félög (á-eftirspurn) -> vex.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'web', 'public', 'gogn', 'eigendur');
const OUT = path.join(__dirname, '..', 'web', 'public', 'gogn', 'eigendur_reverse.json');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zðþæ\s]/g, ' ').replace(/\s+/g, ' ').trim();
// Hreinsa PDF-punktalínu-hala úr hluthafa-nöfnum ("Gildi....30.440" -> "Gildi").
const cleanNm = (s) => (String(s || '').replace(/[.·…]{2,}[\s\S]*$/, '').replace(/\s+[\d.,]+\s*$/, '').trim() || '—');

(async () => {
  if (!fs.existsSync(DIR)) { console.log('engin eigendur-mappa — sleppi'); fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), n: 0, byOwner: {} })); return; }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const byOwner = new Map(); // ownerKey -> { nafn, seen:Set<tilKt>, a:[] }

  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; }
    const net = j.net; if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) continue;
    const byId = new Map(net.nodes.map((n) => [n.id, n]));
    for (const e of net.edges) {
      const fra = byId.get(e.fra), til = byId.get(e.til);
      if (!fra || !til) continue;
      if (til.tegund === 'einst' || !til.kt) continue;          // aðeins félög eru „átt"
      const key = fra.tegund === 'felag' && fra.kt ? fra.kt : (fra.kt ? fra.kt : norm(fra.nafn) + '|' + (fra.faeding || ''));
      if (!key || key === '|') continue;
      if (!byOwner.has(key)) byOwner.set(key, { nafn: cleanNm(fra.nafn), seen: new Set(), a: [] });
      const rec = byOwner.get(key);
      if (rec.seen.has(til.kt)) continue;
      rec.seen.add(til.kt);
      rec.a.push({ kt: til.kt, nafn: cleanNm(til.nafn), hlutur: (e.hlutur == null ? null : e.hlutur) });
    }
  }

  const out = {};
  for (const [k, v] of byOwner) out[k] = { nafn: v.nafn, a: v.a };
  const data = { updated: new Date().toISOString().slice(0, 10), n: Object.keys(out).length, files: files.length, byOwner: out };
  fs.writeFileSync(OUT, JSON.stringify(data));
  const multi = Object.values(out).filter((x) => x.a.length > 1).length;
  console.log('eigendur_reverse.json | eigendur:', data.n, '| þar af m/ >1 félag:', multi, '| úr', files.length, 'skrám | bytes:', fs.statSync(OUT).size);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
