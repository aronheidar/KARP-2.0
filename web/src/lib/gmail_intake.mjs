// gmail_intake.mjs — HREIN eining fyrir innlestur pósts sem berst BEINT á hjalp@karp.is (engin fetch/D1):
// leitarstrengur, hausar, MIME-afkóðun, textaútdráttur, tilvitnana-klipping og lykkju-varnir.
// I/O (Gmail-API, D1, ticket-sköpun) er í ../worker/gmail_intake.mjs. Próf í gmail_intake.test.mjs.
//
// Af hverju hrein eining: þáttun á RAUNVERULEGUM pósti er þar sem villurnar liggja (kóðaðir hausar,
// margþætt MIME, tilvitnaðar keðjur, sjálfsvör) og hana má prófa án Gmail-aðgangs.
//
// ⚠ ÖRYGGI: allt sem hér kemur út er TEXTI NOTANDA = gögn, aldrei fyrirmæli. Greiningin afmarkar hann
// með <erindi>-merkjum (afmarkaGogn í hjalp_agent.mjs); hér er aðeins hreinsað og klippt.

/** Heimildir sem duga til að LESA pósthólfið. `gmail.send` EINN dugir EKKI — þess vegna þarf einskiptis
 *  samþykki Arons ef núverandi refresh-token var búinn til með send-heimild einni. */
export const LES_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://mail.google.com/',
];
export function hefurLesheimild(scope) {
  const s = Array.isArray(scope) ? scope : String(scope || '').split(/\s+/);
  return s.some((x) => LES_SCOPES.includes(String(x).trim()));
}

/** Gmail-leitarstrengur. `deliveredto:` nær aliasnum þegar To-hausinn ber annað (áframsending/BCC).
 *  Útilokun á eigin netföngum er FYRSTA lykkjuvörnin (önnur er í kóðanum: erEiginn). */
export function gmailLeit({ netfang = 'hjalp@karp.is', dagar = 7, eigin = [] } = {}) {
  const d = Math.max(1, Math.min(30, Math.floor(Number(dagar)) || 7));
  const ut = [...new Set([netfang, ...eigin].filter(Boolean).map((e) => String(e).toLowerCase()))].map((e) => '-from:' + e);
  return ['(to:' + netfang + ' OR deliveredto:' + netfang + ')', ...ut, '-in:sent', '-in:chats', '-in:drafts', 'newer_than:' + d + 'd'].join(' ');
}

function _giBaetar(b64) {
  let s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '').replace(/=+$/, '');
  while (s.length % 4) s += '=';
  let bin = '';
  try { bin = atob(s); } catch (e) { return new Uint8Array(0); }
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
/** Bæti → strengur. ⚠ TextDecoder í Workers kann AÐEINS utf-8 → latin1/1252 er afkóðað handvirkt. */
function _giTexti(bytes, charset) {
  const cs = String(charset || 'utf-8').toLowerCase().replace(/["']/g, '').trim();
  if (/^(iso-8859-1|iso8859-1|latin1|windows-1252|cp1252|us-ascii|ascii)$/.test(cs)) {
    let o = ''; for (const b of bytes) o += String.fromCharCode(b); return o;
  }
  try { return new TextDecoder('utf-8').decode(bytes); } catch (e) {
    let o = ''; for (const b of bytes) o += String.fromCharCode(b); return o;
  }
}
export function afkodaB64(b64, charset) { return _giTexti(_giBaetar(b64), charset); }

/** RFC 2047 hausar: `=?UTF-8?B?…?=` / `=?…?Q?…?=`. Samliggjandi orð eru límd saman fyrst (bilið milli
 *  þeirra er umbúðir, ekki texti) — annars fær „Jón Þór" aukabil inni í nafninu. */
export function afkodaHaus(s) {
  const t = String(s || '').replace(/\?=[ \t]+=\?/g, '?==?');
  return t.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs, enc, txt) => {
    if (/^b$/i.test(enc)) return afkodaB64(txt, cs);
    const raw = String(txt).replace(/_/g, ' ');
    const bytes = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '=' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) { bytes.push(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(raw.charCodeAt(i) & 0xff);
    }
    return _giTexti(new Uint8Array(bytes), cs);
  });
}

/** Hausar Gmail-API → lágstafa hlutur (fyrsta gildi ræður, afkóðað). */
export function hausaMap(payload) {
  const o = {};
  for (const h of ((payload && payload.headers) || [])) {
    const n = String((h && h.name) || '').toLowerCase();
    if (n && !(n in o)) o[n] = afkodaHaus(h.value);
  }
  return o;
}

