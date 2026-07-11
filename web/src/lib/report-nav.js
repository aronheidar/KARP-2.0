// ── 🧭 Föst aðgerðastika skýrslnanna þriggja (fyrirtækja/eigenda/áreiðanleika) ──
// Deild milli /fyrirtaeki/ og /eigendur/ svo takkarnir séu ALLTAF á sama stað:
// [← Ný leit] [📄 Skýrsla | 👥 Eigendur | 🛡️ Áreiðanleiki] [🖨️ PDF] [🔄 Sækja aftur] [🔖 Fylgja]
// Virka viewið er merkt .on (ekki hlekkur). CSS í web/src/styles/ubo.css (.rnav*).
import { karpGet, karpPost, loginHref } from './auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Skrá skoðun (nýlega skoðað + „skoðað"-merki á Mitt svæði) — localStorage, virkar líka óinnskráð.
export function recordView(kt, nafn) {
  if (!kt) return;
  try {
    let arr = JSON.parse(localStorage.getItem('karp-recent') || '[]');
    arr = arr.filter((x) => x.kt !== kt);
    arr.unshift({ kt: kt, nafn: nafn || kt, ts: Date.now() });
    localStorage.setItem('karp-recent', JSON.stringify(arr.slice(0, 10)));
    const seen = JSON.parse(localStorage.getItem('karp-seen') || '{}');
    seen['co:' + kt] = Date.now();
    localStorage.setItem('karp-seen', JSON.stringify(seen));
  } catch (e) {}
}

// 🔖 Fylgja — sameinaður hnappur + póstvaktar-valkostur (flutt úr fyrirtaeki.astro svo /eigendur/ fái hann líka).
export function fylgjaBtnHtml(kt, nafn) {
  return '<span class="fs-follow" data-kt="' + esc(kt) + '" data-nafn="' + esc(nafn || '') + '">'
    + '<button class="fs-vakta" id="fs-fylgja" type="button" title="Fylgja félaginu — það birtist á „Mitt svæði".">🔖 Fylgja</button>'
    + '<label class="fs-mailopt" id="fs-mailopt" hidden title="Fáðu tölvupóst þegar nýr ársreikningur, þrota-/innköllunartilkynning, vörumerki, útboð eða eftirlit berst (Karp+)."><input type="checkbox" id="fs-mailchk" /> 🔔 láta vita í pósti</label>'
    + '</span>';
}
export function wireFylgja() {
  const wrap = document.querySelector('.fs-follow');
  const flb = document.getElementById('fs-fylgja');
  if (!wrap || !flb || flb.dataset.done) return;
  flb.dataset.done = '1';
  const kt = wrap.dataset.kt || '', nafn = wrap.dataset.nafn || '', fkey = 'co:' + kt;
  recordView(kt, nafn);
  const mailopt = document.getElementById('fs-mailopt'), mailchk = document.getElementById('fs-mailchk');
  const following = () => ((window.KARP_USER && window.KARP_USER.follows) || []).indexOf(fkey) !== -1;
  const paint = () => { const on = following(); flb.classList.toggle('on', on); flb.textContent = on ? '✓ Í vöktun' : '🔖 Fylgja'; if (mailopt) mailopt.hidden = !on; };
  const syncMail = () => { if (mailchk && following()) karpGet('/firmavakt').then((v) => { if (v && Array.isArray(v.felog)) mailchk.checked = v.felog.some((x) => x.kt === kt); }).catch(() => {}); };
  paint(); syncMail();
  flb.addEventListener('click', async () => {
    const u = window.KARP_USER;
    if (!u || !u.loggedIn) { location.href = loginHref(); return; }
    flb.disabled = true;
    const cur = u.follows || [], has = cur.indexOf(fkey) !== -1;
    const next = has ? cur.filter((x) => x !== fkey) : cur.concat([fkey]);
    const res = await karpPost('/follows', { follows: next });
    u.follows = (res && res.follows) ? res.follows : next;
    paint();
    if (has && mailchk) mailchk.checked = false; else syncMail();
    flb.disabled = false;
  });
  if (mailchk) mailchk.addEventListener('change', async () => {
    mailchk.disabled = true;
    try {
      const cur = await karpGet('/firmavakt');
      if (!cur || !Array.isArray(cur.felog)) throw new Error('auth');
      const has = cur.felog.some((x) => x.kt === kt), want = mailchk.checked;
      if (has !== want) {
        const felog = want ? cur.felog.concat([{ kt, nafn }]) : cur.felog.filter((x) => x.kt !== kt);
        const r = await karpPost('/firmavakt', { on: true, felog });
        if (!r || r.ok !== true) throw new Error('save');
      }
    } catch (e) {
      mailchk.checked = !mailchk.checked;
      const t0 = mailopt ? mailopt.title : ''; if (mailopt) { mailopt.title = '🔒 Karp+ áskrift þarf fyrir póstvakt'; setTimeout(() => { mailopt.title = t0; }, 2600); }
    }
    mailchk.disabled = false;
  });
}

