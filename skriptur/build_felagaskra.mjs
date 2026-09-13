// build_felagaskra.mjs — kt+nafn-skrá yfir þau félög sem Karp á raunefni um.
// → gogn/felagaskra.json, sem knýr BÆÐI /fyrirtaeki/skra/ (stafrófsskráin) OG
//   web/public/sitemap-fyrirtaeki.xml. Ein uppspretta, engin tvítekin söfnun.
//
// ⚠ Bakgrunnur (SEO-úttekt 13.9.2026): fyrirtækjaprófílarnir höfðu NÚLL innri tengla
// og voru aðeins aðgengilegir um sitemap — Google skríður slíkar síður hægt og metur
// þær lágt. Stafrófsskráin gerir hvern prófíl aðgengilegan í tveimur smellum.
//
// ⚠ SLÓÐ: ársreikningar og eigendur liggja í web/public/gogn/ (þar eru þeir committaðir
// og bornir fram), EKKI í gogn/. Gamli sitemap-smiðurinn las gogn/arsreikningar/ sem
// geymir eina skrá — þess vegna taldi sitemap 1.085 og allt kom úr lögbirtingu einni.
//
// Aðeins lögaðilar (kt 41–71 í fyrstu tveimur tölustöfum). Engin einstaklings-kt.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { erLogadili, ktTolur } from '../web/src/lib/fyrirtaeki-slod.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gogn = (p) => join(ROOT, 'gogn', p);
const pub = (p) => join(ROOT, 'web', 'public', 'gogn', p);

/** kt → nafn. Fyrsta nafn sem sést vinnur; uppsprettur eru taldar til skýrslu. */
const felog = new Map();
const taln = {};
const baeta = (kt, nafn, uppspretta) => {
  const k = ktTolur(kt);
  const n = String(nafn || '').trim();
  if (!erLogadili(k) || !n) return;
  taln[uppspretta] = (taln[uppspretta] || 0) + 1;
  if (!felog.has(k)) felog.set(k, n);
};

/** Möppur með <kt>.json þar sem nafnið stendur í skránni. */
const lesaMoppu = (dir, uppspretta) => {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(\d{10})\.json$/);
    if (!m) continue;
    try {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      baeta(d.kt || m[1], d.nafn || d.name || d.felag, uppspretta);
    } catch (e) { /* skemmd skrá — sleppa, hún birtist bara ekki í skránni */ }
  }
};

lesaMoppu(pub('arsreikningar'), 'arsreikningar');
lesaMoppu(pub('eigendur'), 'eigendur');

try {
  const lb = JSON.parse(readFileSync(gogn('logbirting.json'), 'utf8'));
  for (const [kt, v] of Object.entries(lb.byKt || {})) baeta(kt, v && v.name, 'logbirting');
} catch (e) { /* valkvæð uppspretta */ }

// Íslensk stafrófsröð (Á á eftir A, Þ/Æ/Ö aftast) — Intl kann hana, handvirk röð myndi skeika.
const collator = new Intl.Collator('is-IS', { sensitivity: 'base', numeric: true });
const listi = [...felog.entries()]
  .map(([kt, nafn]) => ({ kt, nafn }))
  .sort((a, b) => collator.compare(a.nafn, b.nafn) || a.kt.localeCompare(b.kt));

const ut = { generated: new Date().toISOString(), alls: listi.length, felog: listi };
writeFileSync(gogn('felagaskra.json'), JSON.stringify(ut));
console.log(`felagaskra.json: ${listi.length} einkvæm félög (færslur per uppsprettu: ${JSON.stringify(taln)})`);
