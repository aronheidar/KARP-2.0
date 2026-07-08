// Sameiginlegar RSK + PDF-hjálpir fyrir build_arsreikningar.mjs OG build_eigendur.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RSK = 'https://www.skatturinn.is';
export const TYPE = { 1: 'Ársreikningur', 2: 'Samstæðureikningur' };
const DEF_UA = 'karp.is fyrirtaekjaskra (aronheidars@gmail.com)';
const DEF_CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PARSER = path.join(__dirname, '..', 'parse_arsreikningur.py');

export const jarOf = () => {
  const jar = {};
  return {
    absorb: (res) => { for (const c of (res.headers.getSetCookie?.() || [])) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i).trim()] = kv.slice(i + 1); } },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
  };
};
export const rskText = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export async function fetchItemids(kt, { UA = DEF_UA } = {}) {
  const res = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`RSK svaraði HTTP ${res.status} (líkleg throttla)`);
  const html = await res.text();
  const h1 = html.match(/<h1>\s*([\s\S]*?)\s*\((\d{10})\)/);
  if (!h1) throw new Error('RSK-síða án fyrirtækjahauss (throttla/villa?)');
  const nafn = rskText(h1[1]);
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

export async function addToCart(kt, itemid, typeid, { UA = DEF_UA } = {}) {
  const jar = jarOf();
  let r = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  jar.absorb(r); await r.text();
  r = await fetch(`${RSK}/da/CartService/addToCart?itemid=${itemid}&typeid=${typeid}`, { headers: { 'User-Agent': UA, Cookie: jar.header(), 'X-Requested-With': 'XMLHttpRequest' } });
  const body = await r.text();
  const m = body.match(/kid=([A-Z0-9]+)/);
  if (!m) throw new Error('addToCart brást: ' + body.slice(0, 160));
  return m[1];
}

export async function downloadPdf(kid, { CHROME = DEF_CHROME, UA = DEF_UA, BUYER = { name: 'Karp', email: 'aronheidars@gmail.com' } } = {}) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`https://vefur.rsk.is/Vefverslun/Default.aspx?kid=${kid}`, { waitUntil: 'networkidle2', timeout: 40000 });
    await page.evaluate((b) => { const n = document.querySelector('[name=buyername]'); if (n) n.value = b.name; const e = document.querySelector('[name=buyeremail]'); if (e) e.value = b.email; }, BUYER);
    const kaupa = await page.$('#MainContent_btnKaupa');
    if (!kaupa) throw new Error('enginn btnKaupa: ' + (await page.evaluate(() => document.body.innerText.slice(0, 150))));
    await kaupa.click();
    await page.waitForSelector('#MainContent_ucVoruGrid_GridView1_Btn_Saekja_0', { timeout: 20000 }).catch(() => {});
    const post = await page.evaluate(() => {
      const btn = document.querySelector('#MainContent_ucVoruGrid_GridView1_Btn_Saekja_0');
      if (!btn) return { err: 'enginn Sækja-hnappur', txt: document.body.innerText.slice(0, 150) };
      const form = btn.form; const fd = {};
      for (const el of form.querySelectorAll('input,select')) { if (el.type === 'submit') continue; if (el.name) fd[el.name] = el.value; }
      fd['hfMouseClicked'] = 'true'; fd[btn.name] = btn.value || '';
      return { action: form.action || location.href, fields: fd };
    });
    if (post.err) throw new Error(post.err + ' | ' + (post.txt || ''));
    const cookieHeader = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    await browser.close();
    const res = await fetch(post.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader, 'User-Agent': UA }, body: new URLSearchParams(post.fields).toString() });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('ekki PDF (ct=' + (res.headers.get('content-type') || '') + ', ' + buf.length + 'B)');
    return buf;
  } finally { try { await browser.close(); } catch {} }
}

