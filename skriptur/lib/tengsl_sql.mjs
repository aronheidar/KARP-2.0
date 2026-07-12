// tengsl_sql.mjs — HREIN SQL-myndun fyrir næturkeyrsluna. Idempotent upserts +
// seen_first/seen_last saga (aldrei DELETE á gögnum). Skilar einum SQL-streng á D1.

export function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}
const L = sqlLit;

// MAX_ATTEMPTS: eftir svona margar tímabundnar villur á sama kt gefumst við upp (status='error').
export const MAX_ATTEMPTS = 5;

export function buildNightSql({ today, felog = [], folk = [], hlutverk = [], eign = [], queueMark = [], queueRetry = [], queueAdd = [], sweepMark = [], sweepAdd = [] }) {
  const s = [];
  const T = L(today);
  for (const f of felog) {
    s.push(`INSERT INTO felog (kt,nafn,form,stada,skraning,afskrad,afskrad_dags,gjaldthrot,gjaldthrot_dags,gjaldthol,gjaldthol_dags,isat,hlutafe,mynt,last_crawled) VALUES (${L(f.kt)},${L(f.nafn)},${L(f.form)},${L(f.stada)},${L(f.skraning)},${L(f.afskrad || 0)},${L(f.afskrad_dags)},${L(f.gjaldthrot || 0)},${L(f.gjaldthrot_dags)},${L(f.gjaldthol || 0)},${L(f.gjaldthol_dags)},${L(f.isat)},${L(f.hlutafe)},${L(f.mynt)},${T}) ON CONFLICT(kt) DO UPDATE SET nafn=excluded.nafn,form=excluded.form,stada=excluded.stada,skraning=excluded.skraning,afskrad=excluded.afskrad,afskrad_dags=excluded.afskrad_dags,gjaldthrot=excluded.gjaldthrot,gjaldthrot_dags=excluded.gjaldthrot_dags,gjaldthol=excluded.gjaldthol,gjaldthol_dags=excluded.gjaldthol_dags,isat=excluded.isat,hlutafe=excluded.hlutafe,mynt=excluded.mynt,last_crawled=${T};`);
  }
  for (const p of folk) {
    s.push(`INSERT INTO folk (person_key,kt,nafn,faeding) VALUES (${L(p.person_key)},${L(p.kt)},${L(p.nafn)},${L(p.faeding)}) ON CONFLICT(person_key) DO UPDATE SET kt=COALESCE(folk.kt,excluded.kt),nafn=COALESCE(excluded.nafn,folk.nafn),faeding=COALESCE(folk.faeding,excluded.faeding);`);
  }
  for (const h of hlutverk) {
    s.push(`INSERT INTO hlutverk (felag_kt,person_key,hlutverk,tegund,seen_first,seen_last) VALUES (${L(h.felag_kt)},${L(h.person_key)},${L(h.hlutverk)},${L(h.tegund)},${T},NULL) ON CONFLICT(felag_kt,person_key,hlutverk) DO UPDATE SET tegund=excluded.tegund,seen_last=NULL;`);
  }
  for (const e of eign) {
    s.push(`INSERT INTO eign (felag_kt,eigandi_key,eigandi_tegund,hlutur,tegund,heimild,seen_first,seen_last) VALUES (${L(e.felag_kt)},${L(e.eigandi_key)},${L(e.eigandi_tegund)},${L(e.hlutur)},${L(e.tegund)},${L(e.heimild)},${T},NULL) ON CONFLICT(felag_kt,eigandi_key,tegund) DO UPDATE SET hlutur=excluded.hlutur,eigandi_tegund=excluded.eigandi_tegund,heimild=excluded.heimild,seen_last=NULL;`);
  }
  // Enda-staða (done/notfound/error): færsla HELDST í biðröð með stöðu → endur-uppgötvun
  // (INSERT OR IGNORE) endur-pending-ar hana EKKI (lagfæring á endalausu re-crawl-i).
  for (const m of queueMark) s.push(`UPDATE crawl_queue SET status=${L(m.status)}, crawled_at=${T}, attempts=attempts+1 WHERE kt=${L(m.kt)};`);
  // Tímabundin villa (5xx/429/net): hækka attempts; gefast upp (error) eftir MAX_ATTEMPTS, annars pending.
  for (const kt of queueRetry) s.push(`UPDATE crawl_queue SET attempts=attempts+1, crawled_at=${T}, status=(CASE WHEN attempts+1>=${MAX_ATTEMPTS} THEN 'error' ELSE 'pending' END) WHERE kt=${L(kt)};`);
  for (const q of queueAdd) s.push(`INSERT OR IGNORE INTO crawl_queue (kt,priority,discovered_from,added_at,status) VALUES (${L(q.kt)},${L(q.priority || 2)},${L(q.from || null)},${T},'pending');`);
  // Nafnaleitar-sweep: merkja forskeyti klárað + bæta dýpri forskeytum við (mettuð → dýpka).
  for (const m of sweepMark) s.push(`UPDATE sweep_state SET done=1, hit_count=${L(m.hit_count)}, updated_at=${T} WHERE prefix=${L(m.prefix)};`);
  for (const p of sweepAdd) s.push(`INSERT OR IGNORE INTO sweep_state (prefix,done,updated_at) VALUES (${L(p)},0,${T});`);
  return s.join('\n');
}

// Loka röðum sem VANTAR í nýtt svar (kept-lyklar = 'person_key|hlutverk' / 'eigandi_key|tegund').
export function buildSeenLastSql(felagKt, keptHlutverkKeys, keptEignKeys, today) {
  const s = [];
  const hk = keptHlutverkKeys.map(L).join(',') || "''";
  const ek = keptEignKeys.map(L).join(',') || "''";
  s.push(`UPDATE hlutverk SET seen_last=${L(today)} WHERE felag_kt=${L(felagKt)} AND seen_last IS NULL AND (person_key||'|'||hlutverk) NOT IN (${hk});`);
  s.push(`UPDATE eign SET seen_last=${L(today)} WHERE felag_kt=${L(felagKt)} AND seen_last IS NULL AND (eigandi_key||'|'||tegund) NOT IN (${ek});`);
  return s.join('\n');
}
