// _pxlib.mjs — sameiginleg hjálparbúsáhöld fyrir Hagstofu-snapshot-skriptur (build_hagvoxtur/mannfjoldi/…).
// Enginn þriðjaaðila-pakki (native fetch í Node 18+/22) → CI-öruggt.
// Dual-write: gogn/<nafn>.json (byggingartíma-import gegnum @gogn) + web/public/gogn/<nafn>.json (runtime-fetch).
// loadPrev() gefur SEIGLU: ef ný Hagstofu-sókn brestur heldur skriptan fyrri hluta í stað þess að tæma hann.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PX = 'https://px.hagstofa.is/pxis/api/v1/is/';
const HDRS = { 'Content-Type': 'application/json', 'User-Agent': 'KARP dashboard build (karp.is)', 'Accept': 'application/json' };

export const sel = (code, filter, values) => ({ code, selection: { filter, values } });
export const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

// PxWeb POST með einni endurtekt — samhliða byggingarsóknir geta klikkað tímabundið.
export async function px(p, query) {
  const call = async () => {
    const r = await fetch(PX + p, { method: 'POST', headers: HDRS, body: JSON.stringify({ query, response: { format: 'json' } }) });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + p + ' :: ' + (await r.text()).slice(0, 160));
    return r.json();
  };
  try { return await call(); } catch (e) { await new Promise((r) => setTimeout(r, 1500)); return call(); }
}

export async function getJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

export function loadPrev(name) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'gogn', name + '.json'), 'utf8')); } catch { return {}; }
}

export function writeSnapshot(name, data) {
  const json = JSON.stringify(data);
  for (const o of [path.join(ROOT, 'gogn', name + '.json'), path.join(ROOT, 'web', 'public', 'gogn', name + '.json')]) {
    fs.mkdirSync(path.dirname(o), { recursive: true });
    fs.writeFileSync(o, json);
  }
  return json.length;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const fyear = () => new Date().getFullYear();
