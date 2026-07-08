#!/usr/bin/env node
// =============================================================================
//  build_arsreikningar.mjs   —   DRÖG (bíður samþykkis Arons)
// -----------------------------------------------------------------------------
//  Sækir OPINBERA ársreikninga íslenskra lögaðila úr ársreikningaskrá RSK
//  (frítt, án innskráningar) og þáttar þá í KPI fyrir fyrirtækjaskýrslur karp.is.
//
//  FLÆÐI (staðfest í rannsókn LOTA 99, sjá minnisnótu iceland-arsreikningar-api):
//   1.  Fyrirtækjasíða RSK  ->  tafla „Gögn úr ársreikningaskrá" með
//         data-itemid = Nr. ársreiknings,  data-typeid (1=Ársreikningur,
//         2=Samstæðureikningur, 8=Staðfest vottorð[GJALD], 9=Gjaldfrjálst yfirlit)
//         GET https://www.skatturinn.is/fyrirtaekjaskra/leit/kennitala/<kt>
//   2.  addToCart  ->  býr til körfu í Vefverslun RSK, skilar shoppingCartUrl:
//         GET https://www.skatturinn.is/da/CartService/addToCart?itemid=&typeid=
//         (þarf lotukökur skatturinn.is: JSESSIONID) -> { shoppingCartUrl: kid }
//   3.  Vefverslun (ASP.NET WebForms, vefur.rsk.is/Vefverslun): fylla
//         buyername/buyeremail -> „Áfram" (btnKaupa) -> ReturnPage.aspx (Verð 0)
//         -> „Sækja" (Btn_Saekja) skilar PDF (application/pdf, viðhengi).
//       ⚠ Þetta þrep er ASP.NET-ástandsvél (ViewState + ASP.NET_SessionId sem
//         verður AÐEINS til í miðju flæði). Hrátt fetch nær því illa; HAUSLAUS
//         VAFRI (puppeteer-core á Chrome sem er uppsettur) keyrir það áreiðanlega.
//   4.  parse_arsreikningur.py (pdfplumber) -> tölur + KPI.
//
//  ⚠ HRAÐATAKMÖRK:  Líkanið er ON-DEMAND (eitt félag þegar skýrsla er KEYPT).
//     ALDREI fjöldakall. 24 klst skyndiminni. Ef bakfyllt: 1–2 s töf milli félaga.
//
//  ⚠ PERSÓNUVERND: aðeins lögaðilar. Ársreikningar lögaðila eru OPINBERIR skv.
//     lögum nr. 3/2006 um ársreikninga; RSK býður sjálft gjaldfrjálst niðurhal.
//
//  UPPSETNING:  npm i puppeteer-core   (notar Chrome sem er þegar á vélinni)
//     env CHROME_PATH ef Chrome er annars staðar.
//
//  WORKER-SAMÞÆTTING (val Arons):  Cloudflare-worker getur EKKI keyrt vafra.
//     Kostir: (a) forkeyra í gogn/arsreikningar/<kt>.json fyrir fylgt/vinsæl
//     félög í næturkeyrslu;  (b) sér Node-þjónusta/GH-Action sem vörður kallar á
//     við kaup;  (c) Cloudflare Browser Rendering binding (gjald);  (d) brjóta
//     hráa fetch-flæðið (næstum tókst — vantar ASP.NET_SessionId samfellu).
//
//  NOTKUN:  node skriptur/build_arsreikningar.mjs 6912002990 [5411850389 ...]
//           node skriptur/build_arsreikningar.mjs 6912002990 --ar 2  (fjöldi ára)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchItemids, addToCart, downloadPdf, parsePdf, TYPE } from './lib/rsk.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'web', 'public', 'gogn', 'arsreikningar'); // þjónað af /gogn/arsreikningar/<kt>.json

