// sigrun_vinna.mjs (worker) — I/O fyrir Sigrúnu sem starfsmann á /stjorn/: vikutölurnar hennar,
// tillaga hennar um að loka miðum, samtal hennar við Aron og lokun margra miða í einu.
// Rökfræðin er í ../lib/stjorn/sigrun_vinna.mjs (prófuð); hér er aðeins D1 og fetch.
// Kallað úr adminTicketHandler (hjalp_agent.mjs), sem sér um aðgang og CSRF á undan.
import { OPNAR_STODUR, fixJsonStrings } from '../lib/hjalp_agent.mjs';
import { lokunarKandidatar, lokaMargtVal, vikuTolur, spjallPrompt, spjallGogn, spjallSkilabod, thattaSpjall } from '../lib/stjorn/sigrun_vinna.mjs';
import { isoVika, sidastaFullaVika } from '../lib/stjorn/vika.mjs';
import { eintala } from '../lib/stjorn/vikutexti.mjs';

// Sama líkan og miðagreiningin hennar notar; env.SIGRUN_MODEL yfirtekur án þess að snerta kóða.
const MODEL = 'claude-haiku-4-5-20251001';
const _nu = () => Math.floor(Date.now() / 1000);
const TEGUNDIR_ATB = ['lokad', 'hafnad', 'cto'];

// ── ATBURÐASKRÁ. Lokun skráir hvorki hver lokaði né hvenær: `stada`-aðgerðin breytir aðeins
//    `tickets.stada`, og `updated` færist líka þegar nóta er skrifuð. Vikutalan „lokað" væri því
//    ágiskun. Hér er hver lokun, höfnun og afhending til Hrafns skráð með tíma, í stjorn_sync
//    (lykill `atb:<tegund>:<id>`, `updated` = tíminn) — ENGIN breyting á gagnagrunninum, og fordæmi
//    fyrir lykli á hvern miða er `moot_lock_<id>`. `atb_byrjun` geymir hvenær skráningin hófst, svo
//    vikur á undan henni noti áætlun í stað þess að sýna núll.
// ⚠ SKRÁNING MÁ ALDREI BRJÓTA AÐGERÐINA SEM HÚN SKRÁIR. Fyrsta útgáfan notaði `batch()`, sem kastar
//   SAMSTUNDIS þar sem það er ekki til — áður en `.catch` festist — og það kast kom á eftir að GitHub-
//   sendingin til Hrafns hafði þegar tekist, svo aðgerðin skilaði villu um eitthvað sem gerðist.
//   Nú: tvær stakar skipanir, allt innan try, og hvor um sig gleypir eigin villu.
export async function skraAtburd(env, tegund, id) {
  try {
    if (!env || !env.TENGSL || !TEGUNDIR_ATB.includes(tegund) || !Number.isInteger(Number(id))) return;
    const ts = _nu();
    await env.TENGSL.prepare("INSERT OR IGNORE INTO stjorn_sync (k, v, updated) VALUES ('atb_byrjun', ?, ?)").bind(String(ts), ts).run().catch(() => {});
    await env.TENGSL.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
      .bind('atb:' + tegund + ':' + Number(id), tegund, ts).run().catch(() => {});
  } catch { /* skráning er aukaatriði; aðgerðin sjálf hefur þegar tekist */ }
}

/** Opnir miðar með síðustu skilaboðum — grunnurinn að samtalinu og lokunartillögunni. */
export async function opnirMidar(env) {
  const ph = OPNAR_STODUR.map(() => '?').join(',');
  const r = await env.TENGSL.prepare(
    'SELECT t.id, t.efni, t.stada, t.tegund, t.forgangur, t.created, '
    + "(SELECT MAX(m.ts) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir IN ('in','out')) AS sidast, "
    + "(SELECT m.dir FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir IN ('in','out') ORDER BY m.ts DESC, m.id DESC LIMIT 1) AS sidastaAtt, "
    + "(SELECT substr(m.texti, 1, 300) FROM ticket_msgs m WHERE m.ticket_id=t.id AND m.dir='in' ORDER BY m.ts DESC, m.id DESC LIMIT 1) AS sidastaInnTexti "
    + 'FROM tickets t WHERE t.stada IN (' + ph + ') ORDER BY t.created LIMIT 60',
  ).bind(...OPNAR_STODUR).all().catch(() => ({ results: [] }));
  return (r && r.results) || [];
}

