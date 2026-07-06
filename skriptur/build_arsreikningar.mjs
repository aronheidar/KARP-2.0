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
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, 'gogn', 'arsreikningar');
const PARSER = path.join(__dirname, 'parse_arsreikningur.py');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA = 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)';
const RSK = 'https://www.skatturinn.is';
const BUYER = { name: 'Karp', email: 'aronheidars@gmail.com' };
const TYPE = { 1: 'Ársreikningur', 2: 'Samstæðureikningur' };

// ---- kökuhjálp (Node fetch geymir ekki kökur sjálfkrafa) --------------------
const jarOf = () => {
  const jar = {};
  return {
    absorb: (res) => { for (const c of (res.headers.getSetCookie?.() || [])) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1); } },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  };
};
const rskText = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---- 1) Ársreikninga-tafla félags (kt) --------------------------------------
async function fetchItemids(kt) {
  const html = await (await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } })).text();
  const h1 = html.match(/<h1>\s*([\s\S]*?)\s*\((\d{10})\)/);
  const nafn = h1 ? rskText(h1[1]) : null;
  const ti = html.search(/class="annualTable"/);
  const rows = [];
  if (ti >= 0) {
    const tbl = html.slice(ti, html.indexOf('</table>', ti));
    for (const tr of tbl.split(/<tr\b/i).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => rskText(m[1]));
      const dm = tr.match(/data-itemid="(\d+)"\s+data-typeid="(\d+)"/);
      if (dm && /^\d{4}/.test(tds[0] || '')) rows.push({ ar: tds[0], skil: tds[2] || null, nr: dm[1], typeid: dm[2], teg: tds[4] || TYPE[dm[2]] || null });
    }
  }
  return { kt, nafn, rows };
}

// ---- 2) addToCart -> kid ----------------------------------------------------
async function addToCart(kt, itemid, typeid) {
  const jar = jarOf();
  let r = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  jar.absorb(r); await r.text();
  r = await fetch(`${RSK}/da/CartService/addToCart?itemid=${itemid}&typeid=${typeid}`, { headers: { 'User-Agent': UA, Cookie: jar.header(), 'X-Requested-With': 'XMLHttpRequest' } });
  const body = await r.text();
  const m = body.match(/kid=([A-Z0-9]+)/);
  if (!m) throw new Error('addToCart brást: ' + body.slice(0, 160));
  return m[1];
}

// ---- 3) hauslaus vafri: Áfram -> Sækja -> PDF-buffer ------------------------
async function downloadPdf(kid) {
  const { default: puppeteer } = await import('puppeteer-core'); // valfrjáls háð -> lazy
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`https://vefur.rsk.is/Vefverslun/Default.aspx?kid=${kid}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate((b) => { const n = document.querySelector('[name=buyername]'); if (n) n.value = b.name; const e = document.querySelector('[name=buyeremail]'); if (e) e.value = b.email; }, BUYER);
    await (await page.$('#MainContent_btnKaupa')).click();          // „Áfram" -> ReturnPage (Verð 0)
    await new Promise((x) => setTimeout(x, 4000));
    // Sækja-hnappurinn skilar PDF; sækjum bætin með fetch INNAN síðunnar (fer framhjá niðurhalsstjóra)
    const out = await page.evaluate(async () => {
      const btn = document.querySelector('#MainContent_ucVoruGrid_GridView1_Btn_Saekja_0');
      if (!btn) return { err: 'enginn Sækja-hnappur', txt: document.body.innerText.slice(0, 150) };
      const form = btn.form; const fd = new URLSearchParams();
      for (const el of form.querySelectorAll('input,select')) { if (el.type === 'submit') continue; if (el.name) fd.set(el.name, el.value); }
      fd.set('hfMouseClicked', 'true'); fd.set(btn.name, btn.value || '');
      const res = await fetch(form.action || location.href, { method: 'POST', body: fd, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = ''; const c = 0x8000; for (let i = 0; i < buf.length; i += c) bin += String.fromCharCode.apply(null, buf.subarray(i, i + c));
      return { ct: res.headers.get('content-type'), b64: btoa(bin) };
    });
    if (out.err) throw new Error(out.err + ' | ' + (out.txt || ''));
    const buf = Buffer.from(out.b64, 'base64');
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('ekki PDF (ct=' + out.ct + ')');
    return buf;
  } finally { await browser.close(); }
}

// ---- 4) parse via python ----------------------------------------------------
function parsePdf(pdfPath) {
  const py = process.env.PYTHON || 'python';
  const r = spawnSync(py, [PARSER, pdfPath], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('parse_arsreikningur.py: ' + (r.stderr || r.error));
  return JSON.parse(r.stdout);
}

// ---- heild: kt -> gogn/arsreikningar/<kt>.json ------------------------------
async function buildForKt(kt, { arFjoldi = 1 } = {}) {
  const info = await fetchItemids(kt);
  if (!info.rows.length) { console.log(`  ${kt} ${info.nafn || ''}: engir ársreikningar skráðir`); return null; }
  // veljum nýjustu N skil (helst Samstæðu[2] ef til, annars Ársreikning[1]) — hvert PDF gefur 2 ár
  const nyjust = [];
  const seenAr = new Set();
  for (const r of info.rows) {
    if (!['1', '2'].includes(r.typeid) || seenAr.has(r.ar)) continue;
    seenAr.add(r.ar); nyjust.push(r);
    if (nyjust.length >= arFjoldi) break;
  }
  const tmp = path.join(OUTDIR, `_tmp_${kt}.pdf`);
  const out = { kt, nafn: info.nafn, sott: new Date().toISOString().slice(0, 10), heimild: 'RSK ársreikningaskrá (vefur.rsk.is/Vefverslun) — gjaldfrjálst', ar: {} };
  for (const r of nyjust) {
    console.log(`  ${kt} ${info.nafn}: sæki ${r.teg} ${r.ar} (nr ${r.nr})`);
    const kid = await addToCart(kt, r.nr, r.typeid);
    const pdf = await downloadPdf(kid);
    fs.writeFileSync(tmp, pdf);
    const parsed = parsePdf(tmp);
    // parsed.ar = [líðandi, fyrra]; skráum bæði ár úr þessu PDF (KPI þegar reiknað per ár)
    parsed.ar.forEach((y, i) => {
      if (y == null) return;
      const rec = { teg: r.teg, mynt: parsed.mynt, kvardi: parsed.kvardi, kpi: parsed.kpi[String(y)] || null };
      // aðeins skrá tölur líðandi árs úr þessu skjali (fyrra ár kemur betur úr sínu eigin skjali)
      if (i === 0) { rec.rekstur = colOf(parsed.rekstur, 0); rec.efnahagur = colOf(parsed.efnahagur, 0); }
      out.ar[y] = out.ar[y] || rec;
    });
    await new Promise((x) => setTimeout(x, 1200)); // hófsemi gagnvart RSK
  }
  try { fs.unlinkSync(tmp); } catch {}
  const dest = path.join(OUTDIR, `${kt}.json`);
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