// Stikan sjálf. view = 'skyrsla' | 'eigendur' | 'areidanleiki'. refresh=false felur 🔄 (t.d. gátt/demo).
// demo=true: flipahlekkirnir vísa á sýnishorna-útgáfurnar (gervikennitala flettist ekki upp).
export function reportNavHtml({ kt, nafn, view, refresh = true, pdf = true, demo = false }) {
  const k = encodeURIComponent(kt || '');
  const seg = (v, href, icon, label) => (view === v
    ? '<span class="rnav-v on">' + icon + ' ' + label + '</span>'
    : (href ? '<a class="rnav-v" href="' + href + '">' + icon + ' ' + label + '</a>' : ''));
  return '<div class="fs-topbtns rnav">'
    + '<button class="fs-back" type="button">← Ný leit</button>'
    + '<span class="rnav-seg" role="tablist" aria-label="Skýrslur félagsins">'
    + seg('skyrsla', demo ? '/fyrirtaeki/?syni=1' : '/fyrirtaeki/?q=' + k, '📄', 'Fyrirtækjaskýrsla')
    + seg('eigendur', demo ? '/eigendur/?syni=1' : '/eigendur/?q=' + k, '👥', 'Endanlegir eigendur')
    + seg('areidanleiki', demo ? '' : '/fyrirtaeki/?vidmot=areidanleiki&q=' + k, '🛡️', 'Áreiðanleikamat')
    + '</span>'
    + '<span class="rnav-act">'
    + (pdf ? '<button class="fs-vakta" id="rnav-pdf" type="button" title="Sækja skýrsluna sem PDF (prentgluggi)">🖨️ Sækja PDF</button>' : '')
    + (refresh ? '<button class="fs-vakta" id="rnav-refresh" type="button" title="Sækja gögnin aftur frá RSK og endurreikna skýrsluna">🔄 Sækja aftur</button>' : '')
    + fylgjaBtnHtml(kt, nafn)
    + '</span></div>';
}

// Vírar PDF-/refresh-takkana; fylgja vírast með wireFylgja(). onPdf/onRefresh eru valfrjáls.
export function wireReportNav({ onPdf, onRefresh }) {
  wireFylgja();
  const pb = document.getElementById('rnav-pdf');
  if (pb && onPdf && !pb.dataset.done) { pb.dataset.done = '1'; pb.addEventListener('click', () => onPdf(pb)); }
  const rb = document.getElementById('rnav-refresh');
  if (rb && onRefresh && !rb.dataset.done) { rb.dataset.done = '1'; rb.addEventListener('click', () => onRefresh(rb)); }
}

// ── Deild hleðslustika (sama útlit og ársreikninga-KPI stikan) ────────────────
// CSS: .kpi-pend* í ubo.css. id-in eru staðbundin (suffix) svo fleiri en ein stika lifi á síðu.
export function pendingBarHtml({ title, sub, note, sfx = '' }) {
  return '<div class="kpi-pend"><div class="kpi-pend-hd"><span class="kpi-pend-spin"></span>'
    + '<div><b>' + esc(title) + '</b>'
    + '<span class="kpi-pend-s">' + (sub || '') + ' · <i id="kpi-pend-sec' + sfx + '">áætla tíma…</i></span></div></div>'
    + '<div class="kpi-pend-track"><div class="kpi-pend-bar" id="kpi-pend-bar' + sfx + '"></div></div>'
    + (note ? '<div class="kpi-pend-note">' + note + '</div>' : '');
}
// Pollar url (cache-bust) þar til innihaldið er til OG frábrugðið baseline (endurbygging), svo onDone(text).
// est=sek (framvinduáætlun). Hættir sjálft ef stikan hverfur úr DOM eða eftir maxSek.
// ⚠ „Sækja aftur" með ÓBREYTTUM gögnum: byggingin skilar bæta-eins skrá sem committast ekki → baseline
// breytist aldrei. Eftir ~16 óbreytt poll (~3 mín) köllum við onDone(gamli textinn, stale=true) svo
// kallandinn endurbirti gömlu skýrsluna í stað þess að hanga á stikunni að eilífu.
export function pollUntilChanged({ url, baseline = null, est = 150, sfx = '', maxSek = 420, onDone }) {
  const bar = () => document.getElementById('kpi-pend-bar' + sfx);
  const sec = () => document.getElementById('kpi-pend-sec' + sfx);
  let el = 0, obreytt = 0;
  const tick = setInterval(() => {
    el++;
    const b = bar(); if (b) b.style.width = Math.min(96, el / est * 100).toFixed(1) + '%';
    const s = sec(); if (s) s.textContent = el < est ? ('um ' + Math.ceil((est - el) / 30) * 0.5 + ' mín eftir').replace('.5', '½').replace('um 0½', 'innan við ½') : 'næstum tilbúið…';
  }, 1000);
  const stop = () => { clearInterval(poll); clearInterval(tick); };
  const poll = setInterval(async () => {
    if (!bar()) { stop(); return; }
    if (el > maxSek) { stop(); const s = sec(); if (s) s.textContent = 'tekur lengri tíma en vanalega — endurhladdu síðar'; return; }
    try {
      const r = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const txt = await r.text();
        if (baseline == null || txt !== baseline) {
          stop();
          const b = bar(); if (b) b.style.width = '100%';
          const s = sec(); if (s) s.textContent = 'tilbúið!';
          setTimeout(() => onDone(txt, false), 600);
        } else if (++obreytt >= 16) {
          stop();
          setTimeout(() => onDone(txt, true), 100);   // engin ný gögn — skila gamla innihaldinu
        }
      }
    } catch (e) {}
  }, 12000);
}