/**
 * Vikan hennar. Reiknuð EINU SINNI þegar hún er liðin og síðan geymd: lestrarþak D1 hefur sprungið
 * áður (1.9.2026) og boot() á /stjorn/ keyrir eftir hverja aðgerð. Aðeins fullnaðar ISO-vikur.
 * ⚠ IFNULL í öllum samanburði: `NULL <> 'stjorn'` er NULL í SQL, ekki satt, og myndi þegja burt
 *   hvern miða sem ber engan uppruna.
 */
export async function sigrunVika(env, fra, til) {
  const nu = _nu();
  const v = isoVika(Number(fra));
  if (!Number.isFinite(Number(fra)) || v.fra !== Number(fra) || v.til !== Number(til) || v.til > nu) return { ok: false, error: 'vika' };
  const D = env.TENGSL;
  const lykill = 'sigrun_vika:' + v.ar + '-' + v.vika;
  const geymt = await D.prepare('SELECT v FROM stjorn_sync WHERE k=?').bind(lykill).first().catch(() => null);
  if (geymt && geymt.v) { try { return { ok: true, geymt: true, vika: v, tolur: JSON.parse(geymt.v) }; } catch { /* reikna aftur */ } }

  const EKKI_STJORN = "IFNULL(t.uppruni,'')<>'stjorn'";
  const EKKI_STADFESTING = "IFNULL(m.efni,'') NOT LIKE '%Móttekið:%'";   // staðfestingin er ekki svar
  const a = [v.fra, v.til];
  const q = (sql, ...b) => D.prepare(sql).bind(...b);
  const [barust, henni, aroni, svor, teg, byrjun, atb] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM tickets t WHERE t.created>=? AND t.created<? AND ' + EKKI_STJORN, ...a).first(),
    q("SELECT COUNT(DISTINCT m.ticket_id) AS n FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='out' AND m.sent_by='agent' AND m.ts>=? AND m.ts<? AND " + EKKI_STADFESTING + ' AND ' + EKKI_STJORN, ...a).first(),
    q("SELECT COUNT(DISTINCT m.ticket_id) AS n FROM ticket_msgs m JOIN tickets t ON t.id=m.ticket_id WHERE m.dir='out' AND m.sent_by='aron' AND m.ts>=? AND m.ts<? AND " + EKKI_STJORN, ...a).first(),
    // svartími = FYRSTA raunverulega svar hvers miða, og aðeins miðar þar sem það svar féll í vikunni
    q("SELECT t.created AS c, MIN(m.ts) AS f FROM tickets t JOIN ticket_msgs m ON m.ticket_id=t.id WHERE m.dir='out' AND " + EKKI_STADFESTING + ' AND ' + EKKI_STJORN + ' GROUP BY t.id HAVING f>=? AND f<?', ...a).all(),
    q('SELECT t.tegund AS tegund, COUNT(*) AS n FROM tickets t WHERE t.created>=? AND t.created<? AND ' + EKKI_STJORN + ' GROUP BY t.tegund', ...a).all(),
    q("SELECT updated FROM stjorn_sync WHERE k='atb_byrjun'").first(),
    q("SELECT v, COUNT(*) AS n FROM stjorn_sync WHERE k>='atb:' AND k<'atb;' AND updated>=? AND updated<? GROUP BY v", ...a).all(),
  ].map((p) => p.catch(() => null)));

  // Lokað/hafnað/til Hrafns: nákvæmt úr atburðaskránni ef hún náði yfir ALLA vikuna, annars áætlað
  // út frá `updated` á miðum sem standa í þeirri stöðu nú (rekst aðeins á ef miði var snertur aftur).
  const skradFra = byrjun && Number(byrjun.updated);
  const nakvaemt = !!skradFra && skradFra <= v.fra;
  let tal = { lokad: 0, hafnad: 0, cto: 0 };
  if (nakvaemt) {
    for (const r of (atb && atb.results) || []) if (r.v in tal) tal[r.v] = Number(r.n) || 0;
  } else {
    const r = await q("SELECT CASE WHEN stada IN ('cto','tillaga','samthykkt','lagad') THEN 'cto' ELSE stada END AS s, COUNT(*) AS n "
      + "FROM tickets WHERE stada IN ('lokad','hafnad','cto','tillaga','samthykkt','lagad') AND updated>=? AND updated<? GROUP BY s", ...a).all().catch(() => null);
    for (const x of (r && r.results) || []) if (x.s in tal) tal[x.s] = Number(x.n) || 0;
  }
  const tolur = Object.assign(vikuTolur({
    barust: barust && barust.n,
    svaradHenni: henni && henni.n,
    svaradAroni: aroni && aroni.n,
    svortimar: ((svor && svor.results) || []).map((r) => Number(r.f) - Number(r.c)),
    tegundir: (teg && teg.results) || [],
    lokad: tal.lokad, hafnad: tal.hafnad, tilHrafns: tal.cto,
  }), { aaetlad: !nakvaemt });

  await D.prepare('INSERT INTO stjorn_sync (k, v, updated) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated=excluded.updated')
    .bind(lykill, JSON.stringify(tolur), nu).run().catch(() => {});
  return { ok: true, geymt: false, vika: v, tolur };
}