export function parsePdf(pdfPath, knownYr, { PYTHON = process.env.PYTHON || 'python' } = {}) {
  const args = [PARSER, pdfPath];
  if (knownYr) args.push(String(knownYr));
  const r = spawnSync(PYTHON, args, { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('parse_arsreikningur.py: ' + (r.stderr || r.error));
  return JSON.parse(r.stdout);
}

// ---- Nýtt: raunverulegir eigendur af OPINNI RSK-detail-síðu (port á worker.js 687-705) ----
export async function fetchRaunverulegir(kt, { UA = DEF_UA } = {}) {
  const res = await fetch(`${RSK}/fyrirtaekjaskra/leit/kennitala/${kt}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`RSK HTTP ${res.status}`);
  const html = await res.text();
  const iE = html.indexOf('Raunverulegir eigendur');
  if (iE < 0) return { eigendur: [], tomt: false };
  let eseg = html.slice(iE, iE + 9000);
  const end = eseg.search(/Leit í fyrirtækjaskrá|<h3/i);
  if (end > 0) eseg = eseg.slice(0, end);
  const eig = [];
  for (const h of [...eseg.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/gi)]) {
    const nafn = rskText(h[1]);
    if (!nafn) continue;
    const after = eseg.slice(h.index + h[0].length, h.index + h[0].length + 900);
    const c = [...after.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => rskText(m[1]));
    eig.push({ nafn, faeding: c[0] || null, buseta: (c[1] || '').replace(/\.$/, '') || null, rikisfang: c[2] || null, hlutur: c[3] && c[3] !== '-' ? c[3] : null, tegund: (c[4] || '').replace(/[,\s]+$/, '') || null });
    if (eig.length >= 20) break;
  }
  return { eigendur: eig, tomt: eig.length === 0 };
}

// ---- Nýtt: hluthafar úr nýjasta ársreikningi (kt-berandi -> drífur endurkvæmni) ----
export async function fetchHluthafar(kt, opts = {}) {
  const info = await fetchItemids(kt, opts);
  const rows = info.rows.filter((r) => ['1', '2'].includes(r.typeid));
  if (!rows.length) return { nafn: info.nafn, hluthafar: [], ar: null };
  const byYear = new Map();
  for (const r of rows) { const cur = byYear.get(r.ar); if (!cur || (r.typeid === '2' && cur.typeid !== '2')) byYear.set(r.ar, r); }
  const pick = [...byYear.values()].sort((a, b) => String(b.ar).localeCompare(String(a.ar)))[0];
  const kid = await addToCart(kt, pick.nr, pick.typeid, opts);
  const pdf = await downloadPdf(kid, opts);
  const tmp = path.join(__dirname, `_tmp_hl_${kt}.pdf`);
  fs.writeFileSync(tmp, pdf);
  try {
    const parsed = parsePdf(tmp, pick.ar, opts);
    return { nafn: info.nafn, hluthafar: parsed.hluthafar || [], ar: pick.ar };
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

// ---- Nýtt: stjórn úr "Gjaldfrjálsu yfirliti" (RSK typeid 9), pdftotext -raw -enc UTF-8 texti ----
// 🔒 Skilar AÐEINS {nafn, hlutverk} — sleppir kennitölum og heimilisföngum einstaklinga (persónuvernd).
export function parseStjornText(txt) {
  const lines = String(txt || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // <kt> <nafn>, <heimilisfang>, <póstnr borg>, <hlutverk>
  const LINE = /^\d{6}-?\d{4}\s+(.+?),\s*.+?,\s*.+?,\s*([^,]+?)\s*$/;
  const normRole = (r) => {
    const s = (r || '').replace(/[.,\s]+$/, '').trim();
    if (/^Framkvæmdastjór/i.test(s)) return 'Framkvæmdastjóri';   // skjalið segir "Framkvæmdastjórn"
    return s;
  };
  const sectionRole = (h) => /Endursko/i.test(h) ? 'Endurskoðandi'
    : /Framkv/i.test(h) ? 'Framkvæmdastjóri'
    : /Prókúr/i.test(h) ? 'Prókúruhafi' : null;
  const out = [];
  let firmaritun = null, dags = null, section = null, m;
  for (const ln of lines) {
    if ((m = ln.match(/^Firma[ðđ]?\s*rita:?\s*(.+)$/i))) { firmaritun = m[1].trim() || null; continue; }
    if ((m = ln.match(/skipa samkvæmt fundi þann:?\s*([\d.]+)/i))) { dags = m[1] || null; continue; }
    if (/:\s*$/.test(ln)) { section = sectionRole(ln); continue; }   // kaflahaus
    if ((m = ln.match(LINE))) {
      const nafn = m[1].trim();
      const hlutverk = normRole(m[2]) || section || 'Stjórn';
      if (nafn && !/^\d{6}-?\d{4}$/.test(nafn)) out.push({ nafn, hlutverk });
    }
  }
  const ORDER = ['stjórnarformaður', 'varaformaður', 'meðstjórnandi', 'stjórnarmaður', 'varamaður', 'framkvæmdastjóri', 'prókúruhafi', 'endurskoðandi'];
  const rank = (h) => { const i = ORDER.indexOf((h || '').toLowerCase()); return i < 0 ? ORDER.length : i; };
  out.sort((a, b) => rank(a.hlutverk) - rank(b.hlutverk));   // stöðug röðun (Node) heldur skjalaröð innan flokks
  return { stjorn: out, firmaritun, dags };
}