// ---- heild: kt -> gogn/arsreikningar/<kt>.json ------------------------------
async function buildForKt(kt, { arFjoldi = 1 } = {}) {
  const info = await fetchItemids(kt);
  if (!info.rows.length) {
    // Félag án ársreiknings (nýskráð, undanþegið skilaskyldu eða óskilað). Skrifum MERKI-JSON svo að
    // GH-Action framleiði alltaf skrá → framendinn hættir að poll-a og sýnir loka-ástand (ekki eilífan spinner).
    console.log(`  ${kt} ${info.nafn || ''}: engir ársreikningar skráðir — skrifa merki-JSON (engin:true)`);
    fs.writeFileSync(path.join(OUTDIR, `${kt}.json`), JSON.stringify({ kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), engin: true, astaeda: 'Engir ársreikningar skráðir í ársreikningaskrá RSK (t.d. nýskráð, undanþegið eða óskilað félag).' }, null, 1));
    return null;
  }
  // Fyrir hvert ár: veljum SAMSTÆÐU (typeid 2 — sýnir raunhagkerfi samstæðunnar, staðlað fyrir
  // skráð félög/banka) EF til, annars Ársreikning móðurfélags (typeid 1). RSK listar stundum
  // Ársreikning Á UNDAN Samstæðu (t.d. Brim) → einfalt „fyrsta lína ársins" missti af samstæðunni.
  const byYear = new Map();
  for (const r of info.rows) {
    if (!['1', '2'].includes(r.typeid)) continue;
    const cur = byYear.get(r.ar);
    if (!cur || (r.typeid === '2' && cur.typeid !== '2')) byYear.set(r.ar, r);
  }
  const nyjust = [...byYear.values()].sort((a, b) => String(b.ar).localeCompare(String(a.ar))).slice(0, arFjoldi);
  const tmp = path.join(OUTDIR, `_tmp_${kt}.pdf`);
  const pdfDir = path.join(OUTDIR, 'pdf'); fs.mkdirSync(pdfDir, { recursive: true });   // vista opinbert PDF (verk 2, lög 3/2006)
  const out = { kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), heimild: 'RSK ársreikningaskrá (vefur.rsk.is/Vefverslun) — gjaldfrjálst', ar: {} };
  for (const r of nyjust) {
    console.log(`  ${kt} ${info.nafn}: sæki ${r.teg} ${r.ar} (nr ${r.nr})`);
    const kid = await addToCart(kt, r.nr, r.typeid);
    const pdf = await downloadPdf(kid);
    fs.writeFileSync(tmp, pdf);
    if (r === nyjust[0]) { fs.copyFileSync(tmp, path.join(pdfDir, `${kt}.pdf`)); out.pdf = `pdf/${kt}.pdf`; out.pdfAr = r.ar; }   // nýjasta árs PDF → niðurhals-tengill (opinbert skjal)
    const parsed = parsePdf(tmp, r.ar);   // r.ar = RSK-þekkt ár skýrslunnar (varaleið f. árs-greiningu)
    // parsed.ar = [líðandi, fyrra]; skráum fjárhæðir BEGGJA dálka svo HVERT ár fái tölur → fjölárs-
    // þróunarrit + tekju-/hagnaðarvöxtur reiknist í framenda. KJÓSUM þó idx0 (ár úr SÍNU EIGIN skjali)
    // ef sama ár berst bæði sem líðandi (eldra PDF) og fyrra (yngra PDF) — eigin-skjals dálkur er canonical.
    parsed.ar.forEach((y, i) => {
      if (y == null) return;
      const rec = { teg: r.teg, mynt: parsed.mynt, kvardi: parsed.kvardi, kpi: parsed.kpi[String(y)] || null,
        rekstur: colOf(parsed.rekstur, i), efnahagur: colOf(parsed.efnahagur, i), _idx: i };
      const fyrir = out.ar[y];
      if (!fyrir || (i === 0 && fyrir._idx !== 0)) out.ar[y] = rec;
    });
    await new Promise((x) => setTimeout(x, 1200)); // hófsemi gagnvart RSK
  }
  try { fs.unlinkSync(tmp); } catch {}
  const dest = path.join(OUTDIR, `${kt}.json`);
  // Reikningar fundust en EKKERT nothæft þáttaðist (t.d. aðeins mjög gamalt/óstaðlað uppgjör eins og
  // Eimskip innanlands sem á aðeins 1997-skil) → skrifum MERKI-JSON. Annars sæti framendinn fastur á
  // „reiknast…" að eilífu (tóm ar:{} = óaðgreinanlegt frá bið). Loka-ástand = fsKpiEngin.
  const nothaeft = Object.values(out.ar).some((r) => r && r.kpi && Object.keys(r.kpi).length);
  if (!nothaeft) {
    console.log(`  ${kt} ${info.nafn}: reikningar fundust en engar nothæfar lykiltölur þáttuðust — skrifa merki-JSON`);
    fs.writeFileSync(dest, JSON.stringify({ kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), engin: true, astaeda: 'Ársreikningur fannst hjá félaginu en lykiltölur reiknuðust ekki (t.d. mjög gamalt eða óstaðlað uppgjör).' }, null, 1));
    return null;
  }
  for (const y of Object.keys(out.ar)) delete out.ar[y]._idx;   // innra val-merki, ekki í skrá
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`  -> ${path.relative(ROOT, dest)}  (ár: ${Object.keys(out.ar).join(', ')})`);
  return out;
}
const colOf = (obj, idx) => Object.fromEntries(Object.entries(obj).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v[idx]]));

// ---- CLI --------------------------------------------------------------------
const argv = process.argv.slice(2);
const arFjoldi = (() => { const i = argv.indexOf('--ar'); return i >= 0 ? Math.max(1, +argv[i + 1] || 1) : 1; })();
const kts = argv.filter((a) => /^\d{10}$/.test(a.replace(/\D/g, '')) && a !== String(arFjoldi)).map((a) => a.replace(/\D/g, ''));
if (!kts.length) { console.log('Notkun: node build_arsreikningar.mjs <kt> [<kt> ...] [--ar N]'); process.exit(0); }
fs.mkdirSync(OUTDIR, { recursive: true });
console.log(`Ársreikningar RSK -> gogn/arsreikningar/  (${kts.length} félög, ${arFjoldi} ár hvert)`);
for (const kt of kts) {
  try { await buildForKt(kt, { arFjoldi }); }
  catch (e) { console.error(`  ${kt}: VILLA — ${e.message}`); }
}