/** „Taktu til" — lokunarhæfir miðar eftir föstum reglum. Enginn Claude-kall: þetta er tölvuvinna. */
export async function sigrunTillaga(env) {
  const k = lokunarKandidatar(await opnirMidar(env), _nu());
  if (!k.length) return { ok: true, svar: 'Ég sé ekkert sem má loka núna.', tillaga: null };
  return {
    ok: true,
    svar: 'Ég fann ' + k.length + ' ' + (eintala(k.length) ? 'beiðni' : 'beiðnir') + ' sem má loka. Taktu hakið af þeim sem þú vilt halda opnum.',
    tillaga: { adgerd: 'loka', midar: k.map(({ id, efni, astaeda }) => ({ id, efni, astaeda })) },
  };
}

/** Samtal. Hún sér opna miða, lokunarhæfa og síðustu viku — og má aðeins leggja til númer af þeim lista. */
export async function sigrunSpjall(env, b) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: 'unconfigured' };
  const texti = String((b && b.texti) || '').trim().slice(0, 2000);
  if (texti.length < 2) return { ok: false, error: 'texti' };
  const nu = _nu();
  const midar = await opnirMidar(env);
  const kandidatar = lokunarKandidatar(midar, nu);
  const sv = sidastaFullaVika(nu);
  const vr = await sigrunVika(env, sv.fra, sv.til).catch(() => null);
  const gogn = spjallGogn({ midar, kandidatar, vika: vr && vr.ok ? { vika: sv.vika, tolur: vr.tolur } : null, nu });
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.SIGRUN_MODEL || MODEL, max_tokens: 700, system: spjallPrompt(), messages: spjallSkilabod({ saga: b && b.saga, texti, gogn }) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, error: 'ai ' + res.status };
    const j = await res.json();
    const r = thattaSpjall((j.content || []).map((x) => x.text || '').join(''), kandidatar, fixJsonStrings);
    if (!r.svar && !r.tillaga) return { ok: false, error: 'tomt' };
    return { ok: true, svar: r.svar || 'Þessar má loka.', tillaga: r.tillaga };
  } catch {
    return { ok: false, error: 'ai' };
  }
}

/**
 * Loka mörgum. Aðeins miðar sem eru til OG í lokanlegri stöðu. setTicket gleypir villur, svo hér er
 * lesið AFTUR eftir lokun og aðeins þeir taldir lokaðir sem standa sem 'lokad' — annars segði hún
 * „ég lokaði" um mið sem stendur enn opinn. Hver lokun fær nótu og atburð.
 */
export async function lokaMargt(env, b, { setTicket }) {
  const hrein = [...new Set((Array.isArray(b && b.ids) ? b.ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!hrein.length) return { ok: false, error: 'ids' };
  const ph = hrein.map(() => '?').join(',');
  const fyrir = await env.TENGSL.prepare('SELECT id, stada, notur FROM tickets WHERE id IN (' + ph + ')').bind(...hrein).all().catch(() => null);
  const radir = (fyrir && fyrir.results) || [];
  const { loka, sleppa } = lokaMargtVal(hrein, radir);
  const stimpill = new Date().toISOString().slice(0, 16);
  for (const id of loka) {
    const t = radir.find((x) => Number(x.id) === id) || {};
    await setTicket(env, id, { stada: 'lokad', notur: ((t.notur ? t.notur + '\n' : '') + '[' + stimpill + '] Lokað að tillögu Sigrúnar').slice(-6000) });
  }
  const eftir = loka.length
    ? await env.TENGSL.prepare('SELECT id, stada FROM tickets WHERE id IN (' + loka.map(() => '?').join(',') + ')').bind(...loka).all().catch(() => null)
    : { results: [] };
  const lokad = ((eftir && eftir.results) || []).filter((r) => r.stada === 'lokad').map((r) => Number(r.id)).sort((x, y) => x - y);
  for (const id of lokad) await skraAtburd(env, 'lokad', id);
  const mistokst = loka.filter((id) => !lokad.includes(id));
  return { ok: true, lokad, sleppt: sleppa.concat(mistokst).sort((x, y) => x - y) };
}
