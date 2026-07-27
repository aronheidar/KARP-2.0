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
import { fetchItemids, addToCart, downloadPdf, parsePdf, ocrPdf, TYPE } from './lib/rsk.mjs';

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
    fs.writeFileSync(path.join(OUTDIR, `${kt}.json`), JSON.stringify({ kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), engin: true, flokkur: 'ekki_skilad', astaeda: 'Engir ársreikningar skráðir í ársreikningaskrá RSK (t.d. nýskráð, undanþegið eða óskilað félag).' }, null, 1));
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
  let firstParsed = null;   // nýjasta árs parse-útkoma → flokkun ef ekkert þáttast (skannað/óvirkt/óstaðlað)
  for (const r of nyjust) {
    console.log(`  ${kt} ${info.nafn}: sæki ${r.teg} ${r.ar} (nr ${r.nr})`);
    const kid = await addToCart(kt, r.nr, r.typeid);
    const pdf = await downloadPdf(kid);
    fs.writeFileSync(tmp, pdf);
    if (r === nyjust[0]) { fs.copyFileSync(tmp, path.join(pdfDir, `${kt}.pdf`)); out.pdf = `pdf/${kt}.pdf`; out.pdfAr = r.ar; }   // nýjasta árs PDF → niðurhals-tengill (opinbert skjal)
    let parsed = parsePdf(tmp, r.ar);   // r.ar = RSK-þekkt ár skýrslunnar (varaleið f. árs-greiningu)
    if (parsed.skannad) {   // mynd-PDF án textalags → OCR-varaleið (ocrmypdf/tesseract) og þátta aftur
      const ocr = ocrPdf(tmp);
      if (ocr) {
        try {
          const p2 = parsePdf(ocr, r.ar);
          // ⚠ FJÁRHAGSGÖGN: samþykkjum OCR AÐEINS ef efnahagsreikningurinn stemmir innbyrðis (Eignir ≈
          //   Eigið fé + Skuldir, ≤2%) — hafnar OCR-tölustafavillum svo aldrei séu birtar rangar lykiltölur.
          if (p2 && !p2.skannad && reconcilesOk(p2)) { parsed = p2; out.ocr = true; console.log(`  ${kt}: OCR tókst (${r.ar}) — efnahagur stemmir`); }
          else console.log(`  ${kt}: OCR ${p2 && !p2.skannad ? 'stemmdi ekki (hafnað)' : 'skilaði engum texta'} (${r.ar})`);
        } catch (e) { console.error(`  ${kt}: OCR-þáttun brást — ${e.message}`); }
        finally { try { fs.unlinkSync(ocr); } catch {} }
      }
    }
    if (r === nyjust[0]) firstParsed = parsed;
    // parsed.ar = [líðandi, fyrra]; skráum fjárhæðir BEGGJA dálka svo HVERT ár fái tölur → fjölárs-
    // þróunarrit + tekju-/hagnaðarvöxtur reiknist í framenda. KJÓSUM þó idx0 (ár úr SÍNU EIGIN skjali)
    // ef sama ár berst bæði sem líðandi (eldra PDF) og fyrra (yngra PDF) — eigin-skjals dálkur er canonical.
    parsed.ar.forEach((y, i) => {
      if (y == null) return;
      const rec = { teg: r.teg, mynt: parsed.mynt, kvardi: parsed.kvardi, kpi: parsed.kpi[String(y)] || null,
        rekstur: colOf(parsed.rekstur, i), efnahagur: colOf(parsed.efnahagur, i),
        starfsmenn: (i === 0 && parsed.starfsmenn != null) ? parsed.starfsmenn : null, _idx: i };   // parser skilar líðandi-árs fjölda
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
    const { flokkur, astaeda } = flokkaEngin(firstParsed);
    console.log(`  ${kt} ${info.nafn}: reikningar fundust en engar nothæfar lykiltölur (${flokkur}) — skrifa merki-JSON`);
    fs.writeFileSync(dest, JSON.stringify({ kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), engin: true, flokkur, astaeda }, null, 1));
    return null;
  }
  for (const y of Object.keys(out.ar)) delete out.ar[y]._idx;   // innra val-merki, ekki í skrá
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`  -> ${path.relative(ROOT, dest)}  (ár: ${Object.keys(out.ar).join(', ')})`);
  return out;
}
const colOf = (obj, idx) => Object.fromEntries(Object.entries(obj).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v[idx]]));

// OCR-öryggishlið: samþykkjum OCR-lesinn ársreikning AÐEINS ef efnahagsreikningurinn stemmir innbyrðis.
// Sterkasta prófið: „Eignir samtals" ≈ „Eignir og skuldir samtals" (báðar lesnar sjálfstætt). Annars
// reikningsjafnan Eignir ≈ Eigið fé + Skuldir. Vikmörk 2%. Ef ekkert er sannreynanlegt → HÖFNUM (varúð).
function reconcilesOk(p) {
  const c = (o, k) => (o && Array.isArray(o[k]) && o[k][0] != null ? o[k][0] : null);
  const ef = p.efnahagur || {};
  const eignir = c(ef, 'eignir'), efeSk = c(ef, 'efe_skuldir'), efe = c(ef, 'eigid_fe'), skuldir = c(ef, 'skuldir');
  const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a)) * 0.02;
  if (eignir && efeSk) return near(eignir, efeSk);
  if (eignir && efe != null && skuldir != null) return near(eignir, efe + skuldir);
  return false;
}

// Greinir HVERS VEGNA ekkert nothæft þáttaðist → nákvæm skilaboð á fyrirtækjasíðunni (fsKpiEngin les `flokkur`).
//  skannad      = mynd-PDF án textalags (þarf OCR)     ·  ovirkt = núll-uppgjör (engin starfsemi)
//  oskyranlegt  = reikningur fannst en óstaðlað/ólæsilegt snið
function flokkaEngin(p) {
  if (!p) return { flokkur: 'oskyranlegt', astaeda: 'Ársreikningur fannst hjá félaginu en ekki tókst að lesa lykiltölur úr honum.' };
  if (p.skannad) return { flokkur: 'skannad', astaeda: 'Nýjasti ársreikningur félagsins liggur aðeins fyrir sem skönnuð mynd (án textalags) svo ekki var hægt að lesa lykiltölur vélrænt. Hægt er að sækja PDF-skjalið sjálft.' };
  const col0 = (o, k) => (o && Array.isArray(o[k]) ? o[k][0] : (o && o[k] != null ? o[k] : null));
  const rk = p.rekstur || {}, ef = p.efnahagur || {};
  if (Object.keys(rk).length + Object.keys(ef).length === 0)
    return { flokkur: 'oskyranlegt', astaeda: 'Ársreikningur fannst hjá félaginu en er á óstöðluðu sniði sem ekki tókst að lesa vélrænt.' };
  const eignir = col0(ef, 'eignir'), sala = col0(rk, 'sala');
  if ((eignir === 0 || eignir == null) && (sala === 0 || sala == null))
    return { flokkur: 'ovirkt', astaeda: 'Félagið skilaði núll-uppgjöri (engin starfsemi eða hreyfing á tímabilinu) svo lykiltölur eiga ekki við.' };
  return { flokkur: 'oskyranlegt', astaeda: 'Lykiltölur reiknuðust ekki úr ársreikningi félagsins (t.d. óstaðlað uppgjör).' };
}

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