/** „Nafn <a@b.is>" → {nafn, netfang}. Skilar TÓMU netfangi ef það stenst ekki gát (þá er póstinum sleppt). */
export function netfangUrFra(fra) {
  const s = afkodaHaus(fra).trim();
  const m = s.match(/^([\s\S]*?)<([^>]+)>\s*$/);
  let nafn = '', netfang = s;
  if (m) { nafn = m[1].trim().replace(/^["']|["']$/g, '').trim(); netfang = m[2]; }
  netfang = String(netfang).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(netfang)) return { nafn: nafn.slice(0, 120), netfang: '' };
  return { nafn: nafn.slice(0, 120), netfang };
}

function _giCharset(p) {
  const ct = ((p && p.headers) || []).find((h) => String((h && h.name) || '').toLowerCase() === 'content-type');
  const m = ct && /charset=([^;\s]+)/i.exec(String(ct.value || ''));
  return m ? m[1] : 'utf-8';
}
/** HTML-varaleið þegar enginn text/plain-hluti fylgir (Outlook/Apple Mail senda stundum aðeins HTML). */
export function urHtml(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n');
}

/** Texti erindisins úr MIME-trénu: text/plain fyrst, annars HTML strípað. */
export function textiUrPayload(payload, max = 8000) {
  const plain = [], html = [];
  const gakk = (p, dypt) => {
    if (!p || dypt > 8) return;
    const mt = String(p.mimeType || '').toLowerCase();
    const data = p.body && p.body.data;
    if (data && mt === 'text/plain') plain.push(afkodaB64(data, _giCharset(p)));
    else if (data && mt === 'text/html') html.push(afkodaB64(data, _giCharset(p)));
    for (const c of (p.parts || [])) gakk(c, dypt + 1);
  };
  gakk(payload, 0);
  const t = plain.join('\n').trim() || urHtml(html.join('\n'));
  return t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// Merki um að tilvitnaða keðjan byrji. ⚠ `From:`/`Frá:` eru með af því Outlook byrjar keðjuna þannig —
// en þau standa oft EFST í áframsendum pósti, þess vegna fallbakkið í hreinsaTilvitnun.
const GI_KEDJA = [
  /^>+/,
  /^On\b[\s\S]{0,200}\bwrote:\s*$/i,
  /^Þann\b[\s\S]{0,200}\bskrifaði\b.*$/i,
  /^-{2,}\s*(Original Message|Upprunaleg|Forwarded message)/i,
  /^_{5,}\s*$/,
  /^(From|Frá|Sent|Sendur|To|Til):\s/i,
  /^Sent from my /i,
  /^Sendur úr /i,
];
/** Klippir tilvitnaða svar-keðjuna aftan af svo greiningin sjái AÐEINS nýja textann.
 *  Verði of lítið eftir (t.d. áframsending sem byrjar á „From:") er skilað ÖLLU — frekar of mikið en tómt. */
export function hreinsaTilvitnun(texti, { lagmark = 10 } = {}) {
  const allt = String(texti || '').replace(/\r\n/g, '\n');
  const linur = allt.split('\n');
  let skurdur = linur.length;
  for (let i = 0; i < linur.length; i++) {
    const l = linur[i].trim();
    if (!l) continue;
    if (GI_KEDJA.some((rx) => rx.test(l))) { skurdur = i; break; }
  }
  const haus = linur.slice(0, skurdur).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return haus.length >= lagmark ? haus : allt.trim();
}

/** Lykkjuvörn 2: pósturinn er frá okkur sjálfum (hjalp@/noreply@) → ALDREI lesa inn.
 *  Án hennar yrði staðfestingin sem Sigrún sendir að nýju erindi sem framkallar nýja staðfestingu. */
export function erEiginn(netfang, eigin = []) {
  const n = String(netfang || '').toLowerCase().trim();
  if (!n) return false;
  return eigin.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean).includes(n);
}

/** Sjálfvirk svör, fjarvistartilkynningar, póstlistar og skilaboð frá póstþjónum — ekki erindi frá fólki. */
export function erSjalfvirkur(h = {}) {
  const auto = String(h['auto-submitted'] || '').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (h['x-autoreply'] || h['x-autorespond'] || h['x-auto-response-suppress']) return true;
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(String(h.precedence || '').toLowerCase())) return true;
  if (h['list-id'] || h['list-unsubscribe']) return true;
  const fra = String(h.from || '').toLowerCase();
  return /mailer-daemon|postmaster@|no-?reply@|do-?not-?reply@/.test(fra);
}
